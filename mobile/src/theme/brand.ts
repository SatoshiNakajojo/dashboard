/**
 * Identité du club — **le seul endroit à changer pour la renommer**.
 *
 * Le dossier de design parle de « Satoshi Social Club » ; le logo fourni par le
 * club porte « CRYPTOS CLUB ». C'est le logo qui fait foi : c'est lui qui sera
 * sur l'écran d'accueil de chaque membre, et un nom qui contredit la marque
 * qu'on regarde tous les jours est un détail qui se remarque.
 *
 * Deux fichiers statiques portent les mêmes chaînes et ne peuvent pas lire ce
 * module — `app.json` et `public/manifest.json`. Les changer ensemble.
 */

export const brand = {
  /** Nom complet — titre de page, manifeste, écran de connexion. */
  name: 'Cryptos Club',
  /** Nom court sous l'icône, écran d'accueil. iOS tronque au-delà de ~12 signes. */
  shortName: 'Cryptos Club',
  description: 'Le club — Crypto Nights, calls d’investissement et prédictions BTC.',
} as const;
