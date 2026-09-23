# Polices

Celles du dashboard JCGI : **Cinzel** (titres d'écran), **Cormorant Garamond**
(chiffres, titres de carte, italique) et **Inter** (texte et libellés). Rôles
détaillés dans `src/theme/tokens.ts`.

Ce sont des **sous-ensembles latins** des fichiers de Google Fonts, sous licence
SIL Open Font License 1.1 (textes joints : `OFL-*.txt`, aucun nom réservé). Les
versions complètes pesaient 2,1 Mo, cyrillique, grec et vietnamien compris ;
celles-ci 0,9 Mo.

Pour les régénérer (fontTools) :

```bash
npm install --no-save @expo-google-fonts/cinzel @expo-google-fonts/cormorant-garamond @expo-google-fonts/inter
UNI="U+0000-00FF,U+0100-017F,U+0192,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20A0-20CF,U+2122,U+2190-21FF,U+2212,U+2215,U+2248,U+2260,U+2264,U+2265,U+25CF"
pyftsubset node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf \
  --unicodes="$UNI" --layout-features='*' --output-file=assets/fonts/Inter-500.ttf
# … de même pour Inter 400 et 600, Cormorant Garamond 500 et 500 italique, Cinzel 600.
```

`--layout-features='*'` garde les chiffres tabulaires (`tnum`) : les montants
et le compte à rebours s'alignent grâce à eux.
