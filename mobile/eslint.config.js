const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  // Les points d'entrée des fonctions Edge tournent sous Deno, avec ses propres
  // règles et son propre formateur : `deno lint` et `deno fmt`, pas ESLint.
  // Le code partagé (`_shared`, `plan.ts`) reste du TypeScript ordinaire.
  { ignores: ['node_modules/**', '.expo/**', 'dist/**', 'supabase/functions/*/index.ts'] },
];
