# Étape 1 — Mise en place du projet

Commandes exactes qui produisent ce dépôt, dans l'ordre. Elles ont toutes été
exécutées pour de bon : les versions ci-dessous sont celles qui tournent, pas
celles de la documentation.

Prérequis : **Node 20 ou plus** (testé sur 22.22), et `npx`.

---

## 1. Squelette Expo + TypeScript

```bash
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npm install
```

## 2. Navigation par onglets (expo-router)

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens \
  expo-linking expo-constants
```

Puis, dans `package.json`, remplacer le point d'entrée :

```json
"main": "expo-router/entry"
```

et supprimer `App.tsx` et `index.ts`, devenus inutiles — le routage vient du
dossier `app/`.

> **Sans accès à `api.expo.dev`** (réseau filtré), `npx expo install` échoue sur
> un `HTTP Proxy Network Error: Forbidden`. Le repli est `npm install` avec les
> versions épinglées, que l'on lit dans le fichier embarqué par Expo :
> `node -p "require('expo/bundledNativeModules.json')['react-native-reanimated']"`.
> C'est ce qui a été fait ici ; le `package.json` final est identique.

## 3. Geste, animation et Skia

Skia 2 s'appuie sur Reanimated 4, qui s'appuie lui-même sur `react-native-worklets` :
les trois s'installent ensemble, sous peine d'un écran rouge au premier rendu.

```bash
npx expo install react-native-gesture-handler react-native-reanimated \
  react-native-worklets @shopify/react-native-skia
```

## 4. Supabase

```bash
npx expo install @react-native-async-storage/async-storage
npm install @supabase/supabase-js react-native-url-polyfill
```

`react-native-url-polyfill` n'est pas décoratif : `supabase-js` construit ses URL
avec l'API `URL`, absente du moteur Hermes.

## 5. NativeWind v4 + Tailwind

```bash
npm install nativewind
npm install --save-dev tailwindcss@3.4.17 babel-preset-expo
npx tailwindcss init
```

**Tailwind reste en 3.4.** NativeWind v4 déclare `tailwindcss: >3.3.0`, mais son
compilateur lit la configuration au format v3 ; installer Tailwind 4 produit une
feuille vide, sans message d'erreur.

Trois fichiers à écrire ensuite — ils sont dans le dépôt :

- `tailwind.config.js` — `presets: [require('nativewind/preset')]`, `content`
  pointant sur `./app/**/*.{ts,tsx}` et `./src/**/*.{ts,tsx}`, et les jetons de
  design du README §4 ;
- `babel.config.js` — `['babel-preset-expo', { jsxImportSource: 'nativewind' }]`,
  le preset `nativewind/babel`, et `react-native-worklets/plugin` **en dernier** ;
- `metro.config.js` — `withNativeWind(config, { input: './global.css' })`.

Plus `global.css` (les trois `@tailwind`) et `nativewind-env.d.ts`
(`/// <reference types="nativewind/types" />`).

## 6. Polices

Trois familles, trois rôles non interchangeables (README §4.4). L'italique
d'Instrument Serif se charge comme une police à part entière : ne pas le simuler
avec `fontStyle`.

```bash
npx expo install expo-font expo-splash-screen
npm install @expo-google-fonts/instrument-serif @expo-google-fonts/manrope \
  @expo-google-fonts/jetbrains-mono
```

## 7. Dégradés et voile

```bash
npx expo install expo-linear-gradient expo-blur expo-system-ui expo-crypto
```

## 8. Qualité

```bash
npm install --save-dev eslint eslint-config-expo prettier
```

`eslint.config.js` étend `eslint-config-expo/flat`, qui embarque les règles du
compilateur React — celles-là mêmes qui ont fait remonter, sur ce projet, deux
`setState` synchrones dans des effets et une lecture de ref pendant le rendu.

## 9. Variables d'environnement

```bash
cp .env.example .env
```

Les quatre variables sont optionnelles. **Sans `EXPO_PUBLIC_SUPABASE_URL`,
l'application tourne entièrement sur les mocks de `src/mocks`** : les trois
écrans sont navigables, le potluck s'assigne, l'Oracle se trace.

## 10. Lancer

```bash
npm start          # Metro + QR code
npm run ios        # simulateur iOS (macOS requis)
npm run android    # émulateur Android
npm run web        # copie canvaskit.wasm puis démarre le web
```

Vérifications :

```bash
npm run typecheck
npm run lint
npm test          # règles pures, via le lanceur de tests de Node
```

`npm test` s'appuie sur `node --experimental-strip-types` : pas de Jest, pas de
transpilation — ces fonctions n'ont besoin d'aucun environnement de rendu. Un
crochet de résolution (`scripts/alias-loader.mjs`) apprend à Node l'alias `@/`,
ce qui rend les fixtures testables sans les recopier.

---

## Le cas du web

Skia est natif sur iOS et Android. Sur le web, c'est un binaire WebAssembly de
8 Mo qu'il faut servir soi-même :

```bash
npm run canvaskit   # copie node_modules/canvaskit-wasm/.../canvaskit.wasm → public/
```

Le fichier n'est pas versionné. `src/lib/skiaWeb.ts` le charge **sans bloquer le
démarrage** : si CanvasKit tarde ou ne vient pas, l'onglet Oracle affiche
« graphique indisponible » et le reste de l'app fonctionne normalement.

---

## Vérifier le schéma Supabase

Le schéma et ses politiques RLS se testent sans compte Supabase, contre un
PostgreSQL local :

```bash
initdb -D /tmp/ssc && pg_ctl -D /tmp/ssc -o '-p 55432' start
createdb -p 55432 ssc

# Doublures des objets fournis par la plateforme
psql -p 55432 -d ssc -c "create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as \$\$ select null::uuid \$\$;"

psql -p 55432 -d ssc -v ON_ERROR_STOP=1 -f supabase/migrations/20260905120000_init.sql
psql -p 55432 -d ssc -f supabase/tests/schema_test.sql
```

Le dernier fichier vérifie douze comportements : la course sur une ligne de
potluck, le gel d'un call publié, le scellement d'une prédiction, la validation
de forme d'un tracé. Voir `supabase/README.md`.

Avec la CLI Supabase, c'est plus court :

```bash
npx supabase init && npx supabase start
npx supabase db reset      # applique migrations + seed.sql
```

---

## Connexion

Le club est fermé : `signInWithOtp` est appelé avec `shouldCreateUser: false`,
donc seules les adresses déjà présentes dans `auth.users` reçoivent un code.
Pour ajouter un membre, créer l'utilisateur côté Supabase (tableau de bord ou
`auth.admin.createUser`) ; sa ligne `profiles` sera créée par l'app à sa
première connexion, avec la première couleur libre de la palette.

Sans variables Supabase, la garde de route ne s'active pas et l'app démarre
directement sur les mocks.

---

## Rafraîchissement des prix

La fonction Edge `refresh-prices` et sa planification `pg_cron` sont décrites
dans `supabase/functions/README.md`. Elle est le seul écrivain légitime de
`tickers.current_price`, et interroge deux fournisseurs : CoinGecko pour les
cryptos, **Yahoo Finance** pour les actions et ETF — la même source que le
dashboard JCGI.

Aucune clé n'est nécessaire pour Yahoo. Il refuse en revanche les requêtes sans
`User-Agent` crédible : c'est la cause la plus fréquente d'un 403 autrement
inexplicable.
