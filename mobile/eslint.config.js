const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  // Les fonctions Edge tournent sous Deno, avec ses propres règles et son
  // propre formateur : `deno lint` et `deno fmt`, pas ESLint.
  { ignores: ['node_modules/**', '.expo/**', 'dist/**', 'supabase/functions/**'] },
];
