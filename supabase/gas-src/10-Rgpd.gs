/**
 * Spary : durées de conservation appliquées automatiquement (audit RGPD du 20/10/2026).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Rgpd », coller ce code.
 * Le placer juste AU-DESSUS de Securite (Securite doit rester le dernier fichier). Ne modifier aucun autre fichier.
 *  1. Exécuter rgpdSimuler : le journal affiche ce qui SERAIT fait, sans rien toucher.
 *  2. Exécuter rgpdInstaller une fois : passage automatique chaque nuit à 4 h.
 * Pas besoin de nouveau déploiement (rien n'est appelé par le site).
 *
 * Ce que ça fait chaque nuit (promesses de la politique de confidentialité) :
 *  1. Comptes inactifs : 30 jours avant les 3 ans sans connexion, e-mail « ton compte sera supprimé dans 30 jours ».
 *     Si la personne ne se reconnecte pas, compte et données supprimés (deleteAccountData_ complet, tous fichiers).
 *     Avant ce fichier, purgeInactive() existait mais devait être lancée à la main.
 *  2. Signalements de plus de 12 mois : le signaleur est remplacé par une empreinte anonyme, détails et extrait
 *     effacés. La ligne reste pour que le contenu retiré reste masqué.
 *  3. Recours de plus de 12 mois : supprimés (le texte seul est effacé pour une absence acceptée, qui doit rester annulée).
 *  4. Alertes dernière minute envoyées depuis plus de 30 jours : supprimées.
 *  5. Liens « Prévenir un proche » expirés : supprimés.
 *
 * Aucun secret dans ce fichier. Au plus 20 suppressions de comptes et 50 e-mails par nuit.
 */

var RGPD = {
  YEARS: 3,
  WARN_DAYS: 30,
  REPORT_DAYS: 365,
  APPEAL_DAYS: 365,
  ALERT_DAYS: 30,
  MAX_DELETES: 20,
  MAX_MAILS: 50,
  PROP: "RGPD_AVERTIS"     // { pseudo en minuscules : date de l'e-mail (ms) }
};

function rgpdInstaller() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "rgpdQuotidien") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("rgpdQuotidien").timeBased().everyDays(1).atHour(4).inTimezone("Europe/Paris").create();
  console.log("OK : purge RGPD installée (chaque nuit vers 4 h). Lance rgpdSimuler pour voir ce qu'elle ferait aujourd'hui.");
}

/** Montre ce qui serait fait, sans rien modifier ni envoyer. */
function rgpdSimuler() { rgpdQuotidien(true); }

function rgpdQuotidien(dry) {
  dry = dry === true;
  var lock = null, log = [];
  if (!dry) { lock = LockService.getScriptLock(); lock.waitLock(30000); }
  try {
    try { log.push(rgpdComptes_(dry)); } catch (x) { log.push("comptes : ERREUR " + (x && x.message || x)); }
    try { log.push(rgpdSignalements_(dry)); } catch (x) { log.push("signalements : ERREUR " + (x && x.message || x)); }
    try { log.push(rgpdRecours_(dry)); } catch (x) { log.push("recours : ERREUR " + (x && x.message || x)); }
    try { log.push(rgpdAlertes_(dry)); } catch (x) { log.push("alertes : ERREUR " + (x && x.message || x)); }
    try { log.push(rgpdPartages_(dry)); } catch (x) { log.push("partages : ERREUR " + (x && x.message || x)); }
  } finally { if (lock) lock.releaseLock(); }
  console.log((dry ? "SIMULATION (rien n'a été modifié)\n" : "") + log.join("\n"));
}

/* ---------- 1. Comptes inactifs ---------- */
function rgpdTime_(v) {
  if (v instanceof Date) return v.getTime();
  if (Number(v) > 1e11) return Number(v);
  var t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}
function rgpdComptes_(dry) {
  var now = Date.now(), day = 86400000;
  var limit = now - RGPD.YEARS * 365 * day, warnAt = limit + RGPD.WARN_DAYS * day;
  var props = PropertiesService.getScriptProperties(), warned = {};
  try { warned = JSON.parse(props.getProperty(RGPD.PROP) || "{}"); } catch (x) {}
  var sh = sheet_(SHEET_ACCOUNTS), rows = sh.getDataRange().getValues(), toDelete = [], mails = 0, back = 0, seen = {};
  for (var i = 1; i < rows.length; i++) {
    var pseudo = String(rows[i][6] || "").trim(); if (!pseudo) continue;
    var p = pseudo.toLowerCase(); seen[p] = 1;
    var last = rgpdTime_(rows[i][11]) || rgpdTime_(rows[i][0]);
    if (!last) continue;                                                   // date illisible : on ne touche à rien
    if (last >= warnAt) { if (warned[p]) { delete warned[p]; back++; } continue; }   // revenu, ou pas encore concerné
    if (!warned[p]) {
      if (mails >= RGPD.MAX_MAILS) continue;
      mails++;
      if (!dry) { rgpdPrevenir_(String(rows[i][3] || ""), String(rows[i][2] || "")); warned[p] = now; }
      continue;
    }
    if (last < limit && now - warned[p] >= RGPD.WARN_DAYS * day && toDelete.length < RGPD.MAX_DELETES) toDelete.push(pseudo);
  }
  Object.keys(warned).forEach(function (k) { if (!seen[k]) delete warned[k]; });  // comptes déjà supprimés
  if (!dry) {
    toDelete.forEach(function (ps) {
      deleteAccountData_(ps);
      var r2 = sh.getDataRange().getValues();
      for (var j = r2.length - 1; j >= 1; j--) if (String(r2[j][6]).toLowerCase() === ps.toLowerCase()) { sh.deleteRow(j + 1); break; }
      delete warned[ps.toLowerCase()];
    });
    props.setProperty(RGPD.PROP, JSON.stringify(warned));
  }
  return "comptes : " + mails + " e-mail(s) de prévenance, " + toDelete.length + " compte(s) supprimé(s), " + back + " compte(s) revenu(s).";
}
function rgpdPrevenir_(email, prenom) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof mail_ !== "function") return false;
  var url = mailProp_("SITE_URL", "https://spary.fr").replace(/\/+$/, "") + "/";
  var intro = (prenom ? "Bonjour " + prenom + ", tu" : "Tu") + " ne t'es pas connecté(e) à Spary depuis près de 3 ans. Comme prévu par notre politique de confidentialité, ton compte et tes données seront supprimés dans 30 jours.";
  var outro = "Pour garder ton compte, il suffit de te connecter avant cette date. Sinon, tu n'as rien à faire.";
  return mail_(email, "Ton compte Spary sera supprimé dans 30 jours",
    mailLayout_("Ton compte Spary va être supprimé", intro, "Me connecter", url, outro),
    intro + "\n\n" + outro + "\n" + url);
}

/* ---------- 2. Signalements ---------- */
function rgpdAnon_(pseudo) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, "spary-rgpd|" + String(pseudo).toLowerCase(), Utilities.Charset.UTF_8);
  return "anonyme-" + Utilities.base64EncodeWebSafe(d).slice(0, 10);
}
function rgpdSignalements_(dry) {
  var sh = sheetIf_(SH_REPORTS); if (!sh) return "signalements : onglet absent.";
  var lim = Date.now() - RGPD.REPORT_DAYS * 86400000, n = 0;
  var fn = function (r) {
    if (!r[0] || !(Number(r[1]) < lim) || /^anonyme-/.test(String(r[2]))) return r;
    n++; var o = r.slice(); o[2] = rgpdAnon_(r[2]); o[7] = ""; o[8] = ""; return o;
  };
  if (dry) rowsOf_(sh).forEach(fn); else { rewriteRows_(sh, fn); CacheService.getScriptCache().remove("hid:all"); }
  return "signalements : " + n + " anonymisé(s) (plus de 12 mois).";
}

/* ---------- 3. Recours ---------- */
function rgpdRecours_(dry) {
  var sh = sheetIf_("Recours"); if (!sh) return "recours : onglet absent.";
  var lim = Date.now() - RGPD.APPEAL_DAYS * 86400000, del = 0, blank = 0;
  var fn = function (r) {
    if (!(Number(r[0]) < lim)) return r;
    var accepted = r[2] === "absence" && /^(accepte|acceptee|valide|validee|ok)$/.test(norm_(r[5]).trim());
    if (accepted) { if (!String(r[4])) return r; blank++; var o = r.slice(); o[4] = ""; return o; }
    del++; return null;
  };
  if (dry) rowsOf_(sh).forEach(fn); else rewriteRows_(sh, fn);
  return "recours : " + del + " supprimé(s), " + blank + " texte(s) effacé(s) (plus de 12 mois).";
}

/* ---------- 4. Alertes dernière minute envoyées ---------- */
function rgpdAlertes_(dry) {
  var sh = sheetIf_("AlertesEnvoyees"); if (!sh) return "alertes : onglet absent.";
  var lim = Date.now() - RGPD.ALERT_DAYS * 86400000, n = 0;
  var fn = function (r) { if (Number(r[0]) < lim) { n++; return null; } return r; };
  if (dry) rowsOf_(sh).forEach(fn); else rewriteRows_(sh, fn);
  return "alertes : " + n + " supprimée(s) (plus de 30 jours).";
}

/* ---------- 5. Liens « Prévenir un proche » expirés ---------- */
function rgpdPartages_(dry) {
  var sh = sheetIf_("PartagesProches"); if (!sh) return "partages : onglet absent.";
  var lim = Date.now() - 86400000, n = 0;
  var fn = function (r) { if (Number(r[3]) && Number(r[3]) < lim) { n++; return null; } return r; };
  if (dry) rowsOf_(sh).forEach(fn); else rewriteRows_(sh, fn);
  return "partages : " + n + " lien(s) expiré(s) supprimé(s).";
}

