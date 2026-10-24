/**
 * Spary lot 23 : autorise le « post libre » (type "Post", façon LinkedIn/X).
 * Fichier séparé : ne rien changer dans Code.gs.
 * À placer SOUS Code.gs dans la liste des fichiers (c'est le cas par défaut quand on crée un fichier).
 */
try {
  if (typeof POST_TYPES !== "undefined" && POST_TYPES.indexOf("Post") < 0) POST_TYPES.push("Post");
} catch (e) { console.error("Posts.gs : " + e); }

