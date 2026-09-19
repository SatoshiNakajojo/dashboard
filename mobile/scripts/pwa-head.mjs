/**
 * Les balises qui rendent la PWA installable.
 *
 * Elles doivent survivre au réglage `expo.web.output` :
 *
 *   • `static` — Expo honore `app/+html.tsx`, qui les pose lui-même ;
 *   • `single` — Expo l'ignore et sert son gabarit par défaut, sans elles.
 *
 * Le second cas est parfaitement légitime : le rendu statique exécute chaque
 * route dans Node au moment du build, ce qui peut casser pour une raison sans
 * rapport avec la PWA. On injecte donc ces balises à la publication, quand
 * elles manquent — le déploiement ne dépend plus du réglage.
 *
 * Sans `apple-mobile-web-app-capable`, « Sur l'écran d'accueil » ne crée qu'un
 * marque-page qui rouvre Safari avec sa barre d'adresse.
 */

export const INK = '#0A0806';

/** Repère d'idempotence : si cette balise est là, le reste l'est aussi. */
export const SENTINEL = 'apple-mobile-web-app-capable';

export const PWA_HEAD = `
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Cryptos Club" />
    <meta name="application-name" content="Cryptos Club" />
    <meta name="theme-color" content="${INK}" />
    <meta name="color-scheme" content="dark" />
    <link rel="manifest" href="manifest.json" />
    <link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png" />
    <style>
      html, body, #root { background-color: ${INK}; height: 100%; }
      body { margin: 0; overscroll-behavior-y: none; -webkit-tap-highlight-color: transparent; }
      #root { -webkit-user-select: none; user-select: none; }
    </style>
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('sw.js').catch(function () {});
        });
      }
    </script>
`;

/**
 * Pose les balises si elles manquent, et remplace le `viewport` par défaut
 * d'Expo — le sien n'a pas `viewport-fit=cover`, sans quoi une bande blanche
 * apparaît sous l'encoche en mode autonome.
 */
export function injectPwaHead(html) {
  if (html.includes(SENTINEL)) return { html, injected: false };

  const withoutViewport = html.replace(/\s*<meta\s+name="viewport"[^>]*>/i, '');
  const at = withoutViewport.indexOf('</head>');
  if (at === -1) return { html, injected: false };

  return {
    html: withoutViewport.slice(0, at) + PWA_HEAD + withoutViewport.slice(at),
    injected: true,
  };
}

/** Ce qu'un document publié doit contenir, sous peine d'échec du déploiement. */
export const REQUIRED = [
  'apple-mobile-web-app-capable',
  'apple-mobile-web-app-title',
  'rel="manifest"',
  'apple-touch-icon',
  'theme-color',
  'serviceWorker',
];

export function missingTags(html) {
  return REQUIRED.filter((tag) => !html.includes(tag));
}
