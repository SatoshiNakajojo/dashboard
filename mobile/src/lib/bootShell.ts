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

export function hideBootShell(): void {
  if (typeof document === 'undefined') return;

  const boot = document.getElementById('boot');
  if (!boot || boot.classList.contains('done')) return;

  boot.classList.add('done');
  setTimeout(() => boot.remove(), FADE_MS);
}
