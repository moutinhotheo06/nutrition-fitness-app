# Spary Admin : installation (10 min, gratuit, aucun crédit Netlify)

La plateforme est un **projet Apps Script à part**, sur ton compte Google. Elle ne touche ni l'appli, ni Code.gs, ni aucun fichier du projet Spary, et n'écrit jamais dans BDD Spary.
- Accès : ton compte Google uniquement (réglage « Seulement moi »). Pas de mot de passe à gérer.
- Trafic : lu dans BDD Spary en lecture seule, **totaux uniquement** (aucun nom, pseudo ou e-mail ne sort).
- Tes saisies (clubs, édito, échéances, lots, retours bêta) : classeur « Spary – Admin » créé tout seul dans ton Drive.

## 1. Créer le projet
1. Ouvre https://script.google.com → **Nouveau projet** → renomme-le **Spary Admin**.
2. Fichier `Code.gs` déjà présent : efface tout, colle **tout `Admin.gs`**, enregistre (⌘S).
3. **+** à côté de « Fichiers » → **HTML** → nomme-le exactement **Index** (sans .html) → efface tout, colle **tout `Index.html`**, enregistre.

## 2. Installer
1. En haut, choisis la fonction **admInstaller** → **Exécuter** → accepte les autorisations (Google Sheets).
2. Le journal doit afficher deux lignes **OK** (classeur créé, 39 lignes préremplies : lots 16 à 25, échéances, 13 clubs fondateurs, mail nouveautés).
3. Choisis **admVerifier** → Exécuter. Il affiche le nombre de membres et dit si les visites sont enregistrées.

## 3. Mettre en ligne (privé)
1. **Déployer → Nouveau déploiement** → roue dentée → **Application Web**.
2. Exécuter en tant que : **Moi**. Qui a accès : **Seulement moi**. → **Déployer**.
3. Copie l'URL qui finit par `/exec` : c'est ta plateforme.
4. iPhone : ouvre l'URL dans Safari → Partager → **Sur l'écran d'accueil**.

Mise à jour plus tard : Déployer → Gérer les déploiements → crayon → **Nouvelle version** (l'URL ne change pas).

Si la page affiche une erreur alors que tu es connecté : tu es sans doute connecté à **plusieurs comptes Google** dans ce navigateur (limite connue d'Apps Script). Ouvre l'URL en navigation privée, ou déconnecte les autres comptes.

## Trafic : les visites ne sont pas enregistrées aujourd'hui
BDD Spary n'a **aucun onglet « Visites » ni « Actifs »** (vérifié le 22/10). Le site envoie bien chaque visite au serveur, mais rien n'est stocké : le fichier Apps Script **Stats** du lot 6 est absent ou inactif dans le projet de l'appli.
La plateforme marche sans (inscriptions, membres actifs, séances, matchs, messages, publications, sports, canaux d'inscription) ; seules les cartes Visites, Sources, Écrans et Appareils restent masquées.

Pour l'activer (projet Apps Script **de l'appli**, Code.gs inchangé, aucun dépôt Netlify) :
1. Regarde si un fichier **Stats** existe dans la liste.
   - S'il existe : lance `sp17Verifier` et lis le journal (il dit quoi corriger).
   - Sinon : **+ → Script** → nomme-le **Stats** → colle `front/nouveautes/lot6-stats/Stats.txt` → place-le **juste sous Terrain** (Securite reste le dernier).
2. Lance `sp17Installer` (accepte les autorisations), puis Déployer → Gérer les déploiements → crayon → **Nouvelle version**.
3. Le lendemain, la carte Visites de la plateforme se remplit.

## Ce que fait chaque page
- **Accueil** : chiffres clés, échéances des 14 jours, relances clubs, posts de la semaine, lot en cours, raccourcis (spary.fr, Netlify, Apps Script, Resend, App Store Connect).
- **Trafic** : 7 j / 30 j / 90 j / 12 mois, évolution vs la période d'avant, analyse écrite automatiquement, courbes, conversion, canaux, sports.
- **Clubs** : pipeline (À contacter → Partenaire), relances datées, recherche, lien « Écrire à… ».
- **Édito** : calendrier du mois par canal, à venir, banque d'idées (publication sans date).
- **Échéances** : en retard / semaine / plus tard / sans date, case « fait », calendrier.
- **Lots & bêta** : historique des lots, retours bêta par gravité et statut.

Le bouton **spary.fr ↗** est en haut de chaque page (sur ordi : en bas du menu).
