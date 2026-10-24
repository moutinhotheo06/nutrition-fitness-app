// Spary API (Edge Function « api ») : le code Apps Script de Spary, tel quel, sur Postgres.
// Le site envoie, comme avant, un POST texte {action, token, …} ; la réponse JSON est identique.
// Déployée sans vérification JWT (voir config.toml).
import postgres from "postgres";
import { runGas } from "./gas/engine.ts";
import { CODE } from "./gas/bundle.ts";

const env = (k: string) => Deno.env.get(k) || "";
const sql = postgres(env("SUPABASE_DB_URL"), { max: 4, prepare: false, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} });
const SELF = env("SUPABASE_URL").replace(/\/+$/, "") + "/functions/v1/api";
const CRON = new Set(["sp34Rappels", "sp34Nettoyer", "rgpdQuotidien", "secSauvegarder", "secControleQuotidien", "sp17MettreAJour"]);

// Planning des anciens déclencheurs Apps Script, à l'heure de Paris (le serveur et pg_cron sont en UTC).
// pg_cron appelle « ?cron=quart » toutes les 15 minutes ; on choisit ici ce qui doit tourner.
function dueNow(d = new Date()): string[] {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hourCycle: "h23", hour: "2-digit", minute: "2-digit", weekday: "short" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  const h = +p.hour, m = +p.minute, top = m < 15, out = ["sp34Rappels"];
  if (top && h === 4) out.push("sp34Nettoyer", "rgpdQuotidien", "sp17MettreAJour");
  if (top && h === 7) out.push("secControleQuotidien");
  if (top && h === 3 && p.weekday === "Sun") out.push("secSauvegarder");
  return out;
}

// Clé des tâches planifiées : lue dans le coffre Supabase (Vault, nom « spary_cron »), créé par 005_cron.sql.
let cronKey = "";
async function cronSecret(): Promise<string> {
  if (cronKey) return cronKey;
  if (env("CRON_SECRET")) return (cronKey = env("CRON_SECRET"));
  try { const r = await sql`select decrypted_secret from vault.decrypted_secrets where name = 'spary_cron' limit 1`; cronKey = r[0]?.decrypted_secret || ""; } catch { cronKey = ""; }
  return cronKey;
}

const ORIGINS = ["https://spary.fr", "https://www.spary.fr", "capacitor://localhost", "http://localhost", "https://localhost", "ionic://localhost"];
function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  const okO = ORIGINS.includes(o) || /^https:\/\/[a-z0-9-]+(--[a-z0-9-]+)?\.netlify\.app$/.test(o);
  return { "Access-Control-Allow-Origin": okO ? o : ORIGINS[0], "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Vary": "Origin" };
}

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const url = new URL(req.url);
  try {
    // Tâches planifiées (pg_cron) : protégées par le secret CRON_SECRET.
    if (req.method === "POST" && url.searchParams.get("cron")) {
      const fn = url.searchParams.get("cron")!, key = await cronSecret();
      if (!key || req.headers.get("x-cron-secret") !== key) return new Response("interdit", { status: 403 });
      const list = fn === "quart" ? dueNow() : CRON.has(fn) ? [fn] : [];
      if (!list.length) return new Response("tâche inconnue", { status: 400 });
      const done: Record<string, unknown> = {};
      for (const f of list) {   // l'une après l'autre ; une erreur n'empêche pas les suivantes
        try { const r = await runGas({ sql, code: CODE, env, scriptUrl: SELF }, { kind: "call", fn: f }); done[f] = r.logs.slice(-5); }
        catch (e) { console.error("cron " + f, e); done[f] = "ERREUR " + String(e).slice(0, 300); }
      }
      return new Response(JSON.stringify({ ok: true, done }), { headers: { "Content-Type": "application/json" } });
    }
    if (req.method === "GET") {
      const params: Record<string, string> = {}; url.searchParams.forEach((v, k) => { params[k] = v; });
      const r = await runGas({ sql, code: CODE, env, scriptUrl: SELF }, { kind: "get", params });
      return new Response(r.out, { headers: { ...h, "Content-Type": "application/json; charset=utf-8" } });
    }
    const body = await req.text();
    if (body.length > 150000) return new Response(JSON.stringify({ status: "error", message: "Requête trop volumineuse." }), { headers: { ...h, "Content-Type": "application/json" } });
    let action = ""; try { action = String(JSON.parse(body).action || ""); } catch { /* le code .gs répond lui-même */ }
    const r = await runGas({ sql, code: CODE, env, scriptUrl: SELF }, { kind: "post", body, action });
    return new Response(r.out, { headers: { ...h, "Content-Type": "application/json; charset=utf-8" } });
  } catch (e) {
    console.error("api", e);
    return new Response(JSON.stringify({ status: "error", message: "Erreur serveur, réessayez dans un instant." }), { headers: { ...h, "Content-Type": "application/json" } });
  }
});
