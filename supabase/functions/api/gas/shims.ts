// Émulation des services Google Apps Script utilisés par Spary, au-dessus d'un état en mémoire.
// Le code .gs d'origine tourne tel quel ; l'état (feuilles, cache, propriétés, fichiers)
// est chargé depuis Postgres avant, et écrit après (voir engine.ts).
//
// Les opérations impossibles en synchrone (blob pas encore chargé, appel réseau, verrou)
// lèvent un « besoin » : l'essai est jeté, le moteur charge ce qu'il faut et relance.

import { createHash, createHmac, randomUUID } from "node:crypto";
import { ParisDate, parisParts } from "./parisdate.ts";

// ───────── Valeurs ─────────
export class BlobRef { constructor(public id: string) {} }
export type Val = string | number | boolean | Date | BlobRef;
export type Stored = string | number | boolean | { $d: number } | { $b: string };

export function fromStored(v: Stored): Val {
  if (v && typeof v === "object") {
    if ("$d" in v) return new ParisDate(v.$d) as unknown as Date;
    if ("$b" in v) return new BlobRef(v.$b);
  }
  return v as Val;
}

// ───────── Besoins (relance) ─────────
export type FetchReq = { url: string; opts: Record<string, unknown> };
export type FetchRes = { code: number; text: string; headers: Record<string, string>; b64?: string };
export class NeedError extends Error { constructor() { super("__gas_need__"); } }

export type Tape = { now: number[]; rnd: number[]; uuid: string[] };

export type State = {
  sheets: { name: string; rows: Val[][]; dirty: boolean; created?: boolean }[];
  blobs: Map<string, string>;
  props: Map<string, string>;
  propsDirty: Set<string>;
  cache: Map<string, { v: string; exp: number }>;
  cacheDirty: Set<string>;
  files: Map<string, { name: string; mime: string; b64: string; trashed: boolean; folder: string }>;
  filesDirty: Set<string>;
  fetchMemo: Map<string, FetchRes>;
  env: (k: string) => string;
  locked: boolean;
  scriptUrl: string;
};

export type Attempt = {
  st: State;
  needs: { blobs: Set<string>; files: Set<string>; fetches: Map<string, FetchReq>; lock: boolean };
  poisoned: boolean;
  tape: Tape; ti: { now: number; rnd: number; uuid: number };
  logs: string[];
};

export function newAttempt(st: State, tape: Tape): Attempt {
  return { st, needs: { blobs: new Set(), files: new Set(), fetches: new Map(), lock: false }, poisoned: false, tape, ti: { now: 0, rnd: 0, uuid: 0 }, logs: [] };
}

function need(a: Attempt): never { a.poisoned = true; throw new NeedError(); }
function guard(a: Attempt) { if (a.poisoned) throw new NeedError(); }

// ───────── Coercition « comme Sheets » (paramètres régionaux FR) ─────────
const NUM_RE = /^[+-]?(\d+(,\d+)?|,\d+)([eE][+-]?\d+)?$/;
function coerceIn(v: unknown): Val {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return new ParisDate(v.getTime()) as unknown as Date;
  if (typeof v === "number") return isFinite(v) ? v : "";
  if (typeof v === "boolean") return v;
  if (v instanceof BlobRef) return v;
  if (typeof v === "object") return String(v);
  let s = String(v);
  if (s.startsWith("'")) return s.slice(1);
  const t = s.trim();
  if (t !== s) s = s; // Sheets garde les espaces : on ne convertit que les valeurs « propres »
  if (t === s && t.length && t.length <= 30) {
    if (NUM_RE.test(t)) { const n = Number(t.replace(",", ".")); if (isFinite(n)) return n; }
    if (/^(TRUE|FALSE|VRAI|FAUX)$/i.test(t)) return /^(TRUE|VRAI)$/i.test(t);
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return new ParisDate(+m[1], +m[2] - 1, +m[3]) as unknown as Date;
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m && +m[2] <= 12 && +m[1] <= 31) return new ParisDate(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) as unknown as Date;
  }
  return s;
}
function outVal(a: Attempt, v: Val): unknown {
  if (v instanceof BlobRef) {
    const s = a.st.blobs.get(v.id);
    if (s === undefined) { a.needs.blobs.add(v.id); need(a); }
    return s;
  }
  if (v instanceof Date) return new ParisDate(v.getTime());
  return v;
}

// ───────── SpreadsheetApp ─────────
function colToNum(c: string) { let n = 0; for (const ch of c.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function numToCol(n: number) { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

function makeSheet(a: Attempt, sh: State["sheets"][number]) {
  const dirty = () => { sh.dirty = true; };
  const lastRow = () => { for (let i = sh.rows.length - 1; i >= 0; i--) if (sh.rows[i].some((x) => x !== "")) return i + 1; return 0; };
  const lastCol = () => { let m = 0; for (const r of sh.rows) for (let j = r.length - 1; j >= m; j--) if (r[j] !== "") { m = j + 1; break; } return m; };
  const setCell = (r: number, c: number, v: unknown) => {
    while (sh.rows.length < r) sh.rows.push([]);
    const row = sh.rows[r - 1];
    while (row.length < c) row.push("");
    row[c - 1] = coerceIn(v);
  };
  const getCell = (r: number, c: number): Val => { const row = sh.rows[r - 1]; return row && c - 1 < row.length ? row[c - 1] : ""; };

  function range(r: number, c: number, nr: number, nc: number) {
    if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error("Les coordonnées de la plage sont en dehors des dimensions de la feuille.");
    const R: Record<string, unknown> = {
      getValues() { guard(a); const out: unknown[][] = []; for (let i = 0; i < nr; i++) { const row: unknown[] = []; for (let j = 0; j < nc; j++) row.push(outVal(a, getCell(r + i, c + j))); out.push(row); } return out; },
      getDisplayValues() { return (R.getValues as () => unknown[][])().map((row) => row.map((x) => x instanceof Date ? Utilities.formatDate(x, "Europe/Paris", "dd/MM/yyyy HH:mm:ss") : String(x))); },
      getValue() { guard(a); return outVal(a, getCell(r, c)); },
      getDisplayValue() { const v = R.getValue as () => unknown; const x = v(); return x instanceof Date ? Utilities.formatDate(x, "Europe/Paris", "dd/MM/yyyy HH:mm:ss") : String(x); },
      setValue(v: unknown) { guard(a); for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) setCell(r + i, c + j, v); dirty(); return R; },
      setValues(vs: unknown[][]) {
        guard(a);
        if (!Array.isArray(vs) || vs.length !== nr || vs.some((x) => !Array.isArray(x) || x.length !== nc)) throw new Error("Le nombre de lignes ou de colonnes des données ne correspond pas à la plage.");
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) setCell(r + i, c + j, vs[i][j]);
        dirty(); return R;
      },
      clearContent() { guard(a); for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (sh.rows[r + i - 1]) setCell(r + i, c + j, ""); dirty(); return R; },
      clear() { return (R.clearContent as () => unknown)(); },
      getRow: () => r, getColumn: () => c, getNumRows: () => nr, getNumColumns: () => nc,
      getLastRow: () => r + nr - 1, getLastColumn: () => c + nc - 1,
      getA1Notation: () => numToCol(c) + r + (nr > 1 || nc > 1 ? ":" + numToCol(c + nc - 1) + (r + nr - 1) : ""),
      getSheet: () => S,
      offset: (dr: number, dc: number, nr2?: number, nc2?: number) => range(r + dr, c + dc, nr2 || nr, nc2 || nc),
      sort() { return R; },
    };
    for (const k of ["setFontWeight", "setNumberFormat", "setBackground", "setFontColor", "setNote", "setWrap", "setHorizontalAlignment", "setFontSize", "setBorder", "protect", "activate", "setDataValidation", "setFormula"]) R[k] = () => R;
    return R;
  }

  const S: Record<string, unknown> = {
    getName: () => sh.name,
    setName: (n: string) => { sh.name = String(n); dirty(); return S; },
    getSheetName: () => sh.name,
    getLastRow: () => { guard(a); return lastRow(); },
    getLastColumn: () => { guard(a); return lastCol(); },
    getMaxRows: () => Math.max(1000, sh.rows.length), getMaxColumns: () => Math.max(26, lastCol()),
    getDataRange: () => { guard(a); return range(1, 1, Math.max(1, lastRow()), Math.max(1, lastCol())); },
    getRange: (r: number | string, c?: number, nr?: number, nc?: number) => {
      guard(a);
      if (typeof r === "string") {
        const m = r.replace(/^.*!/, "").match(/^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/i);
        if (!m) throw new Error("Plage introuvable : " + r);
        const c1 = colToNum(m[1]), r1 = m[2] ? +m[2] : 1, c2 = m[3] ? colToNum(m[3]) : c1, r2 = m[4] ? +m[4] : (m[2] && !m[3] ? r1 : Math.max(1, lastRow()));
        return range(r1, c1, r2 - r1 + 1, c2 - c1 + 1);
      }
      return range(Number(r), Number(c), nr === undefined ? 1 : Number(nr), nc === undefined ? 1 : Number(nc));
    },
    appendRow: (vals: unknown[]) => {
      guard(a);
      const at = lastRow();
      sh.rows.length = at;
      sh.rows.push((Array.isArray(vals) ? vals : [vals]).map(coerceIn));
      dirty(); return S;
    },
    deleteRow: (i: number) => { guard(a); if (i >= 1 && i <= sh.rows.length) sh.rows.splice(i - 1, 1); dirty(); return S; },
    deleteRows: (i: number, n: number) => { guard(a); if (i >= 1) sh.rows.splice(i - 1, n); dirty(); return S; },
    insertRowBefore: (i: number) => { guard(a); sh.rows.splice(i - 1, 0, []); dirty(); return S; },
    insertRowAfter: (i: number) => { guard(a); sh.rows.splice(i, 0, []); dirty(); return S; },
    insertRowsAfter: (i: number, n: number) => { guard(a); sh.rows.splice(i, 0, ...Array.from({ length: n }, () => [] as Val[])); dirty(); return S; },
    clearContents: () => { guard(a); sh.rows = []; dirty(); return S; },
    clear: () => { guard(a); sh.rows = []; dirty(); return S; },
    getSheetId: () => Math.abs(hashCode(sh.name)),
    getParent: () => SS,
    activate: () => S,
  };
  for (const k of ["setFrozenRows", "setFrozenColumns", "hideSheet", "showSheet", "autoResizeColumns", "setColumnWidth", "setTabColor", "protect", "hideColumns"]) S[k] = () => S;
  // deno-lint-ignore no-explicit-any
  let SS: any = null;
  return { S, bind: (ss: unknown) => { SS = ss; } };
}
function hashCode(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

// deno-lint-ignore no-explicit-any
let Utilities: any;

// deno-lint-ignore no-explicit-any
export function buildGlobals(a: Attempt): Record<string, any> {
  const st = a.st;
  const now = () => {
    const t = a.tape.now; const i = a.ti.now++;
    if (i < t.length) return t[i];
    const v = Math.max(Date.now(), t.length ? t[t.length - 1] : 0); t.push(v); return v;
  };
  const rnd = () => { const t = a.tape.rnd; const i = a.ti.rnd++; if (i < t.length) return t[i]; const v = Math.random(); t.push(v); return v; };
  const uuid = () => { const t = a.tape.uuid; const i = a.ti.uuid++; if (i < t.length) return t[i]; const v = randomUUID(); t.push(v); return v; };

  // Date « Paris » avec horloge enregistrée (identique d'un essai à l'autre).
  class D extends ParisDate {
    // deno-lint-ignore no-explicit-any
    constructor(...x: any[]) { if (x.length === 0) super(now()); else super(...x); }
    static now() { return now(); }
  }
  // deno-lint-ignore no-explicit-any
  const DateCtor: any = function (this: unknown, ...x: unknown[]) {
    if (!new.target) return new D().toString();
    return new D(...(x as []));
  };
  DateCtor.prototype = D.prototype; DateCtor.now = D.now; DateCtor.parse = ParisDate.parse; DateCtor.UTC = Date.UTC;
  Object.defineProperty(DateCtor, Symbol.hasInstance, { value: (o: unknown) => o instanceof Date });

  const MathX = Object.create(Math); MathX.random = rnd;

  // ── SpreadsheetApp
  // deno-lint-ignore no-explicit-any
  const sheetObjs = new Map<any, any>();
  const sheetObj = (sh: State["sheets"][number]) => {
    let o = sheetObjs.get(sh);
    if (!o) { const m = makeSheet(a, sh); m.bind(SS); o = m.S; sheetObjs.set(sh, o); }
    return o;
  };
  // deno-lint-ignore no-explicit-any
  const SS: any = {
    getSheetByName: (n: string) => { guard(a); const sh = st.sheets.find((x) => x.name === String(n)); return sh ? sheetObj(sh) : null; },
    insertSheet: (n?: string) => {
      guard(a);
      const name = n ? String(n) : "Feuille " + (st.sheets.length + 1);
      if (st.sheets.some((x) => x.name === name)) throw new Error("Une feuille nommée « " + name + " » existe déjà.");
      const sh = { name, rows: [] as Val[][], dirty: true, created: true }; st.sheets.push(sh); return sheetObj(sh);
    },
    getSheets: () => { guard(a); return st.sheets.map(sheetObj); },
    getActiveSheet: () => sheetObj(st.sheets[0]),
    getId: () => "spary-main", getName: () => "BDD Spary", getUrl: () => "https://supabase.com",
    getSpreadsheetTimeZone: () => "Europe/Paris", getSpreadsheetLocale: () => "fr_FR",
    copy: () => SS, toast: () => {},
  };
  // Classeur jetable (sauvegardes, statistiques à part) : rien n'est enregistré.
  const scratch = () => {
    const local: State["sheets"] = [{ name: "Feuille 1", rows: [], dirty: false }];
    const sub = { ...a, st: { ...st, sheets: local } } as Attempt;
    // deno-lint-ignore no-explicit-any
    const o: any = {
      getSheetByName: (n: string) => { const sh = local.find((x) => x.name === n); return sh ? makeSheet(sub, sh).S : null; },
      insertSheet: (n: string) => { const sh = { name: n, rows: [], dirty: true }; local.push(sh); return makeSheet(sub, sh).S; },
      getSheets: () => local.map((sh) => makeSheet(sub, sh).S),
      getId: () => "scratch", getUrl: () => "", getName: () => "copie", deleteSheet: () => {}, copy: () => o,
    };
    return o;
  };
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => SS, getActive: () => SS,
    openById: (id: string) => (id === "spary-main" ? SS : scratch()),
    openByUrl: () => scratch(), create: () => scratch(), flush: () => {},
    getUi: () => { throw new Error("Pas d'interface en dehors de Google Sheets."); },
  };

  // ── CacheService (expiration en secondes, 600 par défaut, max 6 h)
  const cache = {
    get: (k: string) => { guard(a); const e = st.cache.get(String(k)); return e && e.exp > now() ? e.v : null; },
    put: (k: string, v: unknown, ttl?: number) => {
      guard(a); const s = String(v); if (s.length > 100000) throw new Error("Valeur trop grande pour le cache.");
      st.cache.set(String(k), { v: s, exp: now() + Math.min(21600, Math.max(1, Number(ttl) || 600)) * 1000 }); st.cacheDirty.add(String(k));
    },
    remove: (k: string) => { guard(a); st.cache.delete(String(k)); st.cacheDirty.add(String(k)); },
    getAll: (ks: string[]) => { const o: Record<string, string> = {}; (ks || []).forEach((k) => { const v = cache.get(k); if (v !== null) o[k] = v; }); return o; },
    putAll: (o: Record<string, unknown>, ttl?: number) => { Object.keys(o || {}).forEach((k) => cache.put(k, o[k], ttl)); },
    removeAll: (ks: string[]) => { (ks || []).forEach((k) => cache.remove(k)); },
  };
  const CacheService = { getScriptCache: () => cache, getUserCache: () => cache, getDocumentCache: () => cache };

  // ── LockService : le vrai verrou est pris par le moteur (relance sous verrou).
  const lock = {
    waitLock: () => { guard(a); if (!st.locked) { a.needs.lock = true; need(a); } },
    tryLock: () => { guard(a); if (!st.locked) { a.needs.lock = true; need(a); } return true; },
    releaseLock: () => {}, hasLock: () => st.locked,
  };
  const LockService = { getScriptLock: () => lock, getDocumentLock: () => lock, getUserLock: () => lock };

  // ── PropertiesService : secrets Supabase (GAS_<CLÉ>) d'abord, puis table gas_props.
  const props = {
    getProperty: (k: string) => { const e = st.env("GAS_" + k); if (e) return e; const v = st.props.get(String(k)); return v === undefined ? null : v; },
    setProperty: (k: string, v: unknown) => {
      if (["PEPPER", "VAPID_PRIVATE", "VAPID_PUBLIC"].includes(String(k)) && !st.env("GAS_" + k)) throw new Error(k + " absent des secrets Supabase : refus d'en créer un nouveau (mots de passe ou notifications cassés).");
      st.props.set(String(k), String(v)); st.propsDirty.add(String(k)); return props;
    },
    deleteProperty: (k: string) => { st.props.delete(String(k)); st.propsDirty.add(String(k)); return props; },
    getProperties: () => Object.fromEntries(st.props),
    setProperties: (o: Record<string, unknown>) => { Object.keys(o || {}).forEach((k) => props.setProperty(k, o[k])); return props; },
    getKeys: () => [...st.props.keys()],
  };
  const PropertiesService = { getScriptProperties: () => props, getUserProperties: () => props, getDocumentProperties: () => props };

  // ── Blob
  // deno-lint-ignore no-explicit-any
  function makeBlob(bytes: Uint8Array, mime = "application/octet-stream", name = ""): any {
    // deno-lint-ignore no-explicit-any
    const b: any = {
      getBytes: () => toSigned(bytes), getDataAsString: (cs?: string) => new TextDecoder(cs && /latin|iso/i.test(cs) ? "latin1" : "utf-8").decode(bytes),
      getContentType: () => mime, setContentType: (m: string) => { mime = m; return b; },
      getName: () => name, setName: (n: string) => { name = n; return b; }, getAs: () => b, copyBlob: () => makeBlob(bytes, mime, name),
      isGoogleType: () => false, _raw: bytes,
    };
    return b;
  }
  const toBytes = (x: unknown): Uint8Array => {
    if (x instanceof Uint8Array) return x;
    if (Array.isArray(x)) return Uint8Array.from(x.map((n) => Number(n) & 255));
    if (x && typeof x === "object" && "_raw" in (x as Record<string, unknown>)) return (x as { _raw: Uint8Array })._raw;
    return new TextEncoder().encode(String(x ?? ""));
  };
  const toSigned = (u: Uint8Array) => Array.from(u, (n) => (n > 127 ? n - 256 : n));
  const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s: string) => { const bin = atob(String(s).replace(/\s+/g, "")); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

  // ── Utilities
  const FR_DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const FR_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  Utilities = {
    formatDate: (d: Date, _tz: string, f: string) => {
      const p = parisParts(new Date(d).getTime());
      const z = (n: number, w: number) => String(n).padStart(w, "0");
      let out = "", i = 0; const s = String(f);
      while (i < s.length) {
        const ch = s[i];
        if (ch === "'") { const j = s.indexOf("'", i + 1); if (j === i + 1) { out += "'"; i += 2; continue; } out += s.slice(i + 1, j < 0 ? s.length : j); i = j < 0 ? s.length : j + 1; continue; }
        let n = 1; while (s[i + n] === ch) n++;
        const tok = ch.repeat(n);
        switch (ch) {
          case "y": out += n === 2 ? z(p.y % 100, 2) : z(p.y, 4); break;
          case "M": out += n >= 4 ? FR_MONTHS[p.mo] : n === 3 ? FR_MONTHS[p.mo].slice(0, 3) + "." : z(p.mo + 1, n); break;
          case "d": out += z(p.d, n); break;
          case "H": out += z(p.h, n); break;
          case "h": out += z(p.h % 12 || 12, n); break;
          case "m": out += z(p.mi, n); break;
          case "s": out += z(p.s, n); break;
          case "S": out += z(p.ms, 3).slice(0, n); break;
          case "E": out += n >= 4 ? FR_DAYS[p.wd] : FR_DAYS[p.wd].slice(0, 3) + "."; break;
          case "u": out += String(p.wd === 0 ? 7 : p.wd); break;
          case "a": out += p.h < 12 ? "AM" : "PM"; break;
          case "Z": { const off = -new ParisDate(new Date(d).getTime()).getTimezoneOffset(); out += (off >= 0 ? "+" : "-") + z(Math.floor(Math.abs(off) / 60), 2) + z(Math.abs(off) % 60, 2); break; }
          case "X": { const off = -new ParisDate(new Date(d).getTime()).getTimezoneOffset(); out += (off >= 0 ? "+" : "-") + z(Math.floor(Math.abs(off) / 60), 2) + (n >= 3 ? ":" : "") + (n >= 2 ? z(Math.abs(off) % 60, 2) : ""); break; }
          default: out += tok;
        }
        i += n;
      }
      return out;
    },
    getUuid: () => uuid(),
    sleep: () => {},
    DigestAlgorithm: { MD2: "md2", MD5: "md5", SHA_1: "sha1", SHA_256: "sha256", SHA_384: "sha384", SHA_512: "sha512" },
    MacAlgorithm: { HMAC_MD5: "md5", HMAC_SHA_1: "sha1", HMAC_SHA_256: "sha256", HMAC_SHA_384: "sha384", HMAC_SHA_512: "sha512" },
    Charset: { UTF_8: "utf-8", US_ASCII: "ascii" },
    computeDigest: (alg: string, v: unknown) => toSigned(createHash(alg).update(toBytes(v)).digest()),
    computeHmacSha256Signature: (v: unknown, k: unknown) => toSigned(createHmac("sha256", toBytes(k)).update(toBytes(v)).digest()),
    computeHmacSignature: (alg: string, v: unknown, k: unknown) => toSigned(createHmac(alg, toBytes(k)).update(toBytes(v)).digest()),
    base64Encode: (v: unknown) => b64(toBytes(v)),
    base64EncodeWebSafe: (v: unknown) => b64(toBytes(v)).replace(/\+/g, "-").replace(/\//g, "_"),
    base64Decode: (s: string) => toSigned(unb64(s)),
    base64DecodeWebSafe: (s: string) => toSigned(unb64(String(s).replace(/-/g, "+").replace(/_/g, "/"))),
    newBlob: (data: unknown, mime?: string, name?: string) => makeBlob(toBytes(data), mime, name),
    jsonStringify: (o: unknown) => JSON.stringify(o), jsonParse: (s: string) => JSON.parse(s),
    parseCsv: (s: string) => String(s).split(/\r?\n/).map((l) => l.split(",")),
  };

  // ── UrlFetchApp : réponses rejouées ; un appel inconnu est noté puis fait par le moteur.
  const reqKey = (r: FetchReq) => JSON.stringify([r.url, r.opts]);
  // deno-lint-ignore no-explicit-any
  const normOpts = (o: any): Record<string, unknown> => {
    o = o || {};
    let payload = o.payload;
    if (payload && typeof payload === "object" && !(payload instanceof Uint8Array) && !("_raw" in payload)) {
      if (Array.isArray(payload)) payload = { $bytes: b64(toBytes(payload)) };
      else payload = { $form: payload };
    } else if (payload && typeof payload === "object") payload = { $bytes: b64(toBytes(payload)) };
    return { method: String(o.method || "get").toUpperCase(), headers: o.headers || {}, contentType: o.contentType || null, payload: payload ?? null, mute: !!o.muteHttpExceptions, follow: o.followRedirects !== false };
  };
  // deno-lint-ignore no-explicit-any
  const response = (r: FetchReq): any => {
    const k = reqKey(r);
    const get = (): FetchRes => {
      const m = st.fetchMemo.get(k);
      if (!m) { a.needs.fetches.set(k, r); need(a); }
      if (m!.code >= 400 && !r.opts.mute) throw new Error("Échec de la requête pour " + r.url + ". Code renvoyé : " + m!.code);
      return m!;
    };
    if (!st.fetchMemo.has(k)) a.needs.fetches.set(k, r);   // noté tout de suite : regroupe les appels d'un même essai
    return {
      getResponseCode: () => get().code,
      getContentText: () => get().text,
      getContent: () => toSigned(get().b64 ? unb64(get().b64!) : new TextEncoder().encode(get().text)),
      getBlob: () => { const m = get(); return makeBlob(m.b64 ? unb64(m.b64) : new TextEncoder().encode(m.text), m.headers["content-type"] || ""); },
      getHeaders: () => get().headers, getAllHeaders: () => get().headers,
    };
  };
  const UrlFetchApp = {
    fetch: (url: string, o?: unknown) => { guard(a); return response({ url: String(url), opts: normOpts(o) }); },
    // deno-lint-ignore no-explicit-any
    fetchAll: (list: any[]) => { guard(a); return (list || []).map((x) => typeof x === "string" ? response({ url: x, opts: normOpts({}) }) : response({ url: String(x.url), opts: normOpts(x) })); },
    getRequest: (url: string, o?: unknown) => ({ url, ...normOpts(o) }),
  };

  // ── DriveApp (photos de la messagerie) : table gas_files.
  // deno-lint-ignore no-explicit-any
  const fileObj = (id: string): any => {
    const f = st.files.get(id);
    if (!f) { a.needs.files.add(id); need(a); }
    // deno-lint-ignore no-explicit-any
    const o: any = {
      getId: () => id, getName: () => f!.name, getMimeType: () => f!.mime, getSize: () => unb64(f!.b64).length,
      getBlob: () => makeBlob(unb64(f!.b64), f!.mime, f!.name), getAs: () => o.getBlob(),
      setTrashed: (t: boolean) => { f!.trashed = !!t; st.filesDirty.add(id); return o; }, isTrashed: () => f!.trashed,
      getUrl: () => st.scriptUrl + "?file=" + id, getDownloadUrl: () => st.scriptUrl + "?file=" + id,
      setSharing: () => o, setDescription: () => o, setName: (n: string) => { f!.name = n; st.filesDirty.add(id); return o; },
      moveTo: () => o, getParents: () => ({ hasNext: () => false }),
    };
    return o;
  };
  // deno-lint-ignore no-explicit-any
  const createFile = (folder: string, x: any, content?: unknown, mime?: string) => {
    guard(a);
    const id = "f" + uuid().replace(/-/g, "");
    let bytes: Uint8Array, name: string, mt: string;
    if (typeof x === "string") { name = x; bytes = toBytes(content); mt = mime || "text/plain"; }
    else { bytes = toBytes(x); name = x?.getName?.() || "fichier"; mt = x?.getContentType?.() || "application/octet-stream"; }
    st.files.set(id, { name, mime: mt, b64: b64(bytes), trashed: false, folder }); st.filesDirty.add(id);
    return fileObj(id);
  };
  // deno-lint-ignore no-explicit-any
  const folderObj = (fid: string): any => ({
    getId: () => fid, getName: () => fid, createFile: (x: unknown, c?: unknown, m?: string) => createFile(fid, x, c, m),
    setSharing: function () { return this; }, setTrashed: function () { return this; }, getUrl: () => "",
  });
  const DriveApp = {
    createFile: (x: unknown, c?: unknown, m?: string) => createFile("", x, c, m),
    getFileById: (id: string) => { guard(a); return fileObj(String(id)); },
    getFolderById: (id: string) => folderObj(String(id)),
    createFolder: (n: string) => folderObj("dossier-" + String(n).slice(0, 20)),
    getRootFolder: () => folderObj("racine"),
    Access: { PRIVATE: "PRIVATE", ANYONE: "ANYONE", ANYONE_WITH_LINK: "ANYONE_WITH_LINK" }, Permission: { VIEW: "VIEW", NONE: "NONE" },
  };

  // ── ScriptApp : les déclencheurs horaires sont remplacés par pg_cron (voir 004_gas.sql).
  // deno-lint-ignore no-explicit-any
  const chain: any = new Proxy({}, { get: (_t, p) => (p === "create" ? () => ({ getHandlerFunction: () => "", getUniqueId: () => "" }) : () => chain) });
  const ScriptApp = {
    newTrigger: () => chain, getProjectTriggers: () => [], deleteTrigger: () => {},
    getOAuthToken: () => "", getScriptId: () => "spary", getService: () => ({ getUrl: () => st.scriptUrl }),
    WeekDay: { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 7 },
    AuthMode: { FULL: "FULL", NONE: "NONE" }, invalidateAuth: () => {},
  };

  const ContentService = {
    createTextOutput: (s?: unknown) => {
      let content = s === undefined ? "" : String(s);
      // deno-lint-ignore no-explicit-any
      const o: any = { getContent: () => content, setContent: (c: unknown) => { content = String(c); return o; }, append: (c: unknown) => { content += String(c); return o; }, setMimeType: () => o, getMimeType: () => "application/json", downloadAsFile: () => o };
      return o;
    },
    MimeType: { JSON: "JSON", TEXT: "TEXT", JAVASCRIPT: "JAVASCRIPT", CSV: "CSV", XML: "XML", ICAL: "ICAL" },
  };
  const Session = {
    getScriptTimeZone: () => "Europe/Paris", getActiveUserLocale: () => "fr",
    getActiveUser: () => ({ getEmail: () => "" }), getEffectiveUser: () => ({ getEmail: () => "" }), getTemporaryActiveUserKey: () => "",
  };
  const log = (...x: unknown[]) => { a.logs.push(x.map((v) => typeof v === "string" ? v : JSON.stringify(v)).join(" ").slice(0, 2000)); };
  const Logger = { log: (...x: unknown[]) => { log(...x); return Logger; }, getLog: () => a.logs.join("\n"), clear: () => {} };
  const consoleX = { log, info: log, warn: log, error: log, time: () => {}, timeEnd: () => {} };
  const HtmlService = { createHtmlOutput: (s: string) => ContentService.createTextOutput(s), createTemplate: () => ({ evaluate: () => ContentService.createTextOutput("") }), XFrameOptionsMode: { ALLOWALL: 1 } };

  return {
    SpreadsheetApp, CacheService, LockService, PropertiesService, UrlFetchApp, Utilities, DriveApp, ScriptApp,
    ContentService, Session, Logger, console: consoleX, HtmlService, Date: DateCtor, Math: MathX,
  };
}
