/**
 * Spary lot 24 : séance « avec quelqu'un » façon Insta.
 * Avant : seul un ami Spary pouvait être ajouté à une séance.
 * Maintenant : n'importe quel membre (ami ou non). Il reçoit toujours une demande et doit confirmer,
 * comme avant. Les membres bloqués restent impossibles à ajouter.
 * Fichier séparé : ne rien changer dans Code.gs ni dans Performances.
 * Il doit être PLUS BAS que « Performances » dans la liste des fichiers (c'est le cas quand on le crée en dernier) :
 * Apps Script garde la dernière version d'une fonction, celle-ci remplace donc l'ancienne.
 */
function sp26Friend_(me, other) {
  var acc = findAccount_(sp8Pseudo_(other));
  if (!acc) return { e: "Ce membre n'existe pas." };
  if (sp26Lc_(acc.pseudo) === sp26Lc_(me)) return { e: "Tu ne peux pas t'ajouter toi-même." };
  if (typeof isBanned_ === "function" && isBanned_(acc.pseudo)) return { e: "Impossible d'ajouter ce membre." };
  var bl = blocks_(me); if (hides_(bl, acc.pseudo)) return { e: "Impossible d'ajouter ce membre." };
  try { if (hides_(blocks_(acc.pseudo), me)) return { e: "Impossible d'ajouter ce membre." }; } catch (e) {}
  return { acc: acc };
}

