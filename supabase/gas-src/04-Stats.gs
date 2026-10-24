/**
 * Spary : mesure d'audience sans cookie + tableau de bord (lot 6, v17).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Stats », coller ce code.
 * Il doit être placé SOUS Terrain dans la liste des fichiers (c'est le cas par défaut pour un nouveau fichier).
 * Ne pas modifier Code.gs, Nouveautes ni Terrain.
 *  1. Sélectionner la fonction sp17Installer et cliquer sur Exécuter (accepter l'autorisation demandée par Google).
 *     Cela crée le classeur « Spary – Statistiques » dans ton Drive et un déclencheur chaque nuit (4 h).
 *  2. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *  3. sp17Verifier doit afficher « OK ». sp17MettreAJour recalcule le tableau de bord tout de suite.
 *
 * Ce que ça enregistre (dans BDD Spary) :
 *  - Visites   : date (ms) | jour | nouvelle visite (1/0) | 1re visite du jour sur cet appareil (1/0) | source | appareil | support | écrans vus (JSON)
 *                Aucune adresse IP, aucun identifiant, aucun cookie. Effacé au bout de 13 mois.
 *  - Actifs    : jour | empreinte. L'empreinte est un code irréversible (HMAC avec un secret créé tout seul, STATS_SALT)
 *                qui sert seulement à compter les membres actifs sans doublon. Effacé au bout de 60 jours
 *                et à la suppression du compte.
 * Le classeur « Spary – Statistiques » ne contient QUE des totaux (aucun pseudo, aucun e-mail) :
 * c'est lui que Claude lit pour analyser le trafic.
 * Aucun secret dans ce fichier. Écritures sous LockService.
 */

var SP17 = {
  installed: false, TZ: "Europe/Paris",
  VISITS_DAYS: 395, ACTIVE_DAYS: 60, MAX_PER_MIN: 600,
  SOURCES: ["direct", "recherche", "instagram", "tiktok", "linkedin", "facebook", "whatsapp", "snapchat", "x", "youtube", "email", "club", "partage", "lieux", "autre"],
  DEVICES: ["mobile", "ordi"], SUPPORTS: ["web", "pwa", "appli"]
};

function sp17Day_(ms) { return Utilities.formatDate(new Date(ms), SP17.TZ, "yyyy-MM-dd"); }
function sp17ShVisits_() { return sheetH_("Visites", ["date (ms)", "jour", "nouvelle visite", "1re visite du jour", "source", "appareil", "support", "écrans vus"]); }
function sp17ShActive_() { return sheetH_("Actifs", ["jour", "empreinte"]); }

function sp17Salt_() {
  var p = PropertiesService.getScriptProperties(), s = p.getProperty("STATS_SALT");
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty("STATS_SALT", s); }
  return s;
}
function sp17Print_(pseudo) {
  var raw = Utilities.computeHmacSha256Signature(String(pseudo).toLowerCase(), sp17Salt_());
  return raw.slice(0, 8).map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}
/** Sheets transforme « 2026-10-17 » en date : on relit toujours un jour sous forme de texte. */
function sp17D_(v) { return v instanceof Date ? sp17Day_(v.getTime()) : String(v || ""); }
function sp17Pick_(v, list, dflt) { v = String(v || ""); return list.indexOf(v) >= 0 ? v : dflt; }

/** Une visite ou un lot d'écrans vus, envoyé par le site. Jamais bloquant : en cas de doute, on ignore. */
function sp17Hit_(d) {
  var cache = CacheService.getScriptCache(), now = Date.now(), minute = "sp17:m:" + Math.floor(now / 60000);
  var n = Number(cache.get(minute) || 0);
  if (n >= SP17.MAX_PER_MIN) return { status: "success" };
  cache.put(minute, String(n + 1), 120);

  var views = {}, k = 0;
  if (d.views && typeof d.views === "object") Object.keys(d.views).forEach(function (v) {
    if (k >= 25 || !/^view[A-Za-z0-9]{1,30}$/.test(v)) return;
    var c = Math.min(50, Math.max(0, Math.floor(Number(d.views[v]) || 0)));
    if (c) { views[v] = c; k++; }
  });
  var visit = d.visit ? 1 : 0, uniq = d.uniq && visit ? 1 : 0;
  if (!visit && !k) return { status: "success" };
  var row = [now, sp17Day_(now), visit, uniq, sp17Pick_(d.src, SP17.SOURCES, "autre"), sp17Pick_(d.dev, SP17.DEVICES, "mobile"),
             sp17Pick_(d.app, SP17.SUPPORTS, "web"), k ? JSON.stringify(views) : ""];

  var me = null;
  if (d.token) { try { me = sessionUser_(d.token); } catch (x) {} }
  var act = null;
  if (me && me.pseudo) {
    var pr = sp17Print_(me.pseudo), key = "sp17:a:" + row[1] + ":" + pr;
    if (!cache.get(key)) { act = [row[1], pr]; cache.put(key, "1", 21600); }
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) return { status: "success" };   // serveur occupé : on perd ce comptage, pas grave
  try {
    sp17ShVisits_().appendRow(row);
    if (act) sp17ShActive_().appendRow(act);
  } finally { try { lock.releaseLock(); } catch (x) {} }
  return { status: "success" };
}

/* ===================== Tableau de bord ===================== */

function sp17Book_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty("STATS_SHEET_ID"), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (x) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create("Spary – Statistiques");
    p.setProperty("STATS_SHEET_ID", ss.getId());
  }
  return ss;
}
function sp17Tab_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }
function sp17Write_(sh, rows) {
  sh.clearContents();
  if (!rows.length) return;
  var w = 0; rows.forEach(function (r) { w = Math.max(w, r.length); });
  rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
  sh.getRange(1, 1, rows.length, w).setValues(rows);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, w).setFontWeight("bold");
}
function sp17Ms_(v) { if (v instanceof Date) return v.getTime(); var n = Number(v); if (n > 1e11) return n; var t = new Date(v).getTime(); return isNaN(t) ? 0 : t; }
/** Compte par jour la colonne de dates d'un onglet (sans lire le reste des lignes). */
function sp17CountByDay_(name, col, noHeader) {
  var sh = sheetIf_(name), out = {};
  if (!sh) return out;
  var last = sh.getLastRow(), first = noHeader ? 1 : 2;
  if (last < first) return out;
  sh.getRange(first, col, last - first + 1, 1).getValues().forEach(function (r) {
    var ms = sp17Ms_(r[0]); if (ms) { var d = sp17Day_(ms); out[d] = (out[d] || 0) + 1; }
  });
  return out;
}

/** Recalcule tout le classeur « Spary – Statistiques ». Lancé chaque nuit, ou à la main. */
function sp17MettreAJour() {
  var now = Date.now();
  sp17Purge_(now);

  var days = {}, srcDay = {}, viewsDay = {}, viewsTot = {}, srcTot = {}, support = {}, device = {};
  function D(d) { return days[d] = days[d] || { visites: 0, uniques: 0, ecrans: 0, mobile: 0, ordi: 0, web: 0, pwa: 0, appli: 0, actifs: {} }; }
  rowsOf_(sp17ShVisits_()).forEach(function (r) {
    var d = r[0] ? sp17Day_(Number(r[0])) : sp17D_(r[1]); if (!d) return;
    var o = D(d);
    if (Number(r[2])) {
      o.visites++; o[String(r[5])] = (o[String(r[5])] || 0) + 1; o[String(r[6])] = (o[String(r[6])] || 0) + 1;
      var s = String(r[4]); srcDay[d + "|" + s] = (srcDay[d + "|" + s] || 0) + 1;
    }
    if (Number(r[3])) o.uniques++;
    if (r[7]) { try { var v = JSON.parse(r[7]); Object.keys(v).forEach(function (k) { var c = Number(v[k]) || 0; o.ecrans += c; viewsDay[d + "|" + k] = (viewsDay[d + "|" + k] || 0) + c; }); } catch (x) {} }
  });
  var act = rowsOf_(sp17ShActive_());
  act.forEach(function (r) { var d = sp17D_(r[0]); if (d) D(d).actifs[String(r[1])] = 1; });

  var signup = sp17CountByDay_("Comptes", 1, false),
      seances = sp17CountByDay_("Seances", 14, false),
      parts = sp17CountByDay_("Inscriptions", 4, false),
      msgs = sp17CountByDay_("Messages", 5, true),
      posts = sp17CountByDay_("Annonces", 7, true),
      matchs = sp17CountByDay_("Matchs", 2, false);
  [signup, seances, parts, msgs, posts, matchs].forEach(function (m) { Object.keys(m).forEach(D); });

  var list = Object.keys(days).sort();
  var jour = [["jour", "visites", "visiteurs uniques", "écrans vus", "membres actifs", "inscriptions", "séances créées", "participations aux séances", "messages", "annonces", "matchs", "visites mobile", "visites ordi", "site web", "appli installée (PWA)", "appli iPhone/Android"]];
  list.forEach(function (d) {
    var o = days[d];
    jour.push([d, o.visites, o.uniques, o.ecrans, Object.keys(o.actifs).length, signup[d] || 0, seances[d] || 0, parts[d] || 0, msgs[d] || 0, posts[d] || 0, matchs[d] || 0, o.mobile || 0, o.ordi || 0, o.web || 0, o.pwa || 0, o.appli || 0]);
  });

  var src = [["jour", "source", "visites"]];
  Object.keys(srcDay).sort().forEach(function (k) { var p = k.split("|"); src.push([p[0], p[1], srcDay[k]]); });
  var canal = [["jour", "canal déclaré à l'inscription", "inscriptions"]], cm = {};
  var shSrc = sheetIf_("SourcesInscription");
  if (shSrc) rowsOf_(shSrc).forEach(function (r) { var d = sp17D_(r[0]); var k = d + "|" + r[1]; cm[k] = (cm[k] || 0) + 1; });
  Object.keys(cm).sort().forEach(function (k) { var p = k.split("|"); canal.push([p[0], p[1], cm[k]]); });

  var vues = [["jour", "écran", "vues"]];
  Object.keys(viewsDay).sort().forEach(function (k) { var p = k.split("|"); vues.push([p[0], p[1], viewsDay[k]]); });

  // Résumé : 7 derniers jours complets contre les 7 d'avant, et 30 jours.
  function sumRange(from, to, f) { var t = 0; list.forEach(function (d) { if (d >= from && d <= to) t += f(days[d], d); }); return t; }
  function distinct(from, to) { var s = {}; act.forEach(function (r) { var d = sp17D_(r[0]); if (d >= from && d <= to) s[String(r[1])] = 1; }); return Object.keys(s).length; }
  var y = sp17Day_(now - 86400000), a7 = sp17Day_(now - 7 * 86400000), b7 = sp17Day_(now - 8 * 86400000), b14 = sp17Day_(now - 14 * 86400000), a30 = sp17Day_(now - 30 * 86400000);
  var metrics = [
    ["Visites", function (o) { return o.visites; }],
    ["Visiteurs uniques (par jour, additionnés)", function (o) { return o.uniques; }],
    ["Écrans vus", function (o) { return o.ecrans; }],
    ["Inscriptions", function (o, d) { return signup[d] || 0; }],
    ["Séances créées", function (o, d) { return seances[d] || 0; }],
    ["Participations aux séances", function (o, d) { return parts[d] || 0; }],
    ["Messages", function (o, d) { return msgs[d] || 0; }],
    ["Matchs déclarés", function (o, d) { return matchs[d] || 0; }]
  ];
  var res = [["indicateur", "7 derniers jours", "7 jours d'avant", "évolution", "30 derniers jours"]];
  function evo(a, b) { return b ? Math.round((a - b) / b * 100) + " %" : (a ? "nouveau" : "–"); }
  metrics.forEach(function (m) { var a = sumRange(a7, y, m[1]), b = sumRange(b14, b7, m[1]); res.push([m[0], a, b, evo(a, b), sumRange(a30, y, m[1])]); });
  var wa = distinct(a7, y), wb = distinct(b14, b7);
  res.push(["Membres actifs (distincts)", wa, wb, evo(wa, wb), distinct(a30, y)]);
  var members = 0; var shAcc = sheetIf_("Comptes"); if (shAcc) members = Math.max(0, shAcc.getLastRow() - 1);
  res.push([]);
  res.push(["Membres inscrits au total", members]);
  res.push(["Mis à jour le", Utilities.formatDate(new Date(now), SP17.TZ, "dd/MM/yyyy HH:mm")]);
  res.push([]);
  res.push(["Rappel", "Totaux anonymes uniquement. Les « visiteurs uniques » sont comptés par appareil et par jour, sans cookie ni identifiant."]);

  var ss = sp17Book_();
  sp17Write_(sp17Tab_(ss, "Résumé"), res);
  sp17Write_(sp17Tab_(ss, "Jour"), jour);
  sp17Write_(sp17Tab_(ss, "Sources"), src);
  sp17Write_(sp17Tab_(ss, "Canaux inscription"), canal);
  sp17Write_(sp17Tab_(ss, "Écrans"), vues);
  var def = ss.getSheetByName("Feuille 1") || ss.getSheetByName("Sheet1");
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  sp17Charts_(sp17Tab_(ss, "Jour"), jour.length);
  return ss.getUrl();
}

function sp17Charts_(sh, n) {
  if (n < 2) return;
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  var from = Math.max(2, n - 59);   // 60 derniers jours
  var rows = n - from + 1;
  sh.insertChart(sh.newChart().asLineChart()
    .addRange(sh.getRange(1, 1, 1, 3)).addRange(sh.getRange(from, 1, rows, 3))
    .setOption("title", "Visites (60 derniers jours)").setOption("useFirstColumnAsDomain", true)
    .setPosition(2, 18, 0, 0).build());
  sh.insertChart(sh.newChart().asColumnChart()
    .addRange(sh.getRange(from, 1, rows, 1)).addRange(sh.getRange(from, 5, rows, 3))
    .setOption("title", "Actifs, inscriptions, séances").setOption("useFirstColumnAsDomain", true)
    .setPosition(22, 18, 0, 0).build());
}

/** Efface les visites de plus de 13 mois et les empreintes de plus de 60 jours. */
function sp17Purge_(now) {
  var lv = sp17Day_(now - SP17.VISITS_DAYS * 86400000), la = sp17Day_(now - SP17.ACTIVE_DAYS * 86400000);
  sp8Locked_(function () {
    rewriteRows_(sp17ShVisits_(), function (r) { return sp17Day_(Number(r[0]) || 0) >= lv ? r : null; });
    rewriteRows_(sp17ShActive_(), function (r) { return sp17D_(r[0]) >= la ? r : null; });
  });
}

/* ===================== Installation ===================== */
function sp17Install_() {
  if (SP17.installed || typeof doPost !== "function" || typeof SP15 === "undefined" || !SP15.installed) return;
  SP17.installed = true;
  var prev = doPost;
  doPost = function (e) {
    var data = null;
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (data && data.action === "hit") {
      try { return out_(sp17Hit_(data)); } catch (err) { try { console.error("sp17 " + (err && err.message || err)); } catch (x) {} return out_({ status: "success" }); }
    }
    return prev(e);
  };
  // Suppression de compte : on efface aussi son empreinte d'activité.
  var baseDelete = deleteAccountData_;
  deleteAccountData_ = function (pseudo) {
    baseDelete(pseudo);
    try { var pr = sp17Print_(pseudo); rewriteRows_(sp17ShActive_(), function (r) { return String(r[1]) === pr ? null : r; }); } catch (x) {}
  };
}
sp17Install_();

/** À exécuter UNE fois : crée le classeur de statistiques et le déclencheur de chaque nuit. */
function sp17Installer() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "sp17MettreAJour") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("sp17MettreAJour").timeBased().everyDays(1).atHour(4).inTimezone(SP17.TZ).create();
  sp17Salt_(); sp17ShVisits_(); sp17ShActive_();
  var url = sp17MettreAJour();
  console.log("OK : tableau de bord créé → " + url + "  (pense à publier une Nouvelle version du déploiement)");
}

function sp17Verifier() {
  var trig = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "sp17MettreAJour"; });
  if (!SP17.installed) console.log("PROBLÈME : le fichier Stats doit être placé SOUS Terrain, et sp15Verifier doit afficher OK.");
  else if (!trig) console.log("PROBLÈME : exécute d'abord sp17Installer.");
  else console.log("OK : mesure d'audience active. Tableau de bord : " + sp17Book_().getUrl());
}

