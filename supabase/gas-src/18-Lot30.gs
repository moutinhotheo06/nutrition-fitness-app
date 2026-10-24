/**
 * Spary · Lot 30 : notifications quand on te mentionne (@pseudo), quand on répond à ton commentaire
 * et quand on commente ton annonce.
 * OÙ : nouveau fichier « Lot30 » (+ → Script), TOUT EN BAS de la liste (sous Lot29, ou sous Lot28 si Lot29 n'est pas là).
 * Ne modifie aucun autre fichier. Puis exécuter lot30Verifier (doit afficher « OK »), puis Déployer → Nouvelle version.
 * Aucune donnée nouvelle : les notifications passent par la file existante (onglet PushFile).
 */
var L30 = { installed: false, MAX: 10 };

function l30Lc_(s) { return String(s == null ? "" : s).toLowerCase(); }
function l30Tab_(n) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }
function l30Rows_(n) { var sh = l30Tab_(n); return sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues() : []; }
function l30Ats_(t) { var o = [], re = /@([A-Za-z0-9_.-]{3,20})/g, m; while ((m = re.exec(String(t || "")))) if (o.indexOf(l30Lc_(m[1])) < 0) o.push(l30Lc_(m[1])); return o; }
function l30Ok_(me, p) {
  var a = findAccount_(p); if (!a || l30Lc_(a.pseudo) === l30Lc_(me)) return "";
  try { if (isBanned_(a.pseudo) || hides_(blocks_(me), a.pseudo) || hides_(blocks_(a.pseudo), me)) return ""; } catch (x) {}
  return a.pseudo;
}
function l30Cut_(t) { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > 90 ? t.slice(0, 89) + "…" : t; }

/** Prépare les notifications d'une annonce ou d'un commentaire réussi. */
function l30On_(data, res) {
  var me = sessionUser_(data.token); if (!me) return;
  var who = sp14Name_(me), sent = {}, n = 0;
  var send = function (p, title, body, url, subj, gap) {
    var k = l30Lc_(p); if (!p || sent[k] || n >= L30.MAX) return; sent[k] = 1; n++;
    sp14Queue_([p], { title: title, body: body, url: url, subject: subj }, gap ? { gap: gap, except: me.pseudo } : { except: me.pseudo });
  };
  if (data.action === "postCreate") {
    var pid = String(res.id || ""); if (!pid) return;
    l30Ats_(String(data.title || "") + " " + String(data.text || "")).forEach(function (p) {
      send(l30Ok_(me.pseudo, p), "Tu es identifié·e", who + " t'a identifié·e : « " + l30Cut_(data.title || data.text) + " »", "./#post=" + pid, "men:" + pid);
    });
    return;
  }
  var id = String(data.id || ""), txt = String(data.text || ""), author = "", title = "", cm = {};
  l30Rows_("Annonces").forEach(function (r) { if (String(r[0]) === id) { author = String(r[1]); title = String(r[4] || r[5] || ""); } });
  l30Rows_("Commentaires").forEach(function (r) { if (String(r[1]) === id) cm[l30Lc_(r[2])] = 1; });
  var url = "./#post=" + id, ats = l30Ats_(txt), first = (txt.match(/^\s*@([A-Za-z0-9_.-]{3,20})/) || [])[1];
  if (first && cm[l30Lc_(first)]) send(l30Ok_(me.pseudo, first), "Nouvelle réponse", who + " a répondu à ton commentaire : « " + l30Cut_(txt) + " »", url, "rep:" + id);
  ats.forEach(function (p) { send(l30Ok_(me.pseudo, p), "Tu es mentionné·e", who + " t'a mentionné·e : « " + l30Cut_(txt) + " »", url, "men:" + id); });
  if (author) send(l30Ok_(me.pseudo, author), "Nouveau commentaire", who + " a commenté « " + l30Cut_(title) + " » : " + l30Cut_(txt), url, "cmt:" + id, 60);
}

function l30Install_() {
  if (L30.installed || typeof doPost !== "function" || typeof sp14Queue_ !== "function" || typeof sessionUser_ !== "function") return;
  L30.installed = true;
  var prev = doPost, sec = typeof SEC !== "undefined" && SEC && SEC.installed && SEC.wrapper === doPost;
  doPost = function (e) {
    var out = prev(e), data = null;
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (!data || (data.action !== "postCreate" && data.action !== "postComment")) return out;
    try {
      var res = sp8Parse_(out);
      if (res && res.status === "success") { sp8After_(function () { l30On_(data, res); }); sp14Flush_(); }
    } catch (x) { try { console.error("lot30 " + (x && x.stack || x)); } catch (y) {} }
    return out;
  };
  if (sec) SEC.wrapper = doPost;
}
l30Install_();

/** Vérifie l'installation (lecture seule). */
function lot30Verifier() {
  if (!L30.installed) return console.log("PROBLÈME : Lot30 n'est pas chargé. Place-le tout en bas de la liste des fichiers.");
  var a = l30Tab_("Annonces"), c = l30Tab_("Commentaires");
  if (!a || !c) return console.log("PROBLÈME : onglet " + (!a ? "Annonces" : "Commentaires") + " introuvable.");
  console.log("Colonnes Commentaires : " + c.getRange(1, 1, 1, 6).getValues()[0].join(" | "));
  console.log("OK : notifications actives (mention @, réponse à un commentaire, commentaire sur ton annonce).");
}
