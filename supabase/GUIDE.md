# Migration Spary → Supabase : préparation

Projet : `https://chaqyhfkccjpzqcmxpfg.supabase.co`
Rien ici ne touche le site en ligne, Code.gs ni les Apps Script actuels. La bascule se fera après la MAJ du dimanche 25/10.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `002_chat_seance.sql` | Chats de séance (canal « #id »). À passer après 001. Si tu relances 001 un jour, relance 002 juste après. |
| `001_schema.sql` | Tables, règles de sécurité (RLS), temps réel pour la messagerie. Testé sur PostgreSQL 16 (réexécutable). |
| `Migration.gs` + `appsscript.json` | Copie Sheets → Supabase dans un **nouveau** projet Apps Script, sans aucune écriture dans le classeur. |
| `functions/auth-login/index.ts` | Connexion unique : convertit le mot de passe à la 1re connexion, sans PEPPER ni hash copiés. |

## Étape 1 : vérifs dans le tableau de bord Supabase (5 min)

1. **Région** : Project Settings → General. Il faut `eu-west-3` (Paris) ou `eu-central-1` (Francfort). Si c'est une région US, supprime le projet et recrée-le en UE : la région ne se change pas après coup.
2. **Clés** : Project Settings → API Keys.
   - Clé **publishable** (`sb_publishable_…`, ou l'ancienne « anon ») : publique, elle ira dans le site. Tu peux me l'envoyer.
   - Clé **secret** (`sb_secret_…`, ou l'ancienne « service_role ») : elle contourne toutes les règles. Elle ne va **que** dans les Script Properties du projet Apps Script de migration (étape 3). Jamais dans le chat, le site, le dépôt ou un fichier.
   - Le mot de passe de la base choisi à la création : dans ton gestionnaire de mots de passe.
3. **DPA (RGPD)** : signe l'accord de traitement des données de Supabase (normalement dans Organization settings → Legal documents) **avant** d'y copier les vraies données.
4. **Auth** : Authentication → Sign In / Providers → Email : longueur minimale du mot de passe = **8** (comme aujourd'hui). Les rares comptes avec un mot de passe plus court recevront un lien « nouveau mot de passe ».

## Étape 2 : créer les tables (2 min)

SQL Editor → New query → colle tout `001_schema.sql` → Run. Tu dois voir « Success. No rows returned ». Table Editor doit lister `members`, `messages`, etc.

## Étape 3 : copie de test des données (10 min)

1. Va sur script.new (nouveau projet, **pas** celui du site). Nomme-le « Spary – Migration ».
2. Colle `Migration.gs` dans Code.gs de CE projet.
3. Paramètres du projet → coche « Afficher le fichier manifeste appsscript.json » → remplace son contenu par `appsscript.json`. Google demandera l'accès aux feuilles (il n'accorde pas de lecture seule pour ouvrir un classeur par son id) ; le script, lui, ne fait que lire.
4. Paramètres du projet → Script Properties :
   - `SUPABASE_URL` = `https://chaqyhfkccjpzqcmxpfg.supabase.co`
   - `SUPABASE_SECRET_KEY` = la clé secrète
   - `SHEET_ID` = `1nPo9S6h3a-lNwSnalX-zmGV8vJoqM14tDhRPc5vtHec` (BDD Spary)
5. Exécute `migVerifier` (autorise l'accès), puis `migCopier`. Le journal affiche « table : copiées/total » et les erreurs éventuelles. Envoie-moi ce journal.

Réexécutable autant de fois que voulu jusqu'à la bascule (pas de doublons). Ne pas la relancer **après** la bascule (elle réécraserait les profils).

Ce qui est copié : comptes (sans mot de passe), profils, messages, groupes, réactions, amis, fil, commentaires, likes, séances, inscriptions, liste d'attente, matchs, kudos, points, entraînements, coachs, abonnements push, blocages, bannis, signalements. Les autres onglets (avis, notes, parrainages, parcours, Apple…) partent bruts dans `legacy_rows`, invisibles côté site, et auront leur table au lot qui les concerne. Jamais copiés : mots de passe, Sessions, Jetons, PushFile.

## Mots de passe : conversion à la 1re connexion

Pas de copie des hash, le PEPPER reste dans les Script Properties de Google.
1. Le membre se connecte comme d'habitude sur le nouveau site.
2. `auth-login` demande à l'ancien Apps Script (action `login` existante) si le mot de passe est bon.
3. Si oui, il crée le compte Supabase avec ce même mot de passe et connecte le membre. Les fois suivantes, c'est Supabase seul.
4. Ceux qui ne reviennent pas : après ~3 mois, un e-mail « choisis un nouveau mot de passe », puis l'Apps Script peut être éteint.

L'ancien Apps Script doit donc rester en ligne (en lecture seule) pendant la période de transition.

## Suite (lots de bascule, après dimanche)

1. **Messagerie** (gain le plus visible) : messages en temps réel, « en train d'écrire », « vu », photos sur Supabase Storage.
2. **Séances + fil**.
3. **Le reste** + tâches serveur (rappels, push, Resend) en Edge Functions / cron, puis nettoyage des anciens blocs sp empilés.
4. **Bascule** en une soirée : dernière copie, site pointé sur Supabase, Sheets en lecture seule comme sauvegarde.

À faire au moment de la bascule (pas avant) :
- `_headers` : ajouter `https://chaqyhfkccjpzqcmxpfg.supabase.co` et `wss://chaqyhfkccjpzqcmxpfg.supabase.co` à `connect-src`, et l'URL Storage à `img-src`.
- Politique de confidentialité : ajouter Supabase (voir ci-dessous).
- Déployer `auth-login` (Edge Functions) avec le secret `LEGACY_SCRIPT_URL` = l'URL /exec actuelle.

### Paragraphe confidentialité (brouillon)

> **Hébergement des données.** Les données de ton compte (profil, messages, séances, publications) sont hébergées par Supabase Inc. sur des serveurs situés dans l'Union européenne (région [Paris/Francfort]). Supabase agit comme sous-traitant de Spary dans le cadre d'un accord de traitement des données (article 28 du RGPD). Supabase étant une société américaine, d'éventuels accès depuis les États-Unis sont encadrés par les clauses contractuelles types de la Commission européenne.

## Points d'attention

- Plan gratuit : un projet inactif est mis en pause au bout d'environ 7 jours (les données restent, on le relance d'un clic). Sans gravité pendant la préparation, mais il faudra le plan Pro pour le lancement. Tarifs à vérifier sur supabase.com/pricing.
- Photos : les photos de profil et d'annonces (base64 dans Sheets) sont copiées telles quelles (`avatar_legacy`, `image_legacy`) ; elles passeront sur Storage au lot messagerie.
- Règle adulte → mineur en message privé : à remettre côté serveur au lot messagerie (aujourd'hui dans Nouveautes.gs).
