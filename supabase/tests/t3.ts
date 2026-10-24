// Notifications : web push (VAPID) + appli iPhone (Firebase, JWT signé RSA). Les appels sortants sont interceptés.
import { call, reset, sql } from "./harness.ts";
const seen: { url: string; body: string; auth: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (u: any, o: any = {}) => {
  const url = String(u);
  const auth = String((o.headers && (o.headers.Authorization || o.headers.authorization)) || "");
  seen.push({ url, body: typeof o.body === "string" || o.body instanceof URLSearchParams ? String(o.body).slice(0, 3000) : "(binaire " + (o.body?.length || o.body?.byteLength || 0) + " o)", auth: auth.slice(0, 60) });
  if (url.includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }), { status: 200 });
  if (url.includes("fcm.googleapis.com/v1")) return new Response(JSON.stringify({ name: "projects/x/messages/1" }), { status: 200 });
  return new Response("", { status: 201 });
}) as any;
await reset();
const a = await call({ action: "register", lastName: "Martin", firstName: "Léa", email: "lea@test.fr", phone: "", birthDate: "2000-05-12", pseudo: "lea_m", password: "Motdepasse!2026", consent: true });
const b = await call({ action: "register", lastName: "Durand", firstName: "Tom", email: "tom@test.fr", phone: "", birthDate: "1995-01-02", pseudo: "tomd", password: "Autremotdepasse!9", consent: true });
// abonnement iPhone (jeton Firebase) + navigateur (clés réelles P-256)
const ec = (await import("node:crypto")).generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey.export({ format: "jwk" }) as any;
const p256dh = Buffer.concat([Buffer.from([4]), Buffer.from(ec.x, "base64url"), Buffer.from(ec.y, "base64url")]).toString("base64url");
console.log("abo iPhone", JSON.stringify(await call({ action: "pushSubscribe", token: b.token, native: "ios", fcm: "fcmTokenDeTest_1234567890abcdef" })));
console.log("abo web", JSON.stringify(await call({ action: "pushSubscribe", token: b.token, sub: { endpoint: "https://web.push.apple.com/QWERTY", keys: { p256dh, auth: Buffer.alloc(16, 7).toString("base64url") } } })));
seen.length = 0;
console.log("message", JSON.stringify(await call({ action: "msgSend", token: a.token, to: "tomd", text: "Tu viens au five ?" })));
await new Promise((r) => setTimeout(r, 300));
for (const s of seen) console.log("  →", s.url.slice(0, 80), "|", s.auth, "|", s.body.slice(0, 120));
const fcm = seen.find((s) => s.url.includes("fcm.googleapis.com/v1")), tok = seen.find((s) => s.url.includes("oauth2"));
const web = seen.find((s) => s.url.includes("web.push.apple.com"));
console.log(tok && /assertion=ey/.test(tok.body) ? "✓ jeton Firebase demandé (JWT signé RSA)" : "✗ pas de demande de jeton Firebase");
console.log(fcm ? "✓ notif iPhone envoyée à Firebase" : "✗ pas d'envoi Firebase");
console.log(web && /vapid/i.test(web.auth) ? "✓ web push envoyé (VAPID)" : "✗ pas de web push");

{ const c = await import("node:crypto"); const sa = JSON.parse(JSON.parse(require("fs").readFileSync(process.env.TEST_ENV_FILE!, "utf8")).GAS_FCM_SERVICE_ACCOUNT);
  const jwt = decodeURIComponent((tok?.body.match(/assertion=([^&]+)/) || [])[1] || ""); const [h, p, s] = jwt.split(".");
  const ok = c.createVerify("RSA-SHA256").update(h + "." + p).verify(c.createPublicKey(sa.private_key), Buffer.from(s || "", "base64url"));
  console.log(ok ? "✓ signature RSA vérifiée avec la clé publique" : "✗ signature RSA invalide"); }
globalThis.fetch = realFetch; await sql.end();
