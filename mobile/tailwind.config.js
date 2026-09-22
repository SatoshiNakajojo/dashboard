/**
 * Jetons de design du Satoshi Social Club — README §4.
 * Les valeurs sont définitives : ne pas « arrondir » une couleur ou un rayon.
 * Le letter-spacing reste en px (RN n'accepte pas les `em`), via `tracking-[…]`.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
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
        avatarTop: '#241D14',
        avatarBottom: '#14100B',
        avatarRing: '#33291B',
        grid: '#16120D',
      },
      fontFamily: {
        display: 'Marcellus_400Regular',
        serif: 'Fraunces_400Regular',
        serifItalic: 'Fraunces_400Regular_Italic',
        sans: 'PlusJakartaSans_400Regular',
        sansMed: 'PlusJakartaSans_500Medium',
        sansSemi: 'PlusJakartaSans_600SemiBold',
        mono: 'JetBrainsMono_400Regular',
        monoMed: 'JetBrainsMono_500Medium',
        monoSemi: 'JetBrainsMono_600SemiBold',
      },
      borderRadius: {
        // 4 px pour les cartes, 2 px pour boutons et puces — jamais plus (SPEC §7).
        card: '4px',
        button: '2px',
        sheet: '20px',
        sheetBottom: '39px',
      },
    },
  },
  plugins: [],
};
