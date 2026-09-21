# Installer l'app sur les téléphones du club

Une PWA, comme le dashboard JCGI : on l'ouvre dans le navigateur, on l'ajoute à
l'écran d'accueil, et elle s'ouvre ensuite en plein écran sans barre d'adresse.
Pas d'App Store, pas de compte développeur, pas de mise à jour à installer — les
membres reçoivent la nouvelle version à la prochaine ouverture.

Trois étapes : le backend, la publication, l'installation.

---

## 1. Le backend Supabase (une fois, ~20 min)

C'est lui qui rend l'app multi-membres : sans lui, chacun verrait ses propres
données dans son coin.

### 1.1 Créer le projet

Sur [supabase.com](https://supabase.com) → **New project**.

**Région : `ap-southeast-2` — Oceania (Sydney).** Le club est en
Nouvelle-Calédonie, et le câble sous-marin de Nouméa atterrit à Sydney : c'est
littéralement le premier endroit où vos paquets touchent terre. Comptez 30 à
50 ms, contre 200 et plus pour Mumbai, Singapour ou l'Europe — qui passent tous
par Sydney de toute façon, avant de repartir à l'autre bout du monde.

Ça se voit sur la checklist potluck, faite pour réagir au doigt et se
synchroniser entre sept personnes dans la même pièce.

**La région ne se change pas après coup** : il faut recréer le projet. Autant
la choisir juste maintenant, quand la base est vide.

Notez le mot de passe de la base, il ne réapparaît plus.

### 1.2 Appliquer le schéma

```bash
cd mobile
npx supabase link --project-ref <ref-du-projet>
npx supabase db push          # applique les migrations de supabase/migrations/
```

`<ref-du-projet>` est la suite de lettres dans l'URL du tableau de bord.

`db push` est à relancer après chaque `git pull` qui apporte une migration —
`npm run check:supabase` (§1.8) signale une table ou une colonne manquante.

Pour charger les données de démonstration (les trois Crypto Nights, les calls,
les classements) — pratique pour voir l'app vivante avant d'y mettre les vraies :

```bash
npx supabase db execute --file supabase/seed.sql
```

### 1.3 Créer les membres

Le club est **fermé** : `signInWithOtp` est appelé avec `shouldCreateUser: false`,
donc seules les adresses déjà inscrites reçoivent un code. Personne ne peut
s'auto-inviter.

Dans le tableau de bord Supabase → **Authentication** → **Users** →
**Add user** → *Create new user*, pour chacun des sept membres. Cochez
**Auto Confirm User** : sans cela, le membre devra confirmer son adresse avant
de pouvoir se connecter.

Leur ligne `profiles` — initiales, couleur — est créée par l'app à leur première
connexion, quand ils saisissent leur prénom. Rien à faire à la main.

> Si vous avez chargé le seed, ses sept comptes fictifs existent déjà. Supprimez-les
> avant d'ajouter les vrais, sinon les couleurs de la palette seront prises.

### 1.4 Publier les fonctions

Depuis `mobile/`, **une ligne à la fois** — le sélecteur de projet est
interactif et avalerait les lignes collées à sa suite. `<ref>` est
l'identifiant qui figure dans l'URL du projet.

Si vous ne savez plus où est le dépôt, cette commande le trouve depuis
n'importe où :

```bash
find ~ -maxdepth 5 -type d -name mobile -not -path '*/node_modules/*' 2>/dev/null
```

Puis, **depuis ce dossier** (le raccourci ci-dessous suppose que vous y êtes
déjà, ou ailleurs dans le dépôt) :

```bash
cd "$(git rev-parse --show-toplevel)/mobile"

npx supabase functions deploy refresh-prices --project-ref <ref>
npx supabase functions deploy quote --project-ref <ref>

REFRESH_SECRET="$(openssl rand -hex 24)"; echo "$REFRESH_SECRET"
npx supabase secrets set REFRESH_SECRET="$REFRESH_SECRET" --project-ref <ref>
```

`refresh-prices` met à jour les cours (CoinGecko pour les cryptos, Yahoo pour
les actions et ETF). `quote` sert la suggestion de prix du composer — dans un
navigateur, Yahoo est bloqué par CORS, et cette fonction est le relais.

Le secret n'est pas facultatif : sans lui, `refresh-prices` refuse de tourner.
Elle écrit en base et appelle deux API externes ; la laisser joignable avec la
seule clé anon, qui est publiée dans le bundle, reviendrait à offrir le point
d'entrée. D'où le `echo` : la planification a besoin de la valeur en clair, et
`supabase secrets list` ne montre qu'une empreinte.

Planifiez le rafraîchissement : voir `supabase/functions/README.md`.

### 1.5 Un vrai serveur d'envoi — **rien d'autre ne marche sans lui**

Ce n'est pas une optimisation, c'est un verrou. Tant que le serveur partagé de
Supabase est en place, **les gabarits de courriel sont en lecture seule** :

> Set up custom SMTP to edit templates. Emails will be sent using the default
> templates.

Les champs *Subject* et *Body* de §1.6 sont grisés, et Supabase envoie son
gabarit par défaut — celui qui contient un **lien**. L'app attend un code. Sans
SMTP, la connexion du club ne peut donc pas fonctionner, quoi qu'on colle dans
l'écran des gabarits.

Le serveur partagé plafonne par ailleurs à **3 courriels par heure**, tous
membres confondus : deux essais ratés et vous êtes bloqué une heure, avec
« email rate limit exceeded ». Ce quota ne s'applique qu'à lui.

Avec [Resend](https://resend.com) — gratuit jusqu'à 3 000 courriels par mois,
sans carte bancaire :

1. Créez un compte, puis une **API key**.
2. Supabase → **Authentication** → **Emails** → bouton *Set up SMTP* (ou
   l'onglet **SMTP**) → *Enable Custom SMTP* :

   | Champ | Valeur |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | votre clé API Resend |
   | Sender email | voir ci-dessous |
   | Sender name | `Satoshi Social Club` |

3. Plus bas, **Rate Limits** → passez l'envoi de courriels à 30 par heure.

#### L'expéditeur décide qui peut recevoir

`onboarding@resend.dev` est l'expéditeur de test de Resend. Il fonctionne sans
nom de domaine, mais **Resend ne le laisse écrire qu'à l'adresse du titulaire
du compte**. Vous recevrez vos codes ; les six autres membres n'en recevront
aucun, sans erreur visible de votre côté.

Pour ouvrir le club à tout le monde, il faut un domaine vérifié dans Resend
(**Domains** → *Add domain*, puis trois enregistrements DNS) et un expéditeur
du type `club@votredomaine.fr`.

Sans domaine sous la main, n'importe quel SMTP qui écrit à tout le monde fera
l'affaire — un compte Gmail avec un *mot de passe d'application*
(`smtp.gmail.com`, port 465, votre adresse en nom d'utilisateur) suffit
largement pour sept membres.

Le blocage saute dès l'enregistrement — pas besoin d'attendre la fin de l'heure.

### 1.6 Le gabarit de courriel — **l'étape qu'on oublie**

**Authentication** → **Emails** → gabarit **Magic Link**.

> Les champs sont grisés et un bandeau réclame un SMTP&nbsp;? Revenez à §1.5 :
> sans serveur d'envoi à vous, ce gabarit ne s'édite pas.

Le gabarit par défaut de Supabase contient `{{ .ConfirmationURL }}` : il envoie
un **lien**. L'app attend un **code à six chiffres**, soit `{{ .Token }}`.

Collez le contenu de `supabase/templates/magic-link.html` — **le balisage seul**,
sans commentaire d'en-tête : le moteur de gabarits traite tout, y compris ce qui
est entre `<!-- -->`. Sujet : `Votre code d'entrée au Satoshi Social Club`.

**Regardez l'aperçu avant de sauvegarder.** Chaque essai raté consomme un
courriel de votre quota. Si le courriel arrive malgré tout vide, prenez
`magic-link-minimal.html` : trois lignes, rien qui puisse casser.

> Un courriel n'est pas une page web : les clients de messagerie réécrivent le
> HTML qu'ils reçoivent. D'où la mise en page en tableaux et les `bgcolor` en
> attribut — voir `supabase/templates/README.md`.

> **Pourquoi le code plutôt que le lien** — sur iOS, un lien de courriel s'ouvre
> dans Safari, jamais dans une app installée sur l'écran d'accueil. La session
> atterrirait dans le stockage de Safari, que la PWA ne voit pas : le membre se
> croirait connecté et retomberait sur l'écran d'entrée.

### 1.7 Dire à Supabase où vit l'app

**Authentication** → **URL Configuration**. Deux champs, et le premier est
celui qu'on oublie.

**Site URL** — remplacez `http://localhost:3000` par :

```
https://<votre-compte>.github.io/dashboard/club/
```

C'est là que Supabase renvoie quiconque clique un lien de courriel. Laissé au
défaut, le membre reçoit un courriel parfaitement valide dont le lien ouvre
`localhost` sur son téléphone : rien. Aucune erreur, aucune trace, et le
courriel a l'air d'être le coupable alors qu'il est irréprochable.

**Redirect URLs** — ajoutez la même adresse.

> Avec le gabarit de §1.6, l'app se connecte par code et le lien ne sert plus.
> Réglez quand même le *Site URL* : un membre cliquera le lien, et il vaut
> mieux qu'il arrive quelque part.

### 1.8 Vérifier, plutôt que de chercher

Sept écrans du tableau de bord viennent d'être touchés. Une case oubliée ne se
voit pas tout de suite : elle se manifeste plus tard, par un courriel qui
n'arrive pas ou une liste vide. Une commande pose toutes les questions à votre
place :

```bash
cd mobile
npm run check:supabase
```

Elle lit le même `.env` que la build — ce qu'elle teste est donc exactement ce
que l'app utilisera — et répond point par point : tables présentes, RLS active,
connexion par courriel ouverte, inscription fermée, fonctions déployées. Chaque
manque arrive avec son remède.

```
Schéma
  ✓ profiles                présente, fermée aux visiteurs
  ✗ predictions             absente
    → appliquez supabase/migrations/20260905120000_init.sql
```

Elle n'affiche aucune clé et se contente de la clé `anon`. Ajoutez
`SUPABASE_SERVICE_ROLE_KEY=…` dans `.env` — **sans** le préfixe
`EXPO_PUBLIC_`, qui la publierait — pour qu'elle compte aussi les membres.

Elle n'écrit rien : les deux fonctions Edge sont sondées avec un jeton qu'elles
refusent, et ce refus est précisément la preuve qu'elles sont déployées.

Trois choses lui restent hors de portée, et elle vous le dit en terminant : le
gabarit de courriel (§1.6), le SMTP (§1.5), et les tables publiées en temps
réel — pour celles-ci, collez dans le **SQL Editor** :

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```

Attendu : `potluck_items`, `event_attendees`, `ticker_votes`, `tickers`.

Lancez-la aussi après chaque déploiement : elle relit `club/` pour s'assurer
qu'aucune clé secrète n'est partie en ligne.

---

## 2. Publier (à refaire à chaque nouvelle version)

### 2.1 Les variables d'environnement

```bash
cd mobile
cp .env.example .env
```

Remplissez les deux premières, lues dans **Project Settings → API** :

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

La clé `anon` est **faite pour être publique** : c'est la RLS qui protège les
données, pas le secret de cette clé. Ne mettez jamais la clé `service_role`
ici — elle contourne la RLS.

### 2.2 Construire et déployer

Depuis n'importe quel dossier du dépôt :

```bash
cd "$(git rev-parse --show-toplevel)" && git pull && npm --prefix mobile install
npm --prefix mobile run build:web && npm --prefix mobile run deploy
```

La première ligne n'est pas une politesse : sans elle, on reconstruit le code
qu'on a déjà publié, `club/` ressort identique, et `git commit` répond
« nothing added to commit » — ce qui ressemble à un déploiement réussi.

**Et construisez depuis la branche que GitHub Pages sert**, `main` (§2.3). Si
le travail est sur une autre branche, fusionnez-la d'abord : sinon `git pull`
réussit, la build réussit, le commit réussit — et le site ne bouge pas, parce
que Pages ne regarde pas cette branche.

```bash
git checkout main && git pull
git merge origin/<la-branche-de-travail> && git push
```

`build:web` construit l'app dans `mobile/dist/` ; `deploy` la copie dans
`club/`, à la racine du dépôt, et refuse de publier un document sans ses
balises PWA. Relisez, puis :

```bash
git add club && git commit -m "Club : nouvelle version" && git push
```

Si `git commit` répond « nothing added to commit », c'est que rien n'a changé
depuis la dernière publication — remontez d'une étape, le `git pull` a-t-il
bien tourné ?

### 2.3 Activer GitHub Pages (une fois)

Dépôt → **Settings** → **Pages** → *Source : Deploy from a branch*, branche
`main`, dossier `/ (root)`. Le dashboard JCGI reste à la racine, l'app du club
vit dans `/club/` — les deux cohabitent sur la même Page.

Comptez deux ou trois minutes avant que l'adresse réponde :

```
https://<votre-compte>.github.io/dashboard/club/
```

> Si vous publiez ailleurs (Cloudflare Pages, Netlify), changez
> `experiments.baseUrl` dans `app.json` — `"/"` pour une racine de domaine — et
> reconstruisez.

---

## 3. Installer sur le téléphone

### iPhone — Safari uniquement

Chrome et Firefox sur iOS **ne savent pas** installer une PWA ; ils utilisent le
moteur de Safari mais pas son menu d'installation.

1. Ouvrir l'adresse dans **Safari**.
2. Bouton **Partager** (le carré avec la flèche, en bas).
3. Faire défiler → **Sur l'écran d'accueil**.
4. Le nom proposé est « Satoshi Social Club » → **Ajouter**.

L'icône apparaît sur l'écran d'accueil. À l'ouverture, plus de barre d'adresse :
l'app occupe l'écran, encoche comprise.

### Android — Chrome

1. Ouvrir l'adresse dans **Chrome**.
2. Une bannière « Installer l'application » apparaît souvent d'elle-même.
3. Sinon : menu **⋮** → **Ajouter à l'écran d'accueil** / **Installer
   l'application**.

### Se connecter

Saisir son adresse → un code à six chiffres arrive par courriel → le saisir. Au
tout premier accès, l'app demande un prénom et crée le profil.

> **Le code n'arrive pas ?** Voyez « Quand ça coince » plus bas, et
> **Authentication → Logs** dans Supabase : chaque envoi y apparaît, réussi ou non.

---

## Mettre à jour

Rejouez `npm run build:web && npm run deploy`, commitez, poussez. Les membres
reçoivent la nouvelle version à la prochaine ouverture : le service worker sert
la coquille en réseau d'abord, et ne retombe sur son cache que hors-ligne.

Il n'active jamais une version de force pendant qu'on s'en sert — c'est
volontaire, et c'est la leçon inscrite dans le service worker du dashboard JCGI
(commentaire #140) : l'activation forcée fait recharger une PWA iOS en boucle.

---

## Changer le logo

Les icônes — PWA, écran d'accueil iOS, icône adaptative Android, splash, écran
de connexion — sortent toutes d'un seul fichier :

```bash
# remplacez assets/brand/logo-source.jpg, puis :
python3 scripts/make-icons.py
npm run build:web && npm run deploy
```

Le script recadre au disque, compose sur le fond encre, et produit chaque taille.
La version *maskable* est volontairement plus petite : Android rogne jusqu'à
20 % de l'icône, et sans cette marge « SATOSHI SOCIAL CLUB » se ferait couper.

---

## Quand ça coince

| Ce que vous voyez | Ce qui se passe |
|---|---|
| Le courriel contient un **lien**, pas un code | Le gabarit Magic Link est resté celui par défaut → §1.6. Et s'il refuse de se modifier, c'est le SMTP qui manque → §1.5 |
| Vous recevez vos codes, pas les autres membres | L'expéditeur `onboarding@resend.dev` n'écrit qu'au titulaire du compte Resend. Vérifiez un domaine → §1.5 |
| « Ce code est expiré ou incorrect » devant un code tout frais | Vérifiez la longueur du code reçu. L'app accepte de six à dix chiffres depuis la correction ; une version antérieure tronquait à six et envoyait un code amputé. Au besoin, **Sign In / Providers → Email → Email OTP Length** |
| Le lien du courriel ne mène nulle part | *Site URL* est resté sur `http://localhost:3000` → §1.7. `npm run check:supabase` le lit et le signale |
| Le courriel arrive **vide** | Le gabarit a été réécrit par le client de messagerie. Prenez `magic-link-minimal.html`, et ne collez jamais le commentaire d'en-tête |
| « Cette adresse n'est pas sur la liste du club. » | Aucun compte pour cette adresse → §1.3. Le club est fermé, personne ne s'auto-inscrit |
| « Trop de codes demandés. Réessayez dans une heure. » | Les 3 courriels/heure du serveur partagé sont épuisés. Brancher un SMTP (§1.5) lève le blocage **immédiatement**, sans attendre |
| Aucun courriel, aucune erreur | Regardez **Authentication → Logs** dans Supabase : l'envoi y apparaît, réussi ou non |
| Une liste reste vide alors que la base contient des lignes | `npm run check:supabase` (§1.8) : le plus souvent une migration non appliquée, ou la connexion qui n'a jamais abouti |
| Connecté dans Safari, mais l'app installée redemande le code | Deux stockages distincts. C'est normal, et c'est pourquoi le code prime sur le lien |
| Connecté, mais « Aucune session prévue » | La base est vide et l'app ne sait pas créer de soirée. Collez `mobile/supabase/first-night.sql` dans le SQL Editor |
| Tout a réussi, mais le site ne change pas | Vous avez construit depuis une branche que GitHub Pages ne sert pas. Fusionnez dans `main`, puis reconstruisez → §2.2 |
| L'app s'ouvre avec une barre d'adresse | Le document publié n'a pas ses balises PWA. `npm run deploy` le vérifie et refuse désormais de publier sans |
| Écran blanc sur l'Oracle | CanvasKit n'a pas pu se charger. Vérifiez que `canvaskit.wasm` est bien dans `club/` |

## Limites connues de la PWA

À dire aux membres, pour qu'ils ne les prennent pas pour des pannes :

- **Pas de notifications push sur iOS** avant iOS 16.4, et seulement une fois
  l'app ajoutée à l'écran d'accueil. L'app n'en envoie pas aujourd'hui.
- **iOS peut purger les données** d'un site web inutilisé pendant sept jours.
  Une app installée sur l'écran d'accueil y échappe — raison de plus pour
  l'installer plutôt que de garder l'onglet.
- **Premier chargement lourd.** Le moteur graphique de l'Oracle (CanvasKit)
  pèse 8 Mo. Il est mis en cache après la première ouverture — conseillez le
  Wi-Fi pour l'installation.
- **Safari en navigation privée** n'enregistre pas la session : il faut se
  reconnecter à chaque ouverture.
