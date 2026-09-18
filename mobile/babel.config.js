// Preset NativeWind v4 + plugin worklets (obligatoire pour Reanimated 4 / Skia).
// L'ordre compte : `react-native-worklets/plugin` doit rester le dernier plugin.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: ['react-native-worklets/plugin'],
  };
};
