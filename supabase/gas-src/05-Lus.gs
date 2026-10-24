/**
 * Spary : messages lus partagés entre le site et l'appli + coches envoyé / reçu / lu (lot 8, v19-v20).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Lus », coller ce code.
 * Le placer SOUS Stats dans la liste des fichiers (c'est le cas par défaut pour un nouveau fichier).
 * Ne pas modifier Code.gs, Nouveautes, Terrain ni Stats.
 *  1. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *  2. sp19Verifier doit afficher « OK ».
 *
 * Ce que ça enregistre (onglet MessagesLus de BDD Spary, créé tout seul) :
 *   membre | lus (JSON) | mis à jour (ms) | reçu jusqu'à | confirmations de lecture (oui / non)
 *   « lus » = pour chaque conversation, le numéro du dernier message lu (ex. {"lea92":154,"#37":160}).
 *   « reçu jusqu'à » = numéro du dernier message arrivé sur un de ses appareils (sert à la coche « reçu »).
 *   Aucun contenu de message. Effacé à la suppression du compte, inclus dans l'export des données.
 * Coche « lu » : seulement si les DEUX membres ont laissé les confirmations de lecture activées (comme WhatsApp).
 * Aucun secret dans ce fichier. Écritures sous LockService.
 */

var SP19 = { installed: false, MAX_KEYS: 400, KEY: /^#?[a-z0-9_.-]{1,60}$/, GOT_TTL: 21600 };

function sp19Sh_() { return sheetH_("MessagesLus", ["membre", "lus (JSON)", "mis à jour (ms)", "reçu jusqu'à", "confirmations de lecture (oui / non)"]); }

function sp19Find_(sh, pseudo) {
  var v = sh.getDataRange().getValues(), p = sp8Lc_(pseudo);
  for (var i = 1; i < v.length; i++) {
    if (sp8Lc_(v[i][0]) === p) {
      var m = {};
      try { m = JSON.parse(String(v[i][1] || "{}")) || {}; } catch (x) { m = {}; }
      return { row: i + 1, map: m, got: Number(v[i][3]) || 0, receipts: String(v[i][4] || "oui").toLowerCase() !== "non" };
    }
  }
  return null;
}
function sp19Empty_() { return { row: 0, map: {}, got: 0, receipts: true }; }

/** « Reçu jusqu'à » le plus récent : le cache (mis à jour à chaque synchro des messages) ou la feuille. */
function sp19Got_(pseudo, f) {
  var c = Number(CacheService.getScriptCache().get("sp20:got:" + sp8Lc_(pseudo))) || 0;
  return Math.max(c, f ? f.got : 0);
}
function sp19NoteGot_(pseudo, id) {
  id = Math.floor(Number(id) || 0); if (!pseudo || id <= 0) return;
  var cache = CacheService.getScriptCache(), k = "sp20:got:" + sp8Lc_(pseudo);
  if (id > (Number(cache.get(k)) || 0)) cache.put(k, String(id), SP19.GOT_TTL);
}

/** Le site envoie ce qu'il a lu (et reçu) ; on garde le plus grand numéro par conversation et on renvoie le tout. */
function sp19Sync_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var inc = {}, n = 0;
  if (d.read && typeof d.read === "object") Object.keys(d.read).forEach(function (k) {
    var key = sp8Lc_(k), v = Math.floor(Number(d.read[k]) || 0);
    if (n < SP19.MAX_KEYS && SP19.KEY.test(key) && v > 0 && v < 1e12) { inc[key] = v; n++; }
  });
  var got = Math.floor(Number(d.got) || 0); if (!(got > 0 && got < 1e12)) got = 0;
  sp19NoteGot_(me.pseudo, got);
  var rcp = typeof d.receipts === "boolean" ? d.receipts : null;
  var sh = sp19Sh_(), f = sp19Find_(sh, me.pseudo) || sp19Empty_();
  var need = Object.keys(inc).some(function (k) { return inc[k] > (Number(f.map[k]) || 0); }) || got > f.got || (rcp !== null && rcp !== f.receipts);
  if (!need) return { status: "success", read: f.map, receipts: f.receipts };
  return sp8Locked_(function () {
    var f2 = sp19Find_(sh, me.pseudo) || sp19Empty_(), m = f2.map;
    Object.keys(inc).forEach(function (k) { if (inc[k] > (Number(m[k]) || 0)) m[k] = inc[k]; });
    var keys = Object.keys(m);
    if (keys.length > SP19.MAX_KEYS) {   // on garde les conversations les plus récentes
      keys.sort(function (a, b) { return (Number(m[b]) || 0) - (Number(m[a]) || 0); });
      var kept = {}; keys.slice(0, SP19.MAX_KEYS).forEach(function (k) { kept[k] = m[k]; }); m = kept;
    }
    var r = rcp === null ? f2.receipts : rcp;
    var row = [JSON.stringify(m), Date.now(), Math.max(got, f2.got), r ? "oui" : "non"];
    if (f2.row) sh.getRange(f2.row, 2, 1, 4).setValues([row]);
    else sh.appendRow([me.pseudo].concat(row));
    return { status: "success", read: m, receipts: r };
  });
}

/** Coches d'une conversation privée : jusqu'où mes messages sont arrivés chez l'autre, et jusqu'où il les a lus. */
function sp20State_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var peer = sp8Lc_(String(d.peer || "").replace(/[^A-Za-z0-9_.-]/g, ""));
  if (!peer || peer === sp8Lc_(me.pseudo)) return err_("Membre inconnu.");
  var sh = sp19Sh_(), mine = sp19Find_(sh, me.pseudo) || sp19Empty_(), other = sp19Find_(sh, peer);
  var both = mine.receipts && (other ? other.receipts : true);
  return {
    status: "success", peer: peer,
    got: sp19Got_(peer, other),
    read: both && other ? Number(other.map[sp8Lc_(me.pseudo)]) || 0 : 0,
    receipts: both
  };
}

/* ===================== Installation ===================== */
function sp19Install_() {
  if (SP19.installed || typeof doPost !== "function" || typeof SP8 === "undefined" || !SP8.installed) return;
  SP19.installed = true;
  var prev = doPost;
  doPost = function (e) {
    var data = null;
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (data && (data.action === "readSync" || data.action === "readState")) {
      try { return out_(data.action === "readSync" ? sp19Sync_(data) : sp20State_(data)); }
      catch (err) {
        try { console.error("sp19 " + (err && err.message || err)); } catch (x) {}
        return out_({ status: "error", message: "Serveur occupé, réessayez dans quelques secondes." });
      }
    }
    if (data && data.action === "msgSync") {
      // Coche « reçu » : tout message dont le numéro est ≤ à ce que l'appareil a déjà reçu est arrivé.
      var res = prev(e);
      try {
        var me = sessionUser_(data.token), r = sp8Parse_(res);
        if (me && r && r.status === "success") {
          var top = Number(data.since) || 0;
          (r.messages || []).forEach(function (m) { if (Number(m.id) > top) top = Number(m.id); });
          sp19NoteGot_(me.pseudo, top);
        }
      } catch (x) {}
      return res;
    }
    return prev(e);
  };
  // Suppression de compte : on efface aussi ses marqueurs de lecture.
  var baseDelete = deleteAccountData_;
  deleteAccountData_ = function (pseudo) {
    baseDelete(pseudo);
    try {
      var p = sp8Lc_(pseudo);
      rewriteRows_(sp19Sh_(), function (r) { return sp8Lc_(r[0]) === p ? null : r; });
      CacheService.getScriptCache().remove("sp20:got:" + p);
    } catch (x) {}
  };
  // Export RGPD : on ajoute les marqueurs de lecture.
  var baseExport = accountExport_;
  accountExport_ = function (d) {
    var r = baseExport(d);
    try {
      if (r && r.status === "success" && r.data && r.data.pseudo) {
        var f = sp19Find_(sp19Sh_(), r.data.pseudo) || sp19Empty_();
        r.data.messagesLus = { lus: f.map, reçu_jusqu_au_message: f.got, confirmations_de_lecture: f.receipts };
      }
    } catch (x) {}
    return r;
  };
}
sp19Install_();

/** À exécuter une fois dans l'éditeur pour vérifier l'installation. */
function sp19Verifier() {
  if (!SP19.installed) console.log("PROBLÈME : le fichier Lus doit être placé SOUS Nouveautes (idéalement sous Stats), et sp8Verifier doit afficher OK.");
  else { sp19Sh_(); console.log("OK : messages lus partagés et coches envoyé / reçu / lu actives (onglet MessagesLus)."); }
}

