/**
 * Le clic au toucher — le même que celui de l'app JCGI.
 *
 * Aucun fichier son : le clic est synthétisé par Web Audio, à l'identique de
 * JCGI (`cgiSound.keyclick`). C'est un souffle de bruit de 28 ms, filtré en
 * passe-bande autour de 2,2 kHz, qui s'éteint en 25 ms, comme une touche de
 * clavier d'iPhone. Il s'accompagne d'une vibration de 8 ms là où le
 * navigateur la permet (Android ; Safari ne l'expose pas).
 *
 * Un seul écouteur, posé une fois sur le document, en phase de capture. Tout
 * ce qui répond au doigt clique : bouton, lien, onglet, interrupteur, choix.
 * Rien n'est à ajouter composant par composant. Se taisent :
 *
 *   • un bouton **désactivé** : un clic sur un bouton mort ferait croire
 *     qu'il s'est passé quelque chose ;
 *   • un élément marqué `data-snd="none"` ;
 *   • tout, si le membre a coupé le son dans son profil. Le réglage est propre
 *     à l'appareil (`localStorage`), comme sur JCGI, et le son est actif par
 *     défaut.
 *
 * Web seulement ; ailleurs, tout est sans effet.
 */

export const SOUND_STORAGE_KEY = 'club_sound';

/** Les rôles ARIA de ce qui se touche — React Native Web les pose sur ses `div`. */
const TAPPABLE_ROLES = new Set([
  'button',
  'link',
  'tab',
  'radio',
  'switch',
  'checkbox',
  'menuitem',
  'option',
]);
const TAPPABLE_TAGS = new Set(['button', 'a', 'summary']);

/** Le strict nécessaire d'un élément du DOM — de quoi tester sans navigateur. */
export interface NodeLike {
  tagName?: string;
  parentElement: NodeLike | null;
  getAttribute(name: string): string | null;
}

/**
 * L'élément touché qui mérite un clic, en remontant depuis la cible — ou
 * `null`. Le premier ancêtre qui se touche décide : désactivé, il se tait.
 */
export function tapTarget(start: NodeLike | null): NodeLike | null {
  for (let node = start; node; node = node.parentElement) {
    if (node.getAttribute('data-snd') === 'none') return null;
    const role = node.getAttribute('role');
    const tag = (node.tagName ?? '').toLowerCase();
    if ((role !== null && TAPPABLE_ROLES.has(role)) || TAPPABLE_TAGS.has(tag)) {
      const disabled =
        node.getAttribute('aria-disabled') === 'true' || node.getAttribute('disabled') !== null;
      return disabled ? null : node;
    }
  }
  return null;
}

/** Le son est-il actif ? Oui, sauf s'il a été coupé sur cet appareil. */
export function readSoundPreference(stored: string | null): boolean {
  return stored !== '0';
}

// --- État partagé : le réglage, et qui l'écoute --------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Navigation privée, stockage bloqué : le son reste actif, sans mémoire.
    return null;
  }
}

let enabled = (() => {
  try {
    return readSoundPreference(storage()?.getItem(SOUND_STORAGE_KEY) ?? null);
  } catch {
    return true;
  }
})();

export function isClickSoundOn(): boolean {
  return enabled;
}

/** Active ou coupe le clic ; en le rallumant, on l'entend aussitôt. */
export function setClickSoundOn(on: boolean): void {
  enabled = on;
  try {
    storage()?.setItem(SOUND_STORAGE_KEY, on ? '1' : '0');
  } catch {
    // Pas de mémoire : le réglage vaut pour la session.
  }
  listeners.forEach((listener) => listener());
  if (on) playClick();
}

export function subscribeClickSound(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// --- Le son ------------------------------------------------------------------

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (context) return context;
  try {
    const scope = globalThis as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
      navigator?: { audioSession?: { type: string } };
    };
    const Context = scope.AudioContext ?? scope.webkitAudioContext;
    if (!Context) return null;
    // iOS : un son d'interface se mêle à la musique en cours sans la couper,
    // et respecte le bouton silencieux.
    const session = scope.navigator?.audioSession;
    if (session && session.type === 'auto') session.type = 'ambient';

    context = new Context();
    master = context.createGain();
    master.gain.value = 0.9;
    master.connect(context.destination);
    // Un petit buffer de bruit décroissant (~28 ms), réutilisé à chaque clic.
    const length = Math.max(1, Math.floor(context.sampleRate * 0.028));
    noise = context.createBuffer(1, length, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  } catch {
    context = null;
  }
  return context;
}

/** Le clic de JCGI : court, doux, percussif. */
function keyclick(): void {
  const ctx = audio();
  if (!ctx || !noise) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  const t = ctx.currentTime;

  const source = ctx.createBufferSource();
  source.buffer = noise;
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 2200;
  bandpass.Q.value = 0.7;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 5200;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.16, t + 0.0015); // attaque quasi instantanée
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.026); // déclin ~25 ms

  source.connect(bandpass);
  bandpass.connect(lowpass);
  lowpass.connect(gain);
  gain.connect(master ?? ctx.destination);
  source.start(t);
  source.stop(t + 0.05);
}

function haptic(): void {
  try {
    const nav = globalThis.navigator as Navigator | undefined;
    if (typeof nav?.vibrate === 'function') nav.vibrate(8);
  } catch {
    // Vibration refusée : le son suffit.
  }
}

/** Un clic, si le son est actif. */
export function playClick(): void {
  if (!enabled) return;
  keyclick();
  haptic();
}

/**
 * Pose l'écouteur global. Idempotent : un rechargement à chaud ou un second
 * appel n'ajoute pas de second clic.
 */
export function installClickSound(): void {
  if (typeof document === 'undefined') return;
  const flag = globalThis as unknown as { __clubClickSound?: boolean };
  if (flag.__clubClickSound) return;
  flag.__clubClickSound = true;

  document.addEventListener(
    'click',
    (event) => {
      if (!enabled) return;
      try {
        if (tapTarget(event.target as NodeLike | null)) playClick();
      } catch {
        // Un son raté ne doit jamais gêner le geste.
      }
    },
    true,
  );
}
