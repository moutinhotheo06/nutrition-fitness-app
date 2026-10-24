// Banc d'essai local : le moteur + le vrai code .gs, sur un Postgres local.
import postgres from "postgres";
import { runGas } from "../functions/api/gas/engine.ts";
import { CODE } from "../functions/api/gas/bundle.ts";

export const sql = postgres(process.env.PGURL || "postgres://postgres@localhost:5499/gastest", { max: 4, onnotice: () => {} });
const ENV: Record<string, string> = { GAS_PEPPER: "poivre-de-test-123456789", ...(process.env.TEST_ENV_FILE ? JSON.parse(require("fs").readFileSync(process.env.TEST_ENV_FILE, "utf8")) : {}) };
export const env = (k: string) => ENV[k] || "";
export async function reset() {
  await sql`truncate gas_sheets, gas_blobs, gas_props, gas_cache, gas_files, gas_history`;
  await sql`insert into gas_sheets (name, pos, data) values ('Feuille 1', 0, ${sql.json([["Date inscritpion","Nom","Prénom","Email","Téléphone","Date de naissance","Pseudo","Mot de passe","Newsletter","Consentement","","Dernière connexion","E-mail vérifié"]])})`;
}
export async function call(body: Record<string, unknown>, verbose = false) {
  const t = Date.now();
  const r = await runGas({ sql, code: CODE, env, scriptUrl: "http://local/api" }, { kind: "post", body: JSON.stringify(body), action: String(body.action) });
  let j: any; try { j = JSON.parse(r.out); } catch { j = { raw: r.out }; }
  if (verbose || j.status !== "success") console.log(`  [${body.action}] ${Date.now() - t} ms, ${r.attempts} essai(s)`, JSON.stringify(j).slice(0, 300), r.logs.length ? "\n   logs: " + r.logs.slice(-3).join(" | ").slice(0, 300) : "");
  return j;
}
