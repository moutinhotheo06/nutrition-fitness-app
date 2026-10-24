/**
 * Spary · Lot 27 : notifications qui ouvrent le bon objet, photos d'annonces groupées, aperçu flou des photos.
 *
 * OÙ LE METTRE : nouveau fichier « Lot27 » (+ → Script), TOUT EN BAS de la liste des fichiers (sous Messagerie).
 * Ne modifie aucun autre fichier, Code.gs compris. Comme Messagerie, il réapplique lui-même les protections de Securite.
 *
 * PUIS :
 *  1. Exécuter lot27Verifier : le journal doit afficher « OK ».
 *  2. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *
 * Ce que ça change :
 *  - Notifications : le lien envoyé avec la notification pointe vers la conversation (#dm=pseudo), le groupe (#grp=id)
 *    au lieu de « Messages » en général. Les séances (#seance=id) étaient déjà précises.
 *  - imgs27 : jusqu'à 8 photos d'annonces en une seule requête (avant : une requête de 1 à 3 s par photo).
 *    Mêmes règles que postImage (annonce masquée, membre bloqué, compte privé).
 *  - mini27 : l'auteur d'une annonce enregistre une miniature floue (24 px, < 3 Ko) créée sur son téléphone.
 *    Onglet AnnoncesMini (créé tout seul) : annonce | miniature (data URL JPEG) | rapport largeur/hauteur.
 *    La liste des annonces (postList) renvoie ces miniatures : la photo floue s'affiche instantanément.
 *  - Suppression d'une annonce ou d'un compte : les miniatures correspondantes sont effacées.
 * Sans ce fichier, le site marche : photos chargées une par une (en parallèle et en cache), pas d'aperçu flou,
 * notifications de message qui ouvrent la liste des conversations.
 */

var L27 = { installed: false, MAX_IDS: 8, MINI_MAX: 3000, CACHE: "l27:mini" };

function l27Sh_() { return sheetH_("AnnoncesMini", ["annonce", "miniature", "rapport"]); }
function l27Mini_(m) { m = String(m || ""); return /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(m) && m.length <= L27.MINI_MAX ? m : ""; }

/** Toutes les miniatures (cache 10 min). */
function l27Minis_() {
  var c = CacheService.getScriptCache(), hit = c.get(L27.CACHE);
  if (hit) return jsonSafe_(hit) || {};
  var sh = l27Sh_(), last = sh.getLastRow(), o = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, 3).getValues().forEach(function (r) { if (r[0] && r[1]) o[String(r[0])] = { m: String(r[1]), r: Number(r[2]) || 1 }; });
  try { c.put(L27.CACHE, JSON.stringify(o), 600); } catch (x) {}
  return o;
}

/** Annonces : id → auteur (une seule lecture). */
function l27Authors_() {
  var o = {};
  rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (r[0]) o[String(r[0])] = String(r[1]); });
  return o;
}

/** Plusieurs photos d'annonces en une requête, avec les mêmes contrôles que sp8PostImage_. */
function l27Imgs_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var ids = (Array.isArray(d.ids) ? d.ids : []).map(function (x) { return String(Number(x) || ""); }).filter(String).slice(0, L27.MAX_IDS);
  if (!ids.length) return { status: "success", imgs: {} };
  var hid = hidden_(), au = l27Authors_(), mine = sp8Lc_(me.pseudo), bl = blocks_(me.pseudo), priv = sp8PrivateSet_(), fr = null, ok = {};
  ids.forEach(function (id) {
    var a = au[id];
    if (!a || hid["annonce:" + id]) return;
    var k = sp8Lc_(a);
    if (k !== mine) {
      if (hides_(bl, a)) return;
      if (priv[k]) { fr = fr || sp8FriendState_(me.pseudo); if (fr[k] !== "ami") return; }
    }
    ok[id] = 1;
  });
  var out = {}, sh = sp8ShImg_(), last = sh.getLastRow();
  if (last >= 2 && Object.keys(ok).length) {
    sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) { var id = String(r[0]); if (ok[id]) out[id] = String(r[1]); });
  }
  return { status: "success", imgs: out };
}

/** L'auteur enregistre la miniature floue de sa photo. */
function l27SetMini_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var id = String(Number(d.id) || ""), m = l27Mini_(d.mini), r = Math.max(0.3, Math.min(3, Number(d.r) || 1));
  if (!id || !m) return err_("Miniature invalide.");
  var a = l27Authors_()[id];
  if (!a || sp8Lc_(a) !== sp8Lc_(me.pseudo)) return err_("Action impossible.");
  sp8Locked_(function () {
    var sh = l27Sh_(), last = sh.getLastRow();
    if (last >= 2) { var v = sh.getRange(2, 1, last - 1, 1).getValues(); for (var i = v.length - 1; i >= 0; i--) if (String(v[i][0]) === id) sh.deleteRow(i + 2); }
    sh.appendRow([id, m, Math.round(r * 1000) / 1000]);
  });
  CacheService.getScriptCache().remove(L27.CACHE);
  return { status: "success" };
}

/** Efface les miniatures des annonces qui n'existent plus. */
function l27Clean_() {
  var au = l27Authors_(), sh = l27Sh_(), rows = sh.getDataRange().getValues(), n = 0;
  for (var i = rows.length - 1; i >= 1; i--) if (!au[String(rows[i][0])]) { sh.deleteRow(i + 1); n++; }
  if (n) CacheService.getScriptCache().remove(L27.CACHE);
  return n;
}

/** Lien de notification précis selon le sujet : msg:pseudo:… → #dm=pseudo ; chan:id:… → #grp=id. */
function l27Url_(item) {
  var s = String(item && item.subject || ""), u = String(item && item.url || "");
  if (!/^\.?\/?#messages$/.test(u)) return u;
  var m = s.match(/^msg:([A-Za-z0-9_.-]{1,30}):/); if (m) return "./#dm=" + encodeURIComponent(m[1]);
  m = s.match(/^chan:([A-Za-z0-9_-]{1,40}):/); if (m) return "./#grp=" + m[1];
  return u;
}

function l27Install_() {
  if (L27.installed || typeof doPost !== "function" || typeof sessionUser_ !== "function") return;
  L27.installed = true;

  // 1. Notifications : lien vers l'objet.
  if (typeof sp14Queue_ === "function") {
    var q = sp14Queue_;
    sp14Queue_ = function (pseudos, item, opts) {
      try { if (item && item.url) item.url = l27Url_(item); } catch (x) {}
      return q(pseudos, item, opts);
    };
  }

  // 2. Actions.
  var prev = doPost, secPrev = typeof SEC !== "undefined" && SEC && SEC.installed && SEC.wrapper === doPost;
  var wrapper = function (e) {
    var raw = e && e.postData && typeof e.postData.contents === "string" ? e.postData.contents : "";
    var data = null; try { data = JSON.parse(raw); } catch (x) {}
    if (!data || !/^(imgs27|mini27|postList|postDelete)$/.test(String(data.action || ""))) return prev(e);
    if (data.action === "postList") {
      var out = prev(e);
      try {
        var res = JSON.parse(out.getContent());
        if (res && res.status === "success" && Array.isArray(res.posts)) {
          var all = l27Minis_(), mini = {};
          res.posts.forEach(function (p) { if (p && p.img && all[String(p.id)]) mini[String(p.id)] = all[String(p.id)]; });
          res.mini27 = mini;
          return out_(res);
        }
      } catch (x) {}
      return out;
    }
    if (data.action === "postDelete") {
      var o2 = prev(e);
      try { var r2 = JSON.parse(o2.getContent()); if (r2 && r2.status === "success") sp8Locked_(l27Clean_); } catch (x) {}
      return o2;
    }
    if (secPrev) {
      if (raw.length > SEC.MAX_BYTES) return out_(err_("Requête trop volumineuse."));
      try { var stop = secGuard_(data); if (stop) return out_(stop); } catch (x) {}
      var flag = { changed: false }; data = secClean_(data, 0, flag);
    }
    try { return out_(data.action === "imgs27" ? l27Imgs_(data) : l27SetMini_(data)); }
    catch (err) {
      var m = String(err && err.message || err);
      try { console.error("lot27 " + m); } catch (x) {}
      return out_({ status: "error", message: /lock/i.test(m) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
  };
  doPost = wrapper;
  if (secPrev) SEC.wrapper = doPost;

  // 3. Suppression de compte : miniatures des annonces disparues.
  if (typeof deleteAccountData_ === "function") {
    var del = deleteAccountData_;
    deleteAccountData_ = function (pseudo) { var r = del(pseudo); try { l27Clean_(); } catch (x) {} return r; };
  }
}
l27Install_();

/** Vérifie l'installation. */
function lot27Verifier() {
  if (!L27.installed) return console.log("PROBLÈME : Lot27 n'est pas chargé (place-le tout en bas, sous Messagerie).");
  l27Sh_();
  console.log("OK : photos groupées (imgs27), aperçu flou (onglet AnnoncesMini) actifs.");
  console.log(typeof sp14Queue_ === "function" ? "OK : notifications de message → conversation précise." : "Notifications : sp14Queue_ introuvable (fichier Nouveautes absent ?).");
  console.log("Test lien : " + l27Url_({ url: "./#messages", subject: "msg:theom:1" }) + " / " + l27Url_({ url: "./#messages", subject: "chan:55:1" }));
}
