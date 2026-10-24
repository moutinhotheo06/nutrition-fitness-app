/**
 * Spary · Messagerie (lot 26) : messages enrichis, réactions, suppression, « en train d'écrire », GIF, photos,
 * vidéos, vocaux, cartes séance/profil, « On y va ? » 1 h avant une séance.
 *
 * OÙ LE METTRE : nouveau fichier « Messagerie » (+ → Script). Il marche quelle que soit sa place dans la liste
 * (même tout en bas, sous Securite) : il réapplique lui-même les protections de Securite à ses actions.
 * Ne modifie aucun autre fichier, Code.gs compris.
 *
 * PUIS :
 *  1. Exécuter sp34Verifier : le journal doit afficher « OK » (et dire si les photos/vidéos/vocaux et les GIF sont prêts).
 *  2. Exécuter sp34Installer une fois (rappel « On y va ? » toutes les 15 min + ménage chaque nuit).
 *  3. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *
 * SCRIPT PROPERTIES (Paramètres du projet → Propriétés du script), jamais dans le code :
 *  - GIPHY_KEY            : clé API Giphy (developers.giphy.com). Sans elle, le bouton GIF est masqué.
 *  - Plus tard (vidéos et vocaux) : SUPABASE_URL et SUPABASE_SERVICE_KEY. Sans elles, vidéos et vocaux restent masqués.
 * PHOTOS : compressées sur le téléphone (100 Ko max), rangées dans un dossier Drive privé « Spary – Photos des messages »
 *  (créé tout seul, id dans la Script Property SP34_FOLDER). Seuls les membres de la conversation peuvent les afficher.
 *
 * Ce que ça enregistre (onglet MessagesPlus de BDD Spary, créé tout seul) :
 *   rev | message | conversation | membre | type | valeur (JSON) | date (ms)
 *   type « rich » = contenu enrichi d'un message (réponse à, GIF, photo, vidéo, vocal, carte, « j'arrive »),
 *   type « reac » = réaction emoji d'un membre à un message (vide = retirée),
 *   type « del »  = message supprimé par son auteur (son texte est remplacé dans l'onglet Messages, le fichier est effacé).
 *   Photos : dossier Drive privé (jamais partagé), envoyées par le serveur aux seuls membres de la conversation.
 *   Vidéos et vocaux (plus tard) : Supabase Storage, compartiment privé, liens temporaires de 6 h.
 * « En train d'écrire » : cache de 8 secondes, rien n'est écrit.
 * Suppression de compte : ses lignes et ses fichiers sont effacés. Export RGPD : ses réactions et ses pièces jointes.
 */

var SP34 = {
  installed: false,
  TAIL: 5000,                       // lignes lues en fin d'onglet (MessagesPlus et Messages)
  REACTS: ["❤️", "👍", "😂", "😮", "😢", "🔥", "👏", "💪"],
  ETA: { go: 1, late5: 1, late10: 1, late15: 1, out: 1 },
  TY_TTL: 8,
  BUCKET: "messages",
  SIGN_TTL: 21600,                  // liens de lecture valables 6 h
  MEDIA: {                          // tailles max et formats acceptés
    img: { max: 6 * 1048576, mime: /^image\/(jpeg|png|webp|gif|heic)$/ },
    vid: { max: 26 * 1048576, mime: /^video\/(mp4|quicktime|webm)$/ },
    aud: { max: 6 * 1048576, mime: /^audio\/(mp4|aac|m4a|x-m4a|webm|ogg|mpeg)$/ }
  },
  EXT: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic",
         "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
         "audio/mp4": "m4a", "audio/aac": "aac", "audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3" },
  GIF: /^https:\/\/(media\d?|i)\.giphy\.com\/media\/[A-Za-z0-9]+\/[A-Za-z0-9_.-]+\.(gif|webp|mp4)(\?[A-Za-z0-9=&._-]*)?$/,
  PHOTO_MAX: 140000,                // photo en data URL (≈ 100 Ko de JPEG) : sous la limite de 150 Ko de Securite
  wrapper: null
};

function sp34Sh_() { return sheetH_("MessagesPlus", ["rev", "message", "conversation", "membre", "type", "valeur (JSON)", "date (ms)"]); }
function sp34Lc_(s) { return String(s == null ? "" : s).toLowerCase(); }
function sp34Ps_(v) { v = String(v || "").replace(/^@/, "").trim(); return /^[A-Za-z0-9_.-]{3,20}$/.test(v) ? v : ""; }
function sp34Props_() { return PropertiesService.getScriptProperties(); }
function sp34Sb_() {
  var p = sp34Props_(), u = String(p.getProperty("SUPABASE_URL") || "").replace(/\/+$/, ""), k = String(p.getProperty("SUPABASE_SERVICE_KEY") || "");
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(u) && k.length > 40 ? { url: u, key: k } : null;
}
function sp34Locked_(fn) { return typeof sp8Locked_ === "function" ? sp8Locked_(fn) : fn(); }

/** Clé de conversation : « #123 » pour une séance ou un groupe, « a|b » (pseudos en minuscules, triés) pour une conversation privée. */
function sp34Conv_(from, to) {
  to = String(to || "");
  if (to.charAt(0) === "#") return /^#\d{1,20}$/.test(to) ? to : "";
  var a = sp34Lc_(from), b = sp34Lc_(to);
  if (!sp34Ps_(a) || !sp34Ps_(b)) return "";
  return [a, b].sort().join("|");
}
function sp34Folder_(conv) { return conv.charAt(0) === "#" ? "g/" + conv.slice(1) : "dm/" + conv.replace("|", "__"); }

/** Le membre peut-il lire / écrire dans cette conversation ? sids = ses séances et groupes (calculés une seule fois). */
function sp34CanSee_(me, conv, sids) {
  if (!conv) return false;
  if (conv.charAt(0) === "#") return !!(sids || mySeanceIds_(me))[conv.slice(1)];
  return conv.split("|").indexOf(sp34Lc_(me)) >= 0;
}
function sp34CanWrite_(me, to) {
  to = String(to || "");
  if (to.charAt(0) === "#") return /^#\d{1,20}$/.test(to) && !!mySeanceIds_(me)[to.slice(1)];
  var dest = findAccount_(sp34Ps_(to));
  if (!dest || sp34Lc_(dest.pseudo) === sp34Lc_(me)) return false;
  var bl = blocks_(me), dk = sp34Lc_(dest.pseudo);
  return !(bl.mine[dk] || bl.them[dk] || (typeof isBanned_ === "function" && isBanned_(dk)));
}

/** Retrouve un message (fin de l'onglet Messages). */
function sp34Msg_(id) {
  id = Number(id); if (!id) return null;
  var sh = sheet_("Messages", true), last = sh.getLastRow(); if (last < 1) return null;
  var first = Math.max(1, last - SP34.TAIL + 1), rows = sh.getRange(first, 1, last - first + 1, 5).getValues();
  for (var i = rows.length - 1; i >= 0; i--) if (Number(rows[i][0]) === id)
    return { row: first + i, id: id, from: String(rows[i][1]), to: String(rows[i][2]), text: String(rows[i][3]), ts: Number(rows[i][4]) };
  return null;
}

function sp34Rev_() { var r = Date.now() * 1000 + Math.floor(Math.random() * 1000); CacheService.getScriptCache().put("sp34:last", String(r), 21600); return r; }
function sp34Add_(msgId, conv, pseudo, type, val) {
  sp34Sh_().appendRow([sp34Rev_(), Number(msgId), conv, pseudo, type, val == null ? "" : JSON.stringify(val), Date.now()]);
}

/* ===================== Contenu enrichi (vérifié côté serveur) ===================== */
function sp34Clean_(r, me, to) {
  if (!r || typeof r !== "object") return null;
  var out = {}, conv = sp34Conv_(me.pseudo, to), k = String(r.k || "txt");
  if (r.re) {                                       // réponse à un message
    var re = Number(r.re);
    if (re > 0 && re < 1e17) { out.re = re; out.q = clip_(r.q, 140); out.qa = sp34Ps_(r.qa) || ""; }
  }
  if (k === "gif") {
    var u = String(r.u || ""); if (!SP34.GIF.test(u)) return out.re ? out : null;
    out.k = "gif"; out.u = u; out.w = Math.min(2000, Math.max(0, Math.round(Number(r.w) || 0))); out.h = Math.min(2000, Math.max(0, Math.round(Number(r.h) || 0)));
  } else if (k === "img" && !r.p) {                // photo envoyée avec le message (enregistrée dans Drive après l'envoi)
    var dt = String(r.data || ""), mm = dt.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+\/=]+)$/);
    if (!mm || dt.length > SP34.PHOTO_MAX) return out.re ? out : null;
    out.k = "img"; out._data = mm[2]; out._mime = "image/" + mm[1];
    out.w = Math.min(8000, Math.max(0, Math.round(Number(r.w) || 0))); out.h = Math.min(8000, Math.max(0, Math.round(Number(r.h) || 0)));
  } else if (k === "img" || k === "vid" || k === "aud") {
    var p = String(r.p || ""), pre = sp34Folder_(conv) + "/" + sp34Lc_(me.pseudo) + "/";
    if (!conv || p.indexOf(pre) !== 0 || !/^[a-z0-9_.\/-]{10,160}$/.test(p) || p.indexOf("..") >= 0) return out.re ? out : null;
    out.k = k; out.p = p;
    out.w = Math.min(8000, Math.max(0, Math.round(Number(r.w) || 0))); out.h = Math.min(8000, Math.max(0, Math.round(Number(r.h) || 0)));
    out.d = Math.min(600, Math.max(0, Math.round((Number(r.d) || 0) * 10) / 10));
    if (Array.isArray(r.wf)) out.wf = r.wf.slice(0, 48).map(function (x) { return Math.min(9, Math.max(0, Math.round(Number(x) || 0))); });
  } else if (k === "sess") {                        // carte de séance : on recopie les infos du serveur (pas celles du téléphone)
    var sid = String(Number(r.id) || ""), s = sid && typeof sp8SessRow_ === "function" ? sp8SessRow_(sid) : null;
    if (!s) return out.re ? out : null;
    out.k = "sess"; out.id = Number(sid); out.sport = clip_(s[3], 60); out.place = clip_(s[4], 80); out.start = Number(s[7]) || 0;
    out.dur = Number(s[15]) || 90; out.slots = Number(s[8]) || 0; out.level = clip_(s[10], 30); out.org = String(s[1]);
  } else if (k === "prof") {
    var acc = findAccount_(sp34Ps_(r.p));
    if (!acc) return out.re ? out : null;
    out.k = "prof"; out.p = acc.pseudo; out.n = clip_(acc.name, 40);
  } else if (k === "eta") {
    var v = String(r.v || ""); if (!SP34.ETA[v] || String(to).charAt(0) !== "#") return out.re ? out : null;
    out.k = "eta"; out.v = v;
  } else if (!out.re) return null;
  if (!out.k) out.k = "txt";
  return out;
}

/* ===================== Actions ===================== */
function sp34MsgSend_(e, data, prev) {
  var me = sessionUser_(data.token), rich = null;
  if (me && data.rich) { try { rich = sp34Clean_(data.rich, me, data.to); } catch (x) { rich = null; } }
  var res = prev(e);
  if (!rich) return res;
  var r = sp8Parse_(res);
  if (r && r.status === "success" && r.id) {
    try {
      if (rich._data) {
        var f = sp34Folder34_().createFile(Utilities.newBlob(Utilities.base64Decode(rich._data), rich._mime, "m" + r.id + "." + (SP34.EXT[rich._mime] || "jpg")));
        rich.f = f.getId(); delete rich._data; delete rich._mime;
      }
      sp34Locked_(function () { sp34Add_(r.id, sp34Conv_(me.pseudo, r.to || data.to), me.pseudo, "rich", rich); });
    }
    catch (x) { try { console.error("sp34 rich " + (x && x.message || x)); } catch (y) {} }
  }
  return res;
}

function sp34React_(d) {
  var me = sessionUser_(d.token); if (!me) return err_("Session expirée, reconnectez-vous.");
  var em = String(d.e || ""); if (em && SP34.REACTS.indexOf(em) < 0) return err_("Réaction inconnue.");
  var lim = rate_("sp34r:" + sp34Lc_(me.pseudo), 200, 3600, "Trop de réactions en peu de temps."); if (lim) return err_(lim);
  var m = sp34Msg_(d.id); if (!m) return err_("Message introuvable.");
  var conv = sp34Conv_(m.from, m.to); if (!sp34CanSee_(me.pseudo, conv)) return err_("Message introuvable.");
  return sp34Locked_(function () { sp34Add_(m.id, conv, me.pseudo, "reac", em); return { status: "success" }; });
}

function sp34Delete_(d) {
  var me = sessionUser_(d.token); if (!me) return err_("Session expirée, reconnectez-vous.");
  var lim = rate_("sp34d:" + sp34Lc_(me.pseudo), 60, 3600, "Trop de suppressions en peu de temps."); if (lim) return err_(lim);
  return sp34Locked_(function () {
    var m = sp34Msg_(d.id); if (!m) return err_("Message introuvable.");
    if (sp34Lc_(m.from) !== sp34Lc_(me.pseudo)) return err_("Tu peux seulement supprimer tes messages.");
    var conv = sp34Conv_(m.from, m.to), files = sp34FilesOf_(m.id);
    sheet_("Messages", true).getRange(m.row, 4).setValue("Message supprimé");
    sp34Add_(m.id, conv, me.pseudo, "del", 1);
    // Le contenu enrichi de ce message est vidé (on garde la ligne pour les réactions et l'ordre).
    sp34Rewrite_(function (r) { return Number(r[1]) === m.id && r[4] === "rich" ? null : r; });
    if (files.length) sp34SbDelete_(files);
    if (files.drive.length) sp34Trash_(files.drive);
    CacheService.getScriptCache().remove("sp34:ph:" + m.id);
    return { status: "success" };
  });
}

function sp34Typing_(d) {
  var me = sessionUser_(d.token); if (!me) return { status: "success" };
  var conv = sp34Conv_(me.pseudo, d.to); if (!conv) return { status: "success" };
  var c = CacheService.getScriptCache(), k = "sp34:ty:" + conv, o = {};
  try { o = JSON.parse(c.get(k) || "{}") || {}; } catch (x) { o = {}; }
  var now = Date.now(); Object.keys(o).forEach(function (p) { if (now - o[p] > SP34.TY_TTL * 1000) delete o[p]; });
  if (d.stop) delete o[sp34Lc_(me.pseudo)]; else o[sp34Lc_(me.pseudo)] = now;
  try { c.put(k, JSON.stringify(o), SP34.TY_TTL + 2); } catch (x) {}
  return { status: "success" };
}

function sp34Cfg_(d) {
  if (!sessionUser_(d.token)) return err_("Session expirée.");
  var p = sp34Props_();
  return { status: "success", giphy: String(p.getProperty("GIPHY_KEY") || ""), photos: true, media: !!sp34Sb_(), reacts: SP34.REACTS };
}

/** Prépare l'envoi d'une photo, vidéo ou vocal : renvoie une adresse d'envoi à usage unique (Supabase Storage). */
function sp34Media_(d) {
  var me = sessionUser_(d.token); if (!me) return err_("Session expirée, reconnectez-vous.");
  var sb = sp34Sb_(); if (!sb) return err_("Les pièces jointes ne sont pas encore activées.");
  var k = String(d.k || ""), spec = SP34.MEDIA[k], mime = String(d.mime || "").toLowerCase().split(";")[0], size = Number(d.size) || 0;
  if (!spec || !spec.mime.test(mime)) return err_("Format de fichier non accepté.");
  if (size <= 0 || size > spec.max) return err_("Fichier trop lourd (" + Math.round(spec.max / 1048576) + " Mo max).");
  var lim = rate_("sp34m:" + sp34Lc_(me.pseudo), 60, 3600, "Trop de fichiers envoyés en peu de temps. Réessaie plus tard."); if (lim) return err_(lim);
  if (typeof sp8MsgGuard_ === "function") { var g = sp8MsgGuard_({ token: d.token, to: d.to }); if (g) return err_(g); }
  if (!sp34CanWrite_(me.pseudo, d.to)) return err_("Impossible d'envoyer un fichier dans cette conversation.");
  var conv = sp34Conv_(me.pseudo, d.to);
  var path = sp34Folder_(conv) + "/" + sp34Lc_(me.pseudo) + "/" + Utilities.getUuid().replace(/-/g, "").slice(0, 20) + "." + (SP34.EXT[mime] || "bin");
  var r = UrlFetchApp.fetch(sb.url + "/storage/v1/object/upload/sign/" + SP34.BUCKET + "/" + path, {
    method: "post", muteHttpExceptions: true, contentType: "application/json", payload: "{}",
    headers: { Authorization: "Bearer " + sb.key, apikey: sb.key }
  });
  var j = jsonSafe_(r.getContentText());
  if (r.getResponseCode() !== 200 || !j.url) { try { console.error("sp34 sign " + r.getResponseCode() + " " + r.getContentText().slice(0, 200)); } catch (x) {} return err_("Envoi de fichier indisponible pour le moment."); }
  return { status: "success", path: path, upload: sb.url + "/storage/v1" + j.url, mime: mime };
}

/* ===================== Photos (Drive privé) ===================== */
function sp34Folder34_() {
  var p = sp34Props_(), id = p.getProperty("SP34_FOLDER");
  if (id) { try { return DriveApp.getFolderById(id); } catch (x) {} }
  var f = DriveApp.createFolder("Spary – Photos des messages (privé, ne pas partager)");
  p.setProperty("SP34_FOLDER", f.getId());
  return f;
}
/** Renvoie une photo d'un message, seulement à un membre de la conversation. */
function sp34Photo_(d) {
  var me = sessionUser_(d.token); if (!me) return err_("Session expirée.");
  var id = Number(d.id); if (!id) return err_("Photo introuvable.");
  var lim = rate_("sp34p:" + sp34Lc_(me.pseudo), 600, 3600, "Trop de photos chargées. Réessaie plus tard."); if (lim) return err_(lim);
  var c = CacheService.getScriptCache(), meta = jsonSafe_(c.get("sp34:ph:" + id) || "");
  if (!meta.f) {
    var sh = sp34Sh_(), n = sh.getLastRow(); if (n < 2) return err_("Photo introuvable.");
    var first = Math.max(2, n - SP34.TAIL * 2 + 1), rows = sh.getRange(first, 1, n - first + 1, 6).getValues();
    for (var i = rows.length - 1; i >= 0; i--) if (Number(rows[i][1]) === id && rows[i][4] === "rich") {
      var v = jsonSafe_(String(rows[i][5])); if (v.f) { meta = { f: v.f, conv: String(rows[i][2]) }; break; }
    }
    if (!meta.f) return err_("Photo introuvable.");
    try { c.put("sp34:ph:" + id, JSON.stringify(meta), 21600); } catch (x) {}
  }
  if (!sp34CanSee_(me.pseudo, meta.conv)) return err_("Photo introuvable.");
  try {
    var b = DriveApp.getFileById(meta.f).getBlob();
    return { status: "success", id: id, data: "data:" + b.getContentType() + ";base64," + Utilities.base64Encode(b.getBytes()) };
  } catch (x) { return err_("Photo introuvable."); }
}
function sp34Trash_(ids) { ids.forEach(function (f) { try { DriveApp.getFileById(f).setTrashed(true); } catch (x) {} }); }

/* ===================== Synchro : événements, liens de lecture, « en train d'écrire » ===================== */
function sp34Events_(me, since) {
  var c = CacheService.getScriptCache(), last = Number(c.get("sp34:last") || 0);
  since = Number(since) || 0;
  if (since && last && last <= since) return { rev: since, ev: [] };
  var sh = sp34Sh_(), n = sh.getLastRow(); if (n < 2) return { rev: since, ev: [] };
  var first = Math.max(2, n - SP34.TAIL + 1), rows = sh.getRange(first, 1, n - first + 1, 6).getValues();
  var ev = [], top = since, sids = null, blk = blocks_(me.pseudo), mine = sp34Lc_(me.pseudo), media = [];
  for (var i = 0; i < rows.length; i++) {
    var rev = Number(rows[i][0]); if (!rev || rev <= since) continue;
    var conv = String(rows[i][2]);
    if (conv.charAt(0) === "#") { if (!(sids = sids || mySeanceIds_(me.pseudo))[conv.slice(1)]) continue; }
    else if (conv.split("|").indexOf(mine) < 0) continue;
    var who = String(rows[i][3]);
    if (sp34Lc_(who) !== mine && hides_(blk, who)) continue;
    var v = null; try { v = rows[i][5] === "" ? null : JSON.parse(String(rows[i][5])); } catch (x) { v = null; }
    if (rows[i][4] === "rich" && v && v.p && (v.k === "img" || v.k === "vid" || v.k === "aud")) media.push(v);
    ev.push([rev, Number(rows[i][1]), String(rows[i][4]), who, v]);
    if (rev > top) top = rev;
  }
  if (media.length) { try { sp34Sign_(media); } catch (x) { try { console.error("sp34 liens " + (x && x.message || x)); } catch (y) {} } }
  return { rev: top, ev: ev.slice(-1500) };
}

/** Ajoute un lien de lecture temporaire (champ « s ») aux pièces jointes. Cache de 5 h par fichier. */
function sp34Sign_(list) {
  var sb = sp34Sb_(); if (!sb) return;
  var c = CacheService.getScriptCache(), need = [];
  list.forEach(function (v) { var hit = c.get("sp34:s:" + v.p); if (hit) v.s = hit; else if (need.indexOf(v.p) < 0) need.push(v.p); });
  for (var i = 0; i < need.length; i += 100) {
    var part = need.slice(i, i + 100);
    var r = UrlFetchApp.fetch(sb.url + "/storage/v1/object/sign/" + SP34.BUCKET, {
      method: "post", muteHttpExceptions: true, contentType: "application/json",
      payload: JSON.stringify({ expiresIn: SP34.SIGN_TTL, paths: part }),
      headers: { Authorization: "Bearer " + sb.key, apikey: sb.key }
    });
    if (r.getResponseCode() !== 200) { try { console.error("sp34 sign " + r.getResponseCode()); } catch (x) {} continue; }
    var arr = []; try { arr = JSON.parse(r.getContentText()); } catch (x) {}
    (Array.isArray(arr) ? arr : []).forEach(function (o) {
      if (!o || !o.signedURL || o.error) return;
      var full = sb.url + "/storage/v1" + o.signedURL;
      try { c.put("sp34:s:" + o.path, full, SP34.SIGN_TTL - 3600); } catch (x) {}
      list.forEach(function (v) { if (v.p === o.path) v.s = full; });
    });
  }
}

function sp34Typers_(me, to) {
  var conv = sp34Conv_(me.pseudo, to); if (!conv) return [];
  var o = {}; try { o = JSON.parse(CacheService.getScriptCache().get("sp34:ty:" + conv) || "{}") || {}; } catch (x) {}
  var now = Date.now(), mine = sp34Lc_(me.pseudo);
  return Object.keys(o).filter(function (p) { return p !== mine && now - o[p] < 7000; });
}

function sp34Sync_(e, data, prev) {
  var res = prev(e);
  if (data.x34 === undefined && !data.ty34) return res;
  try {
    var r = sp8Parse_(res), me = sessionUser_(data.token);
    if (!r || r.status !== "success" || !me) return res;
    if (data.x34 !== undefined) r.x34 = sp34Events_(me, data.x34);
    if (data.ty34) r.ty34 = sp34Typers_(me, data.ty34);
    return out_(r);
  } catch (x) {
    try { console.error("sp34 synchro " + (x && x.message || x)); } catch (y) {}
    return res;
  }
}

/* ===================== Fichiers (Supabase Storage) ===================== */
function sp34FilesOf_(msgId) {
  var o = [], dr = [];
  rowsOf_(sp34Sh_()).forEach(function (r) {
    if (Number(r[1]) !== Number(msgId) || r[4] !== "rich") return;
    var v = jsonSafe_(String(r[5])); if (v.p && (v.k === "img" || v.k === "vid" || v.k === "aud")) o.push(v.p); if (v.f) dr.push(v.f);
  });
  o.drive = dr;
  return o;
}
function sp34SbDelete_(paths) {
  var sb = sp34Sb_(); if (!sb || !paths.length) return;
  for (var i = 0; i < paths.length; i += 500) {
    try {
      UrlFetchApp.fetch(sb.url + "/storage/v1/object/" + SP34.BUCKET, {
        method: "delete", muteHttpExceptions: true, contentType: "application/json",
        payload: JSON.stringify({ prefixes: paths.slice(i, i + 500) }),
        headers: { Authorization: "Bearer " + sb.key, apikey: sb.key }
      });
    } catch (x) { try { console.error("sp34 suppression fichiers " + x); } catch (y) {} }
  }
}
function sp34Rewrite_(fn) {
  var sh = sp34Sh_(), v = sh.getDataRange().getValues(), head = v.shift(), keep = [];
  v.forEach(function (r) { var x = fn(r); if (x) keep.push(x); });
  if (keep.length === v.length) return 0;
  sh.getRange(2, 1, Math.max(1, v.length), head.length).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, head.length).setValues(keep);
  return v.length - keep.length;
}

/* ===================== « On y va ? » : notification 1 h avant chaque séance ===================== */
function sp34Wx_(s) {
  var lat = Number(s[5]), lng = Number(s[6]), st = Number(s[7]);
  if (!isFinite(lat) || !isFinite(lng) || (!lat && !lng) || typeof sp8Outdoor_ !== "function" || !sp8Outdoor_(s[3])) return "";
  var key = (Math.round(lat * 20) / 20).toFixed(2) + "," + (Math.round(lng * 20) / 20).toFixed(2), c = CacheService.getScriptCache(), o = null, hit = c.get("sp8:wx:" + key);
  if (hit) o = jsonSafe_(hit);
  else {
    var p = key.split(","), r = UrlFetchApp.fetch("https://api.open-meteo.com/v1/forecast?latitude=" + p[0] + "&longitude=" + p[1] + "&hourly=temperature_2m,precipitation_probability,weather_code&timezone=Europe%2FParis&forecast_days=2", { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return "";
    var h = jsonSafe_(r.getContentText()).hourly; if (!h || !Array.isArray(h.time)) return "";
    o = { t: h.time, a: h.temperature_2m || [], p: h.precipitation_probability || [], c: h.weather_code || [] };
    try { c.put("sp8:wx:" + key, JSON.stringify(o), 3600); } catch (x) {}
  }
  if (!o || !o.t) return "";
  var i = o.t.indexOf(Utilities.formatDate(new Date(st), "Europe/Paris", "yyyy-MM-dd'T'HH:00")); if (i < 0) return "";
  var pr = Number(o.p[i]) || 0;
  return sp8WxCode_(o.c[i]) + " " + Math.round(Number(o.a[i])) + " °C" + (pr >= 20 ? ", pluie " + pr + " %" : "");
}

/** Déclencheur toutes les 15 min : séances qui commencent dans 45 à 60 min. */
function sp34Rappels() {
  if (typeof sp14Queue_ !== "function") return;
  var now = Date.now(), c = CacheService.getScriptCache(), todo = [];
  rowsOf_(shSeances_()).forEach(function (s) {
    var st = Number(s[7]), id = String(s[0]);
    if (s[12] !== "ouverte" || st <= now + 44 * 60000 || st > now + 61 * 60000 || c.get("sp34:go:" + id)) return;
    todo.push(s);
  });
  if (!todo.length) return;
  todo.forEach(function (s) {
    var id = String(s[0]), who = sp14Players_(id).concat([String(s[1])]), wx = "";
    try { wx = sp34Wx_(s); } catch (x) {}
    var hm = Utilities.formatDate(new Date(Number(s[7])), "Europe/Paris", "HH'h'mm").replace(/h00$/, "h");
    try { c.put("sp34:go:" + id, "1", 6 * 3600); } catch (x) {}
    sp34Locked_(function () {
      sp14Queue_(who, {
        title: "On y va ? " + clip_(s[3], 40) + " à " + hm,
        body: clip_(s[4], 60) + (wx ? " · " + wx : "") + ". Dis aux autres si tu arrives.",
        url: "./#seance=" + id, subject: "go:" + id
      }, { always: true });
    });
  });
  try { sp14Flush_(); } catch (x) {}
}

/** Ménage chaque nuit : lignes dont le message n'existe plus (compte supprimé, purge RGPD). */
function sp34Nettoyer() {
  var ids = {};
  rowsAll_(sheet_("Messages", true)).forEach(function (r) { if (r[0]) ids[Number(r[0])] = 1; });
  var gone = [], dr = [], n = sp34Locked_(function () {
    return sp34Rewrite_(function (r) {
      if (ids[Number(r[1])]) return r;
      var v = r[4] === "rich" ? jsonSafe_(String(r[5])) : {};
      if (v.p && (v.k === "img" || v.k === "vid" || v.k === "aud")) gone.push(v.p);
      if (v.f) dr.push(v.f);
      return null;
    });
  });
  if (gone.length) sp34SbDelete_(gone);
  if (dr.length) sp34Trash_(dr);
  if (n) console.log("sp34Nettoyer : " + n + " ligne(s) retirée(s), " + gone.length + " fichier(s) effacé(s).");
}

/* ===================== Installation ===================== */
function sp34Install_() {
  if (SP34.installed || typeof doPost !== "function" || typeof sessionUser_ !== "function") return;
  SP34.installed = true;
  var prev = doPost, secPrev = typeof SEC !== "undefined" && SEC && SEC.installed && SEC.wrapper === doPost;
  var handle = function (e, data) {
    switch (data.action) {
      case "msgSend":    return data.rich ? sp34MsgSend_(e, data, prev) : null;
      case "msgSync":    return sp34Sync_(e, data, prev);
      case "react34":    return out_(sp34React_(data));
      case "del34":      return out_(sp34Delete_(data));
      case "typing34":   return out_(sp34Typing_(data));
      case "cfg34":      return out_(sp34Cfg_(data));
      case "media34":    return out_(sp34Media_(data));
      case "photo34":    return out_(sp34Photo_(data));
    }
    return null;
  };
  SP34.wrapper = function (e) {
    var raw = e && e.postData && typeof e.postData.contents === "string" ? e.postData.contents : "";
    var data = null; try { data = JSON.parse(raw); } catch (x) {}
    if (!data || !data.action || !/^(msgSend|msgSync|react34|del34|typing34|cfg34|media34|photo34)$/.test(data.action)) return prev(e);
    if (data.action === "msgSend" && !data.rich) return prev(e);
    if (data.action === "msgSync" && data.x34 === undefined && !data.ty34) return prev(e);
    // Placé sous Securite : on applique ses protections à nos actions avant de les traiter.
    if (secPrev) {
      if (raw.length > SEC.MAX_BYTES) return out_(err_("Requête trop volumineuse."));
      try { var stop = secGuard_(data); if (stop) return out_(stop); } catch (x) {}
      var flag = { changed: false }; data = secClean_(data, 0, flag);
    }
    try { return handle(e, data) || prev(e); }
    catch (err) {
      var m = String(err && err.message || err);
      try { console.error("sp34 " + m + " | " + (err && err.stack || "")); } catch (x) {}
      return out_({ status: "error", message: /lock/i.test(m) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
  };
  doPost = SP34.wrapper;
  if (secPrev) SEC.wrapper = doPost;   // secVerifier reste « OK »

  // Suppression de compte : ses lignes et ses fichiers.
  var baseDelete = deleteAccountData_;
  deleteAccountData_ = function (pseudo) {
    baseDelete(pseudo);
    try {
      var p = sp34Lc_(pseudo), files = [], dr = [];
      sp34Rewrite_(function (r) {
        if (sp34Lc_(r[3]) !== p) return r;
        var v = r[4] === "rich" ? jsonSafe_(String(r[5])) : {};
        if (v.p) files.push(v.p);
        if (v.f) dr.push(v.f);
        return null;
      });
      sp34SbDelete_(files); sp34Trash_(dr);
    } catch (x) { try { console.error("sp34 suppression compte " + x); } catch (y) {} }
  };
  // Export RGPD : ses réactions et ses pièces jointes (sans les liens).
  var baseExport = accountExport_;
  accountExport_ = function (d) {
    var r = baseExport(d);
    try {
      if (r && r.status === "success" && r.data && r.data.pseudo) {
        var p = sp34Lc_(r.data.pseudo), reac = [], att = [];
        rowsOf_(sp34Sh_()).forEach(function (x) {
          if (sp34Lc_(x[3]) !== p) return;
          var v = jsonSafe_(String(x[5]));
          if (x[4] === "reac" && x[5] !== "") reac.push({ message: Number(x[1]), reaction: JSON.parse(String(x[5])), date: new Date(Number(x[6])).toISOString() });
          if (x[4] === "rich") att.push({ message: Number(x[1]), type: v.k, fichier: v.p || (v.f ? "photo Drive " + v.f : ""), gif: v.u || "", reponse_a: v.re || "", date: new Date(Number(x[6])).toISOString() });
        });
        r.data.messagerie = { reactions: reac, contenus_enrichis: att };
      }
    } catch (x) {}
    return r;
  };
}
sp34Install_();

/** À lancer une fois après l'installation : crée le rappel « On y va ? » (toutes les 15 min) et le ménage de nuit. */
function sp34Installer() {
  ScriptApp.getProjectTriggers().forEach(function (t) { var h = t.getHandlerFunction(); if (h === "sp34Rappels" || h === "sp34Nettoyer") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("sp34Rappels").timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger("sp34Nettoyer").timeBased().everyDays(1).atHour(4).inTimezone("Europe/Paris").create();
  console.log("OK : rappel « On y va ? » toutes les 15 min et ménage chaque nuit installés.");
}

/** Vérifie l'installation, prépare le compartiment Supabase et dit ce qui est actif. */
function sp34Verifier() {
  if (!SP34.installed) return console.log("PROBLÈME : le fichier Messagerie n'est pas chargé (Code.gs et Nouveautes doivent être au-dessus).");
  sp34Sh_();
  console.log("OK : réactions, réponses, suppression, « en train d'écrire », cartes et « On y va ? » actifs (onglet MessagesPlus).");
  console.log(sp34Props_().getProperty("GIPHY_KEY") ? "GIF : clé Giphy présente." : "GIF : ajoute la Script Property GIPHY_KEY pour activer le bouton GIF.");
  console.log("Photos : dossier Drive privé prêt (« " + sp34Folder34_().getName() + " »).");
  var sb = sp34Sb_();
  if (!sb) return console.log("Vidéos et vocaux : pas encore activés (plus tard, avec SUPABASE_URL et SUPABASE_SERVICE_KEY).");
  var h = { Authorization: "Bearer " + sb.key, apikey: sb.key };
  var g = UrlFetchApp.fetch(sb.url + "/storage/v1/bucket/" + SP34.BUCKET, { muteHttpExceptions: true, headers: h });
  if (g.getResponseCode() !== 200) {
    var cr = UrlFetchApp.fetch(sb.url + "/storage/v1/bucket", { method: "post", muteHttpExceptions: true, contentType: "application/json", headers: h,
      payload: JSON.stringify({ id: SP34.BUCKET, name: SP34.BUCKET, public: false, file_size_limit: 26 * 1048576,
        allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "video/mp4", "video/quicktime", "video/webm", "audio/mp4", "audio/aac", "audio/m4a", "audio/x-m4a", "audio/webm", "audio/ogg", "audio/mpeg"] }) });
    if (cr.getResponseCode() !== 200) return console.log("PROBLÈME Supabase (" + cr.getResponseCode() + ") : " + cr.getContentText().slice(0, 200) + ". Vérifie SUPABASE_URL et la clé service_role.");
    console.log("Compartiment privé « messages » créé dans Supabase.");
  }
  console.log("OK : photos, vidéos et vocaux actifs (Supabase, compartiment privé « messages »).");
}

