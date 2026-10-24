/**
 * Spary : parcours d'inscription, connexion avec Apple, partenaires compatibles, actus sportives, badge vérifié (lot 19, v31).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Parcours », coller ce code.
 * Le placer SOUS Performances et AU-DESSUS de Rgpd et de Securite (Securite reste le dernier fichier).
 * Ne modifier aucun autre fichier (ni Code.gs, ni Nouveautes, ni Entrainements, ni Performances).
 *  1. Exécuter sp28Verifier : le journal doit afficher « OK » (accepter les autorisations, dont « se connecter à un service externe »).
 *  2. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *
 * Ce que ça ajoute :
 *  1. Parcours de première connexion (profil, sports, niveaux, disponibilités) : le profil passe par profileSave (Code.gs),
 *     ce fichier garde seulement l'état du parcours et les sports suivis pour les actus (onglet Parcours).
 *  2. Connexion avec Apple (appli iPhone) : le jeton d'Apple est vérifié ici (signature RSA, émetteur, destinataire,
 *     expiration, nonce à usage unique). Un compte Spary est créé ou retrouvé, puis une session normale est ouverte.
 *     Le lien entre l'identifiant Apple et le pseudo est dans l'onglet ConnexionsApple.
 *     Facultatif, pour révoquer l'accès Apple quand un membre supprime son compte (recommandé par Apple) :
 *     Script Properties APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_P8 (contenu du fichier .p8, clé « Sign in with Apple »).
 *  3. Partenaires compatibles : même sport, niveau proche, créneaux en commun, même tranche d'âge (mineurs entre eux,
 *     majeurs entre eux). Jamais les comptes privés, masqués de la recherche, bloqués ou suspendus.
 *  4. Actus sportives : titres, source, date et lien seulement (flux RSS Google Actualités), mis en cache 30 min par sport.
 *  5. Badge « profil vérifié » : e-mail confirmé (ou compte Apple), photo de profil et au moins un sport.
 *     Spary ne vérifie pas l'identité : le badge le dit clairement dans l'appli.
 *
 * Onglets créés tout seuls :
 *  - Parcours        : membre | données (JSON : fait, sports suivis) | maj (ms)
 *  - ConnexionsApple : identifiant Apple | membre | lié (ms) | e-mail Apple | relais Apple (oui/non) | jeton de révocation
 * Aucun secret dans ce fichier. Écritures sous LockService (sp8Locked_).
 */

var SP28 = {
  installed: false,
  BUNDLE: "fr.spary.app",
  ISS: "https://appleid.apple.com",
  NEWS_TTL: 1800,
  NEWS_STALE: 21600,
  NEWS_PER_SPORT: 8,
  NEWS_MAX: 18,
  PARTNERS: 8,
  VERIF_TTL: 900,
  // Sports proposés pour les actus (clé = nom affiché dans l'appli) → recherche Google Actualités
  NEWS: {
    "Football / Five": "football", "Tennis": "tennis ATP WTA", "Padel": "padel", "Running & Trail": "trail OR marathon OR running",
    "Basketball": "basket NBA OR Betclic Elite", "Badminton": "badminton", "Fitness / Crossfit": "crossfit OR fitness", "Yoga & Pilates": "yoga pilates",
    "Natation": "natation", "Escalade": "escalade", "Cyclisme": "cyclisme", "Golf": "golf", "Volley-ball": "volley-ball", "Rugby": "rugby",
    "Handball": "handball", "Karting": "karting", "Paintball": "paintball", "Musculation": "musculation", "Marche": "marche nordique OR randonnée",
    "Squash": "squash", "Tennis de table": "tennis de table", "Sports de combat": "boxe OR MMA OR judo", "Formule 1": "Formule 1",
    "Athlétisme": "athlétisme", "Ski": "ski alpin OR biathlon", "Sports US": "NFL OR NBA OR NHL"
  }
};

function sp28ShPrefs_() { return sheetH_("Parcours", ["membre", "données (JSON)", "maj (ms)"]); }
function sp28ShApple_() { return sheetH_("ConnexionsApple", ["identifiant Apple", "membre", "lié (ms)", "e-mail Apple", "relais Apple", "jeton de révocation"]); }
function sp28Lc_(s) { return String(s == null ? "" : s).toLowerCase(); }
function sp28Prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ""; }

/* ===================== Parcours ===================== */
function sp28PrefRow_(pseudo) {
  var p = sp28Lc_(pseudo), v = sp28ShPrefs_().getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (sp28Lc_(v[i][0]) === p) return { at: i + 1, data: jsonSafe_(v[i][1]) };
  return null;
}
function sp28CleanFollow_(a) {
  var out = [];
  (Array.isArray(a) ? a : []).forEach(function (s) { s = String(s || ""); if (SP28.NEWS[s] && out.indexOf(s) < 0 && out.length < 12) out.push(s); });
  return out;
}
function sp28OnbGet_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var r = sp28PrefRow_(me.pseudo), crit = sp28Criteria_(me.pseudo);
  return { status: "success", prefs: r ? r.data : null, verified: crit.ok, crit: crit, apple: !!sp28AppleOf_(me.pseudo), news: Object.keys(SP28.NEWS) };
}
function sp28OnbSave_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var lim = rate_("onb:" + sp28Lc_(me.pseudo), 60, 3600, "Trop de modifications. Réessaie plus tard."); if (lim) return err_(lim);
  return sp8Locked_(function () {
    var r = sp28PrefRow_(me.pseudo), cur = r ? r.data : {}, now = Date.now();
    if (d.done) cur.done = cur.done || now;
    if (d.short) cur.short = 1;
    if (d.follow !== undefined) cur.follow = sp28CleanFollow_(d.follow);
    var json = JSON.stringify(cur).slice(0, 4000), sh = sp28ShPrefs_();
    if (r) sh.getRange(r.at, 2, 1, 2).setValues([[json, now]]);
    else sh.appendRow([me.pseudo, json, now]);
    return { status: "success", prefs: cur };
  });
}

/* ===================== Badge vérifié ===================== */
/** Critères du badge pour tous les membres, en cache 15 min : { pseudo en minuscules : 1 }. */
function sp28VerifMap_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp28ver");
  if (hit) return jsonSafe_(hit);
  var mail = {}, photo = {}, sports = {}, out = {};
  rowsOf_(sheet_(SHEET_ACCOUNTS)).forEach(function (r) { if (r[6] && r[12]) mail[sp28Lc_(r[6])] = 1; });
  rowsOf_(sp28ShApple_()).forEach(function (r) { if (r[1]) mail[sp28Lc_(r[1])] = 1; });
  var sh = sheet_(SHEET_PROFILES, true), last = sh.getLastRow();
  if (last >= 1) {
    var ab = sh.getRange(1, 1, last, 3).getValues();
    for (var i = 0; i < ab.length; i++) {
      var k = sp28Lc_(ab[i][0]); if (!k) continue;
      if (String(ab[i][2] || "").length > 100) photo[k] = 1;
      var dd = jsonSafe_(ab[i][1]); if (Array.isArray(dd.sports) && dd.sports.length) sports[k] = 1;
    }
  }
  Object.keys(mail).forEach(function (k) { if (photo[k] && sports[k] && !isBanned_(k)) out[k] = 1; });
  try { c.put("sp28ver", JSON.stringify(out), SP28.VERIF_TTL); } catch (x) {}
  return out;
}
function sp28Criteria_(pseudo) {
  var k = sp28Lc_(pseudo), acc = typeof accountByKey_ === "function" ? accountByKey_(pseudo) : null;
  var pr = profMap_()[k], data = pr ? pr.data : {};
  var o = { mail: !!(acc && acc.verified) || !!sp28AppleOf_(pseudo), photo: !!(pr && String(avatarOf_(pr) || "").length > 100), sports: Array.isArray(data.sports) && data.sports.length > 0 };
  o.ok = o.mail && o.photo && o.sports;
  return o;
}
function sp28Verif_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var map = sp28VerifMap_(), v = {};
  (Array.isArray(d.pseudos) ? d.pseudos : []).slice(0, 80).forEach(function (p) { p = sp28Lc_(p); if (map[p]) v[p] = 1; });
  return { status: "success", v: v };
}

/* ===================== Partenaires compatibles ===================== */
function sp28Slots_(a) {
  var o = {};
  DAYS.forEach(function (day) { (a && Array.isArray(a[day]) ? a[day] : []).forEach(function (s) { if (SLOTS.indexOf(s) >= 0) o[day + " " + s] = 1; }); });
  return o;
}
function sp28Partners_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var lim = rate_("prt:" + sp28Lc_(me.pseudo), 120, 3600, "Trop de requêtes. Réessaie plus tard."); if (lim) return err_(lim);
  var mine = sp28Lc_(me.pseudo), c = CacheService.getScriptCache(), ck = "sp28p:" + mine, hit = c.get(ck);
  if (hit && !d.fresh) return jsonSafe_(hit);
  var profs = profMap_(), myPr = profs[mine], my = myPr ? myPr.data : {};
  var mySports = {}; (my.sports || []).forEach(function (s) { if (s && s.name) mySports[s.name] = LEVELS.indexOf(s.level); });
  if (!Object.keys(mySports).length) return { status: "success", users: [], reason: "sports" };
  var mySlots = sp28Slots_(my.avail), hasSlots = Object.keys(mySlots).length > 0, myCity = norm_(my.city || "");
  // âges et comptes confirmés (Comptes : F = naissance, G = pseudo)
  var ages = {}, nm = {};
  rowsOf_(sheet_(SHEET_ACCOUNTS)).forEach(function (r) { var k = sp28Lc_(r[6]); if (!k) return; ages[k] = age_(r[5]); nm[k] = String(r[2] || ""); });
  var myMinor = (ages[mine] || 0) < 18, blk = blocks_(me.pseudo), priv = typeof sp8PrivateSet_ === "function" ? sp8PrivateSet_() : {};
  var fr = typeof sp8FriendState_ === "function" ? sp8FriendState_(me.pseudo) : {}, ver = sp28VerifMap_(), out = [];
  Object.keys(profs).forEach(function (k) {
    if (k === mine) return;
    var pr = profs[k], dd = pr.data || {};
    if (dd.searchable === false || priv[k] || hides_(blk, k) || ages[k] === undefined) return;
    if (((ages[k] || 0) < 18) !== myMinor) return;           // mineurs entre eux, majeurs entre eux
    if (fr[k] === "amis") return;                              // déjà amis : inutile de les suggérer
    var best = null;
    (dd.sports || []).forEach(function (s) {
      if (!s || !(s.name in mySports)) return;
      var a = mySports[s.name], b = LEVELS.indexOf(s.level), gap = a < 0 || b < 0 ? 1 : Math.abs(a - b);
      if (gap > 1) return;
      var sc = 10 - gap * 3;
      if (!best || sc > best.sc) best = { sc: sc, sport: s.name, level: s.level || "" };
    });
    if (!best) return;
    var theirs = sp28Slots_(dd.avail), common = Object.keys(theirs).filter(function (x) { return mySlots[x]; });
    if (hasSlots && Object.keys(theirs).length && !common.length) return;   // aucun créneau en commun
    var score = best.sc + common.length * 2 + (myCity && norm_(dd.city || "") === myCity ? 4 : 0);
    var st = presence_(pr.pseudo, pr); if (st === "online") score += 1;
    out.push({ pseudo: pr.pseudo, name: shownName_({ name: nm[k] }, pr), sport: best.sport, level: best.level, slots: common.slice(0, 3), city: dd.city || "", ver: ver[k] ? 1 : 0, score: score, v: pr.updated });
  });
  out.sort(function (a, b) { return b.score - a.score; });
  out = out.slice(0, SP28.PARTNERS).map(function (u) { delete u.score; return u; });
  var res = { status: "success", users: out, slots: hasSlots };
  try { c.put(ck, JSON.stringify(res), 600); } catch (x) {}
  return res;
}

/* ===================== Actus sportives ===================== */
function sp28Ent_(s) {
  return String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(Number(n)); })
    .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}
function sp28Tag_(x, t) { var m = new RegExp("<" + t + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + t + ">", "i").exec(x); return m ? m[1] : ""; }
/** Lit un flux RSS : titres, source, date, lien. Rien d'autre (pas de texte d'article, pas d'image). */
function sp28ParseRss_(xml, sport) {
  var out = [], parts = String(xml || "").split(/<item[\s>]/i).slice(1);
  parts.forEach(function (x) {
    if (out.length >= SP28.NEWS_PER_SPORT) return;
    var t = sp28Ent_(sp28Tag_(x, "title")), u = sp28Ent_(sp28Tag_(x, "link")), src = sp28Ent_(sp28Tag_(x, "source")), d = Date.parse(sp28Ent_(sp28Tag_(x, "pubDate")));
    if (!t || !/^https:\/\/[^\s"'<>]{8,600}$/.test(u)) return;
    if (src && t.length > src.length + 3 && t.slice(-(src.length + 3)) === " - " + src) t = t.slice(0, -(src.length + 3));
    else if (!src) { var m = / - ([^-]{2,40})$/.exec(t); if (m) { src = m[1]; t = t.slice(0, m.index); } }
    out.push({ s: sport, t: t.slice(0, 180), src: src.slice(0, 40), u: u, d: isFinite(d) ? d : 0 });
  });
  return out;
}
function sp28NewsUrl_(sport) {
  return "https://news.google.com/rss/search?q=" + encodeURIComponent(SP28.NEWS[sport] + " when:7d") + "&hl=fr&gl=FR&ceid=FR:fr";
}
function sp28News_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var lim = rate_("news:" + sp28Lc_(me.pseudo), 120, 3600, "Trop de requêtes. Réessaie plus tard."); if (lim) return err_(lim);
  var sports = sp28CleanFollow_(d.sports).slice(0, 6);
  if (!sports.length) return { status: "success", items: [] };
  var c = CacheService.getScriptCache(), got = {}, miss = [];
  sports.forEach(function (s) { var h = c.get("sp28n1:" + s); if (h) got[s] = jsonSafe_(h).l || []; else miss.push(s); });
  if (miss.length) {
    var reqs = miss.map(function (s) { return { url: sp28NewsUrl_(s), muteHttpExceptions: true, followRedirects: true, headers: { "User-Agent": "Mozilla/5.0 (compatible; Spary/1.0; +https://spary.fr)" } }; });
    var res = [];
    try { res = UrlFetchApp.fetchAll(reqs); } catch (e) { try { console.error("sp28 actus " + e); } catch (x) {} }
    miss.forEach(function (s, i) {
      var r = res[i], list = null;
      try { if (r && r.getResponseCode() === 200) list = sp28ParseRss_(r.getContentText(), s); } catch (e) {}
      if (list && list.length) {
        var js = JSON.stringify({ l: list });
        try { c.put("sp28n1:" + s, js, SP28.NEWS_TTL); c.put("sp28n2:" + s, js, SP28.NEWS_STALE); } catch (x) {}
        got[s] = list;
      } else {
        var st = c.get("sp28n2:" + s); got[s] = st ? jsonSafe_(st).l || [] : [];      // flux indisponible : dernière version connue
      }
    });
  }
  // une actu par sport à tour de rôle (les plus récentes d'abord) pour varier le carrousel
  var lists = sports.map(function (s) { return (got[s] || []).slice().sort(function (a, b) { return b.d - a.d; }); }), items = [], seen = {};
  for (var round = 0; items.length < SP28.NEWS_MAX && round < SP28.NEWS_PER_SPORT; round++) {
    lists.forEach(function (l) { var it = l[round]; if (it && items.length < SP28.NEWS_MAX) { var key = sp28Lc_(it.t).slice(0, 60); if (!seen[key]) { seen[key] = 1; items.push(it); } } });
  }
  return { status: "success", items: items };
}

/* ===================== Connexion avec Apple ===================== */
function sp28Mp_(b, e, m) { var r = BigInt(1); b = b % m; while (e > BigInt(0)) { if (e & BigInt(1)) r = r * b % m; e = e >> BigInt(1); b = b * b % m; } return r; }
function sp28AppleKeys_(force) {
  var c = CacheService.getScriptCache(), hit = force ? null : c.get("sp28jwks");
  if (hit) return jsonSafe_(hit).keys || [];
  var r = UrlFetchApp.fetch("https://appleid.apple.com/auth/keys", { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error("Clés Apple indisponibles");
  var t = r.getContentText(); try { c.put("sp28jwks", t, 21600); } catch (x) {}
  return jsonSafe_(t).keys || [];
}
/** Vérifie un jeton d'identité Apple (RS256). Renvoie les champs du jeton, ou { e: message }. */
function sp28VerifyApple_(jwt, nonce, keysOverride) {
  var parts = String(jwt || "").split(".");
  if (parts.length !== 3) return { e: "Jeton Apple invalide." };
  var head = jsonSafe_(Utilities.newBlob(sp14S8_(sp14UnB64_(parts[0]))).getDataAsString()), body = jsonSafe_(Utilities.newBlob(sp14S8_(sp14UnB64_(parts[1]))).getDataAsString());
  if (head.alg !== "RS256" || !head.kid) return { e: "Jeton Apple invalide." };
  var find = function (keys) { for (var i = 0; i < keys.length; i++) if (keys[i].kid === head.kid && keys[i].kty === "RSA") return keys[i]; return null; };
  var key = keysOverride ? find(keysOverride) : (find(sp28AppleKeys_(false)) || find(sp28AppleKeys_(true)));
  if (!key) return { e: "Clé Apple inconnue." };
  var nb = sp14UnB64_(key.n); while (nb.length && nb[0] === 0) nb.shift();
  var n = sp14Big_(nb), e = sp14Big_(sp14UnB64_(key.e)), s = sp14Big_(sp14UnB64_(parts[2]));
  if (s >= n) return { e: "Signature Apple invalide." };
  var em = sp14Bytes_(sp28Mp_(s, e, n), nb.length);
  var di = [0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20];
  var t = di.concat(sp14Sha_(sp14Utf8_(parts[0] + "." + parts[1]))), ps = nb.length - t.length - 3;
  if (ps < 8) return { e: "Signature Apple invalide." };
  var want = [0, 1]; for (var i = 0; i < ps; i++) want.push(255); want.push(0); want = want.concat(t);
  var diff = 0; for (var j = 0; j < want.length; j++) diff |= (want[j] ^ em[j]);
  if (diff !== 0) return { e: "Signature Apple invalide." };
  var now = Math.floor(Date.now() / 1000), auds = [SP28.BUNDLE], web = sp28Prop_("APPLE_WEB_CLIENT_ID"); if (web) auds.push(web);
  if (body.iss !== SP28.ISS) return { e: "Jeton Apple invalide (émetteur)." };
  if (auds.indexOf(String(body.aud)) < 0) return { e: "Jeton Apple invalide (application)." };
  if (!(Number(body.exp) > now - 60)) return { e: "Jeton Apple expiré : réessaie." };
  if (Number(body.iat) > now + 300) return { e: "Jeton Apple invalide (date)." };
  if (!body.sub) return { e: "Jeton Apple invalide." };
  if (nonce !== null && String(body.nonce || "") !== String(nonce)) return { e: "Jeton Apple invalide (nonce)." };
  return { sub: String(body.sub), aud: String(body.aud), email: sp28Lc_(body.email || ""), verified: body.email_verified === true || body.email_verified === "true", relay: body.is_private_email === true || body.is_private_email === "true" || /@privaterelay\.appleid\.com$/i.test(String(body.email || "")) };
}
function sp28Nonce_() {
  var lim = rate_("an:all", 600, 3600, "Beaucoup de connexions en ce moment. Réessaie dans quelques minutes."); if (lim) return err_(lim);
  var n = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  CacheService.getScriptCache().put("sp28nc:" + n, "1", 600);
  return { status: "success", nonce: n };
}
function sp28TakeNonce_(n) {
  n = String(n || ""); if (!/^[a-f0-9]{64}$/.test(n)) return false;
  var c = CacheService.getScriptCache(), k = "sp28nc:" + n; if (!c.get(k)) return false;
  c.remove(k); return true;
}
function sp28AppleRow_(sub) {
  var v = sp28ShApple_().getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === String(sub)) return { at: i + 1, r: v[i] };
  return null;
}
function sp28AppleOf_(pseudo) {
  var p = sp28Lc_(pseudo), v = rowsOf_(sp28ShApple_());
  for (var i = 0; i < v.length; i++) if (sp28Lc_(v[i][1]) === p) return { sub: String(v[i][0]), at: i + 2, r: v[i] };
  return null;
}
/* -- clé facultative pour échanger le code d'autorisation et révoquer l'accès à la suppression du compte -- */
function sp28KeyD_() {
  var pem = sp28Prop_("APPLE_P8"); if (!pem) return null;
  var b = sp14U8_(Utilities.base64Decode(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "")));
  for (var i = 0; i + 37 <= b.length; i++) if (b[i] === 2 && b[i + 1] === 1 && b[i + 2] === 1 && b[i + 3] === 4 && b[i + 4] === 32) return b.slice(i + 5, i + 37);
  return null;
}
function sp28ClientSecret_(clientId) {
  var team = sp28Prop_("APPLE_TEAM_ID"), kid = sp28Prop_("APPLE_KEY_ID"), d = sp28KeyD_();
  if (!team || !kid || !d) return "";
  var now = Math.floor(Date.now() / 1000);
  var head = sp14B64_(sp14Utf8_(JSON.stringify({ alg: "ES256", kid: kid }))), body = sp14B64_(sp14Utf8_(JSON.stringify({ iss: team, iat: now, exp: now + 3000, aud: SP28.ISS, sub: clientId })));
  return head + "." + body + "." + sp14B64_(SP14_EC.sign(d, sp14Utf8_(head + "." + body)));
}
function sp28Exchange_(code, clientId) {
  try {
    code = String(code || ""); if (!code || code.length > 600) return "";
    var cs = sp28ClientSecret_(clientId); if (!cs) return "";
    var r = UrlFetchApp.fetch(SP28.ISS + "/auth/token", { method: "post", muteHttpExceptions: true, payload: { client_id: clientId, client_secret: cs, code: code, grant_type: "authorization_code" } });
    if (r.getResponseCode() !== 200) { console.warn("Apple token " + r.getResponseCode() + " " + String(r.getContentText()).slice(0, 160)); return ""; }
    return String(jsonSafe_(r.getContentText()).refresh_token || "");
  } catch (e) { return ""; }
}
function sp28Revoke_(rt, clientId) {
  try {
    if (!rt) return;
    var cs = sp28ClientSecret_(clientId || SP28.BUNDLE); if (!cs) return;
    UrlFetchApp.fetch(SP28.ISS + "/auth/revoke", { method: "post", muteHttpExceptions: true, payload: { client_id: clientId || SP28.BUNDLE, client_secret: cs, token: rt, token_type_hint: "refresh_token" } });
  } catch (e) {}
}
function sp28Login_(pseudo, name) {
  var acc = accountByKey_(pseudo);
  if (!acc) return err_("Compte introuvable.");
  if (isBanned_(acc.pseudo)) return err_(MSG_SUSPENDED);
  return sp8Locked_(function () {
    try {
      var sh = sheet_(SHEET_ACCOUNTS), last = new Date(sh.getRange(acc.row, 12).getValue()).getTime();
      if (!last || Date.now() - last > 72000000) sh.getRange(acc.row, 12).setValue(new Date());   // « dernière connexion » (purge des comptes inactifs)
    } catch (x) {}
    try { purgeExpiredSessions_(); } catch (x) {}
    return { status: "success", token: createSession_(acc.pseudo, acc.name || name || ""), user: { name: acc.name || name || "", pseudo: acc.pseudo } };
  });
}
function sp28MaskMail_(m) { m = String(m || ""); var i = m.indexOf("@"); return i > 1 ? m.charAt(0) + "•••" + m.slice(i) : m; }
function sp28AppleAuth_(d) {
  var lim = rate_("aa:all", 300, 3600, "Beaucoup de connexions en ce moment. Réessaie dans quelques minutes."); if (lim) return err_(lim);
  if (!sp28TakeNonce_(d.nonce)) return err_("La connexion a expiré. Réessaie.");
  var t = sp28VerifyApple_(d.identityToken, d.nonce);
  if (t.e) return err_(t.e);
  var link = sp28AppleRow_(t.sub);
  if (link) return sp28Login_(String(link.r[1]));
  var rt = sp28Exchange_(d.authorizationCode, t.aud);
  if (t.email) {
    var acc = accountByKey_(t.email);
    if (acc) {
      if (!acc.verified || !t.verified) return err_("Un compte Spary utilise déjà cette adresse. Connecte-toi avec ton mot de passe, puis relie Apple dans Paramètres → Compte.");
      sp8Locked_(function () { if (!sp28AppleRow_(t.sub)) sp28ShApple_().appendRow([t.sub, acc.pseudo, Date.now(), safe_(t.email), t.relay ? "oui" : "non", rt]); });
      CacheService.getScriptCache().remove("sp28ver");
      return sp28Login_(acc.pseudo);
    }
  }
  // nouveau membre : il choisit son pseudo et sa date de naissance dans l'appli
  var ticket = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  CacheService.getScriptCache().put("sp28tk:" + ticket, JSON.stringify({ sub: t.sub, email: t.email, relay: t.relay, rt: rt, first: clip_(d.givenName, 40), last: clip_(d.familyName, 40) }), 1800);
  return { status: "success", need: "signup", ticket: ticket, firstName: clip_(d.givenName, 40), lastName: clip_(d.familyName, 40), email: t.email ? (t.relay ? "Adresse masquée par Apple" : sp28MaskMail_(t.email)) : "" };
}
function sp28AppleRegister_(e, d, prev) {
  var c = CacheService.getScriptCache(), raw = c.get("sp28tk:" + String(d.ticket || "").replace(/[^a-f0-9]/g, ""));
  if (!raw) return err_("La connexion avec Apple a expiré. Recommence depuis « Continuer avec Apple ».");
  var tk = jsonSafe_(raw);
  if (!tk.email) return err_("Apple n'a pas transmis d'adresse e-mail. Dans Réglages → Identifiant Apple → Connexion avec Apple, retire Spary puis réessaie.");
  if (sp28AppleRow_(tk.sub)) return err_("Ce compte Apple est déjà relié. Reviens en arrière et touche « Continuer avec Apple ».");
  var pw = "Ap" + (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").slice(0, 30) + "!9";   // inutilisable : la connexion se fait par Apple (ou « mot de passe oublié »)
  var payload = { action: "register", lastName: clip_(d.lastName || tk.last, 60), firstName: clip_(d.firstName || tk.first, 60), email: tk.email, phone: "", birthDate: String(d.birthDate || "").slice(0, 10),
    pseudo: String(d.pseudo || "").trim(), password: pw, newsletter: !!d.newsletter, consent: d.consent === true, club: String(d.club || ""), source: String(d.source || "") };
  var fake = { postData: { contents: JSON.stringify(payload), type: "application/json", length: 0 }, parameter: {}, parameters: {} };
  var mailFn = typeof mailOn_ === "function" ? mailOn_ : null, res = null;
  try { if (mailFn) mailOn_ = function () { return false; }; res = sp8Parse_(prev(fake)); }   // pas d'e-mail « confirme ton adresse » : Apple l'a déjà vérifiée
  finally { if (mailFn) mailOn_ = mailFn; }
  if (!res || res.status !== "success") return res || err_("Création du compte impossible pour le moment.");
  sp8After_(function () {
    var acc = accountByKey_(res.user.pseudo);
    if (acc && !acc.verified) { var sh = sheet_(SHEET_ACCOUNTS); sh.getRange(acc.row, 13).setValue(new Date()); try { if (!sh.getRange(1, 13).getValue()) sh.getRange(1, 13).setValue("E-mail vérifié"); } catch (x) {} }
    if (!sp28AppleRow_(tk.sub)) sp28ShApple_().appendRow([tk.sub, res.user.pseudo, Date.now(), safe_(tk.email), tk.relay ? "oui" : "non", tk.rt || ""]);
  });
  c.remove("sp28tk:" + String(d.ticket)); c.remove("sp28ver");
  res.apple = true;
  return res;
}
function sp28AppleLink_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  if (!sp28TakeNonce_(d.nonce)) return err_("La connexion a expiré. Réessaie.");
  var t = sp28VerifyApple_(d.identityToken, d.nonce);
  if (t.e) return err_(t.e);
  var rt = sp28Exchange_(d.authorizationCode, t.aud);
  return sp8Locked_(function () {
    var row = sp28AppleRow_(t.sub);
    if (row && sp28Lc_(row.r[1]) !== sp28Lc_(me.pseudo)) return err_("Ce compte Apple est déjà relié à un autre compte Spary.");
    if (sp28AppleOf_(me.pseudo) && !row) return err_("Un autre compte Apple est déjà relié à ton compte.");
    if (!row) sp28ShApple_().appendRow([t.sub, me.pseudo, Date.now(), safe_(t.email), t.relay ? "oui" : "non", rt]);
    CacheService.getScriptCache().remove("sp28ver");
    return { status: "success" };
  });
}
function sp28AppleUnlink_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var acc = accountByKey_(me.pseudo);
  return sp8Locked_(function () {
    var a = sp28AppleOf_(me.pseudo); if (!a) return { status: "success" };
    if (acc && /@privaterelay\.appleid\.com$/i.test(acc.email)) return err_("Ton compte utilise l'adresse masquée d'Apple : change d'abord d'adresse e-mail en nous écrivant, sinon tu ne pourrais plus te connecter.");
    sp28Revoke_(String(a.r[5] || ""));
    sp28ShApple_().deleteRow(a.at);
    CacheService.getScriptCache().remove("sp28ver");
    return { status: "success" };
  });
}

/* ===================== RGPD : export et suppression ===================== */
function sp28Export_(pseudo, out) {
  var r = sp28PrefRow_(pseudo); if (r) out.parcours = r.data;
  var a = sp28AppleOf_(pseudo);
  if (a) out.connexion_apple = { identifiant_apple: String(a.r[0]), lie_le: new Date(Number(a.r[2])).toISOString(), email_apple: String(a.r[3] || ""), relais_apple: String(a.r[4] || "") };
}
function sp28DeleteUser_(pseudo) {
  var p = sp28Lc_(pseudo);
  rewriteRows_(sp28ShPrefs_(), function (r) { return sp28Lc_(r[0]) === p ? null : r; });
  rewriteRows_(sp28ShApple_(), function (r) { if (sp28Lc_(r[1]) !== p) return r; sp28Revoke_(String(r[5] || "")); return null; });
  var c = CacheService.getScriptCache(); c.remove("sp28ver"); c.remove("sp28p:" + p);
}

/* ===================== Installation ===================== */
function sp28Install_() {
  if (SP28.installed || typeof doPost !== "function" || typeof SP8 === "undefined" || !SP8.installed || typeof SP14_EC === "undefined") return;
  SP28.installed = true;
  var prev = doPost;
  var handle = function (e, data) {
    switch (data.action) {
      case "onb19Get":        return out_(sp28OnbGet_(data));
      case "onb19Save":       return out_(sp28OnbSave_(data));
      case "verif19":         return out_(sp28Verif_(data));
      case "partners19":      return out_(sp28Partners_(data));
      case "news19":          return out_(sp28News_(data));
      case "appleNonce19":    return out_(sp28Nonce_());
      case "appleAuth19":     return out_(sp28AppleAuth_(data));
      case "appleRegister19": return out_(sp28AppleRegister_(e, data, prev));
      case "appleLink19":     return out_(sp28AppleLink_(data));
      case "appleUnlink19":   return out_(sp28AppleUnlink_(data));
      case "profileSave":     var r = prev(e), pr = sp8Parse_(r); if (pr && pr.status === "success") { var c = CacheService.getScriptCache(); c.remove("sp28ver"); } return r;
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
      try { console.error("sp28 " + m + " | " + (err && err.stack || "")); } catch (x) {}
      r = out_({ status: "error", message: /lock/i.test(m) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
    return r || prev(e);
  };
  var baseDelete = deleteAccountData_;
  deleteAccountData_ = function (pseudo) { baseDelete(pseudo); try { sp28DeleteUser_(pseudo); } catch (x) {} };
  var baseExport = accountExport_;
  accountExport_ = function (d) {
    var r = baseExport(d);
    try { if (r && r.status === "success" && r.data && r.data.pseudo) sp28Export_(r.data.pseudo, r.data); } catch (x) {}
    return r;
  };
}
sp28Install_();

/** À exécuter une fois dans l'éditeur pour vérifier l'installation (et accorder l'accès aux services externes). */
function sp28Verifier() {
  if (!SP28.installed) return console.log("PROBLÈME : le fichier Parcours doit être placé SOUS Performances (et au-dessus de Rgpd et Securite). sp8Verifier doit afficher OK.");
  sp28ShPrefs_(); sp28ShApple_();
  var k = 0; try { k = sp28AppleKeys_(true).length; } catch (e) { console.log("Clés Apple : " + e); }
  var n = 0; try { n = sp28ParseRss_(UrlFetchApp.fetch(sp28NewsUrl_("Padel"), { muteHttpExceptions: true }).getContentText(), "Padel").length; } catch (e) { console.log("Actus : " + e); }
  console.log("OK : parcours, partenaires, actus et badge actifs. Pense à publier une Nouvelle version du déploiement.");
  console.log("Connexion avec Apple : " + (k ? k + " clés Apple lues" : "clés Apple illisibles (réessaie plus tard)") + ". Révocation à la suppression : " + (sp28ClientSecret_(SP28.BUNDLE) ? "prête" : "facultative, non configurée (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_P8)") + ".");
  console.log("Actus : " + (n ? n + " titres lus pour le padel" : "flux indisponible pour l'instant") + ".");
}

