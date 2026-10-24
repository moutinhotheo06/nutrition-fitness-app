/**
 * Spary : séances détaillées, séance à deux, karting, palmarès, notes des joueurs, points de ligue (lot 16, v28).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Performances », coller ce code.
 * Le placer SOUS Entrainements et AU-DESSUS de Rgpd et de Securite (Securite reste le dernier fichier).
 * Ne modifier aucun autre fichier (ni Code.gs, ni Nouveautes, ni Entrainements).
 *  1. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *  2. Exécuter sp26Verifier : le journal doit afficher « OK ».
 *
 * Ce que ça ajoute :
 *  1. Détails d'une séance selon le sport (séries et charges, circuits, fractionnés, exercices, match d'entraînement,
 *     voies d'escalade, golf, chronos de karting, paintball…). Visibilité : « Tout le monde » ou « Moi seul ».
 *     Seul l'auteur modifie. La note personnelle et le ressenti restent toujours privés.
 *  2. Séance à deux : l'auteur invite un ami Spary, qui confirme ou refuse. Confirmée, elle apparaît sur les deux profils.
 *  3. Ligue : +100 pts pour une séance enregistrée d'au moins 15 min (chrono, ajout manuel, app Santé ou séance
 *     à deux confirmée), une fois par jour, en commun avec « Poster ma séance » (pas de double comptage).
 *     Avant ce fichier, seules les séances publiées sur le fil rapportaient des points.
 *  4. Palmarès automatique (meilleures performances par sport) et chronos de karting par circuit (classement).
 *  5. Notes des joueurs (1 à 5 étoiles) après une séance à deux ou un match confirmé, ajoutées aux avis après séance
 *     existants. Garde-fous : seulement entre joueurs qui ont vraiment joué ensemble, 7 jours pour noter, une voix par
 *     personne (sa note la plus récente), moyenne affichée à partir de 3 personnes, comptes de moins de 3 jours ignorés,
 *     note basse = motif obligatoire, notes anonymes, contestation possible (onglet Recours, type « note »).
 *     Pour retirer une note : onglet Notes, colonne « statut » → « masquée ».
 *  6. Test des notifications depuis l'appli (Compte et données → Tester les notifications) avec un diagnostic lisible.
 *
 * Onglets créés tout seuls :
 *  - SeancesPlus : séance | membre | visibilité | détails (JSON) | partenaire | statut partenaire | maj (ms) | réponse (ms)
 *  - Notes       : id | date (ms) | source | réf | auteur | membre noté | note | qualités | statut
 * Aucun secret dans ce fichier. Écritures sous LockService (sp8Locked_).
 */

var SP26 = {
  installed: false,
  NEW_SPORTS: ["Karting", "Paintball"],
  MIN_POINTS_S: 900,          // 15 min
  NOTE_DAYS: 7,
  NOTE_MIN_RATERS: 3,
  NOTE_MIN_ACCOUNT_DAYS: 3,
  POS_TAGS: ["Ponctuel", "Fair-play", "Bonne ambiance", "Bon niveau", "Motivant", "De bon conseil"],
  NEG_TAGS: ["En retard", "Absent", "Comportement", "Niveau surestimé"],
  DET_MAX: 6000,
  LIST_PUBLIC: 30,
  KART: ["rkc", "rko", "kartland", "brk", "aerokart", "k93", "nikito", "bk-villepinte", "bk-massy", "bk-dammartin", "sp-sqy", "ocg", "asm", "sp-servon", "brq-etards", "brq-poincy", "sp-vde", "autre"],
  GRADES: ["3", "4a", "4b", "4c", "5a", "5a+", "5b", "5b+", "5c", "5c+", "6a", "6a+", "6b", "6b+", "6c", "6c+", "7a", "7a+", "7b", "7b+", "7c", "7c+", "8a", "8a+", "8b", "8b+", "8c", "8c+", "9a"]
};
SP26.KIND = {
  "Musculation": "force", "Fitness / Crossfit": "circuit",
  "Running & Trail": "endu", "Marche": "endu", "Cyclisme": "endu", "Natation": "endu",
  "Football / Five": "co", "Basketball": "co", "Volley-ball": "co", "Rugby": "co", "Handball": "co",
  "Tennis": "raq", "Padel": "raq", "Badminton": "raq", "Squash": "raq", "Tennis de table": "raq",
  "Escalade": "grimpe", "Golf": "golf", "Karting": "kart", "Paintball": "paint", "Sports de combat": "combat"
};

function sp26ShPlus_()  { return sheetH_("SeancesPlus", ["séance", "membre", "visibilité", "détails (JSON)", "partenaire", "statut partenaire", "maj (ms)", "réponse (ms)"]); }
function sp26ShNotes_() { return sheetH_("Notes", ["id", "date (ms)", "source", "réf", "auteur", "membre noté", "note", "qualités", "statut"]); }

/* ===================== Lecture ===================== */
/** Toutes les séances (onglet Entrainements) jointes à leurs détails. */
function sp26All_() {
  var plus = {};
  rowsOf_(sp26ShPlus_()).forEach(function (r) {
    if (!r[0]) return;
    plus[String(r[0])] = { vis: String(r[2]) === "public" ? "public" : "prive", det: jsonSafe_(r[3]), with: String(r[4] || ""), wst: String(r[5] || ""), wts: Number(r[7]) || 0 };
  });
  var out = [];
  rowsOf_(sp23Sh_()).forEach(function (r) {
    if (!r[0]) return;
    var t = sp23Row_(r); t.owner = String(r[1]);
    var p = plus[t.id] || { vis: "prive", det: {}, with: "", wst: "", wts: 0 };
    t.vis = p.vis; t.det = p.det; t.with = p.with; t.wst = p.wst; t.wts = p.wts;
    out.push(t);
  });
  return out;
}
function sp26Lc_(s) { return String(s == null ? "" : s).toLowerCase(); }
/** Version partagée d'une séance (jamais la note personnelle ni le ressenti). */
function sp26Public_(t, nm) {
  var o = { id: t.id, sport: t.sport, start: t.start, dur: t.dur, km: t.km, det: t.det || {}, owner: t.owner, vis: t.vis };
  if (nm) { var a = nm[sp26Lc_(t.owner)]; if (a) o.ownerName = a.name; }
  if (t.with && t.wst === "accepté") { o.with = t.with; if (nm) { var b = nm[sp26Lc_(t.with)]; if (b) { o.with = b.pseudo; o.withName = b.name; } } }
  return o;
}

/* ===================== Validation des détails ===================== */
function sp26Int_(v, min, max) { var n = Math.round(Number(v)); return isFinite(n) && n >= min && n <= max ? n : null; }
function sp26Num_(v, min, max) { var n = Math.round(Number(String(v).replace(",", ".")) * 100) / 100; return isFinite(n) && n >= min && n <= max ? n : null; }
function sp26Txt_(v, n) { return clip_(String(v == null ? "" : v).replace(/^\s*[=+\-@]+/, ""), n); }
function sp26List_(a, max, fn) { var out = []; (Array.isArray(a) ? a : []).slice(0, max).forEach(function (x) { var y = fn(x || {}); if (y) out.push(y); }); return out; }
function sp26Pick_(v, list) { v = String(v || ""); return list.indexOf(v) >= 0 ? v : ""; }

/** Nettoie les détails envoyés par l'appli. Renvoie { det } ou { e: message }. */
function sp26Det_(sport, d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return { det: {} };
  var kind = SP26.KIND[sport] || "libre", k = String(d.k || kind);
  if ((sport === "Musculation" || sport === "Fitness / Crossfit") && (k === "force" || k === "circuit")) kind = k;
  var o = { k: kind }, texts = [];
  var tpl = sp26Txt_(d.tpl, 40); if (tpl) { o.tpl = tpl; texts.push(tpl); }
  var ex = function (x) { var n = sp26Txt_(x.n, 40); if (!n) return null; texts.push(n); var m = sp26Int_(x.min, 0, 600); return m === null ? { n: n } : { n: n, min: m }; };
  if (kind === "force") {
    o.ex = sp26List_(d.ex, 20, function (x) {
      var n = sp26Txt_(x.n, 40); if (!n) return null; texts.push(n);
      var s = sp26List_(x.s, 15, function (y) { var r = sp26Int_(y.r, 0, 500), kg = y.kg === "" || y.kg == null ? null : sp26Num_(y.kg, 0, 700); if (r === null && kg === null) return null; var z = {}; if (r !== null) z.r = r; if (kg !== null) z.kg = kg; return z; });
      return { n: n, s: s };
    });
  } else if (kind === "circuit") {
    o.tours = sp26Int_(d.tours, 1, 100) || 1;
    var rp = sp26Int_(d.rep, 0, 1800); if (rp !== null) o.rep = rp;
    o.st = sp26List_(d.st, 20, function (x) { var n = sp26Txt_(x.n, 40); if (!n) return null; texts.push(n); var z = { n: n }, r = sp26Int_(x.r, 0, 1000), s = sp26Int_(x.sec, 0, 3600), kg = x.kg == null || x.kg === "" ? null : sp26Num_(x.kg, 0, 300); if (r !== null) z.r = r; if (s !== null) z.sec = s; if (kg !== null) z.kg = kg; return z; });
  } else if (kind === "endu") {
    o.type = sp26Pick_(d.type, ["footing", "fractionne", "longue", "seuil", "course", "recup", "technique"]);
    var dp = sp26Int_(d.dplus, 0, 12000); if (dp !== null && dp > 0) o.dplus = dp;
    o.fr = sp26List_(d.fr, 10, function (x) { var n = sp26Int_(x.n, 1, 100); if (!n) return null; var z = { n: n }, dd = sp26Int_(x.d, 0, 100000), t = sp26Int_(x.t, 0, 36000), rc = sp26Int_(x.rec, 0, 3600); if (dd) z.d = dd; if (t) z.t = t; if (rc !== null) z.rec = rc; return z.d || z.t ? z : null; });
    var rank = sp26Int_(d.rang, 1, 100000); if (rank) o.rang = rank;
  } else if (kind === "co" || kind === "raq") {
    o.type = d.type === "match" ? "match" : "entrainement";
    o.ex = sp26List_(d.ex, 15, ex);
    if (o.type === "match") {
      if (kind === "co") { var a = sp26Int_(d.nous, 0, 300), b = sp26Int_(d.eux, 0, 300); if (a !== null && b !== null) { o.nous = a; o.eux = b; } }
      else { o.sets = sp26List_(d.sets, 5, function (x) { var a2 = sp26Int_(Array.isArray(x) ? x[0] : x.a, 0, 99), b2 = sp26Int_(Array.isArray(x) ? x[1] : x.b, 0, 99); return a2 === null || b2 === null ? null : [a2, b2]; }); }
      var res = sp26Pick_(d.res, ["v", "n", "d"]); if (res) o.res = res;
    }
    if (kind === "co") { var bu = sp26Int_(d.buts, 0, 200), pa = sp26Int_(d.passes, 0, 200); if (bu) o.buts = bu; if (pa) o.passes = pa; }
  } else if (kind === "grimpe") {
    o.voies = sp26List_(d.voies, 40, function (x) { var c = sp26Pick_(x.c, SP26.GRADES); if (!c) return null; return { c: c, t: x.t === "voie" ? "voie" : "bloc", r: sp26Pick_(x.r, ["flash", "enchaine", "essai"]) || "enchaine" }; });
  } else if (kind === "golf") {
    o.trous = d.trous == 9 ? 9 : 18;
    var cp = sp26Int_(d.coups, 9, 250), par = sp26Int_(d.par, 27, 80), pu = sp26Int_(d.putts, 0, 120);
    if (cp) o.coups = cp; if (par) o.par = par; if (pu !== null) o.putts = pu;
    var pc = sp26Txt_(d.parcours, 60); if (pc) { o.parcours = pc; texts.push(pc); }
    o.ex = sp26List_(d.ex, 10, ex);
  } else if (kind === "kart") {
    o.c = sp26Pick_(d.c, SP26.KART) || "autre";
    if (o.c === "autre") { var li = sp26Txt_(d.lieu, 60); if (li) { o.lieu = li; texts.push(li); } }
    o.type = sp26Pick_(d.type, ["loisir", "course", "essais"]) || "loisir";
    o.laps = sp26List_(d.laps, 80, function (x) { var v = sp26Int_(x, 10000, 900000); return v === null ? null : v; });
    var best = sp26Int_(d.best, 10000, 900000);
    if (o.laps.length) { var mn = Math.min.apply(null, o.laps); best = best ? Math.min(best, mn) : mn; }
    if (best) o.best = best;
    var tr = sp26Int_(d.tours, 0, 1000); if (tr) o.tours = Math.max(tr, o.laps.length); else if (o.laps.length) o.tours = o.laps.length;
    var kt = sp26Txt_(d.kart, 30); if (kt) { o.kart = kt; texts.push(kt); }
    var pos = sp26Int_(d.pos, 1, 99); if (pos) o.pos = pos;
  } else if (kind === "paint") {
    var mm = sp26Int_(d.manches, 0, 100), gg = sp26Int_(d.gagnees, 0, 100);
    if (mm) o.manches = mm; if (gg !== null && mm) o.gagnees = Math.min(gg, mm);
    var md = sp26Txt_(d.mode, 30); if (md) { o.mode = md; texts.push(md); }
  } else if (kind === "combat") {
    o.type = sp26Pick_(d.type, ["technique", "sparring", "combat", "physique"]) || "technique";
    var rd = sp26Int_(d.rounds, 0, 50), rm = sp26Int_(d.rmin, 0, 30); if (rd) o.rounds = rd; if (rm) o.rmin = rm;
    o.ex = sp26List_(d.ex, 15, ex);
  } else {
    o.ex = sp26List_(d.ex, 15, ex);
  }
  if (texts.length && badAny_(texts)) return { e: "Un nom d'exercice contient un mot interdit." };
  var js = JSON.stringify(o);
  if (js.length > SP26.DET_MAX) return { e: "Trop de détails pour une seule séance." };
  return { det: o };
}

/* ===================== Écriture des détails ===================== */
function sp26PlusRow_(id) {
  var v = sp26ShPlus_().getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === String(id)) return { i: i + 1, r: v[i] };
  return null;
}
function sp26Friend_(me, other) {
  var acc = findAccount_(sp8Pseudo_(other));
  if (!acc) return { e: "Ce membre n'existe pas." };
  if (sp26Lc_(acc.pseudo) === sp26Lc_(me)) return { e: "Tu ne peux pas t'inviter toi-même." };
  if (sp8FriendState_(me)[sp26Lc_(acc.pseudo)] !== "ami") return { e: "Tu peux seulement inviter un ami Spary." };
  var bl = blocks_(me); if (hides_(bl, acc.pseudo)) return { e: "Impossible d'inviter ce membre." };
  return { acc: acc };
}
/** Enregistre visibilité, détails et partenaire. Appelée sous verrou. Renvoie { e } ou { invite: pseudo|null }. */
function sp26SavePlus_(me, item, d, isNew) {
  var dt = sp26Det_(item.sport, d.det);
  if (dt.e) return { e: dt.e };
  var row = sp26PlusRow_(item.id), now = Date.now();
  var vis = d.vis === "public" ? "public" : d.vis === "prive" ? "prive" : (row ? String(row.r[2]) : "prive");
  var prevWith = row ? String(row.r[4] || "") : "", prevSt = row ? String(row.r[5] || "") : "", prevTs = row ? Number(row.r[7]) || 0 : 0;
  var w = prevWith, st = prevSt, invite = null;
  if (d.with !== undefined) {
    var want = String(d.with || "").replace(/^@/, "").trim();
    if (!want) { w = ""; st = ""; }
    else if (sp26Lc_(want) !== sp26Lc_(prevWith)) {
      var f = sp26Friend_(me.pseudo, want); if (f.e) return { e: f.e };
      w = f.acc.pseudo; st = "invité"; prevTs = 0; invite = f.acc.pseudo;
    }
  }
  var det = d.det === undefined && row ? jsonSafe_(row.r[3]) : dt.det;
  var vals = [String(item.id), me.pseudo, vis, JSON.stringify(det), w, st, now, prevTs];
  if (row) sp26ShPlus_().getRange(row.i, 1, 1, 8).setValues([vals]);
  else sp26ShPlus_().appendRow(vals);
  return { invite: invite, vis: vis, det: det, with: w, wst: st };
}

/* ===================== Points de ligue ===================== */
/** +100 pts une fois par jour (compteur commun avec « Poster ma séance »). Appelée sous verrou. */
function sp26Award_(pseudo, key) {
  var today = sp8Day_(), p = sp26Lc_(pseudo), n = 0, dup = false;
  rowsOf_(sp8ShPoints_()).forEach(function (r) {
    if (sp26Lc_(r[1]) !== p) return;
    if (String(r[3]) === key) dup = true;
    if (r[2] === "seance" && String(r[5]) === today) n++;
  });
  if (dup) return { points: 0, capped: false, dup: true };
  if (n >= SP8.SEANCE_PER_DAY) return { points: 0, capped: true };
  sp8ShPoints_().appendRow([Date.now(), pseudo, "seance", key, SP8.SEANCE_POINTS, today]);
  sp26DropCaches_();
  return { points: SP8.SEANCE_POINTS, capped: false };
}
function sp26DropCaches_() { var c = CacheService.getScriptCache(); ["sp8:act", "sp26:act", "sp8:meta", "stats:all"].forEach(function (k) { c.remove(k); }); }
/** Points des séances encore valides (séance existante, non retirée ; invité toujours confirmé). */
function sp26ActMap_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp26:act");
  if (hit) return jsonSafe_(hit);
  var rows = rowsOf_(sp8ShPoints_()).filter(function (r) { return String(r[3]).indexOf("e:") === 0; }), map = {};
  if (rows.length) {
    var ids = {}, hid = hidden_();
    sp26All_().forEach(function (t) { ids[t.id] = t; });
    rows.forEach(function (r) {
      var key = String(r[3]).slice(2), guest = /:g$/.test(key), id = guest ? key.slice(0, -2) : key, t = ids[id];
      if (!t || hid["entrainement:" + id]) return;
      if (guest ? !(t.wst === "accepté" && sp26Lc_(t.with) === sp26Lc_(r[1])) : sp26Lc_(t.owner) !== sp26Lc_(r[1])) return;
      var k = sp26Lc_(r[1]), o = map[k] = map[k] || { points: 0, n: 0 };
      o.points += Number(r[4]) || 0; o.n++;
    });
  }
  try { c.put("sp26:act", JSON.stringify(map), 120); } catch (x) {}
  return map;
}

/* ===================== Actions : séances ===================== */
function sp26AfterSave_(data, res) {
  var me = sessionUser_(data.token);
  if (!me || !res || res.status !== "success" || !res.item) return res;
  var out = sp8Locked_(function () {
    var it = res.item, ex = res.dup ? sp26PlusRow_(it.id) : null;
    var sv = ex ? { vis: String(ex.r[2]) === "public" ? "public" : "prive", det: jsonSafe_(ex.r[3]), with: String(ex.r[4] || ""), wst: String(ex.r[5] || "") }   // renvoi : déjà enregistrée
                : sp26SavePlus_(me, it, { det: data.det, vis: data.vis, with: data.with }, true);
    if (sv.e) return { e: sv.e };
    var aw = it.dur >= SP26.MIN_POINTS_S ? sp26Award_(me.pseudo, "e:" + it.id) : { points: 0 };
    if (sv.invite) sp26Invite_(me, it, sv.invite);
    return { sv: sv, aw: aw };
  });
  if (out.e) { res.warning = out.e; return res; }
  res.item.vis = out.sv.vis; res.item.det = out.sv.det; res.item.with = out.sv.with; res.item.wst = out.sv.wst;
  res.points = out.aw.points || 0; res.capped = !!out.aw.capped;
  return res;
}
function sp26Invite_(me, it, who) {
  try { sp14Queue_([who], { title: "Séance à deux", body: String(me.pseudo) + " t'a ajouté à sa séance de " + it.sport + ". Tu confirmes ?", url: "./#duo", subject: "duo:" + it.id }, { except: me.pseudo }); } catch (x) {}
}

function sp26Update_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(d.id || "");
  return sp8Locked_(function () {
    var sh = sp23Sh_(), v = sh.getDataRange().getValues(), p = sp26Lc_(me.pseudo), at = -1;
    for (var i = 1; i < v.length; i++) if (String(v[i][0]) === id) { at = i; break; }
    if (at < 0) return err_("Séance introuvable.");
    if (sp26Lc_(v[at][1]) !== p) return err_("Seul l'auteur peut modifier cette séance.");
    var row = v[at].slice();
    if (d.dur !== undefined) { var du = Math.round(Number(d.dur) || 0); if (!(du >= 60 && du <= 12 * 3600)) return err_("Durée entre 1 minute et 12 heures."); row[4] = du; }
    if (d.km !== undefined) { if (d.km === null || d.km === "") row[5] = ""; else { var km = sp26Num_(d.km, 0, 500); if (km === null) return err_("Distance invalide."); row[5] = km; } }
    if (d.feel !== undefined) { var fe = sp26Int_(d.feel, 1, 5); row[6] = fe === null ? "" : fe; }
    if (d.note !== undefined) row[7] = safe_(String(d.note || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 200));
    if (d.start !== undefined) { var s = Math.floor(Number(d.start) || 0); if (!(s > Date.now() - 400 * 864e5 && s < Date.now() + 6e5)) return err_("Date invalide."); row[3] = s; }
    var it = sp23Row_(row), sv = sp26SavePlus_(me, it, { det: d.det, vis: d.vis, with: d.with }, false);
    if (sv.e) return err_(sv.e);
    sh.getRange(at + 1, 1, 1, row.length).setValues([row]);
    if (sv.invite) sp26Invite_(me, it, sv.invite);
    var aw = it.dur >= SP26.MIN_POINTS_S ? sp26Award_(me.pseudo, "e:" + it.id) : { points: 0 };
    sp26DropCaches_();
    it.vis = sv.vis; it.det = sv.det; it.with = sv.with; it.wst = sv.wst;
    return { status: "success", item: it, points: aw.points || 0 };
  });
}

/** Le partenaire confirme (accept=true) ou refuse / se retire (accept=false). */
function sp26DuoRespond_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(d.id || "");
  return sp8Locked_(function () {
    var row = sp26PlusRow_(id);
    if (!row || sp26Lc_(row.r[4]) !== sp26Lc_(me.pseudo)) return err_("Invitation introuvable.");
    var st = String(row.r[5]), ok = d.accept === true;
    if (ok && st !== "invité") return err_(st === "accepté" ? "Déjà confirmée." : "Invitation expirée.");
    sp26ShPlus_().getRange(row.i, 6, 1, 3).setValues([[ok ? "accepté" : "refusé", Date.now(), Date.now()]]);
    var it = null; sp26All_().forEach(function (t) { if (t.id === id) it = t; });
    var aw = { points: 0 };
    if (ok && it && it.dur >= SP26.MIN_POINTS_S) aw = sp26Award_(me.pseudo, "e:" + id + ":g");
    sp26DropCaches_();
    if (ok && it) { try { sp14Queue_([it.owner], { title: "Séance à deux confirmée", body: String(me.pseudo) + " a confirmé votre séance de " + it.sport + ".", url: "./#profil", subject: "duo-ok:" + id }, { except: me.pseudo }); } catch (x) {} }
    return { status: "success", accepted: ok, points: aw.points || 0, capped: !!aw.capped };
  });
}

/** Liste de mes séances (base) enrichie : détails, visibilité, partenaire ; + séances où je suis l'invité confirmé. */
function sp26ListMerge_(data, res) {
  if (!res || res.status !== "success" || !Array.isArray(res.items)) return res;
  var me = sessionUser_(data.token); if (!me) return res;
  var p = sp26Lc_(me.pseudo), all = sp26All_(), by = {}, nm = nameMap_(), hid = hidden_();
  all.forEach(function (t) { by[t.id] = t; });
  res.items.forEach(function (x) {
    var t = by[x.id]; if (!t) return;
    x.vis = t.vis; x.det = t.det; x.with = t.with; x.wst = t.wst;
    if (hid["entrainement:" + x.id]) x.hidden = 1;
  });
  var invites = [];
  all.forEach(function (t) {
    if (sp26Lc_(t.with) !== p || sp26Lc_(t.owner) === p || isBanned_(t.owner)) return;
    if (t.wst === "accepté") { var g = sp26Public_(t, nm); g.guest = 1; res.items.push(g); }
    else if (t.wst === "invité" && Date.now() - t.start < 30 * 864e5) invites.push(sp26Public_(t, nm));
  });
  res.items.sort(function (a, b) { return b.start - a.start; });
  res.invites = invites;
  return res;
}

/* ===================== Accès aux profils ===================== */
/** Le visiteur peut-il voir les séances de ce membre ? */
function sp26CanSee_(viewer, owner) {
  var v = sp26Lc_(viewer), o = sp26Lc_(owner);
  if (v === o) return true;
  if (isBanned_(o)) return false;
  if (hides_(blocks_(viewer), owner)) return false;
  if (sp8PrivateSet_()[o] && sp8FriendState_(viewer)[o] !== "ami") return false;
  return true;
}
function sp26Profile_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var acc = findAccount_(sp8Pseudo_(d.pseudo) || me.pseudo);
  if (!acc) return err_("Membre introuvable.");
  var mine = sp26Lc_(acc.pseudo) === sp26Lc_(me.pseudo), out = { status: "success", pseudo: acc.pseudo, mine: mine };
  if (!mine && hides_(blocks_(me.pseudo), acc.pseudo)) return err_("Profil indisponible.");
  out.note = sp26NoteSummary_(acc.pseudo, mine);
  if (!sp26CanSee_(me.pseudo, acc.pseudo)) { out.private = true; return out; }
  var p = sp26Lc_(acc.pseudo), nm = nameMap_(), hid = hidden_(), bl = blocks_(me.pseudo), all = sp26All_(), list = [], own = [];
  all.forEach(function (t) {
    if (hid["entrainement:" + t.id]) return;
    var isOwner = sp26Lc_(t.owner) === p, isGuest = t.wst === "accepté" && sp26Lc_(t.with) === p;
    if (!isOwner && !isGuest) return;
    if (isOwner) own.push(t);
    var visible = t.vis === "public" || (mine && isOwner);
    if (isGuest && (t.vis !== "public" || hides_(bl, t.owner) || isBanned_(t.owner))) visible = mine && t.vis === "public";
    if (!visible) return;
    var o = sp26Public_(t, nm); if (isGuest) o.guest = 1; if (t.vis !== "public") o.vis = "prive";
    list.push(o);
  });
  list.sort(function (a, b) { return b.start - a.start; });
  out.total = list.length;
  out.seances = list.slice(0, SP26.LIST_PUBLIC);
  out.palmares = sp26Palmares_(own.filter(function (t) { return mine || t.vis === "public"; }), all, p, mine);
  return out;
}
function sp26Seance_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var id = String(d.id || ""), t = null, nm = nameMap_();
  sp26All_().forEach(function (x) { if (x.id === id) t = x; });
  if (!t) return err_("Séance introuvable.");
  var p = sp26Lc_(me.pseudo), mine = sp26Lc_(t.owner) === p, guest = sp26Lc_(t.with) === p && (t.wst === "accepté" || t.wst === "invité");
  if (!mine && !guest) {
    if (t.vis !== "public" || hidden_()["entrainement:" + id] || !sp26CanSee_(me.pseudo, t.owner)) return err_("Cette séance n'est pas visible.");
  }
  var o = sp26Public_(t, nm);
  if (mine) { o.note = t.note; o.feel = t.feel; o.source = t.source; o.with = t.with; o.wst = t.wst; o.vis = t.vis; o.mine = 1; }
  if (guest) { o.wst = t.wst; o.guest = 1; }
  return { status: "success", item: o };
}

/** Signaler une séance publique (même circuit que les autres signalements : onglet Signalements). */
function sp26Report_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(d.id || ""), t = null;
  sp26All_().forEach(function (x) { if (x.id === id) t = x; });
  if (!t || t.vis !== "public") return err_("Contenu introuvable.");
  if (sp26Lc_(t.owner) === sp26Lc_(me.pseudo)) return err_("Vous ne pouvez pas signaler votre propre contenu.");
  var reason = String(d.reason || ""); if (REPORT_REASONS.indexOf(reason) < 0) return err_("Choisissez un motif.");
  if (d.goodFaith === false) return err_("Cochez la case de bonne foi pour envoyer le signalement.");
  var lim = rate_("rep:" + me.pseudo, 15, 3600, "Trop de signalements en peu de temps."); if (lim) return err_(lim);
  var sh = shReports_(), rows = sh.getDataRange().getValues(), mine = sp26Lc_(me.pseudo);
  for (var i = 1; i < rows.length; i++) if (sp26Lc_(rows[i][2]) === mine && String(rows[i][3]) === "entrainement" && String(rows[i][4]) === id) return { status: "success", already: true };
  var now = Date.now(), ext = t.sport + " · " + JSON.stringify(t.det || {}).slice(0, 250);
  sh.appendRow([now * 1000 + Math.floor(Math.random() * 1000), now, me.pseudo, "entrainement", id, t.owner, reason, safe_(clip_(d.details, 300)), safe_(ext), "nouveau", ""]);
  CacheService.getScriptCache().remove("hid:all");
  return { status: "success" };
}

/* ===================== Palmarès ===================== */
function sp26Fmt_(n, d) { return String(Math.round(n * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).replace(".", ","); }
function sp26Dur_(s) { var m = Math.round(s / 60); return m < 60 ? m + " min" : Math.floor(m / 60) + " h" + (m % 60 ? " " + ("0" + (m % 60)).slice(-2) : ""); }
function sp26Pace_(secPerKm) { var m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60); if (s === 60) { m++; s = 0; } return m + "'" + ("0" + s).slice(-2) + "\""; }
function sp26Lap_(ms) { var s = ms / 1000, m = Math.floor(s / 60), r = s - m * 60; return (m ? m + ":" + (r < 10 ? "0" : "") : "") + r.toFixed(3).replace(".", ",") + (m ? "" : " s"); }
function sp26Rec_(best, label, val, t, score, better) {
  var cur = best[label];
  if (!cur || (better === "low" ? score < cur.score : score > cur.score)) best[label] = { l: label, v: val, score: score, d: t.start, id: t.id, priv: t.vis !== "public" ? 1 : 0 };
}
/** Meilleures performances par sport, calculées à partir des séances (auteur) ; ligue et séances à deux en plus. */
function sp26Palmares_(own, all, p, mine) {
  var by = {};
  own.forEach(function (t) {
    var s = by[t.sport] = by[t.sport] || { sport: t.sport, n: 0, sec: 0, km: 0, best: {}, ex: {}, wins: 0, losses: 0, draws: 0, goals: 0 };
    s.n++; s.sec += t.dur; if (t.km) s.km += Number(t.km);
    sp26Rec_(s.best, "Plus longue séance", sp26Dur_(t.dur), t, t.dur);
    var det = t.det || {}, k = det.k || SP26.KIND[t.sport] || "libre", km = Number(t.km) || 0;
    if (k === "endu" && km > 0) {
      sp26Rec_(s.best, "Plus longue distance", sp26Fmt_(km, 2) + " km", t, km);
      if (t.sport === "Cyclisme" && km >= 10) { var v = km / (t.dur / 3600); sp26Rec_(s.best, "Meilleure vitesse moyenne", sp26Fmt_(v, 1) + " km/h", t, v); }
      else if (t.sport === "Natation" && km >= 0.4) { var p100 = t.dur / (km * 10); sp26Rec_(s.best, "Meilleure allure", sp26Pace_(p100) + " /100 m", t, p100, "low"); }
      else if (km >= 3 && t.sport !== "Cyclisme" && t.sport !== "Natation") { var pk = t.dur / km; sp26Rec_(s.best, "Meilleure allure", sp26Pace_(pk) + " /km", t, pk, "low"); }
      if (det.dplus) sp26Rec_(s.best, "Plus gros dénivelé", det.dplus + " m D+", t, det.dplus);
    }
    if (k === "force") {
      var vol = 0;
      (det.ex || []).forEach(function (e) {
        var key = e.n.toLowerCase().replace(/\s+/g, " ").trim();
        (e.s || []).forEach(function (x) {
          if (x.kg) { var cur = s.ex[key]; if (!cur || x.kg > cur.kg || (x.kg === cur.kg && (x.r || 0) > (cur.r || 0))) s.ex[key] = { n: e.n, kg: x.kg, r: x.r || 0, d: t.start, id: t.id, priv: t.vis !== "public" ? 1 : 0 }; }
          vol += (x.r || 0) * (x.kg || 0);
        });
      });
      if (vol > 0) sp26Rec_(s.best, "Plus gros volume", sp26Fmt_(vol, 0) + " kg soulevés", t, vol);
    }
    if (k === "circuit" && det.tours) sp26Rec_(s.best, "Plus de tours de circuit", det.tours + " tours", t, det.tours);
    if ((k === "co" || k === "raq") && det.type === "match") {
      var r = det.res || (k === "co" && det.nous != null ? (det.nous > det.eux ? "v" : det.nous < det.eux ? "d" : "n") : "");
      if (r === "v") s.wins++; else if (r === "d") s.losses++; else if (r === "n") s.draws++;
    }
    if (k === "co" && det.buts) { s.goals += det.buts; sp26Rec_(s.best, t.sport === "Basketball" || t.sport === "Volley-ball" ? "Record de points" : t.sport === "Rugby" ? "Record d'essais" : "Record de buts", det.buts + " en une séance", t, det.buts); }
    if (k === "grimpe") (det.voies || []).forEach(function (vv) {
      if (vv.r === "essai") return;
      var gi = SP26.GRADES.indexOf(vv.c); sp26Rec_(s.best, vv.t === "voie" ? "Meilleure voie" : "Meilleur bloc", vv.c + (vv.r === "flash" ? " (flash)" : ""), t, gi + (vv.r === "flash" ? 0.5 : 0));
    });
    if (k === "golf" && det.coups) {
      var lab = det.trous === 9 ? "Meilleur score 9 trous" : "Meilleur score 18 trous", diff = det.par ? det.coups - det.par : null;
      sp26Rec_(s.best, lab, det.coups + " coups" + (diff !== null ? " (" + (diff > 0 ? "+" : "") + diff + ")" : ""), t, det.coups, "low");
    }
    if (k === "kart" && det.best) sp26Rec_(s.best, "kart:" + det.c + (det.c === "autre" ? ":" + (det.lieu || "") : ""), sp26Lap_(det.best), t, det.best, "low");
    if (k === "paint" && det.manches) { s.wins += det.gagnees || 0; s.losses += det.manches - (det.gagnees || 0); }
    if (k === "combat" && det.rounds) sp26Rec_(s.best, "Plus de rounds", det.rounds + " rounds", t, det.rounds);
  });
  // Séances à deux confirmées où ce membre était invité : comptées dans le volume.
  all.forEach(function (t) {
    if (t.wst !== "accepté" || sp26Lc_(t.with) !== p || (!mine && t.vis !== "public")) return;
    var s = by[t.sport] = by[t.sport] || { sport: t.sport, n: 0, sec: 0, km: 0, best: {}, ex: {}, wins: 0, losses: 0, draws: 0, goals: 0 };
    s.n++; s.sec += t.dur;
  });
  var out = Object.keys(by).map(function (k) {
    var s = by[k], recs = Object.keys(s.best).map(function (x) { return s.best[x]; });
    recs.forEach(function (r) { if (r.l.indexOf("kart:") === 0) { var q = r.l.split(":"); r.circuit = q[1]; if (q[2]) r.lieu = q[2]; r.l = "Meilleur tour"; } delete r.score; });
    var lifts = Object.keys(s.ex).map(function (x) { return s.ex[x]; }).sort(function (a, b) { return b.kg - a.kg; }).slice(0, 6)
      .map(function (e) { return { l: e.n, v: sp26Fmt_(e.kg, 1) + " kg" + (e.r ? " × " + e.r : ""), d: e.d, id: e.id, priv: e.priv, lift: 1 }; });
    var o = { sport: s.sport, n: s.n, sec: s.sec, recs: lifts.concat(recs) };
    if (s.km) o.km = Math.round(s.km * 10) / 10;
    if (s.wins || s.losses || s.draws) o.wld = [s.wins, s.draws, s.losses];
    if (s.goals) o.goals = s.goals;
    return o;
  });
  out.sort(function (a, b) { return b.n - a.n || b.sec - a.sec; });
  return out;
}

/* ===================== Karting ===================== */
function sp26Kart_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var c = sp26Pick_(d.c, SP26.KART); if (!c || c === "autre") return err_("Circuit inconnu.");
  var p = sp26Lc_(me.pseudo), hid = hidden_(), bl = blocks_(me.pseudo), priv = sp8PrivateSet_(), fr = sp8FriendState_(me.pseudo), nm = nameMap_();
  var best = {}, hist = [];
  sp26All_().forEach(function (t) {
    var det = t.det || {}; if (det.k !== "kart" || det.c !== c || !det.best) return;
    var o = sp26Lc_(t.owner);
    if (o === p) hist.push({ id: t.id, start: t.start, best: det.best, tours: det.tours || 0, type: det.type, laps: (det.laps || []).length, vis: t.vis });
    if (hid["entrainement:" + t.id] || isBanned_(o)) return;
    if (o !== p && (t.vis !== "public" || hides_(bl, t.owner) || (priv[o] && fr[o] !== "ami"))) return;
    if (o === p && t.vis !== "public") return;
    if (!best[o] || det.best < best[o].best) best[o] = { pseudo: (nm[o] || {}).pseudo || t.owner, name: (nm[o] || {}).name || "", best: det.best, start: t.start, id: t.id };
  });
  var board = Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b) { return a.best - b.best; });
  var rank = 0; board.forEach(function (x, i) { if (sp26Lc_(x.pseudo) === p) rank = i + 1; });
  hist.sort(function (a, b) { return b.start - a.start; });
  return { status: "success", c: c, board: board.slice(0, 10), total: board.length, rank: rank, hist: hist.slice(0, 50) };
}

/* ===================== Notes des joueurs ===================== */
function sp26AccountAges_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp26:age"); if (hit) return jsonSafe_(hit);
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), o = {};
  for (var i = 1; i < rows.length; i++) { var t = new Date(rows[i][0]).getTime(); if (rows[i][6]) o[sp26Lc_(rows[i][6])] = isNaN(t) ? 0 : t; }
  try { c.put("sp26:age", JSON.stringify(o), 600); } catch (x) {}
  return o;
}
/** Événements que je peux noter : séances à deux confirmées et matchs confirmés de moins de 7 jours. */
function sp26Events_(me) {
  var p = sp26Lc_(me), since = Date.now() - SP26.NOTE_DAYS * 864e5, ev = [];
  sp26All_().forEach(function (t) {
    if (t.wst !== "accepté" || !t.with) return;
    var when = Math.max(t.start, t.wts || 0); if (when < since || t.start > Date.now()) return;
    if (sp26Lc_(t.owner) === p) ev.push({ src: "duo", ref: t.id, who: t.with, sport: t.sport, when: t.start });
    else if (sp26Lc_(t.with) === p) ev.push({ src: "duo", ref: t.id, who: t.owner, sport: t.sport, when: t.start });
  });
  rowsOf_(shMatchs_()).forEach(function (r) {
    if (r[7] !== "confirmé") return;
    var when = Number(r[8]) || Number(r[1]); if (when < since) return;
    var a = String(r[2]), b = String(r[3]);
    if (sp26Lc_(a) === p) ev.push({ src: "match", ref: String(r[0]), who: b, sport: String(r[4]), when: Number(r[1]) });
    else if (sp26Lc_(b) === p) ev.push({ src: "match", ref: String(r[0]), who: a, sport: String(r[4]), when: Number(r[1]) });
  });
  return ev;
}
function sp26NotePending_(me) {
  var p = sp26Lc_(me), done = {}, bl = blocks_(me), nm = nameMap_();
  rowsOf_(sp26ShNotes_()).forEach(function (r) { if (sp26Lc_(r[4]) === p) done[r[2] + "|" + r[3] + "|" + sp26Lc_(r[5])] = 1; });
  return sp26Events_(me).filter(function (e) { return !done[e.src + "|" + e.ref + "|" + sp26Lc_(e.who)] && !hides_(bl, e.who) && nm[sp26Lc_(e.who)]; })
    .map(function (e) { var a = nm[sp26Lc_(e.who)]; e.who = a.pseudo; e.name = a.name; return e; })
    .sort(function (a, b) { return b.when - a.when; }).slice(0, 8);
}
function sp26NoteSubmit_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var lim = rate_("note:" + me.pseudo, 30, 3600, "Trop de notes en peu de temps. Réessaie plus tard."); if (lim) return err_(lim);
  var src = d.src === "match" ? "match" : "duo", ref = String(d.ref || ""), target = sp26Lc_(d.target), skip = d.skip === true;
  var ev = sp26Events_(me.pseudo).filter(function (e) { return e.src === src && e.ref === ref && sp26Lc_(e.who) === target; })[0];
  if (!ev) return err_("Tu ne peux pas (ou plus) noter ce joueur pour cette séance.");
  if (hides_(blocks_(me.pseudo), ev.who)) return err_("Impossible de noter ce membre.");
  var stars = skip ? 0 : sp26Int_(d.stars, 1, 5);
  if (!skip && !stars) return err_("Choisis une note de 1 à 5 étoiles.");
  var tags = (Array.isArray(d.tags) ? d.tags : []).filter(function (x, i, a) { return a.indexOf(x) === i && (SP26.POS_TAGS.indexOf(x) >= 0 || SP26.NEG_TAGS.indexOf(x) >= 0); }).slice(0, 4);
  if (!skip) {
    var neg = tags.filter(function (x) { return SP26.NEG_TAGS.indexOf(x) >= 0; });
    if (stars <= 2 && !neg.length) return err_("Pour une note basse, choisis ce qui n'a pas été.");
    if (stars >= 4) tags = tags.filter(function (x) { return SP26.NEG_TAGS.indexOf(x) < 0; });
  }
  return sp8Locked_(function () {
    var sh = sp26ShNotes_(), p = sp26Lc_(me.pseudo), dup = false;
    rowsOf_(sh).forEach(function (r) { if (sp26Lc_(r[4]) === p && r[2] === src && String(r[3]) === ref && sp26Lc_(r[5]) === target) dup = true; });
    if (dup) return err_("Tu as déjà noté ce joueur pour cette séance.");
    var now = Date.now();
    sh.appendRow([String(now) + String(Math.floor(Math.random() * 1000)), now, src, ref, me.pseudo, ev.who, stars, tags.join(","), skip ? "ignorée" : ""]);
    CacheService.getScriptCache().remove("sp26:notes");
    return { status: "success" };
  });
}
/** Toutes les notes (avis après séance + notes du lot 16), une voix par personne : sa note la plus récente. */
function sp26NotesAll_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp26:notes"); if (hit) return jsonSafe_(hit);
  var ages = sp26AccountAges_(), votes = {};
  function add(ts, author, target, stars, tags, id, low) {
    var a = sp26Lc_(author), t = sp26Lc_(target);
    if (!a || !t || a === t || !(stars >= 1 && stars <= 5) || isBanned_(a)) return;
    if (ages[a] && ts - ages[a] < SP26.NOTE_MIN_ACCOUNT_DAYS * 864e5) return;     // compte trop récent au moment de la note
    var m = votes[t] = votes[t] || {}, cur = m[a];
    if (!cur || ts > cur.ts) m[a] = { ts: ts, s: stars, tags: tags, id: id || "" };
  }
  try { rowsOf_(sp8ShAvis_()).forEach(function (r) { if (r[6] !== "oui") add(Number(r[0]), r[2], r[3], Number(r[4]), String(r[5] || ""), ""); }); } catch (x) {}
  rowsOf_(sp26ShNotes_()).forEach(function (r) { if (String(r[8]) !== "masquée" && String(r[8]) !== "ignorée") add(Number(r[1]), r[4], r[5], Number(r[6]), String(r[7] || ""), String(r[0])); });
  var out = {};
  Object.keys(votes).forEach(function (t) {
    var m = votes[t], o = { n: 0, sum: 0, dist: [0, 0, 0, 0, 0], tags: {}, neg: {}, low: [] };
    Object.keys(m).forEach(function (a) {
      var v = m[a]; o.n++; o.sum += v.s; o.dist[v.s - 1]++;
      String(v.tags).split(",").forEach(function (x) { if (!x) return; if (SP26.NEG_TAGS.indexOf(x) >= 0) o.neg[x] = (o.neg[x] || 0) + 1; else o.tags[x] = (o.tags[x] || 0) + 1; });
      if (v.s <= 2 && v.id) o.low.push({ id: v.id, ts: v.ts, s: v.s });
    });
    out[t] = o;
  });
  try { c.put("sp26:notes", JSON.stringify(out), 300); } catch (x) {}
  return out;
}
function sp26NoteSummary_(pseudo, mine) {
  var o = sp26NotesAll_()[sp26Lc_(pseudo)], res = { count: 0, min: SP26.NOTE_MIN_RATERS };
  if (!o) return res;
  if (mine) res.raters = o.n;
  if (o.n >= SP26.NOTE_MIN_RATERS) {
    res.avg = Math.round(o.sum / o.n * 10) / 10; res.count = o.n; res.dist = o.dist;
    res.tags = Object.keys(o.tags).map(function (k) { return [k, o.tags[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
    if (mine) { res.neg = Object.keys(o.neg).map(function (k) { return [k, o.neg[k]]; }); res.low = o.low.slice(-5).map(function (x) { return { id: x.id, ts: Math.floor(x.ts / 864e5) * 864e5, s: x.s }; }); }
  }
  return res;
}
function sp26NoteContest_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(d.id || ""), txt = clip_(d.text, 300);
  if (txt.length < 10) return err_("Explique en quelques mots pourquoi cette note est injuste.");
  var lim = rate_("ncont:" + me.pseudo, 5, 86400, "Tu as déjà envoyé plusieurs contestations aujourd'hui."); if (lim) return err_(lim);
  return sp8Locked_(function () {
    var sh = sp26ShNotes_(), v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][0]) !== id) continue;
      if (sp26Lc_(v[i][5]) !== sp26Lc_(me.pseudo)) return err_("Note introuvable.");
      if (String(v[i][8]) === "contestée") return { status: "success", already: true };
      sh.getRange(i + 1, 9).setValue("contestée");
      sp8ShAppeal_().appendRow([Date.now(), me.pseudo, "note", id, safe_(txt), "nouveau"]);
      return { status: "success" };
    }
    return err_("Note introuvable.");
  });
}

/* ===================== Accueil : invitations et notes à donner ===================== */
function sp26Pending_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var p = sp26Lc_(me.pseudo), nm = nameMap_(), inv = [];
  sp26All_().forEach(function (t) {
    if (t.wst === "invité" && sp26Lc_(t.with) === p && !isBanned_(t.owner) && Date.now() - t.start < 30 * 864e5) inv.push(sp26Public_(t, nm));
  });
  return { status: "success", invites: inv.slice(0, 10), notes: sp26NotePending_(me.pseudo), tags: { pos: SP26.POS_TAGS, neg: SP26.NEG_TAGS } };
}

/* ===================== Test des notifications ===================== */
var SP26_FCM_HINTS = [
  [/THIRD_PARTY_AUTH_ERROR|APNS|apns/i, "Apple refuse la clé de Firebase. Firebase → Paramètres du projet → Cloud Messaging → appli iOS fr.spary.app : redéposer la clé APNs (.p8) avec le bon Key ID et le Team ID A5YKNV3373."],
  [/SENDER_ID_MISMATCH/i, "Le jeton de l'iPhone vient d'un autre projet Firebase que le compte de service (FCM_SERVICE_ACCOUNT)."],
  [/UNREGISTERED|NOT_FOUND|registration token/i, "Jeton périmé (appli réinstallée ou notifications coupées) : rouvre l'appli, il sera renouvelé."],
  [/INVALID_ARGUMENT/i, "Jeton invalide : rouvre l'appli pour en obtenir un nouveau."],
  [/PERMISSION_DENIED|403/i, "Le compte de service n'a pas le droit d'envoyer : vérifie qu'il appartient au projet spary-d810a et que l'API Firebase Cloud Messaging est activée."],
  [/jeton refusé|invalid_grant/i, "La clé du compte de service est refusée par Google : regénère-la dans Firebase et recolle le JSON dans FCM_SERVICE_ACCOUNT."]
];
function sp26Hint_(txt) { for (var i = 0; i < SP26_FCM_HINTS.length; i++) if (SP26_FCM_HINTS[i][0].test(txt)) return SP26_FCM_HINTS[i][1]; return ""; }
function sp26PushTest_(pseudo) {
  var subs = rowsOf_(sp8ShPush_()).filter(function (r) { return sp26Lc_(r[1]) === sp26Lc_(pseudo); }), res = [];
  var sa = sp16Account_(), body = "Si tu vois ce message, les notifications marchent sur cet appareil.";
  if (subs.length) sp14ShFile_().appendRow([Date.now(), subs[0][1], "Test Spary", body, "./", "test"]);
  subs.forEach(function (r) {
    var ep = String(r[2]), o = { kind: ep.indexOf(SP16.PREFIX) === 0 ? "appli" : "web", since: Number(r[0]) || 0, plat: ep.indexOf(SP16.PREFIX) === 0 ? String(r[3] || "") : "" };
    try {
      if (o.kind === "appli") {
        if (!sa) { o.code = 0; o.err = "FCM_SERVICE_ACCOUNT absente"; o.hint = "Ajoute la Script Property FCM_SERVICE_ACCOUNT (JSON du compte de service Firebase)."; res.push(o); return; }
        var at = sp16Token_(sa), url = "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(sa.project_id) + "/messages:send";
        var rr = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", muteHttpExceptions: true, headers: { Authorization: "Bearer " + at },
          payload: JSON.stringify({ message: { token: ep.slice(SP16.PREFIX.length), notification: { title: "Test Spary", body: body }, data: { url: "./" },
            apns: { headers: { "apns-priority": "10", "apns-push-type": "alert" }, payload: { aps: { sound: "default" } } }, android: { priority: "high", notification: { sound: "default" } } } }) });
        o.code = rr.getResponseCode(); var t = String(rr.getContentText());
        if (o.code >= 300) { o.err = t.slice(0, 300); o.hint = sp26Hint_(t + " " + o.code); }
      } else {
        var aud = ep.match(/^https:\/\/[^\/]+/)[0], keys = sp14Keys_();
        var wr = UrlFetchApp.fetch(ep, { method: "post", muteHttpExceptions: true, followRedirects: false, headers: { TTL: "600", Urgency: "high", Authorization: "vapid t=" + sp14Jwt_(aud, keys) + ", k=" + keys.pub } });
        o.code = wr.getResponseCode(); if (o.code >= 300) { o.err = String(wr.getContentText()).slice(0, 200); o.hint = o.code === 404 || o.code === 410 ? "Abonnement expiré : désactive puis réactive les notifications." : ""; }
        o.host = aud.replace(/^https:\/\//, "");
      }
    } catch (e) { o.code = 0; o.err = String(e && e.message || e).slice(0, 300); o.hint = sp26Hint_(o.err); }
    res.push(o);
  });
  return { status: "success", devices: res, fcm: !!sa };
}
/** Depuis l'éditeur : sp26TesterPush("pseudo") affiche le diagnostic complet. */
function sp26TesterPush(pseudo) {
  var r = sp26PushTest_(String(pseudo || "").trim());
  console.log("Firebase configuré : " + (r.fcm ? "oui" : "NON") + " | appareils : " + r.devices.length);
  r.devices.forEach(function (o) { console.log(o.kind + (o.plat ? " (" + o.plat + ")" : "") + " → " + o.code + (o.err ? " " + o.err : " (accepté)") + (o.hint ? "\n   ⇒ " + o.hint : "")); });
  if (!r.devices.length) console.log("Aucun appareil enregistré pour ce membre : ouvre l'appli, Profil → Compte et données → Tester les notifications.");
}

/* ===================== RGPD ===================== */
function sp26DeleteUser_(pseudo) {
  var p = sp26Lc_(pseudo);
  rewriteRows_(sp26ShPlus_(), function (r) {
    if (sp26Lc_(r[1]) === p) return null;
    if (sp26Lc_(r[4]) === p) { var c = r.slice(); c[4] = ""; c[5] = ""; return c; }
    return r;
  });
  rewriteRows_(sp26ShNotes_(), function (r) { return sp26Lc_(r[4]) === p || sp26Lc_(r[5]) === p ? null : r; });
  CacheService.getScriptCache().remove("sp26:notes");
}
function sp26Export_(pseudo, out) {
  var p = sp26Lc_(pseudo), plus = {};
  rowsOf_(sp26ShPlus_()).forEach(function (r) { if (sp26Lc_(r[1]) === p) plus[String(r[0])] = { visibilite: String(r[2]), details: jsonSafe_(r[3]), partenaire: String(r[4] || ""), statut_partenaire: String(r[5] || "") }; });
  out.seances_details = plus;
  out.seances_invite = rowsOf_(sp26ShPlus_()).filter(function (r) { return sp26Lc_(r[4]) === p; }).map(function (r) { return { seance: String(r[0]), auteur: String(r[1]), statut: String(r[5]) }; });
  out.notes_donnees = rowsOf_(sp26ShNotes_()).filter(function (r) { return sp26Lc_(r[4]) === p; }).map(function (r) { return { date: new Date(Number(r[1])).toISOString(), source: r[2], membre: String(r[5]), note: Number(r[6]) || null, qualites: String(r[7] || ""), statut: String(r[8] || "") }; });
  var s = sp26NoteSummary_(pseudo, true);
  out.notes_recues = { personnes: s.raters || 0, moyenne: s.avg || null, repartition_1_a_5: s.dist || null };
}

/* ===================== Installation ===================== */
function sp26Install_() {
  if (SP26.installed || typeof doPost !== "function" || typeof SP8 === "undefined" || !SP8.installed || typeof SP23 === "undefined" || !SP23.installed) return;
  SP26.installed = true;
  SP26.NEW_SPORTS.forEach(function (s) { if (SP23.SPORTS.indexOf(s) < 0) SP23.SPORTS.splice(SP23.SPORTS.length - 1, 0, s); });

  var prev = doPost;
  var handle = function (e, data) {
    switch (data.action) {
      case "trainSave":   return out_(sp26AfterSave_(data, sp8Parse_(prev(e))));
      case "trainList":   return out_(sp26ListMerge_(data, sp8Parse_(prev(e))));
      case "trainDelete": var dr = sp8Parse_(prev(e));
                          if (dr && dr.status === "success") sp8After_(function () { rewriteRows_(sp26ShPlus_(), function (r) { return String(r[0]) === String(data.id) ? null : r; }); sp26DropCaches_(); });
                          return out_(dr);
      case "trainUpdate": return out_(sp26Update_(data));
      case "duoRespond":  return out_(sp26DuoRespond_(data));
      case "pending16":   return out_(sp26Pending_(data));
      case "profil16":    return out_(sp26Profile_(data));
      case "seance16":    return out_(sp26Seance_(data));
      case "seanceReport": return out_(sp26Report_(data));
      case "kartBoard":   return out_(sp26Kart_(data));
      case "noteSubmit":  return out_(sp26NoteSubmit_(data));
      case "noteContest": return out_(sp26NoteContest_(data));
      case "pushTest":    var me = sessionUser_(data.token); if (!me) return out_(err_("Session expirée."));
                          var lim = rate_("ptest:" + me.pseudo, 8, 3600, "Trop de tests. Réessaie dans une heure."); if (lim) return out_(err_(lim));
                          return out_(sp26PushTest_(me.pseudo));
    }
    return null;
  };
  doPost = function (e) {
    var data = null;
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (!data || !data.action) return prev(e);
    var r = null;
    try { r = handle(e, data); }
    catch (err) {
      var m = String(err && err.message || err);
      try { console.error("sp26 " + m + " | " + (err && err.stack || "")); } catch (x) {}
      r = out_({ status: "error", message: /lock/i.test(m) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
    if (r) { try { sp14Flush_(); } catch (x) {} return r; }
    return prev(e);
  };

  // Points des séances enregistrées ajoutés à ceux des séances postées (classement, profils, récap).
  var baseAct = sp8ActivityMap_;
  sp8ActivityMap_ = function () {
    var base = baseAct(), add = sp26ActMap_(), o = {};
    Object.keys(base).forEach(function (k) { o[k] = { points: base[k].points, n: base[k].n }; });
    Object.keys(add).forEach(function (k) { var x = o[k] = o[k] || { points: 0, n: 0 }; x.points += add[k].points; x.n += add[k].n; });
    return o;
  };
  // Signalements : libellé pour les avis de modération.
  try { if (typeof SP8_TYPE_LABEL !== "undefined") SP8_TYPE_LABEL.entrainement = "séance"; } catch (x) {}

  var baseDelete = deleteAccountData_;
  deleteAccountData_ = function (pseudo) { baseDelete(pseudo); try { sp26DeleteUser_(pseudo); } catch (x) {} };
  var baseExport = accountExport_;
  accountExport_ = function (d) {
    var r = baseExport(d);
    try { if (r && r.status === "success" && r.data && r.data.pseudo) sp26Export_(r.data.pseudo, r.data); } catch (x) {}
    return r;
  };
}
sp26Install_();

/** À exécuter une fois dans l'éditeur pour vérifier l'installation. */
function sp26Verifier() {
  if (!SP26.installed) return console.log("PROBLÈME : le fichier Performances doit être placé SOUS Entrainements (et au-dessus de Rgpd et Securite). sp8Verifier et sp23Verifier doivent afficher OK.");
  sp26ShPlus_(); sp26ShNotes_();
  console.log("OK : séances détaillées, séance à deux, karting, palmarès et notes actifs. Pense à publier une Nouvelle version du déploiement.");
  console.log("Sports ajoutés : " + SP26.NEW_SPORTS.join(", ") + ". Firebase pour l'appli : " + (sp16Account_() ? "prêt" : "FCM_SERVICE_ACCOUNT absente") + ".");
}

