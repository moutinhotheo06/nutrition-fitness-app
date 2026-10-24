// Balayage : chaque action du site, avec une session valide et des paramètres vides.
// On cherche les plantages du moteur (pas les refus normaux du code).
import fs from "node:fs";
import { call, reset, sql } from "./harness.ts";
await reset();
const a = await call({ action: "register", lastName: "Martin", firstName: "Léa", email: "lea@test.fr", phone: "", birthDate: "2000-05-12", pseudo: "lea_m", password: "Motdepasse!2026", consent: true });
await call({ action: "register", lastName: "Durand", firstName: "Tom", email: "tom@test.fr", phone: "", birthDate: "1995-01-02", pseudo: "tomd", password: "Autremotdepasse!9", consent: true });
const acts = fs.readFileSync(new URL("./actions.txt", import.meta.url), "utf8").split("\n").filter(Boolean);
const crash: string[] = [];
for (const act of acts) {
  if (["logout", "accountDelete"].includes(act)) continue;
  const r = await call({ action: act, token: a.token, pseudo: "tomd", to: "tomd", id: "1", since: 0 }).catch((e) => ({ status: "EXC", message: String(e) }));
  if (r.status === "EXC" || /Erreur serveur|inconnue/.test(r.message || "") || r.raw !== undefined) crash.push(act + " → " + JSON.stringify(r).slice(0, 200));
}
console.log("\n=== Plantages (" + crash.length + "/" + acts.length + ") ===\n" + crash.join("\n"));
await sql.end();
