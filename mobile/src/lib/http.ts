/**
 * Client HTTP minimal, robuste par défaut.
 *
 * Trois garanties, exigées par le README §9 :
 *   • délai maximal par tentative (`timeoutMs`) ;
 *   • retry exponentiel sur les erreurs transitoires uniquement ;
 *   • annulation propre — le signal de l'appelant coupe l'attente entre deux
 *     tentatives, pas seulement la requête en vol.
 */

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, url: string) {
    super(`HTTP ${status} sur ${url}`);
    this.name = 'HttpError';
    this.status = status;
  }

  /** 408, 429 et 5xx valent une nouvelle tentative ; le reste est définitif. */
  get isTransient(): boolean {
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** En-têtes additionnels — fusionnés avec `accept: application/json`. */
  headers?: Record<string, string>;
  /** Nombre total de tentatives, la première comprise. */
  attempts?: number;
  timeoutMs?: number;
  /** Délai avant la 2ᵉ tentative ; doublé ensuite. */
  backoffMs?: number;
}

export class AbortError extends Error {
  constructor() {
    super('Requête annulée');
    this.name = 'AbortError';
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new AbortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** GET JSON typé. Lève `HttpError`, `AbortError`, ou l'erreur réseau d'origine. */
export async function getJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { signal, headers, attempts = 3, timeoutMs = 8_000, backoffMs = 400 } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal?.aborted) throw new AbortError();

    // Un contrôleur par tentative : le timeout coupe la requête sans annuler
    // les suivantes, et l'annulation de l'appelant coupe tout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const relay = () => controller.abort();
    signal?.addEventListener('abort', relay, { once: true });

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json', ...headers },
      });
      if (!response.ok) throw new HttpError(response.status, url);
      return (await response.json()) as T;
    } catch (error) {
      // Une annulation demandée par l'appelant n'est jamais une erreur à réessayer.
      if (signal?.aborted) throw new AbortError();
      lastError = error;

      // L'annulation de l'appelant est déjà partie plus haut : tout ce qui
      // reste (panne réseau, timeout de la tentative) mérite un nouvel essai.
      const retryable = error instanceof HttpError ? error.isTransient : true;
      const isLast = attempt === attempts - 1;
      if (!retryable || isLast) break;

      await sleep(backoffMs * 2 ** attempt, signal);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', relay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
