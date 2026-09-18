# Gabarits de courriel

À coller dans **Supabase → Authentication → Emails**.

| Fichier | Gabarit Supabase | Sujet conseillé |
|---|---|---|
| `magic-link.html` | **Magic Link** | `Votre code d'entrée au Cryptos Club` |

## Le point qui casse tout

Le gabarit **Magic Link** par défaut de Supabase contient `{{ .ConfirmationURL }}` :
il envoie un **lien**. L'app attend un **code à six chiffres**, soit `{{ .Token }}`.

Tant que le gabarit n'est pas changé, le membre reçoit un lien qui ne le
connecte pas, et l'écran attend six chiffres qu'il n'a jamais reçus.

C'est le même OTP des deux côtés : seul l'affichage change.

## Pourquoi le code, et pas le lien

Sur iOS, un lien de courriel s'ouvre dans **Safari**, jamais dans une app
installée sur l'écran d'accueil. La session atterrirait dans le stockage de
Safari — que la PWA installée ne voit pas. Le membre se croirait connecté et
retomberait sur l'écran d'entrée, sans comprendre.

Le code se tape dans l'app, quel que soit l'appareil où le courriel est ouvert.

Par sécurité, l'app consomme quand même les jetons d'un lien lorsqu'elle tourne
dans un onglet ordinaire (`detectSessionInUrl` sur le web) : un membre qui
clique malgré tout n'atterrit pas sur un écran inerte.

## Les autres gabarits

Ils ne servent pas : le club est fermé (`shouldCreateUser: false`), donc ni
inscription, ni invitation, ni changement d'adresse ne partent de l'app.
