/**
 * Spary : entraînements enregistrés (lot 12, v23).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Entrainements », coller ce code.
 * Le placer SOUS Lus dans la liste des fichiers (c'est le cas par défaut pour un nouveau fichier).
 * Ne pas modifier Code.gs, Nouveautes, Terrain, Stats ni Lus.
 *  1. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *  2. sp23Verifier doit afficher « OK ».
 *
 * Ce que ça enregistre (onglet Entrainements de BDD Spary, créé tout seul) :
 *   id | membre | sport | début (ms) | durée (s) | distance (km) | ressenti (1-5) | note | source | créé (ms) | id Santé
 *   Visible uniquement par le membre lui-même (jamais par les autres membres ni par les clubs).
 *   Effacé à la suppression du compte, inclus dans l'export des données.
 * Aucun secret dans ce fichier. Écritures sous LockService.
 */

var SP23 = {
  installed: false,
  MAX_PER_DAY: 30,          // anti-abus
  LIST: 400,                // entraînements renvoyés au plus
  SPORTS: ["Running & Trail", "Marche", "Cyclisme", "Natation", "Fitness / Crossfit", "Musculation", "Tennis", "Padel", "Football / Five", "Basketball", "Badminton", "Yoga & Pilates", "Escalade", "Volley-ball", "Rugby", "Golf", "Handball", "Squash", "Tennis de table", "Danse", "Sports de combat", "Autre"],
  SOURCES: ["chrono", "manuel", "sante"]
};

function sp23Sh_() {
  return sheetH_("Entrainements", ["id", "membre", "sport", "début (ms)", "durée (s)", "distance (km)", "ressenti (1-5)", "note", "source", "créé (ms)", "id Santé"]);
}

function sp23Row_(r) {
  return {
    id: String(r[0]), sport: String(r[2]), start: Number(r[3]) || 0, dur: Number(r[4]) || 0,
    km: r[5] === "" ? null : Number(r[5]), feel: Number(r[6]) || 0, note: String(r[7] || ""),
    source: String(r[8] || "manuel"), health: String(r[10] || "")
  };
}

function sp23Mine_(pseudo) {
  var v = sp23Sh_().getDataRange().getValues(), p = sp8Lc_(pseudo), out = [];
  for (var i = 1; i < v.length; i++) if (sp8Lc_(v[i][1]) === p) out.push(sp23Row_(v[i]));
  out.sort(function (a, b) { return b.start - a.start; });
  return out;
}

function sp23Clean_(d) {
  var sport = String(d.sport || "");
  if (SP23.SPORTS.indexOf(sport) < 0) return { e: "Sport inconnu." };
  var now = Date.now(), start = Math.floor(Number(d.start) || 0);
  if (!(start > now - 400 * 864e5 && start < now + 6e5)) return { e: "Date invalide." };
  var dur = Math.round(Number(d.dur) || 0);
  if (!(dur >= 60 && dur <= 12 * 3600)) return { e: "Durée entre 1 minute et 12 heures." };
  var km = d.km === null || d.km === undefined || d.km === "" ? "" : Math.round(Number(d.km) * 100) / 100;
  if (km !== "" && !(km >= 0 && km <= 500)) return { e: "Distance invalide." };
  var feel = Math.round(Number(d.feel) || 0); if (!(feel >= 1 && feel <= 5)) feel = "";
  var note = safe_(String(d.note || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 200));   // safe_ : pas de formule dans la feuille
  var source = SP23.SOURCES.indexOf(String(d.source)) >= 0 ? String(d.source) : "manuel";
  var health = String(d.health || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
  var cid = String(d.cid || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);   // identifiant créé par l'appareil (évite les doublons en cas de renvoi)
  return { sport: sport, start: start, dur: dur, km: km, feel: feel, note: note, source: source, health: health, cid: cid };
}

function sp23Save_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var c = sp23Clean_(d);
  if (c.e) return err_(c.e);
  return sp8Locked_(function () {
    var sh = sp23Sh_(), v = sh.getDataRange().getValues(), p = sp8Lc_(me.pseudo), today = 0, day = Date.now() - 864e5;
    for (var i = 1; i < v.length; i++) {
      if (sp8Lc_(v[i][1]) !== p) continue;
      if (c.cid && String(v[i][0]) === c.cid) return { status: "success", item: sp23Row_(v[i]), dup: true };
      if (c.health && String(v[i][10]) === c.health) return { status: "success", item: sp23Row_(v[i]), dup: true };
      if (Number(v[i][9]) > day) today++;
    }
    if (today >= SP23.MAX_PER_DAY) return err_("Trop d'entraînements enregistrés aujourd'hui.");
    var id = c.cid || Utilities.getUuid();
    var row = [id, me.pseudo, c.sport, c.start, c.dur, c.km, c.feel, c.note, c.source, Date.now(), c.health];
    sh.appendRow(row);
    return { status: "success", item: sp23Row_(row) };
  });
}

function sp23List_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  return { status: "success", items: sp23Mine_(me.pseudo).slice(0, SP23.LIST) };
}

function sp23Delete_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(d.id || "");
  if (!id) return err_("Entraînement introuvable.");
  return sp8Locked_(function () {
    var p = sp8Lc_(me.pseudo), n = 0;
    rewriteRows_(sp23Sh_(), function (r) { if (String(r[0]) === id && sp8Lc_(r[1]) === p) { n++; return null; } return r; });
    return n ? { status: "success" } : err_("Entraînement introuvable.");
  });
}

/* ===================== Installation ===================== */
function sp23Install_() {
  if (SP23.installed || typeof doPost !== "function" || typeof SP8 === "undefined" || !SP8.installed) return;
  SP23.installed = true;
  var prev = doPost;
  doPost = function (e) {
    var data = null;
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (data && (data.action === "trainSave" || data.action === "trainList" || data.action === "trainDelete")) {
      try { return out_(data.action === "trainSave" ? sp23Save_(data) : data.action === "trainList" ? sp23List_(data) : sp23Delete_(data)); }
      catch (err) {
        try { console.error("sp23 " + (err && err.message || err)); } catch (x) {}
        return out_({ status: "error", message: "Serveur occupé, réessayez dans quelques secondes." });
      }
    }
    return prev(e);
  };
  // Suppression de compte : on efface ses entraînements.
  var baseDelete = deleteAccountData_;
  deleteAccountData_ = function (pseudo) {
    baseDelete(pseudo);
    try { var p = sp8Lc_(pseudo); rewriteRows_(sp23Sh_(), function (r) { return sp8Lc_(r[1]) === p ? null : r; }); } catch (x) {}
  };
  // Export RGPD : on ajoute ses entraînements.
  var baseExport = accountExport_;
  accountExport_ = function (d) {
    var r = baseExport(d);
    try {
      if (r && r.status === "success" && r.data && r.data.pseudo) {
        r.data.entrainements = sp23Mine_(r.data.pseudo).map(function (t) {
          return { sport: t.sport, debut: new Date(t.start).toISOString(), duree_minutes: Math.round(t.dur / 60), distance_km: t.km, ressenti: t.feel || null, note: t.note, source: t.source };
        });
      }
    } catch (x) {}
    return r;
  };
}
sp23Install_();

/** À exécuter une fois dans l'éditeur pour vérifier l'installation. */
function sp23Verifier() {
  if (!SP23.installed) console.log("PROBLÈME : le fichier Entrainements doit être placé SOUS Nouveautes (idéalement sous Lus), et sp8Verifier doit afficher OK.");
  else { sp23Sh_(); console.log("OK : entraînements actifs (onglet Entrainements)."); }
}

