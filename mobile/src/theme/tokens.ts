/**
 * Jetons de design — miroir TypeScript de `tailwind.config.js`.
 *
 * Deux consommateurs ne passent pas par NativeWind et ont besoin des valeurs
 * brutes : Skia (qui peint des couleurs, pas des classes) et les dégradés
 * `expo-linear-gradient`. Toute couleur ajoutée ici doit l'être aussi dans
 * `tailwind.config.js`, et inversement.
 */

export const c = {
  ink: '#0A0806',
  surface: '#12100C',
  surfaceDeep: '#0D0B08',
  surfaceLock: '#13100B',
  sheet: '#0F0D09',
  hairline: '#1A1510',
  border: '#1E1811',
  borderStrong: '#221B12',
  borderLift: '#241E14',
  borderSheet: '#2A2218',
  dial: '#3A2F1E',
  gold: '#E8903D',
  goldLight: '#F0A055',
  goldDeepEnd: '#D07520',
  goldDeep: '#B86415',
  goldMuted: '#A8692F',
  goldGlow: '#FFB36B',
  goldTint: '#FFCEA0',
  onGold: '#1A1206',
  ivory: '#F2EBDD',
  bone: '#E9E1D2',
  parchment: '#C9BCA4',
  sepia: '#8C7F68',
  sepiaDim: '#9A8F7B',
  sepiaMuted: '#6D6455',
  sepiaFaint: '#5C5446',
  sage: '#6E9A78',
  oxblood: '#B3574F',
  oxbloodMuted: '#9A5450',
  onAvatar: '#12100C',
  grid: '#16120D',
} as const;

/** Couleurs à opacité — le HTML de référence les écrit en `rgba()`. */
export const a = {
  cardBorderOpen: 'rgba(232,144,61,.26)',
  lockOpen: 'rgba(232,144,61,.35)',
  lockClosed: 'rgba(179,87,79,.35)',
  rsvpGoldBg: 'rgba(232,144,61,.10)',
  rsvpGoldBorder: 'rgba(232,144,61,.42)',
  rsvpSageBg: 'rgba(110,154,120,.10)',
  rsvpSageBorder: 'rgba(110,154,120,.40)',
  pressed: 'rgba(232,144,61,.06)',
  btcFillTop: 'rgba(232,144,61,.22)',
  btcFillBottom: 'rgba(232,144,61,0)',
  // Le même dégradé, décomposé : un `<Stop>` SVG veut une couleur et une
  // opacité séparées, et `rgba()` dans `stopColor` n'est pas portable.
  btcFillColor: '#E8903D',
  btcFillTopOpacity: 0.22,
  btcFillBottomOpacity: 0,
  btcHalo: 'rgba(232,144,61,.16)',
  nowHalo: 'rgba(232,144,61,.18)',
  scrim: 'rgba(6,5,3,.62)',
  fameRule: 'rgba(168,128,47,.5)',
  rektRule: 'rgba(154,84,80,.5)',
} as const;

/**
 * Trois familles, trois rôles qui ne s'échangent pas.
 *
 * Le serif d'affichage était Instrument Serif. Mesuré sur fond noir, ses
 * pleins s'amincissent jusqu'à disparaître : c'est une police de magazine,
 * faite pour de l'encre sur du papier. Fraunces tient le même registre avec
 * des fûts qui survivent au fond sombre, et sa chaleur de vieille affiche
 * répond au badge du club mieux qu'un didone.
 *
 * Elle est en revanche **1,42 fois plus large** à taille égale — Instrument
 * Serif est exceptionnellement étroite, et aucune police plus solide ne
 * l'égale sur ce point. Les tailles d'affichage ont donc été reprises là où
 * la largeur comptait ; ce n'est pas un détail qu'on peut remettre à plus
 * tard sans voir des titres déborder.
 */
export const f = {
  /**
   * La police des grands titres, et d'eux seuls.
   *
   * Marcellus est un roman inscriptionnel : la gravité d'une inscription
   * gravée, qui répond au sceau du club mieux qu'un serif de texte. Elle n'a
   * pas d'italique — raison pour laquelle elle ne remplace pas Fraunces, qui
   * continue de porter les titres de cartes, les thèses en italique et les
   * états vides.
   *
   * Une famille d'affichage et une famille de texte : c'est la hiérarchie que
   * l'app n'avait pas.
   */
  display: 'Marcellus_400Regular',
  serif: 'Fraunces_400Regular',
  serifItalic: 'Fraunces_400Regular_Italic',
  sans: 'PlusJakartaSans_400Regular',
  sansMed: 'PlusJakartaSans_500Medium',
  sansSemi: 'PlusJakartaSans_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMed: 'JetBrainsMono_500Medium',
  monoSemi: 'JetBrainsMono_600SemiBold',
} as const;

export const radius = { card: 4, button: 2, sheetTop: 20, sheetBottom: 39 } as const;

/** Gouttière horizontale d'écran (README §4.6). */
export const gutter = 22;

/** Dégradé de carte : 180°, `#12100C → #0D0B08`. */
export const cardGradient = [c.surface, c.surfaceDeep] as const;

/**
 * Approximation linéaire du dégradé radial or (₿ du bandeau, FAB).
 * README §8.3 : l'écart est admis sur 22 px et 48 px.
 */
export const goldRadial = [c.goldGlow, c.gold, c.goldDeep] as const;
export const goldRadialLocations = [0, 0.6, 1] as const;

/** Bouton primaire de la sheet : 180°, `#F0A055 → #D07520`. */
export const goldButtonGradient = [c.goldLight, c.goldDeepEnd] as const;

/** Couleurs de classe d'actif — README §4.2. */
export const ASSET_CLASSES = ['BTC', 'ALT', 'ACTION', 'ETF', 'DEGEN'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const assetClassStyle: Record<AssetClass, { fg: string; bg: string; border: string }> = {
  BTC: { fg: '#E8903D', bg: 'rgba(232,144,61,.10)', border: 'rgba(232,144,61,.40)' },
  ACTION: { fg: '#8FA8B8', bg: 'rgba(143,168,184,.09)', border: 'rgba(143,168,184,.30)' },
  ETF: { fg: '#9A8CB8', bg: 'rgba(154,140,184,.09)', border: 'rgba(154,140,184,.30)' },
  ALT: { fg: '#9A8F7B', bg: 'rgba(154,143,123,.08)', border: '#2A2218' },
  DEGEN: { fg: '#B3574F', bg: 'rgba(179,87,79,.09)', border: 'rgba(179,87,79,.32)' },
};

/** Puce de classe non sélectionnée dans le composer. */
export const assetClassIdle = { fg: c.sepiaMuted, bg: 'transparent', border: c.border };

/** Seuils de couleur du statut d'une prédiction (README §5.4). */
export function gapColor(gapPercent: number): string {
  if (gapPercent < 4) return c.sage;
  if (gapPercent <= 8) return c.gold;
  return c.oxblood;
}

/** Vert sauge si positif, oxblood sinon — jamais de vert ou rouge vif. */
export function perfColor(value: number): string {
  return value >= 0 ? c.sage : c.oxblood;
}
