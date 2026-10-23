/**
 * Spary : copie BDD Spary (Google Sheets) → Supabase.
 *
 * À mettre dans un NOUVEAU projet Apps Script autonome (script.new),
 * jamais dans le projet du site. Il ne fait que LIRE le classeur
 * (le code ne contient aucune écriture dans le classeur) : le site
 * en ligne n'est pas touché.
 *
 * Script Properties du nouveau projet :
 *   SUPABASE_URL         https://chaqyhfkccjpzqcmxpfg.supabase.co
 *   SUPABASE_SECRET_KEY  clé secrète (sb_secret_… ou service_role) — jamais ailleurs
 *   SHEET_ID             id du classeur « BDD Spary »
 *
 * 1. migVerifier() : teste la connexion et compte les lignes, n'écrit rien.
 * 2. migCopier()   : copie tout. Réexécutable sans doublons (upsert).
 * Les mots de passe (colonne H) et les sessions ne sont JAMAIS copiés.
 */

var MIG_TABS_SANS_ENTETE = { "Messages": 1, "Annonces": 1, "Profils": 1 };
// Onglets copiés tels quels dans legacy_rows (normalisés dans un lot suivant).
var MIG_ARCHIVE = ["Avis", "AvisIgnores", "Notes", "NiveauxVotes", "Recours", "Parrainages",
  "AlertesPrefs", "AlertesEnvoyees", "Parcours", "ConnexionsApple", "SeancesPlus", "SeancesTerrain",
  "MessagesLus", "PartagesProches", "SourcesInscription", "Visites", "Actifs", "Interets", "Défis",
  "ClubsPartenaires", "AnnoncesMini"];
// Jamais copiés : Sessions, Jetons, PushFile (temporaires ou secrets).

function migVerifier() {
  var c = migCfg_();
  var r = migHttp_(c, "get", "/rest/v1/members?select=id&limit=1");
  Logger.log("Connexion Supabase : " + (r.code === 200 ? "OK" : "ERREUR " + r.code + " " + r.text));
  var ss = SpreadsheetApp.openById(c.sheet);
  ss.getSheets().forEach(function (sh) { Logger.log(sh.getName() + " : " + Math.max(0, sh.getLastRow()) + " lignes"); });
}

function migCopier() {
  var c = migCfg_(), ss = SpreadsheetApp.openById(c.sheet), rep = [];
  var tab = function (name) { return migRows_(ss, name); };

  // 1. Membres + données privées
  var acc = tab("Feuille 1"), prof = {};
  tab("Profils").forEach(function (r) { if (r[0]) prof[low_(r[0])] = r; });
  var members = [], seen = {};
  acc.forEach(function (r) {
    var p = String(r[6] || "").trim(); if (!p || seen[low_(p)]) return; seen[low_(p)] = 1;
    var pr = prof[low_(p)] || [];
    members.push({ pseudo: p, prenom: str_(r[2]), profile: json_(pr[1]) || {}, avatar_legacy: str_(pr[2]),
      created_at: iso_(r[0]) || new Date().toISOString(), last_seen_at: iso_(r[11]) });
  });
  rep.push(migUpsert_(c, "members", members, "pseudo", 50));
  var ids = migMemberIds_(c);

  var priv = [];
  acc.forEach(function (r) {
    var id = ids[low_(r[6])]; if (!id) return;
    priv.push({ member_id: id, nom: str_(r[1]), email: str_(r[3]) ? String(r[3]).trim().toLowerCase() : null,
      telephone: str_(r[4]), date_naissance: day_(r[5]), newsletter: bool_(r[8]), consentement: str_(r[9]),
      email_verifie: bool_(r[12]) });
  });
  rep.push(migUpsert_(c, "member_private", dedupe_(priv, "member_id"), "member_id"));

  var m = function (p) { return ids[low_(p)] || null; };

  // 2. Modération
  rep.push(migUpsert_(c, "blocks", dedupe_(tab("Blocages").map(function (r) {
    return { blocker: m(r[0]), blocked: m(r[1]), created_at: iso_(r[2]) || now_() };
  }).filter(both_("blocker", "blocked")), "blocker,blocked"), "blocker,blocked"));
  rep.push(migUpsert_(c, "bans", dedupe_(tab("Bannis").map(function (r) {
    return { member_id: m(r[0]), until: iso_(r[1]), reason: str_(r[2]) };
  }).filter(both_("member_id")), "member_id"), "member_id"));
  rep.push(migUpsert_(c, "reports", dedupe_(tab("Signalements").map(function (r) {
    return { id: String(r[0]), created_at: iso_(r[1]) || now_(), reporter: m(r[2]), type: str_(r[3]), target: str_(r[4]),
      author: m(r[5]), reason: str_(r[6]), details: str_(r[7]), excerpt: str_(r[8]), status: str_(r[9]) || "nouveau", note: str_(r[10]) };
  }).filter(both_("id")), "id"), "id"));

  // 3. Messagerie
  var groups = dedupe_(tab("Groupes").map(function (r) {
    return { id: String(r[0]).replace(/^#/, ""), name: str_(r[1]) || "Groupe", creator: m(r[2]), created_at: iso_(r[3]) || now_() };
  }).filter(both_("id")), "id");
  rep.push(migUpsert_(c, "groups", groups, "id"));
  var gset = {}; groups.forEach(function (g) { gset[g.id] = 1; });
  rep.push(migUpsert_(c, "group_members", dedupe_(tab("GroupesMembres").map(function (r) {
    return { group_id: String(r[0]).replace(/^#/, ""), member_id: m(r[1]), added_at: iso_(r[2]) || now_() };
  }).filter(function (x) { return gset[x.group_id] && x.member_id; }), "group_id,member_id"), "group_id,member_id"));

  var msgs = [], mset = {};
  tab("Messages").forEach(function (r) {
    var id = Number(r[0]), to = String(r[2] || ""), s = m(r[1]); if (!id || !s) return;
    var row = { id: id, sender: s, recipient: null, group_id: null, body: String(r[3] || "").slice(0, 4000) || " ",
      created_at: iso_(r[4]) || iso_(id) || now_(), deleted_at: null };
    if (to.charAt(0) === "#") { row.group_id = to.slice(1); if (!gset[row.group_id]) return; }
    else { row.recipient = m(to); if (!row.recipient) return; }
    if (row.body === "Message supprimé") row.deleted_at = row.created_at;
    msgs.push(row); mset[id] = 1;
  });
  rep.push(migUpsert_(c, "messages", dedupe_(msgs, "id"), "id"));
  rep.push(migUpsert_(c, "message_events", dedupe_(tab("MessagesPlus").map(function (r) {
    return { legacy_rev: String(r[0]), message_id: Number(r[1]), member_id: m(r[3]), type: str_(r[4]) || "?",
      value: json_(r[5]), created_at: iso_(r[6]) || now_() };
  }).filter(function (x) { return x.legacy_rev && mset[x.message_id] && x.member_id; }), "legacy_rev"), "legacy_rev"));

  // 4. Social
  rep.push(migUpsert_(c, "friends", dedupe_(tab("Amis").map(function (r) {
    return { requester: m(r[0]), addressee: m(r[1]), status: str_(r[2]) || "demande", created_at: iso_(r[3]) || now_() };
  }).filter(both_("requester", "addressee")), "requester,addressee"), "requester,addressee"));

  var meta = {}, img = {};
  tab("PostsMeta").forEach(function (r) { meta[String(r[0])] = { sport: str_(r[1]), duree_min: Number(r[2]) || null }; });
  tab("AnnoncesImages").forEach(function (r) { img[String(r[0])] = str_(r[1]); });
  var posts = [], pset = {};
  tab("Annonces").forEach(function (r) {
    var id = String(r[0] || ""), a = m(r[1]); if (!id || !a) return;
    posts.push({ id: id, author: a, prenom: str_(r[2]), type: str_(r[3]), title: cut_(r[4], 200), body: cut_(r[5], 5000),
      meta: meta[id] || {}, image_legacy: img[id] || null, created_at: iso_(r[6]) || iso_(Number(id)) || now_() });
    pset[id] = 1;
  });
  rep.push(migUpsert_(c, "posts", dedupe_(posts, "id"), "id", 100));
  rep.push(migUpsert_(c, "comments", dedupe_(tab("Commentaires").map(function (r) {
    return { id: String(r[0]), post_id: String(r[1]), author: m(r[2]), body: cut_(r[4], 2000) || " ", created_at: iso_(r[5]) || now_() };
  }).filter(function (x) { return x.id && pset[x.post_id] && x.author; }), "id"), "id"));
  rep.push(migUpsert_(c, "likes", dedupe_(tab("Likes").map(function (r) {
    return { post_id: String(r[0]), member_id: m(r[1]) };
  }).filter(function (x) { return pset[x.post_id] && x.member_id; }), "post_id,member_id"), "post_id,member_id"));

  // 5. Séances, matchs, entraînements
  var opts = {};
  tab("SeancesOptions").forEach(function (r) { var k = String(r[0]); (opts[k] = opts[k] || {})[String(r[1])] = r[2]; });
  var seances = [], sset = {};
  tab("Seances").forEach(function (r) {
    var id = String(r[0] || ""), o = m(r[1]), st = iso_(r[7]); if (!id || !o || !st) return;
    seances.push({ id: id, organizer: o, sport: str_(r[3]) || "?", place: str_(r[4]), lat: num_(r[5]), lng: num_(r[6]),
      starts_at: st, places: Math.min(100, Math.max(1, Number(r[8]) || 1)), fee_total: num_(r[9]), level: str_(r[10]),
      note: str_(r[11]), status: str_(r[12]) || "ouverte", options: opts[id] || {}, created_at: iso_(r[13]) || now_() });
    sset[id] = 1;
  });
  rep.push(migUpsert_(c, "seances", dedupe_(seances, "id"), "id"));
  rep.push(migUpsert_(c, "seance_members", dedupe_(tab("Inscriptions").map(function (r) {
    return { seance_id: String(r[0]), member_id: m(r[1]), joined_at: iso_(r[3]) || now_() };
  }).filter(function (x) { return sset[x.seance_id] && x.member_id; }), "seance_id,member_id"), "seance_id,member_id"));
  rep.push(migUpsert_(c, "seance_waitlist", dedupe_(tab("ListeAttente").map(function (r) {
    return { seance_id: String(r[0]), member_id: m(r[1]), created_at: iso_(r[3]) || now_(), status: str_(r[4]) || "attente", promoted_at: iso_(r[5]) };
  }).filter(function (x) { return sset[x.seance_id] && x.member_id; }), "seance_id,member_id"), "seance_id,member_id"));
  rep.push(migUpsert_(c, "matches", dedupe_(tab("Matchs").map(function (r) {
    return { id: String(r[0]), created_at: iso_(r[1]) || now_(), player_a: m(r[2]), player_b: m(r[3]), sport: str_(r[4]),
      score: str_(r[5]), a_wins: r[6] === "" ? null : String(r[6]) === "1", status: str_(r[7]) || "en attente", resolved_at: iso_(r[8]) };
  }).filter(both_("id", "player_a", "player_b")), "id"), "id"));
  rep.push(migUpsert_(c, "kudos", dedupe_(tab("Kudos").map(function (r) {
    return { created_at: iso_(r[0]) || now_(), seance_id: String(r[1]), giver: m(r[2]), receiver: m(r[3]) };
  }).filter(both_("seance_id", "giver", "receiver")), "seance_id,giver,receiver"), "seance_id,giver,receiver"));
  rep.push(migUpsert_(c, "points", migRowsN_(ss, "Points").map(function (x) {
    var r = x.r; return { legacy_key: "Points:" + x.n, created_at: iso_(r[0]) || now_(), member_id: m(r[1]), type: str_(r[2]),
      ref: str_(r[3]), points: Math.round(Number(r[4]) || 0) };
  }).filter(both_("member_id")), "legacy_key"));
  rep.push(migUpsert_(c, "trainings", dedupe_(tab("Entrainements").map(function (r) {
    return { id: String(r[0]), member_id: m(r[1]), sport: str_(r[2]), started_at: iso_(r[3]), duration_s: int_(r[4]),
      distance_km: num_(r[5]), feeling: int_(r[6]), note: str_(r[7]), source: str_(r[8]), created_at: iso_(r[9]) || now_(), health_id: str_(r[10]) };
  }).filter(both_("id", "member_id")), "id"), "id"));
  rep.push(migUpsert_(c, "coaches", dedupe_(tab("Coachs").map(function (r) {
    return { member_id: m(r[0]), data: json_(r[2]) || {}, status: str_(r[3]) || "en attente", created_at: iso_(r[4]) || now_() };
  }).filter(both_("member_id")), "member_id"), "member_id"));
  rep.push(migUpsert_(c, "push_subscriptions", dedupe_(tab("PushSubs").map(function (r) {
    return { created_at: iso_(r[0]) || now_(), member_id: m(r[1]), endpoint: str_(r[2]), p256dh: str_(r[3]), auth: str_(r[4]), last_seen_at: iso_(r[5]) };
  }).filter(both_("endpoint", "member_id")), "endpoint"), "endpoint"));

  // 6. Archive brute
  var arch = [];
  MIG_ARCHIVE.forEach(function (name) {
    var sh = ss.getSheetByName(name); if (!sh || sh.getLastRow() < 2) return;
    var v = sh.getDataRange().getValues(), head = v[0];
    for (var i = 1; i < v.length; i++) {
      var o = {}; head.forEach(function (h, j) { var x = v[i][j]; o[String(h || ("col" + j))] = x instanceof Date ? x.toISOString() : x; });
      arch.push({ tab: name, row_num: i + 1, data: o });
    }
  });
  rep.push(migUpsert_(c, "legacy_rows", arch, "tab,row_num", 200));

  Logger.log("Copie terminée :\n" + rep.join("\n"));
}

// ───────── outils ─────────
function migCfg_() {
  var p = PropertiesService.getScriptProperties();
  var c = { url: String(p.getProperty("SUPABASE_URL") || "").replace(/\/+$/, ""), key: p.getProperty("SUPABASE_SECRET_KEY"), sheet: p.getProperty("SHEET_ID") };
  if (!c.url || !c.key || !c.sheet) throw new Error("Script Properties manquantes : SUPABASE_URL, SUPABASE_SECRET_KEY, SHEET_ID");
  return c;
}
function migHttp_(c, method, path, body, prefer) {
  var h = { apikey: c.key };
  if (/^eyJ/.test(c.key)) h.Authorization = "Bearer " + c.key;   // ancienne clé service_role (JWT)
  if (prefer) h.Prefer = prefer;
  var o = { method: method, headers: h, muteHttpExceptions: true, contentType: "application/json" };
  if (body) o.payload = JSON.stringify(body);
  var r = UrlFetchApp.fetch(c.url + path, o);
  return { code: r.getResponseCode(), text: r.getContentText() };
}
function migUpsert_(c, table, rows, conflict, batch) {
  batch = batch || 500; var ok = 0, err = [];
  for (var i = 0; i < rows.length; i += batch) {
    var part = rows.slice(i, i + batch);
    var r = migHttp_(c, "post", "/rest/v1/" + table + "?on_conflict=" + encodeURIComponent(conflict), part, "resolution=merge-duplicates,return=minimal");
    if (r.code >= 200 && r.code < 300) ok += part.length; else err.push(r.code + " " + r.text.slice(0, 300));
  }
  return table + " : " + ok + "/" + rows.length + (err.length ? "  ERREURS → " + err.join(" | ") : "");
}
function migMemberIds_(c) {
  var out = {}, off = 0;
  while (true) {
    var r = migHttp_(c, "get", "/rest/v1/members?select=id,pseudo&order=pseudo&limit=1000&offset=" + off);
    if (r.code !== 200) throw new Error("Lecture members : " + r.code + " " + r.text);
    var a = JSON.parse(r.text); a.forEach(function (x) { out[low_(x.pseudo)] = x.id; });
    if (a.length < 1000) return out; off += 1000;
  }
}
function migRows_(ss, name) { return migRowsN_(ss, name).map(function (x) { return x.r; }); }
function migRowsN_(ss, name) {
  var sh = ss.getSheetByName(name) || (name === "Feuille 1" ? ss.getSheetByName("Sheet1") : null);
  if (!sh || sh.getLastRow() < 1) return [];
  var v = sh.getDataRange().getValues(), start = MIG_TABS_SANS_ENTETE[name] ? 0 : 1, out = [];
  for (var i = start; i < v.length; i++) if (v[i].join("") !== "") out.push({ n: i + 1, r: v[i] });
  return out;
}
function dedupe_(rows, keys) {
  var k = keys.split(","), m = {};
  rows.forEach(function (r) { m[k.map(function (x) { return r[x]; }).join("|")] = r; });
  return Object.keys(m).map(function (x) { return m[x]; });
}
function both_() { var k = [].slice.call(arguments); return function (x) { return k.every(function (f) { return x[f] !== null && x[f] !== "" && x[f] !== undefined; }); }; }
function low_(s) { return String(s || "").trim().toLowerCase(); }
function str_(v) { if (v === null || v === undefined) return null; var s = String(v).trim(); return s === "" ? null : s; }
function cut_(v, n) { var s = str_(v); return s ? s.slice(0, n) : null; }
function num_(v) { if (v === "" || v === null) return null; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : null; }
function int_(v) { var n = num_(v); return n === null ? null : Math.round(n); }
function bool_(v) { return /^(oui|true|vrai|1|x|yes)$/i.test(String(v).trim()) || v === true; }
function json_(v) { if (!v) return null; if (typeof v === "object") return v; try { return JSON.parse(v); } catch (e) { return { texte: String(v) }; } }
function now_() { return new Date().toISOString(); }
function iso_(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString();
  var n = Number(v);
  if (isFinite(n) && n > 1e11) return new Date(n > 1e14 ? n / 1000 : n).toISOString();  // ms (ou µs)
  var m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).toISOString();
  var d = new Date(String(v)); return isNaN(d) ? null : d.toISOString();
}
function day_(v) { var s = iso_(v); if (!s) return null; return Utilities.formatDate(new Date(s), "Europe/Paris", "yyyy-MM-dd"); }
