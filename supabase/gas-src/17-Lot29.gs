/**
 * Spary · Lot 29 : les entraînements comptent comme des séances (points), rattrapage du passé,
 * publication d'un entraînement dans le fil avec un commentaire.
 *
 * OÙ LE METTRE : nouveau fichier « Lot29 » (+ → Script), TOUT EN BAS de la liste des fichiers (sous Lot28).
 * Ne modifie aucun autre fichier, Code.gs compris. Comme Lot28, il réapplique lui-même les protections de Securite.
 *
 * PUIS :
 *  1. Exécuter lot29Simuler : le journal montre les points qui seraient ajoutés aux entraînements passés (rien n'est écrit).
 *  2. Exécuter lot29Rattrapage : ajoute ces points (une seule fois : relancer ne double rien).
 *  3. Exécuter lot29Verifier : le journal doit afficher « OK ».
 *  4. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *
 * Règle des points (modifiable ci-dessous) :
 *  - chaque entraînement d'au moins 10 min rapporte 100 pts, au plus 2 entraînements récompensés par jour (heure de Paris) ;
 *  - ce quota est séparé de celui de « Poster une séance » (1 par jour, inchangé) ;
 *  - supprimer un entraînement retire ses points (déjà le cas avant) ;
 *  - publier un entraînement dans le fil ne rapporte pas de points en plus : l'entraînement a déjà les siens.
 * Onglet créé tout seul : PublicationsEntrainement (entrainement | annonce | membre | date).
 */

var L29 = { installed: false, POINTS: 100, PER_DAY: 2, MIN_S: 600, TYPE: "entrainement",
  H_PUB: ["entrainement", "annonce", "membre", "date (ms)"] };

function l29Lc_(s) { return String(s == null ? "" : s).toLowerCase(); }
function l29Day_(ms) { return Utilities.formatDate(new Date(ms || Date.now()), (typeof SP8 !== "undefined" && SP8.TZ) || "Europe/Paris", "yyyy-MM-dd"); }
function l29ShPub_() { return sheetH_("PublicationsEntrainement", L29.H_PUB); }
function l29Rows_(sh, w) { var last = sh.getLastRow(); return last >= 2 ? sh.getRange(2, 1, last - 1, w).getValues() : []; }

/** Points d'un entraînement (clé "e:id" ou "e:id:g" pour l'invité). Appelée sous verrou. */
function l29Award_(pseudo, key) {
  var today = l29Day_(), p = l29Lc_(pseudo), n = 0, dup = false;
  l29Rows_(sp8ShPoints_(), 6).forEach(function (r) {
    if (l29Lc_(r[1]) !== p) return;
    var k = String(r[3]);
    if (k === key) dup = true;
    if (k.indexOf("e:") === 0 && String(r[5]) === today) n++;
  });
  if (dup) return { points: 0, capped: false, dup: true };
  if (n >= L29.PER_DAY) return { points: 0, capped: true };
  sp8ShPoints_().appendRow([Date.now(), pseudo, L29.TYPE, key, L29.POINTS, today]);
  sp26DropCaches_();
  return { points: L29.POINTS, capped: false };
}

/* ===================== Rattrapage des entraînements passés ===================== */
/** Lignes de points manquantes : entraînement ≥ 10 min, pas encore récompensé, 2 par membre et par jour au plus. */
function l29Missing_() {
  var have = {}, perDay = {}, hid = typeof hidden_ === "function" ? hidden_() : {};
  l29Rows_(sp8ShPoints_(), 6).forEach(function (r) {
    var k = String(r[3]); if (k.indexOf("e:") !== 0) return;
    have[l29Lc_(r[1]) + "|" + k] = 1;
    var d = l29Lc_(r[1]) + "|" + String(r[5]); perDay[d] = (perDay[d] || 0) + 1;
  });
  var add = [];
  sp26All_().sort(function (a, b) { return a.start - b.start; }).forEach(function (t) {
    if (!t.id || !(t.dur >= L29.MIN_S) || hid["entrainement:" + t.id]) return;
    var who = [[t.owner, "e:" + t.id]];
    if (t.with && t.wst === "accepté") who.push([t.with, "e:" + t.id + ":g"]);
    who.forEach(function (w) {
      var p = l29Lc_(w[0]); if (!p || have[p + "|" + w[1]]) return;
      var day = l29Day_(t.start || Date.now()), d = p + "|" + day;
      if ((perDay[d] || 0) >= L29.PER_DAY) return;
      perDay[d] = (perDay[d] || 0) + 1; have[p + "|" + w[1]] = 1;
      add.push([Number(t.start) || Date.now(), String(w[0]), L29.TYPE, w[1], L29.POINTS, day]);
    });
  });
  return add;
}
function l29Report_(add) {
  var by = {};
  add.forEach(function (r) { var k = r[1]; by[k] = (by[k] || 0) + r[4]; });
  var keys = Object.keys(by);
  keys.forEach(function (k) { console.log("  " + k + " : +" + by[k] + " pts"); });
  return keys.length;
}
/** Montre ce que ferait le rattrapage, sans rien écrire. */
function lot29Simuler() {
  var add = l29Missing_();
  console.log(add.length + " entraînement(s) passé(s) à récompenser :");
  l29Report_(add);
  if (!add.length) console.log("Rien à rattraper.");
}
/** Ajoute les points manquants (sous verrou ; relancer ne double rien). */
function lot29Rattrapage() {
  var add = sp8Locked_(function () {
    var a = l29Missing_();
    if (a.length) { var sh = sp8ShPoints_(); sh.getRange(sh.getLastRow() + 1, 1, a.length, 6).setValues(a); }
    return a;
  });
  sp26DropCaches_();
  console.log("Rattrapage fait : " + add.length + " entraînement(s) récompensé(s).");
  l29Report_(add);
}

/* ===================== Publier un entraînement dans le fil ===================== */
function l29Post_(e, data, prev) {
  var me = sessionUser_(data.token);
  if (!me) return out_(err_("Session expirée, reconnectez-vous."));
  var id = String(data.train || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40), p = l29Lc_(me.pseudo);
  if (!id) return prev(e);
  // déjà publiée (et l'annonce existe encore) ?
  var live = {};
  try { rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (r[0]) live[String(r[0])] = 1; }); } catch (x) { live = null; }
  var already = l29Rows_(l29ShPub_(), 4).some(function (r) { return String(r[0]) === id && l29Lc_(r[2]) === p && (!live || live[String(r[1])]); });
  if (already) return out_(err_("Cette séance est déjà publiée dans le fil."));
  // sport et durée lus sur le serveur quand l'entraînement y est déjà
  var t = null;
  sp26All_().forEach(function (x) { if (x.id === id && l29Lc_(x.owner) === p) t = x; });
  var d = JSON.parse(JSON.stringify(data));
  if (t) { d.sport = t.sport; d.dur = Math.max(1, Math.round(t.dur / 60)); }
  d.dur = Math.min(480, Math.max(1, Math.round(Number(d.dur) || 0)));
  delete d.train;
  var e2 = { parameter: e && e.parameter || {}, postData: { contents: JSON.stringify(d), type: "application/json" } };
  var keepDur = SP8.SEANCE_MIN_DUR, keepTxt = SP8.SEANCE_MIN_TEXT, res;
  SP8.SEANCE_MIN_DUR = 1; SP8.SEANCE_MIN_TEXT = 1;   // un entraînement publié peut être court ; le texte contient toujours le résumé
  try { res = sp8Parse_(prev(e2)); } finally { SP8.SEANCE_MIN_DUR = keepDur; SP8.SEANCE_MIN_TEXT = keepTxt; }
  if (!res || res.status !== "success" || !res.id) return out_(res || err_("Publication impossible."));
  var aid = String(res.id);
  sp8After_(function () {
    // pas de points en double : l'entraînement a déjà les siens
    if (res.points > 0) rewriteRows_(sp8ShPoints_(), function (r) { return r[2] === "seance" && String(r[3]) === aid && l29Lc_(r[1]) === p ? null : r; });
    l29ShPub_().appendRow([id, aid, me.pseudo, Date.now()]);
    sp26DropCaches_();
  });
  res.points = 0; res.capped = false; res.train = id;
  return out_(res);
}

/* ===================== Installation ===================== */
function l29Install_() {
  if (L29.installed || typeof doPost !== "function" || typeof sessionUser_ !== "function"
      || typeof SP26 === "undefined" || typeof sp26Award_ !== "function" || typeof SP8 === "undefined") return;
  L29.installed = true;
  SP26.MIN_POINTS_S = L29.MIN_S;
  var award = sp26Award_;
  sp26Award_ = function (pseudo, key) { return String(key).indexOf("e:") === 0 ? l29Award_(pseudo, key) : award(pseudo, key); };

  var prev = doPost, secPrev = typeof SEC !== "undefined" && SEC && SEC.installed && SEC.wrapper === doPost;
  var wrapper = function (e) {
    var raw = e && e.postData && typeof e.postData.contents === "string" ? e.postData.contents : "";
    var data = null; try { data = JSON.parse(raw); } catch (x) {}
    if (!data || data.action !== "postCreate" || !data.train) return prev(e);
    if (secPrev) {
      if (raw.length > SEC.MAX_BYTES) return out_(err_("Requête trop volumineuse."));
      try { var stop = secGuard_(data); if (stop) return out_(stop); } catch (x) {}
      var flag = { changed: false }; data = secClean_(data, 0, flag);
    }
    try { return l29Post_(e, data, prev); }
    catch (err) {
      var m = String(err && err.message || err);
      try { console.error("lot29 postCreate " + (err && err.stack || m)); } catch (x) {}
      return out_({ status: "error", message: /lock/i.test(m) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
  };
  doPost = wrapper;
  if (secPrev) SEC.wrapper = doPost;

  if (typeof deleteAccountData_ === "function") {
    var del = deleteAccountData_;
    deleteAccountData_ = function (pseudo) {
      var r = del(pseudo), p = l29Lc_(pseudo);
      try { sp8Locked_(function () { rewriteRows_(l29ShPub_(), function (x) { return l29Lc_(x[2]) === p ? null : x; }); }); } catch (x) {}
      return r;
    };
  }
}
l29Install_();

/** Vérifie l'installation (lecture seule). */
function lot29Verifier() {
  if (!L29.installed) return console.log("PROBLÈME : Lot29 n'est pas chargé (place-le tout en bas, sous Lot28, et vérifie que Performances est présent).");
  l29ShPub_();
  var miss = l29Missing_().length;
  console.log("OK : entraînements récompensés dès " + Math.round(L29.MIN_S / 60) + " min, " + L29.POINTS + " pts, " + L29.PER_DAY + " par jour. Publication dans le fil active (onglet PublicationsEntrainement).");
  console.log(miss ? "À FAIRE : " + miss + " entraînement(s) passé(s) pas encore récompensé(s) → exécuter lot29Rattrapage." : "Rattrapage : à jour.");
}
