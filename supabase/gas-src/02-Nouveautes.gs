/**
 * Spary v8 → v14 : séances postées + points, avis après séance, notifications push (v14).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Nouveautes », coller ce code.
 * Il doit être placé SOUS Code.gs dans la liste des fichiers (c'est le cas par défaut pour un nouveau fichier).
 * Aucune modification de Code.gs n'est nécessaire. Puis Déployer → Gérer les déploiements → crayon → Nouvelle version.
 * Pour vérifier : sélectionner la fonction sp8Verifier et cliquer sur Exécuter (le journal doit afficher « OK »).
 *
 * Ce fichier enveloppe doPost et quelques fonctions de Code.gs (statsAll_, deleteAccountData_, accountExport_)
 * sans les modifier. Toutes ses écritures passent par LockService. Aucun secret ici.
 * Les clubs ne voient jamais ces données (ni noms, ni notes).
 *
 * Onglets créés tout seuls :
 *  - Points       : date (ms) | pseudo | type | annonce | points | jour
 *  - PostsMeta    : annonce | sport | durée (min)
 *  - Avis         : date (ms) | séance | auteur | membre noté | note (0 = absent) | qualités | absent
 *  - AvisIgnores  : date (ms) | séance | pseudo
 *  - PushSubs     : date (ms) | pseudo | endpoint | p256dh | auth | dernier relevé (ms)
 *  - PushFile     : date (ms) | pseudo | titre | texte | lien | sujet (notifications « appli fermée », gardées 2 jours ; envoyées à chaque appareil abonné)
 *  - Amis         : de | à | statut (attente / ami) | date (ms)
 *  - Groupes      : id | nom | créateur | créé (ms)
 *  - GroupesMembres : groupe | pseudo | ajouté (ms)
 *  - AnnoncesImages : annonce | image (data URL JPEG, 45 Ko max)
 *  - ListeAttente, Recours : liste d'attente des séances, recours de modération et absences contestées
 *  - SeancesOptions : séance | option (adultes / alerte) | valeur | date
 *  - AlertesPrefs : pseudo | actif | lat | lng (arrondis ~1 km) | rayon | maj    - AlertesEnvoyees : date | séance | destinataire
 *  - Kudos : date | séance | de | à        - NiveauxVotes : date | séance | auteur | membre | sport | niveau 1-3
 *  - Défis (facultatif, à remplir à la main) : mois aaaa-mm | titre | objectif (sinon 500 séances)
 *  - SourcesInscription : jour (aaaa-mm-jj) | canal  (anonyme : aucun lien avec le compte)
 *  - PartagesProches : empreinte du jeton | séance | pseudo | expire | créé      - Parrainages : filleul | parrain | date
 * Push (v14) : clés VAPID créées toutes seules dans les propriétés du script (VAPID_PRIVATE, VAPID_PUBLIC) : ne pas les supprimer.
 * Météo : Open-Meteo appelé depuis le serveur (UrlFetchApp), coordonnées arrondies des lieux de séance uniquement.
 */

var SP8 = {
  SEANCE_POINTS: 100,      // points par séance postée
  SEANCE_PER_DAY: 1,       // séances récompensées par jour (heure de Paris), suppressions comprises
  SEANCE_MIN_DUR: 15,
  SEANCE_MAX_DUR: 480,
  SEANCE_MIN_TEXT: 10,
  REVIEW_DAYS: 7,          // délai pour noter après la fin d'une séance
  REVIEW_MIN_PUBLIC: 3,    // moyenne affichée à partir de 3 avis
  TAGS: ["Ponctuel", "Fair-play", "Bonne ambiance", "Bon niveau"],
  TZ: "Europe/Paris",
  WRITES: { reviewSubmit: 1, reviewSkip: 1, pushSubscribe: 1, pushUnsubscribe: 1 },
  installed: false
};

function sp8ShPoints_() { return sheetH_("Points", ["date (ms)", "pseudo", "type", "annonce", "points", "jour"]); }
function sp8ShMeta_()   { return sheetH_("PostsMeta", ["annonce", "sport", "durée (min)"]); }
function sp8ShAvis_()   { return sheetH_("Avis", ["date (ms)", "séance", "auteur", "membre noté", "note", "qualités", "absent"]); }
function sp8ShSkip_()   { return sheetH_("AvisIgnores", ["date (ms)", "séance", "pseudo"]); }
function sp8ShPush_()   { return sheetH_("PushSubs", ["date (ms)", "pseudo", "endpoint", "p256dh", "auth", "dernier relevé (ms)"]); }
function sp8Lc_(s) { return String(s == null ? "" : s).toLowerCase(); }
function sp8Day_() { return Utilities.formatDate(new Date(), SP8.TZ, "yyyy-MM-dd"); }
function sp8Locked_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var c = CacheService.getScriptCache(); ["sp8:fr", "sp8:grp", "sp8:wait"].forEach(function (k) { c.remove(k); });   // lecture fraîche sous verrou
  try { return fn(); } finally { try { lock.releaseLock(); } catch (x) {} }
}
/** Post-traitement après une action déjà réussie de Code.gs : une erreur ici ne doit pas faire croire à un échec. */
function sp8After_(fn, dflt) { try { return sp8Locked_(fn); } catch (e) { try { console.error("sp8 après-coup " + (e && e.message || e)); } catch (x) {} return dflt; } }
function sp8Parse_(textOutput) { try { return JSON.parse(textOutput.getContent()); } catch (e) { return null; } }

/** Réponses possibles à « Comment as-tu connu Spary ? » (facultatif, enregistré sans lien avec le compte). */
var SP8_SOURCES = ["instagram", "tiktok", "linkedin", "ami", "club", "recherche", "autre"];

/* ===================== Installation des enveloppes ===================== */
function sp8Install_() {
  if (typeof SP8 === "undefined" || !SP8 || SP8.installed || typeof doPost !== "function" || typeof statsAll_ !== "function" || typeof POST_TYPES === "undefined") return;
  SP8.installed = true;
  if (POST_TYPES.indexOf("Séance") < 0) POST_TYPES.push("Séance");

  var baseDoPost = doPost;
  var sp8DoPost = function (e) {
    var data = null;
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (!data || !data.action) return baseDoPost(e);
    try {
      switch (data.action) {
        case "reviewPending":   return out_(sp8ReviewPending_(data));
        case "reviewSummary":   return out_(sp8ReviewSummary_(data));
        case "reviewSubmit":    return out_(sp8Locked_(function () { return sp8ReviewSubmit_(data); }));
        case "reviewSkip":      return out_(sp8Locked_(function () { return sp8ReviewSkip_(data); }));
        case "pushSubscribe":   return out_(sp8Locked_(function () { return sp8PushSubscribe_(data); }));
        case "pushUnsubscribe": return out_(sp8Locked_(function () { return sp8PushUnsubscribe_(data); }));
        case "pushKey":         return out_(sp14Key_());
        case "logout":          if (data.pushEndpoint) sp8After_(function () { sp8PushUnsubscribe_({ token: data.token, endpoint: data.pushEndpoint }); }); return baseDoPost(e);
        case "pushPull":        return out_(sp8Locked_(function () { return sp14Pull_(data); }));
        case "sessionCancel":   var co = baseDoPost(e), cr = sp8Parse_(co); if (cr && cr.status === "success") sp8After_(function () { sp14OnCancel_(data); }); return co;
        case "matchSubmit":     var mo = baseDoPost(e), mr = sp8Parse_(mo); if (mr && mr.status === "success") sp8After_(function () { sp14OnMatch_(data, mr); }); return mo;
        case "matchRespond":    var mro = baseDoPost(e), mrr = sp8Parse_(mro); if (mrr && mrr.status === "success") sp8After_(function () { sp14OnMatchReply_(data, mrr); }); return mro;
        case "postCreate":      return sp8PostCreate_(e, data, baseDoPost);
        case "postList":        return sp8PostList_(e, data, baseDoPost);
        case "postDelete":      return sp8PostDelete_(e, data, baseDoPost);
        case "postImage":       return out_(sp8PostImage_(data));
        case "profileGet":      return sp8ProfileGet_(e, data, baseDoPost);
        case "profileSave":     var ps = baseDoPost(e); CacheService.getScriptCache().remove("sp8:priv"); return ps;
        case "friendList":      return out_(sp8FriendList_(data));
        case "friendRequest":   return out_(sp8Locked_(function () { return sp8FriendRequest_(data); }));
        case "friendRespond":   return out_(sp8Locked_(function () { return sp8FriendRespond_(data); }));
        case "friendRemove":    return out_(sp8Locked_(function () { return sp8FriendRemove_(data); }));
        case "groupList":       return out_(sp8GroupList_(data));
        case "groupCreate":     return out_(sp8Locked_(function () { return sp8GroupCreate_(data); }));
        case "groupAdd":        return out_(sp8Locked_(function () { return sp8GroupAdd_(data); }));
        case "groupLeave":      return out_(sp8Locked_(function () { return sp8GroupLeave_(data); }));
        case "groupRemove":     return out_(sp8Locked_(function () { return sp8GroupRemove_(data); }));
        case "groupRename":     return out_(sp8Locked_(function () { return sp8GroupRename_(data); }));
        case "waitJoin":        return out_(sp8Locked_(function () { return sp8WaitJoin_(data); }));
        case "waitLeave":       return out_(sp8Locked_(function () { return sp8WaitLeave_(data); }));
        case "sessionList":     return sp8SessionList_(e, data, baseDoPost);
        case "sessionJoin":     return sp8SessionJoin_(e, data, baseDoPost);
        case "sessionLeave":    return sp8SessionLeave_(e, data, baseDoPost);
        case "recap":           return out_(sp8Recap_(data));
        case "modNotices":      return out_(sp8ModNotices_(data));
        case "modAppeal":       return out_(sp8Locked_(function () { return sp8ModAppeal_(data); }));
        case "reportStatus":    return out_(sp8ReportStatus_(data));
        case "sessionCreate":   return sp8SessionCreate_(e, data, baseDoPost);
        case "msgSend":         var mg = sp8MsgGuard_(data); if (mg) return out_(err_(mg));
                                var so = baseDoPost(e), sr = sp8Parse_(so); if (sr && sr.status === "success") sp8After_(function () { sp14OnMsg_(data, sr); }); return so;
        case "lmPrefsGet":      return out_(sp8LmPrefsGet_(data));
        case "lmPrefsSave":     return out_(sp8Locked_(function () { return sp8LmPrefsSave_(data); }));
        case "lmAlert":         var la = sp8Locked_(function () { return sp8LmAlert_(data); }), lm = la._mail; delete la._mail;
                                try { sp8LmMail_(lm); } catch (x) {}
                                return out_(la);
        case "lmInbox":         return out_(sp8LmInbox_(data));
        case "kudoGive":        return out_(sp8Locked_(function () { return sp8KudoGive_(data); }));
        case "absenceList":     return out_(sp8AbsenceList_(data));
        case "absenceContest":  return out_(sp8Locked_(function () { return sp8AbsenceContest_(data); }));
        case "challenge":       return out_(sp8Challenge_(data));
        case "weather":         return out_(sp8Weather_(data));
        case "shareCreate":     return out_(sp8Locked_(function () { return sp8ShareCreate_(data); }));
        case "shareView":       return out_(sp8ShareView_(data));
        case "referralClaim":   return out_(sp8Locked_(function () { return sp8RefClaim_(data); }));
        case "referralInfo":    return out_(sp8RefInfo_(data));
        case "blockSet":        var bo = baseDoPost(e), br = sp8Parse_(bo);
                                if (br && br.status === "success" && br.blocked) sp8After_(function () { sp8FriendRemove_({ token: data.token, pseudo: br.pseudo }); });
                                return bo;
        case "register":        var ro = baseDoPost(e), rr = sp8Parse_(ro), src = String(data.source || "");
                                if (rr && rr.status === "success" && SP8_SOURCES.indexOf(src) >= 0)
                                  sp8After_(function () { sheetH_("SourcesInscription", ["jour", "canal"]).appendRow([Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd"), src]); });
                                return ro;
        case "report":          if (data.goodFaith === false) return out_(err_("Cochez la case de bonne foi pour envoyer le signalement.")); return baseDoPost(e);
      }
    } catch (err) {
      var m = String(err && err.message || err);
      try { console.error("sp8 " + m + " | " + (err && err.stack || "")); } catch (x) {}
      return out_({ status: "error", message: /lock/i.test(m) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
    return baseDoPost(e);
  };
  doPost = function (e) { var r = sp8DoPost(e); try { sp14Flush_(); } catch (x) {} return r; };

  // Points de séances ajoutés aux points de matchs : classement, profils, stats.
  var baseStats = statsAll_;
  statsAll_ = function () {
    var base = baseStats(), act = sp8ActivityMap_(), st = {};
    Object.keys(base).forEach(function (k) { var o = base[k]; st[k] = { games: o.games, wins: o.wins, points: o.points, bySport: o.bySport || {} }; });
    Object.keys(act).forEach(function (k) {
      var o = st[k] = st[k] || { games: 0, wins: 0, points: 0, bySport: {} };
      o.points += act[k].points; o.seances = act[k].n;
    });
    var ref = {}; try { ref = sp8RefBonus_(); } catch (x) {}
    Object.keys(ref).forEach(function (k) {
      if (!ref[k].pts) return;
      var o = st[k] = st[k] || { games: 0, wins: 0, points: 0, bySport: {} };
      o.points += ref[k].pts; o.parrainage = ref[k].pts;
    });
    return st;
  };

  // Compte privé : le champ « private » est conservé dans le profil.
  var baseClean = cleanProfile_;
  cleanProfile_ = function (p) { var o = baseClean(p); o.private = !!(p && p.private === true); return o; };

  // Groupes de discussion : réutilisent le canal « #id » des séances (messages, droits d'écriture et de lecture).
  var baseSids = mySeanceIds_;
  mySeanceIds_ = function (pseudo) {
    var ids = baseSids(pseudo), g = sp8MyGroupIds_(pseudo), o = {};
    Object.keys(ids).forEach(function (k) { o[k] = 1; });
    Object.keys(g).forEach(function (k) { o[k] = 1; });
    return o;
  };

  // Suppression de compte (et purge des inactifs) : on efface aussi nos onglets.
  var baseDelete = deleteAccountData_;
  deleteAccountData_ = function (pseudo) { baseDelete(pseudo); sp8DeleteUser_(pseudo); };

  // Export RGPD : on ajoute nos données.
  var baseExport = accountExport_;
  accountExport_ = function (d) {
    var r = baseExport(d);
    if (r && r.status === "success" && r.data) {
      try { sp8ExportUser_(r.data.pseudo, r.data); } catch (x) {}
    }
    return r;
  };
}
sp8Install_();

/** À exécuter une fois dans l'éditeur pour vérifier l'installation. */
function sp8Verifier() {
  var ok = SP8.installed && POST_TYPES.indexOf("Séance") >= 0;   // état au chargement, comme pour le site
  console.log(ok
    ? "OK : nouveautés actives. Pensez à publier une Nouvelle version du déploiement."
    : "PROBLÈME : dans la liste des fichiers à gauche, Nouveautes doit être placé SOUS Code.gs (menu ⋮ du fichier > Déplacer vers le bas). Ne modifiez pas Code.gs.");
  sp8Install_();
  sp8ShPoints_(); sp8ShMeta_(); sp8ShAvis_(); sp8ShSkip_(); sp8ShPush_();
  sp8ShFriends_(); sp8ShGroups_(); sp8ShGroupMembers_(); sp8ShImg_(); sp8ShWait_(); sp8ShAppeal_();
  sp8ShOpt_(); sp8ShLmPrefs_(); sp8ShLmSent_(); sp8ShKudos_(); sp8ShLvl_(); sp8ShDefis_(); sp8ShShare_(); sp8ShRef_();
  sp14ShFile_(); console.log("Notifications push : clé publique " + sp14Keys_().pub.slice(0, 12) + "… prête.");
  var sa = sp16Account_(); console.log("Notifications de l'appli mobile : " + (sa ? "Firebase prêt (projet " + sa.project_id + ")." : "pas encore configurées (Script Property FCM_SERVICE_ACCOUNT absente)."));
}

/* ===================== 1. Séances postées + points ===================== */
function sp8PostCreate_(e, data, baseDoPost) {
  var seance = data.badge === "Séance", img = "";
  if (data.img) {
    img = sp8CleanImg_(data.img);
    if (!img) return out_(err_("Image invalide ou trop lourde."));
    var me0 = sessionUser_(data.token);
    if (me0) { var lim = rate_("pimg:" + me0.pseudo, 10, 86400, "Trop d'images publiées aujourd'hui."); if (lim) return out_(err_(lim)); }
  }
  if (!seance && !img) return baseDoPost(e);
  if (seance) {
    var dur = Math.round(Number(data.dur) || 0), sport = clip_(data.sport, 40);
    if (dur < SP8.SEANCE_MIN_DUR || dur > SP8.SEANCE_MAX_DUR) return out_(err_("Indiquez une durée entre 15 min et 8 h."));
    if (String(data.text || "").trim().length < SP8.SEANCE_MIN_TEXT) return out_(err_("Racontez votre séance en quelques mots."));
    if (!sport) return out_(err_("Choisissez un sport."));
  }
  var res = sp8Parse_(baseDoPost(e));                                // création de l'annonce par Code.gs (son propre verrou)
  if (!res || res.status !== "success" || !res.id) return out_(res || err_("Publication impossible."));
  if (img) sp8After_(function () { sp8ShImg_().appendRow([String(res.id), img]); CacheService.getScriptCache().remove("sp8:imgs"); });
  if (!seance) return out_(res);
  var me = sessionUser_(data.token);
  var award = sp8After_(function () {
    sp8ShMeta_().appendRow([String(res.id), sport, dur]);
    var today = sp8Day_(), p = sp8Lc_(me.pseudo), n = 0;
    rowsOf_(sp8ShPoints_()).forEach(function (r) { if (sp8Lc_(r[1]) === p && r[2] === "seance" && String(r[5]) === today) n++; });
    if (n >= SP8.SEANCE_PER_DAY) return { points: 0, capped: true };
    sp8ShPoints_().appendRow([Date.now(), me.pseudo, "seance", String(res.id), SP8.SEANCE_POINTS, today]);
    var c = CacheService.getScriptCache(); c.remove("sp8:act"); c.remove("sp8:meta"); c.remove("sp8:ref");
    return { points: SP8.SEANCE_POINTS, capped: false };
  }, { points: 0, capped: false });
  res.points = award.points; res.capped = award.capped;
  return out_(res);
}

/** Points valides par membre : l'annonce doit exister encore et ne pas être retirée par la modération. */
function sp8ActivityMap_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:act");
  if (hit) return jsonSafe_(hit);
  var live = {}, hid = hidden_(), map = {};
  rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (r[0]) live[String(r[0])] = 1; });
  rowsOf_(sp8ShPoints_()).forEach(function (r) {
    var id = String(r[3]);
    if (!live[id] || hid["annonce:" + id]) return;
    var k = sp8Lc_(r[1]), o = map[k] = map[k] || { points: 0, n: 0 };
    o.points += Number(r[4]) || 0; o.n++;
  });
  try { c.put("sp8:act", JSON.stringify(map), 120); } catch (x) {}
  return map;
}
function sp8PostMeta_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:meta");
  if (hit) return jsonSafe_(hit);
  var m = {};
  rowsOf_(sp8ShMeta_()).forEach(function (r) { m[String(r[0])] = { s: String(r[1]), d: Number(r[2]) || 0 }; });
  rowsOf_(sp8ShPoints_()).forEach(function (r) { var o = m[String(r[3])]; if (o) o.p = Number(r[4]) || 0; });
  try { c.put("sp8:meta", JSON.stringify(m), 300); } catch (x) {}
  return m;
}
function sp8PostList_(e, data, baseDoPost) {
  var res = sp8Parse_(baseDoPost(e));
  if (!res || res.status !== "success" || !Array.isArray(res.posts)) return out_(res || err_("Erreur serveur."));
  var meta = sp8PostMeta_(), hid = hidden_(), imgs = sp8ImgIds_(), me = sessionUser_(data.token);
  var priv = sp8PrivateSet_(), fr = me ? sp8FriendState_(me.pseudo) : {}, mine = me ? sp8Lc_(me.pseudo) : "";
  res.posts = res.posts.filter(function (p) { var k = sp8Lc_(p.pseudo); return k === mine || !priv[k] || fr[k] === "ami"; });
  if (data.pseudo && priv[sp8Lc_(data.pseudo)] && sp8Lc_(data.pseudo) !== mine && fr[sp8Lc_(data.pseudo)] !== "ami") res.private = true;
  res.posts.forEach(function (p) {
    if (imgs[String(p.id)] && !hid["annonce:" + p.id]) p.img = 1;
    var m = meta[String(p.id)]; if (!m) return;
    p.sport = m.s; p.dur = m.d;
    if (m.p && !hid["annonce:" + p.id]) p.points = m.p;
  });
  return out_(res);
}

/* ===================== 2. Avis après séance ===================== */
/** Séances terminées depuis moins de REVIEW_DAYS jours, non annulées, avec leurs inscrits. */
function sp8RecentSessions_() {
  var now = Date.now(), since = now - SP8.REVIEW_DAYS * 864e5, out = {}, list = [];
  rowsOf_(shSeances_()).forEach(function (r) {
    var start = Number(r[7]), end = start + (Number(r[15]) || 90) * 60000;
    if (r[12] !== "ouverte" || end > now || start < since) return;
    var s = { id: String(r[0]), sport: String(r[3]), place: String(r[4]), start: start, players: [] };
    out[s.id] = s; list.push(s);
  });
  rowsOf_(shInscr_()).forEach(function (r) { var s = out[String(r[0])]; if (s) s.players.push({ pseudo: String(r[1]), name: String(r[2]) }); });
  return { byId: out, list: list };
}
function sp8In_(s, pseudo) { var p = sp8Lc_(pseudo); return s.players.some(function (x) { return sp8Lc_(x.pseudo) === p; }); }

function sp8ReviewPending_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var p = sp8Lc_(me.pseudo), done = {}, skip = {};
  rowsOf_(sp8ShAvis_()).forEach(function (r) { if (sp8Lc_(r[2]) === p) done[String(r[1]) + "|" + sp8Lc_(r[3])] = 1; });
  rowsOf_(sp8ShSkip_()).forEach(function (r) { if (sp8Lc_(r[2]) === p) skip[String(r[1])] = 1; });
  var bl = blocks_(me.pseudo), out = [];
  sp8RecentSessions_().list.forEach(function (s) {
    if (skip[s.id] || !sp8In_(s, p)) return;
    var others = s.players.filter(function (x) {
      var k = sp8Lc_(x.pseudo);
      return k !== p && k !== "[supprimé]" && !done[s.id + "|" + k] && !hides_(bl, x.pseudo);
    });
    if (others.length) out.push({ id: s.id, sport: s.sport, place: s.place, start: s.start, players: others.slice(0, 20) });
  });
  out.sort(function (a, b) { return b.start - a.start; });
  return { status: "success", sessions: out.slice(0, 5) };
}

function sp8ReviewSubmit_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var lim = rate_("rvw:" + me.pseudo, 30, 3600, "Trop d'avis en peu de temps. Réessayez plus tard.");
  if (lim) return err_(lim);
  var s = sp8RecentSessions_().byId[String(d.sid)];
  if (!s) return err_("Cette séance ne peut pas (ou plus) être notée.");
  var p = sp8Lc_(me.pseudo);
  if (!sp8In_(s, p)) return err_("Vous ne participiez pas à cette séance.");
  var sh = sp8ShAvis_(), done = {}, n = 0;
  rowsOf_(sh).forEach(function (r) { if (String(r[1]) === s.id && sp8Lc_(r[2]) === p) done[sp8Lc_(r[3])] = 1; });
  (Array.isArray(d.reviews) ? d.reviews.slice(0, 20) : []).forEach(function (rv) {
    var t = sp8Lc_(rv && rv.target);
    if (!t || t === p || done[t] || !sp8In_(s, t)) return;
    var noshow = rv.noshow === true, stars = noshow ? 0 : Math.round(Number(rv.stars) || 0);
    if (!noshow && (stars < 1 || stars > 5)) return;
    var tags = noshow ? [] : (Array.isArray(rv.tags) ? rv.tags : []).filter(function (x) { return SP8.TAGS.indexOf(x) >= 0; }).slice(0, 4);
    var target = s.players.filter(function (x) { return sp8Lc_(x.pseudo) === t; })[0].pseudo;
    sh.appendRow([Date.now(), s.id, me.pseudo, target, stars, tags.join(","), noshow ? "oui" : ""]);
    var lv = Math.round(Number(rv.level) || 0);
    if (!noshow && lv >= 1 && lv <= 3) { sp8ShLvl_().appendRow([Date.now(), s.id, me.pseudo, target, s.sport, lv]); CacheService.getScriptCache().remove("sp8:lvl"); }
    done[t] = 1; n++;
  });
  if (!n) return err_("Aucun avis valide.");
  CacheService.getScriptCache().remove("sp8:rv"); CacheService.getScriptCache().remove("sp8:rel");
  return { status: "success", saved: n };
}
function sp8ReviewSkip_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var sid = String(Number(d.sid) || "");
  if (sid) sp8ShSkip_().appendRow([Date.now(), sid, me.pseudo]);
  return { status: "success" };
}
/** Moyenne publique : seulement à partir de REVIEW_MIN_PUBLIC avis, jamais l'auteur. Les absences ne comptent pas dans la moyenne. */
function sp8ReviewAll_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:rv");
  if (hit) return jsonSafe_(hit);
  var m = {};
  rowsOf_(sp8ShAvis_()).forEach(function (r) {
    if (r[6] === "oui") return;
    var k = sp8Lc_(r[3]), o = m[k] = m[k] || { sum: 0, n: 0, tags: {} };
    o.sum += Number(r[4]) || 0; o.n++;
    String(r[5] || "").split(",").forEach(function (x) { if (x) o.tags[x] = (o.tags[x] || 0) + 1; });
  });
  try { c.put("sp8:rv", JSON.stringify(m), 300); } catch (x) {}
  return m;
}
function sp8ReviewSummary_(d) {
  if (!sessionUser_(d.token)) return err_("Session expirée.");
  var o = sp8ReviewAll_()[sp8Lc_(d.pseudo)], rel = sp8Reliab_()[sp8Lc_(d.pseudo)], res = { status: "success", count: 0 };
  if (o && o.n >= SP8.REVIEW_MIN_PUBLIC) { res.avg = Math.round(o.sum / o.n * 100) / 100; res.count = o.n; res.tags = o.tags; }
  if (rel && rel.n >= SP8_RELIAB_MIN) { res.reliab = Math.round(100 * (rel.n - rel.abs) / rel.n); res.reliabN = rel.n; }
  try {
    var me = sessionUser_(d.token), t = findAccount_(sp8Pseudo_(d.pseudo));
    res.kudos = sp8KudoCounts_()[sp8Lc_(d.pseudo)] || 0;
    res.levels = sp8LevelsOf_(d.pseudo);
    if (me && t && sp8Lc_(t.pseudo) !== sp8Lc_(me.pseudo)) res.canKudo = sp8KudoEligible_(me.pseudo, t.pseudo).length > 0;
  } catch (x) {}
  return res;
}

/* ===================== 3. Notifications : abonnements push ===================== */
// Un appareil = un abonnement. L'envoi « appli fermée » est en section 20.
function sp8PushSubscribe_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var sub = d.sub || {}, ep = String(sub.endpoint || ""), keys = sub.keys || {};
  if (d.native) {                                     // appli iPhone / Android : jeton Firebase
    var tok = String(d.fcm || "");
    if (!/^[A-Za-z0-9:_\-]{20,400}$/.test(tok)) return err_("Abonnement invalide.");
    ep = SP16.PREFIX + tok; keys = { p256dh: String(d.native).slice(0, 10), auth: "" };
  } else
  if (!/^https:\/\/[^\s"'<>]+$/.test(ep) || ep.length > 1000) return err_("Abonnement invalide.");
  var sh = sp8ShPush_(), rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) if (rows[i][2] === ep) sh.deleteRow(i + 1);
  sh.appendRow([Date.now(), me.pseudo, ep, clip_(keys.p256dh, 200), clip_(keys.auth, 100), Date.now()]);
  return { status: "success" };
}
function sp8PushUnsubscribe_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var sh = sp8ShPush_(), rows = sh.getDataRange().getValues(), ep = String(d.endpoint || ""), p = sp8Lc_(me.pseudo);
  for (var i = rows.length - 1; i >= 1; i--) if (rows[i][2] === ep && sp8Lc_(rows[i][1]) === p) sh.deleteRow(i + 1);
  return { status: "success" };
}

/* ===================== 4. RGPD ===================== */
function sp8ExportUser_(pseudo, out) {
  var p = sp8Lc_(pseudo);
  out.points_séances = rowsOf_(sp8ShPoints_()).filter(function (r) { return sp8Lc_(r[1]) === p; })
    .map(function (r) { return { date: Number(r[0]), annonce: r[3], points: r[4] }; });
  out.avis_donnés = rowsOf_(sp8ShAvis_()).filter(function (r) { return sp8Lc_(r[2]) === p; })
    .map(function (r) { return { date: Number(r[0]), séance: r[1], membre: r[3], note: r[4], qualités: r[5], absent: r[6] === "oui" }; });
  var rv = sp8ReviewAll_()[p];
  out.avis_reçus = rv ? { nombre: rv.n, moyenne: rv.n ? Math.round(rv.sum / rv.n * 100) / 100 : null, qualités: rv.tags } : null;
  out.notifications_push = rowsOf_(sp8ShPush_()).filter(function (r) { return sp8Lc_(r[1]) === p; }).length + " appareil(s) abonné(s)";
  out.notifications_recentes = rowsOf_(sp14ShFile_()).filter(function (r) { return sp8Lc_(r[1]) === p; }).map(function (r) { return { date: Number(r[0]), titre: r[2], texte: r[3] }; });
  out.amis = rowsOf_(sp8ShFriends_()).filter(function (r) { return sp8Lc_(r[0]) === p || sp8Lc_(r[1]) === p; })
    .map(function (r) { return { de: r[0], à: r[1], statut: r[2], date: Number(r[3]) }; });
  var gm = {}; rowsOf_(sp8ShGroupMembers_()).forEach(function (r) { if (sp8Lc_(r[1]) === p) gm[String(r[0])] = 1; });
  out.groupes = rowsOf_(sp8ShGroups_()).filter(function (r) { return gm[String(r[0])]; }).map(function (r) { return { id: r[0], nom: r[1], créateur: r[2] }; });
  var mineIds = {}; (out.annonces || []).forEach(function (a) { mineIds[String(a.id)] = 1; });
  out.liste_attente = rowsOf_(sp8ShWait_()).filter(function (r) { return sp8Lc_(r[1]) === p; }).map(function (r) { return { séance: r[0], date: Number(r[3]), statut: r[4] }; });
  out.recours_modération = rowsOf_(sp8ShAppeal_()).filter(function (r) { return sp8Lc_(r[1]) === p; }).map(function (r) { return { date: Number(r[0]), type: r[2], cible: r[3], texte: r[4], statut: r[5] }; });
  out.alertes_dernière_minute = rowsOf_(sp8ShLmPrefs_()).filter(function (r) { return sp8Lc_(r[0]) === p; }).map(function (r) { return { actif: r[1] === "oui", zone_lat: r[2], zone_lng: r[3], rayon_km: r[4] }; })[0] || null;
  out.alertes_reçues = rowsOf_(sp8ShLmSent_()).filter(function (r) { return sp8Lc_(r[2]) === p; }).map(function (r) { return { date: Number(r[0]), séance: r[1] }; });
  out.kudos_donnés = rowsOf_(sp8ShKudos_()).filter(function (r) { return sp8Lc_(r[2]) === p; }).map(function (r) { return { date: Number(r[0]), séance: r[1], à: r[3] }; });
  out.kudos_reçus = rowsOf_(sp8ShKudos_()).filter(function (r) { return sp8Lc_(r[3]) === p; }).length;
  out.votes_niveau_donnés = rowsOf_(sp8ShLvl_()).filter(function (r) { return sp8Lc_(r[2]) === p; }).map(function (r) { return { date: Number(r[0]), séance: r[1], membre: r[3], sport: r[4], niveau: SP8_LVL[Number(r[5])] || "" }; });
  out.niveau_confirmé = sp8LevelsOf_(p);
  out.liens_proches = rowsOf_(sp8ShShare_()).filter(function (r) { return sp8Lc_(r[2]) === p; }).map(function (r) { return { séance: r[1], expire: Number(r[3]) }; });
  out.parrainage = { parrain: (rowsOf_(sp8ShRef_()).filter(function (r) { return sp8Lc_(r[0]) === p; })[0] || [])[1] || null, filleuls: rowsOf_(sp8ShRef_()).filter(function (r) { return sp8Lc_(r[1]) === p; }).length };
  out.images_annonces = rowsOf_(sp8ShImg_()).filter(function (r) { return mineIds[String(r[0])]; }).length + " image(s) (non incluses)";
}
function sp8DeleteUser_(pseudo) {
  var p = sp8Lc_(pseudo);
  [[sp8ShPoints_(), [1]], [sp8ShAvis_(), [2, 3]], [sp8ShSkip_(), [2]], [sp8ShPush_(), [1]], [sp8ShFriends_(), [0, 1]], [sp8ShGroupMembers_(), [1]], [sp8ShWait_(), [1]], [sp8ShAppeal_(), [1]], [sp8ShLmPrefs_(), [0]], [sp8ShLmSent_(), [2]], [sp8ShKudos_(), [2, 3]], [sp8ShLvl_(), [2, 3]], [sp8ShShare_(), [2]], [sp8ShRef_(), [0, 1]], [sp14ShFile_(), [1]]].forEach(function (x) {
    var sh = x[0], rows = sh.getDataRange().getValues();
    for (var i = rows.length - 1; i >= 1; i--) {
      if (x[1].some(function (col) { return sp8Lc_(rows[i][col]) === p; })) sh.deleteRow(i + 1);
    }
  });
  sp8CleanOrphans_();
  var c = CacheService.getScriptCache(); ["sp8:act", "sp8:meta", "sp8:rv", "sp8:rel", "sp8:imgs", "sp8:fr", "sp8:priv", "sp8:grp", "sp8:wait", "sp8:kudo", "sp8:lvl", "sp8:age", "sp8:ref"].forEach(function (k) { c.remove(k); });
}

/* ===================== 5. Amis et compte privé ===================== */
var SP8_MAX_FRIENDS = 300, SP8_MAX_GROUPS = 20, SP8_GROUP_MAX = 30, SP8_IMG_MAX = 45000;
function sp8ShFriends_()      { return sheetH_("Amis", ["de", "à", "statut", "date (ms)"]); }
function sp8ShGroups_()       { return sheetH_("Groupes", ["id", "nom", "créateur", "créé (ms)"]); }
function sp8ShGroupMembers_() { return sheetH_("GroupesMembres", ["groupe", "pseudo", "ajouté (ms)"]); }
function sp8ShImg_()          { return sheetH_("AnnoncesImages", ["annonce", "image"]); }
function sp8Pseudo_(v) { v = String(v || "").replace(/^@/, "").trim(); return /^[A-Za-z0-9_.-]{3,20}$/.test(v) ? v : ""; }

/** Toutes les relations : { "a|b": { de, à, statut } } avec a < b. Mis en cache 2 min. */
function sp8FriendRows_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:fr");
  if (hit) return jsonSafe_(hit);
  var list = rowsOf_(sp8ShFriends_()).filter(function (r) { return r[0] && r[1]; }).map(function (r) { return [String(r[0]), String(r[1]), String(r[2]), Number(r[3]) || 0]; });
  try { c.put("sp8:fr", JSON.stringify(list), 120); } catch (x) {}
  return list;
}
function sp8ForgetFriends_() { var c = CacheService.getScriptCache(); c.remove("sp8:fr"); }
/** État vu par `pseudo` : { autre: "ami" | "envoyee" | "recue" } */
function sp8FriendState_(pseudo) {
  var p = sp8Lc_(pseudo), o = {};
  sp8FriendRows_().forEach(function (r) {
    var a = sp8Lc_(r[0]), b = sp8Lc_(r[1]);
    if (a !== p && b !== p) return;
    var other = a === p ? b : a;
    o[other] = r[2] === "ami" ? "ami" : (a === p ? "envoyee" : "recue");
  });
  return o;
}
function sp8PrivateSet_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:priv");
  if (hit) return jsonSafe_(hit);
  var o = {}, m = profMap_();
  Object.keys(m).forEach(function (k) { if (m[k].data && m[k].data.private === true) o[k] = 1; });
  try { c.put("sp8:priv", JSON.stringify(o), 60); } catch (x) {}
  return o;
}

function sp8FriendList_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var st = sp8FriendState_(me.pseudo), nm = nameMap_(), profs = profMap_(), out = { friends: [], incoming: [], outgoing: [] };
  Object.keys(st).forEach(function (k) {
    var acc = nm[k]; if (!acc || isBanned_(k)) return;
    var o = { pseudo: acc.pseudo, name: shownName_(acc, profs[k]) };
    (st[k] === "ami" ? out.friends : st[k] === "recue" ? out.incoming : out.outgoing).push(o);
  });
  ["friends", "incoming", "outgoing"].forEach(function (k) { out[k].sort(function (a, b) { return a.name.localeCompare(b.name); }); });
  out.status = "success";
  return out;
}
function sp8FriendRequest_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var to = findAccount_(sp8Pseudo_(d.pseudo));
  if (!to) return err_("Ce membre n'existe pas.");
  var p = sp8Lc_(me.pseudo), q = sp8Lc_(to.pseudo);
  if (p === q) return err_("Vous ne pouvez pas vous ajouter vous-même.");
  var bl = blocks_(me.pseudo);
  if (bl.mine[q] || bl.them[q] || isBanned_(q)) return err_("Impossible d'ajouter ce membre.");
  var lim = rate_("frq:" + me.pseudo, 40, 3600, "Trop de demandes en peu de temps. Réessayez plus tard.");
  if (lim) return err_(lim);
  var st = sp8FriendState_(me.pseudo);
  if (st[q] === "ami") return { status: "success", state: "ami" };
  if (st[q] === "envoyee") return { status: "success", state: "envoyee" };
  if (st[q] === "recue") return sp8FriendRespond_({ token: d.token, pseudo: to.pseudo, accept: true });
  var n = 0; Object.keys(st).forEach(function (k) { if (st[k] === "ami") n++; });
  if (n >= SP8_MAX_FRIENDS) return err_("Vous avez atteint " + SP8_MAX_FRIENDS + " amis.");
  sp8ShFriends_().appendRow([me.pseudo, to.pseudo, "attente", Date.now()]);
  sp8ForgetFriends_();
  try { sp14OnFriend_(me, to.pseudo); } catch (x) {}
  return { status: "success", state: "envoyee" };
}
function sp8FriendRespond_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var q = sp8Lc_(sp8Pseudo_(d.pseudo)), p = sp8Lc_(me.pseudo), sh = sp8ShFriends_(), rows = sh.getDataRange().getValues();
  if (d.accept === true) {
    var bl = blocks_(me.pseudo);
    if (bl.mine[q] || bl.them[q] || isBanned_(q)) return err_("Impossible d'ajouter ce membre.");
    var st0 = sp8FriendState_(me.pseudo), n0 = 0; Object.keys(st0).forEach(function (k) { if (st0[k] === "ami") n0++; });
    if (n0 >= SP8_MAX_FRIENDS) return err_("Vous avez atteint " + SP8_MAX_FRIENDS + " amis.");
  }
  for (var i = rows.length - 1; i >= 1; i--) {
    if (sp8Lc_(rows[i][0]) === q && sp8Lc_(rows[i][1]) === p && rows[i][2] === "attente") {
      if (d.accept === true) sh.getRange(i + 1, 3, 1, 2).setValues([["ami", Date.now()]]);
      else sh.deleteRow(i + 1);
      sp8ForgetFriends_();
      return { status: "success", state: d.accept === true ? "ami" : "" };
    }
  }
  return err_("Demande introuvable.");
}
/** Retire un ami, annule une demande envoyée ou refuse une demande reçue. Le retire aussi des groupes dont l'un est créateur. */
function sp8FriendRemove_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var q = sp8Lc_(sp8Pseudo_(d.pseudo)), p = sp8Lc_(me.pseudo), sh = sp8ShFriends_(), rows = sh.getDataRange().getValues(), n = 0;
  for (var i = rows.length - 1; i >= 1; i--) {
    var a = sp8Lc_(rows[i][0]), b = sp8Lc_(rows[i][1]);
    if ((a === p && b === q) || (a === q && b === p)) { sh.deleteRow(i + 1); n++; }
  }
  sp8ForgetFriends_();
  var g = sp8GroupsAll_();
  Object.keys(g).forEach(function (id) {
    var o = g[id], own = sp8Lc_(o.owner);
    if (own === p && sp8IsMember_(o, q)) sp8DropMember_(o, q);
    else if (own === q && sp8IsMember_(o, p)) sp8DropMember_(o, p);
  });
  return { status: "success", removed: n };
}

/** profileGet : les profils privés ne montrent que nom et photo aux non-amis. Ajoute l'état d'amitié. */
var sp8BlkMemo_ = {};
function sp8Blk_(pseudo) { var k = sp8Lc_(pseudo); return sp8BlkMemo_[k] || (sp8BlkMemo_[k] = blocks_(pseudo)); }
function sp8ProfileGet_(e, data, baseDoPost) {
  sp8BlkMemo_ = {};
  var res = sp8Parse_(baseDoPost(e));
  if (!res || res.status !== "success" || !res.profiles) return out_(res || err_("Erreur serveur."));
  var me = sessionUser_(data.token), st = me ? sp8FriendState_(me.pseudo) : {}, priv = sp8PrivateSet_(), mine = me ? sp8Lc_(me.pseudo) : "";
  Object.keys(res.profiles).forEach(function (ps) {
    var k = sp8Lc_(ps), o = res.profiles[ps];
    var blk = me && k !== mine && (hides_(sp8Blk_(me.pseudo), ps));
    o.friend = blk ? "" : st[k] || "";
    if (priv[k]) {
      o.private = true;
      if (k !== mine && o.friend !== "ami") {
        o.locked = true; o.state = "hidden";
        o.bio = ""; o.city = ""; o.club = ""; o.link = ""; o.sports = []; o.avail = {};
        o.emoji = ""; o.text = "";                                     // matchs et points restent visibles, comme au classement
      }
    }
  });
  return out_(res);
}

/* ===================== 6. Groupes de discussion ===================== */
// Un groupe a un id numérique : ses messages passent par le canal « #id » de Code.gs (msgSend / msgSync).
function sp8GroupsAll_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:grp");
  if (hit) return jsonSafe_(hit);
  var g = {};
  rowsOf_(sp8ShGroups_()).forEach(function (r) { if (r[0]) g[String(r[0])] = { id: String(r[0]), name: String(r[1]), owner: String(r[2]), ts: Number(r[3]) || 0, members: [] }; });
  rowsOf_(sp8ShGroupMembers_()).forEach(function (r) { var o = g[String(r[0])]; if (o) o.members.push(String(r[1])); });
  try { c.put("sp8:grp", JSON.stringify(g), 300); } catch (x) {}
  return g;
}
function sp8ForgetGroups_(members) {
  var c = CacheService.getScriptCache(); c.remove("sp8:grp");
  (members || []).forEach(function (m) { c.remove("sids:" + sp8Lc_(m)); });
}
function sp8MyGroupIds_(pseudo) {
  var p = sp8Lc_(pseudo), g = sp8GroupsAll_(), o = {};
  Object.keys(g).forEach(function (id) { if (g[id].members.some(function (m) { return sp8Lc_(m) === p; })) o[id] = 1; });
  return o;
}
function sp8IsMember_(grp, pseudo) { var p = sp8Lc_(pseudo); return grp.members.some(function (m) { return sp8Lc_(m) === p; }); }
function sp8GroupOut_(grp, nm, profs) {
  return { id: grp.id, name: grp.name, owner: grp.owner, ts: grp.ts, members: grp.members.map(function (m) { var k = sp8Lc_(m), acc = nm[k]; return { pseudo: m, name: acc ? shownName_(acc, profs[k]) : m }; }) };
}
function sp8GroupList_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var g = sp8GroupsAll_(), nm = nameMap_(), profs = profMap_(), out = [];
  Object.keys(g).forEach(function (id) { if (sp8IsMember_(g[id], me.pseudo)) out.push(sp8GroupOut_(g[id], nm, profs)); });
  out.sort(function (a, b) { return b.ts - a.ts; });
  return { status: "success", groups: out };
}
function sp8GroupFriendsOnly_(me, list) {
  var st = sp8FriendState_(me.pseudo), nm = nameMap_(), out = [], seen = {}, cnt = {}, g = sp8GroupsAll_(), adultMe = !sp8Minor_(me.pseudo);
  Object.keys(g).forEach(function (id) { g[id].members.forEach(function (m) { cnt[sp8Lc_(m)] = (cnt[sp8Lc_(m)] || 0) + 1; }); });
  (Array.isArray(list) ? list : []).forEach(function (x) {
    var k = sp8Lc_(sp8Pseudo_(x));
    if (!k || seen[k] || k === sp8Lc_(me.pseudo) || st[k] !== "ami" || !nm[k] || isBanned_(k) || (cnt[k] || 0) >= SP8_MAX_GROUPS) return;
    if (adultMe && sp8Minor_(k) && !sp8SharedSession_(me.pseudo, k)) return;   // protection des mineurs : pas de groupe adulte → mineur sans séance commune
    seen[k] = 1; out.push(nm[k].pseudo);
  });
  return out;
}
function sp8GroupCreate_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var name = clip_(d.name, 40);
  if (!name) return err_("Donnez un nom au groupe.");
  var bad = badAny_([name]); if (bad) return err_(bad);
  var lim = rate_("gcr:" + me.pseudo, 10, 86400, "Trop de groupes créés aujourd'hui.");
  if (lim) return err_(lim);
  var mineCount = Object.keys(sp8MyGroupIds_(me.pseudo)).length;
  if (mineCount >= SP8_MAX_GROUPS) return err_("Vous êtes déjà dans " + SP8_MAX_GROUPS + " groupes.");
  var members = sp8GroupFriendsOnly_(me, d.members).slice(0, SP8_GROUP_MAX - 1);
  if (!members.length) return err_("Ajoutez au moins un ami au groupe.");
  var now = Date.now(), id = String(now * 1000 + 500 + Math.floor(Math.random() * 500));
  sp8ShGroups_().appendRow([id, safe_(name), me.pseudo, now]);
  var shm = sp8ShGroupMembers_();
  [me.pseudo].concat(members).forEach(function (m) { shm.appendRow([id, m, now]); });
  sp8ForgetGroups_([me.pseudo].concat(members));
  return { status: "success", id: id };
}
function sp8GroupGet_(d, me) {
  var g = sp8GroupsAll_()[String(d.id || "")];
  if (!g || !sp8IsMember_(g, me.pseudo)) return null;
  return g;
}
function sp8GroupAdd_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var g = sp8GroupGet_(d, me);
  if (!g) return err_("Groupe introuvable.");
  var add = sp8GroupFriendsOnly_(me, Array.isArray(d.members) ? d.members : [d.pseudo]).filter(function (m) { return !sp8IsMember_(g, m); });
  if (!add.length) return err_("Choisissez un ami qui n'est pas déjà dans le groupe.");
  if (g.members.length + add.length > SP8_GROUP_MAX) return err_("Un groupe compte " + SP8_GROUP_MAX + " membres au plus.");
  var shm = sp8ShGroupMembers_(), now = Date.now();
  add.forEach(function (m) { shm.appendRow([g.id, m, now]); });
  sp8ForgetGroups_(g.members.concat(add));
  return { status: "success", added: add.length };
}
function sp8DropMember_(g, pseudo) {
  var shm = sp8ShGroupMembers_(), rows = shm.getDataRange().getValues(), p = sp8Lc_(pseudo);
  for (var i = rows.length - 1; i >= 1; i--) if (String(rows[i][0]) === g.id && sp8Lc_(rows[i][1]) === p) shm.deleteRow(i + 1);
  var left = g.members.filter(function (m) { return sp8Lc_(m) !== p; });
  var shg = sp8ShGroups_(), gr = shg.getDataRange().getValues();
  for (var j = gr.length - 1; j >= 1; j--) {
    if (String(gr[j][0]) !== g.id) continue;
    if (!left.length) shg.deleteRow(j + 1);                                       // plus personne : groupe supprimé
    else if (sp8Lc_(gr[j][2]) === p) shg.getRange(j + 1, 3).setValue(left[0]);   // le créateur part : un autre membre reprend
  }
  sp8ForgetGroups_(g.members);
}
function sp8GroupLeave_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var g = sp8GroupGet_(d, me);
  if (!g) return err_("Groupe introuvable.");
  sp8DropMember_(g, me.pseudo);
  return { status: "success" };
}
function sp8GroupRemove_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var g = sp8GroupGet_(d, me);
  if (!g) return err_("Groupe introuvable.");
  if (sp8Lc_(g.owner) !== sp8Lc_(me.pseudo)) return err_("Seul le créateur du groupe peut retirer un membre.");
  var t = sp8Pseudo_(d.pseudo);
  if (!t || !sp8IsMember_(g, t) || sp8Lc_(t) === sp8Lc_(me.pseudo)) return err_("Membre introuvable.");
  sp8DropMember_(g, t);
  return { status: "success" };
}
function sp8GroupRename_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var g = sp8GroupGet_(d, me);
  if (!g) return err_("Groupe introuvable.");
  var name = clip_(d.name, 40);
  if (!name) return err_("Donnez un nom au groupe.");
  var bad = badAny_([name]); if (bad) return err_(bad);
  var shg = sp8ShGroups_(), gr = shg.getDataRange().getValues();
  for (var j = gr.length - 1; j >= 1; j--) if (String(gr[j][0]) === g.id) shg.getRange(j + 1, 2).setValue(safe_(name));
  sp8ForgetGroups_([]);
  return { status: "success" };
}

/* ===================== 7. Images dans les annonces ===================== */
// Une image JPEG par annonce, compressée dans le navigateur (45 Ko max), rangée dans l'onglet AnnoncesImages.
// Pas de Google Drive : aucune autorisation ni domaine externe en plus.
function sp8CleanImg_(a) {
  a = String(a || "");
  return /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(a) && a.length <= SP8_IMG_MAX ? a : "";
}
function sp8ImgIds_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:imgs");
  if (hit) return jsonSafe_(hit);
  var sh = sp8ShImg_(), last = sh.getLastRow(), o = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { if (r[0]) o[String(r[0])] = 1; });
  try { c.put("sp8:imgs", JSON.stringify(o), 300); } catch (x) {}
  return o;
}
function sp8PostImage_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var id = String(Number(d.id) || "");
  if (!id || hidden_()["annonce:" + id]) return err_("Image indisponible.");
  var author = "";
  rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (String(r[0]) === id) author = String(r[1]); });
  if (!author) return err_("Image indisponible.");
  var k = sp8Lc_(author), mine = sp8Lc_(me.pseudo);
  if (k !== mine) {
    if (hides_(blocks_(me.pseudo), author)) return err_("Image indisponible.");
    if (sp8PrivateSet_()[k] && sp8FriendState_(me.pseudo)[k] !== "ami") return err_("Image indisponible.");
  }
  var sh = sp8ShImg_(), last = sh.getLastRow();
  if (last < 2) return err_("Image indisponible.");
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === id) return { status: "success", id: id, img: String(sh.getRange(i + 2, 2).getValue()) };
  return err_("Image indisponible.");
}
function sp8PostDelete_(e, data, baseDoPost) {
  var out = baseDoPost(e), res = sp8Parse_(out);
  var c = CacheService.getScriptCache(); c.remove("sp8:act"); c.remove("sp8:meta");
  if (res && res.status === "success") {
    var id = String(Number(data.id) || "");
    sp8After_(function () {
      var sh = sp8ShImg_(), rows = sh.getDataRange().getValues();
      for (var i = rows.length - 1; i >= 1; i--) if (String(rows[i][0]) === id) sh.deleteRow(i + 1);
      c.remove("sp8:imgs");
    });
  }
  return out;
}
/** Après suppression d'un compte : images d'annonces disparues et groupes vides. */
function sp8CleanOrphans_() {
  var live = {};
  rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (r[0]) live[String(r[0])] = 1; });
  var sh = sp8ShImg_(), rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) if (!live[String(rows[i][0])]) sh.deleteRow(i + 1);
  var used = {};
  rowsOf_(sp8ShGroupMembers_()).forEach(function (r) { used[String(r[0])] = (used[String(r[0])] || []).concat(String(r[1])); });
  var shg = sp8ShGroups_(), gr = shg.getDataRange().getValues();
  for (var j = gr.length - 1; j >= 1; j--) {
    var id = String(gr[j][0]), mem = used[id];
    if (!mem || !mem.length) shg.deleteRow(j + 1);
    else if (mem.map(sp8Lc_).indexOf(sp8Lc_(gr[j][2])) < 0) shg.getRange(j + 1, 3).setValue(mem[0]);
  }
}

/* ===================== 8. Liste d'attente des séances ===================== */
// Séance complète : on s'inscrit en liste d'attente. Quand une place se libère, le premier inscrit est ajouté automatiquement.
function sp8ShWait_() { return sheetH_("ListeAttente", ["séance", "pseudo", "prénom", "date (ms)", "statut", "promu le (ms)"]); }
function sp8WaitRows_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:wait");
  if (hit) return jsonSafe_(hit);
  var list = rowsOf_(sp8ShWait_()).filter(function (r) { return r[0] && r[1]; }).map(function (r) { return [String(r[0]), String(r[1]), Number(r[3]) || 0, String(r[4] || "attente"), Number(r[5]) || 0]; });
  try { c.put("sp8:wait", JSON.stringify(list), 120); } catch (x) {}
  return list;
}
function sp8ForgetWait_() { CacheService.getScriptCache().remove("sp8:wait"); }
function sp8SessRow_(id) { var s = null; rowsOf_(shSeances_()).forEach(function (r) { if (String(r[0]) === id) s = r; }); return s; }
function sp8SessCount_(id) { var n = 0; rowsOf_(shInscr_()).forEach(function (r) { if (String(r[0]) === id) n++; }); return n; }
function sp8IsIn_(id, pseudo) { var p = sp8Lc_(pseudo); return rowsOf_(shInscr_()).some(function (r) { return String(r[0]) === id && sp8Lc_(r[1]) === p; }); }
function sp8WaitJoin_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), s = sp8SessRow_(id), now = Date.now();
  if (!s || s[12] !== "ouverte" || Number(s[7]) < now) return err_("Cette séance n'est plus disponible.");
  if (hides_(blocks_(me.pseudo), s[1])) return err_("Cette séance n'est plus disponible.");
  if (sp8AdultBlock_(id, me.pseudo)) return err_(SP8_MSG_ADULT);
  if (sp8IsIn_(id, me.pseudo)) return { status: "success", already: true };
  if (sp8SessCount_(id) < Number(s[8])) return err_("Il reste une place : rejoignez directement la séance.");
  var lim = rate_("wtj:" + me.pseudo, 30, 3600, "Trop d'actions en peu de temps."); if (lim) return err_(lim);
  var p = sp8Lc_(me.pseudo), rows = sp8WaitRows_(), pos = 0, mine = false;
  rows.forEach(function (r) { if (r[0] === id && r[3] === "attente") { pos++; if (sp8Lc_(r[1]) === p) mine = true; } });
  if (mine) return { status: "success", already: true };
  if (pos >= 20) return err_("La liste d'attente est pleine.");
  sp8ShWait_().appendRow([id, me.pseudo, me.name, now, "attente", ""]);
  sp8ForgetWait_();
  return { status: "success", position: pos + 1 };
}
function sp8WaitDrop_(id, pseudo, onlyWaiting) {
  var sh = sp8ShWait_(), rows = sh.getDataRange().getValues(), p = sp8Lc_(pseudo), n = 0;
  for (var i = rows.length - 1; i >= 1; i--) if (String(rows[i][0]) === id && sp8Lc_(rows[i][1]) === p && (!onlyWaiting || String(rows[i][4] || "attente") === "attente")) { sh.deleteRow(i + 1); n++; }
  n && sp8ForgetWait_();
  return n;
}
function sp8WaitLeave_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  sp8WaitDrop_(String(Number(d.id) || ""), me.pseudo, true);
  return { status: "success" };
}
/** Une place s'est libérée : on inscrit les premiers de la liste d'attente (dans l'ordre d'arrivée). */
function sp8Promote_(id) {
  var s = sp8SessRow_(id), now = Date.now();
  if (!s || s[12] !== "ouverte" || Number(s[7]) < now) return [];
  var free = Number(s[8]) - sp8SessCount_(id), done = [];
  if (free <= 0) return done;
  var sh = sp8ShWait_(), rows = sh.getDataRange().getValues(), cand = [];
  for (var i = 1; i < rows.length; i++) if (String(rows[i][0]) === id && String(rows[i][4] || "attente") === "attente") cand.push({ row: i + 1, pseudo: String(rows[i][1]), name: String(rows[i][2]), ts: Number(rows[i][3]) || 0 });
  cand.sort(function (a, b) { return a.ts - b.ts; });
  cand.forEach(function (c) {
    if (free <= 0) return;
    if (!findAccount_(c.pseudo) || isBanned_(sp8Lc_(c.pseudo)) || hides_(blocks_(c.pseudo), s[1]) || sp8AdultBlock_(id, c.pseudo)) { sh.getRange(c.row, 5).setValue("écarté"); return; }
    if (!sp8IsIn_(id, c.pseudo)) { shInscr_().appendRow([Number(id), c.pseudo, c.name, now]); free--; }
    sh.getRange(c.row, 5, 1, 2).setValues([["promu", now]]);
    forgetSeanceIds_(c.pseudo);
    done.push(c.pseudo);
    try { sp8MailPromoted_(c.pseudo, s); } catch (x) {}
    try { sp14OnPromote_(c.pseudo, s); } catch (x) {}
  });
  sp8ForgetWait_();
  return done;
}
function sp8MailPromoted_(pseudo, s) {
  if (typeof mailOn_ !== "function" || !mailOn_()) return;
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), email = "", p = sp8Lc_(pseudo);
  for (var i = 1; i < rows.length; i++) if (sp8Lc_(rows[i][6]) === p) email = String(rows[i][3]);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  var when = Utilities.formatDate(new Date(Number(s[7])), SP8.TZ, "dd/MM 'à' HH'h'mm"), url = mailProp_("SITE_URL", "https://spary.fr") + "/#seance=" + s[0];
  var intro = "Une place s'est libérée : tu es maintenant inscrit·e à la séance de " + s[3] + " (" + s[4] + ") le " + when + ". Si tu ne peux plus venir, désinscris-toi pour laisser la place au suivant.";
  mail_(email, "Une place s'est libérée pour toi sur Spary", mailLayout_("Tu es inscrit·e !", intro, "Voir la séance", url, "Tu reçois cet e-mail car tu étais en liste d'attente pour cette séance."), intro + "\n" + url);
}

/* ===================== 9. Indice de fiabilité ===================== */
// Part des séances où le membre était présent, d'après les avis (une séance compte comme absence si la majorité des avis le disent absent).
function sp8Reliab_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:rel");
  if (hit) return jsonSafe_(hit);
  var per = {}, okd = sp8AbsenceAccepted_();
  rowsOf_(sp8ShAvis_()).forEach(function (r) {
    var k = sp8Lc_(r[3]) + "|" + String(r[1]), o = per[k] = per[k] || { abs: 0, pres: 0 };
    if (okd[k] && r[6] === "oui") return;
    r[6] === "oui" ? o.abs++ : o.pres++;
  });
  var m = {};
  Object.keys(per).forEach(function (k) {
    var who = k.split("|")[0], o = m[who] = m[who] || { n: 0, abs: 0 };
    o.n++; if (per[k].abs > per[k].pres) o.abs++;
  });
  try { c.put("sp8:rel", JSON.stringify(m), 300); } catch (x) {}
  return m;
}

/* ===================== 10. Récap du mois ===================== */
function sp8Recap_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var now = new Date(), cur = Utilities.formatDate(now, SP8.TZ, "yyyy-MM"), month = /^\d{4}-\d{2}$/.test(String(d.month || "")) ? String(d.month) : cur;
  if (month > cur) month = cur;
  var p = sp8Lc_(me.pseudo), inMonth = function (ms) { return ms && Utilities.formatDate(new Date(Number(ms)), SP8.TZ, "yyyy-MM") === month; };
  var act = {}, live = {}, hid = hidden_(), meta = sp8PostMeta_();
  rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (r[0]) live[String(r[0])] = 1; });
  var out = { status: "success", month: month, points: 0, posted: 0, played: 0, minutes: 0, partners: 0, sports: [] }, sports = {}, partners = {}, places = {};
  rowsOf_(sp8ShPoints_()).forEach(function (r) {
    if (sp8Lc_(r[1]) !== p || !inMonth(r[0])) return;
    var id = String(r[3]); if (!live[id] || hid["annonce:" + id]) return;
    out.points += Number(r[4]) || 0;
  });
  Object.keys(meta).forEach(function (id) { act[id] = meta[id]; });
  rowsAll_(sheet_("Annonces", true)).forEach(function (r) {
    var id = String(r[0]); if (!id || sp8Lc_(r[1]) !== p || !act[id] || hid["annonce:" + id]) return;
    var ts = r[6] ? new Date(r[6]).getTime() : Number(id); if (!inMonth(ts)) return;
    out.posted++; out.minutes += act[id].d || 0; sports[act[id].s] = (sports[act[id].s] || 0) + 1;
  });
  var sess = {}; rowsOf_(shSeances_()).forEach(function (r) { sess[String(r[0])] = r; });
  var mineS = {}; rowsOf_(shInscr_()).forEach(function (r) { if (sp8Lc_(r[1]) === p) mineS[String(r[0])] = 1; });
  rowsOf_(shInscr_()).forEach(function (r) { var id = String(r[0]), s = sess[id]; if (mineS[id] && s && s[12] === "ouverte" && Number(s[7]) < now.getTime() && inMonth(s[7]) && sp8Lc_(r[1]) !== p) partners[sp8Lc_(r[1])] = 1; });
  Object.keys(mineS).forEach(function (id) {
    var s = sess[id]; if (!s || s[12] !== "ouverte" || Number(s[7]) >= now.getTime() || !inMonth(s[7])) return;
    out.played++; out.minutes += Number(s[15]) || 60; sports[String(s[3])] = (sports[String(s[3])] || 0) + 1;
    var pl = clip_(s[4], 60); if (pl) places[pl] = (places[pl] || 0) + 1;
  });
  out.placesN = Object.keys(places).length;
  out.places = Object.keys(places).sort(function (a, b) { return places[b] - places[a]; }).slice(0, 3);
  out.partners = Object.keys(partners).length;
  out.sports = Object.keys(sports).sort(function (a, b) { return sports[b] - sports[a]; }).slice(0, 3);
  return out;
}

/* ===================== 11. Modération : information de l'auteur, recours, suivi des signalements (DSA) ===================== */
function sp8ShAppeal_() { return sheetH_("Recours", ["date (ms)", "pseudo", "type", "cible", "texte", "statut"]); }
var SP8_TYPE_LABEL = { annonce: "annonce", commentaire: "commentaire", session: "séance", message: "message", membre: "profil" };
function sp8ModNotices_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var p = sp8Lc_(me.pseudo), hid = hidden_(), by = {};
  rowsOf_(shReports_()).forEach(function (r) {
    if (!r[0] || sp8Lc_(r[5]) !== p) return;
    var k = String(r[3]) + ":" + String(r[4]); if (!hid[k]) return;
    var o = by[k] = by[k] || { type: String(r[3]), target: String(r[4]), extract: "", reasons: {}, removed: false, ts: 0 };
    o.reasons[String(r[6])] = (o.reasons[String(r[6])] || 0) + 1;
    o.ts = Math.max(o.ts, Number(r[1]) || 0);
    if (r[8]) o.extract = String(r[8]);
    if (norm_(r[9]) === "retire") o.removed = true;
  });
  var appeals = {};
  rowsOf_(sp8ShAppeal_()).forEach(function (r) { if (sp8Lc_(r[1]) === p) appeals[String(r[2]) + ":" + String(r[3])] = String(r[5] || "nouveau"); });
  var list = Object.keys(by).map(function (k) {
    var o = by[k], reason = Object.keys(o.reasons).sort(function (a, b) { return o.reasons[b] - o.reasons[a]; })[0] || "";
    return { key: k, type: o.type, label: SP8_TYPE_LABEL[o.type] || o.type, extract: clip_(o.extract, 140), reason: reason, decision: o.removed ? "humaine" : "automatique", removed: o.removed, ts: o.ts, appeal: appeals[k] || "" };
  }).sort(function (a, b) { return b.ts - a.ts; });
  return { status: "success", notices: list.slice(0, 30), contact: CONTACT_MAIL };
}
function sp8ModAppeal_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var key = String(d.key || ""), text = clip_(d.text, 1000);
  var n = sp8ModNotices_(d).notices || [], it = n.filter(function (x) { return x.key === key; })[0];
  if (!it) return err_("Décision introuvable.");
  if (it.appeal) return { status: "success", already: true };
  if (text.length < 10) return err_("Expliquez en quelques mots pourquoi vous contestez (10 caractères minimum).");
  var lim = rate_("apl:" + me.pseudo, 5, 86400, "Trop de recours aujourd'hui. Réessayez demain."); if (lim) return err_(lim);
  sp8ShAppeal_().appendRow([Date.now(), me.pseudo, it.type, String(key.split(":").slice(1).join(":")), safe_(text), "nouveau"]);
  try {
    if (typeof mailOn_ === "function" && mailOn_()) mail_(CONTACT_MAIL, "Recours modération : " + it.label + " de @" + me.pseudo,
      "<p>@" + mailEsc_(me.pseudo) + " conteste le masquage de son " + mailEsc_(it.label) + " (" + mailEsc_(key) + ").</p><p>Motif du masquage : " + mailEsc_(it.reason) + "</p><p>Contenu : " + mailEsc_(it.extract) + "</p><p>Recours : " + mailEsc_(text) + "</p><p>À traiter dans l'onglet Recours (colonne statut) et Signalements.</p>",
      "@" + me.pseudo + " conteste le masquage de " + key + " : " + text);
  } catch (x) {}
  return { status: "success" };
}
/** Suivi de mes signalements : reçu, puis décision. */
function sp8ReportStatus_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var p = sp8Lc_(me.pseudo), hid = hidden_(), since = Date.now() - 90 * 86400000, out = [];
  rowsOf_(shReports_()).forEach(function (r) {
    if (!r[0] || sp8Lc_(r[2]) !== p || (Number(r[1]) || 0) < since) return;
    var st = norm_(r[9]), k = String(r[3]) + ":" + String(r[4]);
    out.push({ type: SP8_TYPE_LABEL[String(r[3])] || String(r[3]), reason: String(r[6]), ts: Number(r[1]) || 0,
      state: st === "retire" ? "retiré" : st === "rejete" ? "conservé" : hid[k] ? "masqué en attente d'examen" : "reçu, en cours d'examen" });
  });
  out.sort(function (a, b) { return b.ts - a.ts; });
  return { status: "success", reports: out.slice(0, 30) };
}

/* Séances : liste d'attente branchée sur la liste, l'inscription et la désinscription de Code.gs */
function sp8SessionList_(e, data, baseDoPost) {
  var res = sp8Parse_(baseDoPost(e));
  if (!res || res.status !== "success" || !Array.isArray(res.sessions)) return out_(res || err_("Erreur serveur."));
  var me = sessionUser_(data.token), p = me ? sp8Lc_(me.pseudo) : "", by = {}, now = Date.now();
  sp8WaitRows_().forEach(function (r) { (by[r[0]] = by[r[0]] || []).push(r); });
  var opts = sp8Opts_();
  res.minor = me ? sp8Minor_(me.pseudo) : false;
  res.sessions.forEach(function (s) {
    var o = opts[String(s.id)] || {};
    if (o.adult) s.adult = true;
    if (o.alert && sp8Lc_(s.org) === p) { s.alerted = o.alert; s.alertN = o.alertN || 0; }
    var w = by[String(s.id)] || [], pos = 0;
    s.wait = 0;
    w.forEach(function (r) {
      if (r[3] === "attente") { s.wait++; if (sp8Lc_(r[1]) === p) pos = s.wait; }
      else if (r[3] === "promu" && sp8Lc_(r[1]) === p && now - r[4] < 72 * 3600000 && s.joined) s.promoted = r[4];
    });
    if (pos) s.waitPos = pos;
  });
  return out_(res);
}
function sp8SessionJoin_(e, data, baseDoPost) {
  var id0 = String(Number(data.id) || ""), me0 = sessionUser_(data.token);
  if (id0 && me0 && sp8AdultBlock_(id0, me0.pseudo)) return out_(err_(SP8_MSG_ADULT));
  if (id0 && me0) {
    var block = sp8Locked_(function () {
      sp8Promote_(id0);                                   // places libérées sans désinscription : la liste d'attente passe d'abord
      var p = sp8Lc_(me0.pseudo), waiting = rowsOf_(sp8ShWait_()).filter(function (r) { return String(r[0]) === id0 && String(r[4] || "attente") === "attente"; });
      return waiting.length && !waiting.some(function (r) { return sp8Lc_(r[1]) === p; }) && !sp8IsIn_(id0, me0.pseudo);
    });
    if (block) return out_(err_("Désolé, cette séance est complète : inscrivez-vous sur la liste d'attente."));
  }
  var out = baseDoPost(e), res = sp8Parse_(out);
  if (res && res.status === "success") {
    var me = sessionUser_(data.token);
    me && sp8After_(function () { sp8WaitDrop_(String(Number(data.id) || ""), me.pseudo, true); if (!res.already) sp14OnJoin_(data); });
  }
  return out;
}
function sp8SessionLeave_(e, data, baseDoPost) {
  var out = baseDoPost(e), res = sp8Parse_(out);
  if (res && res.status === "success") {
    var id = String(Number(data.id) || "");
    sp8After_(function () { sp8Promote_(id); });
  }
  return out;
}

/* ===================== 12. Mineurs : séances 18+ et messages privés ===================== */
// Âge calculé à partir de la date de naissance du compte (colonne F de Comptes). Jamais affiché ni transmis aux autres membres.
function sp8ShOpt_() { return sheetH_("SeancesOptions", ["séance", "option", "valeur", "date (ms)"]); }
function sp8Opts_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:opt");
  if (hit) return jsonSafe_(hit);
  var o = {};
  rowsOf_(sp8ShOpt_()).forEach(function (r) {
    var id = String(r[0]); if (!id) return;
    var x = o[id] = o[id] || {};
    if (r[1] === "adultes" && r[2] === "oui") x.adult = 1;
    if (r[1] === "alerte") { x.alert = Number(r[3]) || 1; x.alertN = Number(r[2]) || 0; }
  });
  try { c.put("sp8:opt", JSON.stringify(o), 120); } catch (x) {}
  return o;
}
function sp8ForgetOpts_() { CacheService.getScriptCache().remove("sp8:opt"); }
function sp8AgesFresh_() {
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), m = {};
  for (var i = 1; i < rows.length; i++) if (rows[i][6]) m[sp8Lc_(rows[i][6])] = age_(rows[i][5]);
  try { CacheService.getScriptCache().put("sp8:age", JSON.stringify(m), 600); } catch (x) {}
  return m;
}
function sp8Age_(pseudo) {
  var k = sp8Lc_(pseudo), hit = CacheService.getScriptCache().get("sp8:age"), m = hit ? jsonSafe_(hit) : null;
  if (!m || !(k in m)) m = sp8AgesFresh_();   // compte récent : relecture
  return Number(m[k]) || 0;
}
function sp8Minor_(pseudo) { return sp8Age_(pseudo) < 18; }   // date illisible : traité comme mineur (prudence)
function sp8SharedSession_(a, b) {
  var p = sp8Lc_(a), q = sp8Lc_(b), mine = {}, shared = false;
  rowsOf_(shInscr_()).forEach(function (r) { if (sp8Lc_(r[1]) === p) mine[String(r[0])] = 1; });
  rowsOf_(shInscr_()).forEach(function (r) { if (!shared && sp8Lc_(r[1]) === q && mine[String(r[0])]) shared = true; });
  return shared;
}
var SP8_MSG_MINOR = "Pour protéger les mineurs, un adulte ne peut écrire en privé à un membre de moins de 18 ans que s'ils participent à une même séance.";
function sp8MsgGuard_(d) {
  var to = String(d.to || "");
  if (!to || to.charAt(0) === "#") return "";
  var me = sessionUser_(d.token);
  if (!me || sp8Minor_(me.pseudo) || !findAccount_(to) || !sp8Minor_(to)) return "";
  return sp8SharedSession_(me.pseudo, to) ? "" : SP8_MSG_MINOR;
}
function sp8SessionCreate_(e, data, baseDoPost) {
  if (data.adult !== true) return baseDoPost(e);
  var me = sessionUser_(data.token);
  if (me && sp8Minor_(me.pseudo)) return out_(err_("Seuls les organisateurs majeurs peuvent proposer une séance 18+."));
  var out = baseDoPost(e), res = sp8Parse_(out);
  if (res && res.status === "success" && res.id) sp8After_(function () { sp8ShOpt_().appendRow([String(res.id), "adultes", "oui", Date.now()]); sp8ForgetOpts_(); });
  return out;
}
function sp8AdultBlock_(id, pseudo) { return !!(sp8Opts_()[String(id)] || {}).adult && sp8Minor_(pseudo); }
var SP8_MSG_ADULT = "Cette séance est réservée aux membres de 18 ans et plus.";

/* ===================== 13. Place libre dernière minute ===================== */
// Opt-in : le membre choisit une zone (position arrondie à ~1 km) et un rayon. L'organisateur d'une séance qui commence
// dans les 48 h et qui a des places libres peut prévenir, une fois, les membres du même sport et d'un niveau proche.
function sp8ShLmPrefs_() { return sheetH_("AlertesPrefs", ["pseudo", "actif", "lat", "lng", "rayon (km)", "mis à jour (ms)"]); }
function sp8ShLmSent_()  { return sheetH_("AlertesEnvoyees", ["date (ms)", "séance", "destinataire"]); }
var SP8_LM_KM = [3, 5, 10, 20], SP8_LM_MAX = 40, SP8_LM_HOURS = 48;
function sp8Km_(a, b, c, d) {
  var R = 6371, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
  var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) * Math.sin(y / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function sp8SameSport_(a, b) {
  var x = norm_(a).replace(/[^a-z0-9]+/g, " ").trim(), y = norm_(b).replace(/[^a-z0-9]+/g, " ").trim();
  if (!x || !y) return false;
  if (x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0) return true;
  return x.split(" ")[0].length >= 4 && x.split(" ")[0] === y.split(" ")[0];
}
function sp8LmPrefsGet_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var p = sp8Lc_(me.pseudo), o = { status: "success", on: false, km: 5, lat: null, lng: null };
  rowsOf_(sp8ShLmPrefs_()).forEach(function (r) { if (sp8Lc_(r[0]) === p) { o.on = r[1] === "oui"; o.lat = Number(r[2]) || null; o.lng = Number(r[3]) || null; o.km = Number(r[4]) || 5; } });
  var pr = profMap_()[p];
  o.sports = (pr && pr.data && Array.isArray(pr.data.sports) ? pr.data.sports : []).map(function (s) { return s.name; });
  var acc = accountByKey_(me.pseudo);
  o.mail = mailOn_() && !!(acc && acc.verified);
  return o;
}
function sp8LmPrefsSave_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var on = d.on === true, lat = Number(d.lat), lng = Number(d.lng), km = SP8_LM_KM.indexOf(Number(d.km)) >= 0 ? Number(d.km) : 5;
  var okPos = isFinite(lat) && isFinite(lng) && lat > 41 && lat < 51.6 && lng > -5.6 && lng < 9.9;
  if (on && !okPos) return err_("Choisis ta zone (ville ou position) pour activer les alertes.");
  lat = okPos ? Math.round(lat * 100) / 100 : ""; lng = okPos ? Math.round(lng * 100) / 100 : "";
  var sh = sp8ShLmPrefs_(), rows = sh.getDataRange().getValues(), p = sp8Lc_(me.pseudo), row = [me.pseudo, on ? "oui" : "non", lat, lng, km, Date.now()];
  for (var i = rows.length - 1; i >= 1; i--) if (sp8Lc_(rows[i][0]) === p) { sh.getRange(i + 1, 1, 1, 6).setValues([row]); return { status: "success", on: on }; }
  sh.appendRow(row);
  return { status: "success", on: on };
}
function sp8LmAlert_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), s = sp8SessRow_(id), now = Date.now();
  if (!s || s[12] !== "ouverte") return err_("Séance introuvable.");
  if (sp8Lc_(s[1]) !== sp8Lc_(me.pseudo)) return err_("Seul l'organisateur peut lancer l'alerte.");
  var start = Number(s[7]);
  if (start <= now || start > now + SP8_LM_HOURS * 3600000) return err_("L'alerte est possible pour une séance qui commence dans les 48 h.");
  var free = Number(s[8]) - sp8SessCount_(id);
  if (free <= 0) return err_("Ta séance est déjà complète.");
  var opt = sp8Opts_()[id] || {};
  if (opt.alert) return err_("L'alerte a déjà été envoyée pour cette séance.");
  var lim = rate_("lma:" + sp8Lc_(me.pseudo), 3, 86400, "Tu as déjà lancé 3 alertes aujourd'hui."); if (lim) return err_(lim);
  var lat = Number(s[5]), lng = Number(s[6]), lvl = SEANCE_LEVELS.indexOf(String(s[10])), adult = !!opt.adult;
  var inS = {}; rowsOf_(shInscr_()).forEach(function (r) { if (String(r[0]) === id) inS[sp8Lc_(r[1])] = 1; });
  var bl = blocks_(s[1]), nm = nameMap_(), profs = profMap_(), cand = [];
  rowsOf_(sp8ShLmPrefs_()).forEach(function (r) {
    var k = sp8Lc_(r[0]);
    if (r[1] !== "oui" || !nm[k] || inS[k] || hides_(bl, k)) return;
    var km = sp8Km_(lat, lng, Number(r[2]), Number(r[3]));
    if (!(km <= (Number(r[4]) || 5))) return;
    var sports = (profs[k] && profs[k].data && Array.isArray(profs[k].data.sports)) ? profs[k].data.sports : [];
    var sp = sports.filter(function (x) { return sp8SameSport_(x.name, s[3]); })[0];
    if (!sp) return;
    if (lvl > 0 && sp.level) { var ml = LEVELS.indexOf(sp.level) + 1; if (ml > 0 && Math.abs(ml - lvl) > 1) return; }
    if (adult && sp8Minor_(k)) return;
    cand.push({ pseudo: nm[k].pseudo, km: km });
  });
  cand.sort(function (a, b) { return a.km - b.km; });
  cand = cand.slice(0, SP8_LM_MAX);
  var sh = sp8ShLmSent_();
  cand.forEach(function (c) { sh.appendRow([now, id, c.pseudo]); });
  if (cand.length) { sp8ShOpt_().appendRow([id, "alerte", cand.length, now]); sp8ForgetOpts_(); try { sp14OnAlert_(s, free, cand); } catch (x) {} }   // personne à prévenir : l'alerte reste disponible
  return { status: "success", sent: cand.length, _mail: { s: s, free: free, to: cand } };
}
/** E-mails envoyés après la libération du verrou. Seulement aux adresses confirmées. */
function sp8LmMail_(m) {
  if (!m || !m.to || !m.to.length || typeof mailOn_ !== "function" || !mailOn_()) return;
  var want = {}; m.to.forEach(function (c) { want[sp8Lc_(c.pseudo)] = c; });
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), s = m.s;
  var when = Utilities.formatDate(new Date(Number(s[7])), SP8.TZ, "EEEE dd/MM 'à' HH'h'mm"), url = mailProp_("SITE_URL", "https://spary.fr").replace(/\/+$/, "") + "/#seance=" + s[0];
  var nb = m.free + " joueur" + (m.free > 1 ? "s" : "");
  for (var i = 1; i < rows.length; i++) {
    var c = want[sp8Lc_(rows[i][6])], email = String(rows[i][3]);
    if (!c || !rows[i][12] || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    var intro = "Il manque " + nb + " pour une séance de " + s[3] + " (" + s[4] + ", à " + Math.max(1, Math.round(c.km)) + " km de ta zone) " + when + ". Premier inscrit, premier servi !";
    try { mail_(email, "Il manque " + nb + " : " + s[3] + " " + when, mailLayout_("Une place t'attend", intro, "Voir la séance", url, "Tu reçois cet e-mail car tu as activé les alertes dernière minute. Tu peux les couper dans Profil → Compte et données."), intro + "\n" + url); } catch (x) {}
  }
}
function sp8LmInbox_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var p = sp8Lc_(me.pseudo), now = Date.now(), ids = {}, out = [];
  rowsOf_(sp8ShLmSent_()).forEach(function (r) { if (sp8Lc_(r[2]) === p && Number(r[0]) > now - SP8_LM_HOURS * 3600000) ids[String(r[1])] = Number(r[0]); });
  var keys = Object.keys(ids);
  if (!keys.length) return { status: "success", alerts: [] };
  var bl = blocks_(me.pseudo), cnt = {}, mine = {};
  rowsOf_(shInscr_()).forEach(function (r) { var id = String(r[0]); if (ids[id]) { cnt[id] = (cnt[id] || 0) + 1; if (sp8Lc_(r[1]) === p) mine[id] = 1; } });
  rowsOf_(shSeances_()).forEach(function (s) {
    var id = String(s[0]);
    if (!ids[id] || s[12] !== "ouverte" || Number(s[7]) <= now || mine[id] || hides_(bl, s[1])) return;
    var left = Number(s[8]) - (cnt[id] || 0); if (left <= 0) return;
    out.push({ id: Number(s[0]), sport: String(s[3]), place: String(s[4]), start: Number(s[7]), left: left, org: String(s[1]), orgName: String(s[2]), ts: ids[id] });
  });
  out.sort(function (a, b) { return a.start - b.start; });
  return { status: "success", alerts: out.slice(0, 10) };
}

/* ===================== 14. Kudos entre partenaires ===================== */
// Un tap pour féliciter un partenaire d'une séance jouée ensemble ces 30 derniers jours : un kudos par séance et par partenaire.
function sp8ShKudos_() { return sheetH_("Kudos", ["date (ms)", "séance", "de", "à"]); }
function sp8KudoCounts_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:kudo");
  if (hit) return jsonSafe_(hit);
  var m = {}; rowsOf_(sp8ShKudos_()).forEach(function (r) { var k = sp8Lc_(r[3]); if (k) m[k] = (m[k] || 0) + 1; });
  try { c.put("sp8:kudo", JSON.stringify(m), 300); } catch (x) {}
  return m;
}
/** Séances terminées des 30 derniers jours jouées par a et b, sans kudos de a vers b, plus récente d'abord. */
function sp8KudoEligible_(a, b) {
  var p = sp8Lc_(a), q = sp8Lc_(b), now = Date.now(), since = now - 30 * 864e5, mine = {}, both = [], done = {};
  rowsOf_(shInscr_()).forEach(function (r) { if (sp8Lc_(r[1]) === p) mine[String(r[0])] = 1; });
  var withB = {}; rowsOf_(shInscr_()).forEach(function (r) { if (sp8Lc_(r[1]) === q && mine[String(r[0])]) withB[String(r[0])] = 1; });
  rowsOf_(sp8ShKudos_()).forEach(function (r) { if (sp8Lc_(r[2]) === p && sp8Lc_(r[3]) === q) done[String(r[1])] = 1; });
  rowsOf_(shSeances_()).forEach(function (s) {
    var id = String(s[0]), st = Number(s[7]), end = st + (Number(s[15]) || 90) * 60000;
    if (withB[id] && !done[id] && s[12] === "ouverte" && end <= now && st >= since) both.push({ id: id, start: st });
  });
  both.sort(function (x, y) { return y.start - x.start; });
  return both;
}
function sp8KudoGive_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var to = findAccount_(sp8Pseudo_(d.pseudo));
  if (!to || sp8Lc_(to.pseudo) === sp8Lc_(me.pseudo)) return err_("Membre introuvable.");
  if (hides_(blocks_(me.pseudo), to.pseudo)) return err_("Impossible pour ce membre.");
  var lim = rate_("kdo:" + sp8Lc_(me.pseudo), 60, 3600, "Beaucoup de kudos en peu de temps, réessaie plus tard."); if (lim) return err_(lim);
  var el = sp8KudoEligible_(me.pseudo, to.pseudo);
  if (!el.length) return err_("Les kudos se donnent aux partenaires de tes séances des 30 derniers jours, un par séance.");
  sp8ShKudos_().appendRow([Date.now(), el[0].id, me.pseudo, to.pseudo]);
  CacheService.getScriptCache().remove("sp8:kudo");
  return { status: "success", kudos: (sp8KudoCounts_()[sp8Lc_(to.pseudo)] || 0), more: el.length > 1 };
}

/* ===================== 15. Niveau confirmé par les partenaires ===================== */
// Vote facultatif dans l'avis après séance (1 débutant, 2 intermédiaire, 3 confirmé). Anonyme ; affiché à partir de 3 votes par sport.
function sp8ShLvl_() { return sheetH_("NiveauxVotes", ["date (ms)", "séance", "auteur", "membre", "sport", "niveau (1-3)"]); }
var SP8_LVL = ["", "Débutant", "Intermédiaire", "Confirmé"];
function sp8LevelsOf_(pseudo) {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:lvl"), m = hit ? jsonSafe_(hit) : null;
  if (!m) {
    m = {};
    rowsOf_(sp8ShLvl_()).forEach(function (r) {
      var k = sp8Lc_(r[3]), sp = String(r[4]), v = Number(r[5]); if (!k || !sp || !(v >= 1 && v <= 3)) return;
      var o = (m[k] = m[k] || {}), x = (o[sp] = o[sp] || [0, 0]); x[0] += v; x[1]++;
    });
    try { c.put("sp8:lvl", JSON.stringify(m), 300); } catch (x) {}
  }
  var o = m[sp8Lc_(pseudo)] || {}, out = [];
  Object.keys(o).forEach(function (sp) { if (o[sp][1] >= SP8.REVIEW_MIN_PUBLIC) out.push({ sport: sp, label: SP8_LVL[Math.round(o[sp][0] / o[sp][1])], n: o[sp][1] }); });
  return out.sort(function (a, b) { return b.n - a.n; }).slice(0, 4);
}

/* ===================== 16. Absences contestables ===================== */
// Une absence notée peut être contestée ; si l'équipe passe le recours à « accepté » (onglet Recours, colonne statut), elle ne compte plus.
var SP8_RELIAB_MIN = 5;
function sp8AbsenceAccepted_() {
  var o = {};
  rowsOf_(sp8ShAppeal_()).forEach(function (r) { if (r[2] === "absence" && /^(accepte|acceptee|valide|validee|ok)$/.test(norm_(r[5]).trim())) o[sp8Lc_(r[1]) + "|" + String(r[3])] = 1; });
  return o;
}
function sp8MyAbsences_(pseudo) {
  var p = sp8Lc_(pseudo), per = {};
  rowsOf_(sp8ShAvis_()).forEach(function (r) {
    if (sp8Lc_(r[3]) !== p) return;
    var o = per[String(r[1])] = per[String(r[1])] || { abs: 0, pres: 0 }; r[6] === "oui" ? o.abs++ : o.pres++;
  });
  return Object.keys(per).filter(function (sid) { return per[sid].abs > per[sid].pres; });
}
function sp8AbsenceList_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var ids = sp8MyAbsences_(me.pseudo), p = sp8Lc_(me.pseudo), st = {}, sess = {}, out = [];
  rowsOf_(sp8ShAppeal_()).forEach(function (r) { if (r[2] === "absence" && sp8Lc_(r[1]) === p) st[String(r[3])] = String(r[5] || "nouveau"); });
  rowsOf_(shSeances_()).forEach(function (s) { sess[String(s[0])] = s; });
  ids.forEach(function (sid) { var s = sess[sid]; out.push({ sid: sid, sport: s ? String(s[3]) : "", place: s ? String(s[4]) : "", start: s ? Number(s[7]) : 0, appeal: st[sid] || "" }); });
  out.sort(function (a, b) { return b.start - a.start; });
  var rel = sp8Reliab_()[p];
  return { status: "success", absences: out.slice(0, 20), reliab: rel && rel.n ? Math.round(100 * (rel.n - rel.abs) / rel.n) : null, reliabN: rel ? rel.n : 0, min: SP8_RELIAB_MIN };
}
function sp8AbsenceContest_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var sid = String(Number(d.sid) || ""), text = clip_(d.text, 1000);
  if (!sid || sp8MyAbsences_(me.pseudo).indexOf(sid) < 0) return err_("Absence introuvable.");
  var p = sp8Lc_(me.pseudo);
  if (rowsOf_(sp8ShAppeal_()).some(function (r) { return r[2] === "absence" && sp8Lc_(r[1]) === p && String(r[3]) === sid; })) return { status: "success", already: true };
  if (text.length < 10) return err_("Explique en quelques mots (10 caractères minimum).");
  var lim = rate_("apl:" + me.pseudo, 5, 86400, "Trop de recours aujourd'hui. Réessaie demain."); if (lim) return err_(lim);
  sp8ShAppeal_().appendRow([Date.now(), me.pseudo, "absence", sid, safe_(text), "nouveau"]);
  try {
    if (typeof mailOn_ === "function" && mailOn_()) mail_(CONTACT_MAIL, "Absence contestée par @" + me.pseudo,
      "<p>@" + mailEsc_(me.pseudo) + " conteste une absence notée sur la séance " + mailEsc_(sid) + ".</p><p>Message : " + mailEsc_(text) + "</p><p>Pour l'accepter : onglet Recours, colonne statut → « accepté ». L'absence ne comptera plus dans sa fiabilité.</p>",
      "@" + me.pseudo + " conteste une absence (séance " + sid + ") : " + text);
  } catch (x) {}
  return { status: "success" };
}

/* ===================== 17. Défi collectif du mois ===================== */
// Objectif commun : séances postées + séances jouées (au moins 2 inscrits) du mois. Onglet Défis facultatif : mois (aaaa-mm) | titre | objectif.
function sp8ShDefis_() { return sheetH_("Défis", ["mois (aaaa-mm)", "titre", "objectif"]); }
function sp8Challenge_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var now = new Date(), month = Utilities.formatDate(now, SP8.TZ, "yyyy-MM"), p = sp8Lc_(me.pseudo);
  var mois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"][Number(month.slice(5, 7)) - 1];
  var goal = 500, title = "";
  rowsOf_(sp8ShDefis_()).forEach(function (r) {
    var m = r[0] instanceof Date ? Utilities.formatDate(r[0], SP8.TZ, "yyyy-MM") : String(r[0]).trim();
    if (m === month) { title = clip_(r[1], 80); goal = Math.max(10, Math.round(Number(r[2]) || 500)); }
  });
  title = title || goal + " séances en " + mois;
  var inMonth = function (ms) { return ms && Utilities.formatDate(new Date(Number(ms)), SP8.TZ, "yyyy-MM") === month; };
  var c = CacheService.getScriptCache(), hit = c.get("sp8:defi:" + month), agg = hit ? jsonSafe_(hit) : null;
  if (!agg || !agg.by) {
    var live = {}, hid = hidden_(), by = {}, total = 0;
    rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (r[0]) live[String(r[0])] = 1; });
    rowsOf_(sp8ShPoints_()).forEach(function (r) {
      var id = String(r[3]); if (r[2] !== "seance" || !inMonth(r[0]) || !live[id] || hid["annonce:" + id]) return;
      total++; by[sp8Lc_(r[1])] = (by[sp8Lc_(r[1])] || 0) + 1;
    });
    var played = {}, cnt = {}, ins = rowsOf_(shInscr_());
    ins.forEach(function (r) { cnt[String(r[0])] = (cnt[String(r[0])] || 0) + 1; });
    rowsOf_(shSeances_()).forEach(function (s) { var id = String(s[0]); if (s[12] === "ouverte" && Number(s[7]) < now.getTime() && inMonth(s[7]) && (cnt[id] || 0) >= 2) { played[id] = 1; total++; } });
    ins.forEach(function (r) { if (played[String(r[0])]) by[sp8Lc_(r[1])] = (by[sp8Lc_(r[1])] || 0) + 1; });
    agg = { total: total, by: by };
    try { c.put("sp8:defi:" + month, JSON.stringify(agg), 300); } catch (x) {}
  }
  var last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { status: "success", month: month, title: title, goal: goal, total: agg.total || 0, mine: (agg.by || {})[p] || 0, daysLeft: Math.max(0, last - now.getDate()) };
}

/* ===================== 18. Météo des séances en extérieur (Open-Meteo) ===================== */
// Appel serveur (UrlFetchApp) : aucun domaine à ajouter dans la CSP du site. Seules des coordonnées de lieux arrondies sont envoyées.
var SP8_INDOOR = /natation|piscine|fitness|crossfit|muscu|yoga|pilates|escalade|bloc|badminton|squash|tennis de table|ping|boxe|danse|volley(?!.*beach)|handball|judo|karate|gym/;
function sp8Outdoor_(sport) { var s = norm_(sport); return !!s && !SP8_INDOOR.test(s) || /beach/.test(s); }
function sp8WxCode_(c) { c = Number(c); return c === 0 ? "☀️" : c <= 2 ? "🌤️" : c === 3 ? "☁️" : c <= 48 ? "🌫️" : c <= 67 || (c >= 80 && c <= 82) ? "🌧️" : c <= 77 || c === 85 || c === 86 ? "🌨️" : c >= 95 ? "⛈️" : "🌦️"; }
function sp8Weather_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var want = {}; (Array.isArray(d.ids) ? d.ids : []).slice(0, 30).forEach(function (x) { var k = String(Number(x) || ""); if (k) want[k] = 1; });
  var now = Date.now(), list = [], c = CacheService.getScriptCache(), byKey = {}, out = {};
  rowsOf_(shSeances_()).forEach(function (s) {
    var id = String(s[0]), st = Number(s[7]), lat = Number(s[5]), lng = Number(s[6]);
    if (!want[id] || s[12] !== "ouverte" || st < now - 3 * 3600000 || st > now + 7 * 864e5 || !isFinite(lat) || !isFinite(lng) || (!lat && !lng) || !sp8Outdoor_(s[3])) return;
    var key = (Math.round(lat * 20) / 20).toFixed(2) + "," + (Math.round(lng * 20) / 20).toFixed(2);   // grille de ~5 km
    list.push({ id: id, st: st, key: key }); byKey[key] = 1;
  });
  var keys = Object.keys(byKey).slice(0, 12), data = {}, miss = [];
  keys.forEach(function (k) { var hit = c.get("sp8:wx:" + k); if (hit) data[k] = jsonSafe_(hit); else miss.push(k); });
  if (miss.length) {
    var reqs = miss.map(function (k) { var p = k.split(","); return { url: "https://api.open-meteo.com/v1/forecast?latitude=" + p[0] + "&longitude=" + p[1] + "&hourly=temperature_2m,precipitation_probability,weather_code&timezone=Europe%2FParis&forecast_days=8", muteHttpExceptions: true }; });
    var res = [];
    try { res = typeof UrlFetchApp.fetchAll === "function" ? UrlFetchApp.fetchAll(reqs) : reqs.map(function (r) { return UrlFetchApp.fetch(r.url, r); }); } catch (x) { try { console.error("meteo " + x); } catch (y) {} }
    miss.forEach(function (k, i) {
      var r = res[i]; if (!r || r.getResponseCode() !== 200) return;
      var j = jsonSafe_(r.getContentText()), h = j.hourly; if (!h || !Array.isArray(h.time)) return;
      var o = { t: h.time, a: h.temperature_2m || [], p: h.precipitation_probability || [], c: h.weather_code || [] };
      data[k] = o;
      try { c.put("sp8:wx:" + k, JSON.stringify(o), 3600); } catch (x) {}
    });
  }
  list.forEach(function (x) {
    var o = data[x.key]; if (!o || !o.t) return;
    var i = o.t.indexOf(Utilities.formatDate(new Date(x.st), SP8.TZ, "yyyy-MM-dd'T'HH:00")); if (i < 0) return;
    out[x.id] = { t: Math.round(Number(o.a[i])), p: Number(o.p[i]) || 0, e: sp8WxCode_(o.c[i]) };
  });
  return { status: "success", weather: out };
}

/* ===================== 19. « Je partage ma séance avec un proche » ===================== */
// Lien privé à jeton (seul son empreinte est stockée), qui expire 6 h après la fin de la séance. Aucune position en direct.
function sp8ShShare_() { return sheetH_("PartagesProches", ["empreinte du jeton", "séance", "pseudo", "expire (ms)", "créé (ms)"]); }
function sp8ShareCreate_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), s = sp8SessRow_(id), now = Date.now();
  if (!s || s[12] !== "ouverte") return err_("Séance introuvable.");
  var end = Number(s[7]) + (Number(s[15]) || 90) * 60000;
  if (end < now) return err_("Cette séance est terminée.");
  if (!sp8IsIn_(id, me.pseudo)) return err_("Inscris-toi d'abord à la séance.");
  var lim = rate_("shc:" + sp8Lc_(me.pseudo), 20, 86400, "Trop de liens créés aujourd'hui."); if (lim) return err_(lim);
  var t = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").slice(0, 40), exp = end + 6 * 3600000;
  var sh = sp8ShShare_(), rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) if (Number(rows[i][3]) < now) sh.deleteRow(i + 1);   // ménage des liens expirés
  sh.appendRow([hash_(t, "proche"), id, me.pseudo, exp, now]);
  return { status: "success", url: mailProp_("SITE_URL", "https://spary.fr").replace(/\/+$/, "") + "/#proche=" + t, expires: exp };
}
function sp8ShareView_(d) {
  var lim = rate_("shv:all", 600, 3600, "Trop de consultations, réessayez plus tard."); if (lim) return err_(lim);
  var t = String(d.t || "");
  if (!/^[a-f0-9]{40}$/.test(t)) return err_("Lien invalide.");
  var h = hash_(t, "proche"), now = Date.now(), row = null;
  rowsOf_(sp8ShShare_()).forEach(function (r) { if (r[0] === h) row = r; });
  if (!row || Number(row[3]) < now) return err_("Ce lien a expiré ou n'existe pas.");
  var s = sp8SessRow_(String(row[1]));
  if (!s) return err_("Cette séance n'existe plus.");
  var nm = nameMap_(), profs = profMap_(), who = nm[sp8Lc_(row[2])], org = nm[sp8Lc_(s[1])];
  return { status: "success", sport: String(s[3]), place: String(s[4]), lat: Math.round(Number(s[5]) * 1000) / 1000, lng: Math.round(Number(s[6]) * 1000) / 1000,
    start: Number(s[7]), dur: Number(s[15]) || 90, cancelled: s[12] !== "ouverte", count: sp8SessCount_(String(s[0])),
    by: who ? shownName_(who, profs[sp8Lc_(row[2])]) : "Un membre", org: org ? shownName_(org, profs[sp8Lc_(s[1])]) + " (@" + org.pseudo + ")" : "", expires: Number(row[3]) };
}

/* ===================== 20. Parrainage ===================== */
// Lien personnel spary.fr/?parrain=pseudo. Quand le filleul poste ou joue sa première séance : +200 pts au parrain (10 filleuls max), +100 pts au filleul.
// Points seulement, aucune récompense en argent.
var SP8_REF = { PARRAIN: 200, FILLEUL: 100, MAX: 10, HOURS: 48 };
function sp8ShRef_() { return sheetH_("Parrainages", ["filleul", "parrain", "date (ms)"]); }
function sp8RefClaim_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var par = findAccount_(sp8Pseudo_(d.parrain));
  if (!par || sp8Lc_(par.pseudo) === sp8Lc_(me.pseudo)) return err_("Parrain introuvable.");
  var p = sp8Lc_(me.pseudo), created = 0, rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (sp8Lc_(rows[i][6]) === p) created = new Date(rows[i][0]).getTime() || 0;
  if (!created || Date.now() - created > SP8_REF.HOURS * 3600000) return err_("Le parrainage se valide à l'inscription.");
  if (hides_(blocks_(me.pseudo), par.pseudo)) return err_("Parrain introuvable.");
  var sh = sp8ShRef_(), n = 0, dup = false;
  rowsOf_(sh).forEach(function (r) { if (sp8Lc_(r[0]) === p) dup = true; if (sp8Lc_(r[1]) === sp8Lc_(par.pseudo)) n++; });
  if (dup) return { status: "success", already: true };
  if (n >= 50) return err_("Ce parrain a déjà beaucoup de filleuls.");
  sh.appendRow([me.pseudo, par.pseudo, Date.now()]);
  CacheService.getScriptCache().remove("sp8:ref");
  return { status: "success" };
}
/** Bonus de parrainage par membre : { pseudo: { pts, n, ok } }. Un filleul est validé dès une séance postée ou jouée. */
function sp8RefBonus_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:ref");
  if (hit) return jsonSafe_(hit);
  var refs = rowsOf_(sp8ShRef_()).filter(function (r) { return r[0] && r[1]; }), m = {};
  if (refs.length) {
    var act = sp8ActivityMap_(), now = Date.now(), cnt = {}, done = {}, played = {};
    rowsOf_(shInscr_()).forEach(function (r) { cnt[String(r[0])] = (cnt[String(r[0])] || 0) + 1; });
    rowsOf_(shSeances_()).forEach(function (s) { if (s[12] === "ouverte" && Number(s[7]) + (Number(s[15]) || 90) * 60000 < now && (cnt[String(s[0])] || 0) >= 2) done[String(s[0])] = 1; });
    rowsOf_(shInscr_()).forEach(function (r) { if (done[String(r[0])]) played[sp8Lc_(r[1])] = 1; });
    refs.sort(function (a, b) { return (Number(a[2]) || 0) - (Number(b[2]) || 0); });
    refs.forEach(function (r) {
      var f = sp8Lc_(r[0]), p = sp8Lc_(r[1]), ok = !!((act[f] && act[f].n) || played[f]);
      var P = m[p] = m[p] || { pts: 0, n: 0, ok: 0 }; P.n++;
      if (!ok) return;
      if (P.ok < SP8_REF.MAX) P.pts += SP8_REF.PARRAIN;
      P.ok++;
      var F = m[f] = m[f] || { pts: 0, n: 0, ok: 0 }; F.pts += SP8_REF.FILLEUL;
    });
  }
  try { c.put("sp8:ref", JSON.stringify(m), 300); } catch (x) {}
  return m;
}
function sp8RefInfo_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var o = sp8RefBonus_()[sp8Lc_(me.pseudo)] || { pts: 0, n: 0, ok: 0 };
  return { status: "success", url: mailProp_("SITE_URL", "https://spary.fr").replace(/\/+$/, "") + "/?parrain=" + encodeURIComponent(me.pseudo), total: o.n, validated: o.ok, points: o.pts, max: SP8_REF.MAX, perRef: SP8_REF.PARRAIN, forNew: SP8_REF.FILLEUL };
}

/* ===================== 20. Notifications push « appli fermée » (v14) ===================== */
// Principe : le serveur envoie un simple « réveil » sans contenu au service de notification du navigateur
// (Google, Apple ou Mozilla, selon l'appareil). Le service worker du site demande alors le texte à afficher
// (action pushPull), en s'identifiant avec l'adresse secrète de son abonnement. Aucun contenu ne transite
// par ces services. Signature VAPID (ES256) calculée ici ; les clés sont créées toutes seules au premier
// besoin et rangées dans les propriétés du script (VAPID_PRIVATE, VAPID_PUBLIC). Ne pas les supprimer :
// sinon chaque appareil devra réactiver les notifications.
// Onglets : PushFile : date (ms) | pseudo | titre | texte | lien | sujet
//           PushSubs (existant) : date (ms) | pseudo | endpoint | p256dh | auth | dernier relevé (ms)
var SP14 = { TTL: 86400, KEEP_MS: 2 * 86400000, PER_EVENT: 40, ACTIVE_MS: 60000, MAX_PULL: 3, SUBJECT: "mailto:contact@spary.fr" };
var SP14_PING = [];   // abonnements à réveiller une fois la réponse prête (hors verrou)

function sp14ShFile_() { return sheetH_("PushFile", ["date (ms)", "pseudo", "titre", "texte", "lien", "sujet"]); }

/* ---------- Octets et encodages ---------- */
function sp14U8_(b) { var o = []; for (var i = 0; i < b.length; i++) o.push(b[i] & 255); return o; }
function sp14S8_(b) { return b.map(function (x) { return x > 127 ? x - 256 : x; }); }
function sp14Sha_(bytes) { return sp14U8_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sp14S8_(bytes))); }
function sp14Hmac_(key, data) { return sp14U8_(Utilities.computeHmacSha256Signature(sp14S8_(data), sp14S8_(key))); }
function sp14Utf8_(s) { return sp14U8_(Utilities.newBlob(String(s)).getBytes()); }
function sp14B64_(bytes) { return Utilities.base64EncodeWebSafe(sp14S8_(bytes)).replace(/=+$/, ""); }
function sp14UnB64_(s) { s = String(s || ""); while (s.length % 4) s += "="; return sp14U8_(Utilities.base64DecodeWebSafe(s)); }
function sp14Big_(bytes) { var h = "0x0"; bytes.forEach(function (x) { h += (x < 16 ? "0" : "") + x.toString(16); }); return BigInt(h); }
function sp14Bytes_(n, len) { var h = n.toString(16); while (h.length < len * 2) h = "0" + h; var o = []; for (var i = 0; i < len * 2; i += 2) o.push(parseInt(h.substr(i, 2), 16)); return o; }

/* ---------- Courbe P-256 (coordonnées jacobiennes) ---------- */
var SP14_EC = (function () {
  var Z = BigInt(0), ONE = BigInt(1), TWO = BigInt(2), THREE = BigInt(3), FOUR = BigInt(4), EIGHT = BigInt(8);
  var P = BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff");
  var N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  var G = [BigInt("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"), BigInt("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5")];
  function mod(a, m) { var r = a % m; return r < Z ? r + m : r; }
  function inv(a, m) {
    var lm = ONE, hm = Z, low = mod(a, m), high = m;
    while (low > ONE) { var r = high / low, nm = hm - lm * r, nw = high - low * r; hm = lm; high = low; lm = nm; low = nw; }
    return mod(lm, m);
  }
  function dbl(p) {
    if (p[2] === Z || p[1] === Z) return [Z, ONE, Z];
    var zz = mod(p[2] * p[2], P), al = mod(THREE * (p[0] - zz) * (p[0] + zz), P), yy = mod(p[1] * p[1], P), be = mod(FOUR * p[0] * yy, P);
    var x3 = mod(al * al - TWO * be, P);
    return [x3, mod(al * (be - x3) - EIGHT * yy * yy, P), mod(TWO * p[1] * p[2], P)];
  }
  function add(p, q) {
    if (p[2] === Z) return q; if (q[2] === Z) return p;
    var z1 = mod(p[2] * p[2], P), z2 = mod(q[2] * q[2], P), u1 = mod(p[0] * z2, P), u2 = mod(q[0] * z1, P);
    var s1 = mod(p[1] * q[2] * z2, P), s2 = mod(q[1] * p[2] * z1, P);
    if (u1 === u2) return s1 === s2 ? dbl(p) : [Z, ONE, Z];
    var h = mod(u2 - u1, P), r = mod(s2 - s1, P), h2 = mod(h * h, P), h3 = mod(h * h2, P), u1h2 = mod(u1 * h2, P);
    var x3 = mod(r * r - h3 - TWO * u1h2, P);
    return [x3, mod(r * (u1h2 - x3) - s1 * h3, P), mod(h * p[2] * q[2], P)];
  }
  function mul(k, pt) { var R = [Z, ONE, Z], Q = [pt[0], pt[1], ONE]; while (k > Z) { if (k & ONE) R = add(R, Q); Q = dbl(Q); k >>= ONE; } return R; }
  function affine(p) { var zi = inv(p[2], P), zi2 = mod(zi * zi, P); return [mod(p[0] * zi2, P), mod(p[1] * zi2 * zi, P)]; }
  function pub(d) { var a = affine(mul(d, G)); return [4].concat(sp14Bytes_(a[0], 32), sp14Bytes_(a[1], 32)); }
  /** ECDSA P-256 / SHA-256, nonce déterministe (RFC 6979). Renvoie r || s sur 64 octets. */
  function sign(dBytes, msg) {
    var d = sp14Big_(dBytes), h = sp14Sha_(msg), z = mod(sp14Big_(h), N), x = sp14Bytes_(d, 32), h1 = sp14Bytes_(z, 32);
    var V = [], K = [], i;
    for (i = 0; i < 32; i++) { V.push(1); K.push(0); }
    K = sp14Hmac_(K, V.concat([0], x, h1)); V = sp14Hmac_(K, V);
    K = sp14Hmac_(K, V.concat([1], x, h1)); V = sp14Hmac_(K, V);
    for (var guard = 0; guard < 100; guard++) {
      V = sp14Hmac_(K, V);
      var k = sp14Big_(V);
      if (k > Z && k < N) {
        var r = mod(affine(mul(k, G))[0], N);
        if (r !== Z) {
          var s = mod(inv(k, N) * (z + r * d), N);
          if (s !== Z) return sp14Bytes_(r, 32).concat(sp14Bytes_(s, 32));
        }
      }
      K = sp14Hmac_(K, V.concat([0])); V = sp14Hmac_(K, V);
    }
    throw new Error("Signature impossible");
  }
  return { N: N, pub: pub, sign: sign, mod: mod };
})();

/* ---------- Clés VAPID ---------- */
function sp14Keys_() {
  var pr = PropertiesService.getScriptProperties(), d = pr.getProperty("VAPID_PRIVATE"), q = pr.getProperty("VAPID_PUBLIC");
  if (d && q) return { d: sp14UnB64_(d), pub: q };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    d = pr.getProperty("VAPID_PRIVATE"); q = pr.getProperty("VAPID_PUBLIC");
    if (d && q) return { d: sp14UnB64_(d), pub: q };
    var seed = [], n = BigInt(0);
    while (n === BigInt(0)) {
      for (var i = 0; i < 6; i++) seed = seed.concat(sp14Utf8_(Utilities.getUuid()));   // UUID v4 : aléa cryptographique côté Google
      seed = seed.concat(sp14Utf8_(String(Date.now())));
      n = SP14_EC.mod(sp14Big_(sp14Sha_(seed)), SP14_EC.N);
    }
    var db = sp14Bytes_(n, 32), pb = sp14B64_(SP14_EC.pub(n));
    pr.setProperty("VAPID_PRIVATE", sp14B64_(db));
    pr.setProperty("VAPID_PUBLIC", pb);
    return { d: db, pub: pb };
  } finally { try { lock.releaseLock(); } catch (x) {} }
}
/** Jeton VAPID pour un service (aud = origine de l'endpoint), mis en cache 12 h. */
function sp14Jwt_(aud, keys) {
  var c = CacheService.getScriptCache(), ck = "p14jwt:" + aud, hit = c.get(ck);
  if (hit) return hit;
  var head = sp14B64_(sp14Utf8_(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  var body = sp14B64_(sp14Utf8_(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SP14.SUBJECT })));
  var unsigned = head + "." + body, jwt = unsigned + "." + sp14B64_(SP14_EC.sign(keys.d, sp14Utf8_(unsigned)));
  try { c.put(ck, jwt, 11 * 3600); } catch (x) {}
  return jwt;
}

/* ---------- File d'attente ---------- */
function sp14SubRows_() { return rowsOf_(sp8ShPush_()); }
/**
 * Prépare une notification pour des membres (à appeler sous verrou). gap = secondes minimum entre deux réveils
 * pour le même sujet et le même membre (évite une rafale à chaque message d'une discussion).
 */
function sp14Queue_(pseudos, item, opts) {
  opts = opts || {};
  if (!pseudos || !pseudos.length) return 0;
  var subs = {}, skip = sp8Lc_(opts.except || ""), now = Date.now(), c = CacheService.getScriptCache(), n = 0, sh = null;
  sp14SubRows_().forEach(function (r) { var k = sp8Lc_(r[1]); (subs[k] = subs[k] || []).push(String(r[2])); });
  var seen = {};
  pseudos.slice(0, opts.max || SP14.PER_EVENT).forEach(function (p) {
    var k = sp8Lc_(p);
    if (!k || seen[k] || k === skip || !subs[k]) return; seen[k] = 1;
    var gk = "p14g:" + k + ":" + item.subject;
    if (opts.gap) { if (c.get(gk)) return; try { c.put(gk, "1", opts.gap); } catch (x) {} }
    (sh = sh || sp14ShFile_()).appendRow([now, p, clip_(item.title, 60), clip_(item.body, 160), clip_(item.url || "./", 120), clip_(item.subject, 60)]);
    subs[k].forEach(function (ep) {
      if (ep.indexOf(SP16.PREFIX) === 0) SP16_OUT.push({ tok: ep.slice(SP16.PREFIX.length), title: clip_(item.title, 60), body: clip_(item.body, 160), url: clip_(item.url || "./", 120), tag: clip_(item.subject, 60) });
      else SP14_PING.push(ep);
    });
    n++;
  });
  return n;
}
/** Réveille les appareils (après la réponse, hors verrou). Les abonnements expirés sont retirés. */
function sp14Flush_() {
  if (SP16_OUT.length) { var nat = SP16_OUT.slice(0, 100); SP16_OUT = []; try { sp16Send_(nat); } catch (e) { try { console.error("push natif " + (e && e.message || e)); } catch (x) {} } }
  if (!SP14_PING.length) return;
  var eps = SP14_PING.filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 100); SP14_PING = [];
  try {
    var keys = sp14Keys_(), reqs = eps.map(function (ep) {
      var aud = ep.match(/^https:\/\/[^\/]+/)[0];
      return { url: ep, method: "post", muteHttpExceptions: true, followRedirects: false,
        headers: { TTL: String(SP14.TTL), Urgency: "high", Authorization: "vapid t=" + sp14Jwt_(aud, keys) + ", k=" + keys.pub } };
    });
    var res = UrlFetchApp.fetchAll(reqs), dead = [];
    res.forEach(function (r, i) {
      var code = r.getResponseCode();
      if (code === 404 || code === 410) dead.push(eps[i]);
      else if (code >= 400) { try { console.warn("push " + code + " " + eps[i].slice(0, 40) + " " + String(r.getContentText()).slice(0, 120)); } catch (x) {} }
    });
    if (dead.length) sp8After_(function () {
      var sh = sp8ShPush_(), rows = sh.getDataRange().getValues();
      for (var i = rows.length - 1; i >= 1; i--) if (dead.indexOf(String(rows[i][2])) >= 0) sh.deleteRow(i + 1);
    });
  } catch (e) { try { console.error("push envoi " + (e && e.message || e)); } catch (x) {} }
}
/** Diagnostic à lancer depuis l'éditeur : sp14TesterPush("tonpseudo") envoie une notification de test à tous ses appareils et affiche la réponse des services. */
function sp14TesterPush(pseudo) {
  pseudo = String(pseudo || "").trim();
  var subs = sp14SubRows_().filter(function (r) { return sp8Lc_(r[1]) === sp8Lc_(pseudo); });
  console.log("Clé publique : " + sp14Keys_().pub.slice(0, 12) + "… | appareils abonnés pour « " + pseudo + " » : " + subs.length);
  if (!subs.length) { console.log("Aucun appareil : active les notifications dans Profil → Compte et données, sur le téléphone, puis relance."); return; }
  sp14ShFile_().appendRow([Date.now(), subs[0][1], "Test Spary", "Si tu vois ce message, les notifications marchent.", "./", "test"]);
  var keys = sp14Keys_();
  var nat = subs.filter(function (r) { return String(r[2]).indexOf(SP16.PREFIX) === 0; });
  if (nat.length) sp16Send_(nat.map(function (r) { return { tok: String(r[2]).slice(SP16.PREFIX.length), title: "Test Spary", body: "Si tu vois ce message, les notifications de l'appli marchent.", url: "./", tag: "test" }; }), true);
  subs = subs.filter(function (r) { return String(r[2]).indexOf(SP16.PREFIX) !== 0; });
  subs.forEach(function (r) {
    var ep = String(r[2]), aud = ep.match(/^https:\/\/[^\/]+/)[0];
    var res = UrlFetchApp.fetch(ep, { method: "post", muteHttpExceptions: true, followRedirects: false, headers: { TTL: "600", Urgency: "high", Authorization: "vapid t=" + sp14Jwt_(aud, keys) + ", k=" + keys.pub } });
    console.log(aud + " → " + res.getResponseCode() + (res.getResponseCode() >= 300 ? " " + String(res.getContentText()).slice(0, 200) : " (envoyé)"));
  });
}
/** Diagnostic sans paramètre : teste le dernier appareil qui a activé les notifications. */
function sp14TesterDernierAppareil() { var r = sp14SubRows_(); if (!r.length) return console.log("Aucun appareil abonné."); sp14TesterPush(String(r[r.length - 1][1])); }
/** Test depuis l'éditeur : sp14TesterMessage("contact@spary.fr", "theom") envoie (pseudo ou e-mail) un vrai message de « de » à « a », avec sa notification. */
/** Retrouve un compte par pseudo ou par e-mail (onglet Comptes : D = e-mail, G = pseudo). */
function sp14FindAcc_(q) {
  q = String(q || "").trim().toLowerCase(); if (!q) return null;
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][6]).toLowerCase() === q || String(rows[i][3]).trim().toLowerCase() === q) return { pseudo: String(rows[i][6]), name: String(rows[i][2]) };
  var hits = [];
  for (var j = 1; j < rows.length; j++) if ((String(rows[j][6]) + " " + rows[j][3]).toLowerCase().indexOf(q.split("@")[0]) >= 0) hits.push(String(rows[j][6]));
  console.log("« " + q + " » introuvable." + (hits.length ? " Pseudos proches : " + hits.slice(0, 10).join(", ") : ""));
  return null;
}
function sp14TesterMessage(de, a) {
  de = String(de || "contact@spary.fr"); a = String(a || "theom");
  var src = sp14FindAcc_(de), dst = sp14FindAcc_(a);
  if (!src || !dst) return console.log("Relance avec le bon pseudo, par exemple sp14TesterMessage(\"pseudo_admin\", \"theom\").");
  sp8Locked_(function () {
    var now = Date.now(), id = now * 1000 + Math.floor(Math.random() * 1000);
    sheet_("Messages", true).appendRow([id, src.pseudo, dst.pseudo, safe_("Salut ! Message de test envoyé depuis le compte " + src.pseudo + "."), now]);
    var n = sp14Queue_([dst.pseudo], { title: src.pseudo, body: "Salut ! Message de test envoyé depuis le compte " + src.pseudo + ".", url: "./#messages", subject: "msg:" + sp8Lc_(src.pseudo) + ":" + now }, { always: true });
    console.log("Message écrit de " + src.pseudo + " à " + dst.pseudo + " | appareils à réveiller : " + SP14_PING.length + (n ? "" : " (aucun appareil abonné)"));
  });
  sp14Flush_();
  console.log("Envoyé. Si un service a refusé, la ligne « push … » ci-dessus donne le code.");
}
/** Ménage : notifications de plus de 2 jours. */
function sp14Purge_() {
  var sh = sp14ShFile_(), rows = sh.getDataRange().getValues(), lim = Date.now() - SP14.KEEP_MS, n = 0;
  for (var i = 1; i < rows.length && Number(rows[i][0]) < lim; i++) n++;
  if (n) sh.deleteRows(2, n);
}

/* ---------- Actions appelées par le site et le service worker ---------- */
function sp14Key_() { return { status: "success", key: sp14Keys_().pub }; }
/** Appelé par le service worker à la réception d'un réveil : renvoie les notifications à afficher sur cet appareil. */
function sp14Pull_(d) {
  var ep = String(d.endpoint || "");
  if (!/^https:\/\//.test(ep)) return err_("Abonnement invalide.");
  var sh = sp8ShPush_(), rows = sh.getDataRange().getValues(), row = -1, pseudo = "", since = 0;
  for (var i = 1; i < rows.length; i++) if (String(rows[i][2]) === ep) { row = i + 1; pseudo = String(rows[i][1]); since = Number(rows[i][5]) || Number(rows[i][0]) || 0; }
  if (row < 0) return { status: "success", items: [], gone: true };
  var p = sp8Lc_(pseudo), now = Date.now(), fresh = [], last = null;
  rowsOf_(sp14ShFile_()).forEach(function (r) {
    if (sp8Lc_(r[1]) !== p || Number(r[0]) < now - SP14.KEEP_MS) return;
    var it = { title: String(r[2]), body: String(r[3]), url: String(r[4] || "./"), tag: String(r[5] || "spary"), ts: Number(r[0]) };
    last = it; if (it.ts > since) fresh.push(it);
  });
  sh.getRange(row, 6).setValue(now);
  if (Math.random() < 0.05) sp14Purge_();
  fresh = fresh.slice(-SP14.MAX_PULL).reverse();
  return { status: "success", items: fresh, last: fresh.length ? null : last };
}

/* ---------- Textes ---------- */
function sp14Name_(me) { return String((me && (me.name || me.pseudo)) || "Un membre").split(" ")[0]; }
function sp14When_(ms) { return Utilities.formatDate(new Date(Number(ms)), SP8.TZ, "EEEE dd/MM 'à' HH'h'mm").replace(/^(\w)/, function (x) { return x.toLowerCase(); }); }
function sp14SessUrl_(id) { return "./#seance=" + id; }
function sp14Players_(id) { var o = []; rowsOf_(shInscr_()).forEach(function (r) { if (String(r[0]) === String(id)) o.push(String(r[1])); }); return o; }

/* ---------- Événements qui déclenchent une notification ---------- */
/** Texte du message tel qu'affiché dans la notification (une ligne, 150 caractères max). */
function sp14Txt_(t) { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > 150 ? t.slice(0, 149) + "…" : t; }
function sp14OnMsg_(data, res) {
  var me = sessionUser_(data.token); if (!me || !res || !res.to) return;
  var nm = sp14Name_(me), to = String(res.to), txt = sp14Txt_(data.text);
  if (to.charAt(0) !== "#") {
    sp14Queue_([to], { title: String(me.pseudo), body: txt, url: "./#messages", subject: "msg:" + sp8Lc_(me.pseudo) + ":" + Date.now() }, { except: me.pseudo });
    return;
  }
  var id = to.slice(1), grp = sp8GroupsAll_()[id], who = [], title;
  if (grp) { who = grp.members.slice(); title = "Groupe « " + grp.name + " »"; }
  else {
    var s = sp8SessRow_(id); if (!s) return;
    who = sp14Players_(id).concat([String(s[1])]); title = "Séance de " + s[3];
  }
  var bl = blocks_(me.pseudo);
  who = who.filter(function (p) { return !hides_(bl, p); });
  sp14Queue_(who, { title: title, body: me.pseudo + " : " + txt, url: "./#messages", subject: "chan:" + id + ":" + Date.now() }, { gap: 20, except: me.pseudo });
}
function sp14OnJoin_(data) {
  var me = sessionUser_(data.token), id = String(Number(data.id) || ""), s = me && sp8SessRow_(id); if (!s) return;
  var left = Number(s[8]) - sp8SessCount_(id);
  sp14Queue_([String(s[1])], { title: "Nouvel inscrit", body: sp14Name_(me) + " a rejoint ta séance de " + s[3] + (left > 0 ? " (" + left + " place" + (left > 1 ? "s" : "") + " restante" + (left > 1 ? "s" : "") + ")." : ". Elle est complète !"), url: sp14SessUrl_(id), subject: "join-" + id }, { gap: 300, except: me.pseudo });
}
function sp14OnCancel_(data) {
  var me = sessionUser_(data.token), id = String(Number(data.id) || ""), s = me && sp8SessRow_(id); if (!s || Number(s[7]) < Date.now()) return;
  sp14Queue_(sp14Players_(id), { title: "Séance annulée", body: "La séance de " + s[3] + " du " + sp14When_(s[7]) + " est annulée par " + sp14Name_(me) + ".", url: "./", subject: "cancel:" + id }, { except: me.pseudo, always: true });
}
function sp14OnPromote_(pseudo, s) {
  sp14Queue_([pseudo], { title: "Une place s'est libérée", body: "Tu es inscrit·e à la séance de " + s[3] + " " + sp14When_(s[7]) + ".", url: sp14SessUrl_(s[0]), subject: "promo-" + s[0] }, { always: true });
}
function sp14OnAlert_(s, free, cand) {
  var nb = free + " joueur" + (free > 1 ? "s" : "");
  sp14Queue_(cand.map(function (c) { return c.pseudo; }), { title: "Il manque " + nb, body: s[3] + " près de chez toi, " + sp14When_(s[7]) + ". Premier inscrit, premier servi !", url: sp14SessUrl_(s[0]), subject: "lm-" + s[0] }, { always: true, max: SP8_LM_MAX });
}
function sp14OnFriend_(me, to) {
  sp14Queue_([to], { title: "Demande d'ami", body: sp14Name_(me) + " veut t'ajouter en ami.", url: "./", subject: "fr-" + sp8Lc_(me.pseudo) }, { gap: 86400 });
}
function sp14OnMatch_(data, res) {
  var me = sessionUser_(data.token); if (!me || !res || !res.opponent) return;
  sp14Queue_([res.opponent], { title: "Résultat à confirmer", body: sp14Name_(me) + " a déclaré un match de " + clip_(data.sport, 30) + " contre toi.", url: "./", subject: "mt:" + res.id }, { except: me.pseudo });
}
function sp14OnMatchReply_(data, res) {
  var me = sessionUser_(data.token), id = String(Number(data.id) || ""); if (!me || !res) return;
  var row = null; rowsOf_(shMatchs_()).forEach(function (r) { if (String(r[0]) === id) row = r; }); if (!row) return;
  sp14Queue_([String(row[2])], { title: res.accepted ? "Match confirmé" : "Match contesté", body: sp14Name_(me) + (res.accepted ? " a confirmé" : " a contesté") + " ton résultat de " + row[4] + ".", url: "./", subject: "res-" + id }, { except: me.pseudo });
}

/* ===================== 21. Notifications de l'appli mobile (Firebase Cloud Messaging) =====================
 * L'appli iPhone / Android enregistre son jeton Firebase dans l'onglet des abonnements push, préfixé par « fcm-natif: ».
 * L'envoi passe par l'API FCM v1 avec un compte de service : coller tout le fichier JSON du compte de service
 * dans la Script Property FCM_SERVICE_ACCOUNT (jamais dans le code). */
var SP16 = { PREFIX: "fcm-natif:", SCOPE: "https://www.googleapis.com/auth/firebase.messaging" };
var SP16_OUT = [];   // notifications natives à envoyer une fois la réponse prête
function sp16Account_() {
  try { var j = PropertiesService.getScriptProperties().getProperty("FCM_SERVICE_ACCOUNT"); if (!j) return null; var o = JSON.parse(j); return o.client_email && o.private_key && o.project_id ? o : null; } catch (e) { return null; }
}
function sp16B64u_(x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ""); }
/** Jeton d'accès Google (1 h), mis en cache 50 min. */
function sp16Token_(sa) {
  var c = CacheService.getScriptCache(), k = "p16tok", t = c.get(k); if (t) return t;
  var now = Math.floor(Date.now() / 1000);
  var head = sp16B64u_(JSON.stringify({ alg: "RS256", typ: "JWT" })),
      body = sp16B64u_(JSON.stringify({ iss: sa.client_email, scope: SP16.SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })),
      sig = sp16B64u_(Utilities.computeRsaSha256Signature(head + "." + body, sa.private_key));
  var r = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", { method: "post", muteHttpExceptions: true,
    payload: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: head + "." + body + "." + sig } });
  var o = {}; try { o = JSON.parse(r.getContentText()); } catch (e) {}
  if (!o.access_token) throw new Error("Firebase : jeton refusé (" + r.getResponseCode() + ") " + String(r.getContentText()).slice(0, 150));
  try { c.put(k, o.access_token, 3000); } catch (e) {}
  return o.access_token;
}
/** Envoie les notifications natives ; les jetons expirés sont retirés. */
function sp16Send_(list, log) {
  var sa = sp16Account_(); if (!sa || !list.length) { if (log) console.log("Appli mobile : FCM_SERVICE_ACCOUNT absente, rien envoyé."); return; }
  var at = sp16Token_(sa), url = "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(sa.project_id) + "/messages:send";
  var reqs = list.map(function (n) {
    return { url: url, method: "post", contentType: "application/json", muteHttpExceptions: true, headers: { Authorization: "Bearer " + at },
      payload: JSON.stringify({ message: { token: n.tok,
        notification: { title: n.title, body: n.body },
        data: { url: n.url || "./" },
        apns: { headers: { "apns-priority": "10", "apns-collapse-id": String(n.tag || "spary").slice(0, 60) }, payload: { aps: { sound: "default", "thread-id": String(n.tag || "spary").split(":").slice(0, 2).join(":") } } },
        android: { priority: "high", notification: { sound: "default", tag: String(n.tag || "spary") } } } }) };
  });
  var res = UrlFetchApp.fetchAll(reqs), dead = [];
  res.forEach(function (r, i) {
    var code = r.getResponseCode(), txt = String(r.getContentText());
    if (code === 404 || (code === 400 && /registration token|UNREGISTERED/i.test(txt))) dead.push(SP16.PREFIX + list[i].tok);
    else if (code >= 400) { try { console.warn("push natif " + code + " " + txt.slice(0, 150)); } catch (x) {} }
    if (log) console.log("appli mobile → " + code + (code >= 300 ? " " + txt.slice(0, 200) : " (envoyé)"));
  });
  if (dead.length) sp8After_(function () {
    var sh = sp8ShPush_(), rows = sh.getDataRange().getValues();
    for (var i = rows.length - 1; i >= 1; i--) if (dead.indexOf(String(rows[i][2])) >= 0) sh.deleteRow(i + 1);
  });
}
