/**
 * Spary : protections de sécurité (audit du 19/10/2026).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Securite », coller ce code.
 * Le placer EN DERNIER dans la liste des fichiers (sous Entrainements et sous tout autre fichier .gs).
 * Ne modifier aucun autre fichier.
 *  1. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *  2. Exécuter secVerifier : le journal doit afficher « OK ».
 *  3. Exécuter secScannerFormules une fois et lire le journal (voir plus bas).
 *
 * Ce que ça fait :
 *  1. Injection de formules : tout texte reçu qui commence par « = » est enregistré avec « ＝ » (signe égal
 *     pleine chasse, identique à l'œil). Avant, un membre pouvait écrire « =Comptes!D2 » dans un champ
 *     (sport d'une séance postée, prénom…) : Google Sheets exécutait la formule et l'appli renvoyait
 *     l'e-mail, le téléphone ou la date de naissance d'autres membres.
 *  2. Même protection pour le prénom recopié dans l'onglet Sessions à chaque connexion.
 *  3. Refus des requêtes de plus de 150 Ko avant tout traitement.
 *  4. Mesure d'audience (action hit, sans connexion) plafonnée à SEC.HITS_PER_HOUR par heure : un robot
 *     ne peut plus remplir le classeur (limite Google : 10 millions de cellules, l'appli entière s'arrêterait).
 *  5. Limites de fréquence sur pushSubscribe, reviewSkip et interestAdd (ajout de lignes sans limite jusqu'ici).
 *  6. (lot 2) « Mot de passe oublié » plafonné à 30 demandes par heure en tout (protège le quota Resend).
 *  7. (lot 2) Abonnements push : seulement vers les vrais services de notification (Google, Apple, Mozilla, Microsoft).
 *  8. (lot 2) Sauvegarde automatique de BDD Spary chaque dimanche (4 dernières gardées) et contrôle quotidien
 *     qui t'écrit à contact@spary.fr seulement si quelque chose cloche. Lancer secInstaller une fois.
 *
 * Aucun secret dans ce fichier. Ne touche à aucune donnée existante, sauf si tu lances secNeutraliserFormules.
 */

var SEC = {
  installed: false,
  MAX_BYTES: 150000,
  HITS_PER_HOUR: 1000,                         // à relever si le trafic réel dépasse ~300 visites par heure
  KEEP: { password: 1, oldPassword: 1, newPassword: 1 },   // jamais modifiés (hachés, jamais stockés en clair)
  LIMITS: { pushSubscribe: [30, 3600], reviewSkip: [60, 3600], interestAdd: [20, 3600] },
  PWF_PER_HOUR: 30,                            // demandes « mot de passe oublié » par heure, tous comptes confondus
  PUSH_HOSTS: /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)\//i,
  BACKUPS_KEEP: 4,                             // sauvegardes hebdomadaires gardées (environ un mois)
  CELLS_ALERT: 7000000,                        // alerte quand le classeur approche la limite Google de 10 millions de cellules
  wrapper: null
};

/** « =… » → « ＝… » (les espaces de tête sont gardés). */
function secNeutre_(s) { return typeof s === "string" ? s.replace(/^(\s*)=/, "$1＝") : s; }

/** Copie de la requête où chaque texte est neutralisé. flag.changed passe à true si quelque chose a changé. */
function secClean_(v, depth, flag) {
  if (typeof v === "string") { var n = secNeutre_(v); if (n !== v) flag.changed = true; return n; }
  if (!v || typeof v !== "object" || depth > 8) return v;
  if (Array.isArray(v)) return v.map(function (x) { return secClean_(x, depth + 1, flag); });
  var o = {};
  Object.keys(v).forEach(function (k) { o[k] = depth === 0 && SEC.KEEP[k] ? v[k] : secClean_(v[k], depth + 1, flag); });
  return o;
}

/** Plafonds avant le traitement normal. Renvoie une réponse pour arrêter là, sinon null. */
function secGuard_(d) {
  var a = String(d.action || "");
  if (a === "hit") {
    var c = CacheService.getScriptCache(), k = "sec:hit:" + Math.floor(Date.now() / 3600000), n = Number(c.get(k) || 0);
    if (n >= SEC.HITS_PER_HOUR) {                              // comptage perdu, sans gêner le visiteur
      if (!c.get("sec:hitcap")) { c.put("sec:hitcap", "1", 21600); try { PropertiesService.getScriptProperties().setProperty("SEC_HITCAP", String(Date.now())); } catch (x) {} }
      return { status: "success" };
    }
    c.put(k, String(n + 1), 7200);
    return null;
  }
  if (a === "pwForgot") {
    var mp = rate_("sec:pwf:" + Math.floor(Date.now() / 3600000), SEC.PWF_PER_HOUR, 7200, "Beaucoup de demandes en ce moment. Réessayez dans une heure.");
    if (mp) return err_(mp);
  }
  if (a === "pushSubscribe" && !d.native) {
    var ep = String(d.sub && d.sub.endpoint || "");
    if (!SEC.PUSH_HOSTS.test(ep)) return err_("Abonnement invalide.");
  }
  var lim = SEC.LIMITS[a];
  if (lim && d.token) {
    var me = sessionUser_(d.token);
    if (me) {
      var m = rate_("sec:" + a + ":" + String(me.pseudo).toLowerCase(), lim[0], lim[1], "Trop de demandes en peu de temps. Réessayez plus tard.");
      if (m) return err_(m);
    }
  }
  return null;
}

function secInstall_() {
  if (SEC.installed || typeof doPost !== "function") return;
  SEC.installed = true;

  var prev = doPost;
  SEC.wrapper = function (e) {
    var raw = e && e.postData && typeof e.postData.contents === "string" ? e.postData.contents : "";
    if (raw.length > SEC.MAX_BYTES) return out_(err_("Requête trop volumineuse."));
    var data = null;
    try { data = JSON.parse(raw); } catch (x) {}
    if (!data || typeof data !== "object" || Array.isArray(data)) return prev(e);
    try { var stop = secGuard_(data); if (stop) return out_(stop); }
    catch (x) { try { console.error("sec garde " + (x && x.message || x)); } catch (y) {} }
    var flag = { changed: false }, clean = secClean_(data, 0, flag);
    if (!flag.changed) return prev(e);
    var body = JSON.stringify(clean);
    try { e.postData.contents = body; } catch (x) {}
    if (e.postData.contents !== body) {                     // objet en lecture seule : on passe une copie
      var e2 = {};
      try { Object.keys(e).forEach(function (k) { e2[k] = e[k]; }); } catch (x) {}
      e2.postData = { contents: body, length: body.length, type: e.postData.type, name: e.postData.name };
      e = e2;
    }
    return prev(e);
  };
  doPost = SEC.wrapper;

  // Le prénom est recopié de Comptes vers Sessions à chaque connexion : jamais de « = » en tête.
  if (typeof createSession_ === "function") {
    var baseCreate = createSession_;
    createSession_ = function (pseudo, name) { return baseCreate(pseudo, secNeutre_(String(name == null ? "" : name))); };
  }
}
secInstall_();

/* ===================== Outils à lancer depuis l'éditeur ===================== */

/** Vérifie l'installation et compte les mots de passe encore en clair. */
function secVerifier() {
  if (!SEC.installed) return console.log("PROBLÈME : le fichier Securite n'est pas chargé.");
  if (doPost !== SEC.wrapper) return console.log("PROBLÈME : le fichier Securite doit être placé EN DERNIER dans la liste des fichiers (menu ⋮ du fichier > Déplacer vers le bas).");
  var clair = 0;
  try {
    var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) { var v = String(rows[i][7] || ""); if (v && v.indexOf("hmac$") !== 0 && v.indexOf("sha256$") !== 0) clair++; }
  } catch (x) {}
  console.log("OK : protections actives. Pense à publier une Nouvelle version du déploiement.");
  console.log(clair ? "ATTENTION : " + clair + " mot(s) de passe encore en clair. Exécute migratePasswords une fois." : "Mots de passe : tous hachés.");
}

/** Liste les cellules qui contiennent une formule ou un texte commençant par « = » (lecture seule). */
function secScannerFormules() { secScan_(false); }
/** Transforme ces cellules en texte inoffensif (« ＝… »). À lancer seulement après avoir lu le résultat du scan. */
function secNeutraliserFormules() { secScan_(true); }

function secCol_(n) { var s = ""; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function secScan_(fix) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), found = 0, fixed = 0;
  ss.getSheets().forEach(function (sh) {
    var last = sh.getLastRow(), cols = sh.getLastColumn();
    if (last < 2 || cols < 1) return;
    var rng = sh.getRange(2, 1, last - 1, cols), f = rng.getFormulas(), v = rng.getValues();
    for (var i = 0; i < f.length; i++) for (var j = 0; j < cols; j++) {
      var isF = !!f[i][j], isT = !isF && typeof v[i][j] === "string" && /^\s*=/.test(v[i][j]);
      if (!isF && !isT) continue;
      found++;
      if (found <= 200) console.log(sh.getName() + "!" + secCol_(j + 1) + (i + 2) + " → " + (isF ? "formule : " + f[i][j] : "texte : " + v[i][j]).slice(0, 140));
      if (fix) { sh.getRange(i + 2, j + 1).setValue(secNeutre_(isF ? f[i][j] : v[i][j])); fixed++; }
    }
  });
  console.log(found ? found + " cellule(s) trouvée(s)" + (fix ? ", " + fixed + " neutralisée(s)." : ". Si ce ne sont pas des formules que tu as ajoutées toi-même, lance secNeutraliserFormules.") : "OK : aucune formule dans les onglets de l'appli.");
}

/* ===================== Lot 2 : sauvegardes et contrôle quotidien ===================== */

/** À lancer UNE fois : crée les déclencheurs (sauvegarde le dimanche à 3 h, contrôle chaque jour à 7 h) et fait une première sauvegarde. */
function secInstaller() {
  ScriptApp.getProjectTriggers().forEach(function (t) { var h = t.getHandlerFunction(); if (h === "secSauvegarder" || h === "secControleQuotidien") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("secSauvegarder").timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).inTimezone("Europe/Paris").create();
  ScriptApp.newTrigger("secControleQuotidien").timeBased().everyDays(1).atHour(7).inTimezone("Europe/Paris").create();
  secSauvegarder();
  secControleQuotidien(true);
  console.log("OK : sauvegarde chaque dimanche (" + SEC.BACKUPS_KEEP + " gardées) et contrôle chaque matin installés.");
}

/** Copie complète de BDD Spary dans ton Drive. Les plus anciennes partent à la corbeille. */
function secSauvegarder() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), p = PropertiesService.getScriptProperties();
  var day = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd");
  var copy = ss.copy("Spary – Sauvegarde " + day + " (ne pas partager)");
  var ids = []; try { ids = JSON.parse(p.getProperty("SEC_BACKUPS") || "[]"); } catch (x) {}
  ids.push(copy.getId());
  while (ids.length > SEC.BACKUPS_KEEP) { var old = ids.shift(); try { DriveApp.getFileById(old).setTrashed(true); } catch (x) {} }
  p.setProperty("SEC_BACKUPS", JSON.stringify(ids));
  console.log("Sauvegarde créée : " + copy.getUrl());
}

/** Contrôle chaque matin. N'écrit à contact@spary.fr que si un problème est trouvé (ou si verbose). */
function secControleQuotidien(verbose) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), issues = [], cells = 0, formulas = 0;
  ss.getSheets().forEach(function (sh) {
    var last = sh.getLastRow(), cols = sh.getLastColumn();
    cells += Math.max(1, last) * Math.max(1, cols);
    if (last < 2 || cols < 1) return;
    var f = sh.getRange(2, 1, last - 1, cols).getFormulas();
    for (var i = 0; i < f.length; i++) for (var j = 0; j < cols; j++) if (f[i][j]) formulas++;
  });
  if (formulas) issues.push(formulas + " formule(s) dans les onglets de l'appli : lance secScannerFormules.");
  if (cells > SEC.CELLS_ALERT) issues.push("Le classeur utilise " + cells + " cellules sur 10 000 000 : il faut purger ou migrer.");
  try {
    var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), clair = 0;
    for (var k = 1; k < rows.length; k++) { var v = String(rows[k][7] || ""); if (v && v.indexOf("hmac$") !== 0 && v.indexOf("sha256$") !== 0) clair++; }
    if (clair) issues.push(clair + " mot(s) de passe en clair : lance migratePasswords.");
  } catch (x) {}
  var props = PropertiesService.getScriptProperties(), cap = Number(props.getProperty("SEC_HITCAP") || 0);
  if (cap && Date.now() - cap < 86400000) issues.push("Plafond de la mesure d'audience atteint dans les dernières 24 h (trafic réel en hausse ou robot).");
  if (!props.getProperty("PEPPER")) issues.push("Script Property PEPPER absente : NE PAS en recréer une, m'écrire tout de suite.");
  if (doPost !== SEC.wrapper) issues.push("Le fichier Securite n'est plus le dernier de la liste : le remettre en bas.");
  var ids = []; try { ids = JSON.parse(props.getProperty("SEC_BACKUPS") || "[]"); } catch (x) {}
  if (!ids.length) issues.push("Aucune sauvegarde enregistrée : lance secInstaller.");
  var txt = issues.length ? "Points à regarder :\n- " + issues.join("\n- ") : "Tout est normal (" + cells + " cellules utilisées).";
  console.log(txt);
  if ((issues.length || verbose === true) && typeof mail_ === "function" && typeof mailOn_ === "function" && mailOn_()) {
    mail_(CONTACT_MAIL, (issues.length ? "⚠️ " : "") + "Contrôle sécurité Spary", "<pre style=\"font-family:Arial,sans-serif;white-space:pre-wrap\">" + mailEsc_(txt) + "</pre>", txt);
  }
}

