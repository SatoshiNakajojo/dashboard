/**
 * La bande vide sous la barre d'onglets, dans l'app installée sur iPhone.
 *
 * En mode autonome (« Sur l'écran d'accueil ») avec une barre d'état
 * `black-translucent`, iOS dessine la page sur **tout** l'écran — elle passe
 * sous l'heure, c'est voulu — mais lui donne une zone de mise en page plus
 * courte de la hauteur de la barre d'état : 852 pt sur un écran de 896
 * (iPhone 11), 797 sur 844 (iPhone 12 à 14). L'app s'arrêtait donc au-dessus
 * du bord, et la bande restait vide.
 *
 * Trois essais, trois leçons, relevées sur l'iPhone d'un membre grâce à la
 * ligne de mesures du panneau « À propos » :
 *
 *   1. allonger la page de l'écart `écran − innerHeight`, mesuré dans `<head>`
 *      et au retour au premier plan : trop tôt au lancement, iOS n'avait pas
 *      encore raccourci la page ;
 *   2. suivre la hauteur en continu (sonde + `ResizeObserver`) : **boucle**.
 *      Dès que la page est allongée, iOS annonce la hauteur de l'écran ; on
 *      conclut qu'il n'y a plus d'écart, on retire l'allongement, iOS
 *      raccourcit de nouveau… à chaque image : le bas de l'app clignotait ;
 *   3. mesurer à intervalles, avec un coupe-circuit : plus de clignotement,
 *      mais la même bascule, figée du mauvais côté (« 4 BASCULES · FIGÉ »).
 *
 * La leçon : **toute règle qui décide d'après `innerHeight` décide d'après sa
 * propre correction.** La page reçoit donc désormais une hauteur qui ne
 * dépend pas de ce qu'iOS annonce : celle de l'écran (`screen.height`, dans
 * l'orientation courante). C'est un point fixe — allongée ou non, la page
 * mesure l'écran — et elle l'est dès le `<head>`, avant que iOS ne se décide.
 * `innerHeight` ne sert plus qu'à reconnaître les situations où il ne faut
 * rien toucher (clavier ouvert, fenêtre réduite) : on garde alors l'état.
 *
 * Sur tout ce qui n'est pas l'app installée sur iOS — Android, ordinateur,
 * onglet Safari —, rien ne change.
 */

/** Écart au-delà duquel ce n'est plus une barre d'état : un clavier, une fenêtre réduite. */
export const MAX_SHIM = 100;

/** `pageHeight` : ne rien toucher cette fois-ci, garder l'état courant. */
export const HOLD = -1;

/**
 * La hauteur à donner à la page, en points CSS.
 *
 *   • `0` — pas l'app installée sur iOS (`navigator.standalone` n'existe que
 *     là), fenêtre qui ne prend pas toute la largeur (iPad en Split View ou
 *     Stage Manager), ou mesure incohérente : on ne touche à rien ;
 *   • `HOLD` (−1) — situation transitoire, un clavier ouvert par exemple :
 *     on garde ce qui est posé ;
 *   • sinon la hauteur de l'écran dans l'orientation courante — **quel que
 *     soit** l'écart annoncé, zéro compris : c'est ce qui rend la règle
 *     insensible à sa propre correction.
 *
 * `orientation` : `'portrait'`, `'landscape'`, ou vide si l'appareil ne la
 * donne pas (on la déduit alors des proportions de la fenêtre).
 *
 * Sans dépendance ni référence extérieure : son texte est recopié tel quel
 * dans la page, et tourne avant le bundle.
 */
export function pageHeight(
  standalone,
  screenWidth,
  screenHeight,
  innerWidth,
  innerHeight,
  orientation,
) {
  if (standalone !== true) return 0;
  const sizes = [screenWidth, screenHeight, innerWidth, innerHeight];
  for (let i = 0; i < sizes.length; i++) {
    if (typeof sizes[i] !== 'number' || !isFinite(sizes[i]) || sizes[i] <= 0) return 0;
  }
  // iOS donne les dimensions de l'écran en portrait, quelle que soit
  // l'orientation : on les remet dans le bon sens. L'orientation vient de
  // l'écran quand il la donne — pas des proportions de la fenêtre, qu'un
  // clavier ouvert rend plus large que haute en plein portrait.
  const landscape =
    orientation === 'landscape' || (orientation !== 'portrait' && innerWidth > innerHeight);
  const fullWidth = landscape
    ? Math.max(screenWidth, screenHeight)
    : Math.min(screenWidth, screenHeight);
  const fullHeight = landscape
    ? Math.min(screenWidth, screenHeight)
    : Math.max(screenWidth, screenHeight);
  if (Math.abs(fullWidth - innerWidth) > 1) return 0;
  const gap = fullHeight - innerHeight;
  if (gap < -1 || gap > 100) return -1;
  return Math.round(fullHeight);
}

/**
 * Le style : la page prend la hauteur de l'écran, et avec elle tout ce qui
 * s'y accroche en pourcentage — `body`, `#root`, donc l'app entière.
 *
 *   • `overflow: visible` sur `html` et `body` : un `overflow: hidden` sur
 *     `body` se propage à la fenêtre, qui rognerait la bande qu'on vient de
 *     gagner ;
 *   • les feuilles et fenêtres (`Modal` de react-native-web) sont en
 *     `position: fixed`, donc ancrées à la zone de mise en page, trop courte :
 *     elles prennent la même hauteur que la page. Elles vivent dans un `div`
 *     sans attribut accroché à `body`.
 */
export const SHIM_STYLE = `
      html.club-shim { height: var(--club-height) !important; overscroll-behavior: none; }
      html.club-shim, html.club-shim body { overflow: visible; }
      html.club-shim body > div:not([id]):not([style]) > div {
        bottom: auto !important;
        height: var(--club-height) !important;
      }`;

/** Remesures après le chargement — pour le diagnostic, et la rotation. */
export const SETTLE_DELAYS_MS = [150, 600, 1500, 3000];

/**
 * Le coupe-circuit, gardé par précaution : au-delà de ce nombre de
 * changements de hauteur, on fige l'état jusqu'au prochain retour au premier
 * plan. Avec une hauteur tirée de l'écran, il ne devrait plus jamais servir —
 * seule une rotation la fait changer.
 */
export const MAX_TOGGLES = 4;

/**
 * Le script : pose la hauteur de l'écran, et la repose si l'orientation
 * change. Jamais de mesure continue.
 *
 * Il relève aussi, pour la ligne de diagnostic du panneau « À propos », ce
 * qu'iOS annonce : `innerHeight`, et la hauteur d'une sonde `fixed` à 100 %.
 *
 * Le document pouvant être plus haut que la zone visible d'après iOS, la page
 * pourrait défiler de la hauteur de la bande : on la ramène en haut.
 */
export const SHIM_SCRIPT = `
      (function () {
        var pageHeight = ${pageHeight.toString()};
        var root = document.documentElement;
        var probe = null;
        var fits = 0;
        var toggles = 0;
        var frozen = false;
        function probeHeight() {
          if (!probe && document.body) {
            probe = document.createElement('div');
            probe.id = 'club-viewport-probe';
            probe.setAttribute('aria-hidden', 'true');
            probe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:100%;visibility:hidden;pointer-events:none';
            document.body.appendChild(probe);
          }
          return probe ? Math.round(probe.getBoundingClientRect().height) : null;
        }
        function orientation() {
          var type = screen.orientation && screen.orientation.type;
          if (type) return type.indexOf('landscape') === 0 ? 'landscape' : 'portrait';
          if (typeof window.orientation === 'number') return Math.abs(window.orientation) === 90 ? 'landscape' : 'portrait';
          return '';
        }
        function fit() {
          var height = pageHeight(navigator.standalone, screen.width, screen.height, innerWidth, innerHeight, orientation());
          if (height !== ${HOLD}) {
            var wanted = height > 0 ? height + 'px' : '';
            if (root.style.getPropertyValue('--club-height') !== wanted) {
              if (toggles >= ${MAX_TOGGLES}) {
                frozen = true;
              } else {
                toggles += 1;
                if (height > 0) {
                  root.style.setProperty('--club-height', wanted);
                  root.classList.add('club-shim');
                } else {
                  root.style.removeProperty('--club-height');
                  root.classList.remove('club-shim');
                }
              }
            }
          }
          fits += 1;
          var applied = parseInt(root.style.getPropertyValue('--club-height'), 10) || 0;
          window.__clubViewport = {
            standalone: navigator.standalone === true,
            screen: screen.height, inner: innerHeight, layout: probeHeight(),
            gap: applied ? Math.max(0, applied - innerHeight) : 0,
            height: applied, fits: fits, toggles: toggles, frozen: frozen
          };
          if (root.classList.contains('club-shim') && window.scrollY !== 0) window.scrollTo(0, 0);
        }
        fit();
        document.addEventListener('DOMContentLoaded', fit);
        addEventListener('load', function () {
          fit();
          ${JSON.stringify(SETTLE_DELAYS_MS)}.forEach(function (ms) { setTimeout(fit, ms); });
        });
        addEventListener('resize', fit);
        addEventListener('pageshow', fit);
        addEventListener('orientationchange', function () { setTimeout(fit, 300); });
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') { toggles = 0; frozen = false; }
          fit();
        });
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
