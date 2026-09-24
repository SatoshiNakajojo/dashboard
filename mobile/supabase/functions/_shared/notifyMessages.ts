/**
 * Ce que dit une notification, pour chaque événement du club.
 *
 * Module pur : la base range dans `notification_outbox` des faits bruts (une
 * soirée, un call, un pari) ; ce module en tire un titre et une phrase, en
 * français et à l'heure de Nouméa, quel que soit le fuseau du serveur.
 *
 * Les URL sont relatives au service worker (`/dashboard/club/`) : il les
 * résout lui-même au clic.
 */

export type NotificationKind =
  'night_new' | 'night_reminder' | 'call_new' | 'call_closed' | 'oracle_resolved';

/** Les réglages qu'un membre coche ; une notification relève d'un seul. */
export type NotificationCategory = 'nights' | 'reminders' | 'calls' | 'oracle';

export const CATEGORY_OF: Record<NotificationKind, NotificationCategory> = {
  night_new: 'nights',
  night_reminder: 'reminders',
  call_new: 'calls',
  call_closed: 'calls',
  oracle_resolved: 'oracle',
};

export interface PushMessage {
  title: string;
  body: string;
  /** Relative à la portée du service worker. */
  url: string;
  /** Deux notifications de même étiquette se remplacent au lieu de s'empiler. */
  tag: string;
}

export interface MessageContext {
  /** Le membre à l'origine de l'événement, s'il y en a un. */
  actorName: string | null;
  /** Le cours du bitcoin au moment de l'envoi, s'il a pu être lu. */
  btcSpot: number | null;
}

const NBSP = ' ';
const ZONE = 'Pacific/Noumea';

/** Les horizons de l'Oracle, tels qu'on les dit dans une phrase. */
export const HORIZON_PHRASES: Record<string, string> = {
  '1w': 'une semaine',
  '3m': 'trois mois',
  '6m': 'six mois',
  '12m': 'un an',
  '5y': 'cinq ans',
  '10y': 'dix ans',
};

const spaces = (text: string) => text.replace(/[   ]/g, NBSP);

/** `sam. 3 oct. · 19:30`, à Nouméa. */
export function nightWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = new Intl.DateTimeFormat('fr-FR', {
    timeZone: ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
  const time = new Intl.DateTimeFormat('fr-FR', {
    timeZone: ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  return spaces(`${day} · ${time}`);
}

/** `19:30`, à Nouméa. */
function timeOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** `+50,0 %`. */
export function percent(value: number): string {
  const body = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
  return spaces(`${value > 0 ? '+' : ''}${body}${NBSP}%`);
}

/** `15,2 $`, `120 911 $`. */
export function usd(value: number): string {
  const body = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
  }).format(value);
  return spaces(`${body}${NBSP}$`);
}

/** `164 k$` — le format des cibles de l'Oracle. */
export function thousands(value: number): string {
  return spaces(`${new Intl.NumberFormat('fr-FR').format(Math.round(value / 1000))}${NBSP}k$`);
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

const str = (value: unknown) => (typeof value === 'string' ? value : '');
const num = (value: unknown) => {
  // `Number(null)` vaut 0 : sans cette garde, un pari sans tracé « visait 0 k$ ».
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Le message d'un événement.
 *
 * `null` si la charge est inexploitable : mieux vaut ne rien envoyer qu'une
 * notification vide ou fausse.
 */
export function composeMessage(
  kind: NotificationKind,
  payload: Record<string, unknown>,
  context: MessageContext,
): PushMessage | null {
  const by = context.actorName ? ` Proposée par ${context.actorName}.` : '';

  switch (kind) {
    case 'night_new': {
      const title = str(payload.title);
      if (!title) return null;
      const themes = Array.isArray(payload.themes)
        ? payload.themes.filter((t): t is string => typeof t === 'string')
        : [];
      return {
        title:
          themes.length > 0 ? `Nouvelle soirée · ${themes.join(' + ')}` : 'Nouvelle soirée',
        body: clip(
          `${title} — ${nightWhen(str(payload.starts_at))}, ${str(payload.location)}.${by}`,
          180,
        ),
        url: './',
        tag: `night-${str(payload.event_id)}`,
      };
    }

    case 'night_reminder': {
      const title = str(payload.title);
      if (!title) return null;
      const count = num(payload.attendees) ?? 0;
      const who =
        count === 0
          ? 'Personne n’est encore inscrit.'
          : `${count} membre${count > 1 ? 's' : ''} inscrit${count > 1 ? 's' : ''}.`;
      return {
        title: `Ce soir · ${title}`,
        body: clip(`${timeOf(str(payload.starts_at))}, ${str(payload.location)}. ${who}`, 180),
        url: './',
        // Même étiquette que l'annonce : le rappel la remplace, s'il la trouve.
        tag: `night-${str(payload.event_id)}`,
      };
    }

    case 'call_new': {
      const symbol = str(payload.symbol);
      if (!symbol) return null;
      const thesis = clip(str(payload.thesis), 120);
      return {
        title: `Nouveau call · ${symbol}`,
        body: `${context.actorName ?? 'Un membre'} : « ${thesis} »`,
        url: './bag',
        tag: `call-${str(payload.ticker_id)}`,
      };
    }

    case 'call_closed': {
      const symbol = str(payload.symbol);
      const perf = num(payload.performance);
      const exit = num(payload.exit_price);
      if (!symbol) return null;
      return {
        title: perf === null ? `${symbol} clôturé` : `${symbol} clôturé · ${percent(perf)}`,
        body: `${context.actorName ?? 'Un membre'} sort${exit === null ? '' : ` à ${usd(exit)}`}. La perf est réalisée.`,
        url: './bag',
        tag: `call-${str(payload.ticker_id)}`,
      };
    }

    case 'oracle_resolved': {
      const phrase = HORIZON_PHRASES[str(payload.horizon)];
      if (!phrase) return null;
      const target = num(payload.target);
      const parts = [
        target === null ? null : `Votre courbe visait ${thousands(target)}`,
        context.btcSpot === null ? null : `le bitcoin est à ${thousands(context.btcSpot)}`,
      ].filter(Boolean);
      const facts = parts.length > 0 ? `${parts.join(' ; ')}. ` : '';
      return {
        title: `Pari à ${phrase} résolu`,
        body: `${facts}Votre justesse et votre rang vous attendent dans l’Oracle.`,
        url: './oracle',
        tag: `oracle-${str(payload.prediction_id)}`,
      };
    }
  }
}

/** Le message d'essai, envoyé depuis le profil. */
export const TEST_MESSAGE: PushMessage = {
  title: 'Satoshi Social Club',
  body: 'Les notifications fonctionnent sur cet appareil.',
  url: './',
  tag: 'essai',
};
