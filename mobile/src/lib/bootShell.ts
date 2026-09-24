/**
 * Retrait de la coquille d'attente posée dans le document publié.
 *
 * `scripts/boot-shell.mjs` dessine le logo et les blocs minés dès le premier
 * octet, bien avant React. Quand l'app est prête, c'est à elle de la retirer :
 * personne d'autre ne sait quand « prête » arrive.
 *
 * On laisse le fondu se jouer avant de retirer le nœud. Retirer d'un coup
 * ferait clignoter le passage, alors que les deux écrans sont identiques —
 * autant qu'on ne voie rien du tout.
 */

/** Doit suivre la transition CSS de `#boot`. */
const FADE_MS = 250;

/**
 * Le temps que la coquille reste affichée une fois l'app prête.
 *
 * Le club voulait voir le minage : prête en une fraction de seconde, l'app
 * escamotait l'animation avant qu'on ait pu la lire. Deux secondes de plus
 * laissent passer un cycle complet des huit blocs — et l'app, elle, se monte
 * et charge ses données pendant ce temps, sous la coquille.
 */
export const BOOT_HOLD_MS = 2000;

let scheduled = false;

export function hideBootShell(): void {
  if (typeof document === 'undefined' || scheduled) return;

  const boot = document.getElementById('boot');
  if (!boot || boot.classList.contains('done')) return;

  scheduled = true;
  setTimeout(() => {
    boot.classList.add('done');
    setTimeout(() => boot.remove(), FADE_MS);
  }, BOOT_HOLD_MS);
}
