/**
 * Notifications push — Edge Function Supabase (Deno).
 *
 * Deux façons de l'appeler :
 *
 *   • **le battement** — `notify_tick()`, chaque minute via pg_cron, avec
 *     l'en-tête `x-notify-secret`. La fonction réclame les faits en attente
 *     dans `notification_outbox`, rédige chaque message et l'envoie aux
 *     appareils des membres concernés ;
 *   • **l'essai** — depuis le profil, avec le jeton du membre connecté. Un
 *     message d'essai part vers **ses** appareils, et nulle part ailleurs.
 *
 * Les règles d'envoi vivent dans `./plan.ts`, le texte dans
 * `../_shared/notifyMessages.ts`, le chiffrement dans `../_shared/webpush.ts` :
 * tous trois testés hors de Deno. Ce fichier ne fait que les enchaîner.
 *
 * Déploiement : `npm run push:setup` (voir `supabase/functions/README.md`).
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import { TEST_MESSAGE, composeMessage, type PushMessage } from '../_shared/notifyMessages.ts';
import { sendPush, type PushOutcome, type VapidKeys } from '../_shared/webpush.ts';
import {
  recipientsOf,
  settle,
  targetsOf,
  type OutboxJob,
  type Prefs,
  type SubscriptionRow,
} from './plan.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** Faits traités par appel : une minute plus tard, le battement reprend la suite. */
const BATCH = 20;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

/** Comparaison à temps constant : le secret ne se devine pas caractère par caractère. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Le cours du bitcoin, pour la phrase d'un pari résolu. `null` s'il ne vient pas. */
async function btcSpot(): Promise<number | null> {
  try {
    const params = new URLSearchParams({ ids: 'bitcoin', vs_currencies: 'usd' });
    const key = Deno.env.get('COINGECKO_API_KEY');
    if (key) params.set('x_cg_demo_api_key', key);
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?${params}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const usd = (await response.json())?.bitcoin?.usd;
    return typeof usd === 'number' && usd > 0 ? usd : null;
  } catch {
    return null;
  }
}

async function deliver(
  targets: readonly SubscriptionRow[],
  message: PushMessage,
  vapid: VapidKeys,
): Promise<PushOutcome[]> {
  return await Promise.all(
    targets.map((target) =>
      sendPush(target, message, vapid).catch((cause): PushOutcome => ({
        status: 0,
        ok: false,
        gone: false,
        detail: cause instanceof Error ? cause.message : String(cause),
      })),
    ),
  );
}

async function forget(admin: SupabaseClient, ids: readonly string[]) {
  if (ids.length > 0) await admin.from('push_subscriptions').delete().in('id', ids);
}

/** Le battement : vider la file. */
async function drain(admin: SupabaseClient, vapid: VapidKeys): Promise<Response> {
  const { data: claimed, error } = await admin.rpc('claim_notifications', { p_limit: BATCH });
  if (error) return json({ error: error.message }, 500);
  const jobs = (claimed ?? []) as OutboxJob[];
  if (jobs.length === 0) return json({ jobs: 0 });

  const [profiles, prefs, subscriptions] = await Promise.all([
    admin.from('profiles').select('id, display_name'),
    admin.from('notification_prefs').select('user_id, nights, reminders, calls, oracle'),
    admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth'),
  ]);
  const failed = profiles.error ?? prefs.error ?? subscriptions.error;
  if (failed) return json({ error: failed.message }, 500);

  const names = new Map(
    (profiles.data ?? []).map((p) => [p.id as string, p.display_name as string]),
  );
  const memberIds = [...names.keys()];
  const prefsByUser = new Map<string, Prefs>(
    (prefs.data ?? []).map((row) => [row.user_id as string, row as Prefs]),
  );
  let subs = (subscriptions.data ?? []) as SubscriptionRow[];
  const spot = jobs.some((job) => job.kind === 'oracle_resolved') ? await btcSpot() : null;

  const reports: { id: number; report: string }[] = [];
  for (const job of jobs) {
    const message = composeMessage(job.kind, job.payload ?? {}, {
      actorName: job.actor ? (names.get(job.actor) ?? null) : null,
      btcSpot: spot,
    });

    if (!message) {
      await admin
        .from('notification_outbox')
        .update({ sent_at: new Date().toISOString(), report: 'charge inexploitable' })
        .eq('id', job.id);
      reports.push({ id: job.id, report: 'charge inexploitable' });
      continue;
    }

    const targets = targetsOf(recipientsOf(job, memberIds, prefsByUser), subs);
    const outcomes = await deliver(targets, message, vapid);
    const result = settle(job, targets, outcomes);
    await forget(admin, result.gone);
    // Un abonnement expiré ne se retente pas pour le fait suivant du même lot.
    if (result.gone.length > 0) subs = subs.filter((sub) => !result.gone.includes(sub.id));

    // Un fait à retenter garde `sent_at` vide : dans deux minutes, sa
    // réclamation expire et le battement le reprend.
    await admin
      .from('notification_outbox')
      .update(
        result.done
          ? { sent_at: new Date().toISOString(), report: result.report }
          : { report: result.report },
      )
      .eq('id', job.id);
    reports.push({ id: job.id, report: result.report });
  }

  return json({ jobs: jobs.length, reports });
}

/** L'essai, depuis le profil : vers les appareils du membre qui le demande. */
async function test(
  admin: SupabaseClient,
  request: Request,
  vapid: VapidKeys,
): Promise<Response> {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Réservé aux membres' }, 401);

  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return json({ error: 'Réservé aux membres' }, 401);

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return json({ error: 'Réservé aux membres' }, 403);

  const { data: rows, error: subsError } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .eq('user_id', user.id);
  if (subsError) return json({ error: subsError.message }, 500);

  const targets = (rows ?? []) as SubscriptionRow[];
  if (targets.length === 0) return json({ sent: 0, devices: 0 });

  const outcomes = await deliver(targets, TEST_MESSAGE, vapid);
  const result = settle({ attempts: Number.POSITIVE_INFINITY }, targets, outcomes);
  await forget(admin, result.gone);
  return json({
    sent: outcomes.filter((outcome) => outcome.ok).length,
    devices: targets.length,
    report: result.report,
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'POST attendu' }, 405);

  // Un environnement incomplet refuse : il ne laisse jamais passer.
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const secret = Deno.env.get('NOTIFY_SECRET');
  if (!url || !serviceKey || !publicKey || !privateKey || !secret) {
    return json({ error: 'Configuration incomplète — voir npm run push:setup' }, 500);
  }

  const vapid: VapidKeys = {
    publicKey,
    privateKey,
    // Le contact que les services de push peuvent joindre en cas d'abus.
    subject:
      Deno.env.get('VAPID_SUBJECT') ?? 'https://satoshinakajojo.github.io/dashboard/club/',
  };
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const presented = request.headers.get('x-notify-secret');
  if (presented !== null) {
    if (!sameSecret(presented, secret)) return json({ error: 'Non autorisé' }, 401);
    return await drain(admin, vapid);
  }
  return await test(admin, request, vapid);
});
