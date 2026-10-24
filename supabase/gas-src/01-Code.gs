/**
 * Spary — API Google Apps Script v2
 * Comptes : colonnes A..K = Date | Nom | Prénom | Email | Téléphone | Naissance | Pseudo | Mot de passe (haché) | Newsletter | Consentement | Club
 * Onglet "Annonces" (créé tout seul) : id | pseudo | prénom | type | titre | texte | date
 * Messagerie : onglet "Messages" (créé tout seul) : id | de | à | texte | date(ms). Actions msgSend / msgSync.
 * Profils : onglet "Profils" (créé tout seul) : pseudo | données (JSON) | photo (data URL) | mis à jour (ms). Présence en ligne : cache (aucune écriture dans la feuille).
 * Recherche de membres : action "userSearch" (pseudo + prénom uniquement).
 * Séances, matchs, coachs, likes, commentaires : voir la section « Données réelles » en bas du fichier.
 * Onglet des comptes : "Comptes" (sinon le premier onglet est utilisé). L'onglet "Sessions" est créé tout seul.
 */
var SHEET_ACCOUNTS = "Comptes";
var SHEET_SESSIONS = "Sessions";
var SHEET_PROFILES = "Profils";
var SESSION_DAYS = 90;
var MAX_FAILS = 5;     // tentatives de connexion ratées avant blocage
var LOCK_MIN = 15;     // durée du blocage en minutes

// Le verrou ne sert qu'aux actions qui ÉCRIVENT dans la feuille. Les lectures (messages, profils, recherche, session)
// passent sans attendre : une exécution lente ne bloque plus tout le monde.
var WRITE_ACTIONS = { register: 1, login: 1, logout: 1, postCreate: 1, msgSend: 1, profileSave: 1,
  sessionCreate: 1, sessionJoin: 1, sessionLeave: 1, sessionCancel: 1, matchSubmit: 1, matchRespond: 1, coachApply: 1,
  postLike: 1, postComment: 1, postDelete: 1, interestAdd: 1,
  report: 1, blockSet: 1, accountDelete: 1, passwordChange: 1, planSync: 1,
  mailVerifySend: 1, mailVerify: 1, pwForgot: 1, pwReset: 1 };

function doPost(e) {
  var lock = null;
  try {
    if (e.postData && e.postData.contents && e.postData.contents.length > 150000) return out_(err_("Requête trop volumineuse."));
    var data = JSON.parse(e.postData.contents);
    if (WRITE_ACTIONS[data.action]) {
      lock = LockService.getScriptLock();
      lock.waitLock(20000);
    }
    if (data.token && data.action !== "login" && data.action !== "register" && data.action !== "logout" && data.action !== "session") {
      var gate = checkSession_(data.token);                               // compte suspendu : message explicite plutôt que « session expirée »
      if (gate.status === "error" && gate.message === MSG_SUSPENDED) return out_(gate);
    }
    switch (data.action) {
      case "register": return out_(register_(data));
      case "login":    return out_(login_(data));
      case "session":  return out_(checkSession_(data.token));
      case "logout":   return out_(logout_(data.token));
      case "postCreate": return out_(postCreate_(data));
      case "postList":   return out_(postList_(data));
      case "clubStats":  return out_(clubStats_(data));
      case "userSearch": return out_(userSearch_(data));
      case "msgSend":    return out_(msgSend_(data));
      case "msgSync":    return out_(msgSync_(data));
      case "profileSave": return out_(profileSave_(data));
      case "profileMe":   return out_(profileMe_(data));
      case "profileGet":  return out_(profileGet_(data));
      case "sessionCreate": return out_(sessionCreate_(data));
      case "sessionList":   return out_(sessionList_(data));
      case "sessionJoin":   return out_(sessionJoin_(data));
      case "sessionLeave":  return out_(sessionLeave_(data));
      case "sessionCancel": return out_(sessionCancel_(data));
      case "matchSubmit":   return out_(matchSubmit_(data));
      case "matchList":     return out_(matchList_(data));
      case "matchRespond":  return out_(matchRespond_(data));
      case "leaderboard":   return out_(leaderboard_(data));
      case "coachApply":    return out_(coachApply_(data));
      case "coachList":     return out_(coachList_(data));
      case "postLike":      return out_(postLike_(data));
      case "postComment":   return out_(postComment_(data));
      case "postDelete":    return out_(postDelete_(data));
      case "quickMatch":    return out_(quickMatch_(data));
      case "appStats":      return out_(appStats_(data));
      case "interestAdd":   return out_(interestAdd_(data));
      case "mailStatus":    return out_(mailStatus_(data));
      case "mailVerifySend": return out_(mailVerifySend_(data));
      case "mailVerify":    return out_(mailVerify_(data));
      case "pwForgot":      return out_(pwForgot_(data));
      case "pwReset":       return out_(pwReset_(data));
      case "payInfo":       return out_(payInfo_(data));
      case "planSync":      return out_(planSync_(data));
      case "report":        return out_(report_(data));
      case "blockSet":      return out_(blockSet_(data));
      case "blockList":     return out_(blockList_(data));
      case "accountExport": return out_(accountExport_(data));
      case "accountDelete": return out_(accountDelete_(data));
      case "passwordChange": return out_(passwordChange_(data));
      default:         return out_({ status: "error", message: "Action inconnue." });
    }
  } catch (err) {
    var m = String(err && err.message || err);
    try { console.error(m + " | " + (err && err.stack || "")); } catch (x) {}
    if (/lock/i.test(m)) return out_({ status: "error", message: "Serveur occupé, réessayez dans quelques secondes." });
    return out_({ status: "error", message: "Erreur serveur, réessayez dans un instant." });
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (x) {} }
  }
}

// ---------- Inscription ----------
function register_(d) {
  var lastName = str_(d.lastName), firstName = str_(d.firstName), email = str_(d.email).toLowerCase();
  var phone = str_(d.phone), birthDate = str_(d.birthDate), pseudo = str_(d.pseudo), password = String(d.password || "");

  if (!lastName || !firstName || !email || !pseudo || !birthDate) return err_("Merci de remplir tous les champs obligatoires.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err_("Adresse e-mail invalide.");
  if (!/^[A-Za-z0-9_.-]{3,20}$/.test(pseudo)) return err_("Pseudo : 3 à 20 caractères (lettres, chiffres, _ . -).");
  var pwBad = passwordProblem_(password, pseudo, email); if (pwBad) return err_(pwBad);
  if (d.consent !== true) return err_("Le consentement au traitement des données est obligatoire.");
  if (age_(birthDate) < 15) return err_("Spary est réservé aux personnes de 15 ans ou plus.");
  if (age_(birthDate) > 110) return err_("Date de naissance invalide.");
  if (badAny_([pseudo, firstName, lastName])) return err_("Ce pseudo ou ce nom n'est pas autorisé.");
  var regLim = rate_("reg:all", 60, 3600, "Beaucoup d'inscriptions en ce moment. Réessayez dans quelques minutes.");
  if (regLim) return err_(regLim);

  var sheet = sheet_(SHEET_ACCOUNTS), rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][6]).toLowerCase() === pseudo.toLowerCase()) return err_("Ce pseudo est déjà pris.");
    if (String(rows[i][3]).toLowerCase() === email) return err_("Cet email est déjà associé à un compte.");
  }

  var club = /^[A-Z0-9-]{1,24}$/.test(String(d.club || "")) ? String(d.club) : "";
  sheet.appendRow([
    new Date(), safe_(lastName), safe_(firstName), safe_(email), safe_(phone), birthDate,
    safe_(pseudo), makeHash_(password), d.newsletter ? "OUI" : "NON", new Date(), club, new Date()
  ]);
  try { if (!sheet.getRange(1, 12).getValue()) sheet.getRange(1, 12).setValue("Dernière connexion"); } catch (x) {}
  try { if (mailOn_()) sendVerify_({ pseudo: pseudo, name: firstName, email: email }); } catch (x) {}
  return { status: "success", token: createSession_(pseudo, firstName), user: { name: firstName, pseudo: pseudo } };
}

// ---------- Connexion ----------
function login_(d) {
  var id = str_(d.identifier).toLowerCase(), pw = String(d.password || "");
  if (!id || !pw) return err_("Identifiant ou mot de passe incorrect.");

  var cache = CacheService.getScriptCache(), key = "fail:" + id;
  if (Number(cache.get(key) || 0) >= MAX_FAILS) return err_("Trop de tentatives. Réessayez dans " + LOCK_MIN + " minutes.");

  var sheet = sheet_(SHEET_ACCOUNTS), rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var rowEmail = String(rows[i][3]).toLowerCase(), rowPseudo = String(rows[i][6]).toLowerCase();
    if ((rowEmail === id || rowPseudo === id) && checkPw_(pw, rows[i][7])) {
      if (isBanned_(rows[i][6])) return err_(MSG_SUSPENDED);
      cache.remove(key);
      if (String(rows[i][7]).indexOf("hmac$") !== 0) sheet.getRange(i + 1, 8).setValue(makeHash_(pw)); // ancien format ou clair -> haché avec secret serveur
      try { var lastL = new Date(rows[i][11]).getTime(); if (!lastL || new Date().getTime() - lastL > 72000000) sheet.getRange(i + 1, 12).setValue(new Date()); } catch (x) {}
      try { purgeExpiredSessions_(); } catch (x) {}
      return { status: "success", token: createSession_(rows[i][6], rows[i][2]), user: { name: rows[i][2], pseudo: rows[i][6] } };
    }
  }
  cache.put(key, String(Number(cache.get(key) || 0) + 1), LOCK_MIN * 60);
  return err_("Identifiant ou mot de passe incorrect.");
}

// ---------- Sessions ----------
function createSession_(pseudo, name) {
  var token = Utilities.getUuid() + Utilities.getUuid();
  var expiry = new Date().getTime() + SESSION_DAYS * 86400000;
  sheet_(SHEET_SESSIONS, true).appendRow([hash_(token, "session"), pseudo, name, expiry]);
  return token;
}
function checkSession_(token) {
  if (!token) return err_("Session invalide.");
  var h = hash_(String(token), "session"), now = new Date().getTime(), cache = CacheService.getScriptCache();
  var hit = cache.get("sess:" + h);
  if (hit) {
    var c = jsonSafe_(hit);
    if (c.pseudo && Number(c.exp) > now) return isBanned_(c.pseudo) ? err_(MSG_SUSPENDED) : { status: "success", user: { name: c.name, pseudo: c.pseudo } };
  }
  var rows = sheet_(SHEET_SESSIONS, true).getDataRange().getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i][0] === h && Number(rows[i][3]) > now) {
      if (isBanned_(rows[i][1])) return err_(MSG_SUSPENDED);
      cache.put("sess:" + h, JSON.stringify({ name: rows[i][2], pseudo: rows[i][1], exp: Number(rows[i][3]) }), 600);
      return { status: "success", user: { name: rows[i][2], pseudo: rows[i][1] } };
    }
  }
  return err_("Session expirée.");
}
function logout_(token) {
  if (!token) return { status: "success" };
  var sheet = sheet_(SHEET_SESSIONS, true), rows = sheet.getDataRange().getValues(), h = hash_(String(token), "session");
  CacheService.getScriptCache().remove("sess:" + h);
  for (var i = rows.length - 1; i >= 0; i--) if (rows[i][0] === h) sheet.deleteRow(i + 1);
  return { status: "success" };
}

// ---------- Annonces (fil d'actualité) ----------
var POST_TYPES = ["Victoire", "Match disputé", "Disponible", "Recherche"];
function sessionUser_(token) {
  var s = checkSession_(token);
  return s.status === "success" ? s.user : null;
}
function postCreate_(d) {
  var u = sessionUser_(d.token);
  if (!u) return err_("Session expirée, reconnectez-vous.");
  if (POST_TYPES.indexOf(d.badge) < 0) return err_("Type d'annonce invalide.");
  var title = String(d.title || "").trim().slice(0, 120), text = String(d.text || "").trim().slice(0, 500);
  if (!title || !text) return err_("Annonce vide.");
  var bad = badAny_([title, text]); if (bad) return err_(bad);
  var cache = CacheService.getScriptCache(), key = "post:" + u.pseudo, n = Number(cache.get(key) || 0);
  if (n >= 10) return err_("Trop d'annonces en peu de temps. Réessayez plus tard.");
  cache.put(key, String(n + 1), 3600);
  var id = new Date().getTime();
  sheet_("Annonces", true).appendRow([id, u.pseudo, u.name, d.badge, safe_(title), safe_(text), new Date()]);
  return { status: "success", id: id };
}
function postList_(d) {
  if (!sessionUser_(d.token)) return err_("Session expirée.");
  var me = String(sessionUser_(d.token).pseudo).toLowerCase(), only = String(d.pseudo || "").toLowerCase();
  var bl = blocks_(me), hid = hidden_();
  var rows = sheet_("Annonces", true).getDataRange().getValues(), out = [], limit = only ? 30 : 50;
  for (var i = rows.length - 1; i >= 0 && out.length < limit; i--) {
    if (!rows[i][0]) continue;
    if (only && String(rows[i][1]).toLowerCase() !== only) continue;
    if (String(rows[i][1]).toLowerCase() !== me && (hid["annonce:" + rows[i][0]] || hides_(bl, rows[i][1]))) continue;
    var t = new Date(rows[i][6]).getTime();
    out.push({ id: rows[i][0], pseudo: rows[i][1], name: rows[i][2], badge: rows[i][3], title: rows[i][4], text: rows[i][5], ts: isNaN(t) ? Number(rows[i][0]) || 0 : t, likes: 0, liked: false, comments: [] });
  }
  var idx = {}; out.forEach(function (p) { idx[String(p.id)] = p; });
  rowsOf_(shLikes_()).forEach(function (r) {
    var p = idx[String(r[0])]; if (!p) return;
    p.likes++; if (String(r[1]).toLowerCase() === me) p.liked = true;
  });
  rowsOf_(shComments_()).forEach(function (r) {
    var p = idx[String(r[1])]; if (!p || p.comments.length >= 30) return;
    if (String(r[2]).toLowerCase() !== me && (hid["commentaire:" + r[0]] || hides_(bl, r[2]))) return;
    p.comments.push({ id: Number(r[0]), pseudo: String(r[2]), name: String(r[3]), text: String(r[4]), ts: Number(r[5]) });
  });
  var profs = profMap_(), presence = {};
  out.forEach(function (p) { presence[p.pseudo] = light_(p.pseudo, profs[String(p.pseudo).toLowerCase()]); });
  return { status: "success", posts: out, presence: presence };
}

// ---------- Espace club : statistiques réelles ----------
function clubStats_(d) {
  if (!sessionUser_(d.token)) return err_("Session expirée.");
  var code = String(d.club || "");
  if (!/^[A-Z0-9-]{1,24}$/.test(code)) return err_("Code club invalide.");
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), pseudos = {}, members = 0, week = 0, since = new Date().getTime() - 7 * 86400000;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][10]) === code) {
      members++; pseudos[String(rows[i][6])] = true;
      if (new Date(rows[i][0]).getTime() > since) week++;
    }
  }
  var posts = 0, ann = sheet_("Annonces", true).getDataRange().getValues();
  for (var j = 0; j < ann.length; j++) if (pseudos[String(ann[j][1])]) posts++;
  return { status: "success", members: members, posts: posts, week: week };
}

// ---------- Recherche de membres ----------
// Ne renvoie que le pseudo et le prénom (jamais email, téléphone, nom, date de naissance).
function norm_(v) { return String(v == null ? "" : v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function userSearch_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var q = norm_(str_(d.query)).replace(/^@/, "");
  if (q.length < 2) return { status: "success", users: [] };
  var cache = CacheService.getScriptCache(), key = "search:" + me.pseudo, n = Number(cache.get(key) || 0);
  if (n >= 120) return err_("Trop de recherches. Réessayez plus tard.");
  cache.put(key, String(n + 1), 3600);
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), out = [], mine = String(me.pseudo).toLowerCase();
  var profs = profMap_(), seen = {}, blU = blocks_(me.pseudo), hidU = hidden_();
  for (var i = 1; i < rows.length && out.length < 8; i++) {
    var pseudo = String(rows[i][6]), first = String(rows[i][2]), pr = profs[pseudo.toLowerCase()];
    if (!pseudo || pseudo.toLowerCase() === mine) continue;
    if (pr && pr.data.searchable === false) continue;
    if (hides_(blU, pseudo) || hidU["membre:" + pseudo]) continue;
    var shown = pr && pr.data.displayName ? pr.data.displayName : first;
    if (norm_(pseudo).indexOf(q) >= 0 || norm_(first).indexOf(q) >= 0 || norm_(shown).indexOf(q) >= 0) {
      var o = light_(pseudo, pr); o.pseudo = pseudo; o.name = shown; o.avatar = avatarOf_(pr); out.push(o);
    }
  }
  return { status: "success", users: out };
}

// ---------- Messagerie entre membres ----------
var MSG_MAX = 1000;       // longueur max d'un message
var MSG_PER_MIN = 30;     // messages max par minute et par membre
var MSG_TAIL = 800;       // nombre de lignes lues en fin d'onglet à chaque synchronisation

// Retrouve le pseudo exact (et le prénom) d'un compte à partir d'un pseudo saisi
function findAccount_(pseudo) {
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), p = String(pseudo).toLowerCase();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][6]).toLowerCase() === p) return { pseudo: String(rows[i][6]), name: String(rows[i][2]) };
  return null;
}
function msgSend_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var to = String(d.to || "");
  var text = String(d.text || "").trim().slice(0, MSG_MAX);
  if (!text) return err_("Message vide.");
  var badM = badAny_([text]); if (badM) return err_(badM);
  if (/^#\d{6,20}$/.test(to)) {                       // discussion de groupe d'une séance
    if (!mySeanceIds_(me.pseudo)[to.slice(1)]) return err_("Rejoignez la séance pour écrire dans la discussion.");
    var c2 = CacheService.getScriptCache(), k2 = "msg:" + me.pseudo, n2 = Number(c2.get(k2) || 0);
    if (n2 >= MSG_PER_MIN) return err_("Trop de messages en peu de temps. Patientez un instant.");
    c2.put(k2, String(n2 + 1), 60);
    var t2 = new Date().getTime(), id2 = t2 * 1000 + Math.floor(Math.random() * 1000);
    sheet_("Messages", true).appendRow([id2, me.pseudo, to, safe_(text), t2]);
    return { status: "success", id: id2, ts: t2, to: to };
  }
  if (!/^[A-Za-z0-9_.-]{3,20}$/.test(to)) return err_("Destinataire invalide.");
  var dest = findAccount_(to);
  if (!dest) return err_("Ce membre n'existe pas.");
  if (dest.pseudo.toLowerCase() === String(me.pseudo).toLowerCase()) return err_("Vous ne pouvez pas vous écrire à vous-même.");
  var blm = blocks_(me.pseudo), dk = dest.pseudo.toLowerCase();
  if (blm.mine[dk] || blm.them[dk] || isBanned_(dk)) return err_("Impossible d'écrire à ce membre.");
  var cache = CacheService.getScriptCache(), key = "msg:" + me.pseudo, n = Number(cache.get(key) || 0);
  if (n >= MSG_PER_MIN) return err_("Trop de messages en peu de temps. Patientez un instant.");
  cache.put(key, String(n + 1), 60);
  var now = new Date().getTime(), id = now * 1000 + Math.floor(Math.random() * 1000);
  sheet_("Messages", true).appendRow([id, me.pseudo, dest.pseudo, safe_(text), now]);
  return { status: "success", id: id, ts: now, to: dest.pseudo };
}
// Renvoie les messages envoyés ou reçus par le membre connecté, plus récents que `since` (id)
function msgSync_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var since = Number(d.since) || 0, mine = String(me.pseudo).toLowerCase();
  touchSeen_(me.pseudo, d.active === false);
  var sids = mySeanceIds_(me.pseudo), blk = blocks_(me.pseudo), hidM = hidden_();
  var sh = sheet_("Messages", true), last = sh.getLastRow(), out = [], names = {};
  if (last >= 1) {
    var first = Math.max(1, last - MSG_TAIL + 1), rows = sh.getRange(first, 1, last - first + 1, 5).getValues();
    for (var i = 0; i < rows.length; i++) {
      var id = Number(rows[i][0]);
      if (!id || id <= since) continue;
      var from = String(rows[i][1]), to = String(rows[i][2]);
      if (to.charAt(0) === "#") { if (!sids[to.slice(1)]) continue; }
      else if (from.toLowerCase() !== mine && to.toLowerCase() !== mine) continue;
      if (from.toLowerCase() !== mine && (hides_(blk, from) || hidM["message:" + id])) continue;
      out.push({ id: id, from: from, to: to, text: String(rows[i][3]), ts: Number(rows[i][4]) });
    }
    out = out.slice(-300);
    var accounts = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), want = {};
    out.forEach(function (m) { want[m.from.toLowerCase()] = true; if (m.to.charAt(0) !== "#") want[(m.from.toLowerCase() === mine ? m.to : m.from).toLowerCase()] = true; });
    for (var j = 1; j < accounts.length; j++) {
      var ps = String(accounts[j][6]);
      if (want[ps.toLowerCase()]) names[ps] = String(accounts[j][2]);
    }
  }
  var peers = {};
  (Array.isArray(d.peers) ? d.peers : []).slice(0, 40).forEach(function (p) { if (/^[A-Za-z0-9_.-]{3,20}$/.test(String(p))) peers[String(p).toLowerCase()] = String(p); });
  out.forEach(function (m) { if (m.to.charAt(0) === "#") return; var o = m.from.toLowerCase() === mine ? m.to : m.from; peers[o.toLowerCase()] = o; });
  var profs = profMap_(), presence = {};
  Object.keys(peers).forEach(function (k) { presence[peers[k]] = light_(peers[k], profs[k]); });
  return { status: "success", me: me.pseudo, messages: out, names: names, presence: presence };
}

// ---------- Profils, photo, statut et présence ----------
var LEVELS = ["Débutant", "Intermédiaire", "Avancé", "Compétition"];
var MODES = ["online", "away", "busy", "invisible"];
var DAYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
var SLOTS = ["matin", "midi", "soir"];
var SEEN_MS = 150000;     // sans signe de vie depuis 2 min 30 : hors ligne

function clip_(v, n) { return String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n); }
function jsonSafe_(t) { try { var o = JSON.parse(t); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } }
function cleanLink_(v) {
  v = String(v || "").trim();
  if (!v) return "";
  if (/^@?[A-Za-z0-9_.]{1,30}$/.test(v)) return "https://instagram.com/" + v.replace(/^@/, "");
  return /^https?:\/\/[^\s"'<>]{3,200}$/.test(v) ? v : "";
}
function cleanProfile_(p) {
  p = p || {};
  var o = { displayName: clip_(p.displayName, 40), bio: clip_(p.bio, 150), city: clip_(p.city, 60), club: clip_(p.club, 60), link: cleanLink_(p.link), sports: [], avail: {} };
  (Array.isArray(p.sports) ? p.sports : []).slice(0, 12).forEach(function (s) {
    var name = clip_(s && s.name, 30);
    if (name) o.sports.push({ name: name, level: LEVELS.indexOf(s.level) >= 0 ? s.level : "", rank: clip_(s.rank, 20) });
  });
  DAYS.forEach(function (day) {
    var a = p.avail && Array.isArray(p.avail[day]) ? p.avail[day] : [];
    o.avail[day] = SLOTS.filter(function (x) { return a.indexOf(x) >= 0; });
  });
  o.mode = MODES.indexOf(p.mode) >= 0 ? p.mode : "online";
  o.emoji = clip_(p.emoji, 8); o.text = clip_(p.text, 80);
  var until = Number(p.until) || 0, now = new Date().getTime();
  if (until && until <= now) { o.emoji = ""; o.text = ""; until = 0; }   // statut déjà expiré : effacé
  o.until = until > now ? Math.min(until, now + 7 * 86400000) : 0;
  if (!o.text && !o.emoji) o.until = 0;
  o.showPresence = p.showPresence !== false;
  o.searchable = p.searchable !== false;
  return o;
}
function cleanAvatar_(a) {
  a = String(a || "");
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(a) && a.length <= 45000 ? a : null;
}
// Lit seulement pseudo, données et date (la photo, lourde, est lue à la demande avec avatarOf_)
function profMap_() {
  var sh = sheet_(SHEET_PROFILES, true), last = sh.getLastRow(), map = {};
  if (last < 1) return map;
  var ab = sh.getRange(1, 1, last, 2).getValues(), dt = sh.getRange(1, 4, last, 1).getValues();
  for (var i = 0; i < ab.length; i++) {
    if (!ab[i][0]) continue;
    map[String(ab[i][0]).toLowerCase()] = { row: i + 1, pseudo: String(ab[i][0]), data: jsonSafe_(ab[i][1]), updated: Number(dt[i][0]) || 0 };
  }
  return map;
}
function avatarOf_(pr) {
  if (!pr) return "";
  return String(sheet_(SHEET_PROFILES, true).getRange(pr.row, 3, 1, 1).getValues()[0][0] || "");
}
function touchSeen_(pseudo, away) {
  CacheService.getScriptCache().put("seen:" + String(pseudo).toLowerCase(), JSON.stringify({ t: new Date().getTime(), a: away ? 1 : 0 }), 600);
}
// État affiché : online | away | busy | offline | hidden (le membre masque sa présence)
function presence_(pseudo, pr) {
  var data = pr ? pr.data : {};
  if (data.showPresence === false) return "hidden";
  var raw = CacheService.getScriptCache().get("seen:" + String(pseudo).toLowerCase());
  if (!raw) return "offline";
  var s = jsonSafe_(raw), mode = MODES.indexOf(data.mode) >= 0 ? data.mode : "online";
  if (!s.t || new Date().getTime() - s.t > SEEN_MS) return "offline";
  if (mode === "invisible") return "offline";
  if (s.a && mode === "online") return "away";
  return mode;
}
// Infos légères (sans photo) pour les listes
function light_(pseudo, pr) {
  var data = pr ? pr.data : {}, now = new Date().getTime(), live = !data.until || data.until > now;
  return { u: pseudo, v: pr ? pr.updated : 0, state: presence_(pseudo, pr), emoji: live ? (data.emoji || "") : "", text: live ? (data.text || "") : "" };
}
function publicProfile_(pseudo, pr, withAvatar) {
  var d = pr ? pr.data : {}, o = light_(pseudo, pr);
  o.name = d.displayName || ""; o.bio = d.bio || ""; o.city = d.city || ""; o.club = d.club || ""; o.link = d.link || "";
  o.sports = d.sports || []; o.avail = d.avail || {};
  o.stats = statsOf_(statsAll_(), pseudo);
  if (withAvatar) o.avatar = avatarOf_(pr);
  return o;
}
function profileMe_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var pr = profMap_()[String(me.pseudo).toLowerCase()];
  return { status: "success", profile: pr ? pr.data : null, avatar: avatarOf_(pr), v: pr ? pr.updated : 0, stats: statsOf_(statsAll_(), me.pseudo) };
}
function profileSave_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var cache = CacheService.getScriptCache(), key = "psave:" + me.pseudo, n = Number(cache.get(key) || 0);
  if (n >= 40) return err_("Trop de modifications en peu de temps. Réessayez plus tard.");
  cache.put(key, String(n + 1), 3600);
  var map = profMap_(), pr = map[String(me.pseudo).toLowerCase()], data = cleanProfile_(d.profile), now = new Date().getTime();
  var avatar = null;                       // null = photo inchangée
  if (d.avatar === null || d.avatar === "") avatar = "";
  else if (typeof d.avatar === "string") {
    var a = cleanAvatar_(d.avatar);
    if (a === null) return err_("Photo invalide ou trop lourde.");
    avatar = a;
  }
  var badP = badAny_([data.displayName, data.bio, data.city, data.club, data.text]); if (badP) return err_(badP);
  var json = JSON.stringify(data);
  if (json.length > 8000) return err_("Profil trop long.");
  var sh = sheet_(SHEET_PROFILES, true);
  if (pr) {
    sh.getRange(pr.row, 1, 1, 2).setValues([[me.pseudo, json]]);
    sh.getRange(pr.row, 4, 1, 1).setValues([[now]]);
    if (avatar !== null) sh.getRange(pr.row, 3, 1, 1).setValues([[avatar]]);
  } else sh.appendRow([me.pseudo, json, avatar || "", now]);
  return { status: "success", v: now, profile: data };
}
function profileGet_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var cache = CacheService.getScriptCache(), key = "pget:" + me.pseudo, n = Number(cache.get(key) || 0);
  if (n >= 400) return err_("Trop de requêtes. Réessayez plus tard.");
  cache.put(key, String(n + 1), 3600);
  var list = [], seen = {}, have = d.have && typeof d.have === "object" ? d.have : {};
  (Array.isArray(d.pseudos) ? d.pseudos : []).forEach(function (p) {
    p = String(p);
    if (/^[A-Za-z0-9_.-]{3,20}$/.test(p) && !seen[p.toLowerCase()] && list.length < 30) { seen[p.toLowerCase()] = 1; list.push(p); }
  });
  var map = profMap_(), out = {}, accMap = null;
  function accOf_(p) {
    if (!accMap) {
      accMap = {};
      var r = sheet_(SHEET_ACCOUNTS).getDataRange().getValues();
      for (var k = 1; k < r.length; k++) accMap[String(r[k][6]).toLowerCase()] = { pseudo: String(r[k][6]), name: String(r[k][2]) };
    }
    return accMap[p.toLowerCase()] || null;
  }
  list.forEach(function (p) {
    var pr = map[p.toLowerCase()], acc = pr ? { pseudo: pr.pseudo } : accOf_(p);
    if (!acc) return;
    var same = pr && Number(have[acc.pseudo]) === pr.updated;
    var o = publicProfile_(acc.pseudo, pr, !same);
    o.fresh = !same; o.hasProfile = !!pr;
    out[acc.pseudo] = o;
  });
  return { status: "success", profiles: out };
}

// ---------- Mots de passe ----------
function hash_(pw, salt) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ":" + pw, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}
// Secret serveur (« poivre ») : créé une fois, stocké dans les propriétés du script. NE PAS LE SUPPRIMER : les mots de passe deviendraient inutilisables.
function pepper_() {
  var props = PropertiesService.getScriptProperties(), v = props.getProperty("PEPPER");
  if (!v) { v = Utilities.getUuid() + Utilities.getUuid(); props.setProperty("PEPPER", v); }
  return v;
}
function hmac_(pw, salt) {
  var raw = Utilities.computeHmacSha256Signature(salt + ":" + pw, pepper_());
  return raw.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}
function makeHash_(pw) {
  var salt = Utilities.getUuid().replace(/-/g, "");
  return "hmac$" + salt + "$" + hmac_(pw, salt);
}
function checkPw_(pw, stored) {
  stored = String(stored);
  if (stored.indexOf("hmac$") === 0) { var q = stored.split("$"); return hmac_(pw, q[1]) === q[2]; }
  if (stored.indexOf("sha256$") === 0) { var p = stored.split("$"); return hash_(pw, p[1]) === p[2]; }   // ancien format, remplacé à la prochaine connexion
  return stored === pw; // anciens comptes (mot de passe encore en clair)
}

/** À lancer UNE FOIS à la main (Exécuter) : hache tous les mots de passe encore en clair. */
function migratePasswords() {
  var sheet = sheet_(SHEET_ACCOUNTS), rows = sheet.getDataRange().getValues(), n = 0;
  for (var i = 1; i < rows.length; i++) {
    var v = String(rows[i][7]);
    if (v && v.indexOf("sha256$") !== 0 && v.indexOf("hmac$") !== 0) { sheet.getRange(i + 1, 8).setValue(makeHash_(v)); n++; }
  }
  Logger.log(n + " mot(s) de passe haché(s).");
}

// =====================================================================
// ---------- Modération, vie privée (RGPD) et sécurité ----------
// Onglets créés tout seuls : Signalements, Blocages, Bannis, MotsInterdits (facultatif), Abonnements.
//  - Signalements : une ligne par signalement. Colonne « statut » : nouveau (par défaut) / retiré (contenu masqué pour tous) / rejeté (signalement sans suite).
//    Un contenu signalé par 3 membres différents est masqué automatiquement tant que le statut reste « nouveau ».
//  - Bannis : ajouter une ligne « pseudo | date de fin (vide = définitif) | raison ». Le compte ne peut plus se connecter (effet sous 1 minute).
//  - MotsInterdits : un mot ou une expression par ligne, en plus de la liste intégrée.
// =====================================================================
var SH_REPORTS = "Signalements", SH_BLOCKS = "Blocages", SH_BANS = "Bannis", SH_WORDS = "MotsInterdits", SH_PLANS = "Abonnements";
var REPORT_HIDE_AT = 3;
var REPORT_TYPES = ["annonce", "commentaire", "session", "membre", "message"];
var REPORT_REASONS = ["Spam ou publicité", "Harcèlement ou insultes", "Propos haineux ou discriminatoires", "Contenu sexuel ou inapproprié", "Faux profil ou usurpation d'identité", "Mise en danger ou menaces", "Autre"];
var INACTIVE_YEARS = 3;     // comptes sans connexion depuis N années : supprimés par purgeInactive()
var MSG_BAD = "Ce contenu ne respecte pas les règles de la communauté (insultes, propos haineux, menaces).";
var MSG_SUSPENDED = "Ce compte est suspendu. Écris à l'équipe Spary pour en savoir plus.";

function shReports_() { return sheetH_(SH_REPORTS, ["id", "date (ms)", "signaleur", "type", "cible", "auteur", "motif", "détails", "extrait", "statut", "note"]); }
function shBlocks_()  { return sheetH_(SH_BLOCKS, ["bloqueur", "bloqué", "date (ms)"]); }
function shBans_()    { return sheetH_(SH_BANS, ["pseudo", "jusqu'au (vide = définitif)", "raison"]); }
function shPlans_()   { return sheetH_(SH_PLANS, ["pseudo", "offre", "statut", "jusqu'au (ms)", "référence", "mis à jour (ms)"]); }

// ----- Bannissements -----
function bans_() {
  var cache = CacheService.getScriptCache(), hit = cache.get("bans:all");
  if (hit) return jsonSafe_(hit);
  var map = {}, now = new Date().getTime();
  rowsOf_(shBans_()).forEach(function (r) {
    var p = String(r[0]).trim().toLowerCase(); if (!p) return;
    var u = r[1], until = 0;
    if (u instanceof Date) until = u.getTime();
    else if (Number(u) > 1e11) until = Number(u);
    else if (String(u).trim()) { var t = new Date(String(u)).getTime(); until = isNaN(t) ? 0 : t; }
    if (!until || until > now) map[p] = until || 1;
  });
  cache.put("bans:all", JSON.stringify(map), 60);
  return map;
}
function isBanned_(pseudo) {
  var b = bans_()[String(pseudo).toLowerCase()];
  return !!b && (b === 1 || b > new Date().getTime());
}

// ----- Blocages entre membres -----
function blocks_(pseudo) {
  var key = "blk:" + String(pseudo).toLowerCase(), cache = CacheService.getScriptCache(), hit = cache.get(key);
  if (hit) return jsonSafe_(hit);
  var p = String(pseudo).toLowerCase(), o = { mine: {}, them: {} };
  rowsOf_(shBlocks_()).forEach(function (r) {
    var a = String(r[0]).toLowerCase(), b = String(r[1]).toLowerCase();
    if (a === p) o.mine[b] = 1; else if (b === p) o.them[a] = 1;
  });
  cache.put(key, JSON.stringify(o), 300);
  return o;
}
function forgetBlocks_(a, b) {
  var c = CacheService.getScriptCache();
  c.remove("blk:" + String(a).toLowerCase()); c.remove("blk:" + String(b).toLowerCase());
}
// true si le contenu de ce membre doit être caché pour le membre dont on a chargé les blocages
function hides_(bl, pseudo) {
  var k = String(pseudo).toLowerCase();
  return !!(bl.mine[k] || bl.them[k] || isBanned_(k));
}

// ----- Contenus masqués par signalements -----
function hidden_() {
  var cache = CacheService.getScriptCache(), hit = cache.get("hid:all");
  if (hit) return jsonSafe_(hit);
  var by = {};
  rowsOf_(shReports_()).forEach(function (r) {
    if (!r[0]) return;
    var k = String(r[3]) + ":" + String(r[4]), o = by[k] = by[k] || { rep: {}, n: 0, rem: false, rej: false }, st = norm_(r[9]);
    if (st === "retire") o.rem = true;
    else if (st === "rejete") o.rej = true;
    else if (st === "nouveau" || !st) { var who = String(r[2]).toLowerCase(); if (!o.rep[who]) { o.rep[who] = 1; o.n++; } }
  });
  var h = {};
  Object.keys(by).forEach(function (k) { var o = by[k]; if (o.rem || (!o.rej && o.n >= REPORT_HIDE_AT)) h[k] = 1; });
  cache.put("hid:all", JSON.stringify(h), 120);
  return h;
}

// ----- Filtre de langage -----
var BAD_TOKENS = ["connard", "connasse", "salope", "pute", "enculé", "encule", "enculer", "ntm", "fdp", "pd", "pédé", "pede", "tarlouze", "tapette", "gouine", "nègre", "negre", "négro", "negro",
  "bougnoule", "bicot", "youpin", "raton", "sidaïque", "mongol", "nazi", "pétasse", "petasse", "batard", "bâtard", "crevard", "trisomique", "attardé", "attarde"];
var BAD_PHRASES = ["sale arabe", "sale noir", "sale juif", "sale negre", "sale blanc", "sale francais", "sale pd", "ferme ta gueule", "ta gueule", "je vais te tuer", "vais te tuer", "va te tuer", "je te tue",
  "vais te violer", "te violer", "suicide toi", "suicide-toi", "creve", "tu vas crever", "nique ta mere", "nique ta race", "retourne dans ton pays", "sales etrangers", "heil hitler"];
function fold_(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/0/g, "o").replace(/[1!|]/g, "i").replace(/3/g, "e").replace(/[4@]/g, "a").replace(/[5$]/g, "s").replace(/7/g, "t").replace(/(.)\1+/g, "$1");
}
function badLists_() {
  var cache = CacheService.getScriptCache(), hit = cache.get("bad:lists");
  if (hit) return jsonSafe_(hit);
  var toks = {}, phr = [];
  function add(w) { var f = fold_(w).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); if (!f) return; if (f.indexOf(" ") >= 0) phr.push(f); else toks[f] = 1; }
  BAD_TOKENS.forEach(add); BAD_PHRASES.forEach(add);
  try { var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_WORDS); if (sh) rowsOf_(sh).forEach(function (r) { if (r[0]) add(String(r[0])); }); } catch (e) {}
  var o = { toks: toks, phr: phr };
  cache.put("bad:lists", JSON.stringify(o), 300);
  return o;
}
function badText_(s) {
  var f = fold_(s); if (!f) return false;
  var L = badLists_(), toks = f.split(/[^a-z0-9]+/).filter(Boolean);
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (L.toks[t] || (t.length > 3 && t.charAt(t.length - 1) === "s" && L.toks[t.slice(0, -1)])) return true;
  }
  var flat = " " + f.replace(/[^a-z0-9]+/g, " ").trim() + " ";
  for (var j = 0; j < L.phr.length; j++) if (flat.indexOf(" " + L.phr[j] + " ") >= 0) return true;
  var run = "";                                                      // « c.o.n.n.a.r.d » : suite de lettres isolées
  for (var m = 0; m <= toks.length; m++) {
    if (m < toks.length && toks[m].length === 1) { run += toks[m]; continue; }
    if (run.length >= 3 && L.toks[run.replace(/(.)\1+/g, "$1")]) return true;
    run = "";
  }
  return false;
}
// Renvoie le message d'erreur si l'un des textes est refusé, sinon ""
function badAny_(list) { for (var i = 0; i < list.length; i++) if (badText_(list[i])) return MSG_BAD; return ""; }

// ----- Signalement -----
function report_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var type = String(d.type || "");
  if (REPORT_TYPES.indexOf(type) < 0) return err_("Type de signalement invalide.");
  var reason = String(d.reason || "");
  if (REPORT_REASONS.indexOf(reason) < 0) return err_("Choisissez un motif.");
  var details = clip_(d.details, 300), target = String(d.target || "").trim(), author = "", extract = "", mine = String(me.pseudo).toLowerCase();
  if (type === "membre") {
    if (!/^[A-Za-z0-9_.-]{3,20}$/.test(target)) return err_("Membre invalide.");
    var acc = findAccount_(target); if (!acc) return err_("Ce membre n'existe pas.");
    target = acc.pseudo; author = acc.pseudo;
  } else {
    target = String(Number(target) || "");
    if (!target) return err_("Contenu invalide.");
    if (type === "annonce") rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (String(r[0]) === target) { author = String(r[1]); extract = String(r[4]) + " — " + String(r[5]); } });
    else if (type === "commentaire") rowsOf_(shComments_()).forEach(function (r) { if (String(r[0]) === target) { author = String(r[2]); extract = String(r[4]); } });
    else if (type === "session") rowsOf_(shSeances_()).forEach(function (r) { if (String(r[0]) === target) { author = String(r[1]); extract = [r[3], r[4], r[11]].join(" · "); } });
    else if (type === "message") {
      var sids = mySeanceIds_(me.pseudo);
      rowsAll_(sheet_("Messages", true)).forEach(function (r) {
        if (String(r[0]) !== target) return;
        var to = String(r[2]), ok = to.charAt(0) === "#" ? !!sids[to.slice(1)] : to.toLowerCase() === mine;
        if (ok) { author = String(r[1]); extract = String(r[3]); }
      });
    }
  }
  if (!author) return err_("Contenu introuvable.");
  if (author.toLowerCase() === mine) return err_("Vous ne pouvez pas signaler votre propre contenu.");
  var lim = rate_("rep:" + me.pseudo, 15, 3600, "Trop de signalements en peu de temps.");
  if (lim) return err_(lim);
  var sh = shReports_(), rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][2]).toLowerCase() === mine && String(rows[i][3]) === type && String(rows[i][4]) === target) return { status: "success", already: true };
  var now = new Date().getTime();
  sh.appendRow([now * 1000 + Math.floor(Math.random() * 1000), now, me.pseudo, type, target, author, reason, safe_(details), safe_(clip_(extract, 300)), "nouveau", ""]);
  CacheService.getScriptCache().remove("hid:all");
  return { status: "success" };
}

// ----- Blocage -----
function blockSet_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var p = String(d.pseudo || "");
  if (!/^[A-Za-z0-9_.-]{3,20}$/.test(p)) return err_("Membre invalide.");
  var acc = findAccount_(p); if (!acc) return err_("Ce membre n'existe pas.");
  var mine = String(me.pseudo).toLowerCase(), other = acc.pseudo.toLowerCase();
  if (mine === other) return err_("Vous ne pouvez pas vous bloquer vous-même.");
  var lim = rate_("blk:" + me.pseudo, 60, 3600, "Trop d'actions en peu de temps.");
  if (lim) return err_(lim);
  var sh = shBlocks_(), rows = sh.getDataRange().getValues(), at = -1, n = 0;
  for (var i = 1; i < rows.length; i++) if (String(rows[i][0]).toLowerCase() === mine) { n++; if (String(rows[i][1]).toLowerCase() === other) at = i; }
  if (d.on === false) { if (at >= 0) sh.deleteRow(at + 1); }
  else if (at < 0) { if (n >= 200) return err_("Liste de blocage pleine."); sh.appendRow([me.pseudo, acc.pseudo, new Date().getTime()]); }
  forgetBlocks_(me.pseudo, acc.pseudo);
  return { status: "success", blocked: d.on !== false, pseudo: acc.pseudo };
}
function blockList_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var mine = String(me.pseudo).toLowerCase(), out = [];
  rowsOf_(shBlocks_()).forEach(function (r) { if (String(r[0]).toLowerCase() === mine) out.push(String(r[1])); });
  return { status: "success", blocked: out };
}

// ----- Réécriture d'onglet : fn(ligne) renvoie la ligne (modifiée ou non) ou null pour la supprimer -----
// noHeader : onglets créés sans ligne d'en-tête (Annonces, Messages, Profils, Sessions)
function rewriteRows_(sh, fn, noHeader) {
  var start = noHeader ? 1 : 2, last = sh.getLastRow(); if (last < start) return 0;
  var cols = sh.getLastColumn(), vals = sh.getRange(start, 1, last - start + 1, cols).getValues(), keep = [], changed = 0;
  vals.forEach(function (r) {
    var o = fn(r);
    if (o === null) { changed++; return; }
    if (o !== r) changed++;
    keep.push(o);
  });
  if (!changed) return 0;
  sh.getRange(start, 1, vals.length, cols).clearContent();
  if (keep.length) sh.getRange(start, 1, keep.length, cols).setValues(keep);
  return changed;
}
function rowsAll_(sh) { return sh.getDataRange().getValues(); }   // onglets sans en-tête
function sheetIf_(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }

// ----- Export des données (droit d'accès / portabilité) -----
function accountExport_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var lim = rate_("aexp:" + me.pseudo, 5, 3600, "Trop de demandes. Réessayez plus tard.");
  if (lim) return err_(lim);
  var p = String(me.pseudo).toLowerCase(), out = { exporté_le: new Date().toISOString(), pseudo: me.pseudo };
  var acc = null, rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][6]).toLowerCase() === p) acc = rows[i];
  if (acc) out.compte = { inscription: String(acc[0]), nom: acc[1], prénom: acc[2], email: acc[3], téléphone: acc[4], naissance: String(acc[5]), newsletter: acc[8], consentement: String(acc[9]), club: acc[10], dernière_connexion: acc[11] ? String(acc[11]) : "" };
  var pr = profMap_()[p]; out.profil = pr ? pr.data : null; out.photo = pr && avatarOf_(pr) ? "présente (non incluse)" : "aucune";
  var mineRow = function (col) { return function (r) { return String(r[col]).toLowerCase() === p; }; };
  out.annonces = rowsAll_(sheet_("Annonces", true)).filter(mineRow(1)).map(function (r) { return { id: r[0], type: r[3], titre: r[4], texte: r[5], date: String(r[6]) }; });
  out.commentaires = rowsOf_(shComments_()).filter(mineRow(2)).map(function (r) { return { annonce: r[1], texte: r[4], date: Number(r[5]) }; });
  out.likes = rowsOf_(shLikes_()).filter(mineRow(1)).map(function (r) { return r[0]; });
  out.séances_organisées = rowsOf_(shSeances_()).filter(mineRow(1)).map(function (r) { return { id: r[0], sport: r[3], lieu: r[4], début: Number(r[7]), places: r[8], frais: r[9], niveau: r[10], note: r[11], statut: r[12], lieu_id: r[14] || "", durée_min: r[15] || "" }; });
  out.inscriptions = rowsOf_(shInscr_()).filter(mineRow(1)).map(function (r) { return { séance: r[0], date: Number(r[3]) }; });
  out.matchs = rowsOf_(shMatchs_()).filter(function (r) { return String(r[2]).toLowerCase() === p || String(r[3]).toLowerCase() === p; }).map(function (r) { return { date: Number(r[1]), joueur_a: r[2], joueur_b: r[3], sport: r[4], score: r[5], statut: r[7] }; });
  var msgs = [], sids = mySeanceIds_(me.pseudo), msh = sheet_("Messages", true);
  rowsAll_(msh).forEach(function (r) {
    var from = String(r[1]).toLowerCase(), to = String(r[2]);
    if (from === p || to.toLowerCase() === p) msgs.push({ de: r[1], à: r[2], texte: r[3], date: Number(r[4]) });
  });
  out.messages_privés = msgs.slice(-3000);
  out.fiche_coach = null; rowsOf_(shCoachs_()).forEach(function (r) { if (String(r[0]).toLowerCase() === p) out.fiche_coach = { statut: r[3], données: jsonSafe_(r[2]) }; });
  out.signalements_envoyés = rowsOf_(shReports_()).filter(mineRow(2)).map(function (r) { return { date: Number(r[1]), type: r[3], motif: r[6] }; });
  out.membres_bloqués = rowsOf_(shBlocks_()).filter(mineRow(0)).map(function (r) { return r[1]; });
  var plans = sheetIf_(SH_PLANS); out.abonnement = null;
  if (plans) rowsOf_(plans).forEach(function (r) { if (String(r[0]).toLowerCase() === p) out.abonnement = { offre: r[1], statut: r[2] }; });
  return { status: "success", data: out };
}

// ----- Suppression des données d'un membre -----
function deleteAccountData_(pseudo) {
  var p = String(pseudo).toLowerCase(), is = function (v) { return String(v).toLowerCase() === p; };
  var postIds = {};
  var ann = sheet_("Annonces", true);
  rewriteRows_(ann, function (r) { if (is(r[1])) { postIds[String(r[0])] = 1; return null; } return r; }, true);
  rewriteRows_(shLikes_(), function (r) { return postIds[String(r[0])] || is(r[1]) ? null : r; });
  rewriteRows_(shComments_(), function (r) { return postIds[String(r[1])] || is(r[2]) ? null : r; });
  rewriteRows_(shSeances_(), function (r) {                          // séances organisées : annulées et anonymisées
    if (!is(r[1])) return r;
    var o = r.slice(); o[1] = "[supprimé]"; o[2] = ""; o[11] = ""; o[12] = "annulée"; return o;
  });
  rewriteRows_(shInscr_(), function (r) { return is(r[1]) ? null : r; });
  rewriteRows_(sheet_("Messages", true), function (r) { return is(r[1]) || is(r[2]) ? null : r; }, true);
  rewriteRows_(shMatchs_(), function (r) {                           // les matchs restent pour l'adversaire, sans le nom du membre
    if (!is(r[2]) && !is(r[3])) return r;
    var o = r.slice(); if (is(o[2])) o[2] = "[compte supprimé]"; if (is(o[3])) o[3] = "[compte supprimé]"; return o;
  });
  rewriteRows_(shCoachs_(), function (r) { return is(r[0]) ? null : r; });
  var prf = profMap_()[p]; if (prf) sheet_(SHEET_PROFILES, true).deleteRow(prf.row);
  rewriteRows_(shBlocks_(), function (r) { return is(r[0]) || is(r[1]) ? null : r; });
  var it = sheetIf_(SH_INTERETS); if (it) rewriteRows_(it, function (r) { return is(r[1]) ? null : r; });
  var tk = sheetIf_(SH_TOKENS); if (tk) rewriteRows_(tk, function (r) { return is(r[1]) ? null : r; });
  var ab = sheetIf_(SH_ABOS); if (ab) rewriteRows_(ab, function (r) { return is(r[0]) ? null : r; });
  var pl = sheetIf_(SH_PLANS); if (pl) rewriteRows_(pl, function (r) { return is(r[0]) ? null : r; });
  var c = CacheService.getScriptCache();
  rewriteRows_(sheet_(SHEET_SESSIONS, true), function (r) { if (is(r[1])) { c.remove("sess:" + r[0]); return null; } return r; }, true);
  ["sids:" + p, "seen:" + p, "blk:" + p, "stats:all", "appstats", "hid:all", "bad:lists"].forEach(function (k) { c.remove(k); });
}
function accountDelete_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  if (String(d.confirm || "").trim().toUpperCase() !== "SUPPRIMER") return err_("Tapez SUPPRIMER pour confirmer.");
  var lim = rate_("adel:" + me.pseudo, 5, 3600, "Trop de tentatives. Réessayez plus tard.");
  if (lim) return err_(lim);
  var sh = sheet_(SHEET_ACCOUNTS), rows = sh.getDataRange().getValues(), at = -1, p = String(me.pseudo).toLowerCase();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][6]).toLowerCase() === p) at = i;
  if (at < 0) return err_("Compte introuvable.");
  if (!checkPw_(String(d.password || ""), rows[at][7])) return err_("Mot de passe incorrect.");
  deleteAccountData_(me.pseudo);
  sh.deleteRow(at + 1);
  return { status: "success" };
}
/** À lancer à la main (ou par déclencheur annuel) : supprime les comptes sans connexion depuis INACTIVE_YEARS ans. */
function purgeInactive() {
  var sh = sheet_(SHEET_ACCOUNTS), rows = sh.getDataRange().getValues(), limit = new Date().getTime() - INACTIVE_YEARS * 365 * 86400000, gone = [];
  for (var i = rows.length - 1; i >= 1; i--) {
    var last = new Date(rows[i][11] || rows[i][0]).getTime();
    if (last && last < limit) { gone.push(String(rows[i][6])); }
  }
  gone.forEach(function (ps) {
    deleteAccountData_(ps);
    var r2 = sh.getDataRange().getValues();
    for (var j = r2.length - 1; j >= 1; j--) if (String(r2[j][6]).toLowerCase() === ps.toLowerCase()) { sh.deleteRow(j + 1); break; }
  });
  Logger.log(gone.length + " compte(s) inactif(s) supprimé(s).");
}

// ----- Changement de mot de passe -----
function passwordChange_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var oldPw = String(d.oldPassword || ""), pw = String(d.newPassword || "");
  var lim = rate_("pwc:" + me.pseudo, 6, 3600, "Trop de tentatives. Réessayez plus tard.");
  if (lim) return err_(lim);
  var bad = passwordProblem_(pw, me.pseudo, ""); if (bad) return err_(bad);
  var sh = sheet_(SHEET_ACCOUNTS), rows = sh.getDataRange().getValues(), p = String(me.pseudo).toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][6]).toLowerCase() !== p) continue;
    if (!checkPw_(oldPw, rows[i][7])) return err_("Mot de passe actuel incorrect.");
    if (pw === oldPw) return err_("Choisissez un mot de passe différent de l'ancien.");
    sh.getRange(i + 1, 8).setValue(makeHash_(pw));
    var cur = hash_(String(d.token), "session"), cache = CacheService.getScriptCache();
    rewriteRows_(sheet_(SHEET_SESSIONS, true), function (r) {           // déconnecte tous les autres appareils
      if (String(r[1]).toLowerCase() !== p || r[0] === cur) return r;
      cache.remove("sess:" + r[0]); return null;
    }, true);
    return { status: "success" };
  }
  return err_("Compte introuvable.");
}
var COMMON_PW = ["12345678", "123456789", "1234567890", "password", "motdepasse", "azertyuiop", "azerty123", "qwertyuiop", "11111111", "00000000", "iloveyou", "football", "spary1234", "sparyspary"];
function passwordProblem_(pw, pseudo, email) {
  if (pw.length < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
  if (pw.length > 100) return "Mot de passe trop long.";
  var low = pw.toLowerCase();
  if (COMMON_PW.indexOf(low) >= 0 || /^(.)\1+$/.test(pw)) return "Mot de passe trop courant : choisissez-en un moins prévisible.";
  if (pseudo && low === String(pseudo).toLowerCase()) return "Le mot de passe ne doit pas être votre pseudo.";
  if (email && low === String(email).toLowerCase()) return "Le mot de passe ne doit pas être votre e-mail.";
  return "";
}

// ----- Ménage des sessions expirées (au plus une fois par jour, lancé à la connexion) -----
function purgeExpiredSessions_() {
  var cache = CacheService.getScriptCache();
  if (cache.get("purge:sess")) return;
  cache.put("purge:sess", "1", 21600);
  var now = new Date().getTime();
  rewriteRows_(sheet_(SHEET_SESSIONS, true), function (r) { return Number(r[3]) > now ? r : null; }, true);
}

// ---------- Paiement (Stripe Payment Links) — inactif tant que les propriétés de script ne sont pas renseignées ----------
// Propriétés de script : STRIPE_KEY (clé secrète restreinte, lecture seule des « Checkout Sessions »),
// PAY_URL_PLUS + PAY_ID_PLUS (lien de paiement https://buy.stripe.com/… et son identifiant plink_…), idem PAY_URL_COACH + PAY_ID_COACH.
var SH_ABOS = "Abonnements";
function payProp_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ""; }
function payRef_(pseudo) { return "sp-" + encodeURIComponent(String(pseudo).toLowerCase()).replace(/_/g, "%5F").replace(/%/g, "_"); }
function payPlans_() {
  var out = [];
  [["plus", "PLUS"], ["coach", "COACH"]].forEach(function (p) {
    var url = payProp_("PAY_URL_" + p[1]), id = payProp_("PAY_ID_" + p[1]);
    if (/^https:\/\/buy\.stripe\.com\//.test(url) && /^plink_[A-Za-z0-9]+$/.test(id)) out.push({ plan: p[0], url: url, id: id });
  });
  return out;
}
function planOf_(pseudo) {
  var sh = sheetIf_(SH_ABOS); if (!sh) return "";
  var rows = sh.getDataRange().getValues(), p = String(pseudo).toLowerCase();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][0]).toLowerCase() === p && rows[i][2] === "actif") return String(rows[i][1]);
  return "";
}
function emailOf_(pseudo) {
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), p = String(pseudo).toLowerCase();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][6]).toLowerCase() === p) return String(rows[i][3] || "");
  return "";
}
function payInfo_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var plans = payPlans_(), links = {}, ref = payRef_(me.pseudo), mail = encodeURIComponent(emailOf_(me.pseudo));
  if (payProp_("STRIPE_KEY")) plans.forEach(function (p) { links[p.plan] = p.url + "?client_reference_id=" + ref + (mail ? "&prefilled_email=" + mail : ""); });
  return { status: "success", links: links, plan: planOf_(me.pseudo) };
}
function planSync_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var key = payProp_("STRIPE_KEY"), plans = payPlans_();
  if (!key || !plans.length) return err_("Le paiement n'est pas encore ouvert.");
  var ref = payRef_(me.pseudo), found = "", refGot = "";
  for (var i = 0; i < plans.length && found !== "coach"; i++) {
    var after = "", pages = 0;
    while (pages++ < 5) {
      var url = "https://api.stripe.com/v1/checkout/sessions?limit=100&payment_link=" + plans[i].id + "&expand[]=data.subscription" + (after ? "&starting_after=" + after : "");
      var resp = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + key }, muteHttpExceptions: true }), js;
      if (resp.getResponseCode() !== 200) return err_("Vérification du paiement impossible pour le moment.");
      try { js = JSON.parse(resp.getContentText()); } catch (e) { return err_("Réponse de paiement illisible."); }
      var data = js.data || [];
      for (var k = 0; k < data.length; k++) {
        var s = data[k];
        if (s.client_reference_id !== ref || s.status !== "complete") continue;
        var sub = s.subscription, ok = sub && typeof sub === "object" ? (sub.status === "active" || sub.status === "trialing") : false;
        if (ok) { found = plans[i].plan === "coach" ? "coach" : (found || "plus"); refGot = s.id; }
      }
      if (!js.has_more || !data.length) break;
      after = data[data.length - 1].id;
    }
  }
  var sh = sheetH_(SH_ABOS, ["pseudo", "plan", "statut", "stripe", "maj"]), rows = sh.getDataRange().getValues(), p = String(me.pseudo).toLowerCase(), row = -1;
  for (var r = 1; r < rows.length; r++) if (String(rows[r][0]).toLowerCase() === p) { row = r + 1; break; }
  if (found) {
    var vals = [me.pseudo, found, "actif", refGot, new Date()];
    if (row > 0) sh.getRange(row, 1, 1, 5).setValues([vals]); else sh.appendRow(vals);
  } else if (row > 0) { sh.getRange(row, 3).setValue("terminé"); sh.getRange(row, 5).setValue(new Date()); }
  return { status: "success", plan: found };
}

// ---------- E-mails automatiques (Resend) — inactifs tant que la propriété de script RESEND_API_KEY n'existe pas ----------
// Propriétés de script : RESEND_API_KEY (obligatoire), MAIL_FROM (défaut « Spary <noreply@spary.fr> »), SITE_URL (défaut https://spary.fr)
var SH_TOKENS = "Jetons";
var CONTACT_MAIL = "contact@spary.fr";
var VERIFY_TTL = 3 * 86400000, RESET_TTL = 3600000;
function mailProp_(k, d) { return PropertiesService.getScriptProperties().getProperty(k) || d; }
function mailOn_() { return !!mailProp_("RESEND_API_KEY", ""); }
function mailEsc_(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function mail_(to, subject, html, text) {
  var key = mailProp_("RESEND_API_KEY", ""); if (!key) return false;
  try {
    var r = UrlFetchApp.fetch("https://api.resend.com/emails", {
      method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + key }, muteHttpExceptions: true,
      payload: JSON.stringify({ from: mailProp_("MAIL_FROM", "Spary <noreply@spary.fr>"), to: [to], subject: subject, html: html, text: text })
    });
    var c = r.getResponseCode();
    if (c < 200 || c >= 300) { Logger.log("Resend HTTP " + c + " : " + String(r.getContentText()).slice(0, 200)); return false; }
    return true;
  } catch (e) { Logger.log("Resend : " + e); return false; }
}
function mailLayout_(title, intro, label, url, outro) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2430">' +
    '<h2 style="margin:0 0 12px;font-size:20px">' + mailEsc_(title) + '</h2>' +
    '<p style="line-height:1.5;margin:0 0 20px">' + mailEsc_(intro) + '</p>' +
    '<p style="margin:0 0 20px"><a href="' + mailEsc_(url) + '" style="display:inline-block;background:#c8453f;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px">' + mailEsc_(label) + '</a></p>' +
    '<p style="font-size:13px;color:#667;line-height:1.5;margin:0 0 6px">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br><span style="word-break:break-all">' + mailEsc_(url) + '</span></p>' +
    '<p style="font-size:13px;color:#667;line-height:1.5;margin:14px 0 0">' + mailEsc_(outro) + '</p>' +
    '<p style="font-size:12px;color:#99a;margin:22px 0 0">Spary · ' + mailEsc_(CONTACT_MAIL) + '</p></div>';
}
function tokNew_(pseudo, type, ttl) {
  var t = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ""), now = new Date().getTime(), p = String(pseudo).toLowerCase();
  var sh = sheetH_(SH_TOKENS, ["hash", "pseudo", "type", "expire"]);
  rewriteRows_(sh, function (r) { return (Number(r[3]) < now || (String(r[1]).toLowerCase() === p && r[2] === type)) ? null : r; });
  sh.appendRow([hash_(t, "tok"), pseudo, type, now + ttl]);
  return t;
}
function tokPeek_(t, type) {
  t = String(t || ""); if (!/^[a-f0-9]{64}$/.test(t)) return null;
  var sh = sheetIf_(SH_TOKENS); if (!sh) return null;
  var h = hash_(t, "tok"), rows = sh.getDataRange().getValues(), now = new Date().getTime();
  for (var i = 1; i < rows.length; i++) if (rows[i][0] === h && rows[i][2] === type && Number(rows[i][3]) > now) return String(rows[i][1]);
  return null;
}
function tokDrop_(t) {
  var sh = sheetIf_(SH_TOKENS); if (!sh) return;
  var h = hash_(String(t), "tok"); rewriteRows_(sh, function (r) { return r[0] === h ? null : r; });
}
function accountByKey_(id) {
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), k = String(id).toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][6]).toLowerCase() === k || String(rows[i][3]).toLowerCase() === k)
      return { row: i + 1, pseudo: String(rows[i][6]), name: String(rows[i][2]), email: String(rows[i][3]), verified: !!rows[i][12] };
  }
  return null;
}
function sendVerify_(acc) {
  var url = mailProp_("SITE_URL", "https://spary.fr").replace(/\/+$/, "") + "/#verify=" + tokNew_(acc.pseudo, "verify", VERIFY_TTL);
  var intro = "Bienvenue sur Spary, " + acc.name + " ! Confirme ton adresse e-mail pour sécuriser ton compte et pouvoir récupérer ton mot de passe si tu l'oublies.";
  var out = "Ce lien est valable 3 jours. Si tu n'as pas créé de compte Spary, ignore simplement ce message.";
  return mail_(acc.email, "Confirme ton adresse e-mail – Spary", mailLayout_("Confirme ton adresse e-mail", intro, "Confirmer mon adresse", url, out), intro + "\n\n" + url + "\n\n" + out);
}
function mailStatus_(d) {
  var me = sessionUser_(d.token); if (!me) return err_("Session expirée, reconnectez-vous.");
  var acc = accountByKey_(me.pseudo);
  return { status: "success", mail: mailOn_(), verified: !!(acc && acc.verified) };
}
function mailVerifySend_(d) {
  var me = sessionUser_(d.token); if (!me) return err_("Session expirée, reconnectez-vous.");
  if (!mailOn_()) return err_("L'envoi d'e-mails n'est pas encore activé.");
  var acc = accountByKey_(me.pseudo); if (!acc) return err_("Compte introuvable.");
  if (acc.verified) return { status: "success", already: true };
  var lim = rate_("mvs:" + acc.pseudo.toLowerCase(), 3, 3600, "Trop de demandes. Réessayez dans une heure."); if (lim) return err_(lim);
  return sendVerify_(acc) ? { status: "success" } : err_("Envoi impossible pour le moment. Réessayez plus tard.");
}
function mailVerify_(d) {
  var lim = rate_("mv:all", 300, 3600, "Trop de tentatives. Réessayez plus tard."); if (lim) return err_(lim);
  var pseudo = tokPeek_(d.t, "verify");
  if (!pseudo) return err_("Ce lien n'est plus valide. Demande un nouvel e-mail depuis l'application.");
  var acc = accountByKey_(pseudo); if (!acc) return err_("Compte introuvable.");
  var sh = sheet_(SHEET_ACCOUNTS);
  sh.getRange(acc.row, 13).setValue(new Date());
  try { if (!sh.getRange(1, 13).getValue()) sh.getRange(1, 13).setValue("E-mail vérifié"); } catch (x) {}
  tokDrop_(d.t);
  return { status: "success" };
}
function pwForgot_(d) {
  var id = str_(d.identifier).toLowerCase();
  if (!id) return err_("Indiquez votre pseudo ou votre e-mail.");
  if (!mailOn_()) return err_("La réinitialisation par e-mail n'est pas encore active. Écrivez-nous à " + CONTACT_MAIL + ".");
  var lim = rate_("pwf:" + id, 3, 3600, "Trop de demandes. Réessayez dans une heure.") || rate_("pwf:all", 100, 3600, "Beaucoup de demandes en ce moment. Réessayez plus tard.");
  if (lim) return err_(lim);
  var acc = accountByKey_(id);
  if (acc && !isBanned_(acc.pseudo)) {
    var url = mailProp_("SITE_URL", "https://spary.fr").replace(/\/+$/, "") + "/#reset=" + tokNew_(acc.pseudo, "reset", RESET_TTL);
    var intro = "Tu as demandé à réinitialiser le mot de passe de ton compte Spary (" + acc.pseudo + "). Clique ci-dessous pour en choisir un nouveau.";
    var out = "Ce lien est valable 1 heure et ne sert qu'une fois. Si tu n'es pas à l'origine de cette demande, ignore ce message : ton mot de passe reste inchangé.";
    mail_(acc.email, "Réinitialise ton mot de passe – Spary", mailLayout_("Réinitialise ton mot de passe", intro, "Choisir un nouveau mot de passe", url, out), intro + "\n\n" + url + "\n\n" + out);
  }
  return { status: "success", message: "Si un compte correspond, un e-mail vient d'être envoyé. Pense à regarder tes courriers indésirables." };
}
function pwReset_(d) {
  var lim = rate_("pwr:all", 120, 3600, "Trop de tentatives. Réessayez plus tard."); if (lim) return err_(lim);
  var pseudo = tokPeek_(d.t, "reset");
  if (!pseudo) return err_("Ce lien n'est plus valide. Refaites une demande de réinitialisation.");
  var acc = accountByKey_(pseudo); if (!acc) return err_("Compte introuvable.");
  var pw = String(d.password || ""), bad = passwordProblem_(pw, acc.pseudo, acc.email); if (bad) return err_(bad);
  var sh = sheet_(SHEET_ACCOUNTS), cache = CacheService.getScriptCache(), p = acc.pseudo.toLowerCase();
  sh.getRange(acc.row, 8).setValue(makeHash_(pw));
  if (!acc.verified) sh.getRange(acc.row, 13).setValue(new Date());      // il a reçu l'e-mail : l'adresse est bonne
  tokDrop_(d.t);
  cache.remove("fail:" + p); cache.remove("fail:" + acc.email.toLowerCase());
  rewriteRows_(sheet_(SHEET_SESSIONS, true), function (r) {                // déconnecte tous les appareils
    if (String(r[1]).toLowerCase() !== p) return r;
    cache.remove("sess:" + r[0]); return null;
  }, true);
  return { status: "success" };
}

// ---------- Utilitaires ----------
function sheet_(name, createIfMissing) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), s = ss.getSheetByName(name);
  if (s) return s;
  if (createIfMissing) return ss.insertSheet(name);
  return ss.getSheets()[0];
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function err_(m) { return { status: "error", message: m }; }
function str_(v) { return String(v == null ? "" : v).trim().slice(0, 200); }
function safe_(v) { return /^[=+\-@]/.test(v) ? "'" + v : v; } // empêche l'injection de formules dans la feuille
function age_(iso) {
  var b = new Date(iso), n = new Date();
  if (isNaN(b.getTime())) return 0;
  var a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

// =====================================================================
// ---------- Données réelles : séances, matchs, coachs, likes, stats ----------
// Onglets créés tout seuls (avec une ligne d'en-tête) : Seances, Inscriptions, Matchs, Coachs, Likes, Commentaires, Interets
// Pour valider un coach : onglet "Coachs" → colonne D → remplacer "En attente" par "Validé".
// =====================================================================
var SH_SEANCES = "Seances", SH_INSCR = "Inscriptions", SH_MATCHS = "Matchs", SH_COACHS = "Coachs", SH_LIKES = "Likes", SH_COMMENTS = "Commentaires", SH_INTERETS = "Interets";
var SEANCE_LEVELS = ["Tous niveaux", "Débutant", "Intermédiaire", "Avancé", "Compétition"];
var PTS_WIN = 250, PTS_LOSS = 100;

function sheetH_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), s = ss.getSheetByName(name);
  if (s) return s;
  try { s = ss.insertSheet(name); s.appendRow(headers); }
  catch (e) { s = ss.getSheetByName(name); if (!s) throw e; }
  return s;
}
function shSeances_() { return sheetH_(SH_SEANCES, ["id", "organisateur", "prénom", "sport", "lieu", "lat", "lng", "début (ms)", "places", "frais total €", "niveau", "note", "statut", "créée", "lieu (id)", "durée (min)", "capacité"]); }
function shInscr_()   { return sheetH_(SH_INSCR, ["séance", "pseudo", "prénom", "date (ms)"]); }
function shMatchs_()  { return sheetH_(SH_MATCHS, ["id", "date (ms)", "joueur A", "joueur B", "sport", "score", "A gagne (1/0)", "statut", "résolu (ms)"]); }
function shCoachs_()  { return sheetH_(SH_COACHS, ["pseudo", "prénom", "données (JSON)", "statut", "date (ms)"]); }
function shLikes_()   { return sheetH_(SH_LIKES, ["annonce", "pseudo"]); }
function shComments_() { return sheetH_(SH_COMMENTS, ["id", "annonce", "pseudo", "prénom", "texte", "date (ms)"]); }
function rate_(key, max, seconds, msg) {
  var cache = CacheService.getScriptCache(), n = Number(cache.get(key) || 0);
  if (n >= max) return msg;
  cache.put(key, String(n + 1), seconds);
  return "";
}
function num_(v, min, max, def) { var n = Number(v); return isFinite(n) && n >= min && n <= max ? n : def; }
function rowsOf_(sh) { var r = sh.getDataRange().getValues(); r.shift(); return r; }   // sans l'en-tête
function nameMap_() {
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), m = {};
  for (var i = 1; i < rows.length; i++) m[String(rows[i][6]).toLowerCase()] = { pseudo: String(rows[i][6]), name: String(rows[i][2]) };
  return m;
}
function shownName_(acc, pr) { return (pr && pr.data && pr.data.displayName) || (acc && acc.name) || ""; }

// ---------- Séances ----------
function mySeanceIds_(pseudo) {
  var cache = CacheService.getScriptCache(), key = "sids:" + String(pseudo).toLowerCase(), hit = cache.get(key);
  if (hit) return jsonSafe_(hit);
  var rows = rowsOf_(shInscr_()), ids = {}, p = String(pseudo).toLowerCase();
  rows.forEach(function (r) { if (String(r[1]).toLowerCase() === p) ids[String(r[0])] = 1; });
  cache.put(key, JSON.stringify(ids), 300);
  return ids;
}
function forgetSeanceIds_(pseudo) { CacheService.getScriptCache().remove("sids:" + String(pseudo).toLowerCase()); }

function sessionCreate_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var sport = clip_(d.sport, 30), place = clip_(d.place, 90), note = clip_(d.note, 200);
  var lat = num_(d.lat, -90, 90, null), lng = num_(d.lng, -180, 180, null), now = new Date().getTime();
  var start = num_(d.start, now - 600000, now + 120 * 86400000, null);
  var slots = Math.round(num_(d.slots, 2, 40, 0)), fee = num_(d.fee, 0, 500, 0);
  var level = SEANCE_LEVELS.indexOf(d.level) >= 0 ? d.level : "Tous niveaux";
  if (!sport) return err_("Choisissez un sport.");
  if (!place) return err_("Indiquez le lieu.");
  var badS = badAny_([place, note]); if (badS) return err_(badS);
  if (lat === null || lng === null) return err_("Lieu introuvable : précisez l'adresse ou la ville.");
  if (start === null) return err_("Date invalide (dans les 4 prochains mois).");
  if (!slots) return err_("Nombre de places invalide (2 à 40).");
  var lim = rate_("scr:" + me.pseudo, 6, 21600, "Trop de séances créées en peu de temps. Réessayez plus tard.");
  if (lim) return err_(lim);
  var rows = rowsOf_(shSeances_()), mine = 0;
  rows.forEach(function (r) { if (String(r[1]).toLowerCase() === String(me.pseudo).toLowerCase() && r[12] === "ouverte" && Number(r[7]) > now - 7200000) mine++; });
  if (mine >= 10) return err_("Vous avez déjà 10 séances ouvertes. Annulez-en une avant d'en créer.");
  var lieu = String(d.lieu || "").trim(), dur = 0, cap = 0;
  if (lieu) {
    if (!/^[A-Za-z0-9_-]{3,24}$/.test(lieu)) return err_("Lieu invalide.");
    dur = Math.round(num_(d.dur, 30, 300, 60)); cap = Math.round(num_(d.cap, 1, 30, 1));
    if (start < now - 60000) return err_("Ce créneau est déjà passé.");
    var end = start + dur * 60000, busy = 0;
    rows.forEach(function (r) {
      if (r[12] !== "ouverte" || String(r[14] || "") !== lieu || String(r[3]).toLowerCase() !== sport.toLowerCase()) return;
      var s0 = Number(r[7]), e0 = s0 + (Number(r[15]) || 60) * 60000;
      if (s0 < end && start < e0) busy++;
    });
    if (busy >= cap) return err_("Ce créneau est déjà pris sur ce lieu. Choisissez un autre horaire.");
  }
  var id = now * 1000 + Math.floor(Math.random() * 1000);
  shSeances_().appendRow([id, me.pseudo, me.name, safe_(sport), safe_(place), lat, lng, start, slots, fee, level, safe_(note), "ouverte", now, lieu, dur, cap]);
  shInscr_().appendRow([id, me.pseudo, me.name, now]);
  forgetSeanceIds_(me.pseudo);
  return { status: "success", id: id };
}
function sessionList_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var now = new Date().getTime(), mine = String(me.pseudo).toLowerCase(), blS = blocks_(me.pseudo), hidS = hidden_();
  var seances = rowsOf_(shSeances_()), inscr = rowsOf_(shInscr_()), by = {};
  inscr.forEach(function (r) { (by[String(r[0])] = by[String(r[0])] || []).push({ pseudo: String(r[1]), name: String(r[2]), ts: Number(r[3]) }); });
  var out = [];
  seances.forEach(function (r) {
    if (r[12] !== "ouverte" || Number(r[7]) < now - 7200000) return;
    if (String(r[1]).toLowerCase() !== mine && (hidS["session:" + r[0]] || hides_(blS, r[1]))) return;
    var id = String(r[0]), ps = by[id] || [], joined = false;
    ps.forEach(function (p) { if (p.pseudo.toLowerCase() === mine) joined = true; });
    out.push({ id: Number(r[0]), org: String(r[1]), orgName: String(r[2]), sport: String(r[3]), place: String(r[4]), lat: Number(r[5]), lng: Number(r[6]),
      start: Number(r[7]), slots: Number(r[8]), fee: Number(r[9]), level: String(r[10]), note: String(r[11]), count: ps.length, joined: joined,
      players: ps.slice(0, 40), lieu: String(r[14] || ""), dur: Number(r[15]) || 0, cap: Number(r[16]) || 0 });
  });
  out.sort(function (a, b) { return a.start - b.start; });
  return { status: "success", sessions: out.slice(0, 200), now: now };
}
function sessionJoin_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), now = new Date().getTime();
  var s = null; rowsOf_(shSeances_()).forEach(function (r) { if (String(r[0]) === id) s = r; });
  if (!s || s[12] !== "ouverte") return err_("Cette séance n'existe plus.");
  if (Number(s[7]) < now - 7200000) return err_("Cette séance est terminée.");
  var lim = rate_("sjn:" + me.pseudo, 40, 3600, "Trop d'actions en peu de temps.");
  if (lim) return err_(lim);
  var ins = rowsOf_(shInscr_()), count = 0, mine = String(me.pseudo).toLowerCase();
  for (var i = 0; i < ins.length; i++) if (String(ins[i][0]) === id) { count++; if (String(ins[i][1]).toLowerCase() === mine) return { status: "success", count: count, already: true }; }
  if (count >= Number(s[8])) return err_("Désolé, cette séance est complète.");
  shInscr_().appendRow([Number(id), me.pseudo, me.name, now]);
  forgetSeanceIds_(me.pseudo);
  return { status: "success", count: count + 1 };
}
function sessionLeave_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), mine = String(me.pseudo).toLowerCase();
  var s = null; rowsOf_(shSeances_()).forEach(function (r) { if (String(r[0]) === id) s = r; });
  if (s && String(s[1]).toLowerCase() === mine && s[12] === "ouverte") return err_("Vous organisez cette séance : annulez-la plutôt.");
  var sh = shInscr_(), rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) if (String(rows[i][0]) === id && String(rows[i][1]).toLowerCase() === mine) { sh.deleteRow(i + 1); break; }
  forgetSeanceIds_(me.pseudo);
  return { status: "success" };
}
function sessionCancel_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), sh = shSeances_(), rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === id) {
      if (String(rows[i][1]).toLowerCase() !== String(me.pseudo).toLowerCase()) return err_("Seul l'organisateur peut annuler.");
      sh.getRange(i + 1, 13, 1, 1).setValues([["annulée"]]);
      return { status: "success" };
    }
  }
  return err_("Séance introuvable.");
}

// ---------- Matchs, points et classement ----------
function statsAll_() {
  var cache = CacheService.getScriptCache(), hit = cache.get("stats:all");
  if (hit) return jsonSafe_(hit);
  var rows = rowsOf_(shMatchs_()), st = {};
  function bump(p, won, sport) {
    var k = String(p).toLowerCase(), o = st[k] = st[k] || { games: 0, wins: 0, points: 0, bySport: {} };
    o.games++; if (won) o.wins++; o.points += won ? PTS_WIN : PTS_LOSS;
    o.bySport[sport] = (o.bySport[sport] || 0) + 1;
  }
  rows.forEach(function (r) {
    if (r[7] !== "confirmé") return;
    var aWon = Number(r[6]) === 1, sport = String(r[4]);
    bump(r[2], aWon, sport); bump(r[3], !aWon, sport);
  });
  try { cache.put("stats:all", JSON.stringify(st), 120); } catch (e) {}
  return st;
}
function statsOf_(all, pseudo) { return all[String(pseudo).toLowerCase()] || { games: 0, wins: 0, points: 0, bySport: {} }; }

function matchSubmit_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var opp = findAccount_(String(d.opponent || "").replace(/^@/, ""));
  if (!opp) return err_("Adversaire introuvable : saisissez son pseudo exact.");
  if (opp.pseudo.toLowerCase() === String(me.pseudo).toLowerCase()) return err_("Vous ne pouvez pas jouer contre vous-même.");
  var sport = clip_(d.sport, 30), score = clip_(d.score, 30);
  if (!sport) return err_("Choisissez un sport.");
  if (d.outcome !== "win" && d.outcome !== "loss") return err_("Résultat invalide.");
  var lim = rate_("msub:" + me.pseudo, 10, 21600, "Trop de résultats envoyés aujourd'hui.");
  if (lim) return err_(lim);
  var now = new Date().getTime(), rows = rowsOf_(shMatchs_()), pair = 0, a = String(me.pseudo).toLowerCase(), b = opp.pseudo.toLowerCase();
  rows.forEach(function (r) {
    var x = String(r[2]).toLowerCase(), y = String(r[3]).toLowerCase();
    if (((x === a && y === b) || (x === b && y === a)) && now - Number(r[1]) < 86400000 && r[7] !== "refusé") pair++;
  });
  if (pair >= 3) return err_("Déjà 3 matchs enregistrés avec ce joueur aujourd'hui.");
  var id = now * 1000 + Math.floor(Math.random() * 1000);
  shMatchs_().appendRow([id, now, me.pseudo, opp.pseudo, safe_(sport), safe_(score), d.outcome === "win" ? 1 : 0, "en attente", ""]);
  return { status: "success", id: id, opponent: opp.pseudo };
}
function matchList_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var mine = String(me.pseudo).toLowerCase(), rows = rowsOf_(shMatchs_()), out = [], want = {};
  for (var i = rows.length - 1; i >= 0 && out.length < 100; i--) {
    var r = rows[i], x = String(r[2]), y = String(r[3]);
    if (x.toLowerCase() !== mine && y.toLowerCase() !== mine) continue;
    out.push({ id: Number(r[0]), ts: Number(r[1]), a: x, b: y, sport: String(r[4]), score: String(r[5]), aWon: Number(r[6]) === 1, status: String(r[7]), rts: Number(r[8]) || 0 });
    want[x.toLowerCase()] = 1; want[y.toLowerCase()] = 1;
  }
  var nm = nameMap_(), names = {};
  Object.keys(want).forEach(function (k) { if (nm[k]) names[nm[k].pseudo] = nm[k].name; });
  return { status: "success", matches: out, names: names, stats: statsOf_(statsAll_(), me.pseudo) };
}
function matchRespond_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), sh = shMatchs_(), rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== id) continue;
    if (String(rows[i][3]).toLowerCase() !== String(me.pseudo).toLowerCase()) return err_("Seul l'adversaire peut répondre.");
    if (rows[i][7] !== "en attente") return err_("Ce résultat a déjà reçu une réponse.");
    var ok = d.accept === true;
    sh.getRange(i + 1, 8, 1, 2).setValues([[ok ? "confirmé" : "refusé", new Date().getTime()]]);
    CacheService.getScriptCache().remove("stats:all");
    return { status: "success", accepted: ok };
  }
  return err_("Résultat introuvable.");
}
function leaderboard_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var all = statsAll_(), nm = nameMap_(), profs = profMap_(), list = [];
  Object.keys(all).forEach(function (k) {
    var acc = nm[k]; if (!acc || isBanned_(k)) return;
    var s = all[k];
    list.push({ pseudo: acc.pseudo, name: shownName_(acc, profs[k]), points: s.points, games: s.games, wins: s.wins });
  });
  list.sort(function (a, b) { return b.points - a.points || b.wins - a.wins || a.pseudo.localeCompare(b.pseudo); });
  var rank = 0; list.forEach(function (o, i) { if (o.pseudo.toLowerCase() === String(me.pseudo).toLowerCase()) rank = i + 1; });
  return { status: "success", top: list.slice(0, 30), total: list.length, rank: rank, me: statsOf_(all, me.pseudo) };
}

// ---------- Coachs ----------
function cleanCoach_(d) {
  var dip = []; (Array.isArray(d.diplomas) ? d.diplomas : []).slice(0, 5).forEach(function (x) { x = clip_(x, 60); if (x) dip.push(x); });
  var email = clip_(d.email, 80);
  return { title: clip_(d.title, 80), sport: clip_(d.sport, 40), price: Math.round(num_(d.price, 0, 500, 0)), exp: clip_(d.exp, 20), club: clip_(d.club, 80), city: clip_(d.city, 60),
    diplomas: dip, bio: clip_(d.bio, 400), phone: clip_(d.phone, 20), email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "" };
}
function coachApply_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  if (d.consent !== true) return err_("Merci d'accepter l'affichage public de votre fiche.");
  var c = cleanCoach_(d);
  if (!c.title || !c.sport) return err_("Indiquez votre titre et votre discipline.");
  var badK = badAny_([c.title, c.bio, c.club, c.city]); if (badK) return err_(badK);
  if (!c.email && !c.phone) return err_("Indiquez un moyen de contact (e-mail ou téléphone).");
  var lim = rate_("capp:" + me.pseudo, 5, 3600, "Trop de modifications. Réessayez plus tard.");
  if (lim) return err_(lim);
  var sh = shCoachs_(), rows = sh.getDataRange().getValues(), now = new Date().getTime(), json = JSON.stringify(c), mine = String(me.pseudo).toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === mine) {
      sh.getRange(i + 1, 1, 1, 5).setValues([[me.pseudo, me.name, json, "En attente", now]]);
      return { status: "success", state: "En attente" };
    }
  }
  sh.appendRow([me.pseudo, me.name, json, "En attente", now]);
  return { status: "success", state: "En attente" };
}
function coachList_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var rows = rowsOf_(shCoachs_()), out = [], mine = null, ml = String(me.pseudo).toLowerCase(), profs = profMap_();
  rows.forEach(function (r) {
    var p = String(r[0]), data = jsonSafe_(r[2]);
    if (p.toLowerCase() === ml) mine = { state: String(r[3]), data: data };
    if (r[3] !== "Validé" || out.length >= 100 || isBanned_(p)) return;
    var pr = profs[p.toLowerCase()];
    out.push({ pseudo: p, name: shownName_({ name: String(r[1]) }, pr), data: data });
  });
  return { status: "success", coaches: out, mine: mine };
}

// ---------- Annonces : likes, commentaires, suppression ----------
function postLike_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || "");
  if (!id) return err_("Annonce invalide.");
  var lim = rate_("lk:" + me.pseudo, 120, 3600, "Trop d'actions en peu de temps.");
  if (lim) return err_(lim);
  var sh = shLikes_(), rows = sh.getDataRange().getValues(), mine = String(me.pseudo).toLowerCase(), count = 0, at = -1;
  for (var i = 1; i < rows.length; i++) if (String(rows[i][0]) === id) { count++; if (String(rows[i][1]).toLowerCase() === mine) at = i; }
  if (at >= 0) { sh.deleteRow(at + 1); return { status: "success", liked: false, count: count - 1 }; }
  sh.appendRow([Number(id), me.pseudo]);
  return { status: "success", liked: true, count: count + 1 };
}
function postComment_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), text = String(d.text || "").trim().slice(0, 300);
  if (!id || !text) return err_("Commentaire vide.");
  var badC = badAny_([text]); if (badC) return err_(badC);
  var lim = rate_("cm:" + me.pseudo, 40, 3600, "Trop de commentaires en peu de temps.");
  if (lim) return err_(lim);
  var ok = false; sheet_("Annonces", true).getDataRange().getValues().forEach(function (r) { if (String(r[0]) === id) ok = true; });
  if (!ok) return err_("Cette annonce n'existe plus.");
  var now = new Date().getTime(), cid = now * 1000 + Math.floor(Math.random() * 1000);
  shComments_().appendRow([cid, Number(id), me.pseudo, me.name, safe_(text), now]);
  return { status: "success", id: cid, ts: now };
}
function postDelete_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), sh = sheet_("Annonces", true), rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][0]) === id) {
      if (String(rows[i][1]).toLowerCase() !== String(me.pseudo).toLowerCase()) return err_("Ce n'est pas votre annonce.");
      sh.deleteRow(i + 1);
      return { status: "success" };
    }
  }
  return err_("Annonce introuvable.");
}

// ---------- Quick Match : membres connectés pour un sport ----------
function quickMatch_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var want = norm_(clip_(d.sport, 30)).split(/[\s\/&]+/)[0];
  var profs = profMap_(), nm = nameMap_(), out = [], ml = String(me.pseudo).toLowerCase();
  Object.keys(profs).forEach(function (k) {
    if (k === ml || out.length >= 6 || isBanned_(k)) return;
    var pr = profs[k], sp = pr.data.sports || [], hit = !want;
    sp.forEach(function (s) { if (want && norm_(s.name).indexOf(want) >= 0) hit = true; });
    if (!hit) return;
    var st = presence_(pr.pseudo, pr);
    if (st !== "online") return;
    var o = light_(pr.pseudo, pr); o.pseudo = pr.pseudo; o.name = shownName_(nm[k], pr); o.city = pr.data.city || "";
    out.push(o);
  });
  return { status: "success", users: out };
}

// ---------- Compteurs publics ----------
function appStats_(d) {
  if (!sessionUser_(d.token)) return err_("Session expirée.");
  var cache = CacheService.getScriptCache(), hit = cache.get("appstats");
  if (hit) return jsonSafe_(hit);
  var members = Math.max(0, sheet_(SHEET_ACCOUNTS).getLastRow() - 1), bySport = {}, sess = {}, profs = profMap_(), now = new Date().getTime();
  Object.keys(profs).forEach(function (k) {
    var seen = {}; (profs[k].data.sports || []).forEach(function (s) { var n = String(s.name); if (!seen[n]) { seen[n] = 1; bySport[n] = (bySport[n] || 0) + 1; } });
  });
  rowsOf_(shSeances_()).forEach(function (r) { if (r[12] === "ouverte" && Number(r[7]) > now - 7200000) sess[String(r[3])] = (sess[String(r[3])] || 0) + 1; });
  var res = { status: "success", members: members, bySport: bySport, sessions: sess };
  try { cache.put("appstats", JSON.stringify(res), 300); } catch (e) {}
  return res;
}

// ---------- Liste d'attente (fonctions pas encore ouvertes) ----------
function interestAdd_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var kind = clip_(d.kind, 20) || "plus", sh = sheetH_(SH_INTERETS, ["date", "pseudo", "type"]), rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][1]).toLowerCase() === String(me.pseudo).toLowerCase() && rows[i][2] === kind) return { status: "success", already: true };
  sh.appendRow([new Date(), me.pseudo, kind]);
  return { status: "success" };
}

