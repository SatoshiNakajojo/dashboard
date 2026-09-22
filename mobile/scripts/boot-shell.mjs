/**
 * L'écran d'attente, écrit en HTML dans le document publié.
 *
 * Le bundle pèse 2,7 Mo. Entre le moment où Safari reçoit le document et celui
 * où React peint quelque chose, il s'écoule plusieurs secondes sur un réseau
 * ordinaire — et pendant ce temps l'app est un rectangle noir. Sur un écran
 * d'accueil d'iPhone, un rectangle noir se lit « ça a planté ».
 *
 * Cette coquille est là dès le premier octet : aucune police à charger, aucune
 * image au-delà de l'icône que la PWA a déjà en cache, aucun JavaScript.
 * `src/components/BootScreen.tsx` en est la copie React, pour le relais pendant
 * le chargement des polices et pour le mobile natif. Les deux doivent se
 * ressembler : c'est ce qui rend le passage de l'une à l'autre invisible.
 *
 * Ce ne sont plus des carrés mais des **blocs chaînés** : chaque bloc porte ses
 * deux lignes de données, et un maillon le relie au suivant. Le maillon ne
 * s'allume qu'avec le bloc d'après — c'est ce qui fait une chaîne et pas une
 * rangée.
 *
 * Les constantes d'animation suivent `src/lib/mining.ts` — huit blocs de
 * 150 ms, puis 450 ms de pause. Une barre de progression mentirait sur un temps
 * qu'on ne connaît pas ; des blocs qui se minent ne promettent que « ça
 * travaille ».
 */

export const BOOT_SENTINEL = 'id="boot"';

/** Le fond de l'app, répété ici parce que la coquille précède tout le reste. */
const INK = '#0A0806';
const GOLD = '#E8903D';
const DIAL = '#3A2F1E';
const SEPIA = '#6D6455';

const BLOCK_COUNT = 8;
const BLOCK_MS = 150;
const PAUSE_MS = 450;
const CYCLE_MS = BLOCK_COUNT * BLOCK_MS + PAUSE_MS;

/** Géométrie d'un bloc et de son maillon, en pixels CSS. */
const BLOCK = 16;
const LINK = 8;

/** Part du cycle où la chaîne se remplit ; le reste, elle reste pleine. */
const FILL_END = ((BLOCK_COUNT * BLOCK_MS) / CYCLE_MS) * 100;

/** Largeur du calque doré quand `k` blocs sont minés — s'arrête au bord du bloc. */
const widthAt = (k) => (k === 0 ? 0 : k * BLOCK + (k - 1) * LINK);
const CHAIN_WIDTH = widthAt(BLOCK_COUNT);

/**
 * Les paliers du remplissage, un par bloc.
 *
 * Des crans réguliers (`steps()`) tomberaient au milieu des maillons et
 * laisseraient des tranches à l'écran. Ces paliers-là s'arrêtent au bord exact
 * d'un bloc ; le maillon qui précède un bloc s'allume donc avec lui, ce qui est
 * précisément ce qu'on veut voir.
 */
const FILL_STEPS = Array.from({ length: BLOCK_COUNT + 1 }, (_, k) => {
  const at = ((k / BLOCK_COUNT) * FILL_END).toFixed(2);
  return `        ${at}% { width: ${widthAt(k)}px; }`;
}).join('\n');

/** Un bloc : deux lignes de données. Un maillon le précède, sauf le premier. */
const chain = (klass) =>
  Array.from(
    { length: BLOCK_COUNT },
    (_, index) =>
      `${index === 0 ? '' : `<u class="${klass}"></u>`}<i class="${klass}"><b></b><b></b></i>`,
  ).join('');

export const BOOT_SHELL = `
    <div id="boot" aria-label="Chargement" role="progressbar">
      <img id="boot-logo" src="icon-192.png" alt="" width="132" height="132" />
      <div id="boot-chain">
        <div class="boot-row">${chain('boot-b')}</div>
        <div id="boot-fill"><div class="boot-row">${chain('boot-b on')}</div></div>
      </div>
      <p id="boot-label">MINAGE EN COURS</p>
    </div>
    <style>
      #boot {
        position: fixed; inset: 0; z-index: 9999;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 26px; background: ${INK};
        transition: opacity .25s ease-out;
      }
      #boot.done { opacity: 0; pointer-events: none; }
      #boot-logo { width: 132px; height: 132px; }
      #boot-chain { position: relative; }
      /* « width: max-content » et « flex: none » ensemble : sans eux, les
         blocs du calque doré se compriment dans la largeur animée au lieu
         d'être découpés par elle, et la chaîne se remplit de tranches au lieu
         de blocs. Le défaut ne se voit qu'une fois l'animation lancée.
         (Pas de guillemets obliques ici : on est dans un gabarit de chaîne.) */
      .boot-row { display: flex; align-items: center; width: max-content; }
      /* Le bloc. */
      .boot-b {
        flex: none; box-sizing: border-box;
        width: ${BLOCK}px; height: ${BLOCK}px; border-radius: 2px;
        border: 1px solid ${DIAL};
        display: flex; flex-direction: column; justify-content: center; gap: 2px;
        padding: 0 3px;
      }
      /* Les deux lignes de données à l'intérieur. */
      .boot-b b { display: block; height: 1px; background: ${DIAL}; }
      .boot-b b:last-child { width: 60%; }
      /* Le maillon vers le bloc suivant. */
      u.boot-b {
        width: ${LINK}px; height: 2px; border: 0; border-radius: 1px;
        background: ${DIAL}; padding: 0;
      }
      .boot-b.on { border-color: ${GOLD}; background: ${GOLD}; }
      .boot-b.on b { background: ${INK}; }
      u.boot-b.on { background: ${GOLD}; }
      /* Le remplissage est un calque découpé qui s'élargit par paliers. */
      #boot-fill {
        position: absolute; inset: 0; overflow: hidden; width: 0;
        animation: boot-mine ${CYCLE_MS}ms steps(1, end) infinite;
      }
      @keyframes boot-mine {
${FILL_STEPS}
        100% { width: ${CHAIN_WIDTH}px; }
      }
      #boot-label {
        margin: 0; color: ${SEPIA};
        font: 500 9px/1 ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: 2.2px;
      }
      @media (prefers-reduced-motion: reduce) {
        /* Sans mouvement, la chaîne reste pleine : elle dit encore « ça
           travaille » sans imposer une animation à qui n'en veut pas. */
        #boot-fill { animation: none; width: ${CHAIN_WIDTH}px; }
      }
    </style>
`;

/**
 * Pose la coquille juste avant `</body>`, une seule fois.
 *
 * Avant `</body>` et non dans `<head>` : le navigateur doit pouvoir la peindre
 * sans attendre le reste, et elle doit se superposer à `#root` plutôt que de le
 * précéder dans le flux.
 */
export function injectBootShell(html) {
  if (html.includes(BOOT_SENTINEL)) return { html, injected: false };

  const at = html.lastIndexOf('</body>');
  if (at === -1) return { html, injected: false };

  return { html: html.slice(0, at) + BOOT_SHELL + html.slice(at), injected: true };
}
