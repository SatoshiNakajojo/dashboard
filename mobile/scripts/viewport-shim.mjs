/**
 * La bande vide sous la barre d'onglets, dans l'app installée sur iPhone.
 *
 * En mode autonome (« Sur l'écran d'accueil ») avec une barre d'état
 * `black-translucent`, iOS dessine la page sur **tout** l'écran — elle passe
 * sous l'heure, c'est voulu — mais calcule sa zone de mise en page comme si la
 * barre d'état n'était pas superposée : `innerHeight` et `height: 100%` valent
 * la hauteur de l'écran **moins** celle de la barre d'état (47 pt sur un
 * iPhone 12 à 14). L'app s'arrêtait donc 47 pt au-dessus du bord, et la bande
 * restait vide, de la couleur du fond.
 *
 * Deux corrections précédentes l'avaient prise pour une marge trop généreuse
 * sous la barre d'onglets (`src/lib/insets.ts`) : elles ont resserré la barre,
 * mais la bande, elle, n'était pas à nous.
 *
 * La bande fait partie de la page : on la récupère en étirant le document de
 * l'écart mesuré entre l'écran et la zone de mise en page. Sur tout ce qui ne
 * présente pas le défaut — Android, ordinateur, onglet Safari, iPad en fenêtre
 * — l'écart mesuré est nul et rien ne change.
 */

/** Au-delà, ce n'est plus une barre d'état : un clavier, une fenêtre réduite. */
export const MAX_SHIM = 100;

/**
 * L'écart à combler sous la zone de mise en page, en points CSS.
 *
 * Nul hors de l'app installée sur iOS (`navigator.standalone` n'existe que
 * là), hors plein écran en largeur (iPad en Split View ou Stage Manager), et
 * pour toute mesure incohérente : dans le doute, on ne touche à rien.
 *
 * Sans dépendance ni référence extérieure : son texte est recopié tel quel
 * dans la page, et tourne avant le bundle.
 */
export function bottomShim(standalone, screenWidth, screenHeight, innerWidth, innerHeight) {
  if (standalone !== true) return 0;
  const sizes = [screenWidth, screenHeight, innerWidth, innerHeight];
  for (let i = 0; i < sizes.length; i++) {
    if (typeof sizes[i] !== 'number' || !isFinite(sizes[i]) || sizes[i] <= 0) return 0;
  }
  // iOS donne les dimensions de l'écran en portrait, quelle que soit
  // l'orientation : on les remet dans le sens de la fenêtre.
  const landscape = innerWidth > innerHeight;
  const fullWidth = landscape
    ? Math.max(screenWidth, screenHeight)
    : Math.min(screenWidth, screenHeight);
  const fullHeight = landscape
    ? Math.min(screenWidth, screenHeight)
    : Math.max(screenWidth, screenHeight);
  if (Math.abs(fullWidth - innerWidth) > 1) return 0;
  const gap = Math.round(fullHeight - innerHeight);
  return gap > 0 && gap <= 100 ? gap : 0;
}

/**
 * Le style : le document s'allonge de l'écart, et avec lui tout ce qui s'y
 * accroche en pourcentage — `body`, `#root`, donc l'app entière.
 *
 *   • `overflow: visible` sur `html` et `body` : un `overflow: hidden` sur
 *     `body` se propage à la fenêtre, qui rognerait alors la bande qu'on vient
 *     de gagner ;
 *   • les feuilles et fenêtres (`Modal` de react-native-web) sont en
 *     `position: fixed`, donc ancrées à la zone de mise en page, trop courte :
 *     on les prolonge d'autant, sinon le bas de la barre d'onglets dépasserait
 *     sous une feuille ouverte. Elles vivent dans un `div` sans attribut
 *     accroché à `body`.
 */
export const SHIM_STYLE = `
      html.club-shim { height: calc(100% + var(--club-shim, 0px)); overscroll-behavior: none; }
      html.club-shim, html.club-shim body { overflow: visible; }
      html.club-shim body > div:not([id]):not([style]) > div {
        bottom: calc(-1 * var(--club-shim, 0px)) !important;
      }`;

/**
 * Le script : mesure, pose la variable, et remesure quand la fenêtre change
 * (rotation, retour au premier plan, clavier).
 *
 * Le document étant plus haut que la zone visible d'après iOS, la page
 * pourrait défiler de la hauteur de la bande : on la ramène en haut.
 */
export const SHIM_SCRIPT = `
      (function () {
        var bottomShim = ${bottomShim.toString()};
        var root = document.documentElement;
        function fit() {
          var gap = bottomShim(navigator.standalone, screen.width, screen.height, innerWidth, innerHeight);
          root.style.setProperty('--club-shim', gap + 'px');
          if (gap > 0) root.classList.add('club-shim');
          else root.classList.remove('club-shim');
          if (gap > 0 && window.scrollY !== 0) window.scrollTo(0, 0);
        }
        fit();
        addEventListener('resize', fit);
        addEventListener('pageshow', fit);
        addEventListener('orientationchange', function () { setTimeout(fit, 300); });
        document.addEventListener('visibilitychange', fit);
        addEventListener('scroll', function () {
          if (root.classList.contains('club-shim') && window.scrollY !== 0) window.scrollTo(0, 0);
        }, { passive: true });
      })();`;

/** Ce qu'on injecte dans `<head>` : le style, puis le script qui l'active. */
export const VIEWPORT_SHIM = `
    <style>${SHIM_STYLE}
    </style>
    <script>${SHIM_SCRIPT}
    </script>
`;
