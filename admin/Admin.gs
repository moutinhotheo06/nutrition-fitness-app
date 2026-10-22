/**
 * Spary Admin : plateforme privée de pilotage (trafic, clubs, édito, échéances, lots et retours bêta).
 *
 * PROJET APPS SCRIPT SÉPARÉ (« Spary Admin »), distinct du projet de l'appli :
 * il ne touche ni Code.gs ni aucun autre fichier de Spary, et n'écrit JAMAIS dans BDD Spary.
 *  - Lecture seule de BDD Spary, uniquement pour calculer des TOTAUX (aucun pseudo, e-mail ou nom ne sort d'ici).
 *  - Ce que tu saisis (clubs, édito, échéances, lots, retours) va dans un classeur à part : « Spary – Admin ».
 *  - Accès : déploiement « Exécuter en tant que : moi » + « Qui a accès : seulement moi ».
 *    Seul ton compte Google peut ouvrir la page. Aucun mot de passe, aucune clé dans ce fichier.
 *
 * INSTALLATION : voir GUIDE.md (5 minutes).
 */

var ADM = {
  TZ: "Europe/Paris",
  BDD_DEFAULT: "1nPo9S6h3a-lNwSnalX-zmGV8vJoqM14tDhRPc5vtHec",   // BDD Spary (lecture seule)
  DAYS: 400,                                                      // historique renvoyé à la page
  CACHE_S: 300,
  STATS_VERSION: 1
};

/** Les 5 tables saisies dans la plateforme. L'ordre des colonnes = l'ordre dans le classeur. */
var ADM_TABLES = {
  clubs:     { sheet: "Clubs",     cols: ["id", "nom", "type", "ville", "sport", "contact", "email", "tel", "site", "statut", "relance", "derniere", "notes", "maj"] },
  edito:     { sheet: "Edito",     cols: ["id", "date", "canal", "format", "sujet", "statut", "lien", "notes", "maj"] },
  deadlines: { sheet: "Deadlines", cols: ["id", "titre", "date", "categorie", "fait", "notes", "maj"] },
  lots:      { sheet: "Lots",      cols: ["id", "numero", "nom", "statut", "date", "appsScript", "contenu", "maj"] },
  retours:   { sheet: "Retours",   cols: ["id", "date", "source", "appareil", "retour", "gravite", "statut", "lot", "maj"] }
};

/* ===================== Page ===================== */

function doGet() {
  admGuard_();
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Spary Admin")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover")
    .addMetaTag("apple-mobile-web-app-capable", "yes");
}

/** Double sécurité en plus du réglage « seulement moi » : la page ne répond qu'au propriétaire du script. */
function admGuard_() {
  var me = "", owner = "";
  try { me = String(Session.getActiveUser().getEmail() || "").toLowerCase(); } catch (x) {}
  try { owner = String(Session.getEffectiveUser().getEmail() || "").toLowerCase(); } catch (x) {}
  if (!me || !owner || me !== owner) throw new Error("Accès refusé.");
}

/** Tout ce dont la page a besoin au chargement. */
function admBootstrap() {
  admGuard_();
  var out = { tables: {}, stats: null, statsError: "", now: admDay_(Date.now()), sheetUrl: "" };
  var ss = admBook_();
  out.sheetUrl = ss.getUrl();
  Object.keys(ADM_TABLES).forEach(function (k) { out.tables[k] = admRows_(ss, k); });
  try { out.stats = admStats_(false); } catch (e) { out.statsError = String(e && e.message || e); }
  return out;
}

function admRefreshStats() {
  admGuard_();
  return admStats_(true);
}

/* ===================== Saisie (classeur « Spary – Admin ») ===================== */

function admBook_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty("ADMIN_SHEET_ID"), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (x) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create("Spary – Admin");
    p.setProperty("ADMIN_SHEET_ID", ss.getId());
  }
  return ss;
}

function admSheet_(ss, key) {
  var t = ADM_TABLES[key];
  var sh = ss.getSheetByName(t.sheet);
  if (!sh) {
    sh = ss.insertSheet(t.sheet);
    sh.getRange(1, 1, 1, t.cols.length).setValues([t.cols]).setFontWeight("bold");
    sh.setFrozenRows(1);
    // Tout en texte brut : les dates « 2026-10-22 » restent des textes, rien n'est interprété.
    sh.getRange(1, 1, sh.getMaxRows(), t.cols.length).setNumberFormat("@");
  }
  return sh;
}

function admCell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ADM.TZ, "yyyy-MM-dd");
  v = v === null || v === undefined ? "" : String(v);
  return /^'[=+\-@\t]/.test(v) ? v.slice(1) : v;   // retire l'apostrophe de protection si Sheets l'a gardée
}

function admRows_(ss, key) {
  var t = ADM_TABLES[key], sh = admSheet_(ss, key), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, t.cols.length).getValues()
    .filter(function (r) { return String(r[0] || "") !== ""; })
    .map(function (r) { var o = {}; t.cols.forEach(function (c, i) { o[c] = admCell_(r[i]); }); return o; });
}

/** Neutralise les formules (=, +, -, @ en tête) : le texte est enregistré tel quel. */
function admSafe_(v) {
  v = String(v === null || v === undefined ? "" : v).replace(/\r\n?/g, "\n").slice(0, 4000);
  return /^[=+\-@\t]/.test(v) ? "'" + v : v;
}

function admLocked_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Serveur occupé, réessaie dans quelques secondes.");
  try { return fn(); } finally { try { lock.releaseLock(); } catch (x) {} }
}

/** Crée ou modifie une ligne. Renvoie la ligne enregistrée. */
function admSave(key, obj) {
  admGuard_();
  var t = ADM_TABLES[key];
  if (!t || !obj || typeof obj !== "object") throw new Error("Données invalides.");
  return admLocked_(function () {
    var ss = admBook_(), sh = admSheet_(ss, key), row = {}, isNew = !obj.id;
    t.cols.forEach(function (c) { row[c] = String(obj[c] === null || obj[c] === undefined ? "" : obj[c]).slice(0, 4000); });
    if (isNew) row.id = Utilities.getUuid().slice(0, 8);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(row.id)) throw new Error("Identifiant invalide.");
    row.maj = Utilities.formatDate(new Date(), ADM.TZ, "yyyy-MM-dd HH:mm");
    var values = [t.cols.map(function (c) { return admSafe_(row[c]); })];
    var at = isNew ? -1 : admFind_(sh, row.id);
    if (at < 1) {
      at = sh.getLastRow() + 1;
      if (at > sh.getMaxRows()) { sh.insertRowsAfter(sh.getMaxRows(), 200); sh.getRange(1, 1, sh.getMaxRows(), t.cols.length).setNumberFormat("@"); }
    }
    sh.getRange(at, 1, 1, t.cols.length).setValues(values);
    return row;
  });
}

function admDelete(key, id) {
  admGuard_();
  if (!ADM_TABLES[key]) throw new Error("Table inconnue.");
  return admLocked_(function () {
    var sh = admSheet_(admBook_(), key), at = admFind_(sh, String(id || ""));
    if (at > 0) sh.deleteRow(at);
    return { ok: true };
  });
}

function admFind_(sh, id) {
  var n = sh.getLastRow() - 1;
  if (n < 1 || !id) return -1;
  var ids = sh.getRange(2, 1, n, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return -1;
}

/* ===================== Statistiques (BDD Spary, lecture seule, totaux) ===================== */

function admDay_(ms) { return Utilities.formatDate(new Date(ms), ADM.TZ, "yyyy-MM-dd"); }

/** Convertit une valeur de cellule en millisecondes (Date, ms, « 22/10/2026 », « 2026-10-22 »…). 0 si illisible. */
function admMs_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? 0 : v.getTime();
  if (typeof v === "number") return v > 1e11 && v < 1e14 ? v : 0;
  var s = String(v || "").trim();
  if (!s) return 0;
  if (/^\d{11,14}$/.test(s)) return Number(s);
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 12), Number(m[5] || 0)).getTime();
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0).getTime();
  var t = new Date(s).getTime();
  return isNaN(t) ? 0 : t;
}

function admBdd_() {
  var id = PropertiesService.getScriptProperties().getProperty("BDD_ID") || ADM.BDD_DEFAULT;
  return SpreadsheetApp.openById(id);
}

/** Lit quelques colonnes d'un onglet (numéros de colonne à partir de 1), sans le reste des données. */
function admCols_(ss, name, cols, header) {
  var sh = ss.getSheetByName(name);
  if (!sh) return null;
  var first = header ? 2 : 1, n = sh.getLastRow() - first + 1;
  if (n < 1) return [];
  var max = Math.max.apply(null, cols), min = Math.min.apply(null, cols);
  if (max > sh.getMaxColumns()) return null;
  var data = sh.getRange(first, min, n, max - min + 1).getValues();
  return data.map(function (r) { return cols.map(function (c) { return r[c - min]; }); });
}

function admTruthy_(v) {
  if (v === true) return true;
  return /^(oui|true|vrai|yes|1|x|ok)$/i.test(String(v || "").trim());
}

function admStats_(force) {
  var cache = CacheService.getScriptCache(), key = "adm:stats:" + ADM.STATS_VERSION;
  if (!force) {
    var hit = cache.get(key);
    if (hit) { try { return JSON.parse(hit); } catch (x) {} }
  }
  var now = Date.now(), from = admDay_(now - ADM.DAYS * 86400000), today = admDay_(now);
  var ss = admBdd_();
  var days = {}, sources = {}, canaux = {}, sports = {}, ecrans = {}, missing = [];
  function D(d) { return days[d] = days[d] || {}; }
  function add(d, k, n) { if (!d || d < from || d > today) return; var o = D(d); o[k] = (o[k] || 0) + (n || 1); }
  function inc(map, k, n) { map[k] = (map[k] || 0) + (n || 1); }

  // Comptes (« Feuille 1 ») : A date d'inscription, G pseudo, I newsletter, L dernière connexion, M e-mail vérifié.
  var totals = { membres: 0, verifies: 0, newsletter: 0, actifs1: 0, actifs7: 0, actifs30: 0, actifs90: 0, seances: 0, matchs: 0, coachs: 0, clubsPartenaires: 0 };
  var acc = admCols_(ss, "Feuille 1", [1, 7, 9, 12, 13], true);
  if (!acc) missing.push("Feuille 1");
  else acc.forEach(function (r) {
    if (String(r[1] || "").trim() === "") return;
    totals.membres++;
    if (admTruthy_(r[4])) totals.verifies++;
    if (/^oui$/i.test(String(r[2] || "").trim())) totals.newsletter++;
    var ms = admMs_(r[0]); if (ms) add(admDay_(ms), "ins");
    var last = admMs_(r[3]);
    if (last) {
      var age = (now - last) / 86400000;
      if (age < 1) totals.actifs1++;
      if (age < 7) totals.actifs7++;
      if (age < 30) totals.actifs30++;
      if (age < 90) totals.actifs90++;
    }
  });

  // Activité. Colonnes vérifiées sur les en-têtes de BDD Spary le 22/10/2026 (Messages et Annonces n'ont pas d'en-tête).
  [
    ["Seances", 14, true, "sea"], ["Inscriptions", 4, true, "par"], ["Matchs", 2, true, "mat"],
    ["Messages", 5, false, "msg"], ["Annonces", 7, false, "ann"], ["Commentaires", 6, true, "com"]
  ].forEach(function (s) {
    var rows = admCols_(ss, s[0], [s[1]], s[2]);
    if (!rows) { missing.push(s[0]); return; }
    rows.forEach(function (r) { var ms = admMs_(r[0]); if (ms) add(admDay_(ms), s[3]); });
    if (s[3] === "sea") totals.seances = rows.length;
    if (s[3] === "mat") totals.matchs = rows.length;
  });

  // Sports des séances (D sport, N créée).
  var sea = admCols_(ss, "Seances", [4, 14], true) || [];
  sea.forEach(function (r) {
    var ms = admMs_(r[1]), d = ms ? admDay_(ms) : "";
    if (d && d >= from) inc(sports, d + "|" + String(r[0] || "autre").slice(0, 40));
  });

  // Canal déclaré à l'inscription (A jour, B canal).
  var can = admCols_(ss, "SourcesInscription", [1, 2], true) || [];
  can.forEach(function (r) {
    var ms = admMs_(r[0]), d = ms ? admDay_(ms) : "";
    if (d && d >= from) inc(canaux, d + "|" + String(r[1] || "non précisé").slice(0, 40));
  });

  var coachs = ss.getSheetByName("Coachs"); if (coachs) totals.coachs = Math.max(0, coachs.getLastRow() - 1);
  var cp = ss.getSheetByName("ClubsPartenaires"); if (cp) totals.clubsPartenaires = Math.max(0, cp.getLastRow() - 1);

  // Visites (lot 6, fichier Stats) : A date ms | B jour | C nouvelle visite | D 1re du jour | E source | F appareil | G support | H écrans vus.
  var vis = admCols_(ss, "Visites", [1, 2, 3, 4, 5, 6, 7, 8], true);
  var hasVisits = !!vis && vis.length > 0;
  (vis || []).forEach(function (r) {
    var ms = admMs_(r[0]), d = ms ? admDay_(ms) : String(r[1] || "");
    if (!d || d < from) return;
    if (Number(r[2])) {
      add(d, "vis"); add(d, "dev_" + String(r[5] || "mobile")); add(d, "sup_" + String(r[6] || "web"));
      inc(sources, d + "|" + String(r[4] || "autre"));
    }
    if (Number(r[3])) add(d, "uni");
    if (r[7]) {
      try {
        var v = JSON.parse(r[7]);
        Object.keys(v).forEach(function (k) { var c = Number(v[k]) || 0; if (c) { add(d, "ecr", c); inc(ecrans, d + "|" + k, c); } });
      } catch (x) {}
    }
  });

  // Membres actifs distincts (onglet Actifs : jour | empreinte anonyme). On ne renvoie que des comptes.
  var act = admCols_(ss, "Actifs", [1, 2], true);
  var actifsDistinct = null;
  if (act && act.length) {
    actifsDistinct = {};
    [7, 30, 90].forEach(function (n) {
      var a1 = admDay_(now - n * 86400000), a2 = admDay_(now - 2 * n * 86400000), cur = {}, prev = {};
      act.forEach(function (r) {
        var ms = admMs_(r[0]), d = ms ? admDay_(ms) : String(r[0] || "");
        if (d > a1 && d <= today) cur[r[1]] = 1; else if (d > a2 && d <= a1) prev[r[1]] = 1;
      });
      actifsDistinct[n] = [Object.keys(cur).length, Object.keys(prev).length];
    });
  }

  var out = {
    updated: Utilities.formatDate(new Date(now), ADM.TZ, "dd/MM/yyyy HH:mm"), today: today, from: from,
    totals: totals, days: days, sources: sources, canaux: canaux, sports: sports, ecrans: ecrans,
    hasVisits: hasVisits, actifsDistinct: actifsDistinct, missing: missing
  };
  try { var s = JSON.stringify(out); if (s.length < 95000) cache.put(key, s, ADM.CACHE_S); } catch (x) {}
  return out;
}

/* ===================== Installation ===================== */

/** À exécuter UNE fois : crée le classeur « Spary – Admin », le préremplit et vérifie l'accès à BDD Spary. */
function admInstaller() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty("BDD_ID")) p.setProperty("BDD_ID", ADM.BDD_DEFAULT);
  var ss = admBook_();
  Object.keys(ADM_TABLES).forEach(function (k) { admSheet_(ss, k); });
  var def = ss.getSheetByName("Feuille 1") || ss.getSheetByName("Sheet1");
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  var added = admPrefill_(ss);
  var bdd = admBdd_().getName();
  console.log("OK : classeur « Spary – Admin » prêt (" + added + " lignes préremplies) → " + ss.getUrl());
  console.log("OK : lecture de « " + bdd + " » (totaux uniquement).");
  console.log("Étape suivante : Déployer → Nouveau déploiement → Application Web (Exécuter en tant que : moi ; Qui a accès : seulement moi).");
}

function admVerifier() {
  var st = admStats_(true);
  console.log("OK : " + st.totals.membres + " membres, " + st.totals.actifs7 + " actifs sur 7 jours.");
  console.log(st.hasVisits ? "OK : visites enregistrées (onglet Visites)." :
    "ATTENTION : aucun onglet « Visites » dans BDD Spary. Les visites ne sont pas enregistrées : voir GUIDE.md, partie Trafic.");
  if (st.missing.length) console.log("Onglets introuvables : " + st.missing.join(", "));
}

/** Ne remplit que les tables vides (relancer admInstaller n'écrase rien). */
function admPrefill_(ss) {
  var n = 0;
  function fill(key, rows) {
    if (admRows_(ss, key).length) return;
    var t = ADM_TABLES[key], sh = admSheet_(ss, key), stamp = Utilities.formatDate(new Date(), ADM.TZ, "yyyy-MM-dd HH:mm");
    var values = rows.map(function (o, i) {
      o.id = key.slice(0, 2) + (i + 1); o.maj = stamp;
      return t.cols.map(function (c) { return admSafe_(o[c] === undefined ? "" : o[c]); });
    });
    sh.getRange(2, 1, values.length, t.cols.length).setValues(values);
    n += values.length;
  }

  fill("lots", [
    { numero: "16", nom: "Performances", statut: "Déployé", date: "2026-10-20", appsScript: "1", contenu: "Séances détaillées par sport, karting (17 circuits), palmarès, notes des joueurs, verre liquide. Fichier Apps Script Performances." },
    { numero: "17", nom: "Ergonomie", statut: "Déployé", date: "2026-10-21", appsScript: "", contenu: "Clavier, champs, chronos, karting, profil." },
    { numero: "18", nom: "Ami facultatif", statut: "Déployé", date: "2026-10-21", appsScript: "", contenu: "« Avec un ami (facultatif) » dans le détail d'une séance." },
    { numero: "19", nom: "Parcours d'accueil", statut: "Déployé", date: "2026-10-21", appsScript: "1", contenu: "Parcours d'inscription, connexion Apple, partenaires, actus, agenda, badge. Fichier Apps Script Parcours." },
    { numero: "20", nom: "Séance en direct", statut: "Déployé", date: "2026-10-21", appsScript: "1", contenu: "Séance en direct pour 91 sports, écran verrouillé, Dynamic Island, Apple Watch. Fichier Apps Script Seances." },
    { numero: "21", nom: "Densité", statut: "Déployé", date: "2026-10-21", appsScript: "", contenu: "Mise en page plus dense." },
    { numero: "22", nom: "Retours bêta iPhone", statut: "Déployé", date: "2026-10-22", appsScript: "", contenu: "Corrections des retours bêta (clavier, confirmation e-mail, choix du sport, séance en direct). Build iOS Associated Domains." },
    { numero: "23", nom: "Post libre + badge fondateur", statut: "Déployé", date: "2026-10-22", appsScript: "1", contenu: "Post libre façon LinkedIn, badge doré Fondateur. Fichier Apps Script Posts." },
    { numero: "24", nom: "Identification", statut: "Déployé", date: "2026-10-22", appsScript: "1", contenu: "Identification façon Insta, lancement animé, tirer pour actualiser, glisser une séance, page notifs (sw v36). Fichier Apps Script Identification." },
    { numero: "25", nom: "Envoi instantané", statut: "Zip envoyé", date: "2026-10-22", appsScript: "", contenu: "Affichage immédiat (commentaires, séances, match, kudos, demandes d'ami). sw v37. À déposer regroupé avec le prochain lot (crédits Netlify)." },
    { numero: "", nom: "Migration Supabase", statut: "À faire", date: "", appsScript: "", contenu: "Pour le lancement officiel : fin des lenteurs Apps Script (1-3 s par requête)." }
  ]);

  fill("deadlines", [
    { titre: "Déposer le lot 25 sur Netlify", date: "", categorie: "Lot", fait: "", notes: "Regrouper avec le prochain lot (≈15 crédits par dépôt)." },
    { titre: "Crédits Netlify renouvelés", date: "2026-11-08", categorie: "Infra", fait: "", notes: "≈43 crédits restants le 22/10 après le lot 24." },
    { titre: "Refaire la clé APNs .p8 et la réimporter dans Firebase", date: "", categorie: "iOS", fait: "", notes: "Notifications iPhone en erreur 401." },
    { titre: "Envoyer le mail nouveautés (lots 16-20)", date: "", categorie: "Com", fait: "", notes: "Seulement les comptes Newsletter = OUI." },
    { titre: "Choisir la forme juridique + adresse postale", date: "2026-11-30", categorie: "Juridique", fait: "", notes: "SIRET (jalon du business plan). Nécessaire pour les mentions légales et Stripe." },
    { titre: "Valider un premier club réel", date: "2026-12-15", categorie: "Commercial", fait: "", notes: "Courbevoie / Puteaux (jalon du business plan)." },
    { titre: "Sourcer ou retirer le chiffre « 25 % des sportifs »", date: "", categorie: "Com", fait: "", notes: "" },
    { titre: "100 membres actifs", date: "2027-01-31", categorie: "Commercial", fait: "", notes: "Jalon du business plan." },
    { titre: "Base migrée + CGV + Stripe", date: "2027-03-31", categorie: "Infra", fait: "", notes: "Jalon du business plan (migration Supabase)." },
    { titre: "Lancement Spary+", date: "2027-04-15", categorie: "Commercial", fait: "", notes: "Jalon du business plan." },
    { titre: "Coach Pro payant", date: "2027-06-01", categorie: "Commercial", fait: "", notes: "Jalon du business plan." },
    { titre: "10 clubs partenaires", date: "2027-06-30", categorie: "Commercial", fait: "", notes: "Jalon du business plan." },
    { titre: "500 membres actifs", date: "2027-09-30", categorie: "Commercial", fait: "", notes: "Jalon du business plan." },
    { titre: "Bilan année 1", date: "2027-10-31", categorie: "Juridique", fait: "", notes: "Jalon du business plan." }
  ]);

  fill("edito", [
    { date: "", canal: "Newsletter", format: "E-mail", sujet: "Mail nouveautés (lots 16 à 20)", statut: "Prêt", notes: "Prêt depuis le 21/10 (dossier mail-nouveautes). Seulement les comptes Newsletter = OUI." }
  ]);

  // Cibles « clubs fondateurs » (clubs/clubs-fondateurs-cibles.xlsx) : adresses génériques publiées par les mairies.
  var src = "Guide des sports de la mairie (adresse ancienne, risque de rebond).";
  fill("clubs", [
    { nom: "CAP 92", type: "Club", ville: "Puteaux", sport: "Athlétisme", email: "contact.cap92@gmail.com", site: "sites.google.com/site/puteauxathletisme/", statut: "À contacter", notes: src },
    { nom: "CSMP Tennis de table", type: "Club", ville: "Puteaux", sport: "Tennis de table", email: "contact@puteauxtennisdetable.com", site: "puteauxtennisdetable.com", statut: "À contacter", notes: src },
    { nom: "Ufit Athletic Club Puteaux", type: "Club", ville: "Puteaux", sport: "Cross training, course à pied", email: "ufitfamily@gmail.com", statut: "À contacter", notes: src },
    { nom: "CSMP Tennis", type: "Club", ville: "Puteaux", sport: "Tennis", statut: "À contacter", notes: "Adresse nominative : voir clubs-fondateurs-cibles.xlsx. " + src },
    { nom: "ASTT Suresnes", type: "Club", ville: "Suresnes", sport: "Tennis de table", email: "astt.ping@free.fr", site: "asttsuresnes.jimdo.com", statut: "À contacter", notes: src },
    { nom: "Badminton Club Suresnois", type: "Club", ville: "Suresnes", sport: "Badminton", email: "secretaire@bcs92.fr", site: "bcs92.fr", statut: "À contacter", notes: src },
    { nom: "Suresnes Escalade", type: "Club", ville: "Suresnes", sport: "Escalade", email: "contact@suresnes-escalade.fr", site: "suresnes-escalade.fr", statut: "À contacter", notes: src },
    { nom: "Suresnes Passion Athlé Marathon", type: "Club", ville: "Suresnes", sport: "Athlétisme", email: "suresnesmarathon@gmail.com", site: "suresnes-marathon.com", statut: "À contacter", notes: src },
    { nom: "Tennis Club de Suresnes", type: "Club", ville: "Suresnes", sport: "Tennis", email: "tennis.suresnes@wanadoo.fr", statut: "À contacter", notes: src },
    { nom: "Tennis Club du Mont Valérien", type: "Club", ville: "Suresnes", sport: "Tennis", email: "tcmv.suresnes@orange.fr", statut: "À contacter", notes: src },
    { nom: "White Harriers", type: "Club", ville: "Suresnes", sport: "Athlétisme", email: "whiteharriers@hotmail.fr", site: "whiteharriers.athle.org", statut: "À contacter", notes: src },
    { nom: "Badminton club de Courbevoie (BCC)", type: "Club", ville: "Courbevoie", sport: "Badminton", site: "badminton-club-courbevoie.com", statut: "À contacter", notes: "Pas d'e-mail public : passer au club ou fiche mairie." },
    { nom: "Courbevoie athlétisme club et loisirs (CACL)", type: "Club", ville: "Courbevoie", sport: "Athlétisme", statut: "À contacter", notes: "Pas d'e-mail public : passer au club ou fiche mairie." }
  ]);
  return n;
}
