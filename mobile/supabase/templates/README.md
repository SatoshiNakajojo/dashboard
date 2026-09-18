# Gabarits de courriel

À coller dans **Supabase → Authentication → Emails**, gabarit **Magic Link**.

| Fichier | Quand l'utiliser |
|---|---|
| `magic-link.html` | Par défaut — aux couleurs du club |
| `magic-link-minimal.html` | Si le précédent arrive vide. Trois lignes, rien qui puisse casser |

Sujet conseillé : `Votre code d'entrée au Cryptos Club`

## Le point qui casse tout

Le gabarit **Magic Link** par défaut de Supabase contient `{{ .ConfirmationURL }}` :
il envoie un **lien**. L'app attend un **code à six chiffres**, soit `{{ .Token }}`.

C'est le même OTP des deux côtés : seul l'affichage change.

## Coller le balisage, rien d'autre

Ces fichiers commencent **directement par le balisage**. Ne collez jamais de
commentaire d'en-tête dans l'éditeur Supabase : le moteur de gabarits traite
tout le contenu, y compris ce qui est entre `<!-- -->`.

## Pourquoi du tableau et pas du `div`

Un courriel n'est pas une page web. Les clients de messagerie — Gmail en tête —
réécrivent le HTML qu'ils reçoivent : ils suppriment les balises `<style>`,
ignorent `border-radius`, et maltraitent la notation raccourcie `font:`. Un
gabarit écrit comme une page arrive parfois **vide**.

D'où les règles suivies ici, qui sont celles de tout courriel transactionnel :

- mise en page en `<table>`, jamais en `<div>` imbriqués ;
- `bgcolor` en **attribut** en plus du CSS — certains clients n'honorent que lui ;
- `font-family` et `font-size` séparés, jamais `font:` ;
- aucune police externe : `Courier`, `Georgia`, `Arial` existent partout ;
- aucun `border-radius`, ignoré par Outlook.

## Vérifier avant d'envoyer

L'éditeur Supabase affiche un aperçu. **Regardez-le avant de sauvegarder** : le
quota de courriels est limité, et chaque essai raté en consomme un.

## Pourquoi le code, et pas le lien

Sur iOS, un lien de courriel s'ouvre dans **Safari**, jamais dans une app
installée sur l'écran d'accueil. La session atterrirait dans le stockage de
Safari — que la PWA installée ne voit pas. Le membre se croirait connecté et
retomberait sur l'écran d'entrée, sans comprendre.

Le code se tape dans l'app, quel que soit l'appareil où le courriel est ouvert.

Par sécurité, l'app consomme quand même les jetons d'un lien lorsqu'elle tourne
dans un onglet ordinaire (`detectSessionInUrl` sur le web).

## Les autres gabarits

Ils ne servent pas : le club est fermé (`shouldCreateUser: false`), donc ni
inscription, ni invitation, ni changement d'adresse ne partent de l'app.
