/**
 * Spary : statut du terrain des séances et clubs partenaires (lot réservation).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Terrain », coller ce code.
 * Il doit être placé SOUS Nouveautes dans la liste des fichiers (c'est le cas par défaut pour un nouveau fichier).
 * Ne pas modifier Code.gs ni Nouveautes. Puis Déployer → Gérer les déploiements → crayon → Nouvelle version.
 * Pour vérifier : sélectionner la fonction sp15Verifier et cliquer sur Exécuter (le journal doit afficher « OK »).
 *
 * Ce fichier enveloppe doPost (déjà enveloppé par Nouveautes) sans le modifier. Écritures sous LockService. Aucun secret.
 *
 * Onglets créés tout seuls :
 *  - SeancesTerrain    : séance | statut (reserve / a_reserver / libre) | date (ms)   (la dernière ligne d'une séance fait foi)
 *  - ClubsPartenaires  : lieu (identifiant de la carte, ex. I750560001) | nom | actif (oui / non) | lien de réservation (facultatif)
 *    À remplir à la main quand un club devient partenaire. Rien n'est affiché dans l'appli tant que l'option
 *    « clubs partenaires » est désactivée côté site (SP15.PARTNERS = false).
 * Aucune donnée personnelle : seulement l'identifiant de la séance et son statut.
 */

var SP15 = { STATUTS: ["reserve", "a_reserver", "libre"], installed: false };

function sp15ShTerrain_() { return sheetH_("SeancesTerrain", ["séance", "statut", "date (ms)"]); }
function sp15ShPartners_() { return sheetH_("ClubsPartenaires", ["lieu", "nom", "actif (oui / non)", "lien de réservation"]); }

function sp15TerrainMap_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp15:ter");
  if (hit) { try { return JSON.parse(hit); } catch (x) {} }
  var m = {};
  rowsOf_(sp15ShTerrain_()).forEach(function (r) { var id = String(r[0]); if (id && SP15.STATUTS.indexOf(String(r[1])) >= 0) m[id] = String(r[1]); });
  try { c.put("sp15:ter", JSON.stringify(m), 120); } catch (x) {}
  return m;
}
function sp15Forget_() { CacheService.getScriptCache().remove("sp15:ter"); }

function sp15SafeUrl_(u) { u = String(u || "").trim(); return /^https:\/\/[^\s"'<>]{3,300}$/.test(u) ? u : ""; }
function sp15Partners_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp15:par");
  if (hit) { try { return JSON.parse(hit); } catch (x) {} }
  var out = [];
  rowsOf_(sp15ShPartners_()).forEach(function (r) {
    var id = String(r[0] || "").trim();
    if (!/^[A-Z0-9]{4,20}$/.test(id) || String(r[2]).trim().toLowerCase() !== "oui") return;
    out.push({ lieu: id, nom: String(r[1] || "").slice(0, 80), book: sp15SafeUrl_(r[3]) });
  });
  try { c.put("sp15:par", JSON.stringify(out), 600); } catch (x) {}
  return out;
}

/** L'organisateur indique si le terrain est réservé auprès du lieu. */
function sp15TerrainSet_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), st = String(d.statut || "");
  if (!id || SP15.STATUTS.indexOf(st) < 0) return err_("Statut inconnu.");
  var s = sp8SessRow_(id);
  if (!s || s[12] !== "ouverte") return err_("Séance introuvable.");
  if (sp8Lc_(s[1]) !== sp8Lc_(me.pseudo)) return err_("Seul l'organisateur peut changer le statut du terrain.");
  sp15ShTerrain_().appendRow([id, st, Date.now()]);
  sp15Forget_();
  return { status: "success", id: Number(id), terrain: st };
}

function sp15Install_() {
  if (SP15.installed || typeof doPost !== "function" || typeof SP8 === "undefined" || !SP8.installed) return;
  SP15.installed = true;
  var prev = doPost;
  doPost = function (e) {
    var data = null;
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (!data || !data.action) return prev(e);
    try {
      switch (data.action) {
        case "terrainSet":
          return out_(sp8Locked_(function () { return sp15TerrainSet_(data); }));
        case "partnerList":
          return out_({ status: "success", partners: sp15Partners_() });
        case "sessionList":
          var lo = prev(e), lr = sp8Parse_(lo);
          if (!lr || lr.status !== "success" || !Array.isArray(lr.sessions)) return lo;
          var m = sp15TerrainMap_();
          lr.sessions.forEach(function (s) { var t = m[String(s.id)]; if (t) s.terrain = t; });
          return out_(lr);
        case "sessionCreate":
          var co = prev(e), cr = sp8Parse_(co), st = String(data.terrain || "");
          if (cr && cr.status === "success" && cr.id && SP15.STATUTS.indexOf(st) >= 0)
            sp8After_(function () { sp15ShTerrain_().appendRow([String(cr.id), st, Date.now()]); sp15Forget_(); });
          return co;
      }
    } catch (err) {
      try { console.error("sp15 " + (err && err.message || err)); } catch (x) {}
      return out_({ status: "error", message: /lock/i.test(String(err && err.message || err)) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
    return prev(e);
  };
}
sp15Install_();

/** À exécuter une fois dans l'éditeur pour vérifier l'installation. */
function sp15Verifier() {
  var ok = SP15.installed;
  console.log(ok
    ? "OK : statut du terrain actif. Pensez à publier une Nouvelle version du déploiement."
    : "PROBLÈME : le fichier Terrain doit être placé SOUS Nouveautes (menu ⋮ du fichier > Déplacer vers le bas), et sp8Verifier doit afficher OK.");
  sp15ShTerrain_(); sp15ShPartners_();
}


