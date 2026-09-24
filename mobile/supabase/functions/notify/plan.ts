/**
 * Qui reçoit quoi — la décision d'envoi, sans réseau ni base.
 *
 * `index.ts` réclame les faits, charge les membres, leurs réglages et leurs
 * appareils, puis s'en remet à ce module. C'est ici que vivent les règles qui
 * comptent, et qu'on teste :
 *
 *   • l'auteur d'un geste n'en est pas prévenu ;
 *   • un réglage décoché est respecté — l'absence de réglage vaut « tout » ;
 *   • un fait adressé à des membres précis ne va qu'à eux ;
 *   • un envoi qui n'a échoué que pour des raisons passagères sera retenté.
 */

import {
  CATEGORY_OF,
  type NotificationCategory,
  type NotificationKind,
} from '../_shared/notifyMessages.ts';
import type { PushOutcome } from '../_shared/webpush.ts';

export interface OutboxJob {
  id: number;
  kind: NotificationKind;
  actor: string | null;
  recipients: string[] | null;
  payload: Record<string, unknown>;
  attempts: number;
}

export type Prefs = Partial<Record<NotificationCategory, boolean>>;

export interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Les membres à prévenir pour ce fait. */
export function recipientsOf(
  job: Pick<OutboxJob, 'kind' | 'actor' | 'recipients'>,
  memberIds: readonly string[],
  prefsByUser: ReadonlyMap<string, Prefs>,
): string[] {
  const category = CATEGORY_OF[job.kind];
  const pool = job.recipients ?? memberIds.filter((id) => id !== job.actor);
  return pool.filter(
    (id) => memberIds.includes(id) && prefsByUser.get(id)?.[category] !== false,
  );
}

/** Les appareils de ces membres. */
export function targetsOf(
  recipients: readonly string[],
  subscriptions: readonly SubscriptionRow[],
): SubscriptionRow[] {
  const wanted = new Set(recipients);
  return subscriptions.filter((sub) => wanted.has(sub.user_id));
}

/** Un échec qui peut passer : réseau, limite de débit, panne du service. */
export function isTransient(outcome: PushOutcome): boolean {
  return (
    !outcome.ok &&
    !outcome.gone &&
    (outcome.status === 0 || outcome.status === 429 || outcome.status >= 500)
  );
}

export interface Settlement {
  /** Marquer le fait envoyé (même partiellement) ; sinon, il sera retenté. */
  done: boolean;
  report: string;
  /** Les abonnements disparus, à supprimer. */
  gone: string[];
}

/**
 * Ce qu'on retient d'un envoi.
 *
 * Retenté seulement si **tous** les appareils ont échoué pour une raison
 * passagère, et qu'il reste des tentatives : renvoyer un fait déjà reçu par
 * certains les ferait sonner deux fois.
 */
export function settle(
  job: Pick<OutboxJob, 'attempts'>,
  targets: readonly SubscriptionRow[],
  outcomes: readonly PushOutcome[],
  maxAttempts = 5,
): Settlement {
  const gone = targets.filter((_, i) => outcomes[i]?.gone).map((target) => target.id);
  const delivered = outcomes.filter((outcome) => outcome.ok).length;
  const transient = outcomes.filter(isTransient).length;

  if (outcomes.length > 0 && transient === outcomes.length && job.attempts < maxAttempts) {
    return {
      done: false,
      report: `échec passager sur ${transient} appareil(s), retenté`,
      gone,
    };
  }

  const failures = outcomes
    .filter((outcome) => !outcome.ok && !outcome.gone)
    .map((outcome) => `${outcome.status}${outcome.detail ? ` ${outcome.detail}` : ''}`);
  const parts = [`${delivered}/${outcomes.length} appareil(s)`];
  if (gone.length > 0) parts.push(`${gone.length} abonnement(s) expiré(s)`);
  if (failures.length > 0) parts.push(`échecs : ${failures.join(' ; ').slice(0, 300)}`);
  return { done: true, report: parts.join(' · '), gone };
}
