/**
 * Spary · Seances (lot 20) : séance en direct adaptée à chaque sport, ~90 sports.
 *
 * Où le mettre : nouveau fichier « Seances », SOUS Parcours et AU-DESSUS de Rgpd et Securite (Securite reste le dernier).
 * Ordre final : Code.gs, Nouveautes, Terrain, Stats, Lus, Entrainements, Performances, Parcours, Seances, Rgpd, Securite.
 * Puis :
 *  1. Exécuter sp29Verifier : le journal doit afficher « OK ».
 *  2. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *
 * Ce que ça ajoute (aucun onglet, aucune Script Property, aucun secret) :
 *  1. Les nouveaux sports sont acceptés pour les entraînements (sinon « Sport inconnu. ») avec leur type de séance
 *     (muscu, circuit, endurance, raquettes, collectifs, escalade, golf, combat, paintball ou déroulé libre).
 *  2. Détails en plus gardés pour la séance en direct : temps de chaque tour (course, vélo…), longueur du tour,
 *     bassin et longueurs (natation), carte de score trou par trou (golf). Tout est vérifié (nombres bornés).
 *  3. Actus : chaque sport du catalogue peut être suivi (recherche Google Actualités).
 * Ne modifie aucun autre fichier. Pas d'écriture ici (les écritures restent celles d'Entrainements et Performances, sous verrou).
 */

var SP29 = {
  NEW_SPORTS: [
  "Randonnée", "Marche nordique", "Athlétisme", "VTT", "Triathlon", "Aviron", "Canoë-kayak", "Stand up paddle", "Roller",
  "Ski de fond", "Course d’orientation", "Haltérophilie", "Street workout", "Cardio-training", "Gymnastique", "Trampoline",
  "Pickleball", "Beach tennis", "Futsal", "Beach-volley", "Hockey sur glace", "Hockey sur gazon", "Roller hockey", "Water-polo",
  "Football américain", "Baseball", "Cricket", "Ultimate", "Boxe anglaise", "Boxe thaï", "Kickboxing", "MMA", "Judo", "Karaté",
  "Taekwondo", "Jiu-jitsu brésilien", "Lutte", "Krav-maga", "Aïkido", "Escrime", "Alpinisme", "Ski", "Snowboard", "Surf",
  "Kitesurf", "Planche à voile", "Wakeboard", "Voile", "Plongée", "Skateboard", "Patinage", "Parkour", "Tir à l’arc",
  "Tir sportif", "Pétanque", "Bowling", "Billard", "Fléchettes", "Équitation", "Laser game", "Airsoft", "Disc golf", "Zumba",
  "Stretching", "Aquagym", "Moto", "Motocross", "Sport automobile"
  ],
  KIND: {
  "Randonnée": "endu", "Marche nordique": "endu", "Athlétisme": "endu", "VTT": "endu", "Triathlon": "endu", "Aviron": "endu",
  "Canoë-kayak": "endu", "Stand up paddle": "endu", "Roller": "endu", "Ski de fond": "endu", "Course d’orientation": "endu",
  "Haltérophilie": "force", "Street workout": "force", "Cardio-training": "circuit", "Gymnastique": "libre",
  "Trampoline": "libre", "Pickleball": "raq", "Beach tennis": "raq", "Futsal": "co", "Beach-volley": "co",
  "Hockey sur glace": "co", "Hockey sur gazon": "co", "Roller hockey": "co", "Water-polo": "co", "Football américain": "co",
  "Baseball": "co", "Cricket": "co", "Ultimate": "co", "Boxe anglaise": "combat", "Boxe thaï": "combat", "Kickboxing": "combat",
  "MMA": "combat", "Judo": "combat", "Karaté": "combat", "Taekwondo": "combat", "Jiu-jitsu brésilien": "combat",
  "Lutte": "combat", "Krav-maga": "combat", "Aïkido": "combat", "Escrime": "combat", "Alpinisme": "endu", "Ski": "libre",
  "Snowboard": "libre", "Surf": "libre", "Kitesurf": "libre", "Planche à voile": "libre", "Wakeboard": "libre", "Voile": "libre",
  "Plongée": "libre", "Skateboard": "libre", "Patinage": "libre", "Parkour": "libre", "Tir à l’arc": "libre",
  "Tir sportif": "libre", "Pétanque": "libre", "Bowling": "libre", "Billard": "libre", "Fléchettes": "libre",
  "Équitation": "libre", "Laser game": "paint", "Airsoft": "paint", "Disc golf": "libre", "Zumba": "libre",
  "Stretching": "libre", "Aquagym": "libre", "Moto": "libre", "Motocross": "libre", "Sport automobile": "libre"
  },
  NEWS: {
  "Randonnée": "randonnée", "Marche nordique": "marche nordique", "VTT": "VTT", "Triathlon": "triathlon", "Aviron": "aviron",
  "Canoë-kayak": "canoë-kayak", "Stand up paddle": "stand up paddle", "Roller": "roller",
  "Ski de fond": "ski de fond OR biathlon", "Course d’orientation": "course d'orientation", "Haltérophilie": "haltérophilie",
  "Street workout": "street workout OR calisthenics", "Cardio-training": "cardio fitness", "Gymnastique": "gymnastique",
  "Trampoline": "trampoline gymnastique", "Pickleball": "pickleball", "Beach tennis": "beach tennis", "Futsal": "futsal",
  "Beach-volley": "beach-volley", "Hockey sur glace": "hockey sur glace", "Hockey sur gazon": "hockey sur gazon",
  "Roller hockey": "roller hockey", "Water-polo": "water-polo", "Football américain": "football américain OR NFL",
  "Baseball": "baseball MLB", "Cricket": "cricket", "Ultimate": "ultimate frisbee", "Boxe anglaise": "boxe anglaise",
  "Boxe thaï": "boxe thaï OR muay thaï", "Kickboxing": "kickboxing", "MMA": "MMA UFC OR PFL", "Judo": "judo", "Karaté": "karaté",
  "Taekwondo": "taekwondo", "Jiu-jitsu brésilien": "jiu-jitsu brésilien", "Lutte": "lutte olympique", "Krav-maga": "krav-maga",
  "Aïkido": "aïkido", "Escrime": "escrime", "Alpinisme": "alpinisme", "Snowboard": "snowboard", "Surf": "surf WSL",
  "Kitesurf": "kitesurf", "Planche à voile": "planche à voile OR windsurf", "Wakeboard": "wakeboard",
  "Voile": "voile Vendée Globe OR course au large", "Plongée": "plongée sous-marine", "Skateboard": "skateboard",
  "Patinage": "patinage artistique", "Parkour": "parkour", "Tir à l’arc": "tir à l'arc", "Tir sportif": "tir sportif",
  "Pétanque": "pétanque", "Bowling": "bowling", "Billard": "billard", "Fléchettes": "fléchettes", "Équitation": "équitation",
  "Laser game": "laser game", "Airsoft": "airsoft", "Disc golf": "disc golf", "Danse": "danse", "Zumba": "zumba",
  "Stretching": "stretching mobilité", "Aquagym": "aquagym", "Moto": "MotoGP OR moto", "Motocross": "motocross OR supercross",
  "Sport automobile": "Formule 1 OR WEC OR rallye"
  }
};

/* Sports et types : complète les listes des fichiers Entrainements, Performances et Parcours (sans rien retirer). */
(function () {
  if (typeof SP23 === "undefined" || typeof SP26 === "undefined" || typeof SP28 === "undefined") return;
  SP29.NEW_SPORTS.forEach(function (s) {
    if (SP23.SPORTS.indexOf(s) < 0) { var i = SP23.SPORTS.indexOf("Autre"); if (i >= 0) SP23.SPORTS.splice(i, 0, s); else SP23.SPORTS.push(s); }
    if (SP26.NEW_SPORTS.indexOf(s) < 0) SP26.NEW_SPORTS.push(s);
  });
  Object.keys(SP29.KIND).forEach(function (s) { if (!SP26.KIND[s]) SP26.KIND[s] = SP29.KIND[s]; });
  Object.keys(SP29.NEWS).forEach(function (s) { if (!SP28.NEWS[s]) SP28.NEWS[s] = SP29.NEWS[s]; });
  SP29.ready = true;
})();

/* Détails de la séance en direct : on garde aussi tours, longueurs et carte de golf, après la vérification habituelle. */
if (typeof sp26Det_ === "function" && !SP29.wrapped) {
  SP29.wrapped = true;
  SP29.baseDet = sp26Det_;
  sp26Det_ = function (sport, d) {
    var r = SP29.baseDet(sport, d);
    if (!r || r.e || !r.det || !d || typeof d !== "object") return r;
    var o = r.det;
    if (o.k === "endu") {
      var sp = [];
      (Array.isArray(d.splits) ? d.splits : []).slice(0, 60).forEach(function (x) { var v = sp26Int_(x, 3000, 86400000); if (v !== null) sp.push(v); });
      if (sp.length) o.splits = sp;
      var sd = sp26Int_(d.sd, 0, 100000); if (sd === 200 || sd === 400 || sd === 1000) o.sd = sd;
      var ba = sp26Int_(d.bassin, 0, 100); if (ba === 25 || ba === 50) o.bassin = ba;
      var ln = sp26Int_(d.len, 1, 2000); if (ln && o.bassin) o.len = ln;
    } else if (o.k === "golf") {
      var h = [];
      (Array.isArray(d.holes) ? d.holes : []).slice(0, o.trous || 18).forEach(function (x) {
        if (!Array.isArray(x)) return;
        var p = sp26Int_(x[0], 3, 6), c = sp26Int_(x[1], 0, 15), u = sp26Int_(x[2], 0, 10);
        h.push([p === null ? 4 : p, c === null ? 0 : c, u === null ? 0 : u]);
      });
      if (h.length) {
        o.holes = h;
        var c2 = 0, p2 = 0, u2 = 0; h.forEach(function (x) { if (x[1]) { c2 += x[1]; p2 += x[0]; u2 += x[2]; } });
        if (!o.coups && c2) { o.coups = c2; o.par = p2; o.putts = u2; }   // partie commencée : total des trous joués
      }
    }
    if (JSON.stringify(o).length > SP26.DET_MAX) return { e: "Trop de détails pour une seule séance." };
    return r;
  };
}

/** À exécuter une fois après avoir collé ce fichier. */
function sp29Verifier() {
  if (!SP29.ready) return console.log("PROBLÈME : le fichier Seances doit être placé SOUS Parcours (et au-dessus de Rgpd et Securite).");
  var t = sp26Det_("Running & Trail", { k: "endu", type: "footing", splits: [301000, 295500, "x"], sd: 1000 });
  var g = sp26Det_("Golf", { k: "golf", trous: 9, coups: 40, par: 36, holes: [[4, 5, 2], [3, 3, 1]] });
  var ok = SP23.SPORTS.indexOf("Boxe anglaise") >= 0 && SP23.SPORTS[SP23.SPORTS.length - 1] === "Autre" && t.det && t.det.splits && t.det.splits.length === 2 && g.det && g.det.holes && g.det.holes.length === 2;
  console.log(ok ? "OK : " + (SP23.SPORTS.length - 1) + " sports acceptés, détails de la séance en direct actifs. Pense à publier une Nouvelle version du déploiement." : "PROBLÈME : vérifie l'ordre des fichiers (Seances sous Parcours).");
}

