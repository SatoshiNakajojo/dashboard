/**
 * Identité du club — **le seul endroit à changer pour la renommer**.
 *
 * Deux fichiers statiques portent les mêmes chaînes et ne peuvent pas lire ce
 * module — `app.json` et `public/manifest.json`. Les changer ensemble.
 *
 * `shortName` est ce qui s'écrit sous l'icône de l'écran d'accueil : iOS
 * tronque au-delà d'une douzaine de signes, d'où « Satoshi Club » plutôt que le
 * nom complet.
 */

export const brand = {
  /** Nom complet — titre de page, manifeste, écran de connexion. */
  name: 'Satoshi Social Club',
  /** Nom court sous l'icône, écran d'accueil. */
  shortName: 'Satoshi Club',
  description: 'Le club de Nouméa — Crypto, Stock et Vibe Coding Nights, calls d’investissement et prédictions BTC.',
} as const;
