/**
 * Actualiser l'app — sans la fermer.
 *
 * Une PWA installée n'a ni barre d'adresse ni geste « tirer pour recharger ».
 * Et iOS la met en veille au lieu de la fermer : rouverte quelques minutes
 * plus tard — souvent en touchant une notification —, elle reprenait l'écran
 * tel qu'on l'avait laissé. Le canal temps réel était mort pendant la veille,
 * rien ne s'était relu : on ne voyait pas ce dont parlait la notification, et
 * il fallait fermer puis rouvrir l'app.
 *
 * Désormais, un seul signal, `refreshAppData()`, que chaque chargement de
 * données écoute (`useAppRefresh`). Il part :
 *
 *   • du bouton ↻ du bandeau BTC, qui vérifie aussi qu'aucune nouvelle
 *     version n'a été publiée — sinon, il recharge l'app dessus ;
 *   • du retour au premier plan, après quelques secondes d'absence ;
 *   • du retour du réseau ;
 *   • du toucher d'une notification, que le service worker annonce à l'app
 *     avec l'onglet à ouvrir (`public/sw.js`).
 *
 * La relecture est silencieuse : les écrans gardent ce qu'ils affichent
 * jusqu'à la réponse, et un échec la laisse telle quelle.
 */

/** En dessous, c'était un aller-retour (copier un ticker, répondre à un message). */
export const RESUME_AFTER_MS = 10_000;

let revision = 0;
const listeners = new Set<() => void>();

export function subscribeToAppRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readAppRefresh(): number {
  return revision;
}

/** Tous les écrans relisent leurs données. */
export function refreshAppData(): void {
  revision += 1;
  listeners.forEach((listener) => listener());
}

/** Faut-il relire en revenant au premier plan ? */
export function shouldRefreshOnResume(hiddenAt: number | null, now: number): boolean {
  return hiddenAt !== null && now - hiddenAt >= RESUME_AFTER_MS;
}

/**
 * L'écran d'une notification, d'après son lien.
 *
 * Le service worker donne une URL absolue (`…/dashboard/club/bag`) ; le
 * routeur veut un chemin de l'app (`/bag`). Hors de l'app : `null`.
 */
export function routeForNotification(url: string, appBase: string): string | null {
  let target: URL;
  let base: URL;
  try {
    base = new URL(appBase);
    target = new URL(url, base);
  } catch {
    return null;
  }
  const prefix = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  if (target.origin !== base.origin) return null;
  if (target.pathname === prefix.slice(0, -1)) return '/';
  if (!target.pathname.startsWith(prefix)) return null;
  const rest = target.pathname.slice(prefix.length).replace(/\/+$/, '');
  return rest === '' || rest === 'index' ? '/' : `/${rest}`;
}

/** Le bundle d'une page de l'app : ce qui change à chaque version publiée. */
export function bundleOf(html: string): string | null {
  const match = /_expo\/static\/js\/web\/(entry-[\w-]+\.js)/.exec(html);
  return match ? match[1]! : null;
}

/** Un message du service worker : « ouvre cet écran ». */
export interface OpenMessage {
  type: 'club:open';
  url: string;
}

export function isOpenMessage(data: unknown): data is OpenMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'club:open' &&
    typeof (data as { url?: unknown }).url === 'string'
  );
}

/** Une notification touchée il y a plus longtemps ne nous mène plus nulle part. */
export const PENDING_OPEN_TTL_MS = 2 * 60_000;

/**
 * L'écran de la notification gardée par le service worker (`sw.js`,
 * `PENDING_OPEN`), si elle vient d'être touchée.
 */
export function pendingRoute(data: unknown, appBase: string, now: number): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const { url, at } = data as { url?: unknown; at?: unknown };
  if (typeof url !== 'string' || typeof at !== 'number') return null;
  if (now - at > PENDING_OPEN_TTL_MS || at - now > PENDING_OPEN_TTL_MS) return null;
  return routeForNotification(url, appBase);
}

// ---------------------------------------------------------------------------
// Navigateur
// ---------------------------------------------------------------------------

function hasDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/** Le bundle qui tourne, lu dans la page : `…/dashboard/club/_expo/static/js/web/entry-….js`. */
function runningScript(): string | null {
  if (!hasDom()) return null;
  const scripts = [...document.querySelectorAll<HTMLScriptElement>('script[src]')];
  return scripts.map((script) => script.src).find((src) => bundleOf(src) !== null) ?? null;
}

/** L'adresse de l'app, celle de `index.html` (`…/dashboard/club/`) : là d'où vient le bundle. */
export function appBaseOf(scriptUrl: string): string | null {
  const at = scriptUrl.indexOf('_expo/static/');
  return at === -1 ? null : scriptUrl.slice(0, at);
}

/**
 * Une version plus récente est-elle en ligne ?
 *
 * On relit `index.html` sans cache et l'on compare son bundle à celui qui
 * tourne. Sans réseau ou sans réponse : non — on ne recharge pas à l'aveugle.
 */
export async function newVersionOnline(): Promise<boolean> {
  const script = runningScript();
  const base = script ? appBaseOf(script) : null;
  const running = script ? bundleOf(script) : null;
  if (!base || !running || typeof fetch !== 'function') return false;
  try {
    const response = await fetch(base, { cache: 'no-store' });
    if (!response.ok) return false;
    const online = bundleOf(await response.text());
    return online !== null && online !== running;
  } catch {
    return false;
  }
}

/**
 * Le bouton ↻ : relit tout, et passe à la nouvelle version s'il y en a une.
 * Résout `true` quand l'app va se recharger.
 */
export async function refreshApp(): Promise<boolean> {
  refreshAppData();
  if (!hasDom()) return false;
  if (await newVersionOnline()) {
    await reloadOnNewVersion();
    return true;
  }
  return false;
}

/** L'écran à rouvrir après un rechargement, et quand on l'a quitté. */
const RESUME_KEY = 'club.resume';
/** Au-delà, ce n'est plus le rechargement qu'on vient de demander. */
export const RESUME_TTL_MS = 60_000;

/** L'écran gardé, s'il date du rechargement qu'on vient de faire. */
export function resumeRoute(saved: string | null, now: number): string | null {
  if (!saved) return null;
  try {
    const { route, at } = JSON.parse(saved) as { route?: unknown; at?: unknown };
    if (typeof route !== 'string' || !route.startsWith('/') || typeof at !== 'number')
      return null;
    return now - at >= 0 && now - at <= RESUME_TTL_MS ? route : null;
  } catch {
    return null;
  }
}

/**
 * Passer à la nouvelle version.
 *
 * Recharger l'adresse courante (`…/club/oracle`) donnait la page 404 de
 * GitHub Pages, qui ne connaît que `index.html`. On recharge donc l'accueil
 * de l'app, en gardant l'écran pour y revenir aussitôt. Le nouveau service
 * worker, s'il attend, prend la main tout de suite.
 */
async function reloadOnNewVersion(): Promise<void> {
  const script = runningScript();
  const base = script ? appBaseOf(script) : null;
  const route = base ? routeForNotification(window.location.href, base) : null;
  try {
    if (route)
      window.sessionStorage.setItem(RESUME_KEY, JSON.stringify({ route, at: Date.now() }));
  } catch {
    // Sans stockage, on rouvre sur l'accueil : c'est tout.
  }
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
    registration?.waiting?.postMessage('SKIP_WAITING');
  } catch {
    // Le service worker suivra à la prochaine ouverture.
  }
  window.location.replace(base ?? window.location.href);
}

/** Lit — et efface — l'écran gardé avant un rechargement. */
function consumeResumeRoute(): string | null {
  try {
    const saved = window.sessionStorage.getItem(RESUME_KEY);
    window.sessionStorage.removeItem(RESUME_KEY);
    return resumeRoute(saved, Date.now());
  } catch {
    return null;
  }
}

/** Même clé que `PENDING_OPEN` dans `public/sw.js`. */
const PENDING_OPEN = '__club-open';

/** Lit — et efface — la notification touchée que le service worker a gardée. */
async function consumePendingOpen(base: string): Promise<string | null> {
  if (typeof caches === 'undefined') return null;
  const key = new URL(PENDING_OPEN, base).href;
  try {
    const hit = await caches.match(key);
    if (!hit) return null;
    const names = await caches.keys();
    await Promise.all(names.map(async (name) => (await caches.open(name)).delete(key)));
    return pendingRoute(await hit.json(), base, Date.now());
  } catch {
    return null;
  }
}

let installed = false;

/**
 * Branche les déclencheurs automatiques — une fois, au démarrage.
 * `open` mène à l'écran d'une notification touchée.
 */
export function installAppRefresh(open: (route: string) => void): void {
  if (installed || !hasDom() || typeof document.addEventListener !== 'function') return;
  installed = true;

  const script = runningScript();
  const base = script ? appBaseOf(script) : null;

  /** Une notification vient d'être touchée : on va à son écran. */
  const followPendingOpen = () => {
    if (!base) return;
    void consumePendingOpen(base).then((route) => {
      if (route) open(route);
    });
  };

  let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (shouldRefreshOnResume(hiddenAt, Date.now())) refreshAppData();
    hiddenAt = null;
    // Le service worker range la notification pendant que l'app revient :
    // on regarde tout de suite, puis un instant plus tard.
    followPendingOpen();
    setTimeout(followPendingOpen, 1500);
  });
  window.addEventListener('online', () => refreshAppData());

  const worker = (navigator as Navigator & { serviceWorker?: ServiceWorkerContainer })
    .serviceWorker;
  worker?.addEventListener('message', (event: MessageEvent) => {
    if (!isOpenMessage(event.data)) return;
    const route = base ? routeForNotification(event.data.url, base) : null;
    if (route) open(route);
    refreshAppData();
    // Déjà suivie : l'entrée gardée ne doit pas nous y ramener plus tard.
    followPendingOpen();
  });

  // Rechargée par le bouton ↻ sur une nouvelle version : on revient à l'écran
  // qu'on avait. Ouverte par une notification : on va au sien.
  const resumed = consumeResumeRoute();
  if (resumed && resumed !== '/') open(resumed);
  followPendingOpen();
}
