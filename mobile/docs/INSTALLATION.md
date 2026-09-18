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

Sur [supabase.com](https://supabase.com) → **New project**. Région : Europe
(Francfort ou Paris) — le club est ici, la latence s'en ressent. Notez le mot de
passe de la base, il ne réapparaît plus.

### 1.2 Appliquer le schéma

```bash
cd mobile
npx supabase link --project-ref <ref-du-projet>
npx supabase db push          # applique les deux migrations
```

`<ref-du-projet>` est la suite de lettres dans l'URL du tableau de bord.

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

```bash
npx supabase functions deploy refresh-prices
npx supabase functions deploy quote
```

`refresh-prices` met à jour les cours (CoinGecko pour les cryptos, Yahoo pour
les actions et ETF). `quote` sert la suggestion de prix du composer — dans un
navigateur, Yahoo est bloqué par CORS, et cette fonction est le relais.

Planifiez le rafraîchissement : voir `supabase/functions/README.md`.

### 1.5 Un vrai serveur d'envoi — **à faire avant d'essayer de se connecter**

Supabase limite son serveur partagé à **3 courriels par heure, tous membres
confondus**. Deux essais ratés et vous êtes bloqué une heure, avec
« email rate limit exceeded ». Pour sept membres qui s'inscrivent le même soir,
c'est intenable.

Ce quota ne s'applique **qu'au serveur partagé** : brancher le vôtre le supprime
immédiatement. Avec [Resend](https://resend.com) — gratuit jusqu'à 3 000
courriels par mois, sans carte bancaire :

1. Créez un compte, puis une **API key**.
2. Sans nom de domaine, gardez l'expéditeur de test `onboarding@resend.dev` —
   suffisant pour démarrer. Avec un domaine, vérifiez-le d'abord.
3. Supabase → **Project Settings** → **Authentication** → **SMTP Settings** →
   *Enable Custom SMTP* :

   | Champ | Valeur |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | votre clé API Resend |
   | Sender email | `onboarding@resend.dev` (ou votre domaine) |
   | Sender name | `Cryptos Club` |

4. Plus bas, **Rate Limits** → passez l'envoi de courriels à 30 par heure.

Le blocage saute dès l'enregistrement — pas besoin d'attendre la fin de l'heure.

### 1.6 Le gabarit de courriel — **l'étape qu'on oublie**

**Authentication** → **Emails** → gabarit **Magic Link**.

Le gabarit par défaut de Supabase contient `{{ .ConfirmationURL }}` : il envoie
un **lien**. L'app attend un **code à six chiffres**, soit `{{ .Token }}`.

Collez le contenu de `supabase/templates/magic-link.html` — **le balisage seul**,
sans commentaire d'en-tête : le moteur de gabarits traite tout, y compris ce qui
est entre `<!-- -->`. Sujet : `Votre code d'entrée au Cryptos Club`.

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

### 1.7 Autoriser votre adresse de publication

**Authentication** → **URL Configuration** → ajoutez dans *Redirect URLs* :

```
https://<votre-compte>.github.io/dashboard/club/
```

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

```bash
npm run build:web
npm run deploy
```

Le premier construit l'app dans `dist/` ; le second la copie dans `club/` à la
racine du dépôt. Puis :

```bash
cd ..
git add club && git commit -m "Club : nouvelle version" && git push
```

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
4. Le nom proposé est « Cryptos Club » → **Ajouter**.

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
20 % de l'icône, et sans cette marge « CRYPTOS CLUB » se ferait couper.

---

## Quand ça coince

| Ce que vous voyez | Ce qui se passe |
|---|---|
| Le courriel contient un **lien**, pas un code | Le gabarit Magic Link est resté celui par défaut → §1.6 |
| Le courriel arrive **vide** | Le gabarit a été réécrit par le client de messagerie. Prenez `magic-link-minimal.html`, et ne collez jamais le commentaire d'en-tête |
| « Cette adresse n'est pas sur la liste du club. » | Aucun compte pour cette adresse → §1.3. Le club est fermé, personne ne s'auto-inscrit |
| « Trop de codes demandés. Réessayez dans une heure. » | Les 3 courriels/heure du serveur partagé sont épuisés. Brancher un SMTP (§1.5) lève le blocage **immédiatement**, sans attendre |
| Aucun courriel, aucune erreur | Regardez **Authentication → Logs** dans Supabase : l'envoi y apparaît, réussi ou non |
| Connecté dans Safari, mais l'app installée redemande le code | Deux stockages distincts. C'est normal, et c'est pourquoi le code prime sur le lien |
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
