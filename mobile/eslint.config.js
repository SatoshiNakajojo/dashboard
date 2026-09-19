const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = [
  ...expoConfig,
  // Les points d'entrée des fonctions Edge tournent sous Deno, avec ses propres
  // règles et son propre formateur : `deno lint` et `deno fmt`, pas ESLint.
  // Le code partagé (`_shared`, `plan.ts`) reste du TypeScript ordinaire.
  { ignores: ['node_modules/**', '.expo/**', 'dist/**', 'supabase/functions/*/index.ts'] },
  // Les scripts d'outillage tournent sous Node, pas dans l'app : ils ont droit
  // à `Buffer`, `URL`, `fetch` et le reste de la bibliothèque standard.
  { files: ['scripts/**/*.mjs'], languageOptions: { globals: globals.node } },
];
