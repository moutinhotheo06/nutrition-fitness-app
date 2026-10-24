// Moteur : fait tourner le code Apps Script de Spary sur Postgres.
// 1 requête = chargement de l'état → essai(s) du code .gs → écriture des changements.
// Les écritures passent sous un verrou Postgres (comme LockService), dans une transaction.

import type postgres from "postgres";
import { BlobRef, buildGlobals, fromStored, NeedError, newAttempt, type Attempt, type FetchReq, type FetchRes, type State, type Stored, type Tape, type Val } from "./shims.ts";

type Sql = ReturnType<typeof postgres>;
// deno-lint-ignore no-explicit-any
type Tx = any;

const LOCK_KEY = 732114;                 // pg_advisory_xact_lock
const BLOB_MIN = 4000;                   // au-delà, une cellule texte est rangée à part (photos)
const MAX_ATTEMPTS = 10;

// ───────── Code .gs (compilé une fois par instance) ─────────
const GLOBAL_NAMES = ["SpreadsheetApp", "CacheService", "LockService", "PropertiesService", "UrlFetchApp", "Utilities", "DriveApp", "ScriptApp", "ContentService", "Session", "Logger", "console", "HtmlService", "Date", "Math", "MailApp", "GmailApp"];
// deno-lint-ignore no-explicit-any
let compiled: ((...g: any[]) => any) | null = null;
let compiledFor = "";
export function compile(code: string) {
  if (compiled && compiledFor === code) return;
  const body = code + `
;return {
  doPost: typeof doPost === "function" ? doPost : null,
  doGet: typeof doGet === "function" ? doGet : null,
  call: function (n, args) { var f = eval(n); if (typeof f !== "function") throw new Error("Fonction inconnue : " + n); return f.apply(null, args || []); }
};`;
  compiled = new Function(...GLOBAL_NAMES, body) as typeof compiled;
  compiledFor = code;
}

// ───────── Chargement / écriture ─────────
async function loadState(q: Sql | Tx, env: (k: string) => string, scriptUrl: string, keep?: State): Promise<State> {
  const [sheets, props, cache] = await Promise.all([
    q`select name, data from gas_sheets order by pos, name`,
    q`select key, value from gas_props`,
    q`select key, value, (extract(epoch from expires_at) * 1000)::float8 as exp from gas_cache where expires_at > now()`,
  ]);
  return {
    sheets: sheets.map((r: { name: string; data: Stored[][] }) => ({ name: r.name, rows: (r.data || []).map((row) => row.map(fromStored)), dirty: false })),
    blobs: keep?.blobs || new Map(),
    props: new Map(props.map((r: { key: string; value: string }) => [r.key, r.value])),
    propsDirty: new Set(),
    cache: new Map(cache.map((r: { key: string; value: string; exp: number }) => [r.key, { v: r.value, exp: r.exp }])),
    cacheDirty: new Set(),
    files: keep?.files || new Map(),
    filesDirty: new Set(),
    fetchMemo: keep?.fetchMemo || new Map(),
    env, locked: false, scriptUrl,
  };
}

async function sha1(s: string) {
  const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function toStoredRows(rows: Val[][], newBlobs: Map<string, string>): Promise<Stored[][]> {
  let last = rows.length; while (last > 0 && !(rows[last - 1] || []).some((x) => x !== "")) last--;
  const out: Stored[][] = [];
  for (let i = 0; i < last; i++) {
    const r = rows[i] || []; let n = r.length; while (n > 0 && r[n - 1] === "") n--;
    const row: Stored[] = [];
    for (let j = 0; j < n; j++) {
      const v = r[j];
      if (v instanceof BlobRef) row.push({ $b: v.id });
      else if (v instanceof Date) row.push({ $d: v.getTime() });
      else if (typeof v === "string" && v.length > BLOB_MIN) { const id = await sha1(v); newBlobs.set(id, v); row.push({ $b: id }); }
      else row.push(v as Stored);
    }
    out.push(row);
  }
  return out;
}

async function flush(tx: Tx, st: State) {
  const newBlobs = new Map<string, string>();
  for (const [i, sh] of st.sheets.entries()) {
    if (!sh.dirty) continue;
    const data = await toStoredRows(sh.rows, newBlobs);
    await tx`insert into gas_sheets (name, pos, data, updated_at) values (${sh.name}, ${i}, ${tx.json(data)}, now())
      on conflict (name) do update set data = excluded.data, updated_at = now()`;
  }
  for (const [id, v] of newBlobs) await tx`insert into gas_blobs (id, value) values (${id}, ${v}) on conflict (id) do nothing`;
  await flushSide(tx, st);
}
async function flushSide(q: Sql | Tx, st: State) {
  for (const k of st.propsDirty) {
    const v = st.props.get(k);
    if (v === undefined) await q`delete from gas_props where key = ${k}`;
    else await q`insert into gas_props (key, value) values (${k}, ${v}) on conflict (key) do update set value = excluded.value`;
  }
  for (const k of st.cacheDirty) {
    const e = st.cache.get(k);
    if (!e) await q`delete from gas_cache where key = ${k}`;
    else await q`insert into gas_cache (key, value, expires_at) values (${k}, ${e.v}, to_timestamp(${e.exp / 1000}))
      on conflict (key) do update set value = excluded.value, expires_at = excluded.expires_at`;
  }
  for (const id of st.filesDirty) {
    const f = st.files.get(id); if (!f) continue;
    await q`insert into gas_files (id, name, mime, b64, trashed, folder) values (${id}, ${f.name}, ${f.mime}, ${f.b64}, ${f.trashed}, ${f.folder})
      on conflict (id) do update set name = excluded.name, trashed = excluded.trashed`;
  }
}

async function resolveNeeds(q: Sql | Tx, st: State, at: Attempt) {
  const ids = [...at.needs.blobs].filter((id) => !st.blobs.has(id));
  if (ids.length) for (const r of await q`select id, value from gas_blobs where id = any(${ids})`) st.blobs.set(r.id, r.value);
  for (const id of ids) if (!st.blobs.has(id)) st.blobs.set(id, "");
  const fids = [...at.needs.files].filter((id) => !st.files.has(id));
  if (fids.length) for (const r of await q`select id, name, mime, b64, trashed, folder from gas_files where id = any(${fids})`) st.files.set(r.id, { name: r.name, mime: r.mime, b64: r.b64, trashed: r.trashed, folder: r.folder });
  const missing = fids.filter((id) => !st.files.has(id));
  if (missing.length) throw new Error("Fichier introuvable : " + missing[0]);
  const todo = [...at.needs.fetches].filter(([k]) => !st.fetchMemo.has(k));
  await Promise.all(todo.map(async ([k, r]) => st.fetchMemo.set(k, await doFetch(r))));
}

async function doFetch(r: FetchReq): Promise<FetchRes> {
  const o = r.opts as { method: string; headers: Record<string, string>; contentType: string | null; payload: unknown; follow: boolean };
  const headers: Record<string, string> = { ...(o.headers || {}) };
  let body: BodyInit | undefined;
  const p = o.payload as { $form?: Record<string, string>; $bytes?: string } | string | null;
  if (p && typeof p === "object" && p.$form) { body = new URLSearchParams(p.$form as Record<string, string>); headers["content-type"] ||= "application/x-www-form-urlencoded"; }
  else if (p && typeof p === "object" && p.$bytes) { body = Uint8Array.from(atob(p.$bytes), (c) => c.charCodeAt(0)); }
  else if (typeof p === "string") body = p;
  if (o.contentType) headers["content-type"] = o.contentType;
  try {
    const res = await fetch(r.url, { method: o.method === "GET" && body ? "POST" : o.method, headers, body: o.method === "GET" ? undefined : body, redirect: o.follow ? "follow" : "manual", signal: AbortSignal.timeout(20000) });
    const buf = new Uint8Array(await res.arrayBuffer());
    const h: Record<string, string> = {}; res.headers.forEach((v, k) => { h[k] = v; });
    const ct = h["content-type"] || "";
    const isText = !ct || /text|json|xml|javascript|html|urlencoded/.test(ct);
    let b64: string | undefined;
    if (!isText) { let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); b64 = btoa(s); }
    return { code: res.status, text: isText ? new TextDecoder().decode(buf) : "", headers: h, b64 };
  } catch (e) {
    return { code: 599, text: String((e as Error)?.message || e), headers: {} };
  }
}

// ───────── Exécution ─────────
export type RunOpts = { sql: Sql; code: string; env: (k: string) => string; scriptUrl: string; writeHint?: boolean };
export type RunResult = { out: string; logs: string[]; attempts: number };
type Entry = { kind: "post"; body: string; action: string } | { kind: "get"; params: Record<string, string> } | { kind: "call"; fn: string; args?: unknown[] };

// Actions dont on sait qu'elles écrivent : prises sous verrou dès le 1er essai.
const learnedWrites = new Set<string>();

// Appels réseau dont le code ne lit pas la réponse (push, e-mails) : faits après l'enregistrement.
async function sendPending(st: State, at: Attempt) {
  const todo = [...at.needs.fetches].filter(([k]) => !st.fetchMemo.has(k));
  await Promise.all(todo.map(async ([k, r]) => st.fetchMemo.set(k, await doFetch(r))));
}

export async function runGas(o: RunOpts, entry: Entry): Promise<RunResult> {
  compile(o.code);
  const key = entry.kind === "post" ? "post:" + entry.action : entry.kind === "call" ? "call:" + entry.fn : "get";
  const tape: Tape = { now: [], rnd: [], uuid: [] };
  let wantLock = !!o.writeHint || learnedWrites.has(key) || entry.kind === "call";
  let st = await loadState(o.sql, o.env, o.scriptUrl);
  let attempt = 0;

  while (!wantLock) {
    if (++attempt > MAX_ATTEMPTS) throw new Error("Trop d'essais pour " + key);
    const at = newAttempt(st, tape);
    const out = execute(at, entry);
    if (at.poisoned) {
      if (at.needs.lock) { wantLock = true; learnedWrites.add(key); break; }
      await resolveNeeds(o.sql, st, at);
      st = await loadState(o.sql, o.env, o.scriptUrl, st);
      continue;
    }
    if (st.sheets.some((s) => s.dirty) || st.propsDirty.size || st.filesDirty.size) { wantLock = true; learnedWrites.add(key); break; }
    if (st.cacheDirty.size) await flushSide(o.sql, st);
    await sendPending(st, at);
    return { out, logs: at.logs, attempts: attempt };
  }

  // Sous verrou, dans une transaction, sur un état relu.
  let done: { out: string; logs: string[]; at: Attempt } | null = null;
  await o.sql.begin(async (tx: Tx) => {
    await tx`select pg_advisory_xact_lock(${LOCK_KEY})`;
    for (;;) {
      if (++attempt > MAX_ATTEMPTS) throw new Error("Trop d'essais pour " + key);
      st = await loadState(tx, o.env, o.scriptUrl, st); st.locked = true;
      const at = newAttempt(st, tape);
      const out = execute(at, entry);
      if (at.poisoned) { await resolveNeeds(tx, st, at); continue; }
      await flush(tx, st);
      done = { out, logs: at.logs, at };
      return;
    }
  });
  const d = done as unknown as { out: string; logs: string[]; at: Attempt };
  await sendPending(st, d.at);
  return { out: d.out, logs: d.logs, attempts: attempt };
}

function execute(at: Attempt, entry: Entry): string {
  const g = buildGlobals(at);
  const mail = () => { throw new Error("MailApp n'est pas disponible : les e-mails passent par Resend."); };
  try {
    const api = compiled!(...GLOBAL_NAMES.map((n) => (n === "MailApp" || n === "GmailApp" ? { sendEmail: mail } : g[n])));
    if (entry.kind === "post") {
      if (!api.doPost) throw new Error("doPost absent");
      const res = api.doPost({ postData: { contents: entry.body, type: "text/plain", length: entry.body.length }, parameter: {}, parameters: {}, contentLength: entry.body.length });
      return res && typeof res.getContent === "function" ? res.getContent() : String(res ?? "");
    }
    if (entry.kind === "get") {
      if (!api.doGet) return "";
      const res = api.doGet({ parameter: entry.params, parameters: {}, queryString: "" });
      return res && typeof res.getContent === "function" ? res.getContent() : String(res ?? "");
    }
    const r = api.call(entry.fn, entry.args);
    return JSON.stringify(r ?? null);
  } catch (e) {
    if (e instanceof NeedError || at.poisoned) { at.poisoned = true; return ""; }
    throw e;
  }
}
