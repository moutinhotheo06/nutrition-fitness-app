/**
 * Spary : relais vers Supabase. À AJOUTER SEULEMENT LE JOUR DE LA BASCULE, juste après la copie finale.
 *
 * Pourquoi : certains téléphones gardent quelques heures l'ancienne version du site, qui appelle encore
 * Apps Script. Avec ce fichier, Apps Script ne lit ni n'écrit plus rien dans la feuille : il transmet
 * chaque demande telle quelle à Supabase et renvoie sa réponse. Aucune donnée ne se perd.
 *
 * INSTALLATION : « + » → Script → nommer le fichier « Relais », coller ce code. Il doit être le DERNIER
 * fichier de la liste (c'est le cas par défaut). Ne modifier aucun autre fichier.
 * Puis Déployer → Gérer les déploiements → crayon → Nouvelle version.
 * Vérification : exécuter relaisVerifier (le journal doit afficher « OK »).
 * Aucun secret dans ce fichier.
 */
var RELAIS_URL = "https://chaqyhfkccjpzqcmxpfg.supabase.co/functions/v1/api";

doPost = function (e) {
  var body = e && e.postData ? e.postData.contents : "";
  try {
    var r = UrlFetchApp.fetch(RELAIS_URL, {
      method: "post", contentType: "text/plain;charset=utf-8", payload: body,
      headers: { Origin: "https://spary.fr" }, muteHttpExceptions: true
    });
    return ContentService.createTextOutput(r.getContentText()).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    try { console.error("relais " + (err && err.message || err)); } catch (x) {}
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Serveur occupé, réessayez dans quelques secondes." }))
      .setMimeType(ContentService.MimeType.JSON);
  }
};

function relaisVerifier() {
  var r = UrlFetchApp.fetch(RELAIS_URL, { method: "post", contentType: "text/plain;charset=utf-8", payload: JSON.stringify({ action: "session", token: "test" }), muteHttpExceptions: true });
  console.log(r.getResponseCode() === 200 && /status/.test(r.getContentText())
    ? "OK : les demandes partent vers Supabase (" + r.getContentText().slice(0, 80) + ")."
    : "PROBLÈME : Supabase répond " + r.getResponseCode() + " " + r.getContentText().slice(0, 150));
}
