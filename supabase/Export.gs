/**
 * À coller dans le projet « Spary_migration » (nouveau fichier Export.gs).
 * Lit le code du projet Apps Script du site (lecture seule) et le range dans
 * un fichier « spary-code-export.txt » de ton Drive. Ne modifie rien.
 *
 * Avant : script.google.com/home/usersettings → « API Google Apps Script » = Activé.
 * Script Property à ajouter : SITE_SCRIPT_ID = l'ID du projet du site
 * (projet du site → Paramètres du projet → « ID du script »).
 */
function exporterCode() {
  var id = PropertiesService.getScriptProperties().getProperty("SITE_SCRIPT_ID");
  if (!id) throw new Error("Ajoute la Script Property SITE_SCRIPT_ID.");
  var r = UrlFetchApp.fetch("https://script.googleapis.com/v1/projects/" + encodeURIComponent(id) + "/content", {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) throw new Error("Erreur " + r.getResponseCode() + " : " + r.getContentText().slice(0, 300));
  var files = JSON.parse(r.getContentText()).files || [], out = [];
  files.forEach(function (f, i) {
    out.push("=====FICHIER " + (i + 1) + " : " + f.name + " (" + f.type + ")=====\n" + (f.source || ""));
  });
  var file = DriveApp.createFile("spary-code-export.txt", out.join("\n\n"), "text/plain");
  Logger.log(files.length + " fichiers exportés : " + files.map(function (f) { return f.name; }).join(", "));
  Logger.log("Fichier : " + file.getUrl());
}
