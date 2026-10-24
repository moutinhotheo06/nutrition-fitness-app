# Spary → Supabase : mise en place

Principe : le code serveur actuel (tous les fichiers Apps Script, lots 27 à 30 compris) tourne tel quel sur Supabase, dans une fonction « api ». Les données de BDD Spary sont copiées dans Postgres. Le site ne change que d'adresse serveur. Réponses en 10 à 50 ms au lieu de 1 à 3 s.

Tant que la partie B n'est pas faite, spary.fr reste sur Google : rien ne change pour les membres.

Fichiers (dossier `supabase/bascule/`) :
- `004_gas.sql` : les tables
- `api-index.ts` : la fonction serveur (un seul fichier)
- `Migration.gs` + `appsscript.json` : la copie des données (projet « Spary – Migration »)
- `spary-site-supabase.zip` : le site (lot 31) branché sur Supabase
- `005_cron.sql` : les tâches planifiées (seulement le jour de la bascule)
- `Relais.gs` : le relais Apps Script (seulement le jour de la bascule)

---

## A. Copie de test (spary.fr n'est pas touché)

### 1. Les tables (2 min)
Supabase → SQL Editor → New query → coller tout `004_gas.sql` → Run. Résultat attendu : « Success. No rows returned ».

### 2. La fonction « api » (5 min)
Supabase → Edge Functions → **Deploy a new function** → **Via Editor**.
- Nom : `api` (exactement).
- Supprimer le code d'exemple, coller tout le contenu de `api-index.ts` dans `index.ts`.
- Deploy.
- Puis dans la fonction → **Details** (ou Settings) → désactiver **Enforce JWT verification** (« Verify JWT ») → Save. Sans ça, le site reçoit une erreur 401.

### 3. Les secrets (10 min)
Ouvre en parallèle le projet Apps Script **du site** → Paramètres du projet (roue dentée) → Propriétés du script.
Supabase → Edge Functions → **Secrets** → ajouter, pour chaque propriété qui existe chez Google, la même valeur avec le préfixe `GAS_` :

| Supabase (nom du secret) | Valeur copiée depuis la propriété |
|---|---|
| `GAS_PEPPER` | `PEPPER` (indispensable : sans lui, plus personne ne peut se connecter) |
| `GAS_RESEND_API_KEY` | `RESEND_API_KEY` |
| `GAS_MAIL_FROM` | `MAIL_FROM` |
| `GAS_SITE_URL` | `SITE_URL` |
| `GAS_VAPID_PRIVATE` | `VAPID_PRIVATE` |
| `GAS_VAPID_PUBLIC` | `VAPID_PUBLIC` |
| `GAS_FCM_SERVICE_ACCOUNT` | `FCM_SERVICE_ACCOUNT` (notifs iPhone, tout le texte JSON) |
| `GAS_GIPHY_KEY` | `GIPHY_KEY` |
| `GAS_APPLE_KEY_ID`, `GAS_APPLE_P8`, `GAS_APPLE_TEAM_ID`, `GAS_APPLE_WEB_CLIENT_ID` | les 4 propriétés `APPLE_…` |
| `GAS_STATS_SALT` | `STATS_SALT` |

Ne pas copier : `SEC_BACKUPS`, `SEC_HITCAP`, `RGPD_AVERTIS`, `STATS_SHEET_ID`, `STRIPE_…`, `SP34_FOLDER` (ce dernier sert à l'étape 4).
Ne colle jamais ces valeurs dans le chat.

Le serveur refuse de démarrer les mots de passe ou les notifications s'il manque `GAS_PEPPER` ou les `GAS_VAPID_…` : c'est voulu, il ne crée jamais de nouvelle clé à leur place.

### 4. Copier les données (5 min)
Projet Apps Script **Spary – Migration** (celui de la première copie) :
- Remplacer tout `Migration.gs` par la nouvelle version.
- Paramètres du projet → cocher « Afficher le fichier manifeste appsscript.json » → remplacer son contenu par le nouveau `appsscript.json` (droit de lecture Drive pour les photos des messages).
- Propriétés du script → ajouter `SP34_FOLDER` = la valeur de `SP34_FOLDER` du projet du site.
- Exécuter **migMoteur** → accepter l'autorisation. Le journal liste chaque onglet copié, puis les photos.

On peut relancer migMoteur autant de fois qu'on veut : il remplace la copie par l'état actuel de BDD Spary.

### 5. Site de test (Netlify, ≈ 15 crédits)
Netlify → Add new site → Deploy manually → déposer `spary-site-supabase.zip`. Tu obtiens une adresse en `….netlify.app`.
Sur l'iPhone, ouvre cette adresse dans Safari, connecte-toi avec ton compte et teste : fil, message, séance, entraînement, profil, notifications.
Attention : c'est une copie des vraies données avec les vraies clés. Un message envoyé à un vrai membre lui envoie une vraie notif. Teste avec ton compte et un compte de test.

---

## B. Bascule (le soir, quand peu de monde est connecté, ≈ 15 min)

1. Projet Spary – Migration → exécuter **migMoteur** (copie finale).
2. Tout de suite après : projet Apps Script du site → ajouter le fichier **Relais** (`Relais.gs`, en dernier) → Déployer → Gérer les déploiements → crayon → Nouvelle version → exécuter `relaisVerifier` (doit afficher OK). À partir de là, les anciennes versions du site écrivent aussi dans Supabase.
3. Projet Apps Script du site → Déclencheurs (horloge à gauche) → supprimer tous les déclencheurs (rappels, RGPD, sauvegarde, contrôle, stats) : Supabase prend le relais.
4. Supabase → SQL Editor → coller `005_cron.sql` → Run. Les deux tâches `spary-quart` et `spary-purge` doivent s'afficher.
5. Netlify → site spary.fr → Deploys → déposer `spary-site-supabase.zip`.
6. Vérifier sur l'iPhone (appli et Safari) : connexion, message, notif.

L'appli iPhone charge spary.fr : pas de nouveau build nécessaire.

Retour arrière possible à tout moment : redéposer sur Netlify le zip du lot 31 et retirer le fichier Relais (nouvelle version du déploiement). Les écritures faites entre-temps restent dans Supabase.

## Ce qui change ou reste à savoir
- Spary Admin lit directement le Google Sheet : après la bascule il affichera l'état figé du jour de la bascule. À rebrancher sur Supabase ensuite.
- Le classeur « Spary – Statistiques » n'est plus mis à jour (les visites restent enregistrées dans Supabase).
- La sauvegarde hebdo Google Drive est remplacée par un historique : une copie de chaque onglet par heure, gardée 14 jours (table `gas_history`).
- Politique de confidentialité du zip mise à jour : données hébergées chez Supabase à Francfort.
