// Spary : connexion unique (pseudo ou e-mail + mot de passe).
//
// - Membre déjà converti → connexion Supabase Auth classique.
// - Membre pas encore converti → on vérifie le mot de passe auprès de
//   l'ancien serveur Apps Script (action « login » existante). S'il est bon,
//   on crée son compte Supabase Auth avec CE mot de passe, puis on le connecte.
//   Invisible pour le membre. Le PEPPER et les anciens hash ne quittent
//   jamais Google : on ne les copie pas.
//
// Secrets (Supabase → Edge Functions → Secrets) :
//   LEGACY_SCRIPT_URL  URL /exec de l'Apps Script actuel
// Fournis automatiquement par Supabase : SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY (jamais exposée au site).

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const anon = () => createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
const LEGACY = Deno.env.get("LEGACY_SCRIPT_URL") || "";

const ORIGINS = ["https://spary.fr", "https://www.spary.fr", "capacitor://localhost", "http://localhost", "https://localhost"];
const BAD = "Identifiants invalides.";

function reply(req: Request, status: number, body: unknown) {
  const o = req.headers.get("origin") || "";
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Vary": "Origin",
    },
  });
}

async function signIn(email: string, password: string) {
  const { data, error } = await anon().auth.signInWithPassword({ email, password });
  return error ? null : data;
}

async function legacyLogin(identifier: string, password: string) {
  if (!LEGACY) return null;
  try {
    const r = await fetch(LEGACY, { method: "POST", redirect: "follow", body: JSON.stringify({ action: "login", identifier, password }) });
    const j = JSON.parse(await r.text());
    return j && j.status === "success" ? j : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return reply(req, 204, null);
  if (req.method !== "POST") return reply(req, 405, { status: "error" });

  let identifier = "", password = "";
  try { ({ identifier, password } = await req.json()); } catch { /* vide */ }
  identifier = String(identifier || "").trim();
  password = String(password || "");
  if (!identifier || !password || identifier.length > 120 || password.length > 200) {
    return reply(req, 400, { status: "error", message: BAD });
  }

  // Retrouver le membre par e-mail ou pseudo (côté serveur : l'e-mail n'est jamais renvoyé).
  let memberId: string | null = null;
  if (identifier.includes("@")) {
    const { data } = await admin.from("member_private").select("member_id").eq("email", identifier.toLowerCase()).maybeSingle();
    memberId = data?.member_id ?? null;
  } else {
    const { data } = await admin.from("members").select("id").eq("pseudo", identifier).maybeSingle();
    memberId = data?.id ?? null;
  }
  if (!memberId) return reply(req, 401, { status: "error", message: BAD });

  const { data: m } = await admin.from("members")
    .select("id, pseudo, prenom, auth_user_id, member_private(email)")
    .eq("id", memberId).single();
  const email = (m as any)?.member_private?.email as string | undefined;
  if (!m || !email) return reply(req, 401, { status: "error", message: BAD });

  const { data: ban } = await admin.from("bans").select("until").eq("member_id", m.id).maybeSingle();
  if (ban && (!ban.until || new Date(ban.until) > new Date())) {
    return reply(req, 403, { status: "error", message: "Compte suspendu." });
  }

  const ok = (s: any) => reply(req, 200, {
    status: "success",
    session: { access_token: s.session.access_token, refresh_token: s.session.refresh_token },
    user: { pseudo: m.pseudo, name: m.prenom },
  });

  // 1. Déjà converti : connexion normale.
  if (m.auth_user_id) {
    const s = await signIn(email, password);
    return s ? ok(s) : reply(req, 401, { status: "error", message: BAD });
  }

  // 2. Pas encore converti : l'ancien serveur valide le mot de passe.
  const legacy = await legacyLogin(identifier, password);
  if (!legacy) return reply(req, 401, { status: "error", message: BAD });
  if (String(legacy.user?.pseudo || "").toLowerCase() !== String(m.pseudo).toLowerCase()) {
    return reply(req, 409, { status: "error", message: BAD });
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { pseudo: m.pseudo },
  });
  let userId = created?.user?.id ?? null;
  let s = null;
  if (error) {
    // Compte déjà créé (double clic) → on tente la connexion ; sinon mot de passe refusé par les règles Auth.
    s = await signIn(email, password);
    if (!s) return reply(req, 409, { status: "reset_needed", message: "Choisis un nouveau mot de passe : on t'envoie un lien par e-mail." });
    userId = s.user.id;
  }
  await admin.from("members").update({ auth_user_id: userId, last_seen_at: new Date().toISOString() }).eq("id", m.id);
  await admin.from("member_private").update({ migrated_at: new Date().toISOString() }).eq("member_id", m.id);

  // Ferme la session créée côté Apps Script par la vérification.
  if (legacy.token) fetch(LEGACY, { method: "POST", body: JSON.stringify({ action: "logout", token: legacy.token }) }).catch(() => {});

  s = s || await signIn(email, password);
  return s ? ok(s) : reply(req, 500, { status: "error", message: "Réessaie dans un instant." });
});
