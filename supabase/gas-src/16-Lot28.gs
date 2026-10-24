/**
 * Spary · Lot 28 : exercices perso et modèles de séance liés au compte, diagnostic du palmarès.
 *
 * OÙ LE METTRE : nouveau fichier « Lot28 » (+ → Script), TOUT EN BAS de la liste des fichiers (sous Lot27).
 * Ne modifie aucun autre fichier, Code.gs compris. Comme Lot27, il réapplique lui-même les protections de Securite.
 *
 * PUIS :
 *  1. Exécuter lot28Verifier : le journal doit afficher « OK ». Il teste aussi le palmarès de chaque membre
 *     et affiche les erreurs éventuelles (c'est ce qu'il faut me copier si le palmarès ne charge toujours pas).
 *  2. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *
 * Ce que ça ajoute :
 *  - lib28Get / lib28Save : les exercices créés par le membre et ses modèles de séance, gardés avec son compte
 *    (retrouvés sur un autre téléphone). Trois onglets créés tout seuls :
 *      ExercicesPerso : membre | id | nom | groupe | cree
 *      ModelesSeance  : membre | id | nom | sport | type | details (JSON, même format que les séances) | cree | maj | utilise
 *      Bibliotheque   : membre | rev (version de la liste, pour savoir quel appareil est à jour)
 *    Mêmes colonnes que les futures tables Supabase exercices_perso et modeles_seance.
 *  - profil16 (palmarès) : même calcul qu'avant, mais en cas d'erreur le détail (fichier et ligne) est écrit
 *    dans le journal d'exécution (« lot28 profil16 ») au lieu d'un simple « Erreur serveur ».
 *  - Suppression de compte et export RGPD : ces données sont incluses.
 * Sans ce fichier, le site marche : exercices et modèles restent sur le téléphone, et le palmarès
 * est calculé sur le téléphone si le serveur ne répond pas.
 */

var L28 = { installed: false, MAX_EX: 100, MAX_TPL: 40, MAX_DET: 4000,
  GROUPS: ["Pecs", "Dos", "Jambes", "Épaules", "Bras", "Abdos", "Cardio", "Autre"],
  H_EX: ["membre", "id", "nom", "groupe", "cree"],
  H_TPL: ["membre", "id", "nom", "sport", "type", "details", "cree", "maj", "utilise"],
  H_REV: ["membre", "rev"] };

function l28ShEx_() { return sheetH_("ExercicesPerso", L28.H_EX); }
function l28ShTpl_() { return sheetH_("ModelesSeance", L28.H_TPL); }
function l28ShRev_() { return sheetH_("Bibliotheque", L28.H_REV); }
function l28Lc_(s) { return String(s == null ? "" : s).toLowerCase(); }
/** Texte court, sans formule (= + - @ en tête), espaces normalisés. */
function l28Txt_(v, n) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().replace(/^[=+\-@]+/, "").trim().slice(0, n); }
function l28Id_(v) { v = String(v || ""); return /^[a-z0-9]{4,24}$/.test(v) ? v : ""; }
function l28Ts_(v) { var n = Math.round(Number(v) || 0); return n > 1.5e12 && n < 4e12 ? n : 0; }

/** Lignes d'un onglet (sans l'en-tête). */
function l28Rows_(sh, w) { var last = sh.getLastRow(); return last >= 2 ? sh.getRange(2, 1, last - 1, w).getValues() : []; }
/** Remplace les lignes d'un membre (sous verrou) : relit tout, enlève les siennes, ajoute les nouvelles, réécrit. */
function l28Replace_(sh, w, p, rows) {
  var keep = l28Rows_(sh, w).filter(function (r) { return r[0] !== "" && l28Lc_(r[0]) !== p; });
  var all = keep.concat(rows), last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, w).clearContent();
  if (all.length) sh.getRange(2, 1, all.length, w).setValues(all);
}

function l28Rev_(p) {
  var rev = 0;
  l28Rows_(l28ShRev_(), 2).forEach(function (r) { if (l28Lc_(r[0]) === p) rev = Number(r[1]) || 0; });
  return rev;
}
function l28Lib_(p) {
  var ex = [], tpl = [];
  l28Rows_(l28ShEx_(), 5).forEach(function (r) { if (l28Lc_(r[0]) === p && r[1]) ex.push({ id: String(r[1]), n: String(r[2]), g: String(r[3] || "Autre"), c: Number(r[4]) || 0 }); });
  l28Rows_(l28ShTpl_(), 9).forEach(function (r) {
    if (l28Lc_(r[0]) !== p || !r[1]) return;
    var det = jsonSafe_(String(r[5] || "")); if (!det || typeof det !== "object") det = {};
    tpl.push({ id: String(r[1]), n: String(r[2]), sport: String(r[3]), det: det, c: Number(r[6]) || 0, m: Number(r[7]) || 0, u: Number(r[8]) || 0 });
  });
  return { rev: l28Rev_(p), ex: ex, tpl: tpl };
}

/** Détails d'un modèle : même validation que les séances (fichier Performances) si elle est disponible. */
function l28Det_(sport, det) {
  if (!det || typeof det !== "object" || Array.isArray(det)) return null;
  var d = JSON.parse(JSON.stringify(det)); delete d.tpl;
  if (typeof sp26Det_ === "function") { var r = sp26Det_(sport, d); if (!r || r.e) return null; d = r.det; }
  var s = JSON.stringify(d);
  return s.length <= L28.MAX_DET ? d : null;
}

function l28Get_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  return { status: "success", lib: l28Lib_(l28Lc_(me.pseudo)) };
}

function l28Save_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var p = l28Lc_(me.pseudo), now = Date.now(), rev = l28Ts_(d.rev) || now, seen = {};
  var ex = (Array.isArray(d.ex) ? d.ex : []).slice(0, L28.MAX_EX).map(function (x) {
    x = x || {}; var id = l28Id_(x.id), n = l28Txt_(x.n, 40); if (!id || !n || seen[id]) return null; seen[id] = 1;
    var g = L28.GROUPS.indexOf(String(x.g)) >= 0 ? String(x.g) : "Autre";
    return [me.pseudo, id, n, g, l28Ts_(x.c) || now];
  }).filter(Boolean);
  var tpl = (Array.isArray(d.tpl) ? d.tpl : []).slice(0, L28.MAX_TPL).map(function (x) {
    x = x || {}; var id = l28Id_(x.id), n = l28Txt_(x.n, 40), sport = l28Txt_(x.sport, 40); if (!id || !n || !sport || seen[id]) return null; seen[id] = 1;
    var det = l28Det_(sport, x.det); if (!det) return null;
    return [me.pseudo, id, n, sport, String(det.k || ""), JSON.stringify(det), l28Ts_(x.c) || now, l28Ts_(x.m) || now, l28Ts_(x.u)];
  }).filter(Boolean);
  var stale = false;
  sp8Locked_(function () {
    if (l28Rev_(p) > rev) { stale = true; return; }   // un autre appareil a écrit plus récemment : l'appli refusionne
    l28Replace_(l28ShEx_(), 5, p, ex);
    l28Replace_(l28ShTpl_(), 9, p, tpl);
    l28Replace_(l28ShRev_(), 2, p, [[me.pseudo, rev]]);
  });
  if (stale) return { status: "success", stale: 1, lib: l28Lib_(p) };
  return { status: "success", rev: rev, ex: ex.length, tpl: tpl.length };
}

/** Supprime les données d'un membre (suppression de compte). */
function l28Delete_(pseudo) {
  var p = l28Lc_(pseudo);
  sp8Locked_(function () { l28Replace_(l28ShEx_(), 5, p, []); l28Replace_(l28ShTpl_(), 9, p, []); l28Replace_(l28ShRev_(), 2, p, []); });
}

function l28Install_() {
  if (L28.installed || typeof doPost !== "function" || typeof sessionUser_ !== "function") return;
  L28.installed = true;
  var prev = doPost, secPrev = typeof SEC !== "undefined" && SEC && SEC.installed && SEC.wrapper === doPost;
  var wrapper = function (e) {
    var raw = e && e.postData && typeof e.postData.contents === "string" ? e.postData.contents : "";
    var data = null; try { data = JSON.parse(raw); } catch (x) {}
    var a = data ? String(data.action || "") : "";
    var pal = a === "profil16" && typeof sp26Profile_ === "function";
    if (!pal && a !== "lib28Get" && a !== "lib28Save") return prev(e);
    if (secPrev) {
      if (raw.length > SEC.MAX_BYTES) return out_(err_("Requête trop volumineuse."));
      try { var stop = secGuard_(data); if (stop) return out_(stop); } catch (x) {}
      var flag = { changed: false }; data = secClean_(data, 0, flag);
    }
    try { return out_(pal ? sp26Profile_(data) : a === "lib28Get" ? l28Get_(data) : l28Save_(data)); }
    catch (err) {
      var m = String(err && err.message || err);
      // l'erreur exacte (avec la ligne) reste dans le journal d'exécution
      try { console.error("lot28 " + a + " " + (err && err.stack || m)); } catch (x) {}
      return out_({ status: "error", message: /lock/i.test(m) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
  };
  doPost = wrapper;
  if (secPrev) SEC.wrapper = doPost;

  if (typeof deleteAccountData_ === "function") {
    var del = deleteAccountData_;
    deleteAccountData_ = function (pseudo) { var r = del(pseudo); try { l28Delete_(pseudo); } catch (x) {} return r; };
  }
  if (typeof accountExport_ === "function") {
    var exp = accountExport_;
    accountExport_ = function (d) {
      var r = exp(d);
      try { if (r && r.status === "success" && r.data && r.data.pseudo) { var l = l28Lib_(l28Lc_(r.data.pseudo)); r.data.exercicesPerso = l.ex; r.data.modelesSeance = l.tpl; } } catch (x) {}
      return r;
    };
  }
}
l28Install_();

/** Vérifie l'installation et teste le palmarès de chaque membre (lecture seule). */
function lot28Verifier() {
  if (!L28.installed) return console.log("PROBLÈME : Lot28 n'est pas chargé (place-le tout en bas, sous Lot27).");
  l28ShEx_(); l28ShTpl_(); l28ShRev_();
  console.log("OK : exercices perso et modèles de séance actifs (onglets ExercicesPerso, ModelesSeance, Bibliotheque).");
  if (typeof sp26All_ !== "function" || typeof sp26Palmares_ !== "function") return console.log("Palmarès : fichier Performances introuvable.");
  var t0 = Date.now(), all = sp26All_(), t1 = Date.now(), by = {}, bad = 0;
  all.forEach(function (t) { var k = l28Lc_(t.owner); (by[k] = by[k] || []).push(t); });
  Object.keys(by).forEach(function (p) {
    try { sp26Palmares_(by[p], all, p, true); }
    catch (err) { bad++; console.log("PALMARÈS EN ERREUR pour " + p + " : " + (err && err.stack || err)); }
  });
  console.log("Palmarès : " + all.length + " séances lues en " + (t1 - t0) + " ms, " + Object.keys(by).length + " membres testés en " + (Date.now() - t1) + " ms, " + bad + " en erreur.");
}
