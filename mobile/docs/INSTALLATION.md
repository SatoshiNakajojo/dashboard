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

### 1.5 Autoriser votre adresse de publication

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

> **Le code n'arrive pas ?** Supabase limite les envois à **3 courriels par
> heure** avec son serveur de test. Pour sept membres qui s'inscrivent le même
> soir, c'est trop peu : configurez un vrai serveur SMTP dans
> **Authentication → Emails** (Resend, Postmark, Brevo — l'offre gratuite suffit
> largement pour sept personnes).

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
