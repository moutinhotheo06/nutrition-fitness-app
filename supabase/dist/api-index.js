// functions/api/index.ts
import postgres from "npm:postgres@3.4.9";

// functions/api/gas/shims.ts
import { createHash, createHmac, createSign, randomUUID } from "node:crypto";

// functions/api/gas/parisdate.ts
var TZ = "Europe/Paris";
var fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short"
});
var WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function parts(t) {
  const o = {};
  for (const p of fmt.formatToParts(new Date(t)))
    o[p.type] = p.value;
  return { y: +o.year, mo: +o.month - 1, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, ms: (t % 1000 + 1000) % 1000, wd: WD[o.weekday] };
}
function offsetAt(t) {
  const p = parts(t);
  return Date.UTC(p.y, p.mo, p.d, p.h, p.mi, p.s, p.ms) - t;
}
function parisToUtc(y, mo, d = 1, h = 0, mi = 0, s = 0, ms = 0) {
  const guess = Date.UTC(y, mo, d, h, mi, s, ms);
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return t;
}
var NativeDate = Date;
function parseLocal(str) {
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (m)
    return parisToUtc(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), +(m[7] || "0").padEnd(3, "0"));
  const m2 = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m2)
    return parisToUtc(+m2[1], +m2[2] - 1, +m2[3], +(m2[4] || 0), +(m2[5] || 0), +(m2[6] || 0));
  return NativeDate.parse(str);
}

class ParisDate extends NativeDate {
  constructor(...a) {
    if (a.length === 0)
      super(ParisDate._now());
    else if (a.length === 1) {
      const v = a[0];
      if (typeof v === "string")
        super(parseLocal(v));
      else if (v instanceof NativeDate)
        super(v.getTime());
      else
        super(v);
    } else
      super(parisToUtc(a[0], a[1], a.length > 2 ? a[2] : 1, a[3] || 0, a[4] || 0, a[5] || 0, a[6] || 0));
  }
  static _now = () => NativeDate.now();
  static now() {
    return ParisDate._now();
  }
  static parse(s) {
    return parseLocal(String(s));
  }
  static UTC(...a) {
    return NativeDate.UTC(...a);
  }
  _p() {
    return parts(this.getTime());
  }
  getFullYear() {
    return this._p().y;
  }
  getMonth() {
    return this._p().mo;
  }
  getDate() {
    return this._p().d;
  }
  getDay() {
    return this._p().wd;
  }
  getHours() {
    return this._p().h;
  }
  getMinutes() {
    return this._p().mi;
  }
  getSeconds() {
    return this._p().s;
  }
  getMilliseconds() {
    return this._p().ms;
  }
  getYear() {
    return this._p().y - 1900;
  }
  getTimezoneOffset() {
    return -Math.round(offsetAt(this.getTime()) / 60000);
  }
  _set(ch) {
    const p = { ...this._p(), ...ch };
    const t = parisToUtc(p.y, p.mo, p.d, p.h, p.mi, p.s, p.ms);
    this.setTime(t);
    return t;
  }
  setFullYear(y, mo, d) {
    return this._set({ y, ...mo !== undefined ? { mo } : {}, ...d !== undefined ? { d } : {} });
  }
  setMonth(mo, d) {
    return this._set({ mo, ...d !== undefined ? { d } : {} });
  }
  setDate(d) {
    return this._set({ d });
  }
  setHours(h, mi, s, ms) {
    return this._set({ h, ...mi !== undefined ? { mi } : {}, ...s !== undefined ? { s } : {}, ...ms !== undefined ? { ms } : {} });
  }
  setMinutes(mi, s, ms) {
    return this._set({ mi, ...s !== undefined ? { s } : {}, ...ms !== undefined ? { ms } : {} });
  }
  setSeconds(s, ms) {
    return this._set({ s, ...ms !== undefined ? { ms } : {} });
  }
  setMilliseconds(ms) {
    return this._set({ ms });
  }
  toLocaleDateString(l, o) {
    return new NativeDate(this.getTime()).toLocaleDateString(l, { timeZone: TZ, ...o || {} });
  }
  toLocaleTimeString(l, o) {
    return new NativeDate(this.getTime()).toLocaleTimeString(l, { timeZone: TZ, ...o || {} });
  }
  toLocaleString(l, o) {
    return new NativeDate(this.getTime()).toLocaleString(l, { timeZone: TZ, ...o || {} });
  }
  toString() {
    const p = this._p(), off = -this.getTimezoneOffset(), sg = off >= 0 ? "+" : "-", a = Math.abs(off);
    const z = (n, w = 2) => String(n).padStart(w, "0");
    const D = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${D[p.wd]} ${M[p.mo]} ${z(p.d)} ${p.y} ${z(p.h)}:${z(p.mi)}:${z(p.s)} GMT${sg}${z(Math.floor(a / 60))}${z(a % 60)} (CEST)`;
  }
}

// functions/api/gas/shims.ts
class BlobRef {
  id;
  constructor(id) {
    this.id = id;
  }
}
function fromStored(v) {
  if (v && typeof v === "object") {
    if ("$d" in v)
      return new ParisDate(v.$d);
    if ("$b" in v)
      return new BlobRef(v.$b);
  }
  return v;
}

class NeedError extends Error {
  constructor() {
    super("__gas_need__");
  }
}
function newAttempt(st, tape) {
  return { st, needs: { blobs: new Set, files: new Set, fetches: new Map, lock: false }, poisoned: false, tape, ti: { now: 0, rnd: 0, uuid: 0 }, logs: [] };
}
function need(a) {
  a.poisoned = true;
  throw new NeedError;
}
function guard(a) {
  if (a.poisoned)
    throw new NeedError;
}
var NUM_RE = /^[+-]?(\d+(,\d+)?|,\d+)([eE][+-]?\d+)?$/;
function coerceIn(v) {
  if (v === null || v === undefined)
    return "";
  if (v instanceof Date)
    return new ParisDate(v.getTime());
  if (typeof v === "number")
    return isFinite(v) ? v : "";
  if (typeof v === "boolean")
    return v;
  if (v instanceof BlobRef)
    return v;
  if (typeof v === "object")
    return String(v);
  let s = String(v);
  if (s.startsWith("'"))
    return s.slice(1);
  const t = s.trim();
  if (t !== s)
    s = s;
  if (t === s && t.length && t.length <= 30) {
    if (NUM_RE.test(t)) {
      const n = Number(t.replace(",", "."));
      if (isFinite(n))
        return n;
    }
    if (/^(TRUE|FALSE|VRAI|FAUX)$/i.test(t))
      return /^(TRUE|VRAI)$/i.test(t);
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m)
      return new ParisDate(+m[1], +m[2] - 1, +m[3]);
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m && +m[2] <= 12 && +m[1] <= 31)
      return new ParisDate(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  return s;
}
function outVal(a, v) {
  if (v instanceof BlobRef) {
    const s = a.st.blobs.get(v.id);
    if (s === undefined) {
      a.needs.blobs.add(v.id);
      need(a);
    }
    return s;
  }
  if (v instanceof Date)
    return new ParisDate(v.getTime());
  return v;
}
function colToNum(c) {
  let n = 0;
  for (const ch of c.toUpperCase())
    n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function numToCol(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function makeSheet(a, sh) {
  const dirty = () => {
    sh.dirty = true;
  };
  const lastRow = () => {
    for (let i = sh.rows.length - 1;i >= 0; i--)
      if (sh.rows[i].some((x) => x !== ""))
        return i + 1;
    return 0;
  };
  const lastCol = () => {
    let m = 0;
    for (const r of sh.rows)
      for (let j = r.length - 1;j >= m; j--)
        if (r[j] !== "") {
          m = j + 1;
          break;
        }
    return m;
  };
  const setCell = (r, c, v) => {
    while (sh.rows.length < r)
      sh.rows.push([]);
    const row = sh.rows[r - 1];
    while (row.length < c)
      row.push("");
    row[c - 1] = coerceIn(v);
  };
  const getCell = (r, c) => {
    const row = sh.rows[r - 1];
    return row && c - 1 < row.length ? row[c - 1] : "";
  };
  function range(r, c, nr, nc) {
    if (r < 1 || c < 1 || nr < 1 || nc < 1)
      throw new Error("Les coordonnées de la plage sont en dehors des dimensions de la feuille.");
    const R = {
      getValues() {
        guard(a);
        const out = [];
        for (let i = 0;i < nr; i++) {
          const row = [];
          for (let j = 0;j < nc; j++)
            row.push(outVal(a, getCell(r + i, c + j)));
          out.push(row);
        }
        return out;
      },
      getDisplayValues() {
        return R.getValues().map((row) => row.map((x) => x instanceof Date ? Utilities.formatDate(x, "Europe/Paris", "dd/MM/yyyy HH:mm:ss") : String(x)));
      },
      getValue() {
        guard(a);
        return outVal(a, getCell(r, c));
      },
      getDisplayValue() {
        const v = R.getValue;
        const x = v();
        return x instanceof Date ? Utilities.formatDate(x, "Europe/Paris", "dd/MM/yyyy HH:mm:ss") : String(x);
      },
      getFormulas() {
        return R.getValues().map((row) => row.map(() => ""));
      },
      getFormula() {
        return "";
      },
      setValue(v) {
        guard(a);
        for (let i = 0;i < nr; i++)
          for (let j = 0;j < nc; j++)
            setCell(r + i, c + j, v);
        dirty();
        return R;
      },
      setValues(vs) {
        guard(a);
        if (!Array.isArray(vs) || vs.length !== nr || vs.some((x) => !Array.isArray(x) || x.length !== nc))
          throw new Error("Le nombre de lignes ou de colonnes des données ne correspond pas à la plage.");
        for (let i = 0;i < nr; i++)
          for (let j = 0;j < nc; j++)
            setCell(r + i, c + j, vs[i][j]);
        dirty();
        return R;
      },
      clearContent() {
        guard(a);
        for (let i = 0;i < nr; i++)
          for (let j = 0;j < nc; j++)
            if (sh.rows[r + i - 1])
              setCell(r + i, c + j, "");
        dirty();
        return R;
      },
      clear() {
        return R.clearContent();
      },
      getRow: () => r,
      getColumn: () => c,
      getNumRows: () => nr,
      getNumColumns: () => nc,
      getLastRow: () => r + nr - 1,
      getLastColumn: () => c + nc - 1,
      getA1Notation: () => numToCol(c) + r + (nr > 1 || nc > 1 ? ":" + numToCol(c + nc - 1) + (r + nr - 1) : ""),
      getSheet: () => S,
      offset: (dr, dc, nr2, nc2) => range(r + dr, c + dc, nr2 || nr, nc2 || nc),
      sort() {
        return R;
      }
    };
    for (const k of ["setFontWeight", "setNumberFormat", "setBackground", "setFontColor", "setNote", "setWrap", "setHorizontalAlignment", "setFontSize", "setBorder", "protect", "activate", "setDataValidation", "setFormula"])
      R[k] = () => R;
    return R;
  }
  const S = {
    getName: () => sh.name,
    setName: (n) => {
      sh.name = String(n);
      dirty();
      return S;
    },
    getSheetName: () => sh.name,
    getLastRow: () => {
      guard(a);
      return lastRow();
    },
    getLastColumn: () => {
      guard(a);
      return lastCol();
    },
    getMaxRows: () => Math.max(1000, sh.rows.length),
    getMaxColumns: () => Math.max(26, lastCol()),
    getDataRange: () => {
      guard(a);
      return range(1, 1, Math.max(1, lastRow()), Math.max(1, lastCol()));
    },
    getRange: (r, c, nr, nc) => {
      guard(a);
      if (typeof r === "string") {
        const m = r.replace(/^.*!/, "").match(/^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/i);
        if (!m)
          throw new Error("Plage introuvable : " + r);
        const c1 = colToNum(m[1]), r1 = m[2] ? +m[2] : 1, c2 = m[3] ? colToNum(m[3]) : c1, r2 = m[4] ? +m[4] : m[2] && !m[3] ? r1 : Math.max(1, lastRow());
        return range(r1, c1, r2 - r1 + 1, c2 - c1 + 1);
      }
      return range(Number(r), Number(c), nr === undefined ? 1 : Number(nr), nc === undefined ? 1 : Number(nc));
    },
    appendRow: (vals) => {
      guard(a);
      const at = lastRow();
      sh.rows.length = at;
      sh.rows.push((Array.isArray(vals) ? vals : [vals]).map(coerceIn));
      dirty();
      return S;
    },
    deleteRow: (i) => {
      guard(a);
      if (i >= 1 && i <= sh.rows.length)
        sh.rows.splice(i - 1, 1);
      dirty();
      return S;
    },
    deleteRows: (i, n) => {
      guard(a);
      if (i >= 1)
        sh.rows.splice(i - 1, n);
      dirty();
      return S;
    },
    insertRowBefore: (i) => {
      guard(a);
      sh.rows.splice(i - 1, 0, []);
      dirty();
      return S;
    },
    insertRowAfter: (i) => {
      guard(a);
      sh.rows.splice(i, 0, []);
      dirty();
      return S;
    },
    insertRowsAfter: (i, n) => {
      guard(a);
      sh.rows.splice(i, 0, ...Array.from({ length: n }, () => []));
      dirty();
      return S;
    },
    clearContents: () => {
      guard(a);
      sh.rows = [];
      dirty();
      return S;
    },
    clear: () => {
      guard(a);
      sh.rows = [];
      dirty();
      return S;
    },
    getSheetId: () => Math.abs(hashCode(sh.name)),
    getParent: () => SS,
    activate: () => S
  };
  for (const k of ["setFrozenRows", "setFrozenColumns", "hideSheet", "showSheet", "autoResizeColumns", "setColumnWidth", "setTabColor", "protect", "hideColumns"])
    S[k] = () => S;
  let SS = null;
  return { S, bind: (ss) => {
    SS = ss;
  } };
}
function hashCode(s) {
  let h = 0;
  for (let i = 0;i < s.length; i++)
    h = h * 31 + s.charCodeAt(i) | 0;
  return h;
}
var Utilities;
function buildGlobals(a) {
  const st = a.st;
  const now = () => {
    const t = a.tape.now;
    const i = a.ti.now++;
    if (i < t.length)
      return t[i];
    const v = Math.max(Date.now(), t.length ? t[t.length - 1] : 0);
    t.push(v);
    return v;
  };
  const rnd = () => {
    const t = a.tape.rnd;
    const i = a.ti.rnd++;
    if (i < t.length)
      return t[i];
    const v = Math.random();
    t.push(v);
    return v;
  };
  const uuid = () => {
    const t = a.tape.uuid;
    const i = a.ti.uuid++;
    if (i < t.length)
      return t[i];
    const v = randomUUID();
    t.push(v);
    return v;
  };

  class D extends ParisDate {
    constructor(...x) {
      if (x.length === 0)
        super(now());
      else
        super(...x);
    }
    static now() {
      return now();
    }
  }
  const DateCtor = function(...x) {
    if (!new.target)
      return new D().toString();
    return new D(...x);
  };
  DateCtor.prototype = D.prototype;
  DateCtor.now = D.now;
  DateCtor.parse = ParisDate.parse;
  DateCtor.UTC = Date.UTC;
  Object.defineProperty(DateCtor, Symbol.hasInstance, { value: (o) => o instanceof Date });
  const MathX = Object.create(Math);
  MathX.random = rnd;
  const sheetObjs = new Map;
  const sheetObj = (sh) => {
    let o = sheetObjs.get(sh);
    if (!o) {
      const m = makeSheet(a, sh);
      m.bind(SS);
      o = m.S;
      sheetObjs.set(sh, o);
    }
    return o;
  };
  const SS = {
    getSheetByName: (n) => {
      guard(a);
      const sh = st.sheets.find((x) => x.name === String(n));
      return sh ? sheetObj(sh) : null;
    },
    insertSheet: (n) => {
      guard(a);
      const name = n ? String(n) : "Feuille " + (st.sheets.length + 1);
      if (st.sheets.some((x) => x.name === name))
        throw new Error("Une feuille nommée « " + name + " » existe déjà.");
      const sh = { name, rows: [], dirty: true, created: true };
      st.sheets.push(sh);
      return sheetObj(sh);
    },
    getSheets: () => {
      guard(a);
      return st.sheets.map(sheetObj);
    },
    getActiveSheet: () => sheetObj(st.sheets[0]),
    getId: () => "spary-main",
    getName: () => "BDD Spary",
    getUrl: () => "https://supabase.com",
    getSpreadsheetTimeZone: () => "Europe/Paris",
    getSpreadsheetLocale: () => "fr_FR",
    copy: () => SS,
    toast: () => {}
  };
  const scratch = () => {
    const local = [{ name: "Feuille 1", rows: [], dirty: false }];
    const sub = { ...a, st: { ...st, sheets: local } };
    const o = {
      getSheetByName: (n) => {
        const sh = local.find((x) => x.name === n);
        return sh ? makeSheet(sub, sh).S : null;
      },
      insertSheet: (n) => {
        const sh = { name: n, rows: [], dirty: true };
        local.push(sh);
        return makeSheet(sub, sh).S;
      },
      getSheets: () => local.map((sh) => makeSheet(sub, sh).S),
      getId: () => "scratch",
      getUrl: () => "",
      getName: () => "copie",
      deleteSheet: () => {},
      copy: () => o
    };
    return o;
  };
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => SS,
    getActive: () => SS,
    openById: (id) => id === "spary-main" ? SS : scratch(),
    openByUrl: () => scratch(),
    create: () => scratch(),
    flush: () => {},
    getUi: () => {
      throw new Error("Pas d'interface en dehors de Google Sheets.");
    }
  };
  const cache = {
    get: (k) => {
      guard(a);
      const e = st.cache.get(String(k));
      return e && e.exp > now() ? e.v : null;
    },
    put: (k, v, ttl) => {
      guard(a);
      const s = String(v);
      if (s.length > 1e5)
        throw new Error("Valeur trop grande pour le cache.");
      st.cache.set(String(k), { v: s, exp: now() + Math.min(21600, Math.max(1, Number(ttl) || 600)) * 1000 });
      st.cacheDirty.add(String(k));
    },
    remove: (k) => {
      guard(a);
      st.cache.delete(String(k));
      st.cacheDirty.add(String(k));
    },
    getAll: (ks) => {
      const o = {};
      (ks || []).forEach((k) => {
        const v = cache.get(k);
        if (v !== null)
          o[k] = v;
      });
      return o;
    },
    putAll: (o, ttl) => {
      Object.keys(o || {}).forEach((k) => cache.put(k, o[k], ttl));
    },
    removeAll: (ks) => {
      (ks || []).forEach((k) => cache.remove(k));
    }
  };
  const CacheService = { getScriptCache: () => cache, getUserCache: () => cache, getDocumentCache: () => cache };
  const lock = {
    waitLock: () => {
      guard(a);
      if (!st.locked) {
        a.needs.lock = true;
        need(a);
      }
    },
    tryLock: () => {
      guard(a);
      if (!st.locked) {
        a.needs.lock = true;
        need(a);
      }
      return true;
    },
    releaseLock: () => {},
    hasLock: () => st.locked
  };
  const LockService = { getScriptLock: () => lock, getDocumentLock: () => lock, getUserLock: () => lock };
  const props = {
    getProperty: (k) => {
      const e = st.env("GAS_" + k);
      if (e)
        return e;
      const v = st.props.get(String(k));
      return v === undefined ? null : v;
    },
    setProperty: (k, v) => {
      if (["PEPPER", "VAPID_PRIVATE", "VAPID_PUBLIC"].includes(String(k)) && !st.env("GAS_" + k))
        throw new Error(k + " absent des secrets Supabase : refus d'en créer un nouveau (mots de passe ou notifications cassés).");
      st.props.set(String(k), String(v));
      st.propsDirty.add(String(k));
      return props;
    },
    deleteProperty: (k) => {
      st.props.delete(String(k));
      st.propsDirty.add(String(k));
      return props;
    },
    getProperties: () => Object.fromEntries(st.props),
    setProperties: (o) => {
      Object.keys(o || {}).forEach((k) => props.setProperty(k, o[k]));
      return props;
    },
    getKeys: () => [...st.props.keys()]
  };
  const PropertiesService = { getScriptProperties: () => props, getUserProperties: () => props, getDocumentProperties: () => props };
  function makeBlob(bytes, mime = "application/octet-stream", name = "") {
    const b = {
      getBytes: () => toSigned(bytes),
      getDataAsString: (cs) => new TextDecoder(cs && /latin|iso/i.test(cs) ? "latin1" : "utf-8").decode(bytes),
      getContentType: () => mime,
      setContentType: (m) => {
        mime = m;
        return b;
      },
      getName: () => name,
      setName: (n) => {
        name = n;
        return b;
      },
      getAs: () => b,
      copyBlob: () => makeBlob(bytes, mime, name),
      isGoogleType: () => false,
      _raw: bytes
    };
    return b;
  }
  const toBytes = (x) => {
    if (x instanceof Uint8Array)
      return x;
    if (Array.isArray(x))
      return Uint8Array.from(x.map((n) => Number(n) & 255));
    if (x && typeof x === "object" && "_raw" in x)
      return x._raw;
    return new TextEncoder().encode(String(x ?? ""));
  };
  const toSigned = (u) => Array.from(u, (n) => n > 127 ? n - 256 : n);
  const b64 = (u) => {
    let s = "";
    for (let i = 0;i < u.length; i += 32768)
      s += String.fromCharCode(...u.subarray(i, i + 32768));
    return btoa(s);
  };
  const unb64 = (s) => {
    const bin = atob(String(s).replace(/\s+/g, ""));
    const u = new Uint8Array(bin.length);
    for (let i = 0;i < bin.length; i++)
      u[i] = bin.charCodeAt(i);
    return u;
  };
  const FR_DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const FR_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  Utilities = {
    formatDate: (d, _tz, f) => {
      const p = parts(new Date(d).getTime());
      const z = (n, w) => String(n).padStart(w, "0");
      let out = "", i = 0;
      const s = String(f);
      while (i < s.length) {
        const ch = s[i];
        if (ch === "'") {
          const j = s.indexOf("'", i + 1);
          if (j === i + 1) {
            out += "'";
            i += 2;
            continue;
          }
          out += s.slice(i + 1, j < 0 ? s.length : j);
          i = j < 0 ? s.length : j + 1;
          continue;
        }
        let n = 1;
        while (s[i + n] === ch)
          n++;
        const tok = ch.repeat(n);
        switch (ch) {
          case "y":
            out += n === 2 ? z(p.y % 100, 2) : z(p.y, 4);
            break;
          case "M":
            out += n >= 4 ? FR_MONTHS[p.mo] : n === 3 ? FR_MONTHS[p.mo].slice(0, 3) + "." : z(p.mo + 1, n);
            break;
          case "d":
            out += z(p.d, n);
            break;
          case "H":
            out += z(p.h, n);
            break;
          case "h":
            out += z(p.h % 12 || 12, n);
            break;
          case "m":
            out += z(p.mi, n);
            break;
          case "s":
            out += z(p.s, n);
            break;
          case "S":
            out += z(p.ms, 3).slice(0, n);
            break;
          case "E":
            out += n >= 4 ? FR_DAYS[p.wd] : FR_DAYS[p.wd].slice(0, 3) + ".";
            break;
          case "u":
            out += String(p.wd === 0 ? 7 : p.wd);
            break;
          case "a":
            out += p.h < 12 ? "AM" : "PM";
            break;
          case "Z": {
            const off = -new ParisDate(new Date(d).getTime()).getTimezoneOffset();
            out += (off >= 0 ? "+" : "-") + z(Math.floor(Math.abs(off) / 60), 2) + z(Math.abs(off) % 60, 2);
            break;
          }
          case "X": {
            const off = -new ParisDate(new Date(d).getTime()).getTimezoneOffset();
            out += (off >= 0 ? "+" : "-") + z(Math.floor(Math.abs(off) / 60), 2) + (n >= 3 ? ":" : "") + (n >= 2 ? z(Math.abs(off) % 60, 2) : "");
            break;
          }
          default:
            out += tok;
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
    RsaAlgorithm: { RSA_SHA_1: "sha1", RSA_SHA_256: "sha256" },
    computeDigest: (alg, v) => toSigned(createHash(alg).update(toBytes(v)).digest()),
    computeHmacSha256Signature: (v, k) => toSigned(createHmac("sha256", toBytes(k)).update(toBytes(v)).digest()),
    computeHmacSignature: (alg, v, k) => toSigned(createHmac(alg, toBytes(k)).update(toBytes(v)).digest()),
    computeRsaSha256Signature: (v, key) => toSigned(createSign("RSA-SHA256").update(toBytes(v)).sign(String(key))),
    computeRsaSignature: (alg, v, key) => toSigned(createSign(/256/.test(String(alg)) ? "RSA-SHA256" : "RSA-SHA1").update(toBytes(v)).sign(String(key))),
    base64Encode: (v) => b64(toBytes(v)),
    base64EncodeWebSafe: (v) => b64(toBytes(v)).replace(/\+/g, "-").replace(/\//g, "_"),
    base64Decode: (s) => toSigned(unb64(s)),
    base64DecodeWebSafe: (s) => toSigned(unb64(String(s).replace(/-/g, "+").replace(/_/g, "/"))),
    newBlob: (data, mime, name) => makeBlob(toBytes(data), mime, name),
    jsonStringify: (o) => JSON.stringify(o),
    jsonParse: (s) => JSON.parse(s),
    parseCsv: (s) => String(s).split(/\r?\n/).map((l) => l.split(","))
  };
  const reqKey = (r) => JSON.stringify([r.url, r.opts]);
  const normOpts = (o) => {
    o = o || {};
    let payload = o.payload;
    if (payload && typeof payload === "object" && !(payload instanceof Uint8Array) && !("_raw" in payload)) {
      if (Array.isArray(payload))
        payload = { $bytes: b64(toBytes(payload)) };
      else
        payload = { $form: payload };
    } else if (payload && typeof payload === "object")
      payload = { $bytes: b64(toBytes(payload)) };
    return { method: String(o.method || "get").toUpperCase(), headers: o.headers || {}, contentType: o.contentType || null, payload: payload ?? null, mute: !!o.muteHttpExceptions, follow: o.followRedirects !== false };
  };
  const response = (r) => {
    const k = reqKey(r);
    const get = () => {
      const m = st.fetchMemo.get(k);
      if (!m) {
        a.needs.fetches.set(k, r);
        need(a);
      }
      if (m.code >= 400 && !r.opts.mute)
        throw new Error("Échec de la requête pour " + r.url + ". Code renvoyé : " + m.code);
      return m;
    };
    if (!st.fetchMemo.has(k))
      a.needs.fetches.set(k, r);
    return {
      getResponseCode: () => get().code,
      getContentText: () => get().text,
      getContent: () => toSigned(get().b64 ? unb64(get().b64) : new TextEncoder().encode(get().text)),
      getBlob: () => {
        const m = get();
        return makeBlob(m.b64 ? unb64(m.b64) : new TextEncoder().encode(m.text), m.headers["content-type"] || "");
      },
      getHeaders: () => get().headers,
      getAllHeaders: () => get().headers
    };
  };
  const UrlFetchApp = {
    fetch: (url, o) => {
      guard(a);
      return response({ url: String(url), opts: normOpts(o) });
    },
    fetchAll: (list) => {
      guard(a);
      return (list || []).map((x) => typeof x === "string" ? response({ url: x, opts: normOpts({}) }) : response({ url: String(x.url), opts: normOpts(x) }));
    },
    getRequest: (url, o) => ({ url, ...normOpts(o) })
  };
  const fileObj = (id) => {
    const f = st.files.get(id);
    if (!f) {
      a.needs.files.add(id);
      need(a);
    }
    const o = {
      getId: () => id,
      getName: () => f.name,
      getMimeType: () => f.mime,
      getSize: () => unb64(f.b64).length,
      getBlob: () => makeBlob(unb64(f.b64), f.mime, f.name),
      getAs: () => o.getBlob(),
      setTrashed: (t) => {
        f.trashed = !!t;
        st.filesDirty.add(id);
        return o;
      },
      isTrashed: () => f.trashed,
      getUrl: () => st.scriptUrl + "?file=" + id,
      getDownloadUrl: () => st.scriptUrl + "?file=" + id,
      setSharing: () => o,
      setDescription: () => o,
      setName: (n) => {
        f.name = n;
        st.filesDirty.add(id);
        return o;
      },
      moveTo: () => o,
      getParents: () => ({ hasNext: () => false })
    };
    return o;
  };
  const createFile = (folder, x, content, mime) => {
    guard(a);
    const id = "f" + uuid().replace(/-/g, "");
    let bytes, name, mt;
    if (typeof x === "string") {
      name = x;
      bytes = toBytes(content);
      mt = mime || "text/plain";
    } else {
      bytes = toBytes(x);
      name = x?.getName?.() || "fichier";
      mt = x?.getContentType?.() || "application/octet-stream";
    }
    st.files.set(id, { name, mime: mt, b64: b64(bytes), trashed: false, folder });
    st.filesDirty.add(id);
    return fileObj(id);
  };
  const folderObj = (fid) => ({
    getId: () => fid,
    getName: () => fid,
    createFile: (x, c, m) => createFile(fid, x, c, m),
    setSharing: function() {
      return this;
    },
    setTrashed: function() {
      return this;
    },
    getUrl: () => ""
  });
  const DriveApp = {
    createFile: (x, c, m) => createFile("", x, c, m),
    getFileById: (id) => {
      guard(a);
      return fileObj(String(id));
    },
    getFolderById: (id) => folderObj(String(id)),
    createFolder: (n) => folderObj("dossier-" + String(n).slice(0, 20)),
    getRootFolder: () => folderObj("racine"),
    Access: { PRIVATE: "PRIVATE", ANYONE: "ANYONE", ANYONE_WITH_LINK: "ANYONE_WITH_LINK" },
    Permission: { VIEW: "VIEW", NONE: "NONE" }
  };
  const chain = new Proxy({}, { get: (_t, p) => p === "create" ? () => ({ getHandlerFunction: () => "", getUniqueId: () => "" }) : () => chain });
  const ScriptApp = {
    newTrigger: () => chain,
    getProjectTriggers: () => [],
    deleteTrigger: () => {},
    getOAuthToken: () => "",
    getScriptId: () => "spary",
    getService: () => ({ getUrl: () => st.scriptUrl }),
    WeekDay: { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 7 },
    AuthMode: { FULL: "FULL", NONE: "NONE" },
    invalidateAuth: () => {}
  };
  const ContentService = {
    createTextOutput: (s) => {
      let content = s === undefined ? "" : String(s);
      const o = { getContent: () => content, setContent: (c) => {
        content = String(c);
        return o;
      }, append: (c) => {
        content += String(c);
        return o;
      }, setMimeType: () => o, getMimeType: () => "application/json", downloadAsFile: () => o };
      return o;
    },
    MimeType: { JSON: "JSON", TEXT: "TEXT", JAVASCRIPT: "JAVASCRIPT", CSV: "CSV", XML: "XML", ICAL: "ICAL" }
  };
  const Session = {
    getScriptTimeZone: () => "Europe/Paris",
    getActiveUserLocale: () => "fr",
    getActiveUser: () => ({ getEmail: () => "" }),
    getEffectiveUser: () => ({ getEmail: () => "" }),
    getTemporaryActiveUserKey: () => ""
  };
  const log = (...x) => {
    a.logs.push(x.map((v) => typeof v === "string" ? v : JSON.stringify(v)).join(" ").slice(0, 2000));
  };
  const Logger = { log: (...x) => {
    log(...x);
    return Logger;
  }, getLog: () => a.logs.join(`
`), clear: () => {} };
  const consoleX = { log, info: log, warn: log, error: log, time: () => {}, timeEnd: () => {} };
  const HtmlService = { createHtmlOutput: (s) => ContentService.createTextOutput(s), createTemplate: () => ({ evaluate: () => ContentService.createTextOutput("") }), XFrameOptionsMode: { ALLOWALL: 1 } };
  return {
    SpreadsheetApp,
    CacheService,
    LockService,
    PropertiesService,
    UrlFetchApp,
    Utilities,
    DriveApp,
    ScriptApp,
    ContentService,
    Session,
    Logger,
    console: consoleX,
    HtmlService,
    Date: DateCtor,
    Math: MathX
  };
}

// functions/api/gas/engine.ts
var LOCK_KEY = 732114;
var BLOB_MIN = 4000;
var MAX_ATTEMPTS = 10;
var GLOBAL_NAMES = ["SpreadsheetApp", "CacheService", "LockService", "PropertiesService", "UrlFetchApp", "Utilities", "DriveApp", "ScriptApp", "ContentService", "Session", "Logger", "console", "HtmlService", "Date", "Math", "MailApp", "GmailApp"];
var compiled = null;
var compiledFor = "";
function compile(code) {
  if (compiled && compiledFor === code)
    return;
  const body = code + `
;return {
  doPost: typeof doPost === "function" ? doPost : null,
  doGet: typeof doGet === "function" ? doGet : null,
  call: function (n, args) { var f = eval(n); if (typeof f !== "function") throw new Error("Fonction inconnue : " + n); return f.apply(null, args || []); }
};`;
  compiled = new Function(...GLOBAL_NAMES, body);
  compiledFor = code;
}
async function loadState(q, env, scriptUrl, keep) {
  const [sheets, props, cache] = await Promise.all([
    q`select name, data from gas_sheets order by pos, name`,
    q`select key, value from gas_props`,
    q`select key, value, (extract(epoch from expires_at) * 1000)::float8 as exp from gas_cache where expires_at > now()`
  ]);
  return {
    sheets: sheets.map((r) => ({ name: r.name, rows: (r.data || []).map((row) => row.map(fromStored)), dirty: false })),
    blobs: keep?.blobs || new Map,
    props: new Map(props.map((r) => [r.key, r.value])),
    propsDirty: new Set,
    cache: new Map(cache.map((r) => [r.key, { v: r.value, exp: r.exp }])),
    cacheDirty: new Set,
    files: keep?.files || new Map,
    filesDirty: new Set,
    fetchMemo: keep?.fetchMemo || new Map,
    env,
    locked: false,
    scriptUrl
  };
}
async function sha1(s) {
  const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function toStoredRows(rows, newBlobs) {
  let last = rows.length;
  while (last > 0 && !(rows[last - 1] || []).some((x) => x !== ""))
    last--;
  const out = [];
  for (let i = 0;i < last; i++) {
    const r = rows[i] || [];
    let n = r.length;
    while (n > 0 && r[n - 1] === "")
      n--;
    const row = [];
    for (let j = 0;j < n; j++) {
      const v = r[j];
      if (v instanceof BlobRef)
        row.push({ $b: v.id });
      else if (v instanceof Date)
        row.push({ $d: v.getTime() });
      else if (typeof v === "string" && v.length > BLOB_MIN) {
        const id = await sha1(v);
        newBlobs.set(id, v);
        row.push({ $b: id });
      } else
        row.push(v);
    }
    out.push(row);
  }
  return out;
}
async function flush(tx, st) {
  const newBlobs = new Map;
  for (const [i, sh] of st.sheets.entries()) {
    if (!sh.dirty)
      continue;
    const data = await toStoredRows(sh.rows, newBlobs);
    await tx`insert into gas_sheets (name, pos, data, updated_at) values (${sh.name}, ${i}, ${tx.json(data)}, now())
      on conflict (name) do update set data = excluded.data, updated_at = now()`;
  }
  for (const [id, v] of newBlobs)
    await tx`insert into gas_blobs (id, value) values (${id}, ${v}) on conflict (id) do nothing`;
  await flushSide(tx, st);
}
async function flushSide(q, st) {
  for (const k of st.propsDirty) {
    const v = st.props.get(k);
    if (v === undefined)
      await q`delete from gas_props where key = ${k}`;
    else
      await q`insert into gas_props (key, value) values (${k}, ${v}) on conflict (key) do update set value = excluded.value`;
  }
  for (const k of st.cacheDirty) {
    const e = st.cache.get(k);
    if (!e)
      await q`delete from gas_cache where key = ${k}`;
    else
      await q`insert into gas_cache (key, value, expires_at) values (${k}, ${e.v}, to_timestamp(${e.exp / 1000}))
      on conflict (key) do update set value = excluded.value, expires_at = excluded.expires_at`;
  }
  for (const id of st.filesDirty) {
    const f = st.files.get(id);
    if (!f)
      continue;
    await q`insert into gas_files (id, name, mime, b64, trashed, folder) values (${id}, ${f.name}, ${f.mime}, ${f.b64}, ${f.trashed}, ${f.folder})
      on conflict (id) do update set name = excluded.name, trashed = excluded.trashed`;
  }
}
async function resolveNeeds(q, st, at) {
  const ids = [...at.needs.blobs].filter((id) => !st.blobs.has(id));
  if (ids.length)
    for (const r of await q`select id, value from gas_blobs where id = any(${ids})`)
      st.blobs.set(r.id, r.value);
  for (const id of ids)
    if (!st.blobs.has(id))
      st.blobs.set(id, "");
  const fids = [...at.needs.files].filter((id) => !st.files.has(id));
  if (fids.length)
    for (const r of await q`select id, name, mime, b64, trashed, folder from gas_files where id = any(${fids})`)
      st.files.set(r.id, { name: r.name, mime: r.mime, b64: r.b64, trashed: r.trashed, folder: r.folder });
  const missing = fids.filter((id) => !st.files.has(id));
  if (missing.length)
    throw new Error("Fichier introuvable : " + missing[0]);
  const todo = [...at.needs.fetches].filter(([k]) => !st.fetchMemo.has(k));
  await Promise.all(todo.map(async ([k, r]) => st.fetchMemo.set(k, await doFetch(r))));
}
async function doFetch(r) {
  const o = r.opts;
  const headers = { ...o.headers || {} };
  let body;
  const p = o.payload;
  if (p && typeof p === "object" && p.$form) {
    body = new URLSearchParams(p.$form);
    headers["content-type"] ||= "application/x-www-form-urlencoded";
  } else if (p && typeof p === "object" && p.$bytes) {
    body = Uint8Array.from(atob(p.$bytes), (c) => c.charCodeAt(0));
  } else if (typeof p === "string")
    body = p;
  if (o.contentType)
    headers["content-type"] = o.contentType;
  try {
    const res = await fetch(r.url, { method: o.method === "GET" && body ? "POST" : o.method, headers, body: o.method === "GET" ? undefined : body, redirect: o.follow ? "follow" : "manual", signal: AbortSignal.timeout(20000) });
    const buf = new Uint8Array(await res.arrayBuffer());
    const h = {};
    res.headers.forEach((v, k) => {
      h[k] = v;
    });
    const ct = h["content-type"] || "";
    const isText = !ct || /text|json|xml|javascript|html|urlencoded/.test(ct);
    let b64;
    if (!isText) {
      let s = "";
      for (let i = 0;i < buf.length; i += 32768)
        s += String.fromCharCode(...buf.subarray(i, i + 32768));
      b64 = btoa(s);
    }
    return { code: res.status, text: isText ? new TextDecoder().decode(buf) : "", headers: h, b64 };
  } catch (e) {
    return { code: 599, text: String(e?.message || e), headers: {} };
  }
}
var learnedWrites = new Set;
async function sendPending(st, at) {
  const todo = [...at.needs.fetches].filter(([k]) => !st.fetchMemo.has(k));
  await Promise.all(todo.map(async ([k, r]) => st.fetchMemo.set(k, await doFetch(r))));
}
async function runGas(o, entry) {
  compile(o.code);
  const key = entry.kind === "post" ? "post:" + entry.action : entry.kind === "call" ? "call:" + entry.fn : "get";
  const tape = { now: [], rnd: [], uuid: [] };
  let wantLock = !!o.writeHint || learnedWrites.has(key) || entry.kind === "call";
  let st = await loadState(o.sql, o.env, o.scriptUrl);
  let attempt = 0;
  while (!wantLock) {
    if (++attempt > MAX_ATTEMPTS)
      throw new Error("Trop d'essais pour " + key);
    const at = newAttempt(st, tape);
    const out = execute(at, entry);
    if (at.poisoned) {
      if (at.needs.lock) {
        wantLock = true;
        learnedWrites.add(key);
        break;
      }
      await resolveNeeds(o.sql, st, at);
      st = await loadState(o.sql, o.env, o.scriptUrl, st);
      continue;
    }
    if (st.sheets.some((s) => s.dirty) || st.propsDirty.size || st.filesDirty.size) {
      wantLock = true;
      learnedWrites.add(key);
      break;
    }
    if (st.cacheDirty.size)
      await flushSide(o.sql, st);
    await sendPending(st, at);
    return { out, logs: at.logs, attempts: attempt };
  }
  let done = null;
  await o.sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${LOCK_KEY})`;
    for (;; ) {
      if (++attempt > MAX_ATTEMPTS)
        throw new Error("Trop d'essais pour " + key);
      st = await loadState(tx, o.env, o.scriptUrl, st);
      st.locked = true;
      const at = newAttempt(st, tape);
      const out = execute(at, entry);
      if (at.poisoned) {
        await resolveNeeds(tx, st, at);
        continue;
      }
      await flush(tx, st);
      done = { out, logs: at.logs, at };
      return;
    }
  });
  const d = done;
  await sendPending(st, d.at);
  return { out: d.out, logs: d.logs, attempts: attempt };
}
function execute(at, entry) {
  const g = buildGlobals(at);
  const mail = () => {
    throw new Error("MailApp n'est pas disponible : les e-mails passent par Resend.");
  };
  try {
    const api = compiled(...GLOBAL_NAMES.map((n) => n === "MailApp" || n === "GmailApp" ? { sendEmail: mail } : g[n]));
    if (entry.kind === "post") {
      if (!api.doPost)
        throw new Error("doPost absent");
      const res = api.doPost({ postData: { contents: entry.body, type: "text/plain", length: entry.body.length }, parameter: {}, parameters: {}, contentLength: entry.body.length });
      return res && typeof res.getContent === "function" ? res.getContent() : String(res ?? "");
    }
    if (entry.kind === "get") {
      if (!api.doGet)
        return "";
      const res = api.doGet({ parameter: entry.params, parameters: {}, queryString: "" });
      return res && typeof res.getContent === "function" ? res.getContent() : String(res ?? "");
    }
    const r = api.call(entry.fn, entry.args);
    return JSON.stringify(r ?? null);
  } catch (e) {
    if (e instanceof NeedError || at.poisoned) {
      at.poisoned = true;
      return "";
    }
    throw e;
  }
}

// functions/api/gas/bundle.ts
var CODE = `
// ===== 01-Code.gs =====
/**
 * Spary — API Google Apps Script v2
 * Comptes : colonnes A..K = Date | Nom | Prénom | Email | Téléphone | Naissance | Pseudo | Mot de passe (haché) | Newsletter | Consentement | Club
 * Onglet "Annonces" (créé tout seul) : id | pseudo | prénom | type | titre | texte | date
 * Messagerie : onglet "Messages" (créé tout seul) : id | de | à | texte | date(ms). Actions msgSend / msgSync.
 * Profils : onglet "Profils" (créé tout seul) : pseudo | données (JSON) | photo (data URL) | mis à jour (ms). Présence en ligne : cache (aucune écriture dans la feuille).
 * Recherche de membres : action "userSearch" (pseudo + prénom uniquement).
 * Séances, matchs, coachs, likes, commentaires : voir la section « Données réelles » en bas du fichier.
 * Onglet des comptes : "Comptes" (sinon le premier onglet est utilisé). L'onglet "Sessions" est créé tout seul.
 */
var SHEET_ACCOUNTS = "Comptes";
var SHEET_SESSIONS = "Sessions";
var SHEET_PROFILES = "Profils";
var SESSION_DAYS = 90;
var MAX_FAILS = 5;     // tentatives de connexion ratées avant blocage
var LOCK_MIN = 15;     // durée du blocage en minutes

// Le verrou ne sert qu'aux actions qui ÉCRIVENT dans la feuille. Les lectures (messages, profils, recherche, session)
// passent sans attendre : une exécution lente ne bloque plus tout le monde.
var WRITE_ACTIONS = { register: 1, login: 1, logout: 1, postCreate: 1, msgSend: 1, profileSave: 1,
  sessionCreate: 1, sessionJoin: 1, sessionLeave: 1, sessionCancel: 1, matchSubmit: 1, matchRespond: 1, coachApply: 1,
  postLike: 1, postComment: 1, postDelete: 1, interestAdd: 1,
  report: 1, blockSet: 1, accountDelete: 1, passwordChange: 1, planSync: 1,
  mailVerifySend: 1, mailVerify: 1, pwForgot: 1, pwReset: 1 };

function doPost(e) {
  var lock = null;
  try {
    if (e.postData && e.postData.contents && e.postData.contents.length > 150000) return out_(err_("Requête trop volumineuse."));
    var data = JSON.parse(e.postData.contents);
    if (WRITE_ACTIONS[data.action]) {
      lock = LockService.getScriptLock();
      lock.waitLock(20000);
    }
    if (data.token && data.action !== "login" && data.action !== "register" && data.action !== "logout" && data.action !== "session") {
      var gate = checkSession_(data.token);                               // compte suspendu : message explicite plutôt que « session expirée »
      if (gate.status === "error" && gate.message === MSG_SUSPENDED) return out_(gate);
    }
    switch (data.action) {
      case "register": return out_(register_(data));
      case "login":    return out_(login_(data));
      case "session":  return out_(checkSession_(data.token));
      case "logout":   return out_(logout_(data.token));
      case "postCreate": return out_(postCreate_(data));
      case "postList":   return out_(postList_(data));
      case "clubStats":  return out_(clubStats_(data));
      case "userSearch": return out_(userSearch_(data));
      case "msgSend":    return out_(msgSend_(data));
      case "msgSync":    return out_(msgSync_(data));
      case "profileSave": return out_(profileSave_(data));
      case "profileMe":   return out_(profileMe_(data));
      case "profileGet":  return out_(profileGet_(data));
      case "sessionCreate": return out_(sessionCreate_(data));
      case "sessionList":   return out_(sessionList_(data));
      case "sessionJoin":   return out_(sessionJoin_(data));
      case "sessionLeave":  return out_(sessionLeave_(data));
      case "sessionCancel": return out_(sessionCancel_(data));
      case "matchSubmit":   return out_(matchSubmit_(data));
      case "matchList":     return out_(matchList_(data));
      case "matchRespond":  return out_(matchRespond_(data));
      case "leaderboard":   return out_(leaderboard_(data));
      case "coachApply":    return out_(coachApply_(data));
      case "coachList":     return out_(coachList_(data));
      case "postLike":      return out_(postLike_(data));
      case "postComment":   return out_(postComment_(data));
      case "postDelete":    return out_(postDelete_(data));
      case "quickMatch":    return out_(quickMatch_(data));
      case "appStats":      return out_(appStats_(data));
      case "interestAdd":   return out_(interestAdd_(data));
      case "mailStatus":    return out_(mailStatus_(data));
      case "mailVerifySend": return out_(mailVerifySend_(data));
      case "mailVerify":    return out_(mailVerify_(data));
      case "pwForgot":      return out_(pwForgot_(data));
      case "pwReset":       return out_(pwReset_(data));
      case "payInfo":       return out_(payInfo_(data));
      case "planSync":      return out_(planSync_(data));
      case "report":        return out_(report_(data));
      case "blockSet":      return out_(blockSet_(data));
      case "blockList":     return out_(blockList_(data));
      case "accountExport": return out_(accountExport_(data));
      case "accountDelete": return out_(accountDelete_(data));
      case "passwordChange": return out_(passwordChange_(data));
      default:         return out_({ status: "error", message: "Action inconnue." });
    }
  } catch (err) {
    var m = String(err && err.message || err);
    try { console.error(m + " | " + (err && err.stack || "")); } catch (x) {}
    if (/lock/i.test(m)) return out_({ status: "error", message: "Serveur occupé, réessayez dans quelques secondes." });
    return out_({ status: "error", message: "Erreur serveur, réessayez dans un instant." });
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (x) {} }
  }
}

// ---------- Inscription ----------
function register_(d) {
  var lastName = str_(d.lastName), firstName = str_(d.firstName), email = str_(d.email).toLowerCase();
  var phone = str_(d.phone), birthDate = str_(d.birthDate), pseudo = str_(d.pseudo), password = String(d.password || "");

  if (!lastName || !firstName || !email || !pseudo || !birthDate) return err_("Merci de remplir tous les champs obligatoires.");
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return err_("Adresse e-mail invalide.");
  if (!/^[A-Za-z0-9_.-]{3,20}$/.test(pseudo)) return err_("Pseudo : 3 à 20 caractères (lettres, chiffres, _ . -).");
  var pwBad = passwordProblem_(password, pseudo, email); if (pwBad) return err_(pwBad);
  if (d.consent !== true) return err_("Le consentement au traitement des données est obligatoire.");
  if (age_(birthDate) < 15) return err_("Spary est réservé aux personnes de 15 ans ou plus.");
  if (age_(birthDate) > 110) return err_("Date de naissance invalide.");
  if (badAny_([pseudo, firstName, lastName])) return err_("Ce pseudo ou ce nom n'est pas autorisé.");
  var regLim = rate_("reg:all", 60, 3600, "Beaucoup d'inscriptions en ce moment. Réessayez dans quelques minutes.");
  if (regLim) return err_(regLim);

  var sheet = sheet_(SHEET_ACCOUNTS), rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][6]).toLowerCase() === pseudo.toLowerCase()) return err_("Ce pseudo est déjà pris.");
    if (String(rows[i][3]).toLowerCase() === email) return err_("Cet email est déjà associé à un compte.");
  }

  var club = /^[A-Z0-9-]{1,24}$/.test(String(d.club || "")) ? String(d.club) : "";
  sheet.appendRow([
    new Date(), safe_(lastName), safe_(firstName), safe_(email), safe_(phone), birthDate,
    safe_(pseudo), makeHash_(password), d.newsletter ? "OUI" : "NON", new Date(), club, new Date()
  ]);
  try { if (!sheet.getRange(1, 12).getValue()) sheet.getRange(1, 12).setValue("Dernière connexion"); } catch (x) {}
  try { if (mailOn_()) sendVerify_({ pseudo: pseudo, name: firstName, email: email }); } catch (x) {}
  return { status: "success", token: createSession_(pseudo, firstName), user: { name: firstName, pseudo: pseudo } };
}

// ---------- Connexion ----------
function login_(d) {
  var id = str_(d.identifier).toLowerCase(), pw = String(d.password || "");
  if (!id || !pw) return err_("Identifiant ou mot de passe incorrect.");

  var cache = CacheService.getScriptCache(), key = "fail:" + id;
  if (Number(cache.get(key) || 0) >= MAX_FAILS) return err_("Trop de tentatives. Réessayez dans " + LOCK_MIN + " minutes.");

  var sheet = sheet_(SHEET_ACCOUNTS), rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var rowEmail = String(rows[i][3]).toLowerCase(), rowPseudo = String(rows[i][6]).toLowerCase();
    if ((rowEmail === id || rowPseudo === id) && checkPw_(pw, rows[i][7])) {
      if (isBanned_(rows[i][6])) return err_(MSG_SUSPENDED);
      cache.remove(key);
      if (String(rows[i][7]).indexOf("hmac$") !== 0) sheet.getRange(i + 1, 8).setValue(makeHash_(pw)); // ancien format ou clair -> haché avec secret serveur
      try { var lastL = new Date(rows[i][11]).getTime(); if (!lastL || new Date().getTime() - lastL > 72000000) sheet.getRange(i + 1, 12).setValue(new Date()); } catch (x) {}
      try { purgeExpiredSessions_(); } catch (x) {}
      return { status: "success", token: createSession_(rows[i][6], rows[i][2]), user: { name: rows[i][2], pseudo: rows[i][6] } };
    }
  }
  cache.put(key, String(Number(cache.get(key) || 0) + 1), LOCK_MIN * 60);
  return err_("Identifiant ou mot de passe incorrect.");
}

// ---------- Sessions ----------
function createSession_(pseudo, name) {
  var token = Utilities.getUuid() + Utilities.getUuid();
  var expiry = new Date().getTime() + SESSION_DAYS * 86400000;
  sheet_(SHEET_SESSIONS, true).appendRow([hash_(token, "session"), pseudo, name, expiry]);
  return token;
}
function checkSession_(token) {
  if (!token) return err_("Session invalide.");
  var h = hash_(String(token), "session"), now = new Date().getTime(), cache = CacheService.getScriptCache();
  var hit = cache.get("sess:" + h);
  if (hit) {
    var c = jsonSafe_(hit);
    if (c.pseudo && Number(c.exp) > now) return isBanned_(c.pseudo) ? err_(MSG_SUSPENDED) : { status: "success", user: { name: c.name, pseudo: c.pseudo } };
  }
  var rows = sheet_(SHEET_SESSIONS, true).getDataRange().getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i][0] === h && Number(rows[i][3]) > now) {
      if (isBanned_(rows[i][1])) return err_(MSG_SUSPENDED);
      cache.put("sess:" + h, JSON.stringify({ name: rows[i][2], pseudo: rows[i][1], exp: Number(rows[i][3]) }), 600);
      return { status: "success", user: { name: rows[i][2], pseudo: rows[i][1] } };
    }
  }
  return err_("Session expirée.");
}
function logout_(token) {
  if (!token) return { status: "success" };
  var sheet = sheet_(SHEET_SESSIONS, true), rows = sheet.getDataRange().getValues(), h = hash_(String(token), "session");
  CacheService.getScriptCache().remove("sess:" + h);
  for (var i = rows.length - 1; i >= 0; i--) if (rows[i][0] === h) sheet.deleteRow(i + 1);
  return { status: "success" };
}

// ---------- Annonces (fil d'actualité) ----------
var POST_TYPES = ["Victoire", "Match disputé", "Disponible", "Recherche"];
function sessionUser_(token) {
  var s = checkSession_(token);
  return s.status === "success" ? s.user : null;
}
function postCreate_(d) {
  var u = sessionUser_(d.token);
  if (!u) return err_("Session expirée, reconnectez-vous.");
  if (POST_TYPES.indexOf(d.badge) < 0) return err_("Type d'annonce invalide.");
  var title = String(d.title || "").trim().slice(0, 120), text = String(d.text || "").trim().slice(0, 500);
  if (!title || !text) return err_("Annonce vide.");
  var bad = badAny_([title, text]); if (bad) return err_(bad);
  var cache = CacheService.getScriptCache(), key = "post:" + u.pseudo, n = Number(cache.get(key) || 0);
  if (n >= 10) return err_("Trop d'annonces en peu de temps. Réessayez plus tard.");
  cache.put(key, String(n + 1), 3600);
  var id = new Date().getTime();
  sheet_("Annonces", true).appendRow([id, u.pseudo, u.name, d.badge, safe_(title), safe_(text), new Date()]);
  return { status: "success", id: id };
}
function postList_(d) {
  if (!sessionUser_(d.token)) return err_("Session expirée.");
  var me = String(sessionUser_(d.token).pseudo).toLowerCase(), only = String(d.pseudo || "").toLowerCase();
  var bl = blocks_(me), hid = hidden_();
  var rows = sheet_("Annonces", true).getDataRange().getValues(), out = [], limit = only ? 30 : 50;
  for (var i = rows.length - 1; i >= 0 && out.length < limit; i--) {
    if (!rows[i][0]) continue;
    if (only && String(rows[i][1]).toLowerCase() !== only) continue;
    if (String(rows[i][1]).toLowerCase() !== me && (hid["annonce:" + rows[i][0]] || hides_(bl, rows[i][1]))) continue;
    var t = new Date(rows[i][6]).getTime();
    out.push({ id: rows[i][0], pseudo: rows[i][1], name: rows[i][2], badge: rows[i][3], title: rows[i][4], text: rows[i][5], ts: isNaN(t) ? Number(rows[i][0]) || 0 : t, likes: 0, liked: false, comments: [] });
  }
  var idx = {}; out.forEach(function (p) { idx[String(p.id)] = p; });
  rowsOf_(shLikes_()).forEach(function (r) {
    var p = idx[String(r[0])]; if (!p) return;
    p.likes++; if (String(r[1]).toLowerCase() === me) p.liked = true;
  });
  rowsOf_(shComments_()).forEach(function (r) {
    var p = idx[String(r[1])]; if (!p || p.comments.length >= 30) return;
    if (String(r[2]).toLowerCase() !== me && (hid["commentaire:" + r[0]] || hides_(bl, r[2]))) return;
    p.comments.push({ id: Number(r[0]), pseudo: String(r[2]), name: String(r[3]), text: String(r[4]), ts: Number(r[5]) });
  });
  var profs = profMap_(), presence = {};
  out.forEach(function (p) { presence[p.pseudo] = light_(p.pseudo, profs[String(p.pseudo).toLowerCase()]); });
  return { status: "success", posts: out, presence: presence };
}

// ---------- Espace club : statistiques réelles ----------
function clubStats_(d) {
  if (!sessionUser_(d.token)) return err_("Session expirée.");
  var code = String(d.club || "");
  if (!/^[A-Z0-9-]{1,24}$/.test(code)) return err_("Code club invalide.");
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), pseudos = {}, members = 0, week = 0, since = new Date().getTime() - 7 * 86400000;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][10]) === code) {
      members++; pseudos[String(rows[i][6])] = true;
      if (new Date(rows[i][0]).getTime() > since) week++;
    }
  }
  var posts = 0, ann = sheet_("Annonces", true).getDataRange().getValues();
  for (var j = 0; j < ann.length; j++) if (pseudos[String(ann[j][1])]) posts++;
  return { status: "success", members: members, posts: posts, week: week };
}

// ---------- Recherche de membres ----------
// Ne renvoie que le pseudo et le prénom (jamais email, téléphone, nom, date de naissance).
function norm_(v) { return String(v == null ? "" : v).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase(); }
function userSearch_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var q = norm_(str_(d.query)).replace(/^@/, "");
  if (q.length < 2) return { status: "success", users: [] };
  var cache = CacheService.getScriptCache(), key = "search:" + me.pseudo, n = Number(cache.get(key) || 0);
  if (n >= 120) return err_("Trop de recherches. Réessayez plus tard.");
  cache.put(key, String(n + 1), 3600);
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), out = [], mine = String(me.pseudo).toLowerCase();
  var profs = profMap_(), seen = {}, blU = blocks_(me.pseudo), hidU = hidden_();
  for (var i = 1; i < rows.length && out.length < 8; i++) {
    var pseudo = String(rows[i][6]), first = String(rows[i][2]), pr = profs[pseudo.toLowerCase()];
    if (!pseudo || pseudo.toLowerCase() === mine) continue;
    if (pr && pr.data.searchable === false) continue;
    if (hides_(blU, pseudo) || hidU["membre:" + pseudo]) continue;
    var shown = pr && pr.data.displayName ? pr.data.displayName : first;
    if (norm_(pseudo).indexOf(q) >= 0 || norm_(first).indexOf(q) >= 0 || norm_(shown).indexOf(q) >= 0) {
      var o = light_(pseudo, pr); o.pseudo = pseudo; o.name = shown; o.avatar = avatarOf_(pr); out.push(o);
    }
  }
  return { status: "success", users: out };
}

// ---------- Messagerie entre membres ----------
var MSG_MAX = 1000;       // longueur max d'un message
var MSG_PER_MIN = 30;     // messages max par minute et par membre
var MSG_TAIL = 800;       // nombre de lignes lues en fin d'onglet à chaque synchronisation

// Retrouve le pseudo exact (et le prénom) d'un compte à partir d'un pseudo saisi
function findAccount_(pseudo) {
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), p = String(pseudo).toLowerCase();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][6]).toLowerCase() === p) return { pseudo: String(rows[i][6]), name: String(rows[i][2]) };
  return null;
}
function msgSend_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var to = String(d.to || "");
  var text = String(d.text || "").trim().slice(0, MSG_MAX);
  if (!text) return err_("Message vide.");
  var badM = badAny_([text]); if (badM) return err_(badM);
  if (/^#\\d{6,20}$/.test(to)) {                       // discussion de groupe d'une séance
    if (!mySeanceIds_(me.pseudo)[to.slice(1)]) return err_("Rejoignez la séance pour écrire dans la discussion.");
    var c2 = CacheService.getScriptCache(), k2 = "msg:" + me.pseudo, n2 = Number(c2.get(k2) || 0);
    if (n2 >= MSG_PER_MIN) return err_("Trop de messages en peu de temps. Patientez un instant.");
    c2.put(k2, String(n2 + 1), 60);
    var t2 = new Date().getTime(), id2 = t2 * 1000 + Math.floor(Math.random() * 1000);
    sheet_("Messages", true).appendRow([id2, me.pseudo, to, safe_(text), t2]);
    return { status: "success", id: id2, ts: t2, to: to };
  }
  if (!/^[A-Za-z0-9_.-]{3,20}$/.test(to)) return err_("Destinataire invalide.");
  var dest = findAccount_(to);
  if (!dest) return err_("Ce membre n'existe pas.");
  if (dest.pseudo.toLowerCase() === String(me.pseudo).toLowerCase()) return err_("Vous ne pouvez pas vous écrire à vous-même.");
  var blm = blocks_(me.pseudo), dk = dest.pseudo.toLowerCase();
  if (blm.mine[dk] || blm.them[dk] || isBanned_(dk)) return err_("Impossible d'écrire à ce membre.");
  var cache = CacheService.getScriptCache(), key = "msg:" + me.pseudo, n = Number(cache.get(key) || 0);
  if (n >= MSG_PER_MIN) return err_("Trop de messages en peu de temps. Patientez un instant.");
  cache.put(key, String(n + 1), 60);
  var now = new Date().getTime(), id = now * 1000 + Math.floor(Math.random() * 1000);
  sheet_("Messages", true).appendRow([id, me.pseudo, dest.pseudo, safe_(text), now]);
  return { status: "success", id: id, ts: now, to: dest.pseudo };
}
// Renvoie les messages envoyés ou reçus par le membre connecté, plus récents que \`since\` (id)
function msgSync_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var since = Number(d.since) || 0, mine = String(me.pseudo).toLowerCase();
  touchSeen_(me.pseudo, d.active === false);
  var sids = mySeanceIds_(me.pseudo), blk = blocks_(me.pseudo), hidM = hidden_();
  var sh = sheet_("Messages", true), last = sh.getLastRow(), out = [], names = {};
  if (last >= 1) {
    var first = Math.max(1, last - MSG_TAIL + 1), rows = sh.getRange(first, 1, last - first + 1, 5).getValues();
    for (var i = 0; i < rows.length; i++) {
      var id = Number(rows[i][0]);
      if (!id || id <= since) continue;
      var from = String(rows[i][1]), to = String(rows[i][2]);
      if (to.charAt(0) === "#") { if (!sids[to.slice(1)]) continue; }
      else if (from.toLowerCase() !== mine && to.toLowerCase() !== mine) continue;
      if (from.toLowerCase() !== mine && (hides_(blk, from) || hidM["message:" + id])) continue;
      out.push({ id: id, from: from, to: to, text: String(rows[i][3]), ts: Number(rows[i][4]) });
    }
    out = out.slice(-300);
    var accounts = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), want = {};
    out.forEach(function (m) { want[m.from.toLowerCase()] = true; if (m.to.charAt(0) !== "#") want[(m.from.toLowerCase() === mine ? m.to : m.from).toLowerCase()] = true; });
    for (var j = 1; j < accounts.length; j++) {
      var ps = String(accounts[j][6]);
      if (want[ps.toLowerCase()]) names[ps] = String(accounts[j][2]);
    }
  }
  var peers = {};
  (Array.isArray(d.peers) ? d.peers : []).slice(0, 40).forEach(function (p) { if (/^[A-Za-z0-9_.-]{3,20}$/.test(String(p))) peers[String(p).toLowerCase()] = String(p); });
  out.forEach(function (m) { if (m.to.charAt(0) === "#") return; var o = m.from.toLowerCase() === mine ? m.to : m.from; peers[o.toLowerCase()] = o; });
  var profs = profMap_(), presence = {};
  Object.keys(peers).forEach(function (k) { presence[peers[k]] = light_(peers[k], profs[k]); });
  return { status: "success", me: me.pseudo, messages: out, names: names, presence: presence };
}

// ---------- Profils, photo, statut et présence ----------
var LEVELS = ["Débutant", "Intermédiaire", "Avancé", "Compétition"];
var MODES = ["online", "away", "busy", "invisible"];
var DAYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
var SLOTS = ["matin", "midi", "soir"];
var SEEN_MS = 150000;     // sans signe de vie depuis 2 min 30 : hors ligne

function clip_(v, n) { return String(v == null ? "" : v).replace(/[\\u0000-\\u001f<>]/g, " ").trim().slice(0, n); }
function jsonSafe_(t) { try { var o = JSON.parse(t); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } }
function cleanLink_(v) {
  v = String(v || "").trim();
  if (!v) return "";
  if (/^@?[A-Za-z0-9_.]{1,30}$/.test(v)) return "https://instagram.com/" + v.replace(/^@/, "");
  return /^https?:\\/\\/[^\\s"'<>]{3,200}$/.test(v) ? v : "";
}
function cleanProfile_(p) {
  p = p || {};
  var o = { displayName: clip_(p.displayName, 40), bio: clip_(p.bio, 150), city: clip_(p.city, 60), club: clip_(p.club, 60), link: cleanLink_(p.link), sports: [], avail: {} };
  (Array.isArray(p.sports) ? p.sports : []).slice(0, 12).forEach(function (s) {
    var name = clip_(s && s.name, 30);
    if (name) o.sports.push({ name: name, level: LEVELS.indexOf(s.level) >= 0 ? s.level : "", rank: clip_(s.rank, 20) });
  });
  DAYS.forEach(function (day) {
    var a = p.avail && Array.isArray(p.avail[day]) ? p.avail[day] : [];
    o.avail[day] = SLOTS.filter(function (x) { return a.indexOf(x) >= 0; });
  });
  o.mode = MODES.indexOf(p.mode) >= 0 ? p.mode : "online";
  o.emoji = clip_(p.emoji, 8); o.text = clip_(p.text, 80);
  var until = Number(p.until) || 0, now = new Date().getTime();
  if (until && until <= now) { o.emoji = ""; o.text = ""; until = 0; }   // statut déjà expiré : effacé
  o.until = until > now ? Math.min(until, now + 7 * 86400000) : 0;
  if (!o.text && !o.emoji) o.until = 0;
  o.showPresence = p.showPresence !== false;
  o.searchable = p.searchable !== false;
  return o;
}
function cleanAvatar_(a) {
  a = String(a || "");
  return /^data:image\\/(jpeg|png|webp);base64,[A-Za-z0-9+\\/=]+$/.test(a) && a.length <= 45000 ? a : null;
}
// Lit seulement pseudo, données et date (la photo, lourde, est lue à la demande avec avatarOf_)
function profMap_() {
  var sh = sheet_(SHEET_PROFILES, true), last = sh.getLastRow(), map = {};
  if (last < 1) return map;
  var ab = sh.getRange(1, 1, last, 2).getValues(), dt = sh.getRange(1, 4, last, 1).getValues();
  for (var i = 0; i < ab.length; i++) {
    if (!ab[i][0]) continue;
    map[String(ab[i][0]).toLowerCase()] = { row: i + 1, pseudo: String(ab[i][0]), data: jsonSafe_(ab[i][1]), updated: Number(dt[i][0]) || 0 };
  }
  return map;
}
function avatarOf_(pr) {
  if (!pr) return "";
  return String(sheet_(SHEET_PROFILES, true).getRange(pr.row, 3, 1, 1).getValues()[0][0] || "");
}
function touchSeen_(pseudo, away) {
  CacheService.getScriptCache().put("seen:" + String(pseudo).toLowerCase(), JSON.stringify({ t: new Date().getTime(), a: away ? 1 : 0 }), 600);
}
// État affiché : online | away | busy | offline | hidden (le membre masque sa présence)
function presence_(pseudo, pr) {
  var data = pr ? pr.data : {};
  if (data.showPresence === false) return "hidden";
  var raw = CacheService.getScriptCache().get("seen:" + String(pseudo).toLowerCase());
  if (!raw) return "offline";
  var s = jsonSafe_(raw), mode = MODES.indexOf(data.mode) >= 0 ? data.mode : "online";
  if (!s.t || new Date().getTime() - s.t > SEEN_MS) return "offline";
  if (mode === "invisible") return "offline";
  if (s.a && mode === "online") return "away";
  return mode;
}
// Infos légères (sans photo) pour les listes
function light_(pseudo, pr) {
  var data = pr ? pr.data : {}, now = new Date().getTime(), live = !data.until || data.until > now;
  return { u: pseudo, v: pr ? pr.updated : 0, state: presence_(pseudo, pr), emoji: live ? (data.emoji || "") : "", text: live ? (data.text || "") : "" };
}
function publicProfile_(pseudo, pr, withAvatar) {
  var d = pr ? pr.data : {}, o = light_(pseudo, pr);
  o.name = d.displayName || ""; o.bio = d.bio || ""; o.city = d.city || ""; o.club = d.club || ""; o.link = d.link || "";
  o.sports = d.sports || []; o.avail = d.avail || {};
  o.stats = statsOf_(statsAll_(), pseudo);
  if (withAvatar) o.avatar = avatarOf_(pr);
  return o;
}
function profileMe_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var pr = profMap_()[String(me.pseudo).toLowerCase()];
  return { status: "success", profile: pr ? pr.data : null, avatar: avatarOf_(pr), v: pr ? pr.updated : 0, stats: statsOf_(statsAll_(), me.pseudo) };
}
function profileSave_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var cache = CacheService.getScriptCache(), key = "psave:" + me.pseudo, n = Number(cache.get(key) || 0);
  if (n >= 40) return err_("Trop de modifications en peu de temps. Réessayez plus tard.");
  cache.put(key, String(n + 1), 3600);
  var map = profMap_(), pr = map[String(me.pseudo).toLowerCase()], data = cleanProfile_(d.profile), now = new Date().getTime();
  var avatar = null;                       // null = photo inchangée
  if (d.avatar === null || d.avatar === "") avatar = "";
  else if (typeof d.avatar === "string") {
    var a = cleanAvatar_(d.avatar);
    if (a === null) return err_("Photo invalide ou trop lourde.");
    avatar = a;
  }
  var badP = badAny_([data.displayName, data.bio, data.city, data.club, data.text]); if (badP) return err_(badP);
  var json = JSON.stringify(data);
  if (json.length > 8000) return err_("Profil trop long.");
  var sh = sheet_(SHEET_PROFILES, true);
  if (pr) {
    sh.getRange(pr.row, 1, 1, 2).setValues([[me.pseudo, json]]);
    sh.getRange(pr.row, 4, 1, 1).setValues([[now]]);
    if (avatar !== null) sh.getRange(pr.row, 3, 1, 1).setValues([[avatar]]);
  } else sh.appendRow([me.pseudo, json, avatar || "", now]);
  return { status: "success", v: now, profile: data };
}
function profileGet_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var cache = CacheService.getScriptCache(), key = "pget:" + me.pseudo, n = Number(cache.get(key) || 0);
  if (n >= 400) return err_("Trop de requêtes. Réessayez plus tard.");
  cache.put(key, String(n + 1), 3600);
  var list = [], seen = {}, have = d.have && typeof d.have === "object" ? d.have : {};
  (Array.isArray(d.pseudos) ? d.pseudos : []).forEach(function (p) {
    p = String(p);
    if (/^[A-Za-z0-9_.-]{3,20}$/.test(p) && !seen[p.toLowerCase()] && list.length < 30) { seen[p.toLowerCase()] = 1; list.push(p); }
  });
  var map = profMap_(), out = {}, accMap = null;
  function accOf_(p) {
    if (!accMap) {
      accMap = {};
      var r = sheet_(SHEET_ACCOUNTS).getDataRange().getValues();
      for (var k = 1; k < r.length; k++) accMap[String(r[k][6]).toLowerCase()] = { pseudo: String(r[k][6]), name: String(r[k][2]) };
    }
    return accMap[p.toLowerCase()] || null;
  }
  list.forEach(function (p) {
    var pr = map[p.toLowerCase()], acc = pr ? { pseudo: pr.pseudo } : accOf_(p);
    if (!acc) return;
    var same = pr && Number(have[acc.pseudo]) === pr.updated;
    var o = publicProfile_(acc.pseudo, pr, !same);
    o.fresh = !same; o.hasProfile = !!pr;
    out[acc.pseudo] = o;
  });
  return { status: "success", profiles: out };
}

// ---------- Mots de passe ----------
function hash_(pw, salt) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ":" + pw, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}
// Secret serveur (« poivre ») : créé une fois, stocké dans les propriétés du script. NE PAS LE SUPPRIMER : les mots de passe deviendraient inutilisables.
function pepper_() {
  var props = PropertiesService.getScriptProperties(), v = props.getProperty("PEPPER");
  if (!v) { v = Utilities.getUuid() + Utilities.getUuid(); props.setProperty("PEPPER", v); }
  return v;
}
function hmac_(pw, salt) {
  var raw = Utilities.computeHmacSha256Signature(salt + ":" + pw, pepper_());
  return raw.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}
function makeHash_(pw) {
  var salt = Utilities.getUuid().replace(/-/g, "");
  return "hmac$" + salt + "$" + hmac_(pw, salt);
}
function checkPw_(pw, stored) {
  stored = String(stored);
  if (stored.indexOf("hmac$") === 0) { var q = stored.split("$"); return hmac_(pw, q[1]) === q[2]; }
  if (stored.indexOf("sha256$") === 0) { var p = stored.split("$"); return hash_(pw, p[1]) === p[2]; }   // ancien format, remplacé à la prochaine connexion
  return stored === pw; // anciens comptes (mot de passe encore en clair)
}

/** À lancer UNE FOIS à la main (Exécuter) : hache tous les mots de passe encore en clair. */
function migratePasswords() {
  var sheet = sheet_(SHEET_ACCOUNTS), rows = sheet.getDataRange().getValues(), n = 0;
  for (var i = 1; i < rows.length; i++) {
    var v = String(rows[i][7]);
    if (v && v.indexOf("sha256$") !== 0 && v.indexOf("hmac$") !== 0) { sheet.getRange(i + 1, 8).setValue(makeHash_(v)); n++; }
  }
  Logger.log(n + " mot(s) de passe haché(s).");
}

// =====================================================================
// ---------- Modération, vie privée (RGPD) et sécurité ----------
// Onglets créés tout seuls : Signalements, Blocages, Bannis, MotsInterdits (facultatif), Abonnements.
//  - Signalements : une ligne par signalement. Colonne « statut » : nouveau (par défaut) / retiré (contenu masqué pour tous) / rejeté (signalement sans suite).
//    Un contenu signalé par 3 membres différents est masqué automatiquement tant que le statut reste « nouveau ».
//  - Bannis : ajouter une ligne « pseudo | date de fin (vide = définitif) | raison ». Le compte ne peut plus se connecter (effet sous 1 minute).
//  - MotsInterdits : un mot ou une expression par ligne, en plus de la liste intégrée.
// =====================================================================
var SH_REPORTS = "Signalements", SH_BLOCKS = "Blocages", SH_BANS = "Bannis", SH_WORDS = "MotsInterdits", SH_PLANS = "Abonnements";
var REPORT_HIDE_AT = 3;
var REPORT_TYPES = ["annonce", "commentaire", "session", "membre", "message"];
var REPORT_REASONS = ["Spam ou publicité", "Harcèlement ou insultes", "Propos haineux ou discriminatoires", "Contenu sexuel ou inapproprié", "Faux profil ou usurpation d'identité", "Mise en danger ou menaces", "Autre"];
var INACTIVE_YEARS = 3;     // comptes sans connexion depuis N années : supprimés par purgeInactive()
var MSG_BAD = "Ce contenu ne respecte pas les règles de la communauté (insultes, propos haineux, menaces).";
var MSG_SUSPENDED = "Ce compte est suspendu. Écris à l'équipe Spary pour en savoir plus.";

function shReports_() { return sheetH_(SH_REPORTS, ["id", "date (ms)", "signaleur", "type", "cible", "auteur", "motif", "détails", "extrait", "statut", "note"]); }
function shBlocks_()  { return sheetH_(SH_BLOCKS, ["bloqueur", "bloqué", "date (ms)"]); }
function shBans_()    { return sheetH_(SH_BANS, ["pseudo", "jusqu'au (vide = définitif)", "raison"]); }
function shPlans_()   { return sheetH_(SH_PLANS, ["pseudo", "offre", "statut", "jusqu'au (ms)", "référence", "mis à jour (ms)"]); }

// ----- Bannissements -----
function bans_() {
  var cache = CacheService.getScriptCache(), hit = cache.get("bans:all");
  if (hit) return jsonSafe_(hit);
  var map = {}, now = new Date().getTime();
  rowsOf_(shBans_()).forEach(function (r) {
    var p = String(r[0]).trim().toLowerCase(); if (!p) return;
    var u = r[1], until = 0;
    if (u instanceof Date) until = u.getTime();
    else if (Number(u) > 1e11) until = Number(u);
    else if (String(u).trim()) { var t = new Date(String(u)).getTime(); until = isNaN(t) ? 0 : t; }
    if (!until || until > now) map[p] = until || 1;
  });
  cache.put("bans:all", JSON.stringify(map), 60);
  return map;
}
function isBanned_(pseudo) {
  var b = bans_()[String(pseudo).toLowerCase()];
  return !!b && (b === 1 || b > new Date().getTime());
}

// ----- Blocages entre membres -----
function blocks_(pseudo) {
  var key = "blk:" + String(pseudo).toLowerCase(), cache = CacheService.getScriptCache(), hit = cache.get(key);
  if (hit) return jsonSafe_(hit);
  var p = String(pseudo).toLowerCase(), o = { mine: {}, them: {} };
  rowsOf_(shBlocks_()).forEach(function (r) {
    var a = String(r[0]).toLowerCase(), b = String(r[1]).toLowerCase();
    if (a === p) o.mine[b] = 1; else if (b === p) o.them[a] = 1;
  });
  cache.put(key, JSON.stringify(o), 300);
  return o;
}
function forgetBlocks_(a, b) {
  var c = CacheService.getScriptCache();
  c.remove("blk:" + String(a).toLowerCase()); c.remove("blk:" + String(b).toLowerCase());
}
// true si le contenu de ce membre doit être caché pour le membre dont on a chargé les blocages
function hides_(bl, pseudo) {
  var k = String(pseudo).toLowerCase();
  return !!(bl.mine[k] || bl.them[k] || isBanned_(k));
}

// ----- Contenus masqués par signalements -----
function hidden_() {
  var cache = CacheService.getScriptCache(), hit = cache.get("hid:all");
  if (hit) return jsonSafe_(hit);
  var by = {};
  rowsOf_(shReports_()).forEach(function (r) {
    if (!r[0]) return;
    var k = String(r[3]) + ":" + String(r[4]), o = by[k] = by[k] || { rep: {}, n: 0, rem: false, rej: false }, st = norm_(r[9]);
    if (st === "retire") o.rem = true;
    else if (st === "rejete") o.rej = true;
    else if (st === "nouveau" || !st) { var who = String(r[2]).toLowerCase(); if (!o.rep[who]) { o.rep[who] = 1; o.n++; } }
  });
  var h = {};
  Object.keys(by).forEach(function (k) { var o = by[k]; if (o.rem || (!o.rej && o.n >= REPORT_HIDE_AT)) h[k] = 1; });
  cache.put("hid:all", JSON.stringify(h), 120);
  return h;
}

// ----- Filtre de langage -----
var BAD_TOKENS = ["connard", "connasse", "salope", "pute", "enculé", "encule", "enculer", "ntm", "fdp", "pd", "pédé", "pede", "tarlouze", "tapette", "gouine", "nègre", "negre", "négro", "negro",
  "bougnoule", "bicot", "youpin", "raton", "sidaïque", "mongol", "nazi", "pétasse", "petasse", "batard", "bâtard", "crevard", "trisomique", "attardé", "attarde"];
var BAD_PHRASES = ["sale arabe", "sale noir", "sale juif", "sale negre", "sale blanc", "sale francais", "sale pd", "ferme ta gueule", "ta gueule", "je vais te tuer", "vais te tuer", "va te tuer", "je te tue",
  "vais te violer", "te violer", "suicide toi", "suicide-toi", "creve", "tu vas crever", "nique ta mere", "nique ta race", "retourne dans ton pays", "sales etrangers", "heil hitler"];
function fold_(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/0/g, "o").replace(/[1!|]/g, "i").replace(/3/g, "e").replace(/[4@]/g, "a").replace(/[5$]/g, "s").replace(/7/g, "t").replace(/(.)\\1+/g, "$1");
}
function badLists_() {
  var cache = CacheService.getScriptCache(), hit = cache.get("bad:lists");
  if (hit) return jsonSafe_(hit);
  var toks = {}, phr = [];
  function add(w) { var f = fold_(w).replace(/[^a-z0-9 ]+/g, " ").replace(/\\s+/g, " ").trim(); if (!f) return; if (f.indexOf(" ") >= 0) phr.push(f); else toks[f] = 1; }
  BAD_TOKENS.forEach(add); BAD_PHRASES.forEach(add);
  try { var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_WORDS); if (sh) rowsOf_(sh).forEach(function (r) { if (r[0]) add(String(r[0])); }); } catch (e) {}
  var o = { toks: toks, phr: phr };
  cache.put("bad:lists", JSON.stringify(o), 300);
  return o;
}
function badText_(s) {
  var f = fold_(s); if (!f) return false;
  var L = badLists_(), toks = f.split(/[^a-z0-9]+/).filter(Boolean);
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (L.toks[t] || (t.length > 3 && t.charAt(t.length - 1) === "s" && L.toks[t.slice(0, -1)])) return true;
  }
  var flat = " " + f.replace(/[^a-z0-9]+/g, " ").trim() + " ";
  for (var j = 0; j < L.phr.length; j++) if (flat.indexOf(" " + L.phr[j] + " ") >= 0) return true;
  var run = "";                                                      // « c.o.n.n.a.r.d » : suite de lettres isolées
  for (var m = 0; m <= toks.length; m++) {
    if (m < toks.length && toks[m].length === 1) { run += toks[m]; continue; }
    if (run.length >= 3 && L.toks[run.replace(/(.)\\1+/g, "$1")]) return true;
    run = "";
  }
  return false;
}
// Renvoie le message d'erreur si l'un des textes est refusé, sinon ""
function badAny_(list) { for (var i = 0; i < list.length; i++) if (badText_(list[i])) return MSG_BAD; return ""; }

// ----- Signalement -----
function report_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var type = String(d.type || "");
  if (REPORT_TYPES.indexOf(type) < 0) return err_("Type de signalement invalide.");
  var reason = String(d.reason || "");
  if (REPORT_REASONS.indexOf(reason) < 0) return err_("Choisissez un motif.");
  var details = clip_(d.details, 300), target = String(d.target || "").trim(), author = "", extract = "", mine = String(me.pseudo).toLowerCase();
  if (type === "membre") {
    if (!/^[A-Za-z0-9_.-]{3,20}$/.test(target)) return err_("Membre invalide.");
    var acc = findAccount_(target); if (!acc) return err_("Ce membre n'existe pas.");
    target = acc.pseudo; author = acc.pseudo;
  } else {
    target = String(Number(target) || "");
    if (!target) return err_("Contenu invalide.");
    if (type === "annonce") rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (String(r[0]) === target) { author = String(r[1]); extract = String(r[4]) + " — " + String(r[5]); } });
    else if (type === "commentaire") rowsOf_(shComments_()).forEach(function (r) { if (String(r[0]) === target) { author = String(r[2]); extract = String(r[4]); } });
    else if (type === "session") rowsOf_(shSeances_()).forEach(function (r) { if (String(r[0]) === target) { author = String(r[1]); extract = [r[3], r[4], r[11]].join(" · "); } });
    else if (type === "message") {
      var sids = mySeanceIds_(me.pseudo);
      rowsAll_(sheet_("Messages", true)).forEach(function (r) {
        if (String(r[0]) !== target) return;
        var to = String(r[2]), ok = to.charAt(0) === "#" ? !!sids[to.slice(1)] : to.toLowerCase() === mine;
        if (ok) { author = String(r[1]); extract = String(r[3]); }
      });
    }
  }
  if (!author) return err_("Contenu introuvable.");
  if (author.toLowerCase() === mine) return err_("Vous ne pouvez pas signaler votre propre contenu.");
  var lim = rate_("rep:" + me.pseudo, 15, 3600, "Trop de signalements en peu de temps.");
  if (lim) return err_(lim);
  var sh = shReports_(), rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][2]).toLowerCase() === mine && String(rows[i][3]) === type && String(rows[i][4]) === target) return { status: "success", already: true };
  var now = new Date().getTime();
  sh.appendRow([now * 1000 + Math.floor(Math.random() * 1000), now, me.pseudo, type, target, author, reason, safe_(details), safe_(clip_(extract, 300)), "nouveau", ""]);
  CacheService.getScriptCache().remove("hid:all");
  return { status: "success" };
}

// ----- Blocage -----
function blockSet_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var p = String(d.pseudo || "");
  if (!/^[A-Za-z0-9_.-]{3,20}$/.test(p)) return err_("Membre invalide.");
  var acc = findAccount_(p); if (!acc) return err_("Ce membre n'existe pas.");
  var mine = String(me.pseudo).toLowerCase(), other = acc.pseudo.toLowerCase();
  if (mine === other) return err_("Vous ne pouvez pas vous bloquer vous-même.");
  var lim = rate_("blk:" + me.pseudo, 60, 3600, "Trop d'actions en peu de temps.");
  if (lim) return err_(lim);
  var sh = shBlocks_(), rows = sh.getDataRange().getValues(), at = -1, n = 0;
  for (var i = 1; i < rows.length; i++) if (String(rows[i][0]).toLowerCase() === mine) { n++; if (String(rows[i][1]).toLowerCase() === other) at = i; }
  if (d.on === false) { if (at >= 0) sh.deleteRow(at + 1); }
  else if (at < 0) { if (n >= 200) return err_("Liste de blocage pleine."); sh.appendRow([me.pseudo, acc.pseudo, new Date().getTime()]); }
  forgetBlocks_(me.pseudo, acc.pseudo);
  return { status: "success", blocked: d.on !== false, pseudo: acc.pseudo };
}
function blockList_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var mine = String(me.pseudo).toLowerCase(), out = [];
  rowsOf_(shBlocks_()).forEach(function (r) { if (String(r[0]).toLowerCase() === mine) out.push(String(r[1])); });
  return { status: "success", blocked: out };
}

// ----- Réécriture d'onglet : fn(ligne) renvoie la ligne (modifiée ou non) ou null pour la supprimer -----
// noHeader : onglets créés sans ligne d'en-tête (Annonces, Messages, Profils, Sessions)
function rewriteRows_(sh, fn, noHeader) {
  var start = noHeader ? 1 : 2, last = sh.getLastRow(); if (last < start) return 0;
  var cols = sh.getLastColumn(), vals = sh.getRange(start, 1, last - start + 1, cols).getValues(), keep = [], changed = 0;
  vals.forEach(function (r) {
    var o = fn(r);
    if (o === null) { changed++; return; }
    if (o !== r) changed++;
    keep.push(o);
  });
  if (!changed) return 0;
  sh.getRange(start, 1, vals.length, cols).clearContent();
  if (keep.length) sh.getRange(start, 1, keep.length, cols).setValues(keep);
  return changed;
}
function rowsAll_(sh) { return sh.getDataRange().getValues(); }   // onglets sans en-tête
function sheetIf_(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }

// ----- Export des données (droit d'accès / portabilité) -----
function accountExport_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var lim = rate_("aexp:" + me.pseudo, 5, 3600, "Trop de demandes. Réessayez plus tard.");
  if (lim) return err_(lim);
  var p = String(me.pseudo).toLowerCase(), out = { exporté_le: new Date().toISOString(), pseudo: me.pseudo };
  var acc = null, rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][6]).toLowerCase() === p) acc = rows[i];
  if (acc) out.compte = { inscription: String(acc[0]), nom: acc[1], prénom: acc[2], email: acc[3], téléphone: acc[4], naissance: String(acc[5]), newsletter: acc[8], consentement: String(acc[9]), club: acc[10], dernière_connexion: acc[11] ? String(acc[11]) : "" };
  var pr = profMap_()[p]; out.profil = pr ? pr.data : null; out.photo = pr && avatarOf_(pr) ? "présente (non incluse)" : "aucune";
  var mineRow = function (col) { return function (r) { return String(r[col]).toLowerCase() === p; }; };
  out.annonces = rowsAll_(sheet_("Annonces", true)).filter(mineRow(1)).map(function (r) { return { id: r[0], type: r[3], titre: r[4], texte: r[5], date: String(r[6]) }; });
  out.commentaires = rowsOf_(shComments_()).filter(mineRow(2)).map(function (r) { return { annonce: r[1], texte: r[4], date: Number(r[5]) }; });
  out.likes = rowsOf_(shLikes_()).filter(mineRow(1)).map(function (r) { return r[0]; });
  out.séances_organisées = rowsOf_(shSeances_()).filter(mineRow(1)).map(function (r) { return { id: r[0], sport: r[3], lieu: r[4], début: Number(r[7]), places: r[8], frais: r[9], niveau: r[10], note: r[11], statut: r[12], lieu_id: r[14] || "", durée_min: r[15] || "" }; });
  out.inscriptions = rowsOf_(shInscr_()).filter(mineRow(1)).map(function (r) { return { séance: r[0], date: Number(r[3]) }; });
  out.matchs = rowsOf_(shMatchs_()).filter(function (r) { return String(r[2]).toLowerCase() === p || String(r[3]).toLowerCase() === p; }).map(function (r) { return { date: Number(r[1]), joueur_a: r[2], joueur_b: r[3], sport: r[4], score: r[5], statut: r[7] }; });
  var msgs = [], sids = mySeanceIds_(me.pseudo), msh = sheet_("Messages", true);
  rowsAll_(msh).forEach(function (r) {
    var from = String(r[1]).toLowerCase(), to = String(r[2]);
    if (from === p || to.toLowerCase() === p) msgs.push({ de: r[1], à: r[2], texte: r[3], date: Number(r[4]) });
  });
  out.messages_privés = msgs.slice(-3000);
  out.fiche_coach = null; rowsOf_(shCoachs_()).forEach(function (r) { if (String(r[0]).toLowerCase() === p) out.fiche_coach = { statut: r[3], données: jsonSafe_(r[2]) }; });
  out.signalements_envoyés = rowsOf_(shReports_()).filter(mineRow(2)).map(function (r) { return { date: Number(r[1]), type: r[3], motif: r[6] }; });
  out.membres_bloqués = rowsOf_(shBlocks_()).filter(mineRow(0)).map(function (r) { return r[1]; });
  var plans = sheetIf_(SH_PLANS); out.abonnement = null;
  if (plans) rowsOf_(plans).forEach(function (r) { if (String(r[0]).toLowerCase() === p) out.abonnement = { offre: r[1], statut: r[2] }; });
  return { status: "success", data: out };
}

// ----- Suppression des données d'un membre -----
function deleteAccountData_(pseudo) {
  var p = String(pseudo).toLowerCase(), is = function (v) { return String(v).toLowerCase() === p; };
  var postIds = {};
  var ann = sheet_("Annonces", true);
  rewriteRows_(ann, function (r) { if (is(r[1])) { postIds[String(r[0])] = 1; return null; } return r; }, true);
  rewriteRows_(shLikes_(), function (r) { return postIds[String(r[0])] || is(r[1]) ? null : r; });
  rewriteRows_(shComments_(), function (r) { return postIds[String(r[1])] || is(r[2]) ? null : r; });
  rewriteRows_(shSeances_(), function (r) {                          // séances organisées : annulées et anonymisées
    if (!is(r[1])) return r;
    var o = r.slice(); o[1] = "[supprimé]"; o[2] = ""; o[11] = ""; o[12] = "annulée"; return o;
  });
  rewriteRows_(shInscr_(), function (r) { return is(r[1]) ? null : r; });
  rewriteRows_(sheet_("Messages", true), function (r) { return is(r[1]) || is(r[2]) ? null : r; }, true);
  rewriteRows_(shMatchs_(), function (r) {                           // les matchs restent pour l'adversaire, sans le nom du membre
    if (!is(r[2]) && !is(r[3])) return r;
    var o = r.slice(); if (is(o[2])) o[2] = "[compte supprimé]"; if (is(o[3])) o[3] = "[compte supprimé]"; return o;
  });
  rewriteRows_(shCoachs_(), function (r) { return is(r[0]) ? null : r; });
  var prf = profMap_()[p]; if (prf) sheet_(SHEET_PROFILES, true).deleteRow(prf.row);
  rewriteRows_(shBlocks_(), function (r) { return is(r[0]) || is(r[1]) ? null : r; });
  var it = sheetIf_(SH_INTERETS); if (it) rewriteRows_(it, function (r) { return is(r[1]) ? null : r; });
  var tk = sheetIf_(SH_TOKENS); if (tk) rewriteRows_(tk, function (r) { return is(r[1]) ? null : r; });
  var ab = sheetIf_(SH_ABOS); if (ab) rewriteRows_(ab, function (r) { return is(r[0]) ? null : r; });
  var pl = sheetIf_(SH_PLANS); if (pl) rewriteRows_(pl, function (r) { return is(r[0]) ? null : r; });
  var c = CacheService.getScriptCache();
  rewriteRows_(sheet_(SHEET_SESSIONS, true), function (r) { if (is(r[1])) { c.remove("sess:" + r[0]); return null; } return r; }, true);
  ["sids:" + p, "seen:" + p, "blk:" + p, "stats:all", "appstats", "hid:all", "bad:lists"].forEach(function (k) { c.remove(k); });
}
function accountDelete_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  if (String(d.confirm || "").trim().toUpperCase() !== "SUPPRIMER") return err_("Tapez SUPPRIMER pour confirmer.");
  var lim = rate_("adel:" + me.pseudo, 5, 3600, "Trop de tentatives. Réessayez plus tard.");
  if (lim) return err_(lim);
  var sh = sheet_(SHEET_ACCOUNTS), rows = sh.getDataRange().getValues(), at = -1, p = String(me.pseudo).toLowerCase();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][6]).toLowerCase() === p) at = i;
  if (at < 0) return err_("Compte introuvable.");
  if (!checkPw_(String(d.password || ""), rows[at][7])) return err_("Mot de passe incorrect.");
  deleteAccountData_(me.pseudo);
  sh.deleteRow(at + 1);
  return { status: "success" };
}
/** À lancer à la main (ou par déclencheur annuel) : supprime les comptes sans connexion depuis INACTIVE_YEARS ans. */
function purgeInactive() {
  var sh = sheet_(SHEET_ACCOUNTS), rows = sh.getDataRange().getValues(), limit = new Date().getTime() - INACTIVE_YEARS * 365 * 86400000, gone = [];
  for (var i = rows.length - 1; i >= 1; i--) {
    var last = new Date(rows[i][11] || rows[i][0]).getTime();
    if (last && last < limit) { gone.push(String(rows[i][6])); }
  }
  gone.forEach(function (ps) {
    deleteAccountData_(ps);
    var r2 = sh.getDataRange().getValues();
    for (var j = r2.length - 1; j >= 1; j--) if (String(r2[j][6]).toLowerCase() === ps.toLowerCase()) { sh.deleteRow(j + 1); break; }
  });
  Logger.log(gone.length + " compte(s) inactif(s) supprimé(s).");
}

// ----- Changement de mot de passe -----
function passwordChange_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var oldPw = String(d.oldPassword || ""), pw = String(d.newPassword || "");
  var lim = rate_("pwc:" + me.pseudo, 6, 3600, "Trop de tentatives. Réessayez plus tard.");
  if (lim) return err_(lim);
  var bad = passwordProblem_(pw, me.pseudo, ""); if (bad) return err_(bad);
  var sh = sheet_(SHEET_ACCOUNTS), rows = sh.getDataRange().getValues(), p = String(me.pseudo).toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][6]).toLowerCase() !== p) continue;
    if (!checkPw_(oldPw, rows[i][7])) return err_("Mot de passe actuel incorrect.");
    if (pw === oldPw) return err_("Choisissez un mot de passe différent de l'ancien.");
    sh.getRange(i + 1, 8).setValue(makeHash_(pw));
    var cur = hash_(String(d.token), "session"), cache = CacheService.getScriptCache();
    rewriteRows_(sheet_(SHEET_SESSIONS, true), function (r) {           // déconnecte tous les autres appareils
      if (String(r[1]).toLowerCase() !== p || r[0] === cur) return r;
      cache.remove("sess:" + r[0]); return null;
    }, true);
    return { status: "success" };
  }
  return err_("Compte introuvable.");
}
var COMMON_PW = ["12345678", "123456789", "1234567890", "password", "motdepasse", "azertyuiop", "azerty123", "qwertyuiop", "11111111", "00000000", "iloveyou", "football", "spary1234", "sparyspary"];
function passwordProblem_(pw, pseudo, email) {
  if (pw.length < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
  if (pw.length > 100) return "Mot de passe trop long.";
  var low = pw.toLowerCase();
  if (COMMON_PW.indexOf(low) >= 0 || /^(.)\\1+$/.test(pw)) return "Mot de passe trop courant : choisissez-en un moins prévisible.";
  if (pseudo && low === String(pseudo).toLowerCase()) return "Le mot de passe ne doit pas être votre pseudo.";
  if (email && low === String(email).toLowerCase()) return "Le mot de passe ne doit pas être votre e-mail.";
  return "";
}

// ----- Ménage des sessions expirées (au plus une fois par jour, lancé à la connexion) -----
function purgeExpiredSessions_() {
  var cache = CacheService.getScriptCache();
  if (cache.get("purge:sess")) return;
  cache.put("purge:sess", "1", 21600);
  var now = new Date().getTime();
  rewriteRows_(sheet_(SHEET_SESSIONS, true), function (r) { return Number(r[3]) > now ? r : null; }, true);
}

// ---------- Paiement (Stripe Payment Links) — inactif tant que les propriétés de script ne sont pas renseignées ----------
// Propriétés de script : STRIPE_KEY (clé secrète restreinte, lecture seule des « Checkout Sessions »),
// PAY_URL_PLUS + PAY_ID_PLUS (lien de paiement https://buy.stripe.com/… et son identifiant plink_…), idem PAY_URL_COACH + PAY_ID_COACH.
var SH_ABOS = "Abonnements";
function payProp_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ""; }
function payRef_(pseudo) { return "sp-" + encodeURIComponent(String(pseudo).toLowerCase()).replace(/_/g, "%5F").replace(/%/g, "_"); }
function payPlans_() {
  var out = [];
  [["plus", "PLUS"], ["coach", "COACH"]].forEach(function (p) {
    var url = payProp_("PAY_URL_" + p[1]), id = payProp_("PAY_ID_" + p[1]);
    if (/^https:\\/\\/buy\\.stripe\\.com\\//.test(url) && /^plink_[A-Za-z0-9]+$/.test(id)) out.push({ plan: p[0], url: url, id: id });
  });
  return out;
}
function planOf_(pseudo) {
  var sh = sheetIf_(SH_ABOS); if (!sh) return "";
  var rows = sh.getDataRange().getValues(), p = String(pseudo).toLowerCase();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][0]).toLowerCase() === p && rows[i][2] === "actif") return String(rows[i][1]);
  return "";
}
function emailOf_(pseudo) {
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), p = String(pseudo).toLowerCase();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][6]).toLowerCase() === p) return String(rows[i][3] || "");
  return "";
}
function payInfo_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var plans = payPlans_(), links = {}, ref = payRef_(me.pseudo), mail = encodeURIComponent(emailOf_(me.pseudo));
  if (payProp_("STRIPE_KEY")) plans.forEach(function (p) { links[p.plan] = p.url + "?client_reference_id=" + ref + (mail ? "&prefilled_email=" + mail : ""); });
  return { status: "success", links: links, plan: planOf_(me.pseudo) };
}
function planSync_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var key = payProp_("STRIPE_KEY"), plans = payPlans_();
  if (!key || !plans.length) return err_("Le paiement n'est pas encore ouvert.");
  var ref = payRef_(me.pseudo), found = "", refGot = "";
  for (var i = 0; i < plans.length && found !== "coach"; i++) {
    var after = "", pages = 0;
    while (pages++ < 5) {
      var url = "https://api.stripe.com/v1/checkout/sessions?limit=100&payment_link=" + plans[i].id + "&expand[]=data.subscription" + (after ? "&starting_after=" + after : "");
      var resp = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + key }, muteHttpExceptions: true }), js;
      if (resp.getResponseCode() !== 200) return err_("Vérification du paiement impossible pour le moment.");
      try { js = JSON.parse(resp.getContentText()); } catch (e) { return err_("Réponse de paiement illisible."); }
      var data = js.data || [];
      for (var k = 0; k < data.length; k++) {
        var s = data[k];
        if (s.client_reference_id !== ref || s.status !== "complete") continue;
        var sub = s.subscription, ok = sub && typeof sub === "object" ? (sub.status === "active" || sub.status === "trialing") : false;
        if (ok) { found = plans[i].plan === "coach" ? "coach" : (found || "plus"); refGot = s.id; }
      }
      if (!js.has_more || !data.length) break;
      after = data[data.length - 1].id;
    }
  }
  var sh = sheetH_(SH_ABOS, ["pseudo", "plan", "statut", "stripe", "maj"]), rows = sh.getDataRange().getValues(), p = String(me.pseudo).toLowerCase(), row = -1;
  for (var r = 1; r < rows.length; r++) if (String(rows[r][0]).toLowerCase() === p) { row = r + 1; break; }
  if (found) {
    var vals = [me.pseudo, found, "actif", refGot, new Date()];
    if (row > 0) sh.getRange(row, 1, 1, 5).setValues([vals]); else sh.appendRow(vals);
  } else if (row > 0) { sh.getRange(row, 3).setValue("terminé"); sh.getRange(row, 5).setValue(new Date()); }
  return { status: "success", plan: found };
}

// ---------- E-mails automatiques (Resend) — inactifs tant que la propriété de script RESEND_API_KEY n'existe pas ----------
// Propriétés de script : RESEND_API_KEY (obligatoire), MAIL_FROM (défaut « Spary <noreply@spary.fr> »), SITE_URL (défaut https://spary.fr)
var SH_TOKENS = "Jetons";
var CONTACT_MAIL = "contact@spary.fr";
var VERIFY_TTL = 3 * 86400000, RESET_TTL = 3600000;
function mailProp_(k, d) { return PropertiesService.getScriptProperties().getProperty(k) || d; }
function mailOn_() { return !!mailProp_("RESEND_API_KEY", ""); }
function mailEsc_(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function mail_(to, subject, html, text) {
  var key = mailProp_("RESEND_API_KEY", ""); if (!key) return false;
  try {
    var r = UrlFetchApp.fetch("https://api.resend.com/emails", {
      method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + key }, muteHttpExceptions: true,
      payload: JSON.stringify({ from: mailProp_("MAIL_FROM", "Spary <noreply@spary.fr>"), to: [to], subject: subject, html: html, text: text })
    });
    var c = r.getResponseCode();
    if (c < 200 || c >= 300) { Logger.log("Resend HTTP " + c + " : " + String(r.getContentText()).slice(0, 200)); return false; }
    return true;
  } catch (e) { Logger.log("Resend : " + e); return false; }
}
function mailLayout_(title, intro, label, url, outro) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2430">' +
    '<h2 style="margin:0 0 12px;font-size:20px">' + mailEsc_(title) + '</h2>' +
    '<p style="line-height:1.5;margin:0 0 20px">' + mailEsc_(intro) + '</p>' +
    '<p style="margin:0 0 20px"><a href="' + mailEsc_(url) + '" style="display:inline-block;background:#c8453f;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px">' + mailEsc_(label) + '</a></p>' +
    '<p style="font-size:13px;color:#667;line-height:1.5;margin:0 0 6px">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br><span style="word-break:break-all">' + mailEsc_(url) + '</span></p>' +
    '<p style="font-size:13px;color:#667;line-height:1.5;margin:14px 0 0">' + mailEsc_(outro) + '</p>' +
    '<p style="font-size:12px;color:#99a;margin:22px 0 0">Spary · ' + mailEsc_(CONTACT_MAIL) + '</p></div>';
}
function tokNew_(pseudo, type, ttl) {
  var t = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ""), now = new Date().getTime(), p = String(pseudo).toLowerCase();
  var sh = sheetH_(SH_TOKENS, ["hash", "pseudo", "type", "expire"]);
  rewriteRows_(sh, function (r) { return (Number(r[3]) < now || (String(r[1]).toLowerCase() === p && r[2] === type)) ? null : r; });
  sh.appendRow([hash_(t, "tok"), pseudo, type, now + ttl]);
  return t;
}
function tokPeek_(t, type) {
  t = String(t || ""); if (!/^[a-f0-9]{64}$/.test(t)) return null;
  var sh = sheetIf_(SH_TOKENS); if (!sh) return null;
  var h = hash_(t, "tok"), rows = sh.getDataRange().getValues(), now = new Date().getTime();
  for (var i = 1; i < rows.length; i++) if (rows[i][0] === h && rows[i][2] === type && Number(rows[i][3]) > now) return String(rows[i][1]);
  return null;
}
function tokDrop_(t) {
  var sh = sheetIf_(SH_TOKENS); if (!sh) return;
  var h = hash_(String(t), "tok"); rewriteRows_(sh, function (r) { return r[0] === h ? null : r; });
}
function accountByKey_(id) {
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), k = String(id).toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][6]).toLowerCase() === k || String(rows[i][3]).toLowerCase() === k)
      return { row: i + 1, pseudo: String(rows[i][6]), name: String(rows[i][2]), email: String(rows[i][3]), verified: !!rows[i][12] };
  }
  return null;
}
function sendVerify_(acc) {
  var url = mailProp_("SITE_URL", "https://spary.fr").replace(/\\/+$/, "") + "/#verify=" + tokNew_(acc.pseudo, "verify", VERIFY_TTL);
  var intro = "Bienvenue sur Spary, " + acc.name + " ! Confirme ton adresse e-mail pour sécuriser ton compte et pouvoir récupérer ton mot de passe si tu l'oublies.";
  var out = "Ce lien est valable 3 jours. Si tu n'as pas créé de compte Spary, ignore simplement ce message.";
  return mail_(acc.email, "Confirme ton adresse e-mail – Spary", mailLayout_("Confirme ton adresse e-mail", intro, "Confirmer mon adresse", url, out), intro + "\\n\\n" + url + "\\n\\n" + out);
}
function mailStatus_(d) {
  var me = sessionUser_(d.token); if (!me) return err_("Session expirée, reconnectez-vous.");
  var acc = accountByKey_(me.pseudo);
  return { status: "success", mail: mailOn_(), verified: !!(acc && acc.verified) };
}
function mailVerifySend_(d) {
  var me = sessionUser_(d.token); if (!me) return err_("Session expirée, reconnectez-vous.");
  if (!mailOn_()) return err_("L'envoi d'e-mails n'est pas encore activé.");
  var acc = accountByKey_(me.pseudo); if (!acc) return err_("Compte introuvable.");
  if (acc.verified) return { status: "success", already: true };
  var lim = rate_("mvs:" + acc.pseudo.toLowerCase(), 3, 3600, "Trop de demandes. Réessayez dans une heure."); if (lim) return err_(lim);
  return sendVerify_(acc) ? { status: "success" } : err_("Envoi impossible pour le moment. Réessayez plus tard.");
}
function mailVerify_(d) {
  var lim = rate_("mv:all", 300, 3600, "Trop de tentatives. Réessayez plus tard."); if (lim) return err_(lim);
  var pseudo = tokPeek_(d.t, "verify");
  if (!pseudo) return err_("Ce lien n'est plus valide. Demande un nouvel e-mail depuis l'application.");
  var acc = accountByKey_(pseudo); if (!acc) return err_("Compte introuvable.");
  var sh = sheet_(SHEET_ACCOUNTS);
  sh.getRange(acc.row, 13).setValue(new Date());
  try { if (!sh.getRange(1, 13).getValue()) sh.getRange(1, 13).setValue("E-mail vérifié"); } catch (x) {}
  tokDrop_(d.t);
  return { status: "success" };
}
function pwForgot_(d) {
  var id = str_(d.identifier).toLowerCase();
  if (!id) return err_("Indiquez votre pseudo ou votre e-mail.");
  if (!mailOn_()) return err_("La réinitialisation par e-mail n'est pas encore active. Écrivez-nous à " + CONTACT_MAIL + ".");
  var lim = rate_("pwf:" + id, 3, 3600, "Trop de demandes. Réessayez dans une heure.") || rate_("pwf:all", 100, 3600, "Beaucoup de demandes en ce moment. Réessayez plus tard.");
  if (lim) return err_(lim);
  var acc = accountByKey_(id);
  if (acc && !isBanned_(acc.pseudo)) {
    var url = mailProp_("SITE_URL", "https://spary.fr").replace(/\\/+$/, "") + "/#reset=" + tokNew_(acc.pseudo, "reset", RESET_TTL);
    var intro = "Tu as demandé à réinitialiser le mot de passe de ton compte Spary (" + acc.pseudo + "). Clique ci-dessous pour en choisir un nouveau.";
    var out = "Ce lien est valable 1 heure et ne sert qu'une fois. Si tu n'es pas à l'origine de cette demande, ignore ce message : ton mot de passe reste inchangé.";
    mail_(acc.email, "Réinitialise ton mot de passe – Spary", mailLayout_("Réinitialise ton mot de passe", intro, "Choisir un nouveau mot de passe", url, out), intro + "\\n\\n" + url + "\\n\\n" + out);
  }
  return { status: "success", message: "Si un compte correspond, un e-mail vient d'être envoyé. Pense à regarder tes courriers indésirables." };
}
function pwReset_(d) {
  var lim = rate_("pwr:all", 120, 3600, "Trop de tentatives. Réessayez plus tard."); if (lim) return err_(lim);
  var pseudo = tokPeek_(d.t, "reset");
  if (!pseudo) return err_("Ce lien n'est plus valide. Refaites une demande de réinitialisation.");
  var acc = accountByKey_(pseudo); if (!acc) return err_("Compte introuvable.");
  var pw = String(d.password || ""), bad = passwordProblem_(pw, acc.pseudo, acc.email); if (bad) return err_(bad);
  var sh = sheet_(SHEET_ACCOUNTS), cache = CacheService.getScriptCache(), p = acc.pseudo.toLowerCase();
  sh.getRange(acc.row, 8).setValue(makeHash_(pw));
  if (!acc.verified) sh.getRange(acc.row, 13).setValue(new Date());      // il a reçu l'e-mail : l'adresse est bonne
  tokDrop_(d.t);
  cache.remove("fail:" + p); cache.remove("fail:" + acc.email.toLowerCase());
  rewriteRows_(sheet_(SHEET_SESSIONS, true), function (r) {                // déconnecte tous les appareils
    if (String(r[1]).toLowerCase() !== p) return r;
    cache.remove("sess:" + r[0]); return null;
  }, true);
  return { status: "success" };
}

// ---------- Utilitaires ----------
function sheet_(name, createIfMissing) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), s = ss.getSheetByName(name);
  if (s) return s;
  if (createIfMissing) return ss.insertSheet(name);
  return ss.getSheets()[0];
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function err_(m) { return { status: "error", message: m }; }
function str_(v) { return String(v == null ? "" : v).trim().slice(0, 200); }
function safe_(v) { return /^[=+\\-@]/.test(v) ? "'" + v : v; } // empêche l'injection de formules dans la feuille
function age_(iso) {
  var b = new Date(iso), n = new Date();
  if (isNaN(b.getTime())) return 0;
  var a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

// =====================================================================
// ---------- Données réelles : séances, matchs, coachs, likes, stats ----------
// Onglets créés tout seuls (avec une ligne d'en-tête) : Seances, Inscriptions, Matchs, Coachs, Likes, Commentaires, Interets
// Pour valider un coach : onglet "Coachs" → colonne D → remplacer "En attente" par "Validé".
// =====================================================================
var SH_SEANCES = "Seances", SH_INSCR = "Inscriptions", SH_MATCHS = "Matchs", SH_COACHS = "Coachs", SH_LIKES = "Likes", SH_COMMENTS = "Commentaires", SH_INTERETS = "Interets";
var SEANCE_LEVELS = ["Tous niveaux", "Débutant", "Intermédiaire", "Avancé", "Compétition"];
var PTS_WIN = 250, PTS_LOSS = 100;

function sheetH_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), s = ss.getSheetByName(name);
  if (s) return s;
  try { s = ss.insertSheet(name); s.appendRow(headers); }
  catch (e) { s = ss.getSheetByName(name); if (!s) throw e; }
  return s;
}
function shSeances_() { return sheetH_(SH_SEANCES, ["id", "organisateur", "prénom", "sport", "lieu", "lat", "lng", "début (ms)", "places", "frais total €", "niveau", "note", "statut", "créée", "lieu (id)", "durée (min)", "capacité"]); }
function shInscr_()   { return sheetH_(SH_INSCR, ["séance", "pseudo", "prénom", "date (ms)"]); }
function shMatchs_()  { return sheetH_(SH_MATCHS, ["id", "date (ms)", "joueur A", "joueur B", "sport", "score", "A gagne (1/0)", "statut", "résolu (ms)"]); }
function shCoachs_()  { return sheetH_(SH_COACHS, ["pseudo", "prénom", "données (JSON)", "statut", "date (ms)"]); }
function shLikes_()   { return sheetH_(SH_LIKES, ["annonce", "pseudo"]); }
function shComments_() { return sheetH_(SH_COMMENTS, ["id", "annonce", "pseudo", "prénom", "texte", "date (ms)"]); }
function rate_(key, max, seconds, msg) {
  var cache = CacheService.getScriptCache(), n = Number(cache.get(key) || 0);
  if (n >= max) return msg;
  cache.put(key, String(n + 1), seconds);
  return "";
}
function num_(v, min, max, def) { var n = Number(v); return isFinite(n) && n >= min && n <= max ? n : def; }
function rowsOf_(sh) { var r = sh.getDataRange().getValues(); r.shift(); return r; }   // sans l'en-tête
function nameMap_() {
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), m = {};
  for (var i = 1; i < rows.length; i++) m[String(rows[i][6]).toLowerCase()] = { pseudo: String(rows[i][6]), name: String(rows[i][2]) };
  return m;
}
function shownName_(acc, pr) { return (pr && pr.data && pr.data.displayName) || (acc && acc.name) || ""; }

// ---------- Séances ----------
function mySeanceIds_(pseudo) {
  var cache = CacheService.getScriptCache(), key = "sids:" + String(pseudo).toLowerCase(), hit = cache.get(key);
  if (hit) return jsonSafe_(hit);
  var rows = rowsOf_(shInscr_()), ids = {}, p = String(pseudo).toLowerCase();
  rows.forEach(function (r) { if (String(r[1]).toLowerCase() === p) ids[String(r[0])] = 1; });
  cache.put(key, JSON.stringify(ids), 300);
  return ids;
}
function forgetSeanceIds_(pseudo) { CacheService.getScriptCache().remove("sids:" + String(pseudo).toLowerCase()); }

function sessionCreate_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var sport = clip_(d.sport, 30), place = clip_(d.place, 90), note = clip_(d.note, 200);
  var lat = num_(d.lat, -90, 90, null), lng = num_(d.lng, -180, 180, null), now = new Date().getTime();
  var start = num_(d.start, now - 600000, now + 120 * 86400000, null);
  var slots = Math.round(num_(d.slots, 2, 40, 0)), fee = num_(d.fee, 0, 500, 0);
  var level = SEANCE_LEVELS.indexOf(d.level) >= 0 ? d.level : "Tous niveaux";
  if (!sport) return err_("Choisissez un sport.");
  if (!place) return err_("Indiquez le lieu.");
  var badS = badAny_([place, note]); if (badS) return err_(badS);
  if (lat === null || lng === null) return err_("Lieu introuvable : précisez l'adresse ou la ville.");
  if (start === null) return err_("Date invalide (dans les 4 prochains mois).");
  if (!slots) return err_("Nombre de places invalide (2 à 40).");
  var lim = rate_("scr:" + me.pseudo, 6, 21600, "Trop de séances créées en peu de temps. Réessayez plus tard.");
  if (lim) return err_(lim);
  var rows = rowsOf_(shSeances_()), mine = 0;
  rows.forEach(function (r) { if (String(r[1]).toLowerCase() === String(me.pseudo).toLowerCase() && r[12] === "ouverte" && Number(r[7]) > now - 7200000) mine++; });
  if (mine >= 10) return err_("Vous avez déjà 10 séances ouvertes. Annulez-en une avant d'en créer.");
  var lieu = String(d.lieu || "").trim(), dur = 0, cap = 0;
  if (lieu) {
    if (!/^[A-Za-z0-9_-]{3,24}$/.test(lieu)) return err_("Lieu invalide.");
    dur = Math.round(num_(d.dur, 30, 300, 60)); cap = Math.round(num_(d.cap, 1, 30, 1));
    if (start < now - 60000) return err_("Ce créneau est déjà passé.");
    var end = start + dur * 60000, busy = 0;
    rows.forEach(function (r) {
      if (r[12] !== "ouverte" || String(r[14] || "") !== lieu || String(r[3]).toLowerCase() !== sport.toLowerCase()) return;
      var s0 = Number(r[7]), e0 = s0 + (Number(r[15]) || 60) * 60000;
      if (s0 < end && start < e0) busy++;
    });
    if (busy >= cap) return err_("Ce créneau est déjà pris sur ce lieu. Choisissez un autre horaire.");
  }
  var id = now * 1000 + Math.floor(Math.random() * 1000);
  shSeances_().appendRow([id, me.pseudo, me.name, safe_(sport), safe_(place), lat, lng, start, slots, fee, level, safe_(note), "ouverte", now, lieu, dur, cap]);
  shInscr_().appendRow([id, me.pseudo, me.name, now]);
  forgetSeanceIds_(me.pseudo);
  return { status: "success", id: id };
}
function sessionList_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var now = new Date().getTime(), mine = String(me.pseudo).toLowerCase(), blS = blocks_(me.pseudo), hidS = hidden_();
  var seances = rowsOf_(shSeances_()), inscr = rowsOf_(shInscr_()), by = {};
  inscr.forEach(function (r) { (by[String(r[0])] = by[String(r[0])] || []).push({ pseudo: String(r[1]), name: String(r[2]), ts: Number(r[3]) }); });
  var out = [];
  seances.forEach(function (r) {
    if (r[12] !== "ouverte" || Number(r[7]) < now - 7200000) return;
    if (String(r[1]).toLowerCase() !== mine && (hidS["session:" + r[0]] || hides_(blS, r[1]))) return;
    var id = String(r[0]), ps = by[id] || [], joined = false;
    ps.forEach(function (p) { if (p.pseudo.toLowerCase() === mine) joined = true; });
    out.push({ id: Number(r[0]), org: String(r[1]), orgName: String(r[2]), sport: String(r[3]), place: String(r[4]), lat: Number(r[5]), lng: Number(r[6]),
      start: Number(r[7]), slots: Number(r[8]), fee: Number(r[9]), level: String(r[10]), note: String(r[11]), count: ps.length, joined: joined,
      players: ps.slice(0, 40), lieu: String(r[14] || ""), dur: Number(r[15]) || 0, cap: Number(r[16]) || 0 });
  });
  out.sort(function (a, b) { return a.start - b.start; });
  return { status: "success", sessions: out.slice(0, 200), now: now };
}
function sessionJoin_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), now = new Date().getTime();
  var s = null; rowsOf_(shSeances_()).forEach(function (r) { if (String(r[0]) === id) s = r; });
  if (!s || s[12] !== "ouverte") return err_("Cette séance n'existe plus.");
  if (Number(s[7]) < now - 7200000) return err_("Cette séance est terminée.");
  var lim = rate_("sjn:" + me.pseudo, 40, 3600, "Trop d'actions en peu de temps.");
  if (lim) return err_(lim);
  var ins = rowsOf_(shInscr_()), count = 0, mine = String(me.pseudo).toLowerCase();
  for (var i = 0; i < ins.length; i++) if (String(ins[i][0]) === id) { count++; if (String(ins[i][1]).toLowerCase() === mine) return { status: "success", count: count, already: true }; }
  if (count >= Number(s[8])) return err_("Désolé, cette séance est complète.");
  shInscr_().appendRow([Number(id), me.pseudo, me.name, now]);
  forgetSeanceIds_(me.pseudo);
  return { status: "success", count: count + 1 };
}
function sessionLeave_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), mine = String(me.pseudo).toLowerCase();
  var s = null; rowsOf_(shSeances_()).forEach(function (r) { if (String(r[0]) === id) s = r; });
  if (s && String(s[1]).toLowerCase() === mine && s[12] === "ouverte") return err_("Vous organisez cette séance : annulez-la plutôt.");
  var sh = shInscr_(), rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) if (String(rows[i][0]) === id && String(rows[i][1]).toLowerCase() === mine) { sh.deleteRow(i + 1); break; }
  forgetSeanceIds_(me.pseudo);
  return { status: "success" };
}
function sessionCancel_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), sh = shSeances_(), rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === id) {
      if (String(rows[i][1]).toLowerCase() !== String(me.pseudo).toLowerCase()) return err_("Seul l'organisateur peut annuler.");
      sh.getRange(i + 1, 13, 1, 1).setValues([["annulée"]]);
      return { status: "success" };
    }
  }
  return err_("Séance introuvable.");
}

// ---------- Matchs, points et classement ----------
function statsAll_() {
  var cache = CacheService.getScriptCache(), hit = cache.get("stats:all");
  if (hit) return jsonSafe_(hit);
  var rows = rowsOf_(shMatchs_()), st = {};
  function bump(p, won, sport) {
    var k = String(p).toLowerCase(), o = st[k] = st[k] || { games: 0, wins: 0, points: 0, bySport: {} };
    o.games++; if (won) o.wins++; o.points += won ? PTS_WIN : PTS_LOSS;
    o.bySport[sport] = (o.bySport[sport] || 0) + 1;
  }
  rows.forEach(function (r) {
    if (r[7] !== "confirmé") return;
    var aWon = Number(r[6]) === 1, sport = String(r[4]);
    bump(r[2], aWon, sport); bump(r[3], !aWon, sport);
  });
  try { cache.put("stats:all", JSON.stringify(st), 120); } catch (e) {}
  return st;
}
function statsOf_(all, pseudo) { return all[String(pseudo).toLowerCase()] || { games: 0, wins: 0, points: 0, bySport: {} }; }

function matchSubmit_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var opp = findAccount_(String(d.opponent || "").replace(/^@/, ""));
  if (!opp) return err_("Adversaire introuvable : saisissez son pseudo exact.");
  if (opp.pseudo.toLowerCase() === String(me.pseudo).toLowerCase()) return err_("Vous ne pouvez pas jouer contre vous-même.");
  var sport = clip_(d.sport, 30), score = clip_(d.score, 30);
  if (!sport) return err_("Choisissez un sport.");
  if (d.outcome !== "win" && d.outcome !== "loss") return err_("Résultat invalide.");
  var lim = rate_("msub:" + me.pseudo, 10, 21600, "Trop de résultats envoyés aujourd'hui.");
  if (lim) return err_(lim);
  var now = new Date().getTime(), rows = rowsOf_(shMatchs_()), pair = 0, a = String(me.pseudo).toLowerCase(), b = opp.pseudo.toLowerCase();
  rows.forEach(function (r) {
    var x = String(r[2]).toLowerCase(), y = String(r[3]).toLowerCase();
    if (((x === a && y === b) || (x === b && y === a)) && now - Number(r[1]) < 86400000 && r[7] !== "refusé") pair++;
  });
  if (pair >= 3) return err_("Déjà 3 matchs enregistrés avec ce joueur aujourd'hui.");
  var id = now * 1000 + Math.floor(Math.random() * 1000);
  shMatchs_().appendRow([id, now, me.pseudo, opp.pseudo, safe_(sport), safe_(score), d.outcome === "win" ? 1 : 0, "en attente", ""]);
  return { status: "success", id: id, opponent: opp.pseudo };
}
function matchList_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var mine = String(me.pseudo).toLowerCase(), rows = rowsOf_(shMatchs_()), out = [], want = {};
  for (var i = rows.length - 1; i >= 0 && out.length < 100; i--) {
    var r = rows[i], x = String(r[2]), y = String(r[3]);
    if (x.toLowerCase() !== mine && y.toLowerCase() !== mine) continue;
    out.push({ id: Number(r[0]), ts: Number(r[1]), a: x, b: y, sport: String(r[4]), score: String(r[5]), aWon: Number(r[6]) === 1, status: String(r[7]), rts: Number(r[8]) || 0 });
    want[x.toLowerCase()] = 1; want[y.toLowerCase()] = 1;
  }
  var nm = nameMap_(), names = {};
  Object.keys(want).forEach(function (k) { if (nm[k]) names[nm[k].pseudo] = nm[k].name; });
  return { status: "success", matches: out, names: names, stats: statsOf_(statsAll_(), me.pseudo) };
}
function matchRespond_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), sh = shMatchs_(), rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== id) continue;
    if (String(rows[i][3]).toLowerCase() !== String(me.pseudo).toLowerCase()) return err_("Seul l'adversaire peut répondre.");
    if (rows[i][7] !== "en attente") return err_("Ce résultat a déjà reçu une réponse.");
    var ok = d.accept === true;
    sh.getRange(i + 1, 8, 1, 2).setValues([[ok ? "confirmé" : "refusé", new Date().getTime()]]);
    CacheService.getScriptCache().remove("stats:all");
    return { status: "success", accepted: ok };
  }
  return err_("Résultat introuvable.");
}
function leaderboard_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var all = statsAll_(), nm = nameMap_(), profs = profMap_(), list = [];
  Object.keys(all).forEach(function (k) {
    var acc = nm[k]; if (!acc || isBanned_(k)) return;
    var s = all[k];
    list.push({ pseudo: acc.pseudo, name: shownName_(acc, profs[k]), points: s.points, games: s.games, wins: s.wins });
  });
  list.sort(function (a, b) { return b.points - a.points || b.wins - a.wins || a.pseudo.localeCompare(b.pseudo); });
  var rank = 0; list.forEach(function (o, i) { if (o.pseudo.toLowerCase() === String(me.pseudo).toLowerCase()) rank = i + 1; });
  return { status: "success", top: list.slice(0, 30), total: list.length, rank: rank, me: statsOf_(all, me.pseudo) };
}

// ---------- Coachs ----------
function cleanCoach_(d) {
  var dip = []; (Array.isArray(d.diplomas) ? d.diplomas : []).slice(0, 5).forEach(function (x) { x = clip_(x, 60); if (x) dip.push(x); });
  var email = clip_(d.email, 80);
  return { title: clip_(d.title, 80), sport: clip_(d.sport, 40), price: Math.round(num_(d.price, 0, 500, 0)), exp: clip_(d.exp, 20), club: clip_(d.club, 80), city: clip_(d.city, 60),
    diplomas: dip, bio: clip_(d.bio, 400), phone: clip_(d.phone, 20), email: /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email) ? email : "" };
}
function coachApply_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  if (d.consent !== true) return err_("Merci d'accepter l'affichage public de votre fiche.");
  var c = cleanCoach_(d);
  if (!c.title || !c.sport) return err_("Indiquez votre titre et votre discipline.");
  var badK = badAny_([c.title, c.bio, c.club, c.city]); if (badK) return err_(badK);
  if (!c.email && !c.phone) return err_("Indiquez un moyen de contact (e-mail ou téléphone).");
  var lim = rate_("capp:" + me.pseudo, 5, 3600, "Trop de modifications. Réessayez plus tard.");
  if (lim) return err_(lim);
  var sh = shCoachs_(), rows = sh.getDataRange().getValues(), now = new Date().getTime(), json = JSON.stringify(c), mine = String(me.pseudo).toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === mine) {
      sh.getRange(i + 1, 1, 1, 5).setValues([[me.pseudo, me.name, json, "En attente", now]]);
      return { status: "success", state: "En attente" };
    }
  }
  sh.appendRow([me.pseudo, me.name, json, "En attente", now]);
  return { status: "success", state: "En attente" };
}
function coachList_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var rows = rowsOf_(shCoachs_()), out = [], mine = null, ml = String(me.pseudo).toLowerCase(), profs = profMap_();
  rows.forEach(function (r) {
    var p = String(r[0]), data = jsonSafe_(r[2]);
    if (p.toLowerCase() === ml) mine = { state: String(r[3]), data: data };
    if (r[3] !== "Validé" || out.length >= 100 || isBanned_(p)) return;
    var pr = profs[p.toLowerCase()];
    out.push({ pseudo: p, name: shownName_({ name: String(r[1]) }, pr), data: data });
  });
  return { status: "success", coaches: out, mine: mine };
}

// ---------- Annonces : likes, commentaires, suppression ----------
function postLike_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || "");
  if (!id) return err_("Annonce invalide.");
  var lim = rate_("lk:" + me.pseudo, 120, 3600, "Trop d'actions en peu de temps.");
  if (lim) return err_(lim);
  var sh = shLikes_(), rows = sh.getDataRange().getValues(), mine = String(me.pseudo).toLowerCase(), count = 0, at = -1;
  for (var i = 1; i < rows.length; i++) if (String(rows[i][0]) === id) { count++; if (String(rows[i][1]).toLowerCase() === mine) at = i; }
  if (at >= 0) { sh.deleteRow(at + 1); return { status: "success", liked: false, count: count - 1 }; }
  sh.appendRow([Number(id), me.pseudo]);
  return { status: "success", liked: true, count: count + 1 };
}
function postComment_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), text = String(d.text || "").trim().slice(0, 300);
  if (!id || !text) return err_("Commentaire vide.");
  var badC = badAny_([text]); if (badC) return err_(badC);
  var lim = rate_("cm:" + me.pseudo, 40, 3600, "Trop de commentaires en peu de temps.");
  if (lim) return err_(lim);
  var ok = false; sheet_("Annonces", true).getDataRange().getValues().forEach(function (r) { if (String(r[0]) === id) ok = true; });
  if (!ok) return err_("Cette annonce n'existe plus.");
  var now = new Date().getTime(), cid = now * 1000 + Math.floor(Math.random() * 1000);
  shComments_().appendRow([cid, Number(id), me.pseudo, me.name, safe_(text), now]);
  return { status: "success", id: cid, ts: now };
}
function postDelete_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), sh = sheet_("Annonces", true), rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][0]) === id) {
      if (String(rows[i][1]).toLowerCase() !== String(me.pseudo).toLowerCase()) return err_("Ce n'est pas votre annonce.");
      sh.deleteRow(i + 1);
      return { status: "success" };
    }
  }
  return err_("Annonce introuvable.");
}

// ---------- Quick Match : membres connectés pour un sport ----------
function quickMatch_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var want = norm_(clip_(d.sport, 30)).split(/[\\s\\/&]+/)[0];
  var profs = profMap_(), nm = nameMap_(), out = [], ml = String(me.pseudo).toLowerCase();
  Object.keys(profs).forEach(function (k) {
    if (k === ml || out.length >= 6 || isBanned_(k)) return;
    var pr = profs[k], sp = pr.data.sports || [], hit = !want;
    sp.forEach(function (s) { if (want && norm_(s.name).indexOf(want) >= 0) hit = true; });
    if (!hit) return;
    var st = presence_(pr.pseudo, pr);
    if (st !== "online") return;
    var o = light_(pr.pseudo, pr); o.pseudo = pr.pseudo; o.name = shownName_(nm[k], pr); o.city = pr.data.city || "";
    out.push(o);
  });
  return { status: "success", users: out };
}

// ---------- Compteurs publics ----------
function appStats_(d) {
  if (!sessionUser_(d.token)) return err_("Session expirée.");
  var cache = CacheService.getScriptCache(), hit = cache.get("appstats");
  if (hit) return jsonSafe_(hit);
  var members = Math.max(0, sheet_(SHEET_ACCOUNTS).getLastRow() - 1), bySport = {}, sess = {}, profs = profMap_(), now = new Date().getTime();
  Object.keys(profs).forEach(function (k) {
    var seen = {}; (profs[k].data.sports || []).forEach(function (s) { var n = String(s.name); if (!seen[n]) { seen[n] = 1; bySport[n] = (bySport[n] || 0) + 1; } });
  });
  rowsOf_(shSeances_()).forEach(function (r) { if (r[12] === "ouverte" && Number(r[7]) > now - 7200000) sess[String(r[3])] = (sess[String(r[3])] || 0) + 1; });
  var res = { status: "success", members: members, bySport: bySport, sessions: sess };
  try { cache.put("appstats", JSON.stringify(res), 300); } catch (e) {}
  return res;
}

// ---------- Liste d'attente (fonctions pas encore ouvertes) ----------
function interestAdd_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var kind = clip_(d.kind, 20) || "plus", sh = sheetH_(SH_INTERETS, ["date", "pseudo", "type"]), rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][1]).toLowerCase() === String(me.pseudo).toLowerCase() && rows[i][2] === kind) return { status: "success", already: true };
  sh.appendRow([new Date(), me.pseudo, kind]);
  return { status: "success" };
}


;

// ===== 02-Nouveautes.gs =====
/**
 * Spary v8 → v14 : séances postées + points, avis après séance, notifications push (v14).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Nouveautes », coller ce code.
 * Il doit être placé SOUS Code.gs dans la liste des fichiers (c'est le cas par défaut pour un nouveau fichier).
 * Aucune modification de Code.gs n'est nécessaire. Puis Déployer → Gérer les déploiements → crayon → Nouvelle version.
 * Pour vérifier : sélectionner la fonction sp8Verifier et cliquer sur Exécuter (le journal doit afficher « OK »).
 *
 * Ce fichier enveloppe doPost et quelques fonctions de Code.gs (statsAll_, deleteAccountData_, accountExport_)
 * sans les modifier. Toutes ses écritures passent par LockService. Aucun secret ici.
 * Les clubs ne voient jamais ces données (ni noms, ni notes).
 *
 * Onglets créés tout seuls :
 *  - Points       : date (ms) | pseudo | type | annonce | points | jour
 *  - PostsMeta    : annonce | sport | durée (min)
 *  - Avis         : date (ms) | séance | auteur | membre noté | note (0 = absent) | qualités | absent
 *  - AvisIgnores  : date (ms) | séance | pseudo
 *  - PushSubs     : date (ms) | pseudo | endpoint | p256dh | auth | dernier relevé (ms)
 *  - PushFile     : date (ms) | pseudo | titre | texte | lien | sujet (notifications « appli fermée », gardées 2 jours ; envoyées à chaque appareil abonné)
 *  - Amis         : de | à | statut (attente / ami) | date (ms)
 *  - Groupes      : id | nom | créateur | créé (ms)
 *  - GroupesMembres : groupe | pseudo | ajouté (ms)
 *  - AnnoncesImages : annonce | image (data URL JPEG, 45 Ko max)
 *  - ListeAttente, Recours : liste d'attente des séances, recours de modération et absences contestées
 *  - SeancesOptions : séance | option (adultes / alerte) | valeur | date
 *  - AlertesPrefs : pseudo | actif | lat | lng (arrondis ~1 km) | rayon | maj    - AlertesEnvoyees : date | séance | destinataire
 *  - Kudos : date | séance | de | à        - NiveauxVotes : date | séance | auteur | membre | sport | niveau 1-3
 *  - Défis (facultatif, à remplir à la main) : mois aaaa-mm | titre | objectif (sinon 500 séances)
 *  - SourcesInscription : jour (aaaa-mm-jj) | canal  (anonyme : aucun lien avec le compte)
 *  - PartagesProches : empreinte du jeton | séance | pseudo | expire | créé      - Parrainages : filleul | parrain | date
 * Push (v14) : clés VAPID créées toutes seules dans les propriétés du script (VAPID_PRIVATE, VAPID_PUBLIC) : ne pas les supprimer.
 * Météo : Open-Meteo appelé depuis le serveur (UrlFetchApp), coordonnées arrondies des lieux de séance uniquement.
 */

var SP8 = {
  SEANCE_POINTS: 100,      // points par séance postée
  SEANCE_PER_DAY: 1,       // séances récompensées par jour (heure de Paris), suppressions comprises
  SEANCE_MIN_DUR: 15,
  SEANCE_MAX_DUR: 480,
  SEANCE_MIN_TEXT: 10,
  REVIEW_DAYS: 7,          // délai pour noter après la fin d'une séance
  REVIEW_MIN_PUBLIC: 3,    // moyenne affichée à partir de 3 avis
  TAGS: ["Ponctuel", "Fair-play", "Bonne ambiance", "Bon niveau"],
  TZ: "Europe/Paris",
  WRITES: { reviewSubmit: 1, reviewSkip: 1, pushSubscribe: 1, pushUnsubscribe: 1 },
  installed: false
};

function sp8ShPoints_() { return sheetH_("Points", ["date (ms)", "pseudo", "type", "annonce", "points", "jour"]); }
function sp8ShMeta_()   { return sheetH_("PostsMeta", ["annonce", "sport", "durée (min)"]); }
function sp8ShAvis_()   { return sheetH_("Avis", ["date (ms)", "séance", "auteur", "membre noté", "note", "qualités", "absent"]); }
function sp8ShSkip_()   { return sheetH_("AvisIgnores", ["date (ms)", "séance", "pseudo"]); }
function sp8ShPush_()   { return sheetH_("PushSubs", ["date (ms)", "pseudo", "endpoint", "p256dh", "auth", "dernier relevé (ms)"]); }
function sp8Lc_(s) { return String(s == null ? "" : s).toLowerCase(); }
function sp8Day_() { return Utilities.formatDate(new Date(), SP8.TZ, "yyyy-MM-dd"); }
function sp8Locked_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var c = CacheService.getScriptCache(); ["sp8:fr", "sp8:grp", "sp8:wait"].forEach(function (k) { c.remove(k); });   // lecture fraîche sous verrou
  try { return fn(); } finally { try { lock.releaseLock(); } catch (x) {} }
}
/** Post-traitement après une action déjà réussie de Code.gs : une erreur ici ne doit pas faire croire à un échec. */
function sp8After_(fn, dflt) { try { return sp8Locked_(fn); } catch (e) { try { console.error("sp8 après-coup " + (e && e.message || e)); } catch (x) {} return dflt; } }
function sp8Parse_(textOutput) { try { return JSON.parse(textOutput.getContent()); } catch (e) { return null; } }

/** Réponses possibles à « Comment as-tu connu Spary ? » (facultatif, enregistré sans lien avec le compte). */
var SP8_SOURCES = ["instagram", "tiktok", "linkedin", "ami", "club", "recherche", "autre"];

/* ===================== Installation des enveloppes ===================== */
function sp8Install_() {
  if (typeof SP8 === "undefined" || !SP8 || SP8.installed || typeof doPost !== "function" || typeof statsAll_ !== "function" || typeof POST_TYPES === "undefined") return;
  SP8.installed = true;
  if (POST_TYPES.indexOf("Séance") < 0) POST_TYPES.push("Séance");

  var baseDoPost = doPost;
  var sp8DoPost = function (e) {
    var data = null;
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (!data || !data.action) return baseDoPost(e);
    try {
      switch (data.action) {
        case "reviewPending":   return out_(sp8ReviewPending_(data));
        case "reviewSummary":   return out_(sp8ReviewSummary_(data));
        case "reviewSubmit":    return out_(sp8Locked_(function () { return sp8ReviewSubmit_(data); }));
        case "reviewSkip":      return out_(sp8Locked_(function () { return sp8ReviewSkip_(data); }));
        case "pushSubscribe":   return out_(sp8Locked_(function () { return sp8PushSubscribe_(data); }));
        case "pushUnsubscribe": return out_(sp8Locked_(function () { return sp8PushUnsubscribe_(data); }));
        case "pushKey":         return out_(sp14Key_());
        case "logout":          if (data.pushEndpoint) sp8After_(function () { sp8PushUnsubscribe_({ token: data.token, endpoint: data.pushEndpoint }); }); return baseDoPost(e);
        case "pushPull":        return out_(sp8Locked_(function () { return sp14Pull_(data); }));
        case "sessionCancel":   var co = baseDoPost(e), cr = sp8Parse_(co); if (cr && cr.status === "success") sp8After_(function () { sp14OnCancel_(data); }); return co;
        case "matchSubmit":     var mo = baseDoPost(e), mr = sp8Parse_(mo); if (mr && mr.status === "success") sp8After_(function () { sp14OnMatch_(data, mr); }); return mo;
        case "matchRespond":    var mro = baseDoPost(e), mrr = sp8Parse_(mro); if (mrr && mrr.status === "success") sp8After_(function () { sp14OnMatchReply_(data, mrr); }); return mro;
        case "postCreate":      return sp8PostCreate_(e, data, baseDoPost);
        case "postList":        return sp8PostList_(e, data, baseDoPost);
        case "postDelete":      return sp8PostDelete_(e, data, baseDoPost);
        case "postImage":       return out_(sp8PostImage_(data));
        case "profileGet":      return sp8ProfileGet_(e, data, baseDoPost);
        case "profileSave":     var ps = baseDoPost(e); CacheService.getScriptCache().remove("sp8:priv"); return ps;
        case "friendList":      return out_(sp8FriendList_(data));
        case "friendRequest":   return out_(sp8Locked_(function () { return sp8FriendRequest_(data); }));
        case "friendRespond":   return out_(sp8Locked_(function () { return sp8FriendRespond_(data); }));
        case "friendRemove":    return out_(sp8Locked_(function () { return sp8FriendRemove_(data); }));
        case "groupList":       return out_(sp8GroupList_(data));
        case "groupCreate":     return out_(sp8Locked_(function () { return sp8GroupCreate_(data); }));
        case "groupAdd":        return out_(sp8Locked_(function () { return sp8GroupAdd_(data); }));
        case "groupLeave":      return out_(sp8Locked_(function () { return sp8GroupLeave_(data); }));
        case "groupRemove":     return out_(sp8Locked_(function () { return sp8GroupRemove_(data); }));
        case "groupRename":     return out_(sp8Locked_(function () { return sp8GroupRename_(data); }));
        case "waitJoin":        return out_(sp8Locked_(function () { return sp8WaitJoin_(data); }));
        case "waitLeave":       return out_(sp8Locked_(function () { return sp8WaitLeave_(data); }));
        case "sessionList":     return sp8SessionList_(e, data, baseDoPost);
        case "sessionJoin":     return sp8SessionJoin_(e, data, baseDoPost);
        case "sessionLeave":    return sp8SessionLeave_(e, data, baseDoPost);
        case "recap":           return out_(sp8Recap_(data));
        case "modNotices":      return out_(sp8ModNotices_(data));
        case "modAppeal":       return out_(sp8Locked_(function () { return sp8ModAppeal_(data); }));
        case "reportStatus":    return out_(sp8ReportStatus_(data));
        case "sessionCreate":   return sp8SessionCreate_(e, data, baseDoPost);
        case "msgSend":         var mg = sp8MsgGuard_(data); if (mg) return out_(err_(mg));
                                var so = baseDoPost(e), sr = sp8Parse_(so); if (sr && sr.status === "success") sp8After_(function () { sp14OnMsg_(data, sr); }); return so;
        case "lmPrefsGet":      return out_(sp8LmPrefsGet_(data));
        case "lmPrefsSave":     return out_(sp8Locked_(function () { return sp8LmPrefsSave_(data); }));
        case "lmAlert":         var la = sp8Locked_(function () { return sp8LmAlert_(data); }), lm = la._mail; delete la._mail;
                                try { sp8LmMail_(lm); } catch (x) {}
                                return out_(la);
        case "lmInbox":         return out_(sp8LmInbox_(data));
        case "kudoGive":        return out_(sp8Locked_(function () { return sp8KudoGive_(data); }));
        case "absenceList":     return out_(sp8AbsenceList_(data));
        case "absenceContest":  return out_(sp8Locked_(function () { return sp8AbsenceContest_(data); }));
        case "challenge":       return out_(sp8Challenge_(data));
        case "weather":         return out_(sp8Weather_(data));
        case "shareCreate":     return out_(sp8Locked_(function () { return sp8ShareCreate_(data); }));
        case "shareView":       return out_(sp8ShareView_(data));
        case "referralClaim":   return out_(sp8Locked_(function () { return sp8RefClaim_(data); }));
        case "referralInfo":    return out_(sp8RefInfo_(data));
        case "blockSet":        var bo = baseDoPost(e), br = sp8Parse_(bo);
                                if (br && br.status === "success" && br.blocked) sp8After_(function () { sp8FriendRemove_({ token: data.token, pseudo: br.pseudo }); });
                                return bo;
        case "register":        var ro = baseDoPost(e), rr = sp8Parse_(ro), src = String(data.source || "");
                                if (rr && rr.status === "success" && SP8_SOURCES.indexOf(src) >= 0)
                                  sp8After_(function () { sheetH_("SourcesInscription", ["jour", "canal"]).appendRow([Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd"), src]); });
                                return ro;
        case "report":          if (data.goodFaith === false) return out_(err_("Cochez la case de bonne foi pour envoyer le signalement.")); return baseDoPost(e);
      }
    } catch (err) {
      var m = String(err && err.message || err);
      try { console.error("sp8 " + m + " | " + (err && err.stack || "")); } catch (x) {}
      return out_({ status: "error", message: /lock/i.test(m) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
    return baseDoPost(e);
  };
  doPost = function (e) { var r = sp8DoPost(e); try { sp14Flush_(); } catch (x) {} return r; };

  // Points de séances ajoutés aux points de matchs : classement, profils, stats.
  var baseStats = statsAll_;
  statsAll_ = function () {
    var base = baseStats(), act = sp8ActivityMap_(), st = {};
    Object.keys(base).forEach(function (k) { var o = base[k]; st[k] = { games: o.games, wins: o.wins, points: o.points, bySport: o.bySport || {} }; });
    Object.keys(act).forEach(function (k) {
      var o = st[k] = st[k] || { games: 0, wins: 0, points: 0, bySport: {} };
      o.points += act[k].points; o.seances = act[k].n;
    });
    var ref = {}; try { ref = sp8RefBonus_(); } catch (x) {}
    Object.keys(ref).forEach(function (k) {
      if (!ref[k].pts) return;
      var o = st[k] = st[k] || { games: 0, wins: 0, points: 0, bySport: {} };
      o.points += ref[k].pts; o.parrainage = ref[k].pts;
    });
    return st;
  };

  // Compte privé : le champ « private » est conservé dans le profil.
  var baseClean = cleanProfile_;
  cleanProfile_ = function (p) { var o = baseClean(p); o.private = !!(p && p.private === true); return o; };

  // Groupes de discussion : réutilisent le canal « #id » des séances (messages, droits d'écriture et de lecture).
  var baseSids = mySeanceIds_;
  mySeanceIds_ = function (pseudo) {
    var ids = baseSids(pseudo), g = sp8MyGroupIds_(pseudo), o = {};
    Object.keys(ids).forEach(function (k) { o[k] = 1; });
    Object.keys(g).forEach(function (k) { o[k] = 1; });
    return o;
  };

  // Suppression de compte (et purge des inactifs) : on efface aussi nos onglets.
  var baseDelete = deleteAccountData_;
  deleteAccountData_ = function (pseudo) { baseDelete(pseudo); sp8DeleteUser_(pseudo); };

  // Export RGPD : on ajoute nos données.
  var baseExport = accountExport_;
  accountExport_ = function (d) {
    var r = baseExport(d);
    if (r && r.status === "success" && r.data) {
      try { sp8ExportUser_(r.data.pseudo, r.data); } catch (x) {}
    }
    return r;
  };
}
sp8Install_();

/** À exécuter une fois dans l'éditeur pour vérifier l'installation. */
function sp8Verifier() {
  var ok = SP8.installed && POST_TYPES.indexOf("Séance") >= 0;   // état au chargement, comme pour le site
  console.log(ok
    ? "OK : nouveautés actives. Pensez à publier une Nouvelle version du déploiement."
    : "PROBLÈME : dans la liste des fichiers à gauche, Nouveautes doit être placé SOUS Code.gs (menu ⋮ du fichier > Déplacer vers le bas). Ne modifiez pas Code.gs.");
  sp8Install_();
  sp8ShPoints_(); sp8ShMeta_(); sp8ShAvis_(); sp8ShSkip_(); sp8ShPush_();
  sp8ShFriends_(); sp8ShGroups_(); sp8ShGroupMembers_(); sp8ShImg_(); sp8ShWait_(); sp8ShAppeal_();
  sp8ShOpt_(); sp8ShLmPrefs_(); sp8ShLmSent_(); sp8ShKudos_(); sp8ShLvl_(); sp8ShDefis_(); sp8ShShare_(); sp8ShRef_();
  sp14ShFile_(); console.log("Notifications push : clé publique " + sp14Keys_().pub.slice(0, 12) + "… prête.");
  var sa = sp16Account_(); console.log("Notifications de l'appli mobile : " + (sa ? "Firebase prêt (projet " + sa.project_id + ")." : "pas encore configurées (Script Property FCM_SERVICE_ACCOUNT absente)."));
}

/* ===================== 1. Séances postées + points ===================== */
function sp8PostCreate_(e, data, baseDoPost) {
  var seance = data.badge === "Séance", img = "";
  if (data.img) {
    img = sp8CleanImg_(data.img);
    if (!img) return out_(err_("Image invalide ou trop lourde."));
    var me0 = sessionUser_(data.token);
    if (me0) { var lim = rate_("pimg:" + me0.pseudo, 10, 86400, "Trop d'images publiées aujourd'hui."); if (lim) return out_(err_(lim)); }
  }
  if (!seance && !img) return baseDoPost(e);
  if (seance) {
    var dur = Math.round(Number(data.dur) || 0), sport = clip_(data.sport, 40);
    if (dur < SP8.SEANCE_MIN_DUR || dur > SP8.SEANCE_MAX_DUR) return out_(err_("Indiquez une durée entre 15 min et 8 h."));
    if (String(data.text || "").trim().length < SP8.SEANCE_MIN_TEXT) return out_(err_("Racontez votre séance en quelques mots."));
    if (!sport) return out_(err_("Choisissez un sport."));
  }
  var res = sp8Parse_(baseDoPost(e));                                // création de l'annonce par Code.gs (son propre verrou)
  if (!res || res.status !== "success" || !res.id) return out_(res || err_("Publication impossible."));
  if (img) sp8After_(function () { sp8ShImg_().appendRow([String(res.id), img]); CacheService.getScriptCache().remove("sp8:imgs"); });
  if (!seance) return out_(res);
  var me = sessionUser_(data.token);
  var award = sp8After_(function () {
    sp8ShMeta_().appendRow([String(res.id), sport, dur]);
    var today = sp8Day_(), p = sp8Lc_(me.pseudo), n = 0;
    rowsOf_(sp8ShPoints_()).forEach(function (r) { if (sp8Lc_(r[1]) === p && r[2] === "seance" && String(r[5]) === today) n++; });
    if (n >= SP8.SEANCE_PER_DAY) return { points: 0, capped: true };
    sp8ShPoints_().appendRow([Date.now(), me.pseudo, "seance", String(res.id), SP8.SEANCE_POINTS, today]);
    var c = CacheService.getScriptCache(); c.remove("sp8:act"); c.remove("sp8:meta"); c.remove("sp8:ref");
    return { points: SP8.SEANCE_POINTS, capped: false };
  }, { points: 0, capped: false });
  res.points = award.points; res.capped = award.capped;
  return out_(res);
}

/** Points valides par membre : l'annonce doit exister encore et ne pas être retirée par la modération. */
function sp8ActivityMap_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:act");
  if (hit) return jsonSafe_(hit);
  var live = {}, hid = hidden_(), map = {};
  rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (r[0]) live[String(r[0])] = 1; });
  rowsOf_(sp8ShPoints_()).forEach(function (r) {
    var id = String(r[3]);
    if (!live[id] || hid["annonce:" + id]) return;
    var k = sp8Lc_(r[1]), o = map[k] = map[k] || { points: 0, n: 0 };
    o.points += Number(r[4]) || 0; o.n++;
  });
  try { c.put("sp8:act", JSON.stringify(map), 120); } catch (x) {}
  return map;
}
function sp8PostMeta_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:meta");
  if (hit) return jsonSafe_(hit);
  var m = {};
  rowsOf_(sp8ShMeta_()).forEach(function (r) { m[String(r[0])] = { s: String(r[1]), d: Number(r[2]) || 0 }; });
  rowsOf_(sp8ShPoints_()).forEach(function (r) { var o = m[String(r[3])]; if (o) o.p = Number(r[4]) || 0; });
  try { c.put("sp8:meta", JSON.stringify(m), 300); } catch (x) {}
  return m;
}
function sp8PostList_(e, data, baseDoPost) {
  var res = sp8Parse_(baseDoPost(e));
  if (!res || res.status !== "success" || !Array.isArray(res.posts)) return out_(res || err_("Erreur serveur."));
  var meta = sp8PostMeta_(), hid = hidden_(), imgs = sp8ImgIds_(), me = sessionUser_(data.token);
  var priv = sp8PrivateSet_(), fr = me ? sp8FriendState_(me.pseudo) : {}, mine = me ? sp8Lc_(me.pseudo) : "";
  res.posts = res.posts.filter(function (p) { var k = sp8Lc_(p.pseudo); return k === mine || !priv[k] || fr[k] === "ami"; });
  if (data.pseudo && priv[sp8Lc_(data.pseudo)] && sp8Lc_(data.pseudo) !== mine && fr[sp8Lc_(data.pseudo)] !== "ami") res.private = true;
  res.posts.forEach(function (p) {
    if (imgs[String(p.id)] && !hid["annonce:" + p.id]) p.img = 1;
    var m = meta[String(p.id)]; if (!m) return;
    p.sport = m.s; p.dur = m.d;
    if (m.p && !hid["annonce:" + p.id]) p.points = m.p;
  });
  return out_(res);
}

/* ===================== 2. Avis après séance ===================== */
/** Séances terminées depuis moins de REVIEW_DAYS jours, non annulées, avec leurs inscrits. */
function sp8RecentSessions_() {
  var now = Date.now(), since = now - SP8.REVIEW_DAYS * 864e5, out = {}, list = [];
  rowsOf_(shSeances_()).forEach(function (r) {
    var start = Number(r[7]), end = start + (Number(r[15]) || 90) * 60000;
    if (r[12] !== "ouverte" || end > now || start < since) return;
    var s = { id: String(r[0]), sport: String(r[3]), place: String(r[4]), start: start, players: [] };
    out[s.id] = s; list.push(s);
  });
  rowsOf_(shInscr_()).forEach(function (r) { var s = out[String(r[0])]; if (s) s.players.push({ pseudo: String(r[1]), name: String(r[2]) }); });
  return { byId: out, list: list };
}
function sp8In_(s, pseudo) { var p = sp8Lc_(pseudo); return s.players.some(function (x) { return sp8Lc_(x.pseudo) === p; }); }

function sp8ReviewPending_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var p = sp8Lc_(me.pseudo), done = {}, skip = {};
  rowsOf_(sp8ShAvis_()).forEach(function (r) { if (sp8Lc_(r[2]) === p) done[String(r[1]) + "|" + sp8Lc_(r[3])] = 1; });
  rowsOf_(sp8ShSkip_()).forEach(function (r) { if (sp8Lc_(r[2]) === p) skip[String(r[1])] = 1; });
  var bl = blocks_(me.pseudo), out = [];
  sp8RecentSessions_().list.forEach(function (s) {
    if (skip[s.id] || !sp8In_(s, p)) return;
    var others = s.players.filter(function (x) {
      var k = sp8Lc_(x.pseudo);
      return k !== p && k !== "[supprimé]" && !done[s.id + "|" + k] && !hides_(bl, x.pseudo);
    });
    if (others.length) out.push({ id: s.id, sport: s.sport, place: s.place, start: s.start, players: others.slice(0, 20) });
  });
  out.sort(function (a, b) { return b.start - a.start; });
  return { status: "success", sessions: out.slice(0, 5) };
}

function sp8ReviewSubmit_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var lim = rate_("rvw:" + me.pseudo, 30, 3600, "Trop d'avis en peu de temps. Réessayez plus tard.");
  if (lim) return err_(lim);
  var s = sp8RecentSessions_().byId[String(d.sid)];
  if (!s) return err_("Cette séance ne peut pas (ou plus) être notée.");
  var p = sp8Lc_(me.pseudo);
  if (!sp8In_(s, p)) return err_("Vous ne participiez pas à cette séance.");
  var sh = sp8ShAvis_(), done = {}, n = 0;
  rowsOf_(sh).forEach(function (r) { if (String(r[1]) === s.id && sp8Lc_(r[2]) === p) done[sp8Lc_(r[3])] = 1; });
  (Array.isArray(d.reviews) ? d.reviews.slice(0, 20) : []).forEach(function (rv) {
    var t = sp8Lc_(rv && rv.target);
    if (!t || t === p || done[t] || !sp8In_(s, t)) return;
    var noshow = rv.noshow === true, stars = noshow ? 0 : Math.round(Number(rv.stars) || 0);
    if (!noshow && (stars < 1 || stars > 5)) return;
    var tags = noshow ? [] : (Array.isArray(rv.tags) ? rv.tags : []).filter(function (x) { return SP8.TAGS.indexOf(x) >= 0; }).slice(0, 4);
    var target = s.players.filter(function (x) { return sp8Lc_(x.pseudo) === t; })[0].pseudo;
    sh.appendRow([Date.now(), s.id, me.pseudo, target, stars, tags.join(","), noshow ? "oui" : ""]);
    var lv = Math.round(Number(rv.level) || 0);
    if (!noshow && lv >= 1 && lv <= 3) { sp8ShLvl_().appendRow([Date.now(), s.id, me.pseudo, target, s.sport, lv]); CacheService.getScriptCache().remove("sp8:lvl"); }
    done[t] = 1; n++;
  });
  if (!n) return err_("Aucun avis valide.");
  CacheService.getScriptCache().remove("sp8:rv"); CacheService.getScriptCache().remove("sp8:rel");
  return { status: "success", saved: n };
}
function sp8ReviewSkip_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var sid = String(Number(d.sid) || "");
  if (sid) sp8ShSkip_().appendRow([Date.now(), sid, me.pseudo]);
  return { status: "success" };
}
/** Moyenne publique : seulement à partir de REVIEW_MIN_PUBLIC avis, jamais l'auteur. Les absences ne comptent pas dans la moyenne. */
function sp8ReviewAll_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:rv");
  if (hit) return jsonSafe_(hit);
  var m = {};
  rowsOf_(sp8ShAvis_()).forEach(function (r) {
    if (r[6] === "oui") return;
    var k = sp8Lc_(r[3]), o = m[k] = m[k] || { sum: 0, n: 0, tags: {} };
    o.sum += Number(r[4]) || 0; o.n++;
    String(r[5] || "").split(",").forEach(function (x) { if (x) o.tags[x] = (o.tags[x] || 0) + 1; });
  });
  try { c.put("sp8:rv", JSON.stringify(m), 300); } catch (x) {}
  return m;
}
function sp8ReviewSummary_(d) {
  if (!sessionUser_(d.token)) return err_("Session expirée.");
  var o = sp8ReviewAll_()[sp8Lc_(d.pseudo)], rel = sp8Reliab_()[sp8Lc_(d.pseudo)], res = { status: "success", count: 0 };
  if (o && o.n >= SP8.REVIEW_MIN_PUBLIC) { res.avg = Math.round(o.sum / o.n * 100) / 100; res.count = o.n; res.tags = o.tags; }
  if (rel && rel.n >= SP8_RELIAB_MIN) { res.reliab = Math.round(100 * (rel.n - rel.abs) / rel.n); res.reliabN = rel.n; }
  try {
    var me = sessionUser_(d.token), t = findAccount_(sp8Pseudo_(d.pseudo));
    res.kudos = sp8KudoCounts_()[sp8Lc_(d.pseudo)] || 0;
    res.levels = sp8LevelsOf_(d.pseudo);
    if (me && t && sp8Lc_(t.pseudo) !== sp8Lc_(me.pseudo)) res.canKudo = sp8KudoEligible_(me.pseudo, t.pseudo).length > 0;
  } catch (x) {}
  return res;
}

/* ===================== 3. Notifications : abonnements push ===================== */
// Un appareil = un abonnement. L'envoi « appli fermée » est en section 20.
function sp8PushSubscribe_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var sub = d.sub || {}, ep = String(sub.endpoint || ""), keys = sub.keys || {};
  if (d.native) {                                     // appli iPhone / Android : jeton Firebase
    var tok = String(d.fcm || "");
    if (!/^[A-Za-z0-9:_\\-]{20,400}$/.test(tok)) return err_("Abonnement invalide.");
    ep = SP16.PREFIX + tok; keys = { p256dh: String(d.native).slice(0, 10), auth: "" };
  } else
  if (!/^https:\\/\\/[^\\s"'<>]+$/.test(ep) || ep.length > 1000) return err_("Abonnement invalide.");
  var sh = sp8ShPush_(), rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) if (rows[i][2] === ep) sh.deleteRow(i + 1);
  sh.appendRow([Date.now(), me.pseudo, ep, clip_(keys.p256dh, 200), clip_(keys.auth, 100), Date.now()]);
  return { status: "success" };
}
function sp8PushUnsubscribe_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var sh = sp8ShPush_(), rows = sh.getDataRange().getValues(), ep = String(d.endpoint || ""), p = sp8Lc_(me.pseudo);
  for (var i = rows.length - 1; i >= 1; i--) if (rows[i][2] === ep && sp8Lc_(rows[i][1]) === p) sh.deleteRow(i + 1);
  return { status: "success" };
}

/* ===================== 4. RGPD ===================== */
function sp8ExportUser_(pseudo, out) {
  var p = sp8Lc_(pseudo);
  out.points_séances = rowsOf_(sp8ShPoints_()).filter(function (r) { return sp8Lc_(r[1]) === p; })
    .map(function (r) { return { date: Number(r[0]), annonce: r[3], points: r[4] }; });
  out.avis_donnés = rowsOf_(sp8ShAvis_()).filter(function (r) { return sp8Lc_(r[2]) === p; })
    .map(function (r) { return { date: Number(r[0]), séance: r[1], membre: r[3], note: r[4], qualités: r[5], absent: r[6] === "oui" }; });
  var rv = sp8ReviewAll_()[p];
  out.avis_reçus = rv ? { nombre: rv.n, moyenne: rv.n ? Math.round(rv.sum / rv.n * 100) / 100 : null, qualités: rv.tags } : null;
  out.notifications_push = rowsOf_(sp8ShPush_()).filter(function (r) { return sp8Lc_(r[1]) === p; }).length + " appareil(s) abonné(s)";
  out.notifications_recentes = rowsOf_(sp14ShFile_()).filter(function (r) { return sp8Lc_(r[1]) === p; }).map(function (r) { return { date: Number(r[0]), titre: r[2], texte: r[3] }; });
  out.amis = rowsOf_(sp8ShFriends_()).filter(function (r) { return sp8Lc_(r[0]) === p || sp8Lc_(r[1]) === p; })
    .map(function (r) { return { de: r[0], à: r[1], statut: r[2], date: Number(r[3]) }; });
  var gm = {}; rowsOf_(sp8ShGroupMembers_()).forEach(function (r) { if (sp8Lc_(r[1]) === p) gm[String(r[0])] = 1; });
  out.groupes = rowsOf_(sp8ShGroups_()).filter(function (r) { return gm[String(r[0])]; }).map(function (r) { return { id: r[0], nom: r[1], créateur: r[2] }; });
  var mineIds = {}; (out.annonces || []).forEach(function (a) { mineIds[String(a.id)] = 1; });
  out.liste_attente = rowsOf_(sp8ShWait_()).filter(function (r) { return sp8Lc_(r[1]) === p; }).map(function (r) { return { séance: r[0], date: Number(r[3]), statut: r[4] }; });
  out.recours_modération = rowsOf_(sp8ShAppeal_()).filter(function (r) { return sp8Lc_(r[1]) === p; }).map(function (r) { return { date: Number(r[0]), type: r[2], cible: r[3], texte: r[4], statut: r[5] }; });
  out.alertes_dernière_minute = rowsOf_(sp8ShLmPrefs_()).filter(function (r) { return sp8Lc_(r[0]) === p; }).map(function (r) { return { actif: r[1] === "oui", zone_lat: r[2], zone_lng: r[3], rayon_km: r[4] }; })[0] || null;
  out.alertes_reçues = rowsOf_(sp8ShLmSent_()).filter(function (r) { return sp8Lc_(r[2]) === p; }).map(function (r) { return { date: Number(r[0]), séance: r[1] }; });
  out.kudos_donnés = rowsOf_(sp8ShKudos_()).filter(function (r) { return sp8Lc_(r[2]) === p; }).map(function (r) { return { date: Number(r[0]), séance: r[1], à: r[3] }; });
  out.kudos_reçus = rowsOf_(sp8ShKudos_()).filter(function (r) { return sp8Lc_(r[3]) === p; }).length;
  out.votes_niveau_donnés = rowsOf_(sp8ShLvl_()).filter(function (r) { return sp8Lc_(r[2]) === p; }).map(function (r) { return { date: Number(r[0]), séance: r[1], membre: r[3], sport: r[4], niveau: SP8_LVL[Number(r[5])] || "" }; });
  out.niveau_confirmé = sp8LevelsOf_(p);
  out.liens_proches = rowsOf_(sp8ShShare_()).filter(function (r) { return sp8Lc_(r[2]) === p; }).map(function (r) { return { séance: r[1], expire: Number(r[3]) }; });
  out.parrainage = { parrain: (rowsOf_(sp8ShRef_()).filter(function (r) { return sp8Lc_(r[0]) === p; })[0] || [])[1] || null, filleuls: rowsOf_(sp8ShRef_()).filter(function (r) { return sp8Lc_(r[1]) === p; }).length };
  out.images_annonces = rowsOf_(sp8ShImg_()).filter(function (r) { return mineIds[String(r[0])]; }).length + " image(s) (non incluses)";
}
function sp8DeleteUser_(pseudo) {
  var p = sp8Lc_(pseudo);
  [[sp8ShPoints_(), [1]], [sp8ShAvis_(), [2, 3]], [sp8ShSkip_(), [2]], [sp8ShPush_(), [1]], [sp8ShFriends_(), [0, 1]], [sp8ShGroupMembers_(), [1]], [sp8ShWait_(), [1]], [sp8ShAppeal_(), [1]], [sp8ShLmPrefs_(), [0]], [sp8ShLmSent_(), [2]], [sp8ShKudos_(), [2, 3]], [sp8ShLvl_(), [2, 3]], [sp8ShShare_(), [2]], [sp8ShRef_(), [0, 1]], [sp14ShFile_(), [1]]].forEach(function (x) {
    var sh = x[0], rows = sh.getDataRange().getValues();
    for (var i = rows.length - 1; i >= 1; i--) {
      if (x[1].some(function (col) { return sp8Lc_(rows[i][col]) === p; })) sh.deleteRow(i + 1);
    }
  });
  sp8CleanOrphans_();
  var c = CacheService.getScriptCache(); ["sp8:act", "sp8:meta", "sp8:rv", "sp8:rel", "sp8:imgs", "sp8:fr", "sp8:priv", "sp8:grp", "sp8:wait", "sp8:kudo", "sp8:lvl", "sp8:age", "sp8:ref"].forEach(function (k) { c.remove(k); });
}

/* ===================== 5. Amis et compte privé ===================== */
var SP8_MAX_FRIENDS = 300, SP8_MAX_GROUPS = 20, SP8_GROUP_MAX = 30, SP8_IMG_MAX = 45000;
function sp8ShFriends_()      { return sheetH_("Amis", ["de", "à", "statut", "date (ms)"]); }
function sp8ShGroups_()       { return sheetH_("Groupes", ["id", "nom", "créateur", "créé (ms)"]); }
function sp8ShGroupMembers_() { return sheetH_("GroupesMembres", ["groupe", "pseudo", "ajouté (ms)"]); }
function sp8ShImg_()          { return sheetH_("AnnoncesImages", ["annonce", "image"]); }
function sp8Pseudo_(v) { v = String(v || "").replace(/^@/, "").trim(); return /^[A-Za-z0-9_.-]{3,20}$/.test(v) ? v : ""; }

/** Toutes les relations : { "a|b": { de, à, statut } } avec a < b. Mis en cache 2 min. */
function sp8FriendRows_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:fr");
  if (hit) return jsonSafe_(hit);
  var list = rowsOf_(sp8ShFriends_()).filter(function (r) { return r[0] && r[1]; }).map(function (r) { return [String(r[0]), String(r[1]), String(r[2]), Number(r[3]) || 0]; });
  try { c.put("sp8:fr", JSON.stringify(list), 120); } catch (x) {}
  return list;
}
function sp8ForgetFriends_() { var c = CacheService.getScriptCache(); c.remove("sp8:fr"); }
/** État vu par \`pseudo\` : { autre: "ami" | "envoyee" | "recue" } */
function sp8FriendState_(pseudo) {
  var p = sp8Lc_(pseudo), o = {};
  sp8FriendRows_().forEach(function (r) {
    var a = sp8Lc_(r[0]), b = sp8Lc_(r[1]);
    if (a !== p && b !== p) return;
    var other = a === p ? b : a;
    o[other] = r[2] === "ami" ? "ami" : (a === p ? "envoyee" : "recue");
  });
  return o;
}
function sp8PrivateSet_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:priv");
  if (hit) return jsonSafe_(hit);
  var o = {}, m = profMap_();
  Object.keys(m).forEach(function (k) { if (m[k].data && m[k].data.private === true) o[k] = 1; });
  try { c.put("sp8:priv", JSON.stringify(o), 60); } catch (x) {}
  return o;
}

function sp8FriendList_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var st = sp8FriendState_(me.pseudo), nm = nameMap_(), profs = profMap_(), out = { friends: [], incoming: [], outgoing: [] };
  Object.keys(st).forEach(function (k) {
    var acc = nm[k]; if (!acc || isBanned_(k)) return;
    var o = { pseudo: acc.pseudo, name: shownName_(acc, profs[k]) };
    (st[k] === "ami" ? out.friends : st[k] === "recue" ? out.incoming : out.outgoing).push(o);
  });
  ["friends", "incoming", "outgoing"].forEach(function (k) { out[k].sort(function (a, b) { return a.name.localeCompare(b.name); }); });
  out.status = "success";
  return out;
}
function sp8FriendRequest_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var to = findAccount_(sp8Pseudo_(d.pseudo));
  if (!to) return err_("Ce membre n'existe pas.");
  var p = sp8Lc_(me.pseudo), q = sp8Lc_(to.pseudo);
  if (p === q) return err_("Vous ne pouvez pas vous ajouter vous-même.");
  var bl = blocks_(me.pseudo);
  if (bl.mine[q] || bl.them[q] || isBanned_(q)) return err_("Impossible d'ajouter ce membre.");
  var lim = rate_("frq:" + me.pseudo, 40, 3600, "Trop de demandes en peu de temps. Réessayez plus tard.");
  if (lim) return err_(lim);
  var st = sp8FriendState_(me.pseudo);
  if (st[q] === "ami") return { status: "success", state: "ami" };
  if (st[q] === "envoyee") return { status: "success", state: "envoyee" };
  if (st[q] === "recue") return sp8FriendRespond_({ token: d.token, pseudo: to.pseudo, accept: true });
  var n = 0; Object.keys(st).forEach(function (k) { if (st[k] === "ami") n++; });
  if (n >= SP8_MAX_FRIENDS) return err_("Vous avez atteint " + SP8_MAX_FRIENDS + " amis.");
  sp8ShFriends_().appendRow([me.pseudo, to.pseudo, "attente", Date.now()]);
  sp8ForgetFriends_();
  try { sp14OnFriend_(me, to.pseudo); } catch (x) {}
  return { status: "success", state: "envoyee" };
}
function sp8FriendRespond_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var q = sp8Lc_(sp8Pseudo_(d.pseudo)), p = sp8Lc_(me.pseudo), sh = sp8ShFriends_(), rows = sh.getDataRange().getValues();
  if (d.accept === true) {
    var bl = blocks_(me.pseudo);
    if (bl.mine[q] || bl.them[q] || isBanned_(q)) return err_("Impossible d'ajouter ce membre.");
    var st0 = sp8FriendState_(me.pseudo), n0 = 0; Object.keys(st0).forEach(function (k) { if (st0[k] === "ami") n0++; });
    if (n0 >= SP8_MAX_FRIENDS) return err_("Vous avez atteint " + SP8_MAX_FRIENDS + " amis.");
  }
  for (var i = rows.length - 1; i >= 1; i--) {
    if (sp8Lc_(rows[i][0]) === q && sp8Lc_(rows[i][1]) === p && rows[i][2] === "attente") {
      if (d.accept === true) sh.getRange(i + 1, 3, 1, 2).setValues([["ami", Date.now()]]);
      else sh.deleteRow(i + 1);
      sp8ForgetFriends_();
      return { status: "success", state: d.accept === true ? "ami" : "" };
    }
  }
  return err_("Demande introuvable.");
}
/** Retire un ami, annule une demande envoyée ou refuse une demande reçue. Le retire aussi des groupes dont l'un est créateur. */
function sp8FriendRemove_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var q = sp8Lc_(sp8Pseudo_(d.pseudo)), p = sp8Lc_(me.pseudo), sh = sp8ShFriends_(), rows = sh.getDataRange().getValues(), n = 0;
  for (var i = rows.length - 1; i >= 1; i--) {
    var a = sp8Lc_(rows[i][0]), b = sp8Lc_(rows[i][1]);
    if ((a === p && b === q) || (a === q && b === p)) { sh.deleteRow(i + 1); n++; }
  }
  sp8ForgetFriends_();
  var g = sp8GroupsAll_();
  Object.keys(g).forEach(function (id) {
    var o = g[id], own = sp8Lc_(o.owner);
    if (own === p && sp8IsMember_(o, q)) sp8DropMember_(o, q);
    else if (own === q && sp8IsMember_(o, p)) sp8DropMember_(o, p);
  });
  return { status: "success", removed: n };
}

/** profileGet : les profils privés ne montrent que nom et photo aux non-amis. Ajoute l'état d'amitié. */
var sp8BlkMemo_ = {};
function sp8Blk_(pseudo) { var k = sp8Lc_(pseudo); return sp8BlkMemo_[k] || (sp8BlkMemo_[k] = blocks_(pseudo)); }
function sp8ProfileGet_(e, data, baseDoPost) {
  sp8BlkMemo_ = {};
  var res = sp8Parse_(baseDoPost(e));
  if (!res || res.status !== "success" || !res.profiles) return out_(res || err_("Erreur serveur."));
  var me = sessionUser_(data.token), st = me ? sp8FriendState_(me.pseudo) : {}, priv = sp8PrivateSet_(), mine = me ? sp8Lc_(me.pseudo) : "";
  Object.keys(res.profiles).forEach(function (ps) {
    var k = sp8Lc_(ps), o = res.profiles[ps];
    var blk = me && k !== mine && (hides_(sp8Blk_(me.pseudo), ps));
    o.friend = blk ? "" : st[k] || "";
    if (priv[k]) {
      o.private = true;
      if (k !== mine && o.friend !== "ami") {
        o.locked = true; o.state = "hidden";
        o.bio = ""; o.city = ""; o.club = ""; o.link = ""; o.sports = []; o.avail = {};
        o.emoji = ""; o.text = "";                                     // matchs et points restent visibles, comme au classement
      }
    }
  });
  return out_(res);
}

/* ===================== 6. Groupes de discussion ===================== */
// Un groupe a un id numérique : ses messages passent par le canal « #id » de Code.gs (msgSend / msgSync).
function sp8GroupsAll_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:grp");
  if (hit) return jsonSafe_(hit);
  var g = {};
  rowsOf_(sp8ShGroups_()).forEach(function (r) { if (r[0]) g[String(r[0])] = { id: String(r[0]), name: String(r[1]), owner: String(r[2]), ts: Number(r[3]) || 0, members: [] }; });
  rowsOf_(sp8ShGroupMembers_()).forEach(function (r) { var o = g[String(r[0])]; if (o) o.members.push(String(r[1])); });
  try { c.put("sp8:grp", JSON.stringify(g), 300); } catch (x) {}
  return g;
}
function sp8ForgetGroups_(members) {
  var c = CacheService.getScriptCache(); c.remove("sp8:grp");
  (members || []).forEach(function (m) { c.remove("sids:" + sp8Lc_(m)); });
}
function sp8MyGroupIds_(pseudo) {
  var p = sp8Lc_(pseudo), g = sp8GroupsAll_(), o = {};
  Object.keys(g).forEach(function (id) { if (g[id].members.some(function (m) { return sp8Lc_(m) === p; })) o[id] = 1; });
  return o;
}
function sp8IsMember_(grp, pseudo) { var p = sp8Lc_(pseudo); return grp.members.some(function (m) { return sp8Lc_(m) === p; }); }
function sp8GroupOut_(grp, nm, profs) {
  return { id: grp.id, name: grp.name, owner: grp.owner, ts: grp.ts, members: grp.members.map(function (m) { var k = sp8Lc_(m), acc = nm[k]; return { pseudo: m, name: acc ? shownName_(acc, profs[k]) : m }; }) };
}
function sp8GroupList_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var g = sp8GroupsAll_(), nm = nameMap_(), profs = profMap_(), out = [];
  Object.keys(g).forEach(function (id) { if (sp8IsMember_(g[id], me.pseudo)) out.push(sp8GroupOut_(g[id], nm, profs)); });
  out.sort(function (a, b) { return b.ts - a.ts; });
  return { status: "success", groups: out };
}
function sp8GroupFriendsOnly_(me, list) {
  var st = sp8FriendState_(me.pseudo), nm = nameMap_(), out = [], seen = {}, cnt = {}, g = sp8GroupsAll_(), adultMe = !sp8Minor_(me.pseudo);
  Object.keys(g).forEach(function (id) { g[id].members.forEach(function (m) { cnt[sp8Lc_(m)] = (cnt[sp8Lc_(m)] || 0) + 1; }); });
  (Array.isArray(list) ? list : []).forEach(function (x) {
    var k = sp8Lc_(sp8Pseudo_(x));
    if (!k || seen[k] || k === sp8Lc_(me.pseudo) || st[k] !== "ami" || !nm[k] || isBanned_(k) || (cnt[k] || 0) >= SP8_MAX_GROUPS) return;
    if (adultMe && sp8Minor_(k) && !sp8SharedSession_(me.pseudo, k)) return;   // protection des mineurs : pas de groupe adulte → mineur sans séance commune
    seen[k] = 1; out.push(nm[k].pseudo);
  });
  return out;
}
function sp8GroupCreate_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var name = clip_(d.name, 40);
  if (!name) return err_("Donnez un nom au groupe.");
  var bad = badAny_([name]); if (bad) return err_(bad);
  var lim = rate_("gcr:" + me.pseudo, 10, 86400, "Trop de groupes créés aujourd'hui.");
  if (lim) return err_(lim);
  var mineCount = Object.keys(sp8MyGroupIds_(me.pseudo)).length;
  if (mineCount >= SP8_MAX_GROUPS) return err_("Vous êtes déjà dans " + SP8_MAX_GROUPS + " groupes.");
  var members = sp8GroupFriendsOnly_(me, d.members).slice(0, SP8_GROUP_MAX - 1);
  if (!members.length) return err_("Ajoutez au moins un ami au groupe.");
  var now = Date.now(), id = String(now * 1000 + 500 + Math.floor(Math.random() * 500));
  sp8ShGroups_().appendRow([id, safe_(name), me.pseudo, now]);
  var shm = sp8ShGroupMembers_();
  [me.pseudo].concat(members).forEach(function (m) { shm.appendRow([id, m, now]); });
  sp8ForgetGroups_([me.pseudo].concat(members));
  return { status: "success", id: id };
}
function sp8GroupGet_(d, me) {
  var g = sp8GroupsAll_()[String(d.id || "")];
  if (!g || !sp8IsMember_(g, me.pseudo)) return null;
  return g;
}
function sp8GroupAdd_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var g = sp8GroupGet_(d, me);
  if (!g) return err_("Groupe introuvable.");
  var add = sp8GroupFriendsOnly_(me, Array.isArray(d.members) ? d.members : [d.pseudo]).filter(function (m) { return !sp8IsMember_(g, m); });
  if (!add.length) return err_("Choisissez un ami qui n'est pas déjà dans le groupe.");
  if (g.members.length + add.length > SP8_GROUP_MAX) return err_("Un groupe compte " + SP8_GROUP_MAX + " membres au plus.");
  var shm = sp8ShGroupMembers_(), now = Date.now();
  add.forEach(function (m) { shm.appendRow([g.id, m, now]); });
  sp8ForgetGroups_(g.members.concat(add));
  return { status: "success", added: add.length };
}
function sp8DropMember_(g, pseudo) {
  var shm = sp8ShGroupMembers_(), rows = shm.getDataRange().getValues(), p = sp8Lc_(pseudo);
  for (var i = rows.length - 1; i >= 1; i--) if (String(rows[i][0]) === g.id && sp8Lc_(rows[i][1]) === p) shm.deleteRow(i + 1);
  var left = g.members.filter(function (m) { return sp8Lc_(m) !== p; });
  var shg = sp8ShGroups_(), gr = shg.getDataRange().getValues();
  for (var j = gr.length - 1; j >= 1; j--) {
    if (String(gr[j][0]) !== g.id) continue;
    if (!left.length) shg.deleteRow(j + 1);                                       // plus personne : groupe supprimé
    else if (sp8Lc_(gr[j][2]) === p) shg.getRange(j + 1, 3).setValue(left[0]);   // le créateur part : un autre membre reprend
  }
  sp8ForgetGroups_(g.members);
}
function sp8GroupLeave_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var g = sp8GroupGet_(d, me);
  if (!g) return err_("Groupe introuvable.");
  sp8DropMember_(g, me.pseudo);
  return { status: "success" };
}
function sp8GroupRemove_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var g = sp8GroupGet_(d, me);
  if (!g) return err_("Groupe introuvable.");
  if (sp8Lc_(g.owner) !== sp8Lc_(me.pseudo)) return err_("Seul le créateur du groupe peut retirer un membre.");
  var t = sp8Pseudo_(d.pseudo);
  if (!t || !sp8IsMember_(g, t) || sp8Lc_(t) === sp8Lc_(me.pseudo)) return err_("Membre introuvable.");
  sp8DropMember_(g, t);
  return { status: "success" };
}
function sp8GroupRename_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var g = sp8GroupGet_(d, me);
  if (!g) return err_("Groupe introuvable.");
  var name = clip_(d.name, 40);
  if (!name) return err_("Donnez un nom au groupe.");
  var bad = badAny_([name]); if (bad) return err_(bad);
  var shg = sp8ShGroups_(), gr = shg.getDataRange().getValues();
  for (var j = gr.length - 1; j >= 1; j--) if (String(gr[j][0]) === g.id) shg.getRange(j + 1, 2).setValue(safe_(name));
  sp8ForgetGroups_([]);
  return { status: "success" };
}

/* ===================== 7. Images dans les annonces ===================== */
// Une image JPEG par annonce, compressée dans le navigateur (45 Ko max), rangée dans l'onglet AnnoncesImages.
// Pas de Google Drive : aucune autorisation ni domaine externe en plus.
function sp8CleanImg_(a) {
  a = String(a || "");
  return /^data:image\\/(jpeg|webp);base64,[A-Za-z0-9+\\/=]+$/.test(a) && a.length <= SP8_IMG_MAX ? a : "";
}
function sp8ImgIds_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:imgs");
  if (hit) return jsonSafe_(hit);
  var sh = sp8ShImg_(), last = sh.getLastRow(), o = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { if (r[0]) o[String(r[0])] = 1; });
  try { c.put("sp8:imgs", JSON.stringify(o), 300); } catch (x) {}
  return o;
}
function sp8PostImage_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var id = String(Number(d.id) || "");
  if (!id || hidden_()["annonce:" + id]) return err_("Image indisponible.");
  var author = "";
  rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (String(r[0]) === id) author = String(r[1]); });
  if (!author) return err_("Image indisponible.");
  var k = sp8Lc_(author), mine = sp8Lc_(me.pseudo);
  if (k !== mine) {
    if (hides_(blocks_(me.pseudo), author)) return err_("Image indisponible.");
    if (sp8PrivateSet_()[k] && sp8FriendState_(me.pseudo)[k] !== "ami") return err_("Image indisponible.");
  }
  var sh = sp8ShImg_(), last = sh.getLastRow();
  if (last < 2) return err_("Image indisponible.");
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === id) return { status: "success", id: id, img: String(sh.getRange(i + 2, 2).getValue()) };
  return err_("Image indisponible.");
}
function sp8PostDelete_(e, data, baseDoPost) {
  var out = baseDoPost(e), res = sp8Parse_(out);
  var c = CacheService.getScriptCache(); c.remove("sp8:act"); c.remove("sp8:meta");
  if (res && res.status === "success") {
    var id = String(Number(data.id) || "");
    sp8After_(function () {
      var sh = sp8ShImg_(), rows = sh.getDataRange().getValues();
      for (var i = rows.length - 1; i >= 1; i--) if (String(rows[i][0]) === id) sh.deleteRow(i + 1);
      c.remove("sp8:imgs");
    });
  }
  return out;
}
/** Après suppression d'un compte : images d'annonces disparues et groupes vides. */
function sp8CleanOrphans_() {
  var live = {};
  rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (r[0]) live[String(r[0])] = 1; });
  var sh = sp8ShImg_(), rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) if (!live[String(rows[i][0])]) sh.deleteRow(i + 1);
  var used = {};
  rowsOf_(sp8ShGroupMembers_()).forEach(function (r) { used[String(r[0])] = (used[String(r[0])] || []).concat(String(r[1])); });
  var shg = sp8ShGroups_(), gr = shg.getDataRange().getValues();
  for (var j = gr.length - 1; j >= 1; j--) {
    var id = String(gr[j][0]), mem = used[id];
    if (!mem || !mem.length) shg.deleteRow(j + 1);
    else if (mem.map(sp8Lc_).indexOf(sp8Lc_(gr[j][2])) < 0) shg.getRange(j + 1, 3).setValue(mem[0]);
  }
}

/* ===================== 8. Liste d'attente des séances ===================== */
// Séance complète : on s'inscrit en liste d'attente. Quand une place se libère, le premier inscrit est ajouté automatiquement.
function sp8ShWait_() { return sheetH_("ListeAttente", ["séance", "pseudo", "prénom", "date (ms)", "statut", "promu le (ms)"]); }
function sp8WaitRows_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:wait");
  if (hit) return jsonSafe_(hit);
  var list = rowsOf_(sp8ShWait_()).filter(function (r) { return r[0] && r[1]; }).map(function (r) { return [String(r[0]), String(r[1]), Number(r[3]) || 0, String(r[4] || "attente"), Number(r[5]) || 0]; });
  try { c.put("sp8:wait", JSON.stringify(list), 120); } catch (x) {}
  return list;
}
function sp8ForgetWait_() { CacheService.getScriptCache().remove("sp8:wait"); }
function sp8SessRow_(id) { var s = null; rowsOf_(shSeances_()).forEach(function (r) { if (String(r[0]) === id) s = r; }); return s; }
function sp8SessCount_(id) { var n = 0; rowsOf_(shInscr_()).forEach(function (r) { if (String(r[0]) === id) n++; }); return n; }
function sp8IsIn_(id, pseudo) { var p = sp8Lc_(pseudo); return rowsOf_(shInscr_()).some(function (r) { return String(r[0]) === id && sp8Lc_(r[1]) === p; }); }
function sp8WaitJoin_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), s = sp8SessRow_(id), now = Date.now();
  if (!s || s[12] !== "ouverte" || Number(s[7]) < now) return err_("Cette séance n'est plus disponible.");
  if (hides_(blocks_(me.pseudo), s[1])) return err_("Cette séance n'est plus disponible.");
  if (sp8AdultBlock_(id, me.pseudo)) return err_(SP8_MSG_ADULT);
  if (sp8IsIn_(id, me.pseudo)) return { status: "success", already: true };
  if (sp8SessCount_(id) < Number(s[8])) return err_("Il reste une place : rejoignez directement la séance.");
  var lim = rate_("wtj:" + me.pseudo, 30, 3600, "Trop d'actions en peu de temps."); if (lim) return err_(lim);
  var p = sp8Lc_(me.pseudo), rows = sp8WaitRows_(), pos = 0, mine = false;
  rows.forEach(function (r) { if (r[0] === id && r[3] === "attente") { pos++; if (sp8Lc_(r[1]) === p) mine = true; } });
  if (mine) return { status: "success", already: true };
  if (pos >= 20) return err_("La liste d'attente est pleine.");
  sp8ShWait_().appendRow([id, me.pseudo, me.name, now, "attente", ""]);
  sp8ForgetWait_();
  return { status: "success", position: pos + 1 };
}
function sp8WaitDrop_(id, pseudo, onlyWaiting) {
  var sh = sp8ShWait_(), rows = sh.getDataRange().getValues(), p = sp8Lc_(pseudo), n = 0;
  for (var i = rows.length - 1; i >= 1; i--) if (String(rows[i][0]) === id && sp8Lc_(rows[i][1]) === p && (!onlyWaiting || String(rows[i][4] || "attente") === "attente")) { sh.deleteRow(i + 1); n++; }
  n && sp8ForgetWait_();
  return n;
}
function sp8WaitLeave_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  sp8WaitDrop_(String(Number(d.id) || ""), me.pseudo, true);
  return { status: "success" };
}
/** Une place s'est libérée : on inscrit les premiers de la liste d'attente (dans l'ordre d'arrivée). */
function sp8Promote_(id) {
  var s = sp8SessRow_(id), now = Date.now();
  if (!s || s[12] !== "ouverte" || Number(s[7]) < now) return [];
  var free = Number(s[8]) - sp8SessCount_(id), done = [];
  if (free <= 0) return done;
  var sh = sp8ShWait_(), rows = sh.getDataRange().getValues(), cand = [];
  for (var i = 1; i < rows.length; i++) if (String(rows[i][0]) === id && String(rows[i][4] || "attente") === "attente") cand.push({ row: i + 1, pseudo: String(rows[i][1]), name: String(rows[i][2]), ts: Number(rows[i][3]) || 0 });
  cand.sort(function (a, b) { return a.ts - b.ts; });
  cand.forEach(function (c) {
    if (free <= 0) return;
    if (!findAccount_(c.pseudo) || isBanned_(sp8Lc_(c.pseudo)) || hides_(blocks_(c.pseudo), s[1]) || sp8AdultBlock_(id, c.pseudo)) { sh.getRange(c.row, 5).setValue("écarté"); return; }
    if (!sp8IsIn_(id, c.pseudo)) { shInscr_().appendRow([Number(id), c.pseudo, c.name, now]); free--; }
    sh.getRange(c.row, 5, 1, 2).setValues([["promu", now]]);
    forgetSeanceIds_(c.pseudo);
    done.push(c.pseudo);
    try { sp8MailPromoted_(c.pseudo, s); } catch (x) {}
    try { sp14OnPromote_(c.pseudo, s); } catch (x) {}
  });
  sp8ForgetWait_();
  return done;
}
function sp8MailPromoted_(pseudo, s) {
  if (typeof mailOn_ !== "function" || !mailOn_()) return;
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), email = "", p = sp8Lc_(pseudo);
  for (var i = 1; i < rows.length; i++) if (sp8Lc_(rows[i][6]) === p) email = String(rows[i][3]);
  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) return;
  var when = Utilities.formatDate(new Date(Number(s[7])), SP8.TZ, "dd/MM 'à' HH'h'mm"), url = mailProp_("SITE_URL", "https://spary.fr") + "/#seance=" + s[0];
  var intro = "Une place s'est libérée : tu es maintenant inscrit·e à la séance de " + s[3] + " (" + s[4] + ") le " + when + ". Si tu ne peux plus venir, désinscris-toi pour laisser la place au suivant.";
  mail_(email, "Une place s'est libérée pour toi sur Spary", mailLayout_("Tu es inscrit·e !", intro, "Voir la séance", url, "Tu reçois cet e-mail car tu étais en liste d'attente pour cette séance."), intro + "\\n" + url);
}

/* ===================== 9. Indice de fiabilité ===================== */
// Part des séances où le membre était présent, d'après les avis (une séance compte comme absence si la majorité des avis le disent absent).
function sp8Reliab_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:rel");
  if (hit) return jsonSafe_(hit);
  var per = {}, okd = sp8AbsenceAccepted_();
  rowsOf_(sp8ShAvis_()).forEach(function (r) {
    var k = sp8Lc_(r[3]) + "|" + String(r[1]), o = per[k] = per[k] || { abs: 0, pres: 0 };
    if (okd[k] && r[6] === "oui") return;
    r[6] === "oui" ? o.abs++ : o.pres++;
  });
  var m = {};
  Object.keys(per).forEach(function (k) {
    var who = k.split("|")[0], o = m[who] = m[who] || { n: 0, abs: 0 };
    o.n++; if (per[k].abs > per[k].pres) o.abs++;
  });
  try { c.put("sp8:rel", JSON.stringify(m), 300); } catch (x) {}
  return m;
}

/* ===================== 10. Récap du mois ===================== */
function sp8Recap_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var now = new Date(), cur = Utilities.formatDate(now, SP8.TZ, "yyyy-MM"), month = /^\\d{4}-\\d{2}$/.test(String(d.month || "")) ? String(d.month) : cur;
  if (month > cur) month = cur;
  var p = sp8Lc_(me.pseudo), inMonth = function (ms) { return ms && Utilities.formatDate(new Date(Number(ms)), SP8.TZ, "yyyy-MM") === month; };
  var act = {}, live = {}, hid = hidden_(), meta = sp8PostMeta_();
  rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (r[0]) live[String(r[0])] = 1; });
  var out = { status: "success", month: month, points: 0, posted: 0, played: 0, minutes: 0, partners: 0, sports: [] }, sports = {}, partners = {}, places = {};
  rowsOf_(sp8ShPoints_()).forEach(function (r) {
    if (sp8Lc_(r[1]) !== p || !inMonth(r[0])) return;
    var id = String(r[3]); if (!live[id] || hid["annonce:" + id]) return;
    out.points += Number(r[4]) || 0;
  });
  Object.keys(meta).forEach(function (id) { act[id] = meta[id]; });
  rowsAll_(sheet_("Annonces", true)).forEach(function (r) {
    var id = String(r[0]); if (!id || sp8Lc_(r[1]) !== p || !act[id] || hid["annonce:" + id]) return;
    var ts = r[6] ? new Date(r[6]).getTime() : Number(id); if (!inMonth(ts)) return;
    out.posted++; out.minutes += act[id].d || 0; sports[act[id].s] = (sports[act[id].s] || 0) + 1;
  });
  var sess = {}; rowsOf_(shSeances_()).forEach(function (r) { sess[String(r[0])] = r; });
  var mineS = {}; rowsOf_(shInscr_()).forEach(function (r) { if (sp8Lc_(r[1]) === p) mineS[String(r[0])] = 1; });
  rowsOf_(shInscr_()).forEach(function (r) { var id = String(r[0]), s = sess[id]; if (mineS[id] && s && s[12] === "ouverte" && Number(s[7]) < now.getTime() && inMonth(s[7]) && sp8Lc_(r[1]) !== p) partners[sp8Lc_(r[1])] = 1; });
  Object.keys(mineS).forEach(function (id) {
    var s = sess[id]; if (!s || s[12] !== "ouverte" || Number(s[7]) >= now.getTime() || !inMonth(s[7])) return;
    out.played++; out.minutes += Number(s[15]) || 60; sports[String(s[3])] = (sports[String(s[3])] || 0) + 1;
    var pl = clip_(s[4], 60); if (pl) places[pl] = (places[pl] || 0) + 1;
  });
  out.placesN = Object.keys(places).length;
  out.places = Object.keys(places).sort(function (a, b) { return places[b] - places[a]; }).slice(0, 3);
  out.partners = Object.keys(partners).length;
  out.sports = Object.keys(sports).sort(function (a, b) { return sports[b] - sports[a]; }).slice(0, 3);
  return out;
}

/* ===================== 11. Modération : information de l'auteur, recours, suivi des signalements (DSA) ===================== */
function sp8ShAppeal_() { return sheetH_("Recours", ["date (ms)", "pseudo", "type", "cible", "texte", "statut"]); }
var SP8_TYPE_LABEL = { annonce: "annonce", commentaire: "commentaire", session: "séance", message: "message", membre: "profil" };
function sp8ModNotices_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var p = sp8Lc_(me.pseudo), hid = hidden_(), by = {};
  rowsOf_(shReports_()).forEach(function (r) {
    if (!r[0] || sp8Lc_(r[5]) !== p) return;
    var k = String(r[3]) + ":" + String(r[4]); if (!hid[k]) return;
    var o = by[k] = by[k] || { type: String(r[3]), target: String(r[4]), extract: "", reasons: {}, removed: false, ts: 0 };
    o.reasons[String(r[6])] = (o.reasons[String(r[6])] || 0) + 1;
    o.ts = Math.max(o.ts, Number(r[1]) || 0);
    if (r[8]) o.extract = String(r[8]);
    if (norm_(r[9]) === "retire") o.removed = true;
  });
  var appeals = {};
  rowsOf_(sp8ShAppeal_()).forEach(function (r) { if (sp8Lc_(r[1]) === p) appeals[String(r[2]) + ":" + String(r[3])] = String(r[5] || "nouveau"); });
  var list = Object.keys(by).map(function (k) {
    var o = by[k], reason = Object.keys(o.reasons).sort(function (a, b) { return o.reasons[b] - o.reasons[a]; })[0] || "";
    return { key: k, type: o.type, label: SP8_TYPE_LABEL[o.type] || o.type, extract: clip_(o.extract, 140), reason: reason, decision: o.removed ? "humaine" : "automatique", removed: o.removed, ts: o.ts, appeal: appeals[k] || "" };
  }).sort(function (a, b) { return b.ts - a.ts; });
  return { status: "success", notices: list.slice(0, 30), contact: CONTACT_MAIL };
}
function sp8ModAppeal_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var key = String(d.key || ""), text = clip_(d.text, 1000);
  var n = sp8ModNotices_(d).notices || [], it = n.filter(function (x) { return x.key === key; })[0];
  if (!it) return err_("Décision introuvable.");
  if (it.appeal) return { status: "success", already: true };
  if (text.length < 10) return err_("Expliquez en quelques mots pourquoi vous contestez (10 caractères minimum).");
  var lim = rate_("apl:" + me.pseudo, 5, 86400, "Trop de recours aujourd'hui. Réessayez demain."); if (lim) return err_(lim);
  sp8ShAppeal_().appendRow([Date.now(), me.pseudo, it.type, String(key.split(":").slice(1).join(":")), safe_(text), "nouveau"]);
  try {
    if (typeof mailOn_ === "function" && mailOn_()) mail_(CONTACT_MAIL, "Recours modération : " + it.label + " de @" + me.pseudo,
      "<p>@" + mailEsc_(me.pseudo) + " conteste le masquage de son " + mailEsc_(it.label) + " (" + mailEsc_(key) + ").</p><p>Motif du masquage : " + mailEsc_(it.reason) + "</p><p>Contenu : " + mailEsc_(it.extract) + "</p><p>Recours : " + mailEsc_(text) + "</p><p>À traiter dans l'onglet Recours (colonne statut) et Signalements.</p>",
      "@" + me.pseudo + " conteste le masquage de " + key + " : " + text);
  } catch (x) {}
  return { status: "success" };
}
/** Suivi de mes signalements : reçu, puis décision. */
function sp8ReportStatus_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var p = sp8Lc_(me.pseudo), hid = hidden_(), since = Date.now() - 90 * 86400000, out = [];
  rowsOf_(shReports_()).forEach(function (r) {
    if (!r[0] || sp8Lc_(r[2]) !== p || (Number(r[1]) || 0) < since) return;
    var st = norm_(r[9]), k = String(r[3]) + ":" + String(r[4]);
    out.push({ type: SP8_TYPE_LABEL[String(r[3])] || String(r[3]), reason: String(r[6]), ts: Number(r[1]) || 0,
      state: st === "retire" ? "retiré" : st === "rejete" ? "conservé" : hid[k] ? "masqué en attente d'examen" : "reçu, en cours d'examen" });
  });
  out.sort(function (a, b) { return b.ts - a.ts; });
  return { status: "success", reports: out.slice(0, 30) };
}

/* Séances : liste d'attente branchée sur la liste, l'inscription et la désinscription de Code.gs */
function sp8SessionList_(e, data, baseDoPost) {
  var res = sp8Parse_(baseDoPost(e));
  if (!res || res.status !== "success" || !Array.isArray(res.sessions)) return out_(res || err_("Erreur serveur."));
  var me = sessionUser_(data.token), p = me ? sp8Lc_(me.pseudo) : "", by = {}, now = Date.now();
  sp8WaitRows_().forEach(function (r) { (by[r[0]] = by[r[0]] || []).push(r); });
  var opts = sp8Opts_();
  res.minor = me ? sp8Minor_(me.pseudo) : false;
  res.sessions.forEach(function (s) {
    var o = opts[String(s.id)] || {};
    if (o.adult) s.adult = true;
    if (o.alert && sp8Lc_(s.org) === p) { s.alerted = o.alert; s.alertN = o.alertN || 0; }
    var w = by[String(s.id)] || [], pos = 0;
    s.wait = 0;
    w.forEach(function (r) {
      if (r[3] === "attente") { s.wait++; if (sp8Lc_(r[1]) === p) pos = s.wait; }
      else if (r[3] === "promu" && sp8Lc_(r[1]) === p && now - r[4] < 72 * 3600000 && s.joined) s.promoted = r[4];
    });
    if (pos) s.waitPos = pos;
  });
  return out_(res);
}
function sp8SessionJoin_(e, data, baseDoPost) {
  var id0 = String(Number(data.id) || ""), me0 = sessionUser_(data.token);
  if (id0 && me0 && sp8AdultBlock_(id0, me0.pseudo)) return out_(err_(SP8_MSG_ADULT));
  if (id0 && me0) {
    var block = sp8Locked_(function () {
      sp8Promote_(id0);                                   // places libérées sans désinscription : la liste d'attente passe d'abord
      var p = sp8Lc_(me0.pseudo), waiting = rowsOf_(sp8ShWait_()).filter(function (r) { return String(r[0]) === id0 && String(r[4] || "attente") === "attente"; });
      return waiting.length && !waiting.some(function (r) { return sp8Lc_(r[1]) === p; }) && !sp8IsIn_(id0, me0.pseudo);
    });
    if (block) return out_(err_("Désolé, cette séance est complète : inscrivez-vous sur la liste d'attente."));
  }
  var out = baseDoPost(e), res = sp8Parse_(out);
  if (res && res.status === "success") {
    var me = sessionUser_(data.token);
    me && sp8After_(function () { sp8WaitDrop_(String(Number(data.id) || ""), me.pseudo, true); if (!res.already) sp14OnJoin_(data); });
  }
  return out;
}
function sp8SessionLeave_(e, data, baseDoPost) {
  var out = baseDoPost(e), res = sp8Parse_(out);
  if (res && res.status === "success") {
    var id = String(Number(data.id) || "");
    sp8After_(function () { sp8Promote_(id); });
  }
  return out;
}

/* ===================== 12. Mineurs : séances 18+ et messages privés ===================== */
// Âge calculé à partir de la date de naissance du compte (colonne F de Comptes). Jamais affiché ni transmis aux autres membres.
function sp8ShOpt_() { return sheetH_("SeancesOptions", ["séance", "option", "valeur", "date (ms)"]); }
function sp8Opts_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:opt");
  if (hit) return jsonSafe_(hit);
  var o = {};
  rowsOf_(sp8ShOpt_()).forEach(function (r) {
    var id = String(r[0]); if (!id) return;
    var x = o[id] = o[id] || {};
    if (r[1] === "adultes" && r[2] === "oui") x.adult = 1;
    if (r[1] === "alerte") { x.alert = Number(r[3]) || 1; x.alertN = Number(r[2]) || 0; }
  });
  try { c.put("sp8:opt", JSON.stringify(o), 120); } catch (x) {}
  return o;
}
function sp8ForgetOpts_() { CacheService.getScriptCache().remove("sp8:opt"); }
function sp8AgesFresh_() {
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), m = {};
  for (var i = 1; i < rows.length; i++) if (rows[i][6]) m[sp8Lc_(rows[i][6])] = age_(rows[i][5]);
  try { CacheService.getScriptCache().put("sp8:age", JSON.stringify(m), 600); } catch (x) {}
  return m;
}
function sp8Age_(pseudo) {
  var k = sp8Lc_(pseudo), hit = CacheService.getScriptCache().get("sp8:age"), m = hit ? jsonSafe_(hit) : null;
  if (!m || !(k in m)) m = sp8AgesFresh_();   // compte récent : relecture
  return Number(m[k]) || 0;
}
function sp8Minor_(pseudo) { return sp8Age_(pseudo) < 18; }   // date illisible : traité comme mineur (prudence)
function sp8SharedSession_(a, b) {
  var p = sp8Lc_(a), q = sp8Lc_(b), mine = {}, shared = false;
  rowsOf_(shInscr_()).forEach(function (r) { if (sp8Lc_(r[1]) === p) mine[String(r[0])] = 1; });
  rowsOf_(shInscr_()).forEach(function (r) { if (!shared && sp8Lc_(r[1]) === q && mine[String(r[0])]) shared = true; });
  return shared;
}
var SP8_MSG_MINOR = "Pour protéger les mineurs, un adulte ne peut écrire en privé à un membre de moins de 18 ans que s'ils participent à une même séance.";
function sp8MsgGuard_(d) {
  var to = String(d.to || "");
  if (!to || to.charAt(0) === "#") return "";
  var me = sessionUser_(d.token);
  if (!me || sp8Minor_(me.pseudo) || !findAccount_(to) || !sp8Minor_(to)) return "";
  return sp8SharedSession_(me.pseudo, to) ? "" : SP8_MSG_MINOR;
}
function sp8SessionCreate_(e, data, baseDoPost) {
  if (data.adult !== true) return baseDoPost(e);
  var me = sessionUser_(data.token);
  if (me && sp8Minor_(me.pseudo)) return out_(err_("Seuls les organisateurs majeurs peuvent proposer une séance 18+."));
  var out = baseDoPost(e), res = sp8Parse_(out);
  if (res && res.status === "success" && res.id) sp8After_(function () { sp8ShOpt_().appendRow([String(res.id), "adultes", "oui", Date.now()]); sp8ForgetOpts_(); });
  return out;
}
function sp8AdultBlock_(id, pseudo) { return !!(sp8Opts_()[String(id)] || {}).adult && sp8Minor_(pseudo); }
var SP8_MSG_ADULT = "Cette séance est réservée aux membres de 18 ans et plus.";

/* ===================== 13. Place libre dernière minute ===================== */
// Opt-in : le membre choisit une zone (position arrondie à ~1 km) et un rayon. L'organisateur d'une séance qui commence
// dans les 48 h et qui a des places libres peut prévenir, une fois, les membres du même sport et d'un niveau proche.
function sp8ShLmPrefs_() { return sheetH_("AlertesPrefs", ["pseudo", "actif", "lat", "lng", "rayon (km)", "mis à jour (ms)"]); }
function sp8ShLmSent_()  { return sheetH_("AlertesEnvoyees", ["date (ms)", "séance", "destinataire"]); }
var SP8_LM_KM = [3, 5, 10, 20], SP8_LM_MAX = 40, SP8_LM_HOURS = 48;
function sp8Km_(a, b, c, d) {
  var R = 6371, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
  var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) * Math.sin(y / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function sp8SameSport_(a, b) {
  var x = norm_(a).replace(/[^a-z0-9]+/g, " ").trim(), y = norm_(b).replace(/[^a-z0-9]+/g, " ").trim();
  if (!x || !y) return false;
  if (x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0) return true;
  return x.split(" ")[0].length >= 4 && x.split(" ")[0] === y.split(" ")[0];
}
function sp8LmPrefsGet_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var p = sp8Lc_(me.pseudo), o = { status: "success", on: false, km: 5, lat: null, lng: null };
  rowsOf_(sp8ShLmPrefs_()).forEach(function (r) { if (sp8Lc_(r[0]) === p) { o.on = r[1] === "oui"; o.lat = Number(r[2]) || null; o.lng = Number(r[3]) || null; o.km = Number(r[4]) || 5; } });
  var pr = profMap_()[p];
  o.sports = (pr && pr.data && Array.isArray(pr.data.sports) ? pr.data.sports : []).map(function (s) { return s.name; });
  var acc = accountByKey_(me.pseudo);
  o.mail = mailOn_() && !!(acc && acc.verified);
  return o;
}
function sp8LmPrefsSave_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var on = d.on === true, lat = Number(d.lat), lng = Number(d.lng), km = SP8_LM_KM.indexOf(Number(d.km)) >= 0 ? Number(d.km) : 5;
  var okPos = isFinite(lat) && isFinite(lng) && lat > 41 && lat < 51.6 && lng > -5.6 && lng < 9.9;
  if (on && !okPos) return err_("Choisis ta zone (ville ou position) pour activer les alertes.");
  lat = okPos ? Math.round(lat * 100) / 100 : ""; lng = okPos ? Math.round(lng * 100) / 100 : "";
  var sh = sp8ShLmPrefs_(), rows = sh.getDataRange().getValues(), p = sp8Lc_(me.pseudo), row = [me.pseudo, on ? "oui" : "non", lat, lng, km, Date.now()];
  for (var i = rows.length - 1; i >= 1; i--) if (sp8Lc_(rows[i][0]) === p) { sh.getRange(i + 1, 1, 1, 6).setValues([row]); return { status: "success", on: on }; }
  sh.appendRow(row);
  return { status: "success", on: on };
}
function sp8LmAlert_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), s = sp8SessRow_(id), now = Date.now();
  if (!s || s[12] !== "ouverte") return err_("Séance introuvable.");
  if (sp8Lc_(s[1]) !== sp8Lc_(me.pseudo)) return err_("Seul l'organisateur peut lancer l'alerte.");
  var start = Number(s[7]);
  if (start <= now || start > now + SP8_LM_HOURS * 3600000) return err_("L'alerte est possible pour une séance qui commence dans les 48 h.");
  var free = Number(s[8]) - sp8SessCount_(id);
  if (free <= 0) return err_("Ta séance est déjà complète.");
  var opt = sp8Opts_()[id] || {};
  if (opt.alert) return err_("L'alerte a déjà été envoyée pour cette séance.");
  var lim = rate_("lma:" + sp8Lc_(me.pseudo), 3, 86400, "Tu as déjà lancé 3 alertes aujourd'hui."); if (lim) return err_(lim);
  var lat = Number(s[5]), lng = Number(s[6]), lvl = SEANCE_LEVELS.indexOf(String(s[10])), adult = !!opt.adult;
  var inS = {}; rowsOf_(shInscr_()).forEach(function (r) { if (String(r[0]) === id) inS[sp8Lc_(r[1])] = 1; });
  var bl = blocks_(s[1]), nm = nameMap_(), profs = profMap_(), cand = [];
  rowsOf_(sp8ShLmPrefs_()).forEach(function (r) {
    var k = sp8Lc_(r[0]);
    if (r[1] !== "oui" || !nm[k] || inS[k] || hides_(bl, k)) return;
    var km = sp8Km_(lat, lng, Number(r[2]), Number(r[3]));
    if (!(km <= (Number(r[4]) || 5))) return;
    var sports = (profs[k] && profs[k].data && Array.isArray(profs[k].data.sports)) ? profs[k].data.sports : [];
    var sp = sports.filter(function (x) { return sp8SameSport_(x.name, s[3]); })[0];
    if (!sp) return;
    if (lvl > 0 && sp.level) { var ml = LEVELS.indexOf(sp.level) + 1; if (ml > 0 && Math.abs(ml - lvl) > 1) return; }
    if (adult && sp8Minor_(k)) return;
    cand.push({ pseudo: nm[k].pseudo, km: km });
  });
  cand.sort(function (a, b) { return a.km - b.km; });
  cand = cand.slice(0, SP8_LM_MAX);
  var sh = sp8ShLmSent_();
  cand.forEach(function (c) { sh.appendRow([now, id, c.pseudo]); });
  if (cand.length) { sp8ShOpt_().appendRow([id, "alerte", cand.length, now]); sp8ForgetOpts_(); try { sp14OnAlert_(s, free, cand); } catch (x) {} }   // personne à prévenir : l'alerte reste disponible
  return { status: "success", sent: cand.length, _mail: { s: s, free: free, to: cand } };
}
/** E-mails envoyés après la libération du verrou. Seulement aux adresses confirmées. */
function sp8LmMail_(m) {
  if (!m || !m.to || !m.to.length || typeof mailOn_ !== "function" || !mailOn_()) return;
  var want = {}; m.to.forEach(function (c) { want[sp8Lc_(c.pseudo)] = c; });
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), s = m.s;
  var when = Utilities.formatDate(new Date(Number(s[7])), SP8.TZ, "EEEE dd/MM 'à' HH'h'mm"), url = mailProp_("SITE_URL", "https://spary.fr").replace(/\\/+$/, "") + "/#seance=" + s[0];
  var nb = m.free + " joueur" + (m.free > 1 ? "s" : "");
  for (var i = 1; i < rows.length; i++) {
    var c = want[sp8Lc_(rows[i][6])], email = String(rows[i][3]);
    if (!c || !rows[i][12] || !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) continue;
    var intro = "Il manque " + nb + " pour une séance de " + s[3] + " (" + s[4] + ", à " + Math.max(1, Math.round(c.km)) + " km de ta zone) " + when + ". Premier inscrit, premier servi !";
    try { mail_(email, "Il manque " + nb + " : " + s[3] + " " + when, mailLayout_("Une place t'attend", intro, "Voir la séance", url, "Tu reçois cet e-mail car tu as activé les alertes dernière minute. Tu peux les couper dans Profil → Compte et données."), intro + "\\n" + url); } catch (x) {}
  }
}
function sp8LmInbox_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var p = sp8Lc_(me.pseudo), now = Date.now(), ids = {}, out = [];
  rowsOf_(sp8ShLmSent_()).forEach(function (r) { if (sp8Lc_(r[2]) === p && Number(r[0]) > now - SP8_LM_HOURS * 3600000) ids[String(r[1])] = Number(r[0]); });
  var keys = Object.keys(ids);
  if (!keys.length) return { status: "success", alerts: [] };
  var bl = blocks_(me.pseudo), cnt = {}, mine = {};
  rowsOf_(shInscr_()).forEach(function (r) { var id = String(r[0]); if (ids[id]) { cnt[id] = (cnt[id] || 0) + 1; if (sp8Lc_(r[1]) === p) mine[id] = 1; } });
  rowsOf_(shSeances_()).forEach(function (s) {
    var id = String(s[0]);
    if (!ids[id] || s[12] !== "ouverte" || Number(s[7]) <= now || mine[id] || hides_(bl, s[1])) return;
    var left = Number(s[8]) - (cnt[id] || 0); if (left <= 0) return;
    out.push({ id: Number(s[0]), sport: String(s[3]), place: String(s[4]), start: Number(s[7]), left: left, org: String(s[1]), orgName: String(s[2]), ts: ids[id] });
  });
  out.sort(function (a, b) { return a.start - b.start; });
  return { status: "success", alerts: out.slice(0, 10) };
}

/* ===================== 14. Kudos entre partenaires ===================== */
// Un tap pour féliciter un partenaire d'une séance jouée ensemble ces 30 derniers jours : un kudos par séance et par partenaire.
function sp8ShKudos_() { return sheetH_("Kudos", ["date (ms)", "séance", "de", "à"]); }
function sp8KudoCounts_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:kudo");
  if (hit) return jsonSafe_(hit);
  var m = {}; rowsOf_(sp8ShKudos_()).forEach(function (r) { var k = sp8Lc_(r[3]); if (k) m[k] = (m[k] || 0) + 1; });
  try { c.put("sp8:kudo", JSON.stringify(m), 300); } catch (x) {}
  return m;
}
/** Séances terminées des 30 derniers jours jouées par a et b, sans kudos de a vers b, plus récente d'abord. */
function sp8KudoEligible_(a, b) {
  var p = sp8Lc_(a), q = sp8Lc_(b), now = Date.now(), since = now - 30 * 864e5, mine = {}, both = [], done = {};
  rowsOf_(shInscr_()).forEach(function (r) { if (sp8Lc_(r[1]) === p) mine[String(r[0])] = 1; });
  var withB = {}; rowsOf_(shInscr_()).forEach(function (r) { if (sp8Lc_(r[1]) === q && mine[String(r[0])]) withB[String(r[0])] = 1; });
  rowsOf_(sp8ShKudos_()).forEach(function (r) { if (sp8Lc_(r[2]) === p && sp8Lc_(r[3]) === q) done[String(r[1])] = 1; });
  rowsOf_(shSeances_()).forEach(function (s) {
    var id = String(s[0]), st = Number(s[7]), end = st + (Number(s[15]) || 90) * 60000;
    if (withB[id] && !done[id] && s[12] === "ouverte" && end <= now && st >= since) both.push({ id: id, start: st });
  });
  both.sort(function (x, y) { return y.start - x.start; });
  return both;
}
function sp8KudoGive_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var to = findAccount_(sp8Pseudo_(d.pseudo));
  if (!to || sp8Lc_(to.pseudo) === sp8Lc_(me.pseudo)) return err_("Membre introuvable.");
  if (hides_(blocks_(me.pseudo), to.pseudo)) return err_("Impossible pour ce membre.");
  var lim = rate_("kdo:" + sp8Lc_(me.pseudo), 60, 3600, "Beaucoup de kudos en peu de temps, réessaie plus tard."); if (lim) return err_(lim);
  var el = sp8KudoEligible_(me.pseudo, to.pseudo);
  if (!el.length) return err_("Les kudos se donnent aux partenaires de tes séances des 30 derniers jours, un par séance.");
  sp8ShKudos_().appendRow([Date.now(), el[0].id, me.pseudo, to.pseudo]);
  CacheService.getScriptCache().remove("sp8:kudo");
  return { status: "success", kudos: (sp8KudoCounts_()[sp8Lc_(to.pseudo)] || 0), more: el.length > 1 };
}

/* ===================== 15. Niveau confirmé par les partenaires ===================== */
// Vote facultatif dans l'avis après séance (1 débutant, 2 intermédiaire, 3 confirmé). Anonyme ; affiché à partir de 3 votes par sport.
function sp8ShLvl_() { return sheetH_("NiveauxVotes", ["date (ms)", "séance", "auteur", "membre", "sport", "niveau (1-3)"]); }
var SP8_LVL = ["", "Débutant", "Intermédiaire", "Confirmé"];
function sp8LevelsOf_(pseudo) {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:lvl"), m = hit ? jsonSafe_(hit) : null;
  if (!m) {
    m = {};
    rowsOf_(sp8ShLvl_()).forEach(function (r) {
      var k = sp8Lc_(r[3]), sp = String(r[4]), v = Number(r[5]); if (!k || !sp || !(v >= 1 && v <= 3)) return;
      var o = (m[k] = m[k] || {}), x = (o[sp] = o[sp] || [0, 0]); x[0] += v; x[1]++;
    });
    try { c.put("sp8:lvl", JSON.stringify(m), 300); } catch (x) {}
  }
  var o = m[sp8Lc_(pseudo)] || {}, out = [];
  Object.keys(o).forEach(function (sp) { if (o[sp][1] >= SP8.REVIEW_MIN_PUBLIC) out.push({ sport: sp, label: SP8_LVL[Math.round(o[sp][0] / o[sp][1])], n: o[sp][1] }); });
  return out.sort(function (a, b) { return b.n - a.n; }).slice(0, 4);
}

/* ===================== 16. Absences contestables ===================== */
// Une absence notée peut être contestée ; si l'équipe passe le recours à « accepté » (onglet Recours, colonne statut), elle ne compte plus.
var SP8_RELIAB_MIN = 5;
function sp8AbsenceAccepted_() {
  var o = {};
  rowsOf_(sp8ShAppeal_()).forEach(function (r) { if (r[2] === "absence" && /^(accepte|acceptee|valide|validee|ok)$/.test(norm_(r[5]).trim())) o[sp8Lc_(r[1]) + "|" + String(r[3])] = 1; });
  return o;
}
function sp8MyAbsences_(pseudo) {
  var p = sp8Lc_(pseudo), per = {};
  rowsOf_(sp8ShAvis_()).forEach(function (r) {
    if (sp8Lc_(r[3]) !== p) return;
    var o = per[String(r[1])] = per[String(r[1])] || { abs: 0, pres: 0 }; r[6] === "oui" ? o.abs++ : o.pres++;
  });
  return Object.keys(per).filter(function (sid) { return per[sid].abs > per[sid].pres; });
}
function sp8AbsenceList_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var ids = sp8MyAbsences_(me.pseudo), p = sp8Lc_(me.pseudo), st = {}, sess = {}, out = [];
  rowsOf_(sp8ShAppeal_()).forEach(function (r) { if (r[2] === "absence" && sp8Lc_(r[1]) === p) st[String(r[3])] = String(r[5] || "nouveau"); });
  rowsOf_(shSeances_()).forEach(function (s) { sess[String(s[0])] = s; });
  ids.forEach(function (sid) { var s = sess[sid]; out.push({ sid: sid, sport: s ? String(s[3]) : "", place: s ? String(s[4]) : "", start: s ? Number(s[7]) : 0, appeal: st[sid] || "" }); });
  out.sort(function (a, b) { return b.start - a.start; });
  var rel = sp8Reliab_()[p];
  return { status: "success", absences: out.slice(0, 20), reliab: rel && rel.n ? Math.round(100 * (rel.n - rel.abs) / rel.n) : null, reliabN: rel ? rel.n : 0, min: SP8_RELIAB_MIN };
}
function sp8AbsenceContest_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var sid = String(Number(d.sid) || ""), text = clip_(d.text, 1000);
  if (!sid || sp8MyAbsences_(me.pseudo).indexOf(sid) < 0) return err_("Absence introuvable.");
  var p = sp8Lc_(me.pseudo);
  if (rowsOf_(sp8ShAppeal_()).some(function (r) { return r[2] === "absence" && sp8Lc_(r[1]) === p && String(r[3]) === sid; })) return { status: "success", already: true };
  if (text.length < 10) return err_("Explique en quelques mots (10 caractères minimum).");
  var lim = rate_("apl:" + me.pseudo, 5, 86400, "Trop de recours aujourd'hui. Réessaie demain."); if (lim) return err_(lim);
  sp8ShAppeal_().appendRow([Date.now(), me.pseudo, "absence", sid, safe_(text), "nouveau"]);
  try {
    if (typeof mailOn_ === "function" && mailOn_()) mail_(CONTACT_MAIL, "Absence contestée par @" + me.pseudo,
      "<p>@" + mailEsc_(me.pseudo) + " conteste une absence notée sur la séance " + mailEsc_(sid) + ".</p><p>Message : " + mailEsc_(text) + "</p><p>Pour l'accepter : onglet Recours, colonne statut → « accepté ». L'absence ne comptera plus dans sa fiabilité.</p>",
      "@" + me.pseudo + " conteste une absence (séance " + sid + ") : " + text);
  } catch (x) {}
  return { status: "success" };
}

/* ===================== 17. Défi collectif du mois ===================== */
// Objectif commun : séances postées + séances jouées (au moins 2 inscrits) du mois. Onglet Défis facultatif : mois (aaaa-mm) | titre | objectif.
function sp8ShDefis_() { return sheetH_("Défis", ["mois (aaaa-mm)", "titre", "objectif"]); }
function sp8Challenge_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var now = new Date(), month = Utilities.formatDate(now, SP8.TZ, "yyyy-MM"), p = sp8Lc_(me.pseudo);
  var mois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"][Number(month.slice(5, 7)) - 1];
  var goal = 500, title = "";
  rowsOf_(sp8ShDefis_()).forEach(function (r) {
    var m = r[0] instanceof Date ? Utilities.formatDate(r[0], SP8.TZ, "yyyy-MM") : String(r[0]).trim();
    if (m === month) { title = clip_(r[1], 80); goal = Math.max(10, Math.round(Number(r[2]) || 500)); }
  });
  title = title || goal + " séances en " + mois;
  var inMonth = function (ms) { return ms && Utilities.formatDate(new Date(Number(ms)), SP8.TZ, "yyyy-MM") === month; };
  var c = CacheService.getScriptCache(), hit = c.get("sp8:defi:" + month), agg = hit ? jsonSafe_(hit) : null;
  if (!agg || !agg.by) {
    var live = {}, hid = hidden_(), by = {}, total = 0;
    rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (r[0]) live[String(r[0])] = 1; });
    rowsOf_(sp8ShPoints_()).forEach(function (r) {
      var id = String(r[3]); if (r[2] !== "seance" || !inMonth(r[0]) || !live[id] || hid["annonce:" + id]) return;
      total++; by[sp8Lc_(r[1])] = (by[sp8Lc_(r[1])] || 0) + 1;
    });
    var played = {}, cnt = {}, ins = rowsOf_(shInscr_());
    ins.forEach(function (r) { cnt[String(r[0])] = (cnt[String(r[0])] || 0) + 1; });
    rowsOf_(shSeances_()).forEach(function (s) { var id = String(s[0]); if (s[12] === "ouverte" && Number(s[7]) < now.getTime() && inMonth(s[7]) && (cnt[id] || 0) >= 2) { played[id] = 1; total++; } });
    ins.forEach(function (r) { if (played[String(r[0])]) by[sp8Lc_(r[1])] = (by[sp8Lc_(r[1])] || 0) + 1; });
    agg = { total: total, by: by };
    try { c.put("sp8:defi:" + month, JSON.stringify(agg), 300); } catch (x) {}
  }
  var last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { status: "success", month: month, title: title, goal: goal, total: agg.total || 0, mine: (agg.by || {})[p] || 0, daysLeft: Math.max(0, last - now.getDate()) };
}

/* ===================== 18. Météo des séances en extérieur (Open-Meteo) ===================== */
// Appel serveur (UrlFetchApp) : aucun domaine à ajouter dans la CSP du site. Seules des coordonnées de lieux arrondies sont envoyées.
var SP8_INDOOR = /natation|piscine|fitness|crossfit|muscu|yoga|pilates|escalade|bloc|badminton|squash|tennis de table|ping|boxe|danse|volley(?!.*beach)|handball|judo|karate|gym/;
function sp8Outdoor_(sport) { var s = norm_(sport); return !!s && !SP8_INDOOR.test(s) || /beach/.test(s); }
function sp8WxCode_(c) { c = Number(c); return c === 0 ? "☀️" : c <= 2 ? "\uD83C\uDF24️" : c === 3 ? "☁️" : c <= 48 ? "\uD83C\uDF2B️" : c <= 67 || (c >= 80 && c <= 82) ? "\uD83C\uDF27️" : c <= 77 || c === 85 || c === 86 ? "\uD83C\uDF28️" : c >= 95 ? "⛈️" : "\uD83C\uDF26️"; }
function sp8Weather_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var want = {}; (Array.isArray(d.ids) ? d.ids : []).slice(0, 30).forEach(function (x) { var k = String(Number(x) || ""); if (k) want[k] = 1; });
  var now = Date.now(), list = [], c = CacheService.getScriptCache(), byKey = {}, out = {};
  rowsOf_(shSeances_()).forEach(function (s) {
    var id = String(s[0]), st = Number(s[7]), lat = Number(s[5]), lng = Number(s[6]);
    if (!want[id] || s[12] !== "ouverte" || st < now - 3 * 3600000 || st > now + 7 * 864e5 || !isFinite(lat) || !isFinite(lng) || (!lat && !lng) || !sp8Outdoor_(s[3])) return;
    var key = (Math.round(lat * 20) / 20).toFixed(2) + "," + (Math.round(lng * 20) / 20).toFixed(2);   // grille de ~5 km
    list.push({ id: id, st: st, key: key }); byKey[key] = 1;
  });
  var keys = Object.keys(byKey).slice(0, 12), data = {}, miss = [];
  keys.forEach(function (k) { var hit = c.get("sp8:wx:" + k); if (hit) data[k] = jsonSafe_(hit); else miss.push(k); });
  if (miss.length) {
    var reqs = miss.map(function (k) { var p = k.split(","); return { url: "https://api.open-meteo.com/v1/forecast?latitude=" + p[0] + "&longitude=" + p[1] + "&hourly=temperature_2m,precipitation_probability,weather_code&timezone=Europe%2FParis&forecast_days=8", muteHttpExceptions: true }; });
    var res = [];
    try { res = typeof UrlFetchApp.fetchAll === "function" ? UrlFetchApp.fetchAll(reqs) : reqs.map(function (r) { return UrlFetchApp.fetch(r.url, r); }); } catch (x) { try { console.error("meteo " + x); } catch (y) {} }
    miss.forEach(function (k, i) {
      var r = res[i]; if (!r || r.getResponseCode() !== 200) return;
      var j = jsonSafe_(r.getContentText()), h = j.hourly; if (!h || !Array.isArray(h.time)) return;
      var o = { t: h.time, a: h.temperature_2m || [], p: h.precipitation_probability || [], c: h.weather_code || [] };
      data[k] = o;
      try { c.put("sp8:wx:" + k, JSON.stringify(o), 3600); } catch (x) {}
    });
  }
  list.forEach(function (x) {
    var o = data[x.key]; if (!o || !o.t) return;
    var i = o.t.indexOf(Utilities.formatDate(new Date(x.st), SP8.TZ, "yyyy-MM-dd'T'HH:00")); if (i < 0) return;
    out[x.id] = { t: Math.round(Number(o.a[i])), p: Number(o.p[i]) || 0, e: sp8WxCode_(o.c[i]) };
  });
  return { status: "success", weather: out };
}

/* ===================== 19. « Je partage ma séance avec un proche » ===================== */
// Lien privé à jeton (seul son empreinte est stockée), qui expire 6 h après la fin de la séance. Aucune position en direct.
function sp8ShShare_() { return sheetH_("PartagesProches", ["empreinte du jeton", "séance", "pseudo", "expire (ms)", "créé (ms)"]); }
function sp8ShareCreate_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), s = sp8SessRow_(id), now = Date.now();
  if (!s || s[12] !== "ouverte") return err_("Séance introuvable.");
  var end = Number(s[7]) + (Number(s[15]) || 90) * 60000;
  if (end < now) return err_("Cette séance est terminée.");
  if (!sp8IsIn_(id, me.pseudo)) return err_("Inscris-toi d'abord à la séance.");
  var lim = rate_("shc:" + sp8Lc_(me.pseudo), 20, 86400, "Trop de liens créés aujourd'hui."); if (lim) return err_(lim);
  var t = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").slice(0, 40), exp = end + 6 * 3600000;
  var sh = sp8ShShare_(), rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) if (Number(rows[i][3]) < now) sh.deleteRow(i + 1);   // ménage des liens expirés
  sh.appendRow([hash_(t, "proche"), id, me.pseudo, exp, now]);
  return { status: "success", url: mailProp_("SITE_URL", "https://spary.fr").replace(/\\/+$/, "") + "/#proche=" + t, expires: exp };
}
function sp8ShareView_(d) {
  var lim = rate_("shv:all", 600, 3600, "Trop de consultations, réessayez plus tard."); if (lim) return err_(lim);
  var t = String(d.t || "");
  if (!/^[a-f0-9]{40}$/.test(t)) return err_("Lien invalide.");
  var h = hash_(t, "proche"), now = Date.now(), row = null;
  rowsOf_(sp8ShShare_()).forEach(function (r) { if (r[0] === h) row = r; });
  if (!row || Number(row[3]) < now) return err_("Ce lien a expiré ou n'existe pas.");
  var s = sp8SessRow_(String(row[1]));
  if (!s) return err_("Cette séance n'existe plus.");
  var nm = nameMap_(), profs = profMap_(), who = nm[sp8Lc_(row[2])], org = nm[sp8Lc_(s[1])];
  return { status: "success", sport: String(s[3]), place: String(s[4]), lat: Math.round(Number(s[5]) * 1000) / 1000, lng: Math.round(Number(s[6]) * 1000) / 1000,
    start: Number(s[7]), dur: Number(s[15]) || 90, cancelled: s[12] !== "ouverte", count: sp8SessCount_(String(s[0])),
    by: who ? shownName_(who, profs[sp8Lc_(row[2])]) : "Un membre", org: org ? shownName_(org, profs[sp8Lc_(s[1])]) + " (@" + org.pseudo + ")" : "", expires: Number(row[3]) };
}

/* ===================== 20. Parrainage ===================== */
// Lien personnel spary.fr/?parrain=pseudo. Quand le filleul poste ou joue sa première séance : +200 pts au parrain (10 filleuls max), +100 pts au filleul.
// Points seulement, aucune récompense en argent.
var SP8_REF = { PARRAIN: 200, FILLEUL: 100, MAX: 10, HOURS: 48 };
function sp8ShRef_() { return sheetH_("Parrainages", ["filleul", "parrain", "date (ms)"]); }
function sp8RefClaim_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var par = findAccount_(sp8Pseudo_(d.parrain));
  if (!par || sp8Lc_(par.pseudo) === sp8Lc_(me.pseudo)) return err_("Parrain introuvable.");
  var p = sp8Lc_(me.pseudo), created = 0, rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (sp8Lc_(rows[i][6]) === p) created = new Date(rows[i][0]).getTime() || 0;
  if (!created || Date.now() - created > SP8_REF.HOURS * 3600000) return err_("Le parrainage se valide à l'inscription.");
  if (hides_(blocks_(me.pseudo), par.pseudo)) return err_("Parrain introuvable.");
  var sh = sp8ShRef_(), n = 0, dup = false;
  rowsOf_(sh).forEach(function (r) { if (sp8Lc_(r[0]) === p) dup = true; if (sp8Lc_(r[1]) === sp8Lc_(par.pseudo)) n++; });
  if (dup) return { status: "success", already: true };
  if (n >= 50) return err_("Ce parrain a déjà beaucoup de filleuls.");
  sh.appendRow([me.pseudo, par.pseudo, Date.now()]);
  CacheService.getScriptCache().remove("sp8:ref");
  return { status: "success" };
}
/** Bonus de parrainage par membre : { pseudo: { pts, n, ok } }. Un filleul est validé dès une séance postée ou jouée. */
function sp8RefBonus_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp8:ref");
  if (hit) return jsonSafe_(hit);
  var refs = rowsOf_(sp8ShRef_()).filter(function (r) { return r[0] && r[1]; }), m = {};
  if (refs.length) {
    var act = sp8ActivityMap_(), now = Date.now(), cnt = {}, done = {}, played = {};
    rowsOf_(shInscr_()).forEach(function (r) { cnt[String(r[0])] = (cnt[String(r[0])] || 0) + 1; });
    rowsOf_(shSeances_()).forEach(function (s) { if (s[12] === "ouverte" && Number(s[7]) + (Number(s[15]) || 90) * 60000 < now && (cnt[String(s[0])] || 0) >= 2) done[String(s[0])] = 1; });
    rowsOf_(shInscr_()).forEach(function (r) { if (done[String(r[0])]) played[sp8Lc_(r[1])] = 1; });
    refs.sort(function (a, b) { return (Number(a[2]) || 0) - (Number(b[2]) || 0); });
    refs.forEach(function (r) {
      var f = sp8Lc_(r[0]), p = sp8Lc_(r[1]), ok = !!((act[f] && act[f].n) || played[f]);
      var P = m[p] = m[p] || { pts: 0, n: 0, ok: 0 }; P.n++;
      if (!ok) return;
      if (P.ok < SP8_REF.MAX) P.pts += SP8_REF.PARRAIN;
      P.ok++;
      var F = m[f] = m[f] || { pts: 0, n: 0, ok: 0 }; F.pts += SP8_REF.FILLEUL;
    });
  }
  try { c.put("sp8:ref", JSON.stringify(m), 300); } catch (x) {}
  return m;
}
function sp8RefInfo_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var o = sp8RefBonus_()[sp8Lc_(me.pseudo)] || { pts: 0, n: 0, ok: 0 };
  return { status: "success", url: mailProp_("SITE_URL", "https://spary.fr").replace(/\\/+$/, "") + "/?parrain=" + encodeURIComponent(me.pseudo), total: o.n, validated: o.ok, points: o.pts, max: SP8_REF.MAX, perRef: SP8_REF.PARRAIN, forNew: SP8_REF.FILLEUL };
}

/* ===================== 20. Notifications push « appli fermée » (v14) ===================== */
// Principe : le serveur envoie un simple « réveil » sans contenu au service de notification du navigateur
// (Google, Apple ou Mozilla, selon l'appareil). Le service worker du site demande alors le texte à afficher
// (action pushPull), en s'identifiant avec l'adresse secrète de son abonnement. Aucun contenu ne transite
// par ces services. Signature VAPID (ES256) calculée ici ; les clés sont créées toutes seules au premier
// besoin et rangées dans les propriétés du script (VAPID_PRIVATE, VAPID_PUBLIC). Ne pas les supprimer :
// sinon chaque appareil devra réactiver les notifications.
// Onglets : PushFile : date (ms) | pseudo | titre | texte | lien | sujet
//           PushSubs (existant) : date (ms) | pseudo | endpoint | p256dh | auth | dernier relevé (ms)
var SP14 = { TTL: 86400, KEEP_MS: 2 * 86400000, PER_EVENT: 40, ACTIVE_MS: 60000, MAX_PULL: 3, SUBJECT: "mailto:contact@spary.fr" };
var SP14_PING = [];   // abonnements à réveiller une fois la réponse prête (hors verrou)

function sp14ShFile_() { return sheetH_("PushFile", ["date (ms)", "pseudo", "titre", "texte", "lien", "sujet"]); }

/* ---------- Octets et encodages ---------- */
function sp14U8_(b) { var o = []; for (var i = 0; i < b.length; i++) o.push(b[i] & 255); return o; }
function sp14S8_(b) { return b.map(function (x) { return x > 127 ? x - 256 : x; }); }
function sp14Sha_(bytes) { return sp14U8_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sp14S8_(bytes))); }
function sp14Hmac_(key, data) { return sp14U8_(Utilities.computeHmacSha256Signature(sp14S8_(data), sp14S8_(key))); }
function sp14Utf8_(s) { return sp14U8_(Utilities.newBlob(String(s)).getBytes()); }
function sp14B64_(bytes) { return Utilities.base64EncodeWebSafe(sp14S8_(bytes)).replace(/=+$/, ""); }
function sp14UnB64_(s) { s = String(s || ""); while (s.length % 4) s += "="; return sp14U8_(Utilities.base64DecodeWebSafe(s)); }
function sp14Big_(bytes) { var h = "0x0"; bytes.forEach(function (x) { h += (x < 16 ? "0" : "") + x.toString(16); }); return BigInt(h); }
function sp14Bytes_(n, len) { var h = n.toString(16); while (h.length < len * 2) h = "0" + h; var o = []; for (var i = 0; i < len * 2; i += 2) o.push(parseInt(h.substr(i, 2), 16)); return o; }

/* ---------- Courbe P-256 (coordonnées jacobiennes) ---------- */
var SP14_EC = (function () {
  var Z = BigInt(0), ONE = BigInt(1), TWO = BigInt(2), THREE = BigInt(3), FOUR = BigInt(4), EIGHT = BigInt(8);
  var P = BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff");
  var N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  var G = [BigInt("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"), BigInt("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5")];
  function mod(a, m) { var r = a % m; return r < Z ? r + m : r; }
  function inv(a, m) {
    var lm = ONE, hm = Z, low = mod(a, m), high = m;
    while (low > ONE) { var r = high / low, nm = hm - lm * r, nw = high - low * r; hm = lm; high = low; lm = nm; low = nw; }
    return mod(lm, m);
  }
  function dbl(p) {
    if (p[2] === Z || p[1] === Z) return [Z, ONE, Z];
    var zz = mod(p[2] * p[2], P), al = mod(THREE * (p[0] - zz) * (p[0] + zz), P), yy = mod(p[1] * p[1], P), be = mod(FOUR * p[0] * yy, P);
    var x3 = mod(al * al - TWO * be, P);
    return [x3, mod(al * (be - x3) - EIGHT * yy * yy, P), mod(TWO * p[1] * p[2], P)];
  }
  function add(p, q) {
    if (p[2] === Z) return q; if (q[2] === Z) return p;
    var z1 = mod(p[2] * p[2], P), z2 = mod(q[2] * q[2], P), u1 = mod(p[0] * z2, P), u2 = mod(q[0] * z1, P);
    var s1 = mod(p[1] * q[2] * z2, P), s2 = mod(q[1] * p[2] * z1, P);
    if (u1 === u2) return s1 === s2 ? dbl(p) : [Z, ONE, Z];
    var h = mod(u2 - u1, P), r = mod(s2 - s1, P), h2 = mod(h * h, P), h3 = mod(h * h2, P), u1h2 = mod(u1 * h2, P);
    var x3 = mod(r * r - h3 - TWO * u1h2, P);
    return [x3, mod(r * (u1h2 - x3) - s1 * h3, P), mod(h * p[2] * q[2], P)];
  }
  function mul(k, pt) { var R = [Z, ONE, Z], Q = [pt[0], pt[1], ONE]; while (k > Z) { if (k & ONE) R = add(R, Q); Q = dbl(Q); k >>= ONE; } return R; }
  function affine(p) { var zi = inv(p[2], P), zi2 = mod(zi * zi, P); return [mod(p[0] * zi2, P), mod(p[1] * zi2 * zi, P)]; }
  function pub(d) { var a = affine(mul(d, G)); return [4].concat(sp14Bytes_(a[0], 32), sp14Bytes_(a[1], 32)); }
  /** ECDSA P-256 / SHA-256, nonce déterministe (RFC 6979). Renvoie r || s sur 64 octets. */
  function sign(dBytes, msg) {
    var d = sp14Big_(dBytes), h = sp14Sha_(msg), z = mod(sp14Big_(h), N), x = sp14Bytes_(d, 32), h1 = sp14Bytes_(z, 32);
    var V = [], K = [], i;
    for (i = 0; i < 32; i++) { V.push(1); K.push(0); }
    K = sp14Hmac_(K, V.concat([0], x, h1)); V = sp14Hmac_(K, V);
    K = sp14Hmac_(K, V.concat([1], x, h1)); V = sp14Hmac_(K, V);
    for (var guard = 0; guard < 100; guard++) {
      V = sp14Hmac_(K, V);
      var k = sp14Big_(V);
      if (k > Z && k < N) {
        var r = mod(affine(mul(k, G))[0], N);
        if (r !== Z) {
          var s = mod(inv(k, N) * (z + r * d), N);
          if (s !== Z) return sp14Bytes_(r, 32).concat(sp14Bytes_(s, 32));
        }
      }
      K = sp14Hmac_(K, V.concat([0])); V = sp14Hmac_(K, V);
    }
    throw new Error("Signature impossible");
  }
  return { N: N, pub: pub, sign: sign, mod: mod };
})();

/* ---------- Clés VAPID ---------- */
function sp14Keys_() {
  var pr = PropertiesService.getScriptProperties(), d = pr.getProperty("VAPID_PRIVATE"), q = pr.getProperty("VAPID_PUBLIC");
  if (d && q) return { d: sp14UnB64_(d), pub: q };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    d = pr.getProperty("VAPID_PRIVATE"); q = pr.getProperty("VAPID_PUBLIC");
    if (d && q) return { d: sp14UnB64_(d), pub: q };
    var seed = [], n = BigInt(0);
    while (n === BigInt(0)) {
      for (var i = 0; i < 6; i++) seed = seed.concat(sp14Utf8_(Utilities.getUuid()));   // UUID v4 : aléa cryptographique côté Google
      seed = seed.concat(sp14Utf8_(String(Date.now())));
      n = SP14_EC.mod(sp14Big_(sp14Sha_(seed)), SP14_EC.N);
    }
    var db = sp14Bytes_(n, 32), pb = sp14B64_(SP14_EC.pub(n));
    pr.setProperty("VAPID_PRIVATE", sp14B64_(db));
    pr.setProperty("VAPID_PUBLIC", pb);
    return { d: db, pub: pb };
  } finally { try { lock.releaseLock(); } catch (x) {} }
}
/** Jeton VAPID pour un service (aud = origine de l'endpoint), mis en cache 12 h. */
function sp14Jwt_(aud, keys) {
  var c = CacheService.getScriptCache(), ck = "p14jwt:" + aud, hit = c.get(ck);
  if (hit) return hit;
  var head = sp14B64_(sp14Utf8_(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  var body = sp14B64_(sp14Utf8_(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SP14.SUBJECT })));
  var unsigned = head + "." + body, jwt = unsigned + "." + sp14B64_(SP14_EC.sign(keys.d, sp14Utf8_(unsigned)));
  try { c.put(ck, jwt, 11 * 3600); } catch (x) {}
  return jwt;
}

/* ---------- File d'attente ---------- */
function sp14SubRows_() { return rowsOf_(sp8ShPush_()); }
/**
 * Prépare une notification pour des membres (à appeler sous verrou). gap = secondes minimum entre deux réveils
 * pour le même sujet et le même membre (évite une rafale à chaque message d'une discussion).
 */
function sp14Queue_(pseudos, item, opts) {
  opts = opts || {};
  if (!pseudos || !pseudos.length) return 0;
  var subs = {}, skip = sp8Lc_(opts.except || ""), now = Date.now(), c = CacheService.getScriptCache(), n = 0, sh = null;
  sp14SubRows_().forEach(function (r) { var k = sp8Lc_(r[1]); (subs[k] = subs[k] || []).push(String(r[2])); });
  var seen = {};
  pseudos.slice(0, opts.max || SP14.PER_EVENT).forEach(function (p) {
    var k = sp8Lc_(p);
    if (!k || seen[k] || k === skip || !subs[k]) return; seen[k] = 1;
    var gk = "p14g:" + k + ":" + item.subject;
    if (opts.gap) { if (c.get(gk)) return; try { c.put(gk, "1", opts.gap); } catch (x) {} }
    (sh = sh || sp14ShFile_()).appendRow([now, p, clip_(item.title, 60), clip_(item.body, 160), clip_(item.url || "./", 120), clip_(item.subject, 60)]);
    subs[k].forEach(function (ep) {
      if (ep.indexOf(SP16.PREFIX) === 0) SP16_OUT.push({ tok: ep.slice(SP16.PREFIX.length), title: clip_(item.title, 60), body: clip_(item.body, 160), url: clip_(item.url || "./", 120), tag: clip_(item.subject, 60) });
      else SP14_PING.push(ep);
    });
    n++;
  });
  return n;
}
/** Réveille les appareils (après la réponse, hors verrou). Les abonnements expirés sont retirés. */
function sp14Flush_() {
  if (SP16_OUT.length) { var nat = SP16_OUT.slice(0, 100); SP16_OUT = []; try { sp16Send_(nat); } catch (e) { try { console.error("push natif " + (e && e.message || e)); } catch (x) {} } }
  if (!SP14_PING.length) return;
  var eps = SP14_PING.filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 100); SP14_PING = [];
  try {
    var keys = sp14Keys_(), reqs = eps.map(function (ep) {
      var aud = ep.match(/^https:\\/\\/[^\\/]+/)[0];
      return { url: ep, method: "post", muteHttpExceptions: true, followRedirects: false,
        headers: { TTL: String(SP14.TTL), Urgency: "high", Authorization: "vapid t=" + sp14Jwt_(aud, keys) + ", k=" + keys.pub } };
    });
    var res = UrlFetchApp.fetchAll(reqs), dead = [];
    res.forEach(function (r, i) {
      var code = r.getResponseCode();
      if (code === 404 || code === 410) dead.push(eps[i]);
      else if (code >= 400) { try { console.warn("push " + code + " " + eps[i].slice(0, 40) + " " + String(r.getContentText()).slice(0, 120)); } catch (x) {} }
    });
    if (dead.length) sp8After_(function () {
      var sh = sp8ShPush_(), rows = sh.getDataRange().getValues();
      for (var i = rows.length - 1; i >= 1; i--) if (dead.indexOf(String(rows[i][2])) >= 0) sh.deleteRow(i + 1);
    });
  } catch (e) { try { console.error("push envoi " + (e && e.message || e)); } catch (x) {} }
}
/** Diagnostic à lancer depuis l'éditeur : sp14TesterPush("tonpseudo") envoie une notification de test à tous ses appareils et affiche la réponse des services. */
function sp14TesterPush(pseudo) {
  pseudo = String(pseudo || "").trim();
  var subs = sp14SubRows_().filter(function (r) { return sp8Lc_(r[1]) === sp8Lc_(pseudo); });
  console.log("Clé publique : " + sp14Keys_().pub.slice(0, 12) + "… | appareils abonnés pour « " + pseudo + " » : " + subs.length);
  if (!subs.length) { console.log("Aucun appareil : active les notifications dans Profil → Compte et données, sur le téléphone, puis relance."); return; }
  sp14ShFile_().appendRow([Date.now(), subs[0][1], "Test Spary", "Si tu vois ce message, les notifications marchent.", "./", "test"]);
  var keys = sp14Keys_();
  var nat = subs.filter(function (r) { return String(r[2]).indexOf(SP16.PREFIX) === 0; });
  if (nat.length) sp16Send_(nat.map(function (r) { return { tok: String(r[2]).slice(SP16.PREFIX.length), title: "Test Spary", body: "Si tu vois ce message, les notifications de l'appli marchent.", url: "./", tag: "test" }; }), true);
  subs = subs.filter(function (r) { return String(r[2]).indexOf(SP16.PREFIX) !== 0; });
  subs.forEach(function (r) {
    var ep = String(r[2]), aud = ep.match(/^https:\\/\\/[^\\/]+/)[0];
    var res = UrlFetchApp.fetch(ep, { method: "post", muteHttpExceptions: true, followRedirects: false, headers: { TTL: "600", Urgency: "high", Authorization: "vapid t=" + sp14Jwt_(aud, keys) + ", k=" + keys.pub } });
    console.log(aud + " → " + res.getResponseCode() + (res.getResponseCode() >= 300 ? " " + String(res.getContentText()).slice(0, 200) : " (envoyé)"));
  });
}
/** Diagnostic sans paramètre : teste le dernier appareil qui a activé les notifications. */
function sp14TesterDernierAppareil() { var r = sp14SubRows_(); if (!r.length) return console.log("Aucun appareil abonné."); sp14TesterPush(String(r[r.length - 1][1])); }
/** Test depuis l'éditeur : sp14TesterMessage("contact@spary.fr", "theom") envoie (pseudo ou e-mail) un vrai message de « de » à « a », avec sa notification. */
/** Retrouve un compte par pseudo ou par e-mail (onglet Comptes : D = e-mail, G = pseudo). */
function sp14FindAcc_(q) {
  q = String(q || "").trim().toLowerCase(); if (!q) return null;
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][6]).toLowerCase() === q || String(rows[i][3]).trim().toLowerCase() === q) return { pseudo: String(rows[i][6]), name: String(rows[i][2]) };
  var hits = [];
  for (var j = 1; j < rows.length; j++) if ((String(rows[j][6]) + " " + rows[j][3]).toLowerCase().indexOf(q.split("@")[0]) >= 0) hits.push(String(rows[j][6]));
  console.log("« " + q + " » introuvable." + (hits.length ? " Pseudos proches : " + hits.slice(0, 10).join(", ") : ""));
  return null;
}
function sp14TesterMessage(de, a) {
  de = String(de || "contact@spary.fr"); a = String(a || "theom");
  var src = sp14FindAcc_(de), dst = sp14FindAcc_(a);
  if (!src || !dst) return console.log("Relance avec le bon pseudo, par exemple sp14TesterMessage(\\"pseudo_admin\\", \\"theom\\").");
  sp8Locked_(function () {
    var now = Date.now(), id = now * 1000 + Math.floor(Math.random() * 1000);
    sheet_("Messages", true).appendRow([id, src.pseudo, dst.pseudo, safe_("Salut ! Message de test envoyé depuis le compte " + src.pseudo + "."), now]);
    var n = sp14Queue_([dst.pseudo], { title: src.pseudo, body: "Salut ! Message de test envoyé depuis le compte " + src.pseudo + ".", url: "./#messages", subject: "msg:" + sp8Lc_(src.pseudo) + ":" + now }, { always: true });
    console.log("Message écrit de " + src.pseudo + " à " + dst.pseudo + " | appareils à réveiller : " + SP14_PING.length + (n ? "" : " (aucun appareil abonné)"));
  });
  sp14Flush_();
  console.log("Envoyé. Si un service a refusé, la ligne « push … » ci-dessus donne le code.");
}
/** Ménage : notifications de plus de 2 jours. */
function sp14Purge_() {
  var sh = sp14ShFile_(), rows = sh.getDataRange().getValues(), lim = Date.now() - SP14.KEEP_MS, n = 0;
  for (var i = 1; i < rows.length && Number(rows[i][0]) < lim; i++) n++;
  if (n) sh.deleteRows(2, n);
}

/* ---------- Actions appelées par le site et le service worker ---------- */
function sp14Key_() { return { status: "success", key: sp14Keys_().pub }; }
/** Appelé par le service worker à la réception d'un réveil : renvoie les notifications à afficher sur cet appareil. */
function sp14Pull_(d) {
  var ep = String(d.endpoint || "");
  if (!/^https:\\/\\//.test(ep)) return err_("Abonnement invalide.");
  var sh = sp8ShPush_(), rows = sh.getDataRange().getValues(), row = -1, pseudo = "", since = 0;
  for (var i = 1; i < rows.length; i++) if (String(rows[i][2]) === ep) { row = i + 1; pseudo = String(rows[i][1]); since = Number(rows[i][5]) || Number(rows[i][0]) || 0; }
  if (row < 0) return { status: "success", items: [], gone: true };
  var p = sp8Lc_(pseudo), now = Date.now(), fresh = [], last = null;
  rowsOf_(sp14ShFile_()).forEach(function (r) {
    if (sp8Lc_(r[1]) !== p || Number(r[0]) < now - SP14.KEEP_MS) return;
    var it = { title: String(r[2]), body: String(r[3]), url: String(r[4] || "./"), tag: String(r[5] || "spary"), ts: Number(r[0]) };
    last = it; if (it.ts > since) fresh.push(it);
  });
  sh.getRange(row, 6).setValue(now);
  if (Math.random() < 0.05) sp14Purge_();
  fresh = fresh.slice(-SP14.MAX_PULL).reverse();
  return { status: "success", items: fresh, last: fresh.length ? null : last };
}

/* ---------- Textes ---------- */
function sp14Name_(me) { return String((me && (me.name || me.pseudo)) || "Un membre").split(" ")[0]; }
function sp14When_(ms) { return Utilities.formatDate(new Date(Number(ms)), SP8.TZ, "EEEE dd/MM 'à' HH'h'mm").replace(/^(\\w)/, function (x) { return x.toLowerCase(); }); }
function sp14SessUrl_(id) { return "./#seance=" + id; }
function sp14Players_(id) { var o = []; rowsOf_(shInscr_()).forEach(function (r) { if (String(r[0]) === String(id)) o.push(String(r[1])); }); return o; }

/* ---------- Événements qui déclenchent une notification ---------- */
/** Texte du message tel qu'affiché dans la notification (une ligne, 150 caractères max). */
function sp14Txt_(t) { t = String(t || "").replace(/\\s+/g, " ").trim(); return t.length > 150 ? t.slice(0, 149) + "…" : t; }
function sp14OnMsg_(data, res) {
  var me = sessionUser_(data.token); if (!me || !res || !res.to) return;
  var nm = sp14Name_(me), to = String(res.to), txt = sp14Txt_(data.text);
  if (to.charAt(0) !== "#") {
    sp14Queue_([to], { title: String(me.pseudo), body: txt, url: "./#messages", subject: "msg:" + sp8Lc_(me.pseudo) + ":" + Date.now() }, { except: me.pseudo });
    return;
  }
  var id = to.slice(1), grp = sp8GroupsAll_()[id], who = [], title;
  if (grp) { who = grp.members.slice(); title = "Groupe « " + grp.name + " »"; }
  else {
    var s = sp8SessRow_(id); if (!s) return;
    who = sp14Players_(id).concat([String(s[1])]); title = "Séance de " + s[3];
  }
  var bl = blocks_(me.pseudo);
  who = who.filter(function (p) { return !hides_(bl, p); });
  sp14Queue_(who, { title: title, body: me.pseudo + " : " + txt, url: "./#messages", subject: "chan:" + id + ":" + Date.now() }, { gap: 20, except: me.pseudo });
}
function sp14OnJoin_(data) {
  var me = sessionUser_(data.token), id = String(Number(data.id) || ""), s = me && sp8SessRow_(id); if (!s) return;
  var left = Number(s[8]) - sp8SessCount_(id);
  sp14Queue_([String(s[1])], { title: "Nouvel inscrit", body: sp14Name_(me) + " a rejoint ta séance de " + s[3] + (left > 0 ? " (" + left + " place" + (left > 1 ? "s" : "") + " restante" + (left > 1 ? "s" : "") + ")." : ". Elle est complète !"), url: sp14SessUrl_(id), subject: "join-" + id }, { gap: 300, except: me.pseudo });
}
function sp14OnCancel_(data) {
  var me = sessionUser_(data.token), id = String(Number(data.id) || ""), s = me && sp8SessRow_(id); if (!s || Number(s[7]) < Date.now()) return;
  sp14Queue_(sp14Players_(id), { title: "Séance annulée", body: "La séance de " + s[3] + " du " + sp14When_(s[7]) + " est annulée par " + sp14Name_(me) + ".", url: "./", subject: "cancel:" + id }, { except: me.pseudo, always: true });
}
function sp14OnPromote_(pseudo, s) {
  sp14Queue_([pseudo], { title: "Une place s'est libérée", body: "Tu es inscrit·e à la séance de " + s[3] + " " + sp14When_(s[7]) + ".", url: sp14SessUrl_(s[0]), subject: "promo-" + s[0] }, { always: true });
}
function sp14OnAlert_(s, free, cand) {
  var nb = free + " joueur" + (free > 1 ? "s" : "");
  sp14Queue_(cand.map(function (c) { return c.pseudo; }), { title: "Il manque " + nb, body: s[3] + " près de chez toi, " + sp14When_(s[7]) + ". Premier inscrit, premier servi !", url: sp14SessUrl_(s[0]), subject: "lm-" + s[0] }, { always: true, max: SP8_LM_MAX });
}
function sp14OnFriend_(me, to) {
  sp14Queue_([to], { title: "Demande d'ami", body: sp14Name_(me) + " veut t'ajouter en ami.", url: "./", subject: "fr-" + sp8Lc_(me.pseudo) }, { gap: 86400 });
}
function sp14OnMatch_(data, res) {
  var me = sessionUser_(data.token); if (!me || !res || !res.opponent) return;
  sp14Queue_([res.opponent], { title: "Résultat à confirmer", body: sp14Name_(me) + " a déclaré un match de " + clip_(data.sport, 30) + " contre toi.", url: "./", subject: "mt:" + res.id }, { except: me.pseudo });
}
function sp14OnMatchReply_(data, res) {
  var me = sessionUser_(data.token), id = String(Number(data.id) || ""); if (!me || !res) return;
  var row = null; rowsOf_(shMatchs_()).forEach(function (r) { if (String(r[0]) === id) row = r; }); if (!row) return;
  sp14Queue_([String(row[2])], { title: res.accepted ? "Match confirmé" : "Match contesté", body: sp14Name_(me) + (res.accepted ? " a confirmé" : " a contesté") + " ton résultat de " + row[4] + ".", url: "./", subject: "res-" + id }, { except: me.pseudo });
}

/* ===================== 21. Notifications de l'appli mobile (Firebase Cloud Messaging) =====================
 * L'appli iPhone / Android enregistre son jeton Firebase dans l'onglet des abonnements push, préfixé par « fcm-natif: ».
 * L'envoi passe par l'API FCM v1 avec un compte de service : coller tout le fichier JSON du compte de service
 * dans la Script Property FCM_SERVICE_ACCOUNT (jamais dans le code). */
var SP16 = { PREFIX: "fcm-natif:", SCOPE: "https://www.googleapis.com/auth/firebase.messaging" };
var SP16_OUT = [];   // notifications natives à envoyer une fois la réponse prête
function sp16Account_() {
  try { var j = PropertiesService.getScriptProperties().getProperty("FCM_SERVICE_ACCOUNT"); if (!j) return null; var o = JSON.parse(j); return o.client_email && o.private_key && o.project_id ? o : null; } catch (e) { return null; }
}
function sp16B64u_(x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ""); }
/** Jeton d'accès Google (1 h), mis en cache 50 min. */
function sp16Token_(sa) {
  var c = CacheService.getScriptCache(), k = "p16tok", t = c.get(k); if (t) return t;
  var now = Math.floor(Date.now() / 1000);
  var head = sp16B64u_(JSON.stringify({ alg: "RS256", typ: "JWT" })),
      body = sp16B64u_(JSON.stringify({ iss: sa.client_email, scope: SP16.SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })),
      sig = sp16B64u_(Utilities.computeRsaSha256Signature(head + "." + body, sa.private_key));
  var r = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", { method: "post", muteHttpExceptions: true,
    payload: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: head + "." + body + "." + sig } });
  var o = {}; try { o = JSON.parse(r.getContentText()); } catch (e) {}
  if (!o.access_token) throw new Error("Firebase : jeton refusé (" + r.getResponseCode() + ") " + String(r.getContentText()).slice(0, 150));
  try { c.put(k, o.access_token, 3000); } catch (e) {}
  return o.access_token;
}
/** Envoie les notifications natives ; les jetons expirés sont retirés. */
function sp16Send_(list, log) {
  var sa = sp16Account_(); if (!sa || !list.length) { if (log) console.log("Appli mobile : FCM_SERVICE_ACCOUNT absente, rien envoyé."); return; }
  var at = sp16Token_(sa), url = "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(sa.project_id) + "/messages:send";
  var reqs = list.map(function (n) {
    return { url: url, method: "post", contentType: "application/json", muteHttpExceptions: true, headers: { Authorization: "Bearer " + at },
      payload: JSON.stringify({ message: { token: n.tok,
        notification: { title: n.title, body: n.body },
        data: { url: n.url || "./" },
        apns: { headers: { "apns-priority": "10", "apns-collapse-id": String(n.tag || "spary").slice(0, 60) }, payload: { aps: { sound: "default", "thread-id": String(n.tag || "spary").split(":").slice(0, 2).join(":") } } },
        android: { priority: "high", notification: { sound: "default", tag: String(n.tag || "spary") } } } }) };
  });
  var res = UrlFetchApp.fetchAll(reqs), dead = [];
  res.forEach(function (r, i) {
    var code = r.getResponseCode(), txt = String(r.getContentText());
    if (code === 404 || (code === 400 && /registration token|UNREGISTERED/i.test(txt))) dead.push(SP16.PREFIX + list[i].tok);
    else if (code >= 400) { try { console.warn("push natif " + code + " " + txt.slice(0, 150)); } catch (x) {} }
    if (log) console.log("appli mobile → " + code + (code >= 300 ? " " + txt.slice(0, 200) : " (envoyé)"));
  });
  if (dead.length) sp8After_(function () {
    var sh = sp8ShPush_(), rows = sh.getDataRange().getValues();
    for (var i = rows.length - 1; i >= 1; i--) if (dead.indexOf(String(rows[i][2])) >= 0) sh.deleteRow(i + 1);
  });
}

;

// ===== 03-Terrain.gs =====
/**
 * Spary : statut du terrain des séances et clubs partenaires (lot réservation).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Terrain », coller ce code.
 * Il doit être placé SOUS Nouveautes dans la liste des fichiers (c'est le cas par défaut pour un nouveau fichier).
 * Ne pas modifier Code.gs ni Nouveautes. Puis Déployer → Gérer les déploiements → crayon → Nouvelle version.
 * Pour vérifier : sélectionner la fonction sp15Verifier et cliquer sur Exécuter (le journal doit afficher « OK »).
 *
 * Ce fichier enveloppe doPost (déjà enveloppé par Nouveautes) sans le modifier. Écritures sous LockService. Aucun secret.
 *
 * Onglets créés tout seuls :
 *  - SeancesTerrain    : séance | statut (reserve / a_reserver / libre) | date (ms)   (la dernière ligne d'une séance fait foi)
 *  - ClubsPartenaires  : lieu (identifiant de la carte, ex. I750560001) | nom | actif (oui / non) | lien de réservation (facultatif)
 *    À remplir à la main quand un club devient partenaire. Rien n'est affiché dans l'appli tant que l'option
 *    « clubs partenaires » est désactivée côté site (SP15.PARTNERS = false).
 * Aucune donnée personnelle : seulement l'identifiant de la séance et son statut.
 */

var SP15 = { STATUTS: ["reserve", "a_reserver", "libre"], installed: false };

function sp15ShTerrain_() { return sheetH_("SeancesTerrain", ["séance", "statut", "date (ms)"]); }
function sp15ShPartners_() { return sheetH_("ClubsPartenaires", ["lieu", "nom", "actif (oui / non)", "lien de réservation"]); }

function sp15TerrainMap_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp15:ter");
  if (hit) { try { return JSON.parse(hit); } catch (x) {} }
  var m = {};
  rowsOf_(sp15ShTerrain_()).forEach(function (r) { var id = String(r[0]); if (id && SP15.STATUTS.indexOf(String(r[1])) >= 0) m[id] = String(r[1]); });
  try { c.put("sp15:ter", JSON.stringify(m), 120); } catch (x) {}
  return m;
}
function sp15Forget_() { CacheService.getScriptCache().remove("sp15:ter"); }

function sp15SafeUrl_(u) { u = String(u || "").trim(); return /^https:\\/\\/[^\\s"'<>]{3,300}$/.test(u) ? u : ""; }
function sp15Partners_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp15:par");
  if (hit) { try { return JSON.parse(hit); } catch (x) {} }
  var out = [];
  rowsOf_(sp15ShPartners_()).forEach(function (r) {
    var id = String(r[0] || "").trim();
    if (!/^[A-Z0-9]{4,20}$/.test(id) || String(r[2]).trim().toLowerCase() !== "oui") return;
    out.push({ lieu: id, nom: String(r[1] || "").slice(0, 80), book: sp15SafeUrl_(r[3]) });
  });
  try { c.put("sp15:par", JSON.stringify(out), 600); } catch (x) {}
  return out;
}

/** L'organisateur indique si le terrain est réservé auprès du lieu. */
function sp15TerrainSet_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(Number(d.id) || ""), st = String(d.statut || "");
  if (!id || SP15.STATUTS.indexOf(st) < 0) return err_("Statut inconnu.");
  var s = sp8SessRow_(id);
  if (!s || s[12] !== "ouverte") return err_("Séance introuvable.");
  if (sp8Lc_(s[1]) !== sp8Lc_(me.pseudo)) return err_("Seul l'organisateur peut changer le statut du terrain.");
  sp15ShTerrain_().appendRow([id, st, Date.now()]);
  sp15Forget_();
  return { status: "success", id: Number(id), terrain: st };
}

function sp15Install_() {
  if (SP15.installed || typeof doPost !== "function" || typeof SP8 === "undefined" || !SP8.installed) return;
  SP15.installed = true;
  var prev = doPost;
  doPost = function (e) {
    var data = null;
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (!data || !data.action) return prev(e);
    try {
      switch (data.action) {
        case "terrainSet":
          return out_(sp8Locked_(function () { return sp15TerrainSet_(data); }));
        case "partnerList":
          return out_({ status: "success", partners: sp15Partners_() });
        case "sessionList":
          var lo = prev(e), lr = sp8Parse_(lo);
          if (!lr || lr.status !== "success" || !Array.isArray(lr.sessions)) return lo;
          var m = sp15TerrainMap_();
          lr.sessions.forEach(function (s) { var t = m[String(s.id)]; if (t) s.terrain = t; });
          return out_(lr);
        case "sessionCreate":
          var co = prev(e), cr = sp8Parse_(co), st = String(data.terrain || "");
          if (cr && cr.status === "success" && cr.id && SP15.STATUTS.indexOf(st) >= 0)
            sp8After_(function () { sp15ShTerrain_().appendRow([String(cr.id), st, Date.now()]); sp15Forget_(); });
          return co;
      }
    } catch (err) {
      try { console.error("sp15 " + (err && err.message || err)); } catch (x) {}
      return out_({ status: "error", message: /lock/i.test(String(err && err.message || err)) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
    return prev(e);
  };
}
sp15Install_();

/** À exécuter une fois dans l'éditeur pour vérifier l'installation. */
function sp15Verifier() {
  var ok = SP15.installed;
  console.log(ok
    ? "OK : statut du terrain actif. Pensez à publier une Nouvelle version du déploiement."
    : "PROBLÈME : le fichier Terrain doit être placé SOUS Nouveautes (menu ⋮ du fichier > Déplacer vers le bas), et sp8Verifier doit afficher OK.");
  sp15ShTerrain_(); sp15ShPartners_();
}



;

// ===== 04-Stats.gs =====
/**
 * Spary : mesure d'audience sans cookie + tableau de bord (lot 6, v17).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Stats », coller ce code.
 * Il doit être placé SOUS Terrain dans la liste des fichiers (c'est le cas par défaut pour un nouveau fichier).
 * Ne pas modifier Code.gs, Nouveautes ni Terrain.
 *  1. Sélectionner la fonction sp17Installer et cliquer sur Exécuter (accepter l'autorisation demandée par Google).
 *     Cela crée le classeur « Spary – Statistiques » dans ton Drive et un déclencheur chaque nuit (4 h).
 *  2. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *  3. sp17Verifier doit afficher « OK ». sp17MettreAJour recalcule le tableau de bord tout de suite.
 *
 * Ce que ça enregistre (dans BDD Spary) :
 *  - Visites   : date (ms) | jour | nouvelle visite (1/0) | 1re visite du jour sur cet appareil (1/0) | source | appareil | support | écrans vus (JSON)
 *                Aucune adresse IP, aucun identifiant, aucun cookie. Effacé au bout de 13 mois.
 *  - Actifs    : jour | empreinte. L'empreinte est un code irréversible (HMAC avec un secret créé tout seul, STATS_SALT)
 *                qui sert seulement à compter les membres actifs sans doublon. Effacé au bout de 60 jours
 *                et à la suppression du compte.
 * Le classeur « Spary – Statistiques » ne contient QUE des totaux (aucun pseudo, aucun e-mail) :
 * c'est lui que Claude lit pour analyser le trafic.
 * Aucun secret dans ce fichier. Écritures sous LockService.
 */

var SP17 = {
  installed: false, TZ: "Europe/Paris",
  VISITS_DAYS: 395, ACTIVE_DAYS: 60, MAX_PER_MIN: 600,
  SOURCES: ["direct", "recherche", "instagram", "tiktok", "linkedin", "facebook", "whatsapp", "snapchat", "x", "youtube", "email", "club", "partage", "lieux", "autre"],
  DEVICES: ["mobile", "ordi"], SUPPORTS: ["web", "pwa", "appli"]
};

function sp17Day_(ms) { return Utilities.formatDate(new Date(ms), SP17.TZ, "yyyy-MM-dd"); }
function sp17ShVisits_() { return sheetH_("Visites", ["date (ms)", "jour", "nouvelle visite", "1re visite du jour", "source", "appareil", "support", "écrans vus"]); }
function sp17ShActive_() { return sheetH_("Actifs", ["jour", "empreinte"]); }

function sp17Salt_() {
  var p = PropertiesService.getScriptProperties(), s = p.getProperty("STATS_SALT");
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty("STATS_SALT", s); }
  return s;
}
function sp17Print_(pseudo) {
  var raw = Utilities.computeHmacSha256Signature(String(pseudo).toLowerCase(), sp17Salt_());
  return raw.slice(0, 8).map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}
/** Sheets transforme « 2026-10-17 » en date : on relit toujours un jour sous forme de texte. */
function sp17D_(v) { return v instanceof Date ? sp17Day_(v.getTime()) : String(v || ""); }
function sp17Pick_(v, list, dflt) { v = String(v || ""); return list.indexOf(v) >= 0 ? v : dflt; }

/** Une visite ou un lot d'écrans vus, envoyé par le site. Jamais bloquant : en cas de doute, on ignore. */
function sp17Hit_(d) {
  var cache = CacheService.getScriptCache(), now = Date.now(), minute = "sp17:m:" + Math.floor(now / 60000);
  var n = Number(cache.get(minute) || 0);
  if (n >= SP17.MAX_PER_MIN) return { status: "success" };
  cache.put(minute, String(n + 1), 120);

  var views = {}, k = 0;
  if (d.views && typeof d.views === "object") Object.keys(d.views).forEach(function (v) {
    if (k >= 25 || !/^view[A-Za-z0-9]{1,30}$/.test(v)) return;
    var c = Math.min(50, Math.max(0, Math.floor(Number(d.views[v]) || 0)));
    if (c) { views[v] = c; k++; }
  });
  var visit = d.visit ? 1 : 0, uniq = d.uniq && visit ? 1 : 0;
  if (!visit && !k) return { status: "success" };
  var row = [now, sp17Day_(now), visit, uniq, sp17Pick_(d.src, SP17.SOURCES, "autre"), sp17Pick_(d.dev, SP17.DEVICES, "mobile"),
             sp17Pick_(d.app, SP17.SUPPORTS, "web"), k ? JSON.stringify(views) : ""];

  var me = null;
  if (d.token) { try { me = sessionUser_(d.token); } catch (x) {} }
  var act = null;
  if (me && me.pseudo) {
    var pr = sp17Print_(me.pseudo), key = "sp17:a:" + row[1] + ":" + pr;
    if (!cache.get(key)) { act = [row[1], pr]; cache.put(key, "1", 21600); }
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) return { status: "success" };   // serveur occupé : on perd ce comptage, pas grave
  try {
    sp17ShVisits_().appendRow(row);
    if (act) sp17ShActive_().appendRow(act);
  } finally { try { lock.releaseLock(); } catch (x) {} }
  return { status: "success" };
}

/* ===================== Tableau de bord ===================== */

function sp17Book_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty("STATS_SHEET_ID"), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (x) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create("Spary – Statistiques");
    p.setProperty("STATS_SHEET_ID", ss.getId());
  }
  return ss;
}
function sp17Tab_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }
function sp17Write_(sh, rows) {
  sh.clearContents();
  if (!rows.length) return;
  var w = 0; rows.forEach(function (r) { w = Math.max(w, r.length); });
  rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
  sh.getRange(1, 1, rows.length, w).setValues(rows);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, w).setFontWeight("bold");
}
function sp17Ms_(v) { if (v instanceof Date) return v.getTime(); var n = Number(v); if (n > 1e11) return n; var t = new Date(v).getTime(); return isNaN(t) ? 0 : t; }
/** Compte par jour la colonne de dates d'un onglet (sans lire le reste des lignes). */
function sp17CountByDay_(name, col, noHeader) {
  var sh = sheetIf_(name), out = {};
  if (!sh) return out;
  var last = sh.getLastRow(), first = noHeader ? 1 : 2;
  if (last < first) return out;
  sh.getRange(first, col, last - first + 1, 1).getValues().forEach(function (r) {
    var ms = sp17Ms_(r[0]); if (ms) { var d = sp17Day_(ms); out[d] = (out[d] || 0) + 1; }
  });
  return out;
}

/** Recalcule tout le classeur « Spary – Statistiques ». Lancé chaque nuit, ou à la main. */
function sp17MettreAJour() {
  var now = Date.now();
  sp17Purge_(now);

  var days = {}, srcDay = {}, viewsDay = {}, viewsTot = {}, srcTot = {}, support = {}, device = {};
  function D(d) { return days[d] = days[d] || { visites: 0, uniques: 0, ecrans: 0, mobile: 0, ordi: 0, web: 0, pwa: 0, appli: 0, actifs: {} }; }
  rowsOf_(sp17ShVisits_()).forEach(function (r) {
    var d = r[0] ? sp17Day_(Number(r[0])) : sp17D_(r[1]); if (!d) return;
    var o = D(d);
    if (Number(r[2])) {
      o.visites++; o[String(r[5])] = (o[String(r[5])] || 0) + 1; o[String(r[6])] = (o[String(r[6])] || 0) + 1;
      var s = String(r[4]); srcDay[d + "|" + s] = (srcDay[d + "|" + s] || 0) + 1;
    }
    if (Number(r[3])) o.uniques++;
    if (r[7]) { try { var v = JSON.parse(r[7]); Object.keys(v).forEach(function (k) { var c = Number(v[k]) || 0; o.ecrans += c; viewsDay[d + "|" + k] = (viewsDay[d + "|" + k] || 0) + c; }); } catch (x) {} }
  });
  var act = rowsOf_(sp17ShActive_());
  act.forEach(function (r) { var d = sp17D_(r[0]); if (d) D(d).actifs[String(r[1])] = 1; });

  var signup = sp17CountByDay_("Comptes", 1, false),
      seances = sp17CountByDay_("Seances", 14, false),
      parts = sp17CountByDay_("Inscriptions", 4, false),
      msgs = sp17CountByDay_("Messages", 5, true),
      posts = sp17CountByDay_("Annonces", 7, true),
      matchs = sp17CountByDay_("Matchs", 2, false);
  [signup, seances, parts, msgs, posts, matchs].forEach(function (m) { Object.keys(m).forEach(D); });

  var list = Object.keys(days).sort();
  var jour = [["jour", "visites", "visiteurs uniques", "écrans vus", "membres actifs", "inscriptions", "séances créées", "participations aux séances", "messages", "annonces", "matchs", "visites mobile", "visites ordi", "site web", "appli installée (PWA)", "appli iPhone/Android"]];
  list.forEach(function (d) {
    var o = days[d];
    jour.push([d, o.visites, o.uniques, o.ecrans, Object.keys(o.actifs).length, signup[d] || 0, seances[d] || 0, parts[d] || 0, msgs[d] || 0, posts[d] || 0, matchs[d] || 0, o.mobile || 0, o.ordi || 0, o.web || 0, o.pwa || 0, o.appli || 0]);
  });

  var src = [["jour", "source", "visites"]];
  Object.keys(srcDay).sort().forEach(function (k) { var p = k.split("|"); src.push([p[0], p[1], srcDay[k]]); });
  var canal = [["jour", "canal déclaré à l'inscription", "inscriptions"]], cm = {};
  var shSrc = sheetIf_("SourcesInscription");
  if (shSrc) rowsOf_(shSrc).forEach(function (r) { var d = sp17D_(r[0]); var k = d + "|" + r[1]; cm[k] = (cm[k] || 0) + 1; });
  Object.keys(cm).sort().forEach(function (k) { var p = k.split("|"); canal.push([p[0], p[1], cm[k]]); });

  var vues = [["jour", "écran", "vues"]];
  Object.keys(viewsDay).sort().forEach(function (k) { var p = k.split("|"); vues.push([p[0], p[1], viewsDay[k]]); });

  // Résumé : 7 derniers jours complets contre les 7 d'avant, et 30 jours.
  function sumRange(from, to, f) { var t = 0; list.forEach(function (d) { if (d >= from && d <= to) t += f(days[d], d); }); return t; }
  function distinct(from, to) { var s = {}; act.forEach(function (r) { var d = sp17D_(r[0]); if (d >= from && d <= to) s[String(r[1])] = 1; }); return Object.keys(s).length; }
  var y = sp17Day_(now - 86400000), a7 = sp17Day_(now - 7 * 86400000), b7 = sp17Day_(now - 8 * 86400000), b14 = sp17Day_(now - 14 * 86400000), a30 = sp17Day_(now - 30 * 86400000);
  var metrics = [
    ["Visites", function (o) { return o.visites; }],
    ["Visiteurs uniques (par jour, additionnés)", function (o) { return o.uniques; }],
    ["Écrans vus", function (o) { return o.ecrans; }],
    ["Inscriptions", function (o, d) { return signup[d] || 0; }],
    ["Séances créées", function (o, d) { return seances[d] || 0; }],
    ["Participations aux séances", function (o, d) { return parts[d] || 0; }],
    ["Messages", function (o, d) { return msgs[d] || 0; }],
    ["Matchs déclarés", function (o, d) { return matchs[d] || 0; }]
  ];
  var res = [["indicateur", "7 derniers jours", "7 jours d'avant", "évolution", "30 derniers jours"]];
  function evo(a, b) { return b ? Math.round((a - b) / b * 100) + " %" : (a ? "nouveau" : "–"); }
  metrics.forEach(function (m) { var a = sumRange(a7, y, m[1]), b = sumRange(b14, b7, m[1]); res.push([m[0], a, b, evo(a, b), sumRange(a30, y, m[1])]); });
  var wa = distinct(a7, y), wb = distinct(b14, b7);
  res.push(["Membres actifs (distincts)", wa, wb, evo(wa, wb), distinct(a30, y)]);
  var members = 0; var shAcc = sheetIf_("Comptes"); if (shAcc) members = Math.max(0, shAcc.getLastRow() - 1);
  res.push([]);
  res.push(["Membres inscrits au total", members]);
  res.push(["Mis à jour le", Utilities.formatDate(new Date(now), SP17.TZ, "dd/MM/yyyy HH:mm")]);
  res.push([]);
  res.push(["Rappel", "Totaux anonymes uniquement. Les « visiteurs uniques » sont comptés par appareil et par jour, sans cookie ni identifiant."]);

  var ss = sp17Book_();
  sp17Write_(sp17Tab_(ss, "Résumé"), res);
  sp17Write_(sp17Tab_(ss, "Jour"), jour);
  sp17Write_(sp17Tab_(ss, "Sources"), src);
  sp17Write_(sp17Tab_(ss, "Canaux inscription"), canal);
  sp17Write_(sp17Tab_(ss, "Écrans"), vues);
  var def = ss.getSheetByName("Feuille 1") || ss.getSheetByName("Sheet1");
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  sp17Charts_(sp17Tab_(ss, "Jour"), jour.length);
  return ss.getUrl();
}

function sp17Charts_(sh, n) {
  if (n < 2) return;
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  var from = Math.max(2, n - 59);   // 60 derniers jours
  var rows = n - from + 1;
  sh.insertChart(sh.newChart().asLineChart()
    .addRange(sh.getRange(1, 1, 1, 3)).addRange(sh.getRange(from, 1, rows, 3))
    .setOption("title", "Visites (60 derniers jours)").setOption("useFirstColumnAsDomain", true)
    .setPosition(2, 18, 0, 0).build());
  sh.insertChart(sh.newChart().asColumnChart()
    .addRange(sh.getRange(from, 1, rows, 1)).addRange(sh.getRange(from, 5, rows, 3))
    .setOption("title", "Actifs, inscriptions, séances").setOption("useFirstColumnAsDomain", true)
    .setPosition(22, 18, 0, 0).build());
}

/** Efface les visites de plus de 13 mois et les empreintes de plus de 60 jours. */
function sp17Purge_(now) {
  var lv = sp17Day_(now - SP17.VISITS_DAYS * 86400000), la = sp17Day_(now - SP17.ACTIVE_DAYS * 86400000);
  sp8Locked_(function () {
    rewriteRows_(sp17ShVisits_(), function (r) { return sp17Day_(Number(r[0]) || 0) >= lv ? r : null; });
    rewriteRows_(sp17ShActive_(), function (r) { return sp17D_(r[0]) >= la ? r : null; });
  });
}

/* ===================== Installation ===================== */
function sp17Install_() {
  if (SP17.installed || typeof doPost !== "function" || typeof SP15 === "undefined" || !SP15.installed) return;
  SP17.installed = true;
  var prev = doPost;
  doPost = function (e) {
    var data = null;
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (data && data.action === "hit") {
      try { return out_(sp17Hit_(data)); } catch (err) { try { console.error("sp17 " + (err && err.message || err)); } catch (x) {} return out_({ status: "success" }); }
    }
    return prev(e);
  };
  // Suppression de compte : on efface aussi son empreinte d'activité.
  var baseDelete = deleteAccountData_;
  deleteAccountData_ = function (pseudo) {
    baseDelete(pseudo);
    try { var pr = sp17Print_(pseudo); rewriteRows_(sp17ShActive_(), function (r) { return String(r[1]) === pr ? null : r; }); } catch (x) {}
  };
}
sp17Install_();

/** À exécuter UNE fois : crée le classeur de statistiques et le déclencheur de chaque nuit. */
function sp17Installer() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "sp17MettreAJour") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("sp17MettreAJour").timeBased().everyDays(1).atHour(4).inTimezone(SP17.TZ).create();
  sp17Salt_(); sp17ShVisits_(); sp17ShActive_();
  var url = sp17MettreAJour();
  console.log("OK : tableau de bord créé → " + url + "  (pense à publier une Nouvelle version du déploiement)");
}

function sp17Verifier() {
  var trig = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "sp17MettreAJour"; });
  if (!SP17.installed) console.log("PROBLÈME : le fichier Stats doit être placé SOUS Terrain, et sp15Verifier doit afficher OK.");
  else if (!trig) console.log("PROBLÈME : exécute d'abord sp17Installer.");
  else console.log("OK : mesure d'audience active. Tableau de bord : " + sp17Book_().getUrl());
}


;

// ===== 05-Lus.gs =====
/**
 * Spary : messages lus partagés entre le site et l'appli + coches envoyé / reçu / lu (lot 8, v19-v20).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Lus », coller ce code.
 * Le placer SOUS Stats dans la liste des fichiers (c'est le cas par défaut pour un nouveau fichier).
 * Ne pas modifier Code.gs, Nouveautes, Terrain ni Stats.
 *  1. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *  2. sp19Verifier doit afficher « OK ».
 *
 * Ce que ça enregistre (onglet MessagesLus de BDD Spary, créé tout seul) :
 *   membre | lus (JSON) | mis à jour (ms) | reçu jusqu'à | confirmations de lecture (oui / non)
 *   « lus » = pour chaque conversation, le numéro du dernier message lu (ex. {"lea92":154,"#37":160}).
 *   « reçu jusqu'à » = numéro du dernier message arrivé sur un de ses appareils (sert à la coche « reçu »).
 *   Aucun contenu de message. Effacé à la suppression du compte, inclus dans l'export des données.
 * Coche « lu » : seulement si les DEUX membres ont laissé les confirmations de lecture activées (comme WhatsApp).
 * Aucun secret dans ce fichier. Écritures sous LockService.
 */

var SP19 = { installed: false, MAX_KEYS: 400, KEY: /^#?[a-z0-9_.-]{1,60}$/, GOT_TTL: 21600 };

function sp19Sh_() { return sheetH_("MessagesLus", ["membre", "lus (JSON)", "mis à jour (ms)", "reçu jusqu'à", "confirmations de lecture (oui / non)"]); }

function sp19Find_(sh, pseudo) {
  var v = sh.getDataRange().getValues(), p = sp8Lc_(pseudo);
  for (var i = 1; i < v.length; i++) {
    if (sp8Lc_(v[i][0]) === p) {
      var m = {};
      try { m = JSON.parse(String(v[i][1] || "{}")) || {}; } catch (x) { m = {}; }
      return { row: i + 1, map: m, got: Number(v[i][3]) || 0, receipts: String(v[i][4] || "oui").toLowerCase() !== "non" };
    }
  }
  return null;
}
function sp19Empty_() { return { row: 0, map: {}, got: 0, receipts: true }; }

/** « Reçu jusqu'à » le plus récent : le cache (mis à jour à chaque synchro des messages) ou la feuille. */
function sp19Got_(pseudo, f) {
  var c = Number(CacheService.getScriptCache().get("sp20:got:" + sp8Lc_(pseudo))) || 0;
  return Math.max(c, f ? f.got : 0);
}
function sp19NoteGot_(pseudo, id) {
  id = Math.floor(Number(id) || 0); if (!pseudo || id <= 0) return;
  var cache = CacheService.getScriptCache(), k = "sp20:got:" + sp8Lc_(pseudo);
  if (id > (Number(cache.get(k)) || 0)) cache.put(k, String(id), SP19.GOT_TTL);
}

/** Le site envoie ce qu'il a lu (et reçu) ; on garde le plus grand numéro par conversation et on renvoie le tout. */
function sp19Sync_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var inc = {}, n = 0;
  if (d.read && typeof d.read === "object") Object.keys(d.read).forEach(function (k) {
    var key = sp8Lc_(k), v = Math.floor(Number(d.read[k]) || 0);
    if (n < SP19.MAX_KEYS && SP19.KEY.test(key) && v > 0 && v < 1e12) { inc[key] = v; n++; }
  });
  var got = Math.floor(Number(d.got) || 0); if (!(got > 0 && got < 1e12)) got = 0;
  sp19NoteGot_(me.pseudo, got);
  var rcp = typeof d.receipts === "boolean" ? d.receipts : null;
  var sh = sp19Sh_(), f = sp19Find_(sh, me.pseudo) || sp19Empty_();
  var need = Object.keys(inc).some(function (k) { return inc[k] > (Number(f.map[k]) || 0); }) || got > f.got || (rcp !== null && rcp !== f.receipts);
  if (!need) return { status: "success", read: f.map, receipts: f.receipts };
  return sp8Locked_(function () {
    var f2 = sp19Find_(sh, me.pseudo) || sp19Empty_(), m = f2.map;
    Object.keys(inc).forEach(function (k) { if (inc[k] > (Number(m[k]) || 0)) m[k] = inc[k]; });
    var keys = Object.keys(m);
    if (keys.length > SP19.MAX_KEYS) {   // on garde les conversations les plus récentes
      keys.sort(function (a, b) { return (Number(m[b]) || 0) - (Number(m[a]) || 0); });
      var kept = {}; keys.slice(0, SP19.MAX_KEYS).forEach(function (k) { kept[k] = m[k]; }); m = kept;
    }
    var r = rcp === null ? f2.receipts : rcp;
    var row = [JSON.stringify(m), Date.now(), Math.max(got, f2.got), r ? "oui" : "non"];
    if (f2.row) sh.getRange(f2.row, 2, 1, 4).setValues([row]);
    else sh.appendRow([me.pseudo].concat(row));
    return { status: "success", read: m, receipts: r };
  });
}

/** Coches d'une conversation privée : jusqu'où mes messages sont arrivés chez l'autre, et jusqu'où il les a lus. */
function sp20State_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var peer = sp8Lc_(String(d.peer || "").replace(/[^A-Za-z0-9_.-]/g, ""));
  if (!peer || peer === sp8Lc_(me.pseudo)) return err_("Membre inconnu.");
  var sh = sp19Sh_(), mine = sp19Find_(sh, me.pseudo) || sp19Empty_(), other = sp19Find_(sh, peer);
  var both = mine.receipts && (other ? other.receipts : true);
  return {
    status: "success", peer: peer,
    got: sp19Got_(peer, other),
    read: both && other ? Number(other.map[sp8Lc_(me.pseudo)]) || 0 : 0,
    receipts: both
  };
}

/* ===================== Installation ===================== */
function sp19Install_() {
  if (SP19.installed || typeof doPost !== "function" || typeof SP8 === "undefined" || !SP8.installed) return;
  SP19.installed = true;
  var prev = doPost;
  doPost = function (e) {
    var data = null;
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (data && (data.action === "readSync" || data.action === "readState")) {
      try { return out_(data.action === "readSync" ? sp19Sync_(data) : sp20State_(data)); }
      catch (err) {
        try { console.error("sp19 " + (err && err.message || err)); } catch (x) {}
        return out_({ status: "error", message: "Serveur occupé, réessayez dans quelques secondes." });
      }
    }
    if (data && data.action === "msgSync") {
      // Coche « reçu » : tout message dont le numéro est ≤ à ce que l'appareil a déjà reçu est arrivé.
      var res = prev(e);
      try {
        var me = sessionUser_(data.token), r = sp8Parse_(res);
        if (me && r && r.status === "success") {
          var top = Number(data.since) || 0;
          (r.messages || []).forEach(function (m) { if (Number(m.id) > top) top = Number(m.id); });
          sp19NoteGot_(me.pseudo, top);
        }
      } catch (x) {}
      return res;
    }
    return prev(e);
  };
  // Suppression de compte : on efface aussi ses marqueurs de lecture.
  var baseDelete = deleteAccountData_;
  deleteAccountData_ = function (pseudo) {
    baseDelete(pseudo);
    try {
      var p = sp8Lc_(pseudo);
      rewriteRows_(sp19Sh_(), function (r) { return sp8Lc_(r[0]) === p ? null : r; });
      CacheService.getScriptCache().remove("sp20:got:" + p);
    } catch (x) {}
  };
  // Export RGPD : on ajoute les marqueurs de lecture.
  var baseExport = accountExport_;
  accountExport_ = function (d) {
    var r = baseExport(d);
    try {
      if (r && r.status === "success" && r.data && r.data.pseudo) {
        var f = sp19Find_(sp19Sh_(), r.data.pseudo) || sp19Empty_();
        r.data.messagesLus = { lus: f.map, reçu_jusqu_au_message: f.got, confirmations_de_lecture: f.receipts };
      }
    } catch (x) {}
    return r;
  };
}
sp19Install_();

/** À exécuter une fois dans l'éditeur pour vérifier l'installation. */
function sp19Verifier() {
  if (!SP19.installed) console.log("PROBLÈME : le fichier Lus doit être placé SOUS Nouveautes (idéalement sous Stats), et sp8Verifier doit afficher OK.");
  else { sp19Sh_(); console.log("OK : messages lus partagés et coches envoyé / reçu / lu actives (onglet MessagesLus)."); }
}


;

// ===== 06-Entrainements.gs =====
/**
 * Spary : entraînements enregistrés (lot 12, v23).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Entrainements », coller ce code.
 * Le placer SOUS Lus dans la liste des fichiers (c'est le cas par défaut pour un nouveau fichier).
 * Ne pas modifier Code.gs, Nouveautes, Terrain, Stats ni Lus.
 *  1. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *  2. sp23Verifier doit afficher « OK ».
 *
 * Ce que ça enregistre (onglet Entrainements de BDD Spary, créé tout seul) :
 *   id | membre | sport | début (ms) | durée (s) | distance (km) | ressenti (1-5) | note | source | créé (ms) | id Santé
 *   Visible uniquement par le membre lui-même (jamais par les autres membres ni par les clubs).
 *   Effacé à la suppression du compte, inclus dans l'export des données.
 * Aucun secret dans ce fichier. Écritures sous LockService.
 */

var SP23 = {
  installed: false,
  MAX_PER_DAY: 30,          // anti-abus
  LIST: 400,                // entraînements renvoyés au plus
  SPORTS: ["Running & Trail", "Marche", "Cyclisme", "Natation", "Fitness / Crossfit", "Musculation", "Tennis", "Padel", "Football / Five", "Basketball", "Badminton", "Yoga & Pilates", "Escalade", "Volley-ball", "Rugby", "Golf", "Handball", "Squash", "Tennis de table", "Danse", "Sports de combat", "Autre"],
  SOURCES: ["chrono", "manuel", "sante"]
};

function sp23Sh_() {
  return sheetH_("Entrainements", ["id", "membre", "sport", "début (ms)", "durée (s)", "distance (km)", "ressenti (1-5)", "note", "source", "créé (ms)", "id Santé"]);
}

function sp23Row_(r) {
  return {
    id: String(r[0]), sport: String(r[2]), start: Number(r[3]) || 0, dur: Number(r[4]) || 0,
    km: r[5] === "" ? null : Number(r[5]), feel: Number(r[6]) || 0, note: String(r[7] || ""),
    source: String(r[8] || "manuel"), health: String(r[10] || "")
  };
}

function sp23Mine_(pseudo) {
  var v = sp23Sh_().getDataRange().getValues(), p = sp8Lc_(pseudo), out = [];
  for (var i = 1; i < v.length; i++) if (sp8Lc_(v[i][1]) === p) out.push(sp23Row_(v[i]));
  out.sort(function (a, b) { return b.start - a.start; });
  return out;
}

function sp23Clean_(d) {
  var sport = String(d.sport || "");
  if (SP23.SPORTS.indexOf(sport) < 0) return { e: "Sport inconnu." };
  var now = Date.now(), start = Math.floor(Number(d.start) || 0);
  if (!(start > now - 400 * 864e5 && start < now + 6e5)) return { e: "Date invalide." };
  var dur = Math.round(Number(d.dur) || 0);
  if (!(dur >= 60 && dur <= 12 * 3600)) return { e: "Durée entre 1 minute et 12 heures." };
  var km = d.km === null || d.km === undefined || d.km === "" ? "" : Math.round(Number(d.km) * 100) / 100;
  if (km !== "" && !(km >= 0 && km <= 500)) return { e: "Distance invalide." };
  var feel = Math.round(Number(d.feel) || 0); if (!(feel >= 1 && feel <= 5)) feel = "";
  var note = safe_(String(d.note || "").replace(/[\\u0000-\\u001f]/g, " ").trim().slice(0, 200));   // safe_ : pas de formule dans la feuille
  var source = SP23.SOURCES.indexOf(String(d.source)) >= 0 ? String(d.source) : "manuel";
  var health = String(d.health || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
  var cid = String(d.cid || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);   // identifiant créé par l'appareil (évite les doublons en cas de renvoi)
  return { sport: sport, start: start, dur: dur, km: km, feel: feel, note: note, source: source, health: health, cid: cid };
}

function sp23Save_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var c = sp23Clean_(d);
  if (c.e) return err_(c.e);
  return sp8Locked_(function () {
    var sh = sp23Sh_(), v = sh.getDataRange().getValues(), p = sp8Lc_(me.pseudo), today = 0, day = Date.now() - 864e5;
    for (var i = 1; i < v.length; i++) {
      if (sp8Lc_(v[i][1]) !== p) continue;
      if (c.cid && String(v[i][0]) === c.cid) return { status: "success", item: sp23Row_(v[i]), dup: true };
      if (c.health && String(v[i][10]) === c.health) return { status: "success", item: sp23Row_(v[i]), dup: true };
      if (Number(v[i][9]) > day) today++;
    }
    if (today >= SP23.MAX_PER_DAY) return err_("Trop d'entraînements enregistrés aujourd'hui.");
    var id = c.cid || Utilities.getUuid();
    var row = [id, me.pseudo, c.sport, c.start, c.dur, c.km, c.feel, c.note, c.source, Date.now(), c.health];
    sh.appendRow(row);
    return { status: "success", item: sp23Row_(row) };
  });
}

function sp23List_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  return { status: "success", items: sp23Mine_(me.pseudo).slice(0, SP23.LIST) };
}

function sp23Delete_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(d.id || "");
  if (!id) return err_("Entraînement introuvable.");
  return sp8Locked_(function () {
    var p = sp8Lc_(me.pseudo), n = 0;
    rewriteRows_(sp23Sh_(), function (r) { if (String(r[0]) === id && sp8Lc_(r[1]) === p) { n++; return null; } return r; });
    return n ? { status: "success" } : err_("Entraînement introuvable.");
  });
}

/* ===================== Installation ===================== */
function sp23Install_() {
  if (SP23.installed || typeof doPost !== "function" || typeof SP8 === "undefined" || !SP8.installed) return;
  SP23.installed = true;
  var prev = doPost;
  doPost = function (e) {
    var data = null;
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (data && (data.action === "trainSave" || data.action === "trainList" || data.action === "trainDelete")) {
      try { return out_(data.action === "trainSave" ? sp23Save_(data) : data.action === "trainList" ? sp23List_(data) : sp23Delete_(data)); }
      catch (err) {
        try { console.error("sp23 " + (err && err.message || err)); } catch (x) {}
        return out_({ status: "error", message: "Serveur occupé, réessayez dans quelques secondes." });
      }
    }
    return prev(e);
  };
  // Suppression de compte : on efface ses entraînements.
  var baseDelete = deleteAccountData_;
  deleteAccountData_ = function (pseudo) {
    baseDelete(pseudo);
    try { var p = sp8Lc_(pseudo); rewriteRows_(sp23Sh_(), function (r) { return sp8Lc_(r[1]) === p ? null : r; }); } catch (x) {}
  };
  // Export RGPD : on ajoute ses entraînements.
  var baseExport = accountExport_;
  accountExport_ = function (d) {
    var r = baseExport(d);
    try {
      if (r && r.status === "success" && r.data && r.data.pseudo) {
        r.data.entrainements = sp23Mine_(r.data.pseudo).map(function (t) {
          return { sport: t.sport, debut: new Date(t.start).toISOString(), duree_minutes: Math.round(t.dur / 60), distance_km: t.km, ressenti: t.feel || null, note: t.note, source: t.source };
        });
      }
    } catch (x) {}
    return r;
  };
}
sp23Install_();

/** À exécuter une fois dans l'éditeur pour vérifier l'installation. */
function sp23Verifier() {
  if (!SP23.installed) console.log("PROBLÈME : le fichier Entrainements doit être placé SOUS Nouveautes (idéalement sous Lus), et sp8Verifier doit afficher OK.");
  else { sp23Sh_(); console.log("OK : entraînements actifs (onglet Entrainements)."); }
}


;

// ===== 07-Performances.gs =====
/**
 * Spary : séances détaillées, séance à deux, karting, palmarès, notes des joueurs, points de ligue (lot 16, v28).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Performances », coller ce code.
 * Le placer SOUS Entrainements et AU-DESSUS de Rgpd et de Securite (Securite reste le dernier fichier).
 * Ne modifier aucun autre fichier (ni Code.gs, ni Nouveautes, ni Entrainements).
 *  1. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *  2. Exécuter sp26Verifier : le journal doit afficher « OK ».
 *
 * Ce que ça ajoute :
 *  1. Détails d'une séance selon le sport (séries et charges, circuits, fractionnés, exercices, match d'entraînement,
 *     voies d'escalade, golf, chronos de karting, paintball…). Visibilité : « Tout le monde » ou « Moi seul ».
 *     Seul l'auteur modifie. La note personnelle et le ressenti restent toujours privés.
 *  2. Séance à deux : l'auteur invite un ami Spary, qui confirme ou refuse. Confirmée, elle apparaît sur les deux profils.
 *  3. Ligue : +100 pts pour une séance enregistrée d'au moins 15 min (chrono, ajout manuel, app Santé ou séance
 *     à deux confirmée), une fois par jour, en commun avec « Poster ma séance » (pas de double comptage).
 *     Avant ce fichier, seules les séances publiées sur le fil rapportaient des points.
 *  4. Palmarès automatique (meilleures performances par sport) et chronos de karting par circuit (classement).
 *  5. Notes des joueurs (1 à 5 étoiles) après une séance à deux ou un match confirmé, ajoutées aux avis après séance
 *     existants. Garde-fous : seulement entre joueurs qui ont vraiment joué ensemble, 7 jours pour noter, une voix par
 *     personne (sa note la plus récente), moyenne affichée à partir de 3 personnes, comptes de moins de 3 jours ignorés,
 *     note basse = motif obligatoire, notes anonymes, contestation possible (onglet Recours, type « note »).
 *     Pour retirer une note : onglet Notes, colonne « statut » → « masquée ».
 *  6. Test des notifications depuis l'appli (Compte et données → Tester les notifications) avec un diagnostic lisible.
 *
 * Onglets créés tout seuls :
 *  - SeancesPlus : séance | membre | visibilité | détails (JSON) | partenaire | statut partenaire | maj (ms) | réponse (ms)
 *  - Notes       : id | date (ms) | source | réf | auteur | membre noté | note | qualités | statut
 * Aucun secret dans ce fichier. Écritures sous LockService (sp8Locked_).
 */

var SP26 = {
  installed: false,
  NEW_SPORTS: ["Karting", "Paintball"],
  MIN_POINTS_S: 900,          // 15 min
  NOTE_DAYS: 7,
  NOTE_MIN_RATERS: 3,
  NOTE_MIN_ACCOUNT_DAYS: 3,
  POS_TAGS: ["Ponctuel", "Fair-play", "Bonne ambiance", "Bon niveau", "Motivant", "De bon conseil"],
  NEG_TAGS: ["En retard", "Absent", "Comportement", "Niveau surestimé"],
  DET_MAX: 6000,
  LIST_PUBLIC: 30,
  KART: ["rkc", "rko", "kartland", "brk", "aerokart", "k93", "nikito", "bk-villepinte", "bk-massy", "bk-dammartin", "sp-sqy", "ocg", "asm", "sp-servon", "brq-etards", "brq-poincy", "sp-vde", "autre"],
  GRADES: ["3", "4a", "4b", "4c", "5a", "5a+", "5b", "5b+", "5c", "5c+", "6a", "6a+", "6b", "6b+", "6c", "6c+", "7a", "7a+", "7b", "7b+", "7c", "7c+", "8a", "8a+", "8b", "8b+", "8c", "8c+", "9a"]
};
SP26.KIND = {
  "Musculation": "force", "Fitness / Crossfit": "circuit",
  "Running & Trail": "endu", "Marche": "endu", "Cyclisme": "endu", "Natation": "endu",
  "Football / Five": "co", "Basketball": "co", "Volley-ball": "co", "Rugby": "co", "Handball": "co",
  "Tennis": "raq", "Padel": "raq", "Badminton": "raq", "Squash": "raq", "Tennis de table": "raq",
  "Escalade": "grimpe", "Golf": "golf", "Karting": "kart", "Paintball": "paint", "Sports de combat": "combat"
};

function sp26ShPlus_()  { return sheetH_("SeancesPlus", ["séance", "membre", "visibilité", "détails (JSON)", "partenaire", "statut partenaire", "maj (ms)", "réponse (ms)"]); }
function sp26ShNotes_() { return sheetH_("Notes", ["id", "date (ms)", "source", "réf", "auteur", "membre noté", "note", "qualités", "statut"]); }

/* ===================== Lecture ===================== */
/** Toutes les séances (onglet Entrainements) jointes à leurs détails. */
function sp26All_() {
  var plus = {};
  rowsOf_(sp26ShPlus_()).forEach(function (r) {
    if (!r[0]) return;
    plus[String(r[0])] = { vis: String(r[2]) === "public" ? "public" : "prive", det: jsonSafe_(r[3]), with: String(r[4] || ""), wst: String(r[5] || ""), wts: Number(r[7]) || 0 };
  });
  var out = [];
  rowsOf_(sp23Sh_()).forEach(function (r) {
    if (!r[0]) return;
    var t = sp23Row_(r); t.owner = String(r[1]);
    var p = plus[t.id] || { vis: "prive", det: {}, with: "", wst: "", wts: 0 };
    t.vis = p.vis; t.det = p.det; t.with = p.with; t.wst = p.wst; t.wts = p.wts;
    out.push(t);
  });
  return out;
}
function sp26Lc_(s) { return String(s == null ? "" : s).toLowerCase(); }
/** Version partagée d'une séance (jamais la note personnelle ni le ressenti). */
function sp26Public_(t, nm) {
  var o = { id: t.id, sport: t.sport, start: t.start, dur: t.dur, km: t.km, det: t.det || {}, owner: t.owner, vis: t.vis };
  if (nm) { var a = nm[sp26Lc_(t.owner)]; if (a) o.ownerName = a.name; }
  if (t.with && t.wst === "accepté") { o.with = t.with; if (nm) { var b = nm[sp26Lc_(t.with)]; if (b) { o.with = b.pseudo; o.withName = b.name; } } }
  return o;
}

/* ===================== Validation des détails ===================== */
function sp26Int_(v, min, max) { var n = Math.round(Number(v)); return isFinite(n) && n >= min && n <= max ? n : null; }
function sp26Num_(v, min, max) { var n = Math.round(Number(String(v).replace(",", ".")) * 100) / 100; return isFinite(n) && n >= min && n <= max ? n : null; }
function sp26Txt_(v, n) { return clip_(String(v == null ? "" : v).replace(/^\\s*[=+\\-@]+/, ""), n); }
function sp26List_(a, max, fn) { var out = []; (Array.isArray(a) ? a : []).slice(0, max).forEach(function (x) { var y = fn(x || {}); if (y) out.push(y); }); return out; }
function sp26Pick_(v, list) { v = String(v || ""); return list.indexOf(v) >= 0 ? v : ""; }

/** Nettoie les détails envoyés par l'appli. Renvoie { det } ou { e: message }. */
function sp26Det_(sport, d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return { det: {} };
  var kind = SP26.KIND[sport] || "libre", k = String(d.k || kind);
  if ((sport === "Musculation" || sport === "Fitness / Crossfit") && (k === "force" || k === "circuit")) kind = k;
  var o = { k: kind }, texts = [];
  var tpl = sp26Txt_(d.tpl, 40); if (tpl) { o.tpl = tpl; texts.push(tpl); }
  var ex = function (x) { var n = sp26Txt_(x.n, 40); if (!n) return null; texts.push(n); var m = sp26Int_(x.min, 0, 600); return m === null ? { n: n } : { n: n, min: m }; };
  if (kind === "force") {
    o.ex = sp26List_(d.ex, 20, function (x) {
      var n = sp26Txt_(x.n, 40); if (!n) return null; texts.push(n);
      var s = sp26List_(x.s, 15, function (y) { var r = sp26Int_(y.r, 0, 500), kg = y.kg === "" || y.kg == null ? null : sp26Num_(y.kg, 0, 700); if (r === null && kg === null) return null; var z = {}; if (r !== null) z.r = r; if (kg !== null) z.kg = kg; return z; });
      return { n: n, s: s };
    });
  } else if (kind === "circuit") {
    o.tours = sp26Int_(d.tours, 1, 100) || 1;
    var rp = sp26Int_(d.rep, 0, 1800); if (rp !== null) o.rep = rp;
    o.st = sp26List_(d.st, 20, function (x) { var n = sp26Txt_(x.n, 40); if (!n) return null; texts.push(n); var z = { n: n }, r = sp26Int_(x.r, 0, 1000), s = sp26Int_(x.sec, 0, 3600), kg = x.kg == null || x.kg === "" ? null : sp26Num_(x.kg, 0, 300); if (r !== null) z.r = r; if (s !== null) z.sec = s; if (kg !== null) z.kg = kg; return z; });
  } else if (kind === "endu") {
    o.type = sp26Pick_(d.type, ["footing", "fractionne", "longue", "seuil", "course", "recup", "technique"]);
    var dp = sp26Int_(d.dplus, 0, 12000); if (dp !== null && dp > 0) o.dplus = dp;
    o.fr = sp26List_(d.fr, 10, function (x) { var n = sp26Int_(x.n, 1, 100); if (!n) return null; var z = { n: n }, dd = sp26Int_(x.d, 0, 100000), t = sp26Int_(x.t, 0, 36000), rc = sp26Int_(x.rec, 0, 3600); if (dd) z.d = dd; if (t) z.t = t; if (rc !== null) z.rec = rc; return z.d || z.t ? z : null; });
    var rank = sp26Int_(d.rang, 1, 100000); if (rank) o.rang = rank;
  } else if (kind === "co" || kind === "raq") {
    o.type = d.type === "match" ? "match" : "entrainement";
    o.ex = sp26List_(d.ex, 15, ex);
    if (o.type === "match") {
      if (kind === "co") { var a = sp26Int_(d.nous, 0, 300), b = sp26Int_(d.eux, 0, 300); if (a !== null && b !== null) { o.nous = a; o.eux = b; } }
      else { o.sets = sp26List_(d.sets, 5, function (x) { var a2 = sp26Int_(Array.isArray(x) ? x[0] : x.a, 0, 99), b2 = sp26Int_(Array.isArray(x) ? x[1] : x.b, 0, 99); return a2 === null || b2 === null ? null : [a2, b2]; }); }
      var res = sp26Pick_(d.res, ["v", "n", "d"]); if (res) o.res = res;
    }
    if (kind === "co") { var bu = sp26Int_(d.buts, 0, 200), pa = sp26Int_(d.passes, 0, 200); if (bu) o.buts = bu; if (pa) o.passes = pa; }
  } else if (kind === "grimpe") {
    o.voies = sp26List_(d.voies, 40, function (x) { var c = sp26Pick_(x.c, SP26.GRADES); if (!c) return null; return { c: c, t: x.t === "voie" ? "voie" : "bloc", r: sp26Pick_(x.r, ["flash", "enchaine", "essai"]) || "enchaine" }; });
  } else if (kind === "golf") {
    o.trous = d.trous == 9 ? 9 : 18;
    var cp = sp26Int_(d.coups, 9, 250), par = sp26Int_(d.par, 27, 80), pu = sp26Int_(d.putts, 0, 120);
    if (cp) o.coups = cp; if (par) o.par = par; if (pu !== null) o.putts = pu;
    var pc = sp26Txt_(d.parcours, 60); if (pc) { o.parcours = pc; texts.push(pc); }
    o.ex = sp26List_(d.ex, 10, ex);
  } else if (kind === "kart") {
    o.c = sp26Pick_(d.c, SP26.KART) || "autre";
    if (o.c === "autre") { var li = sp26Txt_(d.lieu, 60); if (li) { o.lieu = li; texts.push(li); } }
    o.type = sp26Pick_(d.type, ["loisir", "course", "essais"]) || "loisir";
    o.laps = sp26List_(d.laps, 80, function (x) { var v = sp26Int_(x, 10000, 900000); return v === null ? null : v; });
    var best = sp26Int_(d.best, 10000, 900000);
    if (o.laps.length) { var mn = Math.min.apply(null, o.laps); best = best ? Math.min(best, mn) : mn; }
    if (best) o.best = best;
    var tr = sp26Int_(d.tours, 0, 1000); if (tr) o.tours = Math.max(tr, o.laps.length); else if (o.laps.length) o.tours = o.laps.length;
    var kt = sp26Txt_(d.kart, 30); if (kt) { o.kart = kt; texts.push(kt); }
    var pos = sp26Int_(d.pos, 1, 99); if (pos) o.pos = pos;
  } else if (kind === "paint") {
    var mm = sp26Int_(d.manches, 0, 100), gg = sp26Int_(d.gagnees, 0, 100);
    if (mm) o.manches = mm; if (gg !== null && mm) o.gagnees = Math.min(gg, mm);
    var md = sp26Txt_(d.mode, 30); if (md) { o.mode = md; texts.push(md); }
  } else if (kind === "combat") {
    o.type = sp26Pick_(d.type, ["technique", "sparring", "combat", "physique"]) || "technique";
    var rd = sp26Int_(d.rounds, 0, 50), rm = sp26Int_(d.rmin, 0, 30); if (rd) o.rounds = rd; if (rm) o.rmin = rm;
    o.ex = sp26List_(d.ex, 15, ex);
  } else {
    o.ex = sp26List_(d.ex, 15, ex);
  }
  if (texts.length && badAny_(texts)) return { e: "Un nom d'exercice contient un mot interdit." };
  var js = JSON.stringify(o);
  if (js.length > SP26.DET_MAX) return { e: "Trop de détails pour une seule séance." };
  return { det: o };
}

/* ===================== Écriture des détails ===================== */
function sp26PlusRow_(id) {
  var v = sp26ShPlus_().getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === String(id)) return { i: i + 1, r: v[i] };
  return null;
}
function sp26Friend_(me, other) {
  var acc = findAccount_(sp8Pseudo_(other));
  if (!acc) return { e: "Ce membre n'existe pas." };
  if (sp26Lc_(acc.pseudo) === sp26Lc_(me)) return { e: "Tu ne peux pas t'inviter toi-même." };
  if (sp8FriendState_(me)[sp26Lc_(acc.pseudo)] !== "ami") return { e: "Tu peux seulement inviter un ami Spary." };
  var bl = blocks_(me); if (hides_(bl, acc.pseudo)) return { e: "Impossible d'inviter ce membre." };
  return { acc: acc };
}
/** Enregistre visibilité, détails et partenaire. Appelée sous verrou. Renvoie { e } ou { invite: pseudo|null }. */
function sp26SavePlus_(me, item, d, isNew) {
  var dt = sp26Det_(item.sport, d.det);
  if (dt.e) return { e: dt.e };
  var row = sp26PlusRow_(item.id), now = Date.now();
  var vis = d.vis === "public" ? "public" : d.vis === "prive" ? "prive" : (row ? String(row.r[2]) : "prive");
  var prevWith = row ? String(row.r[4] || "") : "", prevSt = row ? String(row.r[5] || "") : "", prevTs = row ? Number(row.r[7]) || 0 : 0;
  var w = prevWith, st = prevSt, invite = null;
  if (d.with !== undefined) {
    var want = String(d.with || "").replace(/^@/, "").trim();
    if (!want) { w = ""; st = ""; }
    else if (sp26Lc_(want) !== sp26Lc_(prevWith)) {
      var f = sp26Friend_(me.pseudo, want); if (f.e) return { e: f.e };
      w = f.acc.pseudo; st = "invité"; prevTs = 0; invite = f.acc.pseudo;
    }
  }
  var det = d.det === undefined && row ? jsonSafe_(row.r[3]) : dt.det;
  var vals = [String(item.id), me.pseudo, vis, JSON.stringify(det), w, st, now, prevTs];
  if (row) sp26ShPlus_().getRange(row.i, 1, 1, 8).setValues([vals]);
  else sp26ShPlus_().appendRow(vals);
  return { invite: invite, vis: vis, det: det, with: w, wst: st };
}

/* ===================== Points de ligue ===================== */
/** +100 pts une fois par jour (compteur commun avec « Poster ma séance »). Appelée sous verrou. */
function sp26Award_(pseudo, key) {
  var today = sp8Day_(), p = sp26Lc_(pseudo), n = 0, dup = false;
  rowsOf_(sp8ShPoints_()).forEach(function (r) {
    if (sp26Lc_(r[1]) !== p) return;
    if (String(r[3]) === key) dup = true;
    if (r[2] === "seance" && String(r[5]) === today) n++;
  });
  if (dup) return { points: 0, capped: false, dup: true };
  if (n >= SP8.SEANCE_PER_DAY) return { points: 0, capped: true };
  sp8ShPoints_().appendRow([Date.now(), pseudo, "seance", key, SP8.SEANCE_POINTS, today]);
  sp26DropCaches_();
  return { points: SP8.SEANCE_POINTS, capped: false };
}
function sp26DropCaches_() { var c = CacheService.getScriptCache(); ["sp8:act", "sp26:act", "sp8:meta", "stats:all"].forEach(function (k) { c.remove(k); }); }
/** Points des séances encore valides (séance existante, non retirée ; invité toujours confirmé). */
function sp26ActMap_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp26:act");
  if (hit) return jsonSafe_(hit);
  var rows = rowsOf_(sp8ShPoints_()).filter(function (r) { return String(r[3]).indexOf("e:") === 0; }), map = {};
  if (rows.length) {
    var ids = {}, hid = hidden_();
    sp26All_().forEach(function (t) { ids[t.id] = t; });
    rows.forEach(function (r) {
      var key = String(r[3]).slice(2), guest = /:g$/.test(key), id = guest ? key.slice(0, -2) : key, t = ids[id];
      if (!t || hid["entrainement:" + id]) return;
      if (guest ? !(t.wst === "accepté" && sp26Lc_(t.with) === sp26Lc_(r[1])) : sp26Lc_(t.owner) !== sp26Lc_(r[1])) return;
      var k = sp26Lc_(r[1]), o = map[k] = map[k] || { points: 0, n: 0 };
      o.points += Number(r[4]) || 0; o.n++;
    });
  }
  try { c.put("sp26:act", JSON.stringify(map), 120); } catch (x) {}
  return map;
}

/* ===================== Actions : séances ===================== */
function sp26AfterSave_(data, res) {
  var me = sessionUser_(data.token);
  if (!me || !res || res.status !== "success" || !res.item) return res;
  var out = sp8Locked_(function () {
    var it = res.item, ex = res.dup ? sp26PlusRow_(it.id) : null;
    var sv = ex ? { vis: String(ex.r[2]) === "public" ? "public" : "prive", det: jsonSafe_(ex.r[3]), with: String(ex.r[4] || ""), wst: String(ex.r[5] || "") }   // renvoi : déjà enregistrée
                : sp26SavePlus_(me, it, { det: data.det, vis: data.vis, with: data.with }, true);
    if (sv.e) return { e: sv.e };
    var aw = it.dur >= SP26.MIN_POINTS_S ? sp26Award_(me.pseudo, "e:" + it.id) : { points: 0 };
    if (sv.invite) sp26Invite_(me, it, sv.invite);
    return { sv: sv, aw: aw };
  });
  if (out.e) { res.warning = out.e; return res; }
  res.item.vis = out.sv.vis; res.item.det = out.sv.det; res.item.with = out.sv.with; res.item.wst = out.sv.wst;
  res.points = out.aw.points || 0; res.capped = !!out.aw.capped;
  return res;
}
function sp26Invite_(me, it, who) {
  try { sp14Queue_([who], { title: "Séance à deux", body: String(me.pseudo) + " t'a ajouté à sa séance de " + it.sport + ". Tu confirmes ?", url: "./#duo", subject: "duo:" + it.id }, { except: me.pseudo }); } catch (x) {}
}

function sp26Update_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(d.id || "");
  return sp8Locked_(function () {
    var sh = sp23Sh_(), v = sh.getDataRange().getValues(), p = sp26Lc_(me.pseudo), at = -1;
    for (var i = 1; i < v.length; i++) if (String(v[i][0]) === id) { at = i; break; }
    if (at < 0) return err_("Séance introuvable.");
    if (sp26Lc_(v[at][1]) !== p) return err_("Seul l'auteur peut modifier cette séance.");
    var row = v[at].slice();
    if (d.dur !== undefined) { var du = Math.round(Number(d.dur) || 0); if (!(du >= 60 && du <= 12 * 3600)) return err_("Durée entre 1 minute et 12 heures."); row[4] = du; }
    if (d.km !== undefined) { if (d.km === null || d.km === "") row[5] = ""; else { var km = sp26Num_(d.km, 0, 500); if (km === null) return err_("Distance invalide."); row[5] = km; } }
    if (d.feel !== undefined) { var fe = sp26Int_(d.feel, 1, 5); row[6] = fe === null ? "" : fe; }
    if (d.note !== undefined) row[7] = safe_(String(d.note || "").replace(/[\\u0000-\\u001f]/g, " ").trim().slice(0, 200));
    if (d.start !== undefined) { var s = Math.floor(Number(d.start) || 0); if (!(s > Date.now() - 400 * 864e5 && s < Date.now() + 6e5)) return err_("Date invalide."); row[3] = s; }
    var it = sp23Row_(row), sv = sp26SavePlus_(me, it, { det: d.det, vis: d.vis, with: d.with }, false);
    if (sv.e) return err_(sv.e);
    sh.getRange(at + 1, 1, 1, row.length).setValues([row]);
    if (sv.invite) sp26Invite_(me, it, sv.invite);
    var aw = it.dur >= SP26.MIN_POINTS_S ? sp26Award_(me.pseudo, "e:" + it.id) : { points: 0 };
    sp26DropCaches_();
    it.vis = sv.vis; it.det = sv.det; it.with = sv.with; it.wst = sv.wst;
    return { status: "success", item: it, points: aw.points || 0 };
  });
}

/** Le partenaire confirme (accept=true) ou refuse / se retire (accept=false). */
function sp26DuoRespond_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(d.id || "");
  return sp8Locked_(function () {
    var row = sp26PlusRow_(id);
    if (!row || sp26Lc_(row.r[4]) !== sp26Lc_(me.pseudo)) return err_("Invitation introuvable.");
    var st = String(row.r[5]), ok = d.accept === true;
    if (ok && st !== "invité") return err_(st === "accepté" ? "Déjà confirmée." : "Invitation expirée.");
    sp26ShPlus_().getRange(row.i, 6, 1, 3).setValues([[ok ? "accepté" : "refusé", Date.now(), Date.now()]]);
    var it = null; sp26All_().forEach(function (t) { if (t.id === id) it = t; });
    var aw = { points: 0 };
    if (ok && it && it.dur >= SP26.MIN_POINTS_S) aw = sp26Award_(me.pseudo, "e:" + id + ":g");
    sp26DropCaches_();
    if (ok && it) { try { sp14Queue_([it.owner], { title: "Séance à deux confirmée", body: String(me.pseudo) + " a confirmé votre séance de " + it.sport + ".", url: "./#profil", subject: "duo-ok:" + id }, { except: me.pseudo }); } catch (x) {} }
    return { status: "success", accepted: ok, points: aw.points || 0, capped: !!aw.capped };
  });
}

/** Liste de mes séances (base) enrichie : détails, visibilité, partenaire ; + séances où je suis l'invité confirmé. */
function sp26ListMerge_(data, res) {
  if (!res || res.status !== "success" || !Array.isArray(res.items)) return res;
  var me = sessionUser_(data.token); if (!me) return res;
  var p = sp26Lc_(me.pseudo), all = sp26All_(), by = {}, nm = nameMap_(), hid = hidden_();
  all.forEach(function (t) { by[t.id] = t; });
  res.items.forEach(function (x) {
    var t = by[x.id]; if (!t) return;
    x.vis = t.vis; x.det = t.det; x.with = t.with; x.wst = t.wst;
    if (hid["entrainement:" + x.id]) x.hidden = 1;
  });
  var invites = [];
  all.forEach(function (t) {
    if (sp26Lc_(t.with) !== p || sp26Lc_(t.owner) === p || isBanned_(t.owner)) return;
    if (t.wst === "accepté") { var g = sp26Public_(t, nm); g.guest = 1; res.items.push(g); }
    else if (t.wst === "invité" && Date.now() - t.start < 30 * 864e5) invites.push(sp26Public_(t, nm));
  });
  res.items.sort(function (a, b) { return b.start - a.start; });
  res.invites = invites;
  return res;
}

/* ===================== Accès aux profils ===================== */
/** Le visiteur peut-il voir les séances de ce membre ? */
function sp26CanSee_(viewer, owner) {
  var v = sp26Lc_(viewer), o = sp26Lc_(owner);
  if (v === o) return true;
  if (isBanned_(o)) return false;
  if (hides_(blocks_(viewer), owner)) return false;
  if (sp8PrivateSet_()[o] && sp8FriendState_(viewer)[o] !== "ami") return false;
  return true;
}
function sp26Profile_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var acc = findAccount_(sp8Pseudo_(d.pseudo) || me.pseudo);
  if (!acc) return err_("Membre introuvable.");
  var mine = sp26Lc_(acc.pseudo) === sp26Lc_(me.pseudo), out = { status: "success", pseudo: acc.pseudo, mine: mine };
  if (!mine && hides_(blocks_(me.pseudo), acc.pseudo)) return err_("Profil indisponible.");
  out.note = sp26NoteSummary_(acc.pseudo, mine);
  if (!sp26CanSee_(me.pseudo, acc.pseudo)) { out.private = true; return out; }
  var p = sp26Lc_(acc.pseudo), nm = nameMap_(), hid = hidden_(), bl = blocks_(me.pseudo), all = sp26All_(), list = [], own = [];
  all.forEach(function (t) {
    if (hid["entrainement:" + t.id]) return;
    var isOwner = sp26Lc_(t.owner) === p, isGuest = t.wst === "accepté" && sp26Lc_(t.with) === p;
    if (!isOwner && !isGuest) return;
    if (isOwner) own.push(t);
    var visible = t.vis === "public" || (mine && isOwner);
    if (isGuest && (t.vis !== "public" || hides_(bl, t.owner) || isBanned_(t.owner))) visible = mine && t.vis === "public";
    if (!visible) return;
    var o = sp26Public_(t, nm); if (isGuest) o.guest = 1; if (t.vis !== "public") o.vis = "prive";
    list.push(o);
  });
  list.sort(function (a, b) { return b.start - a.start; });
  out.total = list.length;
  out.seances = list.slice(0, SP26.LIST_PUBLIC);
  out.palmares = sp26Palmares_(own.filter(function (t) { return mine || t.vis === "public"; }), all, p, mine);
  return out;
}
function sp26Seance_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var id = String(d.id || ""), t = null, nm = nameMap_();
  sp26All_().forEach(function (x) { if (x.id === id) t = x; });
  if (!t) return err_("Séance introuvable.");
  var p = sp26Lc_(me.pseudo), mine = sp26Lc_(t.owner) === p, guest = sp26Lc_(t.with) === p && (t.wst === "accepté" || t.wst === "invité");
  if (!mine && !guest) {
    if (t.vis !== "public" || hidden_()["entrainement:" + id] || !sp26CanSee_(me.pseudo, t.owner)) return err_("Cette séance n'est pas visible.");
  }
  var o = sp26Public_(t, nm);
  if (mine) { o.note = t.note; o.feel = t.feel; o.source = t.source; o.with = t.with; o.wst = t.wst; o.vis = t.vis; o.mine = 1; }
  if (guest) { o.wst = t.wst; o.guest = 1; }
  return { status: "success", item: o };
}

/** Signaler une séance publique (même circuit que les autres signalements : onglet Signalements). */
function sp26Report_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(d.id || ""), t = null;
  sp26All_().forEach(function (x) { if (x.id === id) t = x; });
  if (!t || t.vis !== "public") return err_("Contenu introuvable.");
  if (sp26Lc_(t.owner) === sp26Lc_(me.pseudo)) return err_("Vous ne pouvez pas signaler votre propre contenu.");
  var reason = String(d.reason || ""); if (REPORT_REASONS.indexOf(reason) < 0) return err_("Choisissez un motif.");
  if (d.goodFaith === false) return err_("Cochez la case de bonne foi pour envoyer le signalement.");
  var lim = rate_("rep:" + me.pseudo, 15, 3600, "Trop de signalements en peu de temps."); if (lim) return err_(lim);
  var sh = shReports_(), rows = sh.getDataRange().getValues(), mine = sp26Lc_(me.pseudo);
  for (var i = 1; i < rows.length; i++) if (sp26Lc_(rows[i][2]) === mine && String(rows[i][3]) === "entrainement" && String(rows[i][4]) === id) return { status: "success", already: true };
  var now = Date.now(), ext = t.sport + " · " + JSON.stringify(t.det || {}).slice(0, 250);
  sh.appendRow([now * 1000 + Math.floor(Math.random() * 1000), now, me.pseudo, "entrainement", id, t.owner, reason, safe_(clip_(d.details, 300)), safe_(ext), "nouveau", ""]);
  CacheService.getScriptCache().remove("hid:all");
  return { status: "success" };
}

/* ===================== Palmarès ===================== */
function sp26Fmt_(n, d) { return String(Math.round(n * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).replace(".", ","); }
function sp26Dur_(s) { var m = Math.round(s / 60); return m < 60 ? m + " min" : Math.floor(m / 60) + " h" + (m % 60 ? " " + ("0" + (m % 60)).slice(-2) : ""); }
function sp26Pace_(secPerKm) { var m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60); if (s === 60) { m++; s = 0; } return m + "'" + ("0" + s).slice(-2) + "\\""; }
function sp26Lap_(ms) { var s = ms / 1000, m = Math.floor(s / 60), r = s - m * 60; return (m ? m + ":" + (r < 10 ? "0" : "") : "") + r.toFixed(3).replace(".", ",") + (m ? "" : " s"); }
function sp26Rec_(best, label, val, t, score, better) {
  var cur = best[label];
  if (!cur || (better === "low" ? score < cur.score : score > cur.score)) best[label] = { l: label, v: val, score: score, d: t.start, id: t.id, priv: t.vis !== "public" ? 1 : 0 };
}
/** Meilleures performances par sport, calculées à partir des séances (auteur) ; ligue et séances à deux en plus. */
function sp26Palmares_(own, all, p, mine) {
  var by = {};
  own.forEach(function (t) {
    var s = by[t.sport] = by[t.sport] || { sport: t.sport, n: 0, sec: 0, km: 0, best: {}, ex: {}, wins: 0, losses: 0, draws: 0, goals: 0 };
    s.n++; s.sec += t.dur; if (t.km) s.km += Number(t.km);
    sp26Rec_(s.best, "Plus longue séance", sp26Dur_(t.dur), t, t.dur);
    var det = t.det || {}, k = det.k || SP26.KIND[t.sport] || "libre", km = Number(t.km) || 0;
    if (k === "endu" && km > 0) {
      sp26Rec_(s.best, "Plus longue distance", sp26Fmt_(km, 2) + " km", t, km);
      if (t.sport === "Cyclisme" && km >= 10) { var v = km / (t.dur / 3600); sp26Rec_(s.best, "Meilleure vitesse moyenne", sp26Fmt_(v, 1) + " km/h", t, v); }
      else if (t.sport === "Natation" && km >= 0.4) { var p100 = t.dur / (km * 10); sp26Rec_(s.best, "Meilleure allure", sp26Pace_(p100) + " /100 m", t, p100, "low"); }
      else if (km >= 3 && t.sport !== "Cyclisme" && t.sport !== "Natation") { var pk = t.dur / km; sp26Rec_(s.best, "Meilleure allure", sp26Pace_(pk) + " /km", t, pk, "low"); }
      if (det.dplus) sp26Rec_(s.best, "Plus gros dénivelé", det.dplus + " m D+", t, det.dplus);
    }
    if (k === "force") {
      var vol = 0;
      (det.ex || []).forEach(function (e) {
        var key = e.n.toLowerCase().replace(/\\s+/g, " ").trim();
        (e.s || []).forEach(function (x) {
          if (x.kg) { var cur = s.ex[key]; if (!cur || x.kg > cur.kg || (x.kg === cur.kg && (x.r || 0) > (cur.r || 0))) s.ex[key] = { n: e.n, kg: x.kg, r: x.r || 0, d: t.start, id: t.id, priv: t.vis !== "public" ? 1 : 0 }; }
          vol += (x.r || 0) * (x.kg || 0);
        });
      });
      if (vol > 0) sp26Rec_(s.best, "Plus gros volume", sp26Fmt_(vol, 0) + " kg soulevés", t, vol);
    }
    if (k === "circuit" && det.tours) sp26Rec_(s.best, "Plus de tours de circuit", det.tours + " tours", t, det.tours);
    if ((k === "co" || k === "raq") && det.type === "match") {
      var r = det.res || (k === "co" && det.nous != null ? (det.nous > det.eux ? "v" : det.nous < det.eux ? "d" : "n") : "");
      if (r === "v") s.wins++; else if (r === "d") s.losses++; else if (r === "n") s.draws++;
    }
    if (k === "co" && det.buts) { s.goals += det.buts; sp26Rec_(s.best, t.sport === "Basketball" || t.sport === "Volley-ball" ? "Record de points" : t.sport === "Rugby" ? "Record d'essais" : "Record de buts", det.buts + " en une séance", t, det.buts); }
    if (k === "grimpe") (det.voies || []).forEach(function (vv) {
      if (vv.r === "essai") return;
      var gi = SP26.GRADES.indexOf(vv.c); sp26Rec_(s.best, vv.t === "voie" ? "Meilleure voie" : "Meilleur bloc", vv.c + (vv.r === "flash" ? " (flash)" : ""), t, gi + (vv.r === "flash" ? 0.5 : 0));
    });
    if (k === "golf" && det.coups) {
      var lab = det.trous === 9 ? "Meilleur score 9 trous" : "Meilleur score 18 trous", diff = det.par ? det.coups - det.par : null;
      sp26Rec_(s.best, lab, det.coups + " coups" + (diff !== null ? " (" + (diff > 0 ? "+" : "") + diff + ")" : ""), t, det.coups, "low");
    }
    if (k === "kart" && det.best) sp26Rec_(s.best, "kart:" + det.c + (det.c === "autre" ? ":" + (det.lieu || "") : ""), sp26Lap_(det.best), t, det.best, "low");
    if (k === "paint" && det.manches) { s.wins += det.gagnees || 0; s.losses += det.manches - (det.gagnees || 0); }
    if (k === "combat" && det.rounds) sp26Rec_(s.best, "Plus de rounds", det.rounds + " rounds", t, det.rounds);
  });
  // Séances à deux confirmées où ce membre était invité : comptées dans le volume.
  all.forEach(function (t) {
    if (t.wst !== "accepté" || sp26Lc_(t.with) !== p || (!mine && t.vis !== "public")) return;
    var s = by[t.sport] = by[t.sport] || { sport: t.sport, n: 0, sec: 0, km: 0, best: {}, ex: {}, wins: 0, losses: 0, draws: 0, goals: 0 };
    s.n++; s.sec += t.dur;
  });
  var out = Object.keys(by).map(function (k) {
    var s = by[k], recs = Object.keys(s.best).map(function (x) { return s.best[x]; });
    recs.forEach(function (r) { if (r.l.indexOf("kart:") === 0) { var q = r.l.split(":"); r.circuit = q[1]; if (q[2]) r.lieu = q[2]; r.l = "Meilleur tour"; } delete r.score; });
    var lifts = Object.keys(s.ex).map(function (x) { return s.ex[x]; }).sort(function (a, b) { return b.kg - a.kg; }).slice(0, 6)
      .map(function (e) { return { l: e.n, v: sp26Fmt_(e.kg, 1) + " kg" + (e.r ? " × " + e.r : ""), d: e.d, id: e.id, priv: e.priv, lift: 1 }; });
    var o = { sport: s.sport, n: s.n, sec: s.sec, recs: lifts.concat(recs) };
    if (s.km) o.km = Math.round(s.km * 10) / 10;
    if (s.wins || s.losses || s.draws) o.wld = [s.wins, s.draws, s.losses];
    if (s.goals) o.goals = s.goals;
    return o;
  });
  out.sort(function (a, b) { return b.n - a.n || b.sec - a.sec; });
  return out;
}

/* ===================== Karting ===================== */
function sp26Kart_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var c = sp26Pick_(d.c, SP26.KART); if (!c || c === "autre") return err_("Circuit inconnu.");
  var p = sp26Lc_(me.pseudo), hid = hidden_(), bl = blocks_(me.pseudo), priv = sp8PrivateSet_(), fr = sp8FriendState_(me.pseudo), nm = nameMap_();
  var best = {}, hist = [];
  sp26All_().forEach(function (t) {
    var det = t.det || {}; if (det.k !== "kart" || det.c !== c || !det.best) return;
    var o = sp26Lc_(t.owner);
    if (o === p) hist.push({ id: t.id, start: t.start, best: det.best, tours: det.tours || 0, type: det.type, laps: (det.laps || []).length, vis: t.vis });
    if (hid["entrainement:" + t.id] || isBanned_(o)) return;
    if (o !== p && (t.vis !== "public" || hides_(bl, t.owner) || (priv[o] && fr[o] !== "ami"))) return;
    if (o === p && t.vis !== "public") return;
    if (!best[o] || det.best < best[o].best) best[o] = { pseudo: (nm[o] || {}).pseudo || t.owner, name: (nm[o] || {}).name || "", best: det.best, start: t.start, id: t.id };
  });
  var board = Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b) { return a.best - b.best; });
  var rank = 0; board.forEach(function (x, i) { if (sp26Lc_(x.pseudo) === p) rank = i + 1; });
  hist.sort(function (a, b) { return b.start - a.start; });
  return { status: "success", c: c, board: board.slice(0, 10), total: board.length, rank: rank, hist: hist.slice(0, 50) };
}

/* ===================== Notes des joueurs ===================== */
function sp26AccountAges_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp26:age"); if (hit) return jsonSafe_(hit);
  var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), o = {};
  for (var i = 1; i < rows.length; i++) { var t = new Date(rows[i][0]).getTime(); if (rows[i][6]) o[sp26Lc_(rows[i][6])] = isNaN(t) ? 0 : t; }
  try { c.put("sp26:age", JSON.stringify(o), 600); } catch (x) {}
  return o;
}
/** Événements que je peux noter : séances à deux confirmées et matchs confirmés de moins de 7 jours. */
function sp26Events_(me) {
  var p = sp26Lc_(me), since = Date.now() - SP26.NOTE_DAYS * 864e5, ev = [];
  sp26All_().forEach(function (t) {
    if (t.wst !== "accepté" || !t.with) return;
    var when = Math.max(t.start, t.wts || 0); if (when < since || t.start > Date.now()) return;
    if (sp26Lc_(t.owner) === p) ev.push({ src: "duo", ref: t.id, who: t.with, sport: t.sport, when: t.start });
    else if (sp26Lc_(t.with) === p) ev.push({ src: "duo", ref: t.id, who: t.owner, sport: t.sport, when: t.start });
  });
  rowsOf_(shMatchs_()).forEach(function (r) {
    if (r[7] !== "confirmé") return;
    var when = Number(r[8]) || Number(r[1]); if (when < since) return;
    var a = String(r[2]), b = String(r[3]);
    if (sp26Lc_(a) === p) ev.push({ src: "match", ref: String(r[0]), who: b, sport: String(r[4]), when: Number(r[1]) });
    else if (sp26Lc_(b) === p) ev.push({ src: "match", ref: String(r[0]), who: a, sport: String(r[4]), when: Number(r[1]) });
  });
  return ev;
}
function sp26NotePending_(me) {
  var p = sp26Lc_(me), done = {}, bl = blocks_(me), nm = nameMap_();
  rowsOf_(sp26ShNotes_()).forEach(function (r) { if (sp26Lc_(r[4]) === p) done[r[2] + "|" + r[3] + "|" + sp26Lc_(r[5])] = 1; });
  return sp26Events_(me).filter(function (e) { return !done[e.src + "|" + e.ref + "|" + sp26Lc_(e.who)] && !hides_(bl, e.who) && nm[sp26Lc_(e.who)]; })
    .map(function (e) { var a = nm[sp26Lc_(e.who)]; e.who = a.pseudo; e.name = a.name; return e; })
    .sort(function (a, b) { return b.when - a.when; }).slice(0, 8);
}
function sp26NoteSubmit_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var lim = rate_("note:" + me.pseudo, 30, 3600, "Trop de notes en peu de temps. Réessaie plus tard."); if (lim) return err_(lim);
  var src = d.src === "match" ? "match" : "duo", ref = String(d.ref || ""), target = sp26Lc_(d.target), skip = d.skip === true;
  var ev = sp26Events_(me.pseudo).filter(function (e) { return e.src === src && e.ref === ref && sp26Lc_(e.who) === target; })[0];
  if (!ev) return err_("Tu ne peux pas (ou plus) noter ce joueur pour cette séance.");
  if (hides_(blocks_(me.pseudo), ev.who)) return err_("Impossible de noter ce membre.");
  var stars = skip ? 0 : sp26Int_(d.stars, 1, 5);
  if (!skip && !stars) return err_("Choisis une note de 1 à 5 étoiles.");
  var tags = (Array.isArray(d.tags) ? d.tags : []).filter(function (x, i, a) { return a.indexOf(x) === i && (SP26.POS_TAGS.indexOf(x) >= 0 || SP26.NEG_TAGS.indexOf(x) >= 0); }).slice(0, 4);
  if (!skip) {
    var neg = tags.filter(function (x) { return SP26.NEG_TAGS.indexOf(x) >= 0; });
    if (stars <= 2 && !neg.length) return err_("Pour une note basse, choisis ce qui n'a pas été.");
    if (stars >= 4) tags = tags.filter(function (x) { return SP26.NEG_TAGS.indexOf(x) < 0; });
  }
  return sp8Locked_(function () {
    var sh = sp26ShNotes_(), p = sp26Lc_(me.pseudo), dup = false;
    rowsOf_(sh).forEach(function (r) { if (sp26Lc_(r[4]) === p && r[2] === src && String(r[3]) === ref && sp26Lc_(r[5]) === target) dup = true; });
    if (dup) return err_("Tu as déjà noté ce joueur pour cette séance.");
    var now = Date.now();
    sh.appendRow([String(now) + String(Math.floor(Math.random() * 1000)), now, src, ref, me.pseudo, ev.who, stars, tags.join(","), skip ? "ignorée" : ""]);
    CacheService.getScriptCache().remove("sp26:notes");
    return { status: "success" };
  });
}
/** Toutes les notes (avis après séance + notes du lot 16), une voix par personne : sa note la plus récente. */
function sp26NotesAll_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp26:notes"); if (hit) return jsonSafe_(hit);
  var ages = sp26AccountAges_(), votes = {};
  function add(ts, author, target, stars, tags, id, low) {
    var a = sp26Lc_(author), t = sp26Lc_(target);
    if (!a || !t || a === t || !(stars >= 1 && stars <= 5) || isBanned_(a)) return;
    if (ages[a] && ts - ages[a] < SP26.NOTE_MIN_ACCOUNT_DAYS * 864e5) return;     // compte trop récent au moment de la note
    var m = votes[t] = votes[t] || {}, cur = m[a];
    if (!cur || ts > cur.ts) m[a] = { ts: ts, s: stars, tags: tags, id: id || "" };
  }
  try { rowsOf_(sp8ShAvis_()).forEach(function (r) { if (r[6] !== "oui") add(Number(r[0]), r[2], r[3], Number(r[4]), String(r[5] || ""), ""); }); } catch (x) {}
  rowsOf_(sp26ShNotes_()).forEach(function (r) { if (String(r[8]) !== "masquée" && String(r[8]) !== "ignorée") add(Number(r[1]), r[4], r[5], Number(r[6]), String(r[7] || ""), String(r[0])); });
  var out = {};
  Object.keys(votes).forEach(function (t) {
    var m = votes[t], o = { n: 0, sum: 0, dist: [0, 0, 0, 0, 0], tags: {}, neg: {}, low: [] };
    Object.keys(m).forEach(function (a) {
      var v = m[a]; o.n++; o.sum += v.s; o.dist[v.s - 1]++;
      String(v.tags).split(",").forEach(function (x) { if (!x) return; if (SP26.NEG_TAGS.indexOf(x) >= 0) o.neg[x] = (o.neg[x] || 0) + 1; else o.tags[x] = (o.tags[x] || 0) + 1; });
      if (v.s <= 2 && v.id) o.low.push({ id: v.id, ts: v.ts, s: v.s });
    });
    out[t] = o;
  });
  try { c.put("sp26:notes", JSON.stringify(out), 300); } catch (x) {}
  return out;
}
function sp26NoteSummary_(pseudo, mine) {
  var o = sp26NotesAll_()[sp26Lc_(pseudo)], res = { count: 0, min: SP26.NOTE_MIN_RATERS };
  if (!o) return res;
  if (mine) res.raters = o.n;
  if (o.n >= SP26.NOTE_MIN_RATERS) {
    res.avg = Math.round(o.sum / o.n * 10) / 10; res.count = o.n; res.dist = o.dist;
    res.tags = Object.keys(o.tags).map(function (k) { return [k, o.tags[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
    if (mine) { res.neg = Object.keys(o.neg).map(function (k) { return [k, o.neg[k]]; }); res.low = o.low.slice(-5).map(function (x) { return { id: x.id, ts: Math.floor(x.ts / 864e5) * 864e5, s: x.s }; }); }
  }
  return res;
}
function sp26NoteContest_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var id = String(d.id || ""), txt = clip_(d.text, 300);
  if (txt.length < 10) return err_("Explique en quelques mots pourquoi cette note est injuste.");
  var lim = rate_("ncont:" + me.pseudo, 5, 86400, "Tu as déjà envoyé plusieurs contestations aujourd'hui."); if (lim) return err_(lim);
  return sp8Locked_(function () {
    var sh = sp26ShNotes_(), v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][0]) !== id) continue;
      if (sp26Lc_(v[i][5]) !== sp26Lc_(me.pseudo)) return err_("Note introuvable.");
      if (String(v[i][8]) === "contestée") return { status: "success", already: true };
      sh.getRange(i + 1, 9).setValue("contestée");
      sp8ShAppeal_().appendRow([Date.now(), me.pseudo, "note", id, safe_(txt), "nouveau"]);
      return { status: "success" };
    }
    return err_("Note introuvable.");
  });
}

/* ===================== Accueil : invitations et notes à donner ===================== */
function sp26Pending_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var p = sp26Lc_(me.pseudo), nm = nameMap_(), inv = [];
  sp26All_().forEach(function (t) {
    if (t.wst === "invité" && sp26Lc_(t.with) === p && !isBanned_(t.owner) && Date.now() - t.start < 30 * 864e5) inv.push(sp26Public_(t, nm));
  });
  return { status: "success", invites: inv.slice(0, 10), notes: sp26NotePending_(me.pseudo), tags: { pos: SP26.POS_TAGS, neg: SP26.NEG_TAGS } };
}

/* ===================== Test des notifications ===================== */
var SP26_FCM_HINTS = [
  [/THIRD_PARTY_AUTH_ERROR|APNS|apns/i, "Apple refuse la clé de Firebase. Firebase → Paramètres du projet → Cloud Messaging → appli iOS fr.spary.app : redéposer la clé APNs (.p8) avec le bon Key ID et le Team ID A5YKNV3373."],
  [/SENDER_ID_MISMATCH/i, "Le jeton de l'iPhone vient d'un autre projet Firebase que le compte de service (FCM_SERVICE_ACCOUNT)."],
  [/UNREGISTERED|NOT_FOUND|registration token/i, "Jeton périmé (appli réinstallée ou notifications coupées) : rouvre l'appli, il sera renouvelé."],
  [/INVALID_ARGUMENT/i, "Jeton invalide : rouvre l'appli pour en obtenir un nouveau."],
  [/PERMISSION_DENIED|403/i, "Le compte de service n'a pas le droit d'envoyer : vérifie qu'il appartient au projet spary-d810a et que l'API Firebase Cloud Messaging est activée."],
  [/jeton refusé|invalid_grant/i, "La clé du compte de service est refusée par Google : regénère-la dans Firebase et recolle le JSON dans FCM_SERVICE_ACCOUNT."]
];
function sp26Hint_(txt) { for (var i = 0; i < SP26_FCM_HINTS.length; i++) if (SP26_FCM_HINTS[i][0].test(txt)) return SP26_FCM_HINTS[i][1]; return ""; }
function sp26PushTest_(pseudo) {
  var subs = rowsOf_(sp8ShPush_()).filter(function (r) { return sp26Lc_(r[1]) === sp26Lc_(pseudo); }), res = [];
  var sa = sp16Account_(), body = "Si tu vois ce message, les notifications marchent sur cet appareil.";
  if (subs.length) sp14ShFile_().appendRow([Date.now(), subs[0][1], "Test Spary", body, "./", "test"]);
  subs.forEach(function (r) {
    var ep = String(r[2]), o = { kind: ep.indexOf(SP16.PREFIX) === 0 ? "appli" : "web", since: Number(r[0]) || 0, plat: ep.indexOf(SP16.PREFIX) === 0 ? String(r[3] || "") : "" };
    try {
      if (o.kind === "appli") {
        if (!sa) { o.code = 0; o.err = "FCM_SERVICE_ACCOUNT absente"; o.hint = "Ajoute la Script Property FCM_SERVICE_ACCOUNT (JSON du compte de service Firebase)."; res.push(o); return; }
        var at = sp16Token_(sa), url = "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(sa.project_id) + "/messages:send";
        var rr = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", muteHttpExceptions: true, headers: { Authorization: "Bearer " + at },
          payload: JSON.stringify({ message: { token: ep.slice(SP16.PREFIX.length), notification: { title: "Test Spary", body: body }, data: { url: "./" },
            apns: { headers: { "apns-priority": "10", "apns-push-type": "alert" }, payload: { aps: { sound: "default" } } }, android: { priority: "high", notification: { sound: "default" } } } }) });
        o.code = rr.getResponseCode(); var t = String(rr.getContentText());
        if (o.code >= 300) { o.err = t.slice(0, 300); o.hint = sp26Hint_(t + " " + o.code); }
      } else {
        var aud = ep.match(/^https:\\/\\/[^\\/]+/)[0], keys = sp14Keys_();
        var wr = UrlFetchApp.fetch(ep, { method: "post", muteHttpExceptions: true, followRedirects: false, headers: { TTL: "600", Urgency: "high", Authorization: "vapid t=" + sp14Jwt_(aud, keys) + ", k=" + keys.pub } });
        o.code = wr.getResponseCode(); if (o.code >= 300) { o.err = String(wr.getContentText()).slice(0, 200); o.hint = o.code === 404 || o.code === 410 ? "Abonnement expiré : désactive puis réactive les notifications." : ""; }
        o.host = aud.replace(/^https:\\/\\//, "");
      }
    } catch (e) { o.code = 0; o.err = String(e && e.message || e).slice(0, 300); o.hint = sp26Hint_(o.err); }
    res.push(o);
  });
  return { status: "success", devices: res, fcm: !!sa };
}
/** Depuis l'éditeur : sp26TesterPush("pseudo") affiche le diagnostic complet. */
function sp26TesterPush(pseudo) {
  var r = sp26PushTest_(String(pseudo || "").trim());
  console.log("Firebase configuré : " + (r.fcm ? "oui" : "NON") + " | appareils : " + r.devices.length);
  r.devices.forEach(function (o) { console.log(o.kind + (o.plat ? " (" + o.plat + ")" : "") + " → " + o.code + (o.err ? " " + o.err : " (accepté)") + (o.hint ? "\\n   ⇒ " + o.hint : "")); });
  if (!r.devices.length) console.log("Aucun appareil enregistré pour ce membre : ouvre l'appli, Profil → Compte et données → Tester les notifications.");
}

/* ===================== RGPD ===================== */
function sp26DeleteUser_(pseudo) {
  var p = sp26Lc_(pseudo);
  rewriteRows_(sp26ShPlus_(), function (r) {
    if (sp26Lc_(r[1]) === p) return null;
    if (sp26Lc_(r[4]) === p) { var c = r.slice(); c[4] = ""; c[5] = ""; return c; }
    return r;
  });
  rewriteRows_(sp26ShNotes_(), function (r) { return sp26Lc_(r[4]) === p || sp26Lc_(r[5]) === p ? null : r; });
  CacheService.getScriptCache().remove("sp26:notes");
}
function sp26Export_(pseudo, out) {
  var p = sp26Lc_(pseudo), plus = {};
  rowsOf_(sp26ShPlus_()).forEach(function (r) { if (sp26Lc_(r[1]) === p) plus[String(r[0])] = { visibilite: String(r[2]), details: jsonSafe_(r[3]), partenaire: String(r[4] || ""), statut_partenaire: String(r[5] || "") }; });
  out.seances_details = plus;
  out.seances_invite = rowsOf_(sp26ShPlus_()).filter(function (r) { return sp26Lc_(r[4]) === p; }).map(function (r) { return { seance: String(r[0]), auteur: String(r[1]), statut: String(r[5]) }; });
  out.notes_donnees = rowsOf_(sp26ShNotes_()).filter(function (r) { return sp26Lc_(r[4]) === p; }).map(function (r) { return { date: new Date(Number(r[1])).toISOString(), source: r[2], membre: String(r[5]), note: Number(r[6]) || null, qualites: String(r[7] || ""), statut: String(r[8] || "") }; });
  var s = sp26NoteSummary_(pseudo, true);
  out.notes_recues = { personnes: s.raters || 0, moyenne: s.avg || null, repartition_1_a_5: s.dist || null };
}

/* ===================== Installation ===================== */
function sp26Install_() {
  if (SP26.installed || typeof doPost !== "function" || typeof SP8 === "undefined" || !SP8.installed || typeof SP23 === "undefined" || !SP23.installed) return;
  SP26.installed = true;
  SP26.NEW_SPORTS.forEach(function (s) { if (SP23.SPORTS.indexOf(s) < 0) SP23.SPORTS.splice(SP23.SPORTS.length - 1, 0, s); });

  var prev = doPost;
  var handle = function (e, data) {
    switch (data.action) {
      case "trainSave":   return out_(sp26AfterSave_(data, sp8Parse_(prev(e))));
      case "trainList":   return out_(sp26ListMerge_(data, sp8Parse_(prev(e))));
      case "trainDelete": var dr = sp8Parse_(prev(e));
                          if (dr && dr.status === "success") sp8After_(function () { rewriteRows_(sp26ShPlus_(), function (r) { return String(r[0]) === String(data.id) ? null : r; }); sp26DropCaches_(); });
                          return out_(dr);
      case "trainUpdate": return out_(sp26Update_(data));
      case "duoRespond":  return out_(sp26DuoRespond_(data));
      case "pending16":   return out_(sp26Pending_(data));
      case "profil16":    return out_(sp26Profile_(data));
      case "seance16":    return out_(sp26Seance_(data));
      case "seanceReport": return out_(sp26Report_(data));
      case "kartBoard":   return out_(sp26Kart_(data));
      case "noteSubmit":  return out_(sp26NoteSubmit_(data));
      case "noteContest": return out_(sp26NoteContest_(data));
      case "pushTest":    var me = sessionUser_(data.token); if (!me) return out_(err_("Session expirée."));
                          var lim = rate_("ptest:" + me.pseudo, 8, 3600, "Trop de tests. Réessaie dans une heure."); if (lim) return out_(err_(lim));
                          return out_(sp26PushTest_(me.pseudo));
    }
    return null;
  };
  doPost = function (e) {
    var data = null;
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (!data || !data.action) return prev(e);
    var r = null;
    try { r = handle(e, data); }
    catch (err) {
      var m = String(err && err.message || err);
      try { console.error("sp26 " + m + " | " + (err && err.stack || "")); } catch (x) {}
      r = out_({ status: "error", message: /lock/i.test(m) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
    if (r) { try { sp14Flush_(); } catch (x) {} return r; }
    return prev(e);
  };

  // Points des séances enregistrées ajoutés à ceux des séances postées (classement, profils, récap).
  var baseAct = sp8ActivityMap_;
  sp8ActivityMap_ = function () {
    var base = baseAct(), add = sp26ActMap_(), o = {};
    Object.keys(base).forEach(function (k) { o[k] = { points: base[k].points, n: base[k].n }; });
    Object.keys(add).forEach(function (k) { var x = o[k] = o[k] || { points: 0, n: 0 }; x.points += add[k].points; x.n += add[k].n; });
    return o;
  };
  // Signalements : libellé pour les avis de modération.
  try { if (typeof SP8_TYPE_LABEL !== "undefined") SP8_TYPE_LABEL.entrainement = "séance"; } catch (x) {}

  var baseDelete = deleteAccountData_;
  deleteAccountData_ = function (pseudo) { baseDelete(pseudo); try { sp26DeleteUser_(pseudo); } catch (x) {} };
  var baseExport = accountExport_;
  accountExport_ = function (d) {
    var r = baseExport(d);
    try { if (r && r.status === "success" && r.data && r.data.pseudo) sp26Export_(r.data.pseudo, r.data); } catch (x) {}
    return r;
  };
}
sp26Install_();

/** À exécuter une fois dans l'éditeur pour vérifier l'installation. */
function sp26Verifier() {
  if (!SP26.installed) return console.log("PROBLÈME : le fichier Performances doit être placé SOUS Entrainements (et au-dessus de Rgpd et Securite). sp8Verifier et sp23Verifier doivent afficher OK.");
  sp26ShPlus_(); sp26ShNotes_();
  console.log("OK : séances détaillées, séance à deux, karting, palmarès et notes actifs. Pense à publier une Nouvelle version du déploiement.");
  console.log("Sports ajoutés : " + SP26.NEW_SPORTS.join(", ") + ". Firebase pour l'appli : " + (sp16Account_() ? "prêt" : "FCM_SERVICE_ACCOUNT absente") + ".");
}


;

// ===== 08-Parcours.gs =====
/**
 * Spary : parcours d'inscription, connexion avec Apple, partenaires compatibles, actus sportives, badge vérifié (lot 19, v31).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Parcours », coller ce code.
 * Le placer SOUS Performances et AU-DESSUS de Rgpd et de Securite (Securite reste le dernier fichier).
 * Ne modifier aucun autre fichier (ni Code.gs, ni Nouveautes, ni Entrainements, ni Performances).
 *  1. Exécuter sp28Verifier : le journal doit afficher « OK » (accepter les autorisations, dont « se connecter à un service externe »).
 *  2. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *
 * Ce que ça ajoute :
 *  1. Parcours de première connexion (profil, sports, niveaux, disponibilités) : le profil passe par profileSave (Code.gs),
 *     ce fichier garde seulement l'état du parcours et les sports suivis pour les actus (onglet Parcours).
 *  2. Connexion avec Apple (appli iPhone) : le jeton d'Apple est vérifié ici (signature RSA, émetteur, destinataire,
 *     expiration, nonce à usage unique). Un compte Spary est créé ou retrouvé, puis une session normale est ouverte.
 *     Le lien entre l'identifiant Apple et le pseudo est dans l'onglet ConnexionsApple.
 *     Facultatif, pour révoquer l'accès Apple quand un membre supprime son compte (recommandé par Apple) :
 *     Script Properties APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_P8 (contenu du fichier .p8, clé « Sign in with Apple »).
 *  3. Partenaires compatibles : même sport, niveau proche, créneaux en commun, même tranche d'âge (mineurs entre eux,
 *     majeurs entre eux). Jamais les comptes privés, masqués de la recherche, bloqués ou suspendus.
 *  4. Actus sportives : titres, source, date et lien seulement (flux RSS Google Actualités), mis en cache 30 min par sport.
 *  5. Badge « profil vérifié » : e-mail confirmé (ou compte Apple), photo de profil et au moins un sport.
 *     Spary ne vérifie pas l'identité : le badge le dit clairement dans l'appli.
 *
 * Onglets créés tout seuls :
 *  - Parcours        : membre | données (JSON : fait, sports suivis) | maj (ms)
 *  - ConnexionsApple : identifiant Apple | membre | lié (ms) | e-mail Apple | relais Apple (oui/non) | jeton de révocation
 * Aucun secret dans ce fichier. Écritures sous LockService (sp8Locked_).
 */

var SP28 = {
  installed: false,
  BUNDLE: "fr.spary.app",
  ISS: "https://appleid.apple.com",
  NEWS_TTL: 1800,
  NEWS_STALE: 21600,
  NEWS_PER_SPORT: 8,
  NEWS_MAX: 18,
  PARTNERS: 8,
  VERIF_TTL: 900,
  // Sports proposés pour les actus (clé = nom affiché dans l'appli) → recherche Google Actualités
  NEWS: {
    "Football / Five": "football", "Tennis": "tennis ATP WTA", "Padel": "padel", "Running & Trail": "trail OR marathon OR running",
    "Basketball": "basket NBA OR Betclic Elite", "Badminton": "badminton", "Fitness / Crossfit": "crossfit OR fitness", "Yoga & Pilates": "yoga pilates",
    "Natation": "natation", "Escalade": "escalade", "Cyclisme": "cyclisme", "Golf": "golf", "Volley-ball": "volley-ball", "Rugby": "rugby",
    "Handball": "handball", "Karting": "karting", "Paintball": "paintball", "Musculation": "musculation", "Marche": "marche nordique OR randonnée",
    "Squash": "squash", "Tennis de table": "tennis de table", "Sports de combat": "boxe OR MMA OR judo", "Formule 1": "Formule 1",
    "Athlétisme": "athlétisme", "Ski": "ski alpin OR biathlon", "Sports US": "NFL OR NBA OR NHL"
  }
};

function sp28ShPrefs_() { return sheetH_("Parcours", ["membre", "données (JSON)", "maj (ms)"]); }
function sp28ShApple_() { return sheetH_("ConnexionsApple", ["identifiant Apple", "membre", "lié (ms)", "e-mail Apple", "relais Apple", "jeton de révocation"]); }
function sp28Lc_(s) { return String(s == null ? "" : s).toLowerCase(); }
function sp28Prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ""; }

/* ===================== Parcours ===================== */
function sp28PrefRow_(pseudo) {
  var p = sp28Lc_(pseudo), v = sp28ShPrefs_().getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (sp28Lc_(v[i][0]) === p) return { at: i + 1, data: jsonSafe_(v[i][1]) };
  return null;
}
function sp28CleanFollow_(a) {
  var out = [];
  (Array.isArray(a) ? a : []).forEach(function (s) { s = String(s || ""); if (SP28.NEWS[s] && out.indexOf(s) < 0 && out.length < 12) out.push(s); });
  return out;
}
function sp28OnbGet_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var r = sp28PrefRow_(me.pseudo), crit = sp28Criteria_(me.pseudo);
  return { status: "success", prefs: r ? r.data : null, verified: crit.ok, crit: crit, apple: !!sp28AppleOf_(me.pseudo), news: Object.keys(SP28.NEWS) };
}
function sp28OnbSave_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var lim = rate_("onb:" + sp28Lc_(me.pseudo), 60, 3600, "Trop de modifications. Réessaie plus tard."); if (lim) return err_(lim);
  return sp8Locked_(function () {
    var r = sp28PrefRow_(me.pseudo), cur = r ? r.data : {}, now = Date.now();
    if (d.done) cur.done = cur.done || now;
    if (d.short) cur.short = 1;
    if (d.follow !== undefined) cur.follow = sp28CleanFollow_(d.follow);
    var json = JSON.stringify(cur).slice(0, 4000), sh = sp28ShPrefs_();
    if (r) sh.getRange(r.at, 2, 1, 2).setValues([[json, now]]);
    else sh.appendRow([me.pseudo, json, now]);
    return { status: "success", prefs: cur };
  });
}

/* ===================== Badge vérifié ===================== */
/** Critères du badge pour tous les membres, en cache 15 min : { pseudo en minuscules : 1 }. */
function sp28VerifMap_() {
  var c = CacheService.getScriptCache(), hit = c.get("sp28ver");
  if (hit) return jsonSafe_(hit);
  var mail = {}, photo = {}, sports = {}, out = {};
  rowsOf_(sheet_(SHEET_ACCOUNTS)).forEach(function (r) { if (r[6] && r[12]) mail[sp28Lc_(r[6])] = 1; });
  rowsOf_(sp28ShApple_()).forEach(function (r) { if (r[1]) mail[sp28Lc_(r[1])] = 1; });
  var sh = sheet_(SHEET_PROFILES, true), last = sh.getLastRow();
  if (last >= 1) {
    var ab = sh.getRange(1, 1, last, 3).getValues();
    for (var i = 0; i < ab.length; i++) {
      var k = sp28Lc_(ab[i][0]); if (!k) continue;
      if (String(ab[i][2] || "").length > 100) photo[k] = 1;
      var dd = jsonSafe_(ab[i][1]); if (Array.isArray(dd.sports) && dd.sports.length) sports[k] = 1;
    }
  }
  Object.keys(mail).forEach(function (k) { if (photo[k] && sports[k] && !isBanned_(k)) out[k] = 1; });
  try { c.put("sp28ver", JSON.stringify(out), SP28.VERIF_TTL); } catch (x) {}
  return out;
}
function sp28Criteria_(pseudo) {
  var k = sp28Lc_(pseudo), acc = typeof accountByKey_ === "function" ? accountByKey_(pseudo) : null;
  var pr = profMap_()[k], data = pr ? pr.data : {};
  var o = { mail: !!(acc && acc.verified) || !!sp28AppleOf_(pseudo), photo: !!(pr && String(avatarOf_(pr) || "").length > 100), sports: Array.isArray(data.sports) && data.sports.length > 0 };
  o.ok = o.mail && o.photo && o.sports;
  return o;
}
function sp28Verif_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var map = sp28VerifMap_(), v = {};
  (Array.isArray(d.pseudos) ? d.pseudos : []).slice(0, 80).forEach(function (p) { p = sp28Lc_(p); if (map[p]) v[p] = 1; });
  return { status: "success", v: v };
}

/* ===================== Partenaires compatibles ===================== */
function sp28Slots_(a) {
  var o = {};
  DAYS.forEach(function (day) { (a && Array.isArray(a[day]) ? a[day] : []).forEach(function (s) { if (SLOTS.indexOf(s) >= 0) o[day + " " + s] = 1; }); });
  return o;
}
function sp28Partners_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var lim = rate_("prt:" + sp28Lc_(me.pseudo), 120, 3600, "Trop de requêtes. Réessaie plus tard."); if (lim) return err_(lim);
  var mine = sp28Lc_(me.pseudo), c = CacheService.getScriptCache(), ck = "sp28p:" + mine, hit = c.get(ck);
  if (hit && !d.fresh) return jsonSafe_(hit);
  var profs = profMap_(), myPr = profs[mine], my = myPr ? myPr.data : {};
  var mySports = {}; (my.sports || []).forEach(function (s) { if (s && s.name) mySports[s.name] = LEVELS.indexOf(s.level); });
  if (!Object.keys(mySports).length) return { status: "success", users: [], reason: "sports" };
  var mySlots = sp28Slots_(my.avail), hasSlots = Object.keys(mySlots).length > 0, myCity = norm_(my.city || "");
  // âges et comptes confirmés (Comptes : F = naissance, G = pseudo)
  var ages = {}, nm = {};
  rowsOf_(sheet_(SHEET_ACCOUNTS)).forEach(function (r) { var k = sp28Lc_(r[6]); if (!k) return; ages[k] = age_(r[5]); nm[k] = String(r[2] || ""); });
  var myMinor = (ages[mine] || 0) < 18, blk = blocks_(me.pseudo), priv = typeof sp8PrivateSet_ === "function" ? sp8PrivateSet_() : {};
  var fr = typeof sp8FriendState_ === "function" ? sp8FriendState_(me.pseudo) : {}, ver = sp28VerifMap_(), out = [];
  Object.keys(profs).forEach(function (k) {
    if (k === mine) return;
    var pr = profs[k], dd = pr.data || {};
    if (dd.searchable === false || priv[k] || hides_(blk, k) || ages[k] === undefined) return;
    if (((ages[k] || 0) < 18) !== myMinor) return;           // mineurs entre eux, majeurs entre eux
    if (fr[k] === "amis") return;                              // déjà amis : inutile de les suggérer
    var best = null;
    (dd.sports || []).forEach(function (s) {
      if (!s || !(s.name in mySports)) return;
      var a = mySports[s.name], b = LEVELS.indexOf(s.level), gap = a < 0 || b < 0 ? 1 : Math.abs(a - b);
      if (gap > 1) return;
      var sc = 10 - gap * 3;
      if (!best || sc > best.sc) best = { sc: sc, sport: s.name, level: s.level || "" };
    });
    if (!best) return;
    var theirs = sp28Slots_(dd.avail), common = Object.keys(theirs).filter(function (x) { return mySlots[x]; });
    if (hasSlots && Object.keys(theirs).length && !common.length) return;   // aucun créneau en commun
    var score = best.sc + common.length * 2 + (myCity && norm_(dd.city || "") === myCity ? 4 : 0);
    var st = presence_(pr.pseudo, pr); if (st === "online") score += 1;
    out.push({ pseudo: pr.pseudo, name: shownName_({ name: nm[k] }, pr), sport: best.sport, level: best.level, slots: common.slice(0, 3), city: dd.city || "", ver: ver[k] ? 1 : 0, score: score, v: pr.updated });
  });
  out.sort(function (a, b) { return b.score - a.score; });
  out = out.slice(0, SP28.PARTNERS).map(function (u) { delete u.score; return u; });
  var res = { status: "success", users: out, slots: hasSlots };
  try { c.put(ck, JSON.stringify(res), 600); } catch (x) {}
  return res;
}

/* ===================== Actus sportives ===================== */
function sp28Ent_(s) {
  return String(s || "").replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g, "$1").replace(/<[^>]+>/g, "")
    .replace(/&#(\\d+);/g, function (m, n) { return String.fromCharCode(Number(n)); })
    .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\\s+/g, " ").trim();
}
function sp28Tag_(x, t) { var m = new RegExp("<" + t + "(?:\\\\s[^>]*)?>([\\\\s\\\\S]*?)</" + t + ">", "i").exec(x); return m ? m[1] : ""; }
/** Lit un flux RSS : titres, source, date, lien. Rien d'autre (pas de texte d'article, pas d'image). */
function sp28ParseRss_(xml, sport) {
  var out = [], parts = String(xml || "").split(/<item[\\s>]/i).slice(1);
  parts.forEach(function (x) {
    if (out.length >= SP28.NEWS_PER_SPORT) return;
    var t = sp28Ent_(sp28Tag_(x, "title")), u = sp28Ent_(sp28Tag_(x, "link")), src = sp28Ent_(sp28Tag_(x, "source")), d = Date.parse(sp28Ent_(sp28Tag_(x, "pubDate")));
    if (!t || !/^https:\\/\\/[^\\s"'<>]{8,600}$/.test(u)) return;
    if (src && t.length > src.length + 3 && t.slice(-(src.length + 3)) === " - " + src) t = t.slice(0, -(src.length + 3));
    else if (!src) { var m = / - ([^-]{2,40})$/.exec(t); if (m) { src = m[1]; t = t.slice(0, m.index); } }
    out.push({ s: sport, t: t.slice(0, 180), src: src.slice(0, 40), u: u, d: isFinite(d) ? d : 0 });
  });
  return out;
}
function sp28NewsUrl_(sport) {
  return "https://news.google.com/rss/search?q=" + encodeURIComponent(SP28.NEWS[sport] + " when:7d") + "&hl=fr&gl=FR&ceid=FR:fr";
}
function sp28News_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var lim = rate_("news:" + sp28Lc_(me.pseudo), 120, 3600, "Trop de requêtes. Réessaie plus tard."); if (lim) return err_(lim);
  var sports = sp28CleanFollow_(d.sports).slice(0, 6);
  if (!sports.length) return { status: "success", items: [] };
  var c = CacheService.getScriptCache(), got = {}, miss = [];
  sports.forEach(function (s) { var h = c.get("sp28n1:" + s); if (h) got[s] = jsonSafe_(h).l || []; else miss.push(s); });
  if (miss.length) {
    var reqs = miss.map(function (s) { return { url: sp28NewsUrl_(s), muteHttpExceptions: true, followRedirects: true, headers: { "User-Agent": "Mozilla/5.0 (compatible; Spary/1.0; +https://spary.fr)" } }; });
    var res = [];
    try { res = UrlFetchApp.fetchAll(reqs); } catch (e) { try { console.error("sp28 actus " + e); } catch (x) {} }
    miss.forEach(function (s, i) {
      var r = res[i], list = null;
      try { if (r && r.getResponseCode() === 200) list = sp28ParseRss_(r.getContentText(), s); } catch (e) {}
      if (list && list.length) {
        var js = JSON.stringify({ l: list });
        try { c.put("sp28n1:" + s, js, SP28.NEWS_TTL); c.put("sp28n2:" + s, js, SP28.NEWS_STALE); } catch (x) {}
        got[s] = list;
      } else {
        var st = c.get("sp28n2:" + s); got[s] = st ? jsonSafe_(st).l || [] : [];      // flux indisponible : dernière version connue
      }
    });
  }
  // une actu par sport à tour de rôle (les plus récentes d'abord) pour varier le carrousel
  var lists = sports.map(function (s) { return (got[s] || []).slice().sort(function (a, b) { return b.d - a.d; }); }), items = [], seen = {};
  for (var round = 0; items.length < SP28.NEWS_MAX && round < SP28.NEWS_PER_SPORT; round++) {
    lists.forEach(function (l) { var it = l[round]; if (it && items.length < SP28.NEWS_MAX) { var key = sp28Lc_(it.t).slice(0, 60); if (!seen[key]) { seen[key] = 1; items.push(it); } } });
  }
  return { status: "success", items: items };
}

/* ===================== Connexion avec Apple ===================== */
function sp28Mp_(b, e, m) { var r = BigInt(1); b = b % m; while (e > BigInt(0)) { if (e & BigInt(1)) r = r * b % m; e = e >> BigInt(1); b = b * b % m; } return r; }
function sp28AppleKeys_(force) {
  var c = CacheService.getScriptCache(), hit = force ? null : c.get("sp28jwks");
  if (hit) return jsonSafe_(hit).keys || [];
  var r = UrlFetchApp.fetch("https://appleid.apple.com/auth/keys", { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error("Clés Apple indisponibles");
  var t = r.getContentText(); try { c.put("sp28jwks", t, 21600); } catch (x) {}
  return jsonSafe_(t).keys || [];
}
/** Vérifie un jeton d'identité Apple (RS256). Renvoie les champs du jeton, ou { e: message }. */
function sp28VerifyApple_(jwt, nonce, keysOverride) {
  var parts = String(jwt || "").split(".");
  if (parts.length !== 3) return { e: "Jeton Apple invalide." };
  var head = jsonSafe_(Utilities.newBlob(sp14S8_(sp14UnB64_(parts[0]))).getDataAsString()), body = jsonSafe_(Utilities.newBlob(sp14S8_(sp14UnB64_(parts[1]))).getDataAsString());
  if (head.alg !== "RS256" || !head.kid) return { e: "Jeton Apple invalide." };
  var find = function (keys) { for (var i = 0; i < keys.length; i++) if (keys[i].kid === head.kid && keys[i].kty === "RSA") return keys[i]; return null; };
  var key = keysOverride ? find(keysOverride) : (find(sp28AppleKeys_(false)) || find(sp28AppleKeys_(true)));
  if (!key) return { e: "Clé Apple inconnue." };
  var nb = sp14UnB64_(key.n); while (nb.length && nb[0] === 0) nb.shift();
  var n = sp14Big_(nb), e = sp14Big_(sp14UnB64_(key.e)), s = sp14Big_(sp14UnB64_(parts[2]));
  if (s >= n) return { e: "Signature Apple invalide." };
  var em = sp14Bytes_(sp28Mp_(s, e, n), nb.length);
  var di = [0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20];
  var t = di.concat(sp14Sha_(sp14Utf8_(parts[0] + "." + parts[1]))), ps = nb.length - t.length - 3;
  if (ps < 8) return { e: "Signature Apple invalide." };
  var want = [0, 1]; for (var i = 0; i < ps; i++) want.push(255); want.push(0); want = want.concat(t);
  var diff = 0; for (var j = 0; j < want.length; j++) diff |= (want[j] ^ em[j]);
  if (diff !== 0) return { e: "Signature Apple invalide." };
  var now = Math.floor(Date.now() / 1000), auds = [SP28.BUNDLE], web = sp28Prop_("APPLE_WEB_CLIENT_ID"); if (web) auds.push(web);
  if (body.iss !== SP28.ISS) return { e: "Jeton Apple invalide (émetteur)." };
  if (auds.indexOf(String(body.aud)) < 0) return { e: "Jeton Apple invalide (application)." };
  if (!(Number(body.exp) > now - 60)) return { e: "Jeton Apple expiré : réessaie." };
  if (Number(body.iat) > now + 300) return { e: "Jeton Apple invalide (date)." };
  if (!body.sub) return { e: "Jeton Apple invalide." };
  if (nonce !== null && String(body.nonce || "") !== String(nonce)) return { e: "Jeton Apple invalide (nonce)." };
  return { sub: String(body.sub), aud: String(body.aud), email: sp28Lc_(body.email || ""), verified: body.email_verified === true || body.email_verified === "true", relay: body.is_private_email === true || body.is_private_email === "true" || /@privaterelay\\.appleid\\.com$/i.test(String(body.email || "")) };
}
function sp28Nonce_() {
  var lim = rate_("an:all", 600, 3600, "Beaucoup de connexions en ce moment. Réessaie dans quelques minutes."); if (lim) return err_(lim);
  var n = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  CacheService.getScriptCache().put("sp28nc:" + n, "1", 600);
  return { status: "success", nonce: n };
}
function sp28TakeNonce_(n) {
  n = String(n || ""); if (!/^[a-f0-9]{64}$/.test(n)) return false;
  var c = CacheService.getScriptCache(), k = "sp28nc:" + n; if (!c.get(k)) return false;
  c.remove(k); return true;
}
function sp28AppleRow_(sub) {
  var v = sp28ShApple_().getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === String(sub)) return { at: i + 1, r: v[i] };
  return null;
}
function sp28AppleOf_(pseudo) {
  var p = sp28Lc_(pseudo), v = rowsOf_(sp28ShApple_());
  for (var i = 0; i < v.length; i++) if (sp28Lc_(v[i][1]) === p) return { sub: String(v[i][0]), at: i + 2, r: v[i] };
  return null;
}
/* -- clé facultative pour échanger le code d'autorisation et révoquer l'accès à la suppression du compte -- */
function sp28KeyD_() {
  var pem = sp28Prop_("APPLE_P8"); if (!pem) return null;
  var b = sp14U8_(Utilities.base64Decode(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\\s+/g, "")));
  for (var i = 0; i + 37 <= b.length; i++) if (b[i] === 2 && b[i + 1] === 1 && b[i + 2] === 1 && b[i + 3] === 4 && b[i + 4] === 32) return b.slice(i + 5, i + 37);
  return null;
}
function sp28ClientSecret_(clientId) {
  var team = sp28Prop_("APPLE_TEAM_ID"), kid = sp28Prop_("APPLE_KEY_ID"), d = sp28KeyD_();
  if (!team || !kid || !d) return "";
  var now = Math.floor(Date.now() / 1000);
  var head = sp14B64_(sp14Utf8_(JSON.stringify({ alg: "ES256", kid: kid }))), body = sp14B64_(sp14Utf8_(JSON.stringify({ iss: team, iat: now, exp: now + 3000, aud: SP28.ISS, sub: clientId })));
  return head + "." + body + "." + sp14B64_(SP14_EC.sign(d, sp14Utf8_(head + "." + body)));
}
function sp28Exchange_(code, clientId) {
  try {
    code = String(code || ""); if (!code || code.length > 600) return "";
    var cs = sp28ClientSecret_(clientId); if (!cs) return "";
    var r = UrlFetchApp.fetch(SP28.ISS + "/auth/token", { method: "post", muteHttpExceptions: true, payload: { client_id: clientId, client_secret: cs, code: code, grant_type: "authorization_code" } });
    if (r.getResponseCode() !== 200) { console.warn("Apple token " + r.getResponseCode() + " " + String(r.getContentText()).slice(0, 160)); return ""; }
    return String(jsonSafe_(r.getContentText()).refresh_token || "");
  } catch (e) { return ""; }
}
function sp28Revoke_(rt, clientId) {
  try {
    if (!rt) return;
    var cs = sp28ClientSecret_(clientId || SP28.BUNDLE); if (!cs) return;
    UrlFetchApp.fetch(SP28.ISS + "/auth/revoke", { method: "post", muteHttpExceptions: true, payload: { client_id: clientId || SP28.BUNDLE, client_secret: cs, token: rt, token_type_hint: "refresh_token" } });
  } catch (e) {}
}
function sp28Login_(pseudo, name) {
  var acc = accountByKey_(pseudo);
  if (!acc) return err_("Compte introuvable.");
  if (isBanned_(acc.pseudo)) return err_(MSG_SUSPENDED);
  return sp8Locked_(function () {
    try {
      var sh = sheet_(SHEET_ACCOUNTS), last = new Date(sh.getRange(acc.row, 12).getValue()).getTime();
      if (!last || Date.now() - last > 72000000) sh.getRange(acc.row, 12).setValue(new Date());   // « dernière connexion » (purge des comptes inactifs)
    } catch (x) {}
    try { purgeExpiredSessions_(); } catch (x) {}
    return { status: "success", token: createSession_(acc.pseudo, acc.name || name || ""), user: { name: acc.name || name || "", pseudo: acc.pseudo } };
  });
}
function sp28MaskMail_(m) { m = String(m || ""); var i = m.indexOf("@"); return i > 1 ? m.charAt(0) + "•••" + m.slice(i) : m; }
function sp28AppleAuth_(d) {
  var lim = rate_("aa:all", 300, 3600, "Beaucoup de connexions en ce moment. Réessaie dans quelques minutes."); if (lim) return err_(lim);
  if (!sp28TakeNonce_(d.nonce)) return err_("La connexion a expiré. Réessaie.");
  var t = sp28VerifyApple_(d.identityToken, d.nonce);
  if (t.e) return err_(t.e);
  var link = sp28AppleRow_(t.sub);
  if (link) return sp28Login_(String(link.r[1]));
  var rt = sp28Exchange_(d.authorizationCode, t.aud);
  if (t.email) {
    var acc = accountByKey_(t.email);
    if (acc) {
      if (!acc.verified || !t.verified) return err_("Un compte Spary utilise déjà cette adresse. Connecte-toi avec ton mot de passe, puis relie Apple dans Paramètres → Compte.");
      sp8Locked_(function () { if (!sp28AppleRow_(t.sub)) sp28ShApple_().appendRow([t.sub, acc.pseudo, Date.now(), safe_(t.email), t.relay ? "oui" : "non", rt]); });
      CacheService.getScriptCache().remove("sp28ver");
      return sp28Login_(acc.pseudo);
    }
  }
  // nouveau membre : il choisit son pseudo et sa date de naissance dans l'appli
  var ticket = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  CacheService.getScriptCache().put("sp28tk:" + ticket, JSON.stringify({ sub: t.sub, email: t.email, relay: t.relay, rt: rt, first: clip_(d.givenName, 40), last: clip_(d.familyName, 40) }), 1800);
  return { status: "success", need: "signup", ticket: ticket, firstName: clip_(d.givenName, 40), lastName: clip_(d.familyName, 40), email: t.email ? (t.relay ? "Adresse masquée par Apple" : sp28MaskMail_(t.email)) : "" };
}
function sp28AppleRegister_(e, d, prev) {
  var c = CacheService.getScriptCache(), raw = c.get("sp28tk:" + String(d.ticket || "").replace(/[^a-f0-9]/g, ""));
  if (!raw) return err_("La connexion avec Apple a expiré. Recommence depuis « Continuer avec Apple ».");
  var tk = jsonSafe_(raw);
  if (!tk.email) return err_("Apple n'a pas transmis d'adresse e-mail. Dans Réglages → Identifiant Apple → Connexion avec Apple, retire Spary puis réessaie.");
  if (sp28AppleRow_(tk.sub)) return err_("Ce compte Apple est déjà relié. Reviens en arrière et touche « Continuer avec Apple ».");
  var pw = "Ap" + (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").slice(0, 30) + "!9";   // inutilisable : la connexion se fait par Apple (ou « mot de passe oublié »)
  var payload = { action: "register", lastName: clip_(d.lastName || tk.last, 60), firstName: clip_(d.firstName || tk.first, 60), email: tk.email, phone: "", birthDate: String(d.birthDate || "").slice(0, 10),
    pseudo: String(d.pseudo || "").trim(), password: pw, newsletter: !!d.newsletter, consent: d.consent === true, club: String(d.club || ""), source: String(d.source || "") };
  var fake = { postData: { contents: JSON.stringify(payload), type: "application/json", length: 0 }, parameter: {}, parameters: {} };
  var mailFn = typeof mailOn_ === "function" ? mailOn_ : null, res = null;
  try { if (mailFn) mailOn_ = function () { return false; }; res = sp8Parse_(prev(fake)); }   // pas d'e-mail « confirme ton adresse » : Apple l'a déjà vérifiée
  finally { if (mailFn) mailOn_ = mailFn; }
  if (!res || res.status !== "success") return res || err_("Création du compte impossible pour le moment.");
  sp8After_(function () {
    var acc = accountByKey_(res.user.pseudo);
    if (acc && !acc.verified) { var sh = sheet_(SHEET_ACCOUNTS); sh.getRange(acc.row, 13).setValue(new Date()); try { if (!sh.getRange(1, 13).getValue()) sh.getRange(1, 13).setValue("E-mail vérifié"); } catch (x) {} }
    if (!sp28AppleRow_(tk.sub)) sp28ShApple_().appendRow([tk.sub, res.user.pseudo, Date.now(), safe_(tk.email), tk.relay ? "oui" : "non", tk.rt || ""]);
  });
  c.remove("sp28tk:" + String(d.ticket)); c.remove("sp28ver");
  res.apple = true;
  return res;
}
function sp28AppleLink_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  if (!sp28TakeNonce_(d.nonce)) return err_("La connexion a expiré. Réessaie.");
  var t = sp28VerifyApple_(d.identityToken, d.nonce);
  if (t.e) return err_(t.e);
  var rt = sp28Exchange_(d.authorizationCode, t.aud);
  return sp8Locked_(function () {
    var row = sp28AppleRow_(t.sub);
    if (row && sp28Lc_(row.r[1]) !== sp28Lc_(me.pseudo)) return err_("Ce compte Apple est déjà relié à un autre compte Spary.");
    if (sp28AppleOf_(me.pseudo) && !row) return err_("Un autre compte Apple est déjà relié à ton compte.");
    if (!row) sp28ShApple_().appendRow([t.sub, me.pseudo, Date.now(), safe_(t.email), t.relay ? "oui" : "non", rt]);
    CacheService.getScriptCache().remove("sp28ver");
    return { status: "success" };
  });
}
function sp28AppleUnlink_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée, reconnectez-vous.");
  var acc = accountByKey_(me.pseudo);
  return sp8Locked_(function () {
    var a = sp28AppleOf_(me.pseudo); if (!a) return { status: "success" };
    if (acc && /@privaterelay\\.appleid\\.com$/i.test(acc.email)) return err_("Ton compte utilise l'adresse masquée d'Apple : change d'abord d'adresse e-mail en nous écrivant, sinon tu ne pourrais plus te connecter.");
    sp28Revoke_(String(a.r[5] || ""));
    sp28ShApple_().deleteRow(a.at);
    CacheService.getScriptCache().remove("sp28ver");
    return { status: "success" };
  });
}

/* ===================== RGPD : export et suppression ===================== */
function sp28Export_(pseudo, out) {
  var r = sp28PrefRow_(pseudo); if (r) out.parcours = r.data;
  var a = sp28AppleOf_(pseudo);
  if (a) out.connexion_apple = { identifiant_apple: String(a.r[0]), lie_le: new Date(Number(a.r[2])).toISOString(), email_apple: String(a.r[3] || ""), relais_apple: String(a.r[4] || "") };
}
function sp28DeleteUser_(pseudo) {
  var p = sp28Lc_(pseudo);
  rewriteRows_(sp28ShPrefs_(), function (r) { return sp28Lc_(r[0]) === p ? null : r; });
  rewriteRows_(sp28ShApple_(), function (r) { if (sp28Lc_(r[1]) !== p) return r; sp28Revoke_(String(r[5] || "")); return null; });
  var c = CacheService.getScriptCache(); c.remove("sp28ver"); c.remove("sp28p:" + p);
}

/* ===================== Installation ===================== */
function sp28Install_() {
  if (SP28.installed || typeof doPost !== "function" || typeof SP8 === "undefined" || !SP8.installed || typeof SP14_EC === "undefined") return;
  SP28.installed = true;
  var prev = doPost;
  var handle = function (e, data) {
    switch (data.action) {
      case "onb19Get":        return out_(sp28OnbGet_(data));
      case "onb19Save":       return out_(sp28OnbSave_(data));
      case "verif19":         return out_(sp28Verif_(data));
      case "partners19":      return out_(sp28Partners_(data));
      case "news19":          return out_(sp28News_(data));
      case "appleNonce19":    return out_(sp28Nonce_());
      case "appleAuth19":     return out_(sp28AppleAuth_(data));
      case "appleRegister19": return out_(sp28AppleRegister_(e, data, prev));
      case "appleLink19":     return out_(sp28AppleLink_(data));
      case "appleUnlink19":   return out_(sp28AppleUnlink_(data));
      case "profileSave":     var r = prev(e), pr = sp8Parse_(r); if (pr && pr.status === "success") { var c = CacheService.getScriptCache(); c.remove("sp28ver"); } return r;
    }
    return null;
  };
  doPost = function (e) {
    var data = null;
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (!data || !data.action) return prev(e);
    var r = null;
    try { r = handle(e, data); }
    catch (err) {
      var m = String(err && err.message || err);
      try { console.error("sp28 " + m + " | " + (err && err.stack || "")); } catch (x) {}
      r = out_({ status: "error", message: /lock/i.test(m) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
    return r || prev(e);
  };
  var baseDelete = deleteAccountData_;
  deleteAccountData_ = function (pseudo) { baseDelete(pseudo); try { sp28DeleteUser_(pseudo); } catch (x) {} };
  var baseExport = accountExport_;
  accountExport_ = function (d) {
    var r = baseExport(d);
    try { if (r && r.status === "success" && r.data && r.data.pseudo) sp28Export_(r.data.pseudo, r.data); } catch (x) {}
    return r;
  };
}
sp28Install_();

/** À exécuter une fois dans l'éditeur pour vérifier l'installation (et accorder l'accès aux services externes). */
function sp28Verifier() {
  if (!SP28.installed) return console.log("PROBLÈME : le fichier Parcours doit être placé SOUS Performances (et au-dessus de Rgpd et Securite). sp8Verifier doit afficher OK.");
  sp28ShPrefs_(); sp28ShApple_();
  var k = 0; try { k = sp28AppleKeys_(true).length; } catch (e) { console.log("Clés Apple : " + e); }
  var n = 0; try { n = sp28ParseRss_(UrlFetchApp.fetch(sp28NewsUrl_("Padel"), { muteHttpExceptions: true }).getContentText(), "Padel").length; } catch (e) { console.log("Actus : " + e); }
  console.log("OK : parcours, partenaires, actus et badge actifs. Pense à publier une Nouvelle version du déploiement.");
  console.log("Connexion avec Apple : " + (k ? k + " clés Apple lues" : "clés Apple illisibles (réessaie plus tard)") + ". Révocation à la suppression : " + (sp28ClientSecret_(SP28.BUNDLE) ? "prête" : "facultative, non configurée (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_P8)") + ".");
  console.log("Actus : " + (n ? n + " titres lus pour le padel" : "flux indisponible pour l'instant") + ".");
}


;

// ===== 09-Seances.gs =====
/**
 * Spary · Seances (lot 20) : séance en direct adaptée à chaque sport, ~90 sports.
 *
 * Où le mettre : nouveau fichier « Seances », SOUS Parcours et AU-DESSUS de Rgpd et Securite (Securite reste le dernier).
 * Ordre final : Code.gs, Nouveautes, Terrain, Stats, Lus, Entrainements, Performances, Parcours, Seances, Rgpd, Securite.
 * Puis :
 *  1. Exécuter sp29Verifier : le journal doit afficher « OK ».
 *  2. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *
 * Ce que ça ajoute (aucun onglet, aucune Script Property, aucun secret) :
 *  1. Les nouveaux sports sont acceptés pour les entraînements (sinon « Sport inconnu. ») avec leur type de séance
 *     (muscu, circuit, endurance, raquettes, collectifs, escalade, golf, combat, paintball ou déroulé libre).
 *  2. Détails en plus gardés pour la séance en direct : temps de chaque tour (course, vélo…), longueur du tour,
 *     bassin et longueurs (natation), carte de score trou par trou (golf). Tout est vérifié (nombres bornés).
 *  3. Actus : chaque sport du catalogue peut être suivi (recherche Google Actualités).
 * Ne modifie aucun autre fichier. Pas d'écriture ici (les écritures restent celles d'Entrainements et Performances, sous verrou).
 */

var SP29 = {
  NEW_SPORTS: [
  "Randonnée", "Marche nordique", "Athlétisme", "VTT", "Triathlon", "Aviron", "Canoë-kayak", "Stand up paddle", "Roller",
  "Ski de fond", "Course d’orientation", "Haltérophilie", "Street workout", "Cardio-training", "Gymnastique", "Trampoline",
  "Pickleball", "Beach tennis", "Futsal", "Beach-volley", "Hockey sur glace", "Hockey sur gazon", "Roller hockey", "Water-polo",
  "Football américain", "Baseball", "Cricket", "Ultimate", "Boxe anglaise", "Boxe thaï", "Kickboxing", "MMA", "Judo", "Karaté",
  "Taekwondo", "Jiu-jitsu brésilien", "Lutte", "Krav-maga", "Aïkido", "Escrime", "Alpinisme", "Ski", "Snowboard", "Surf",
  "Kitesurf", "Planche à voile", "Wakeboard", "Voile", "Plongée", "Skateboard", "Patinage", "Parkour", "Tir à l’arc",
  "Tir sportif", "Pétanque", "Bowling", "Billard", "Fléchettes", "Équitation", "Laser game", "Airsoft", "Disc golf", "Zumba",
  "Stretching", "Aquagym", "Moto", "Motocross", "Sport automobile"
  ],
  KIND: {
  "Randonnée": "endu", "Marche nordique": "endu", "Athlétisme": "endu", "VTT": "endu", "Triathlon": "endu", "Aviron": "endu",
  "Canoë-kayak": "endu", "Stand up paddle": "endu", "Roller": "endu", "Ski de fond": "endu", "Course d’orientation": "endu",
  "Haltérophilie": "force", "Street workout": "force", "Cardio-training": "circuit", "Gymnastique": "libre",
  "Trampoline": "libre", "Pickleball": "raq", "Beach tennis": "raq", "Futsal": "co", "Beach-volley": "co",
  "Hockey sur glace": "co", "Hockey sur gazon": "co", "Roller hockey": "co", "Water-polo": "co", "Football américain": "co",
  "Baseball": "co", "Cricket": "co", "Ultimate": "co", "Boxe anglaise": "combat", "Boxe thaï": "combat", "Kickboxing": "combat",
  "MMA": "combat", "Judo": "combat", "Karaté": "combat", "Taekwondo": "combat", "Jiu-jitsu brésilien": "combat",
  "Lutte": "combat", "Krav-maga": "combat", "Aïkido": "combat", "Escrime": "combat", "Alpinisme": "endu", "Ski": "libre",
  "Snowboard": "libre", "Surf": "libre", "Kitesurf": "libre", "Planche à voile": "libre", "Wakeboard": "libre", "Voile": "libre",
  "Plongée": "libre", "Skateboard": "libre", "Patinage": "libre", "Parkour": "libre", "Tir à l’arc": "libre",
  "Tir sportif": "libre", "Pétanque": "libre", "Bowling": "libre", "Billard": "libre", "Fléchettes": "libre",
  "Équitation": "libre", "Laser game": "paint", "Airsoft": "paint", "Disc golf": "libre", "Zumba": "libre",
  "Stretching": "libre", "Aquagym": "libre", "Moto": "libre", "Motocross": "libre", "Sport automobile": "libre"
  },
  NEWS: {
  "Randonnée": "randonnée", "Marche nordique": "marche nordique", "VTT": "VTT", "Triathlon": "triathlon", "Aviron": "aviron",
  "Canoë-kayak": "canoë-kayak", "Stand up paddle": "stand up paddle", "Roller": "roller",
  "Ski de fond": "ski de fond OR biathlon", "Course d’orientation": "course d'orientation", "Haltérophilie": "haltérophilie",
  "Street workout": "street workout OR calisthenics", "Cardio-training": "cardio fitness", "Gymnastique": "gymnastique",
  "Trampoline": "trampoline gymnastique", "Pickleball": "pickleball", "Beach tennis": "beach tennis", "Futsal": "futsal",
  "Beach-volley": "beach-volley", "Hockey sur glace": "hockey sur glace", "Hockey sur gazon": "hockey sur gazon",
  "Roller hockey": "roller hockey", "Water-polo": "water-polo", "Football américain": "football américain OR NFL",
  "Baseball": "baseball MLB", "Cricket": "cricket", "Ultimate": "ultimate frisbee", "Boxe anglaise": "boxe anglaise",
  "Boxe thaï": "boxe thaï OR muay thaï", "Kickboxing": "kickboxing", "MMA": "MMA UFC OR PFL", "Judo": "judo", "Karaté": "karaté",
  "Taekwondo": "taekwondo", "Jiu-jitsu brésilien": "jiu-jitsu brésilien", "Lutte": "lutte olympique", "Krav-maga": "krav-maga",
  "Aïkido": "aïkido", "Escrime": "escrime", "Alpinisme": "alpinisme", "Snowboard": "snowboard", "Surf": "surf WSL",
  "Kitesurf": "kitesurf", "Planche à voile": "planche à voile OR windsurf", "Wakeboard": "wakeboard",
  "Voile": "voile Vendée Globe OR course au large", "Plongée": "plongée sous-marine", "Skateboard": "skateboard",
  "Patinage": "patinage artistique", "Parkour": "parkour", "Tir à l’arc": "tir à l'arc", "Tir sportif": "tir sportif",
  "Pétanque": "pétanque", "Bowling": "bowling", "Billard": "billard", "Fléchettes": "fléchettes", "Équitation": "équitation",
  "Laser game": "laser game", "Airsoft": "airsoft", "Disc golf": "disc golf", "Danse": "danse", "Zumba": "zumba",
  "Stretching": "stretching mobilité", "Aquagym": "aquagym", "Moto": "MotoGP OR moto", "Motocross": "motocross OR supercross",
  "Sport automobile": "Formule 1 OR WEC OR rallye"
  }
};

/* Sports et types : complète les listes des fichiers Entrainements, Performances et Parcours (sans rien retirer). */
(function () {
  if (typeof SP23 === "undefined" || typeof SP26 === "undefined" || typeof SP28 === "undefined") return;
  SP29.NEW_SPORTS.forEach(function (s) {
    if (SP23.SPORTS.indexOf(s) < 0) { var i = SP23.SPORTS.indexOf("Autre"); if (i >= 0) SP23.SPORTS.splice(i, 0, s); else SP23.SPORTS.push(s); }
    if (SP26.NEW_SPORTS.indexOf(s) < 0) SP26.NEW_SPORTS.push(s);
  });
  Object.keys(SP29.KIND).forEach(function (s) { if (!SP26.KIND[s]) SP26.KIND[s] = SP29.KIND[s]; });
  Object.keys(SP29.NEWS).forEach(function (s) { if (!SP28.NEWS[s]) SP28.NEWS[s] = SP29.NEWS[s]; });
  SP29.ready = true;
})();

/* Détails de la séance en direct : on garde aussi tours, longueurs et carte de golf, après la vérification habituelle. */
if (typeof sp26Det_ === "function" && !SP29.wrapped) {
  SP29.wrapped = true;
  SP29.baseDet = sp26Det_;
  sp26Det_ = function (sport, d) {
    var r = SP29.baseDet(sport, d);
    if (!r || r.e || !r.det || !d || typeof d !== "object") return r;
    var o = r.det;
    if (o.k === "endu") {
      var sp = [];
      (Array.isArray(d.splits) ? d.splits : []).slice(0, 60).forEach(function (x) { var v = sp26Int_(x, 3000, 86400000); if (v !== null) sp.push(v); });
      if (sp.length) o.splits = sp;
      var sd = sp26Int_(d.sd, 0, 100000); if (sd === 200 || sd === 400 || sd === 1000) o.sd = sd;
      var ba = sp26Int_(d.bassin, 0, 100); if (ba === 25 || ba === 50) o.bassin = ba;
      var ln = sp26Int_(d.len, 1, 2000); if (ln && o.bassin) o.len = ln;
    } else if (o.k === "golf") {
      var h = [];
      (Array.isArray(d.holes) ? d.holes : []).slice(0, o.trous || 18).forEach(function (x) {
        if (!Array.isArray(x)) return;
        var p = sp26Int_(x[0], 3, 6), c = sp26Int_(x[1], 0, 15), u = sp26Int_(x[2], 0, 10);
        h.push([p === null ? 4 : p, c === null ? 0 : c, u === null ? 0 : u]);
      });
      if (h.length) {
        o.holes = h;
        var c2 = 0, p2 = 0, u2 = 0; h.forEach(function (x) { if (x[1]) { c2 += x[1]; p2 += x[0]; u2 += x[2]; } });
        if (!o.coups && c2) { o.coups = c2; o.par = p2; o.putts = u2; }   // partie commencée : total des trous joués
      }
    }
    if (JSON.stringify(o).length > SP26.DET_MAX) return { e: "Trop de détails pour une seule séance." };
    return r;
  };
}

/** À exécuter une fois après avoir collé ce fichier. */
function sp29Verifier() {
  if (!SP29.ready) return console.log("PROBLÈME : le fichier Seances doit être placé SOUS Parcours (et au-dessus de Rgpd et Securite).");
  var t = sp26Det_("Running & Trail", { k: "endu", type: "footing", splits: [301000, 295500, "x"], sd: 1000 });
  var g = sp26Det_("Golf", { k: "golf", trous: 9, coups: 40, par: 36, holes: [[4, 5, 2], [3, 3, 1]] });
  var ok = SP23.SPORTS.indexOf("Boxe anglaise") >= 0 && SP23.SPORTS[SP23.SPORTS.length - 1] === "Autre" && t.det && t.det.splits && t.det.splits.length === 2 && g.det && g.det.holes && g.det.holes.length === 2;
  console.log(ok ? "OK : " + (SP23.SPORTS.length - 1) + " sports acceptés, détails de la séance en direct actifs. Pense à publier une Nouvelle version du déploiement." : "PROBLÈME : vérifie l'ordre des fichiers (Seances sous Parcours).");
}


;

// ===== 10-Rgpd.gs =====
/**
 * Spary : durées de conservation appliquées automatiquement (audit RGPD du 20/10/2026).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Rgpd », coller ce code.
 * Le placer juste AU-DESSUS de Securite (Securite doit rester le dernier fichier). Ne modifier aucun autre fichier.
 *  1. Exécuter rgpdSimuler : le journal affiche ce qui SERAIT fait, sans rien toucher.
 *  2. Exécuter rgpdInstaller une fois : passage automatique chaque nuit à 4 h.
 * Pas besoin de nouveau déploiement (rien n'est appelé par le site).
 *
 * Ce que ça fait chaque nuit (promesses de la politique de confidentialité) :
 *  1. Comptes inactifs : 30 jours avant les 3 ans sans connexion, e-mail « ton compte sera supprimé dans 30 jours ».
 *     Si la personne ne se reconnecte pas, compte et données supprimés (deleteAccountData_ complet, tous fichiers).
 *     Avant ce fichier, purgeInactive() existait mais devait être lancée à la main.
 *  2. Signalements de plus de 12 mois : le signaleur est remplacé par une empreinte anonyme, détails et extrait
 *     effacés. La ligne reste pour que le contenu retiré reste masqué.
 *  3. Recours de plus de 12 mois : supprimés (le texte seul est effacé pour une absence acceptée, qui doit rester annulée).
 *  4. Alertes dernière minute envoyées depuis plus de 30 jours : supprimées.
 *  5. Liens « Prévenir un proche » expirés : supprimés.
 *
 * Aucun secret dans ce fichier. Au plus 20 suppressions de comptes et 50 e-mails par nuit.
 */

var RGPD = {
  YEARS: 3,
  WARN_DAYS: 30,
  REPORT_DAYS: 365,
  APPEAL_DAYS: 365,
  ALERT_DAYS: 30,
  MAX_DELETES: 20,
  MAX_MAILS: 50,
  PROP: "RGPD_AVERTIS"     // { pseudo en minuscules : date de l'e-mail (ms) }
};

function rgpdInstaller() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "rgpdQuotidien") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("rgpdQuotidien").timeBased().everyDays(1).atHour(4).inTimezone("Europe/Paris").create();
  console.log("OK : purge RGPD installée (chaque nuit vers 4 h). Lance rgpdSimuler pour voir ce qu'elle ferait aujourd'hui.");
}

/** Montre ce qui serait fait, sans rien modifier ni envoyer. */
function rgpdSimuler() { rgpdQuotidien(true); }

function rgpdQuotidien(dry) {
  dry = dry === true;
  var lock = null, log = [];
  if (!dry) { lock = LockService.getScriptLock(); lock.waitLock(30000); }
  try {
    try { log.push(rgpdComptes_(dry)); } catch (x) { log.push("comptes : ERREUR " + (x && x.message || x)); }
    try { log.push(rgpdSignalements_(dry)); } catch (x) { log.push("signalements : ERREUR " + (x && x.message || x)); }
    try { log.push(rgpdRecours_(dry)); } catch (x) { log.push("recours : ERREUR " + (x && x.message || x)); }
    try { log.push(rgpdAlertes_(dry)); } catch (x) { log.push("alertes : ERREUR " + (x && x.message || x)); }
    try { log.push(rgpdPartages_(dry)); } catch (x) { log.push("partages : ERREUR " + (x && x.message || x)); }
  } finally { if (lock) lock.releaseLock(); }
  console.log((dry ? "SIMULATION (rien n'a été modifié)\\n" : "") + log.join("\\n"));
}

/* ---------- 1. Comptes inactifs ---------- */
function rgpdTime_(v) {
  if (v instanceof Date) return v.getTime();
  if (Number(v) > 1e11) return Number(v);
  var t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}
function rgpdComptes_(dry) {
  var now = Date.now(), day = 86400000;
  var limit = now - RGPD.YEARS * 365 * day, warnAt = limit + RGPD.WARN_DAYS * day;
  var props = PropertiesService.getScriptProperties(), warned = {};
  try { warned = JSON.parse(props.getProperty(RGPD.PROP) || "{}"); } catch (x) {}
  var sh = sheet_(SHEET_ACCOUNTS), rows = sh.getDataRange().getValues(), toDelete = [], mails = 0, back = 0, seen = {};
  for (var i = 1; i < rows.length; i++) {
    var pseudo = String(rows[i][6] || "").trim(); if (!pseudo) continue;
    var p = pseudo.toLowerCase(); seen[p] = 1;
    var last = rgpdTime_(rows[i][11]) || rgpdTime_(rows[i][0]);
    if (!last) continue;                                                   // date illisible : on ne touche à rien
    if (last >= warnAt) { if (warned[p]) { delete warned[p]; back++; } continue; }   // revenu, ou pas encore concerné
    if (!warned[p]) {
      if (mails >= RGPD.MAX_MAILS) continue;
      mails++;
      if (!dry) { rgpdPrevenir_(String(rows[i][3] || ""), String(rows[i][2] || "")); warned[p] = now; }
      continue;
    }
    if (last < limit && now - warned[p] >= RGPD.WARN_DAYS * day && toDelete.length < RGPD.MAX_DELETES) toDelete.push(pseudo);
  }
  Object.keys(warned).forEach(function (k) { if (!seen[k]) delete warned[k]; });  // comptes déjà supprimés
  if (!dry) {
    toDelete.forEach(function (ps) {
      deleteAccountData_(ps);
      var r2 = sh.getDataRange().getValues();
      for (var j = r2.length - 1; j >= 1; j--) if (String(r2[j][6]).toLowerCase() === ps.toLowerCase()) { sh.deleteRow(j + 1); break; }
      delete warned[ps.toLowerCase()];
    });
    props.setProperty(RGPD.PROP, JSON.stringify(warned));
  }
  return "comptes : " + mails + " e-mail(s) de prévenance, " + toDelete.length + " compte(s) supprimé(s), " + back + " compte(s) revenu(s).";
}
function rgpdPrevenir_(email, prenom) {
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || typeof mail_ !== "function") return false;
  var url = mailProp_("SITE_URL", "https://spary.fr").replace(/\\/+$/, "") + "/";
  var intro = (prenom ? "Bonjour " + prenom + ", tu" : "Tu") + " ne t'es pas connecté(e) à Spary depuis près de 3 ans. Comme prévu par notre politique de confidentialité, ton compte et tes données seront supprimés dans 30 jours.";
  var outro = "Pour garder ton compte, il suffit de te connecter avant cette date. Sinon, tu n'as rien à faire.";
  return mail_(email, "Ton compte Spary sera supprimé dans 30 jours",
    mailLayout_("Ton compte Spary va être supprimé", intro, "Me connecter", url, outro),
    intro + "\\n\\n" + outro + "\\n" + url);
}

/* ---------- 2. Signalements ---------- */
function rgpdAnon_(pseudo) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, "spary-rgpd|" + String(pseudo).toLowerCase(), Utilities.Charset.UTF_8);
  return "anonyme-" + Utilities.base64EncodeWebSafe(d).slice(0, 10);
}
function rgpdSignalements_(dry) {
  var sh = sheetIf_(SH_REPORTS); if (!sh) return "signalements : onglet absent.";
  var lim = Date.now() - RGPD.REPORT_DAYS * 86400000, n = 0;
  var fn = function (r) {
    if (!r[0] || !(Number(r[1]) < lim) || /^anonyme-/.test(String(r[2]))) return r;
    n++; var o = r.slice(); o[2] = rgpdAnon_(r[2]); o[7] = ""; o[8] = ""; return o;
  };
  if (dry) rowsOf_(sh).forEach(fn); else { rewriteRows_(sh, fn); CacheService.getScriptCache().remove("hid:all"); }
  return "signalements : " + n + " anonymisé(s) (plus de 12 mois).";
}

/* ---------- 3. Recours ---------- */
function rgpdRecours_(dry) {
  var sh = sheetIf_("Recours"); if (!sh) return "recours : onglet absent.";
  var lim = Date.now() - RGPD.APPEAL_DAYS * 86400000, del = 0, blank = 0;
  var fn = function (r) {
    if (!(Number(r[0]) < lim)) return r;
    var accepted = r[2] === "absence" && /^(accepte|acceptee|valide|validee|ok)$/.test(norm_(r[5]).trim());
    if (accepted) { if (!String(r[4])) return r; blank++; var o = r.slice(); o[4] = ""; return o; }
    del++; return null;
  };
  if (dry) rowsOf_(sh).forEach(fn); else rewriteRows_(sh, fn);
  return "recours : " + del + " supprimé(s), " + blank + " texte(s) effacé(s) (plus de 12 mois).";
}

/* ---------- 4. Alertes dernière minute envoyées ---------- */
function rgpdAlertes_(dry) {
  var sh = sheetIf_("AlertesEnvoyees"); if (!sh) return "alertes : onglet absent.";
  var lim = Date.now() - RGPD.ALERT_DAYS * 86400000, n = 0;
  var fn = function (r) { if (Number(r[0]) < lim) { n++; return null; } return r; };
  if (dry) rowsOf_(sh).forEach(fn); else rewriteRows_(sh, fn);
  return "alertes : " + n + " supprimée(s) (plus de 30 jours).";
}

/* ---------- 5. Liens « Prévenir un proche » expirés ---------- */
function rgpdPartages_(dry) {
  var sh = sheetIf_("PartagesProches"); if (!sh) return "partages : onglet absent.";
  var lim = Date.now() - 86400000, n = 0;
  var fn = function (r) { if (Number(r[3]) && Number(r[3]) < lim) { n++; return null; } return r; };
  if (dry) rowsOf_(sh).forEach(fn); else rewriteRows_(sh, fn);
  return "partages : " + n + " lien(s) expiré(s) supprimé(s).";
}


;

// ===== 11-Securite.gs =====
/**
 * Spary : protections de sécurité (audit du 19/10/2026).
 *
 * INSTALLATION : dans Apps Script, « + » → Script → nommer le fichier « Securite », coller ce code.
 * Le placer EN DERNIER dans la liste des fichiers (sous Entrainements et sous tout autre fichier .gs).
 * Ne modifier aucun autre fichier.
 *  1. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *  2. Exécuter secVerifier : le journal doit afficher « OK ».
 *  3. Exécuter secScannerFormules une fois et lire le journal (voir plus bas).
 *
 * Ce que ça fait :
 *  1. Injection de formules : tout texte reçu qui commence par « = » est enregistré avec « ＝ » (signe égal
 *     pleine chasse, identique à l'œil). Avant, un membre pouvait écrire « =Comptes!D2 » dans un champ
 *     (sport d'une séance postée, prénom…) : Google Sheets exécutait la formule et l'appli renvoyait
 *     l'e-mail, le téléphone ou la date de naissance d'autres membres.
 *  2. Même protection pour le prénom recopié dans l'onglet Sessions à chaque connexion.
 *  3. Refus des requêtes de plus de 150 Ko avant tout traitement.
 *  4. Mesure d'audience (action hit, sans connexion) plafonnée à SEC.HITS_PER_HOUR par heure : un robot
 *     ne peut plus remplir le classeur (limite Google : 10 millions de cellules, l'appli entière s'arrêterait).
 *  5. Limites de fréquence sur pushSubscribe, reviewSkip et interestAdd (ajout de lignes sans limite jusqu'ici).
 *  6. (lot 2) « Mot de passe oublié » plafonné à 30 demandes par heure en tout (protège le quota Resend).
 *  7. (lot 2) Abonnements push : seulement vers les vrais services de notification (Google, Apple, Mozilla, Microsoft).
 *  8. (lot 2) Sauvegarde automatique de BDD Spary chaque dimanche (4 dernières gardées) et contrôle quotidien
 *     qui t'écrit à contact@spary.fr seulement si quelque chose cloche. Lancer secInstaller une fois.
 *
 * Aucun secret dans ce fichier. Ne touche à aucune donnée existante, sauf si tu lances secNeutraliserFormules.
 */

var SEC = {
  installed: false,
  MAX_BYTES: 150000,
  HITS_PER_HOUR: 1000,                         // à relever si le trafic réel dépasse ~300 visites par heure
  KEEP: { password: 1, oldPassword: 1, newPassword: 1 },   // jamais modifiés (hachés, jamais stockés en clair)
  LIMITS: { pushSubscribe: [30, 3600], reviewSkip: [60, 3600], interestAdd: [20, 3600] },
  PWF_PER_HOUR: 30,                            // demandes « mot de passe oublié » par heure, tous comptes confondus
  PUSH_HOSTS: /^https:\\/\\/([a-z0-9-]+\\.)*(fcm\\.googleapis\\.com|push\\.services\\.mozilla\\.com|push\\.apple\\.com|notify\\.windows\\.com)\\//i,
  BACKUPS_KEEP: 4,                             // sauvegardes hebdomadaires gardées (environ un mois)
  CELLS_ALERT: 7000000,                        // alerte quand le classeur approche la limite Google de 10 millions de cellules
  wrapper: null
};

/** « =… » → « ＝… » (les espaces de tête sont gardés). */
function secNeutre_(s) { return typeof s === "string" ? s.replace(/^(\\s*)=/, "$1＝") : s; }

/** Copie de la requête où chaque texte est neutralisé. flag.changed passe à true si quelque chose a changé. */
function secClean_(v, depth, flag) {
  if (typeof v === "string") { var n = secNeutre_(v); if (n !== v) flag.changed = true; return n; }
  if (!v || typeof v !== "object" || depth > 8) return v;
  if (Array.isArray(v)) return v.map(function (x) { return secClean_(x, depth + 1, flag); });
  var o = {};
  Object.keys(v).forEach(function (k) { o[k] = depth === 0 && SEC.KEEP[k] ? v[k] : secClean_(v[k], depth + 1, flag); });
  return o;
}

/** Plafonds avant le traitement normal. Renvoie une réponse pour arrêter là, sinon null. */
function secGuard_(d) {
  var a = String(d.action || "");
  if (a === "hit") {
    var c = CacheService.getScriptCache(), k = "sec:hit:" + Math.floor(Date.now() / 3600000), n = Number(c.get(k) || 0);
    if (n >= SEC.HITS_PER_HOUR) {                              // comptage perdu, sans gêner le visiteur
      if (!c.get("sec:hitcap")) { c.put("sec:hitcap", "1", 21600); try { PropertiesService.getScriptProperties().setProperty("SEC_HITCAP", String(Date.now())); } catch (x) {} }
      return { status: "success" };
    }
    c.put(k, String(n + 1), 7200);
    return null;
  }
  if (a === "pwForgot") {
    var mp = rate_("sec:pwf:" + Math.floor(Date.now() / 3600000), SEC.PWF_PER_HOUR, 7200, "Beaucoup de demandes en ce moment. Réessayez dans une heure.");
    if (mp) return err_(mp);
  }
  if (a === "pushSubscribe" && !d.native) {
    var ep = String(d.sub && d.sub.endpoint || "");
    if (!SEC.PUSH_HOSTS.test(ep)) return err_("Abonnement invalide.");
  }
  var lim = SEC.LIMITS[a];
  if (lim && d.token) {
    var me = sessionUser_(d.token);
    if (me) {
      var m = rate_("sec:" + a + ":" + String(me.pseudo).toLowerCase(), lim[0], lim[1], "Trop de demandes en peu de temps. Réessayez plus tard.");
      if (m) return err_(m);
    }
  }
  return null;
}

function secInstall_() {
  if (SEC.installed || typeof doPost !== "function") return;
  SEC.installed = true;

  var prev = doPost;
  SEC.wrapper = function (e) {
    var raw = e && e.postData && typeof e.postData.contents === "string" ? e.postData.contents : "";
    if (raw.length > SEC.MAX_BYTES) return out_(err_("Requête trop volumineuse."));
    var data = null;
    try { data = JSON.parse(raw); } catch (x) {}
    if (!data || typeof data !== "object" || Array.isArray(data)) return prev(e);
    try { var stop = secGuard_(data); if (stop) return out_(stop); }
    catch (x) { try { console.error("sec garde " + (x && x.message || x)); } catch (y) {} }
    var flag = { changed: false }, clean = secClean_(data, 0, flag);
    if (!flag.changed) return prev(e);
    var body = JSON.stringify(clean);
    try { e.postData.contents = body; } catch (x) {}
    if (e.postData.contents !== body) {                     // objet en lecture seule : on passe une copie
      var e2 = {};
      try { Object.keys(e).forEach(function (k) { e2[k] = e[k]; }); } catch (x) {}
      e2.postData = { contents: body, length: body.length, type: e.postData.type, name: e.postData.name };
      e = e2;
    }
    return prev(e);
  };
  doPost = SEC.wrapper;

  // Le prénom est recopié de Comptes vers Sessions à chaque connexion : jamais de « = » en tête.
  if (typeof createSession_ === "function") {
    var baseCreate = createSession_;
    createSession_ = function (pseudo, name) { return baseCreate(pseudo, secNeutre_(String(name == null ? "" : name))); };
  }
}
secInstall_();

/* ===================== Outils à lancer depuis l'éditeur ===================== */

/** Vérifie l'installation et compte les mots de passe encore en clair. */
function secVerifier() {
  if (!SEC.installed) return console.log("PROBLÈME : le fichier Securite n'est pas chargé.");
  if (doPost !== SEC.wrapper) return console.log("PROBLÈME : le fichier Securite doit être placé EN DERNIER dans la liste des fichiers (menu ⋮ du fichier > Déplacer vers le bas).");
  var clair = 0;
  try {
    var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) { var v = String(rows[i][7] || ""); if (v && v.indexOf("hmac$") !== 0 && v.indexOf("sha256$") !== 0) clair++; }
  } catch (x) {}
  console.log("OK : protections actives. Pense à publier une Nouvelle version du déploiement.");
  console.log(clair ? "ATTENTION : " + clair + " mot(s) de passe encore en clair. Exécute migratePasswords une fois." : "Mots de passe : tous hachés.");
}

/** Liste les cellules qui contiennent une formule ou un texte commençant par « = » (lecture seule). */
function secScannerFormules() { secScan_(false); }
/** Transforme ces cellules en texte inoffensif (« ＝… »). À lancer seulement après avoir lu le résultat du scan. */
function secNeutraliserFormules() { secScan_(true); }

function secCol_(n) { var s = ""; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function secScan_(fix) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), found = 0, fixed = 0;
  ss.getSheets().forEach(function (sh) {
    var last = sh.getLastRow(), cols = sh.getLastColumn();
    if (last < 2 || cols < 1) return;
    var rng = sh.getRange(2, 1, last - 1, cols), f = rng.getFormulas(), v = rng.getValues();
    for (var i = 0; i < f.length; i++) for (var j = 0; j < cols; j++) {
      var isF = !!f[i][j], isT = !isF && typeof v[i][j] === "string" && /^\\s*=/.test(v[i][j]);
      if (!isF && !isT) continue;
      found++;
      if (found <= 200) console.log(sh.getName() + "!" + secCol_(j + 1) + (i + 2) + " → " + (isF ? "formule : " + f[i][j] : "texte : " + v[i][j]).slice(0, 140));
      if (fix) { sh.getRange(i + 2, j + 1).setValue(secNeutre_(isF ? f[i][j] : v[i][j])); fixed++; }
    }
  });
  console.log(found ? found + " cellule(s) trouvée(s)" + (fix ? ", " + fixed + " neutralisée(s)." : ". Si ce ne sont pas des formules que tu as ajoutées toi-même, lance secNeutraliserFormules.") : "OK : aucune formule dans les onglets de l'appli.");
}

/* ===================== Lot 2 : sauvegardes et contrôle quotidien ===================== */

/** À lancer UNE fois : crée les déclencheurs (sauvegarde le dimanche à 3 h, contrôle chaque jour à 7 h) et fait une première sauvegarde. */
function secInstaller() {
  ScriptApp.getProjectTriggers().forEach(function (t) { var h = t.getHandlerFunction(); if (h === "secSauvegarder" || h === "secControleQuotidien") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("secSauvegarder").timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).inTimezone("Europe/Paris").create();
  ScriptApp.newTrigger("secControleQuotidien").timeBased().everyDays(1).atHour(7).inTimezone("Europe/Paris").create();
  secSauvegarder();
  secControleQuotidien(true);
  console.log("OK : sauvegarde chaque dimanche (" + SEC.BACKUPS_KEEP + " gardées) et contrôle chaque matin installés.");
}

/** Copie complète de BDD Spary dans ton Drive. Les plus anciennes partent à la corbeille. */
function secSauvegarder() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), p = PropertiesService.getScriptProperties();
  var day = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd");
  var copy = ss.copy("Spary – Sauvegarde " + day + " (ne pas partager)");
  var ids = []; try { ids = JSON.parse(p.getProperty("SEC_BACKUPS") || "[]"); } catch (x) {}
  ids.push(copy.getId());
  while (ids.length > SEC.BACKUPS_KEEP) { var old = ids.shift(); try { DriveApp.getFileById(old).setTrashed(true); } catch (x) {} }
  p.setProperty("SEC_BACKUPS", JSON.stringify(ids));
  console.log("Sauvegarde créée : " + copy.getUrl());
}

/** Contrôle chaque matin. N'écrit à contact@spary.fr que si un problème est trouvé (ou si verbose). */
function secControleQuotidien(verbose) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), issues = [], cells = 0, formulas = 0;
  ss.getSheets().forEach(function (sh) {
    var last = sh.getLastRow(), cols = sh.getLastColumn();
    cells += Math.max(1, last) * Math.max(1, cols);
    if (last < 2 || cols < 1) return;
    var f = sh.getRange(2, 1, last - 1, cols).getFormulas();
    for (var i = 0; i < f.length; i++) for (var j = 0; j < cols; j++) if (f[i][j]) formulas++;
  });
  if (formulas) issues.push(formulas + " formule(s) dans les onglets de l'appli : lance secScannerFormules.");
  if (cells > SEC.CELLS_ALERT) issues.push("Le classeur utilise " + cells + " cellules sur 10 000 000 : il faut purger ou migrer.");
  try {
    var rows = sheet_(SHEET_ACCOUNTS).getDataRange().getValues(), clair = 0;
    for (var k = 1; k < rows.length; k++) { var v = String(rows[k][7] || ""); if (v && v.indexOf("hmac$") !== 0 && v.indexOf("sha256$") !== 0) clair++; }
    if (clair) issues.push(clair + " mot(s) de passe en clair : lance migratePasswords.");
  } catch (x) {}
  var props = PropertiesService.getScriptProperties(), cap = Number(props.getProperty("SEC_HITCAP") || 0);
  if (cap && Date.now() - cap < 86400000) issues.push("Plafond de la mesure d'audience atteint dans les dernières 24 h (trafic réel en hausse ou robot).");
  if (!props.getProperty("PEPPER")) issues.push("Script Property PEPPER absente : NE PAS en recréer une, m'écrire tout de suite.");
  if (doPost !== SEC.wrapper) issues.push("Le fichier Securite n'est plus le dernier de la liste : le remettre en bas.");
  var ids = []; try { ids = JSON.parse(props.getProperty("SEC_BACKUPS") || "[]"); } catch (x) {}
  if (!ids.length) issues.push("Aucune sauvegarde enregistrée : lance secInstaller.");
  var txt = issues.length ? "Points à regarder :\\n- " + issues.join("\\n- ") : "Tout est normal (" + cells + " cellules utilisées).";
  console.log(txt);
  if ((issues.length || verbose === true) && typeof mail_ === "function" && typeof mailOn_ === "function" && mailOn_()) {
    mail_(CONTACT_MAIL, (issues.length ? "⚠️ " : "") + "Contrôle sécurité Spary", "<pre style=\\"font-family:Arial,sans-serif;white-space:pre-wrap\\">" + mailEsc_(txt) + "</pre>", txt);
  }
}


;

// ===== 12-Posts.gs =====
/**
 * Spary lot 23 : autorise le « post libre » (type "Post", façon LinkedIn/X).
 * Fichier séparé : ne rien changer dans Code.gs.
 * À placer SOUS Code.gs dans la liste des fichiers (c'est le cas par défaut quand on crée un fichier).
 */
try {
  if (typeof POST_TYPES !== "undefined" && POST_TYPES.indexOf("Post") < 0) POST_TYPES.push("Post");
} catch (e) { console.error("Posts.gs : " + e); }


;

// ===== 13-Identification.gs =====
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


;

// ===== 14-Messagerie.gs =====
/**
 * Spary · Messagerie (lot 26) : messages enrichis, réactions, suppression, « en train d'écrire », GIF, photos,
 * vidéos, vocaux, cartes séance/profil, « On y va ? » 1 h avant une séance.
 *
 * OÙ LE METTRE : nouveau fichier « Messagerie » (+ → Script). Il marche quelle que soit sa place dans la liste
 * (même tout en bas, sous Securite) : il réapplique lui-même les protections de Securite à ses actions.
 * Ne modifie aucun autre fichier, Code.gs compris.
 *
 * PUIS :
 *  1. Exécuter sp34Verifier : le journal doit afficher « OK » (et dire si les photos/vidéos/vocaux et les GIF sont prêts).
 *  2. Exécuter sp34Installer une fois (rappel « On y va ? » toutes les 15 min + ménage chaque nuit).
 *  3. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *
 * SCRIPT PROPERTIES (Paramètres du projet → Propriétés du script), jamais dans le code :
 *  - GIPHY_KEY            : clé API Giphy (developers.giphy.com). Sans elle, le bouton GIF est masqué.
 *  - Plus tard (vidéos et vocaux) : SUPABASE_URL et SUPABASE_SERVICE_KEY. Sans elles, vidéos et vocaux restent masqués.
 * PHOTOS : compressées sur le téléphone (100 Ko max), rangées dans un dossier Drive privé « Spary – Photos des messages »
 *  (créé tout seul, id dans la Script Property SP34_FOLDER). Seuls les membres de la conversation peuvent les afficher.
 *
 * Ce que ça enregistre (onglet MessagesPlus de BDD Spary, créé tout seul) :
 *   rev | message | conversation | membre | type | valeur (JSON) | date (ms)
 *   type « rich » = contenu enrichi d'un message (réponse à, GIF, photo, vidéo, vocal, carte, « j'arrive »),
 *   type « reac » = réaction emoji d'un membre à un message (vide = retirée),
 *   type « del »  = message supprimé par son auteur (son texte est remplacé dans l'onglet Messages, le fichier est effacé).
 *   Photos : dossier Drive privé (jamais partagé), envoyées par le serveur aux seuls membres de la conversation.
 *   Vidéos et vocaux (plus tard) : Supabase Storage, compartiment privé, liens temporaires de 6 h.
 * « En train d'écrire » : cache de 8 secondes, rien n'est écrit.
 * Suppression de compte : ses lignes et ses fichiers sont effacés. Export RGPD : ses réactions et ses pièces jointes.
 */

var SP34 = {
  installed: false,
  TAIL: 5000,                       // lignes lues en fin d'onglet (MessagesPlus et Messages)
  REACTS: ["❤️", "\uD83D\uDC4D", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDD25", "\uD83D\uDC4F", "\uD83D\uDCAA"],
  ETA: { go: 1, late5: 1, late10: 1, late15: 1, out: 1 },
  TY_TTL: 8,
  BUCKET: "messages",
  SIGN_TTL: 21600,                  // liens de lecture valables 6 h
  MEDIA: {                          // tailles max et formats acceptés
    img: { max: 6 * 1048576, mime: /^image\\/(jpeg|png|webp|gif|heic)$/ },
    vid: { max: 26 * 1048576, mime: /^video\\/(mp4|quicktime|webm)$/ },
    aud: { max: 6 * 1048576, mime: /^audio\\/(mp4|aac|m4a|x-m4a|webm|ogg|mpeg)$/ }
  },
  EXT: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic",
         "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
         "audio/mp4": "m4a", "audio/aac": "aac", "audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3" },
  GIF: /^https:\\/\\/(media\\d?|i)\\.giphy\\.com\\/media\\/[A-Za-z0-9]+\\/[A-Za-z0-9_.-]+\\.(gif|webp|mp4)(\\?[A-Za-z0-9=&._-]*)?$/,
  PHOTO_MAX: 140000,                // photo en data URL (≈ 100 Ko de JPEG) : sous la limite de 150 Ko de Securite
  wrapper: null
};

function sp34Sh_() { return sheetH_("MessagesPlus", ["rev", "message", "conversation", "membre", "type", "valeur (JSON)", "date (ms)"]); }
function sp34Lc_(s) { return String(s == null ? "" : s).toLowerCase(); }
function sp34Ps_(v) { v = String(v || "").replace(/^@/, "").trim(); return /^[A-Za-z0-9_.-]{3,20}$/.test(v) ? v : ""; }
function sp34Props_() { return PropertiesService.getScriptProperties(); }
function sp34Sb_() {
  var p = sp34Props_(), u = String(p.getProperty("SUPABASE_URL") || "").replace(/\\/+$/, ""), k = String(p.getProperty("SUPABASE_SERVICE_KEY") || "");
  return /^https:\\/\\/[a-z0-9-]+\\.supabase\\.co$/.test(u) && k.length > 40 ? { url: u, key: k } : null;
}
function sp34Locked_(fn) { return typeof sp8Locked_ === "function" ? sp8Locked_(fn) : fn(); }

/** Clé de conversation : « #123 » pour une séance ou un groupe, « a|b » (pseudos en minuscules, triés) pour une conversation privée. */
function sp34Conv_(from, to) {
  to = String(to || "");
  if (to.charAt(0) === "#") return /^#\\d{1,20}$/.test(to) ? to : "";
  var a = sp34Lc_(from), b = sp34Lc_(to);
  if (!sp34Ps_(a) || !sp34Ps_(b)) return "";
  return [a, b].sort().join("|");
}
function sp34Folder_(conv) { return conv.charAt(0) === "#" ? "g/" + conv.slice(1) : "dm/" + conv.replace("|", "__"); }

/** Le membre peut-il lire / écrire dans cette conversation ? sids = ses séances et groupes (calculés une seule fois). */
function sp34CanSee_(me, conv, sids) {
  if (!conv) return false;
  if (conv.charAt(0) === "#") return !!(sids || mySeanceIds_(me))[conv.slice(1)];
  return conv.split("|").indexOf(sp34Lc_(me)) >= 0;
}
function sp34CanWrite_(me, to) {
  to = String(to || "");
  if (to.charAt(0) === "#") return /^#\\d{1,20}$/.test(to) && !!mySeanceIds_(me)[to.slice(1)];
  var dest = findAccount_(sp34Ps_(to));
  if (!dest || sp34Lc_(dest.pseudo) === sp34Lc_(me)) return false;
  var bl = blocks_(me), dk = sp34Lc_(dest.pseudo);
  return !(bl.mine[dk] || bl.them[dk] || (typeof isBanned_ === "function" && isBanned_(dk)));
}

/** Retrouve un message (fin de l'onglet Messages). */
function sp34Msg_(id) {
  id = Number(id); if (!id) return null;
  var sh = sheet_("Messages", true), last = sh.getLastRow(); if (last < 1) return null;
  var first = Math.max(1, last - SP34.TAIL + 1), rows = sh.getRange(first, 1, last - first + 1, 5).getValues();
  for (var i = rows.length - 1; i >= 0; i--) if (Number(rows[i][0]) === id)
    return { row: first + i, id: id, from: String(rows[i][1]), to: String(rows[i][2]), text: String(rows[i][3]), ts: Number(rows[i][4]) };
  return null;
}

function sp34Rev_() { var r = Date.now() * 1000 + Math.floor(Math.random() * 1000); CacheService.getScriptCache().put("sp34:last", String(r), 21600); return r; }
function sp34Add_(msgId, conv, pseudo, type, val) {
  sp34Sh_().appendRow([sp34Rev_(), Number(msgId), conv, pseudo, type, val == null ? "" : JSON.stringify(val), Date.now()]);
}

/* ===================== Contenu enrichi (vérifié côté serveur) ===================== */
function sp34Clean_(r, me, to) {
  if (!r || typeof r !== "object") return null;
  var out = {}, conv = sp34Conv_(me.pseudo, to), k = String(r.k || "txt");
  if (r.re) {                                       // réponse à un message
    var re = Number(r.re);
    if (re > 0 && re < 1e17) { out.re = re; out.q = clip_(r.q, 140); out.qa = sp34Ps_(r.qa) || ""; }
  }
  if (k === "gif") {
    var u = String(r.u || ""); if (!SP34.GIF.test(u)) return out.re ? out : null;
    out.k = "gif"; out.u = u; out.w = Math.min(2000, Math.max(0, Math.round(Number(r.w) || 0))); out.h = Math.min(2000, Math.max(0, Math.round(Number(r.h) || 0)));
  } else if (k === "img" && !r.p) {                // photo envoyée avec le message (enregistrée dans Drive après l'envoi)
    var dt = String(r.data || ""), mm = dt.match(/^data:image\\/(jpeg|png|webp);base64,([A-Za-z0-9+\\/=]+)$/);
    if (!mm || dt.length > SP34.PHOTO_MAX) return out.re ? out : null;
    out.k = "img"; out._data = mm[2]; out._mime = "image/" + mm[1];
    out.w = Math.min(8000, Math.max(0, Math.round(Number(r.w) || 0))); out.h = Math.min(8000, Math.max(0, Math.round(Number(r.h) || 0)));
  } else if (k === "img" || k === "vid" || k === "aud") {
    var p = String(r.p || ""), pre = sp34Folder_(conv) + "/" + sp34Lc_(me.pseudo) + "/";
    if (!conv || p.indexOf(pre) !== 0 || !/^[a-z0-9_.\\/-]{10,160}$/.test(p) || p.indexOf("..") >= 0) return out.re ? out : null;
    out.k = k; out.p = p;
    out.w = Math.min(8000, Math.max(0, Math.round(Number(r.w) || 0))); out.h = Math.min(8000, Math.max(0, Math.round(Number(r.h) || 0)));
    out.d = Math.min(600, Math.max(0, Math.round((Number(r.d) || 0) * 10) / 10));
    if (Array.isArray(r.wf)) out.wf = r.wf.slice(0, 48).map(function (x) { return Math.min(9, Math.max(0, Math.round(Number(x) || 0))); });
  } else if (k === "sess") {                        // carte de séance : on recopie les infos du serveur (pas celles du téléphone)
    var sid = String(Number(r.id) || ""), s = sid && typeof sp8SessRow_ === "function" ? sp8SessRow_(sid) : null;
    if (!s) return out.re ? out : null;
    out.k = "sess"; out.id = Number(sid); out.sport = clip_(s[3], 60); out.place = clip_(s[4], 80); out.start = Number(s[7]) || 0;
    out.dur = Number(s[15]) || 90; out.slots = Number(s[8]) || 0; out.level = clip_(s[10], 30); out.org = String(s[1]);
  } else if (k === "prof") {
    var acc = findAccount_(sp34Ps_(r.p));
    if (!acc) return out.re ? out : null;
    out.k = "prof"; out.p = acc.pseudo; out.n = clip_(acc.name, 40);
  } else if (k === "eta") {
    var v = String(r.v || ""); if (!SP34.ETA[v] || String(to).charAt(0) !== "#") return out.re ? out : null;
    out.k = "eta"; out.v = v;
  } else if (!out.re) return null;
  if (!out.k) out.k = "txt";
  return out;
}

/* ===================== Actions ===================== */
function sp34MsgSend_(e, data, prev) {
  var me = sessionUser_(data.token), rich = null;
  if (me && data.rich) { try { rich = sp34Clean_(data.rich, me, data.to); } catch (x) { rich = null; } }
  var res = prev(e);
  if (!rich) return res;
  var r = sp8Parse_(res);
  if (r && r.status === "success" && r.id) {
    try {
      if (rich._data) {
        var f = sp34Folder34_().createFile(Utilities.newBlob(Utilities.base64Decode(rich._data), rich._mime, "m" + r.id + "." + (SP34.EXT[rich._mime] || "jpg")));
        rich.f = f.getId(); delete rich._data; delete rich._mime;
      }
      sp34Locked_(function () { sp34Add_(r.id, sp34Conv_(me.pseudo, r.to || data.to), me.pseudo, "rich", rich); });
    }
    catch (x) { try { console.error("sp34 rich " + (x && x.message || x)); } catch (y) {} }
  }
  return res;
}

function sp34React_(d) {
  var me = sessionUser_(d.token); if (!me) return err_("Session expirée, reconnectez-vous.");
  var em = String(d.e || ""); if (em && SP34.REACTS.indexOf(em) < 0) return err_("Réaction inconnue.");
  var lim = rate_("sp34r:" + sp34Lc_(me.pseudo), 200, 3600, "Trop de réactions en peu de temps."); if (lim) return err_(lim);
  var m = sp34Msg_(d.id); if (!m) return err_("Message introuvable.");
  var conv = sp34Conv_(m.from, m.to); if (!sp34CanSee_(me.pseudo, conv)) return err_("Message introuvable.");
  return sp34Locked_(function () { sp34Add_(m.id, conv, me.pseudo, "reac", em); return { status: "success" }; });
}

function sp34Delete_(d) {
  var me = sessionUser_(d.token); if (!me) return err_("Session expirée, reconnectez-vous.");
  var lim = rate_("sp34d:" + sp34Lc_(me.pseudo), 60, 3600, "Trop de suppressions en peu de temps."); if (lim) return err_(lim);
  return sp34Locked_(function () {
    var m = sp34Msg_(d.id); if (!m) return err_("Message introuvable.");
    if (sp34Lc_(m.from) !== sp34Lc_(me.pseudo)) return err_("Tu peux seulement supprimer tes messages.");
    var conv = sp34Conv_(m.from, m.to), files = sp34FilesOf_(m.id);
    sheet_("Messages", true).getRange(m.row, 4).setValue("Message supprimé");
    sp34Add_(m.id, conv, me.pseudo, "del", 1);
    // Le contenu enrichi de ce message est vidé (on garde la ligne pour les réactions et l'ordre).
    sp34Rewrite_(function (r) { return Number(r[1]) === m.id && r[4] === "rich" ? null : r; });
    if (files.length) sp34SbDelete_(files);
    if (files.drive.length) sp34Trash_(files.drive);
    CacheService.getScriptCache().remove("sp34:ph:" + m.id);
    return { status: "success" };
  });
}

function sp34Typing_(d) {
  var me = sessionUser_(d.token); if (!me) return { status: "success" };
  var conv = sp34Conv_(me.pseudo, d.to); if (!conv) return { status: "success" };
  var c = CacheService.getScriptCache(), k = "sp34:ty:" + conv, o = {};
  try { o = JSON.parse(c.get(k) || "{}") || {}; } catch (x) { o = {}; }
  var now = Date.now(); Object.keys(o).forEach(function (p) { if (now - o[p] > SP34.TY_TTL * 1000) delete o[p]; });
  if (d.stop) delete o[sp34Lc_(me.pseudo)]; else o[sp34Lc_(me.pseudo)] = now;
  try { c.put(k, JSON.stringify(o), SP34.TY_TTL + 2); } catch (x) {}
  return { status: "success" };
}

function sp34Cfg_(d) {
  if (!sessionUser_(d.token)) return err_("Session expirée.");
  var p = sp34Props_();
  return { status: "success", giphy: String(p.getProperty("GIPHY_KEY") || ""), photos: true, media: !!sp34Sb_(), reacts: SP34.REACTS };
}

/** Prépare l'envoi d'une photo, vidéo ou vocal : renvoie une adresse d'envoi à usage unique (Supabase Storage). */
function sp34Media_(d) {
  var me = sessionUser_(d.token); if (!me) return err_("Session expirée, reconnectez-vous.");
  var sb = sp34Sb_(); if (!sb) return err_("Les pièces jointes ne sont pas encore activées.");
  var k = String(d.k || ""), spec = SP34.MEDIA[k], mime = String(d.mime || "").toLowerCase().split(";")[0], size = Number(d.size) || 0;
  if (!spec || !spec.mime.test(mime)) return err_("Format de fichier non accepté.");
  if (size <= 0 || size > spec.max) return err_("Fichier trop lourd (" + Math.round(spec.max / 1048576) + " Mo max).");
  var lim = rate_("sp34m:" + sp34Lc_(me.pseudo), 60, 3600, "Trop de fichiers envoyés en peu de temps. Réessaie plus tard."); if (lim) return err_(lim);
  if (typeof sp8MsgGuard_ === "function") { var g = sp8MsgGuard_({ token: d.token, to: d.to }); if (g) return err_(g); }
  if (!sp34CanWrite_(me.pseudo, d.to)) return err_("Impossible d'envoyer un fichier dans cette conversation.");
  var conv = sp34Conv_(me.pseudo, d.to);
  var path = sp34Folder_(conv) + "/" + sp34Lc_(me.pseudo) + "/" + Utilities.getUuid().replace(/-/g, "").slice(0, 20) + "." + (SP34.EXT[mime] || "bin");
  var r = UrlFetchApp.fetch(sb.url + "/storage/v1/object/upload/sign/" + SP34.BUCKET + "/" + path, {
    method: "post", muteHttpExceptions: true, contentType: "application/json", payload: "{}",
    headers: { Authorization: "Bearer " + sb.key, apikey: sb.key }
  });
  var j = jsonSafe_(r.getContentText());
  if (r.getResponseCode() !== 200 || !j.url) { try { console.error("sp34 sign " + r.getResponseCode() + " " + r.getContentText().slice(0, 200)); } catch (x) {} return err_("Envoi de fichier indisponible pour le moment."); }
  return { status: "success", path: path, upload: sb.url + "/storage/v1" + j.url, mime: mime };
}

/* ===================== Photos (Drive privé) ===================== */
function sp34Folder34_() {
  var p = sp34Props_(), id = p.getProperty("SP34_FOLDER");
  if (id) { try { return DriveApp.getFolderById(id); } catch (x) {} }
  var f = DriveApp.createFolder("Spary – Photos des messages (privé, ne pas partager)");
  p.setProperty("SP34_FOLDER", f.getId());
  return f;
}
/** Renvoie une photo d'un message, seulement à un membre de la conversation. */
function sp34Photo_(d) {
  var me = sessionUser_(d.token); if (!me) return err_("Session expirée.");
  var id = Number(d.id); if (!id) return err_("Photo introuvable.");
  var lim = rate_("sp34p:" + sp34Lc_(me.pseudo), 600, 3600, "Trop de photos chargées. Réessaie plus tard."); if (lim) return err_(lim);
  var c = CacheService.getScriptCache(), meta = jsonSafe_(c.get("sp34:ph:" + id) || "");
  if (!meta.f) {
    var sh = sp34Sh_(), n = sh.getLastRow(); if (n < 2) return err_("Photo introuvable.");
    var first = Math.max(2, n - SP34.TAIL * 2 + 1), rows = sh.getRange(first, 1, n - first + 1, 6).getValues();
    for (var i = rows.length - 1; i >= 0; i--) if (Number(rows[i][1]) === id && rows[i][4] === "rich") {
      var v = jsonSafe_(String(rows[i][5])); if (v.f) { meta = { f: v.f, conv: String(rows[i][2]) }; break; }
    }
    if (!meta.f) return err_("Photo introuvable.");
    try { c.put("sp34:ph:" + id, JSON.stringify(meta), 21600); } catch (x) {}
  }
  if (!sp34CanSee_(me.pseudo, meta.conv)) return err_("Photo introuvable.");
  try {
    var b = DriveApp.getFileById(meta.f).getBlob();
    return { status: "success", id: id, data: "data:" + b.getContentType() + ";base64," + Utilities.base64Encode(b.getBytes()) };
  } catch (x) { return err_("Photo introuvable."); }
}
function sp34Trash_(ids) { ids.forEach(function (f) { try { DriveApp.getFileById(f).setTrashed(true); } catch (x) {} }); }

/* ===================== Synchro : événements, liens de lecture, « en train d'écrire » ===================== */
function sp34Events_(me, since) {
  var c = CacheService.getScriptCache(), last = Number(c.get("sp34:last") || 0);
  since = Number(since) || 0;
  if (since && last && last <= since) return { rev: since, ev: [] };
  var sh = sp34Sh_(), n = sh.getLastRow(); if (n < 2) return { rev: since, ev: [] };
  var first = Math.max(2, n - SP34.TAIL + 1), rows = sh.getRange(first, 1, n - first + 1, 6).getValues();
  var ev = [], top = since, sids = null, blk = blocks_(me.pseudo), mine = sp34Lc_(me.pseudo), media = [];
  for (var i = 0; i < rows.length; i++) {
    var rev = Number(rows[i][0]); if (!rev || rev <= since) continue;
    var conv = String(rows[i][2]);
    if (conv.charAt(0) === "#") { if (!(sids = sids || mySeanceIds_(me.pseudo))[conv.slice(1)]) continue; }
    else if (conv.split("|").indexOf(mine) < 0) continue;
    var who = String(rows[i][3]);
    if (sp34Lc_(who) !== mine && hides_(blk, who)) continue;
    var v = null; try { v = rows[i][5] === "" ? null : JSON.parse(String(rows[i][5])); } catch (x) { v = null; }
    if (rows[i][4] === "rich" && v && v.p && (v.k === "img" || v.k === "vid" || v.k === "aud")) media.push(v);
    ev.push([rev, Number(rows[i][1]), String(rows[i][4]), who, v]);
    if (rev > top) top = rev;
  }
  if (media.length) { try { sp34Sign_(media); } catch (x) { try { console.error("sp34 liens " + (x && x.message || x)); } catch (y) {} } }
  return { rev: top, ev: ev.slice(-1500) };
}

/** Ajoute un lien de lecture temporaire (champ « s ») aux pièces jointes. Cache de 5 h par fichier. */
function sp34Sign_(list) {
  var sb = sp34Sb_(); if (!sb) return;
  var c = CacheService.getScriptCache(), need = [];
  list.forEach(function (v) { var hit = c.get("sp34:s:" + v.p); if (hit) v.s = hit; else if (need.indexOf(v.p) < 0) need.push(v.p); });
  for (var i = 0; i < need.length; i += 100) {
    var part = need.slice(i, i + 100);
    var r = UrlFetchApp.fetch(sb.url + "/storage/v1/object/sign/" + SP34.BUCKET, {
      method: "post", muteHttpExceptions: true, contentType: "application/json",
      payload: JSON.stringify({ expiresIn: SP34.SIGN_TTL, paths: part }),
      headers: { Authorization: "Bearer " + sb.key, apikey: sb.key }
    });
    if (r.getResponseCode() !== 200) { try { console.error("sp34 sign " + r.getResponseCode()); } catch (x) {} continue; }
    var arr = []; try { arr = JSON.parse(r.getContentText()); } catch (x) {}
    (Array.isArray(arr) ? arr : []).forEach(function (o) {
      if (!o || !o.signedURL || o.error) return;
      var full = sb.url + "/storage/v1" + o.signedURL;
      try { c.put("sp34:s:" + o.path, full, SP34.SIGN_TTL - 3600); } catch (x) {}
      list.forEach(function (v) { if (v.p === o.path) v.s = full; });
    });
  }
}

function sp34Typers_(me, to) {
  var conv = sp34Conv_(me.pseudo, to); if (!conv) return [];
  var o = {}; try { o = JSON.parse(CacheService.getScriptCache().get("sp34:ty:" + conv) || "{}") || {}; } catch (x) {}
  var now = Date.now(), mine = sp34Lc_(me.pseudo);
  return Object.keys(o).filter(function (p) { return p !== mine && now - o[p] < 7000; });
}

function sp34Sync_(e, data, prev) {
  var res = prev(e);
  if (data.x34 === undefined && !data.ty34) return res;
  try {
    var r = sp8Parse_(res), me = sessionUser_(data.token);
    if (!r || r.status !== "success" || !me) return res;
    if (data.x34 !== undefined) r.x34 = sp34Events_(me, data.x34);
    if (data.ty34) r.ty34 = sp34Typers_(me, data.ty34);
    return out_(r);
  } catch (x) {
    try { console.error("sp34 synchro " + (x && x.message || x)); } catch (y) {}
    return res;
  }
}

/* ===================== Fichiers (Supabase Storage) ===================== */
function sp34FilesOf_(msgId) {
  var o = [], dr = [];
  rowsOf_(sp34Sh_()).forEach(function (r) {
    if (Number(r[1]) !== Number(msgId) || r[4] !== "rich") return;
    var v = jsonSafe_(String(r[5])); if (v.p && (v.k === "img" || v.k === "vid" || v.k === "aud")) o.push(v.p); if (v.f) dr.push(v.f);
  });
  o.drive = dr;
  return o;
}
function sp34SbDelete_(paths) {
  var sb = sp34Sb_(); if (!sb || !paths.length) return;
  for (var i = 0; i < paths.length; i += 500) {
    try {
      UrlFetchApp.fetch(sb.url + "/storage/v1/object/" + SP34.BUCKET, {
        method: "delete", muteHttpExceptions: true, contentType: "application/json",
        payload: JSON.stringify({ prefixes: paths.slice(i, i + 500) }),
        headers: { Authorization: "Bearer " + sb.key, apikey: sb.key }
      });
    } catch (x) { try { console.error("sp34 suppression fichiers " + x); } catch (y) {} }
  }
}
function sp34Rewrite_(fn) {
  var sh = sp34Sh_(), v = sh.getDataRange().getValues(), head = v.shift(), keep = [];
  v.forEach(function (r) { var x = fn(r); if (x) keep.push(x); });
  if (keep.length === v.length) return 0;
  sh.getRange(2, 1, Math.max(1, v.length), head.length).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, head.length).setValues(keep);
  return v.length - keep.length;
}

/* ===================== « On y va ? » : notification 1 h avant chaque séance ===================== */
function sp34Wx_(s) {
  var lat = Number(s[5]), lng = Number(s[6]), st = Number(s[7]);
  if (!isFinite(lat) || !isFinite(lng) || (!lat && !lng) || typeof sp8Outdoor_ !== "function" || !sp8Outdoor_(s[3])) return "";
  var key = (Math.round(lat * 20) / 20).toFixed(2) + "," + (Math.round(lng * 20) / 20).toFixed(2), c = CacheService.getScriptCache(), o = null, hit = c.get("sp8:wx:" + key);
  if (hit) o = jsonSafe_(hit);
  else {
    var p = key.split(","), r = UrlFetchApp.fetch("https://api.open-meteo.com/v1/forecast?latitude=" + p[0] + "&longitude=" + p[1] + "&hourly=temperature_2m,precipitation_probability,weather_code&timezone=Europe%2FParis&forecast_days=2", { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return "";
    var h = jsonSafe_(r.getContentText()).hourly; if (!h || !Array.isArray(h.time)) return "";
    o = { t: h.time, a: h.temperature_2m || [], p: h.precipitation_probability || [], c: h.weather_code || [] };
    try { c.put("sp8:wx:" + key, JSON.stringify(o), 3600); } catch (x) {}
  }
  if (!o || !o.t) return "";
  var i = o.t.indexOf(Utilities.formatDate(new Date(st), "Europe/Paris", "yyyy-MM-dd'T'HH:00")); if (i < 0) return "";
  var pr = Number(o.p[i]) || 0;
  return sp8WxCode_(o.c[i]) + " " + Math.round(Number(o.a[i])) + " °C" + (pr >= 20 ? ", pluie " + pr + " %" : "");
}

/** Déclencheur toutes les 15 min : séances qui commencent dans 45 à 60 min. */
function sp34Rappels() {
  if (typeof sp14Queue_ !== "function") return;
  var now = Date.now(), c = CacheService.getScriptCache(), todo = [];
  rowsOf_(shSeances_()).forEach(function (s) {
    var st = Number(s[7]), id = String(s[0]);
    if (s[12] !== "ouverte" || st <= now + 44 * 60000 || st > now + 61 * 60000 || c.get("sp34:go:" + id)) return;
    todo.push(s);
  });
  if (!todo.length) return;
  todo.forEach(function (s) {
    var id = String(s[0]), who = sp14Players_(id).concat([String(s[1])]), wx = "";
    try { wx = sp34Wx_(s); } catch (x) {}
    var hm = Utilities.formatDate(new Date(Number(s[7])), "Europe/Paris", "HH'h'mm").replace(/h00$/, "h");
    try { c.put("sp34:go:" + id, "1", 6 * 3600); } catch (x) {}
    sp34Locked_(function () {
      sp14Queue_(who, {
        title: "On y va ? " + clip_(s[3], 40) + " à " + hm,
        body: clip_(s[4], 60) + (wx ? " · " + wx : "") + ". Dis aux autres si tu arrives.",
        url: "./#seance=" + id, subject: "go:" + id
      }, { always: true });
    });
  });
  try { sp14Flush_(); } catch (x) {}
}

/** Ménage chaque nuit : lignes dont le message n'existe plus (compte supprimé, purge RGPD). */
function sp34Nettoyer() {
  var ids = {};
  rowsAll_(sheet_("Messages", true)).forEach(function (r) { if (r[0]) ids[Number(r[0])] = 1; });
  var gone = [], dr = [], n = sp34Locked_(function () {
    return sp34Rewrite_(function (r) {
      if (ids[Number(r[1])]) return r;
      var v = r[4] === "rich" ? jsonSafe_(String(r[5])) : {};
      if (v.p && (v.k === "img" || v.k === "vid" || v.k === "aud")) gone.push(v.p);
      if (v.f) dr.push(v.f);
      return null;
    });
  });
  if (gone.length) sp34SbDelete_(gone);
  if (dr.length) sp34Trash_(dr);
  if (n) console.log("sp34Nettoyer : " + n + " ligne(s) retirée(s), " + gone.length + " fichier(s) effacé(s).");
}

/* ===================== Installation ===================== */
function sp34Install_() {
  if (SP34.installed || typeof doPost !== "function" || typeof sessionUser_ !== "function") return;
  SP34.installed = true;
  var prev = doPost, secPrev = typeof SEC !== "undefined" && SEC && SEC.installed && SEC.wrapper === doPost;
  var handle = function (e, data) {
    switch (data.action) {
      case "msgSend":    return data.rich ? sp34MsgSend_(e, data, prev) : null;
      case "msgSync":    return sp34Sync_(e, data, prev);
      case "react34":    return out_(sp34React_(data));
      case "del34":      return out_(sp34Delete_(data));
      case "typing34":   return out_(sp34Typing_(data));
      case "cfg34":      return out_(sp34Cfg_(data));
      case "media34":    return out_(sp34Media_(data));
      case "photo34":    return out_(sp34Photo_(data));
    }
    return null;
  };
  SP34.wrapper = function (e) {
    var raw = e && e.postData && typeof e.postData.contents === "string" ? e.postData.contents : "";
    var data = null; try { data = JSON.parse(raw); } catch (x) {}
    if (!data || !data.action || !/^(msgSend|msgSync|react34|del34|typing34|cfg34|media34|photo34)$/.test(data.action)) return prev(e);
    if (data.action === "msgSend" && !data.rich) return prev(e);
    if (data.action === "msgSync" && data.x34 === undefined && !data.ty34) return prev(e);
    // Placé sous Securite : on applique ses protections à nos actions avant de les traiter.
    if (secPrev) {
      if (raw.length > SEC.MAX_BYTES) return out_(err_("Requête trop volumineuse."));
      try { var stop = secGuard_(data); if (stop) return out_(stop); } catch (x) {}
      var flag = { changed: false }; data = secClean_(data, 0, flag);
    }
    try { return handle(e, data) || prev(e); }
    catch (err) {
      var m = String(err && err.message || err);
      try { console.error("sp34 " + m + " | " + (err && err.stack || "")); } catch (x) {}
      return out_({ status: "error", message: /lock/i.test(m) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
  };
  doPost = SP34.wrapper;
  if (secPrev) SEC.wrapper = doPost;   // secVerifier reste « OK »

  // Suppression de compte : ses lignes et ses fichiers.
  var baseDelete = deleteAccountData_;
  deleteAccountData_ = function (pseudo) {
    baseDelete(pseudo);
    try {
      var p = sp34Lc_(pseudo), files = [], dr = [];
      sp34Rewrite_(function (r) {
        if (sp34Lc_(r[3]) !== p) return r;
        var v = r[4] === "rich" ? jsonSafe_(String(r[5])) : {};
        if (v.p) files.push(v.p);
        if (v.f) dr.push(v.f);
        return null;
      });
      sp34SbDelete_(files); sp34Trash_(dr);
    } catch (x) { try { console.error("sp34 suppression compte " + x); } catch (y) {} }
  };
  // Export RGPD : ses réactions et ses pièces jointes (sans les liens).
  var baseExport = accountExport_;
  accountExport_ = function (d) {
    var r = baseExport(d);
    try {
      if (r && r.status === "success" && r.data && r.data.pseudo) {
        var p = sp34Lc_(r.data.pseudo), reac = [], att = [];
        rowsOf_(sp34Sh_()).forEach(function (x) {
          if (sp34Lc_(x[3]) !== p) return;
          var v = jsonSafe_(String(x[5]));
          if (x[4] === "reac" && x[5] !== "") reac.push({ message: Number(x[1]), reaction: JSON.parse(String(x[5])), date: new Date(Number(x[6])).toISOString() });
          if (x[4] === "rich") att.push({ message: Number(x[1]), type: v.k, fichier: v.p || (v.f ? "photo Drive " + v.f : ""), gif: v.u || "", reponse_a: v.re || "", date: new Date(Number(x[6])).toISOString() });
        });
        r.data.messagerie = { reactions: reac, contenus_enrichis: att };
      }
    } catch (x) {}
    return r;
  };
}
sp34Install_();

/** À lancer une fois après l'installation : crée le rappel « On y va ? » (toutes les 15 min) et le ménage de nuit. */
function sp34Installer() {
  ScriptApp.getProjectTriggers().forEach(function (t) { var h = t.getHandlerFunction(); if (h === "sp34Rappels" || h === "sp34Nettoyer") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("sp34Rappels").timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger("sp34Nettoyer").timeBased().everyDays(1).atHour(4).inTimezone("Europe/Paris").create();
  console.log("OK : rappel « On y va ? » toutes les 15 min et ménage chaque nuit installés.");
}

/** Vérifie l'installation, prépare le compartiment Supabase et dit ce qui est actif. */
function sp34Verifier() {
  if (!SP34.installed) return console.log("PROBLÈME : le fichier Messagerie n'est pas chargé (Code.gs et Nouveautes doivent être au-dessus).");
  sp34Sh_();
  console.log("OK : réactions, réponses, suppression, « en train d'écrire », cartes et « On y va ? » actifs (onglet MessagesPlus).");
  console.log(sp34Props_().getProperty("GIPHY_KEY") ? "GIF : clé Giphy présente." : "GIF : ajoute la Script Property GIPHY_KEY pour activer le bouton GIF.");
  console.log("Photos : dossier Drive privé prêt (« " + sp34Folder34_().getName() + " »).");
  var sb = sp34Sb_();
  if (!sb) return console.log("Vidéos et vocaux : pas encore activés (plus tard, avec SUPABASE_URL et SUPABASE_SERVICE_KEY).");
  var h = { Authorization: "Bearer " + sb.key, apikey: sb.key };
  var g = UrlFetchApp.fetch(sb.url + "/storage/v1/bucket/" + SP34.BUCKET, { muteHttpExceptions: true, headers: h });
  if (g.getResponseCode() !== 200) {
    var cr = UrlFetchApp.fetch(sb.url + "/storage/v1/bucket", { method: "post", muteHttpExceptions: true, contentType: "application/json", headers: h,
      payload: JSON.stringify({ id: SP34.BUCKET, name: SP34.BUCKET, public: false, file_size_limit: 26 * 1048576,
        allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "video/mp4", "video/quicktime", "video/webm", "audio/mp4", "audio/aac", "audio/m4a", "audio/x-m4a", "audio/webm", "audio/ogg", "audio/mpeg"] }) });
    if (cr.getResponseCode() !== 200) return console.log("PROBLÈME Supabase (" + cr.getResponseCode() + ") : " + cr.getContentText().slice(0, 200) + ". Vérifie SUPABASE_URL et la clé service_role.");
    console.log("Compartiment privé « messages » créé dans Supabase.");
  }
  console.log("OK : photos, vidéos et vocaux actifs (Supabase, compartiment privé « messages »).");
}


;

// ===== 15-Lot27.gs =====
/**
 * Spary · Lot 27 : notifications qui ouvrent le bon objet, photos d'annonces groupées, aperçu flou des photos.
 *
 * OÙ LE METTRE : nouveau fichier « Lot27 » (+ → Script), TOUT EN BAS de la liste des fichiers (sous Messagerie).
 * Ne modifie aucun autre fichier, Code.gs compris. Comme Messagerie, il réapplique lui-même les protections de Securite.
 *
 * PUIS :
 *  1. Exécuter lot27Verifier : le journal doit afficher « OK ».
 *  2. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *
 * Ce que ça change :
 *  - Notifications : le lien envoyé avec la notification pointe vers la conversation (#dm=pseudo), le groupe (#grp=id)
 *    au lieu de « Messages » en général. Les séances (#seance=id) étaient déjà précises.
 *  - imgs27 : jusqu'à 8 photos d'annonces en une seule requête (avant : une requête de 1 à 3 s par photo).
 *    Mêmes règles que postImage (annonce masquée, membre bloqué, compte privé).
 *  - mini27 : l'auteur d'une annonce enregistre une miniature floue (24 px, < 3 Ko) créée sur son téléphone.
 *    Onglet AnnoncesMini (créé tout seul) : annonce | miniature (data URL JPEG) | rapport largeur/hauteur.
 *    La liste des annonces (postList) renvoie ces miniatures : la photo floue s'affiche instantanément.
 *  - Suppression d'une annonce ou d'un compte : les miniatures correspondantes sont effacées.
 * Sans ce fichier, le site marche : photos chargées une par une (en parallèle et en cache), pas d'aperçu flou,
 * notifications de message qui ouvrent la liste des conversations.
 */

var L27 = { installed: false, MAX_IDS: 8, MINI_MAX: 3000, CACHE: "l27:mini" };

function l27Sh_() { return sheetH_("AnnoncesMini", ["annonce", "miniature", "rapport"]); }
function l27Mini_(m) { m = String(m || ""); return /^data:image\\/jpeg;base64,[A-Za-z0-9+\\/=]+$/.test(m) && m.length <= L27.MINI_MAX ? m : ""; }

/** Toutes les miniatures (cache 10 min). */
function l27Minis_() {
  var c = CacheService.getScriptCache(), hit = c.get(L27.CACHE);
  if (hit) return jsonSafe_(hit) || {};
  var sh = l27Sh_(), last = sh.getLastRow(), o = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, 3).getValues().forEach(function (r) { if (r[0] && r[1]) o[String(r[0])] = { m: String(r[1]), r: Number(r[2]) || 1 }; });
  try { c.put(L27.CACHE, JSON.stringify(o), 600); } catch (x) {}
  return o;
}

/** Annonces : id → auteur (une seule lecture). */
function l27Authors_() {
  var o = {};
  rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (r[0]) o[String(r[0])] = String(r[1]); });
  return o;
}

/** Plusieurs photos d'annonces en une requête, avec les mêmes contrôles que sp8PostImage_. */
function l27Imgs_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var ids = (Array.isArray(d.ids) ? d.ids : []).map(function (x) { return String(Number(x) || ""); }).filter(String).slice(0, L27.MAX_IDS);
  if (!ids.length) return { status: "success", imgs: {} };
  var hid = hidden_(), au = l27Authors_(), mine = sp8Lc_(me.pseudo), bl = blocks_(me.pseudo), priv = sp8PrivateSet_(), fr = null, ok = {};
  ids.forEach(function (id) {
    var a = au[id];
    if (!a || hid["annonce:" + id]) return;
    var k = sp8Lc_(a);
    if (k !== mine) {
      if (hides_(bl, a)) return;
      if (priv[k]) { fr = fr || sp8FriendState_(me.pseudo); if (fr[k] !== "ami") return; }
    }
    ok[id] = 1;
  });
  var out = {}, sh = sp8ShImg_(), last = sh.getLastRow();
  if (last >= 2 && Object.keys(ok).length) {
    sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) { var id = String(r[0]); if (ok[id]) out[id] = String(r[1]); });
  }
  return { status: "success", imgs: out };
}

/** L'auteur enregistre la miniature floue de sa photo. */
function l27SetMini_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var id = String(Number(d.id) || ""), m = l27Mini_(d.mini), r = Math.max(0.3, Math.min(3, Number(d.r) || 1));
  if (!id || !m) return err_("Miniature invalide.");
  var a = l27Authors_()[id];
  if (!a || sp8Lc_(a) !== sp8Lc_(me.pseudo)) return err_("Action impossible.");
  sp8Locked_(function () {
    var sh = l27Sh_(), last = sh.getLastRow();
    if (last >= 2) { var v = sh.getRange(2, 1, last - 1, 1).getValues(); for (var i = v.length - 1; i >= 0; i--) if (String(v[i][0]) === id) sh.deleteRow(i + 2); }
    sh.appendRow([id, m, Math.round(r * 1000) / 1000]);
  });
  CacheService.getScriptCache().remove(L27.CACHE);
  return { status: "success" };
}

/** Efface les miniatures des annonces qui n'existent plus. */
function l27Clean_() {
  var au = l27Authors_(), sh = l27Sh_(), rows = sh.getDataRange().getValues(), n = 0;
  for (var i = rows.length - 1; i >= 1; i--) if (!au[String(rows[i][0])]) { sh.deleteRow(i + 1); n++; }
  if (n) CacheService.getScriptCache().remove(L27.CACHE);
  return n;
}

/** Lien de notification précis selon le sujet : msg:pseudo:… → #dm=pseudo ; chan:id:… → #grp=id. */
function l27Url_(item) {
  var s = String(item && item.subject || ""), u = String(item && item.url || "");
  if (!/^\\.?\\/?#messages$/.test(u)) return u;
  var m = s.match(/^msg:([A-Za-z0-9_.-]{1,30}):/); if (m) return "./#dm=" + encodeURIComponent(m[1]);
  m = s.match(/^chan:([A-Za-z0-9_-]{1,40}):/); if (m) return "./#grp=" + m[1];
  return u;
}

function l27Install_() {
  if (L27.installed || typeof doPost !== "function" || typeof sessionUser_ !== "function") return;
  L27.installed = true;

  // 1. Notifications : lien vers l'objet.
  if (typeof sp14Queue_ === "function") {
    var q = sp14Queue_;
    sp14Queue_ = function (pseudos, item, opts) {
      try { if (item && item.url) item.url = l27Url_(item); } catch (x) {}
      return q(pseudos, item, opts);
    };
  }

  // 2. Actions.
  var prev = doPost, secPrev = typeof SEC !== "undefined" && SEC && SEC.installed && SEC.wrapper === doPost;
  var wrapper = function (e) {
    var raw = e && e.postData && typeof e.postData.contents === "string" ? e.postData.contents : "";
    var data = null; try { data = JSON.parse(raw); } catch (x) {}
    if (!data || !/^(imgs27|mini27|postList|postDelete)$/.test(String(data.action || ""))) return prev(e);
    if (data.action === "postList") {
      var out = prev(e);
      try {
        var res = JSON.parse(out.getContent());
        if (res && res.status === "success" && Array.isArray(res.posts)) {
          var all = l27Minis_(), mini = {};
          res.posts.forEach(function (p) { if (p && p.img && all[String(p.id)]) mini[String(p.id)] = all[String(p.id)]; });
          res.mini27 = mini;
          return out_(res);
        }
      } catch (x) {}
      return out;
    }
    if (data.action === "postDelete") {
      var o2 = prev(e);
      try { var r2 = JSON.parse(o2.getContent()); if (r2 && r2.status === "success") sp8Locked_(l27Clean_); } catch (x) {}
      return o2;
    }
    if (secPrev) {
      if (raw.length > SEC.MAX_BYTES) return out_(err_("Requête trop volumineuse."));
      try { var stop = secGuard_(data); if (stop) return out_(stop); } catch (x) {}
      var flag = { changed: false }; data = secClean_(data, 0, flag);
    }
    try { return out_(data.action === "imgs27" ? l27Imgs_(data) : l27SetMini_(data)); }
    catch (err) {
      var m = String(err && err.message || err);
      try { console.error("lot27 " + m); } catch (x) {}
      return out_({ status: "error", message: /lock/i.test(m) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
  };
  doPost = wrapper;
  if (secPrev) SEC.wrapper = doPost;

  // 3. Suppression de compte : miniatures des annonces disparues.
  if (typeof deleteAccountData_ === "function") {
    var del = deleteAccountData_;
    deleteAccountData_ = function (pseudo) { var r = del(pseudo); try { l27Clean_(); } catch (x) {} return r; };
  }
}
l27Install_();

/** Vérifie l'installation. */
function lot27Verifier() {
  if (!L27.installed) return console.log("PROBLÈME : Lot27 n'est pas chargé (place-le tout en bas, sous Messagerie).");
  l27Sh_();
  console.log("OK : photos groupées (imgs27), aperçu flou (onglet AnnoncesMini) actifs.");
  console.log(typeof sp14Queue_ === "function" ? "OK : notifications de message → conversation précise." : "Notifications : sp14Queue_ introuvable (fichier Nouveautes absent ?).");
  console.log("Test lien : " + l27Url_({ url: "./#messages", subject: "msg:theom:1" }) + " / " + l27Url_({ url: "./#messages", subject: "chan:55:1" }));
}

;

// ===== 16-Lot28.gs =====
/**
 * Spary · Lot 28 : exercices perso et modèles de séance liés au compte, diagnostic du palmarès.
 *
 * OÙ LE METTRE : nouveau fichier « Lot28 » (+ → Script), TOUT EN BAS de la liste des fichiers (sous Lot27).
 * Ne modifie aucun autre fichier, Code.gs compris. Comme Lot27, il réapplique lui-même les protections de Securite.
 *
 * PUIS :
 *  1. Exécuter lot28Verifier : le journal doit afficher « OK ». Il teste aussi le palmarès de chaque membre
 *     et affiche les erreurs éventuelles (c'est ce qu'il faut me copier si le palmarès ne charge toujours pas).
 *  2. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *
 * Ce que ça ajoute :
 *  - lib28Get / lib28Save : les exercices créés par le membre et ses modèles de séance, gardés avec son compte
 *    (retrouvés sur un autre téléphone). Trois onglets créés tout seuls :
 *      ExercicesPerso : membre | id | nom | groupe | cree
 *      ModelesSeance  : membre | id | nom | sport | type | details (JSON, même format que les séances) | cree | maj | utilise
 *      Bibliotheque   : membre | rev (version de la liste, pour savoir quel appareil est à jour)
 *    Mêmes colonnes que les futures tables Supabase exercices_perso et modeles_seance.
 *  - profil16 (palmarès) : même calcul qu'avant, mais en cas d'erreur le détail (fichier et ligne) est écrit
 *    dans le journal d'exécution (« lot28 profil16 ») au lieu d'un simple « Erreur serveur ».
 *  - Suppression de compte et export RGPD : ces données sont incluses.
 * Sans ce fichier, le site marche : exercices et modèles restent sur le téléphone, et le palmarès
 * est calculé sur le téléphone si le serveur ne répond pas.
 */

var L28 = { installed: false, MAX_EX: 100, MAX_TPL: 40, MAX_DET: 4000,
  GROUPS: ["Pecs", "Dos", "Jambes", "Épaules", "Bras", "Abdos", "Cardio", "Autre"],
  H_EX: ["membre", "id", "nom", "groupe", "cree"],
  H_TPL: ["membre", "id", "nom", "sport", "type", "details", "cree", "maj", "utilise"],
  H_REV: ["membre", "rev"] };

function l28ShEx_() { return sheetH_("ExercicesPerso", L28.H_EX); }
function l28ShTpl_() { return sheetH_("ModelesSeance", L28.H_TPL); }
function l28ShRev_() { return sheetH_("Bibliotheque", L28.H_REV); }
function l28Lc_(s) { return String(s == null ? "" : s).toLowerCase(); }
/** Texte court, sans formule (= + - @ en tête), espaces normalisés. */
function l28Txt_(v, n) { return String(v == null ? "" : v).replace(/\\s+/g, " ").trim().replace(/^[=+\\-@]+/, "").trim().slice(0, n); }
function l28Id_(v) { v = String(v || ""); return /^[a-z0-9]{4,24}$/.test(v) ? v : ""; }
function l28Ts_(v) { var n = Math.round(Number(v) || 0); return n > 1.5e12 && n < 4e12 ? n : 0; }

/** Lignes d'un onglet (sans l'en-tête). */
function l28Rows_(sh, w) { var last = sh.getLastRow(); return last >= 2 ? sh.getRange(2, 1, last - 1, w).getValues() : []; }
/** Remplace les lignes d'un membre (sous verrou) : relit tout, enlève les siennes, ajoute les nouvelles, réécrit. */
function l28Replace_(sh, w, p, rows) {
  var keep = l28Rows_(sh, w).filter(function (r) { return r[0] !== "" && l28Lc_(r[0]) !== p; });
  var all = keep.concat(rows), last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, w).clearContent();
  if (all.length) sh.getRange(2, 1, all.length, w).setValues(all);
}

function l28Rev_(p) {
  var rev = 0;
  l28Rows_(l28ShRev_(), 2).forEach(function (r) { if (l28Lc_(r[0]) === p) rev = Number(r[1]) || 0; });
  return rev;
}
function l28Lib_(p) {
  var ex = [], tpl = [];
  l28Rows_(l28ShEx_(), 5).forEach(function (r) { if (l28Lc_(r[0]) === p && r[1]) ex.push({ id: String(r[1]), n: String(r[2]), g: String(r[3] || "Autre"), c: Number(r[4]) || 0 }); });
  l28Rows_(l28ShTpl_(), 9).forEach(function (r) {
    if (l28Lc_(r[0]) !== p || !r[1]) return;
    var det = jsonSafe_(String(r[5] || "")); if (!det || typeof det !== "object") det = {};
    tpl.push({ id: String(r[1]), n: String(r[2]), sport: String(r[3]), det: det, c: Number(r[6]) || 0, m: Number(r[7]) || 0, u: Number(r[8]) || 0 });
  });
  return { rev: l28Rev_(p), ex: ex, tpl: tpl };
}

/** Détails d'un modèle : même validation que les séances (fichier Performances) si elle est disponible. */
function l28Det_(sport, det) {
  if (!det || typeof det !== "object" || Array.isArray(det)) return null;
  var d = JSON.parse(JSON.stringify(det)); delete d.tpl;
  if (typeof sp26Det_ === "function") { var r = sp26Det_(sport, d); if (!r || r.e) return null; d = r.det; }
  var s = JSON.stringify(d);
  return s.length <= L28.MAX_DET ? d : null;
}

function l28Get_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  return { status: "success", lib: l28Lib_(l28Lc_(me.pseudo)) };
}

function l28Save_(d) {
  var me = sessionUser_(d.token);
  if (!me) return err_("Session expirée.");
  var p = l28Lc_(me.pseudo), now = Date.now(), rev = l28Ts_(d.rev) || now, seen = {};
  var ex = (Array.isArray(d.ex) ? d.ex : []).slice(0, L28.MAX_EX).map(function (x) {
    x = x || {}; var id = l28Id_(x.id), n = l28Txt_(x.n, 40); if (!id || !n || seen[id]) return null; seen[id] = 1;
    var g = L28.GROUPS.indexOf(String(x.g)) >= 0 ? String(x.g) : "Autre";
    return [me.pseudo, id, n, g, l28Ts_(x.c) || now];
  }).filter(Boolean);
  var tpl = (Array.isArray(d.tpl) ? d.tpl : []).slice(0, L28.MAX_TPL).map(function (x) {
    x = x || {}; var id = l28Id_(x.id), n = l28Txt_(x.n, 40), sport = l28Txt_(x.sport, 40); if (!id || !n || !sport || seen[id]) return null; seen[id] = 1;
    var det = l28Det_(sport, x.det); if (!det) return null;
    return [me.pseudo, id, n, sport, String(det.k || ""), JSON.stringify(det), l28Ts_(x.c) || now, l28Ts_(x.m) || now, l28Ts_(x.u)];
  }).filter(Boolean);
  var stale = false;
  sp8Locked_(function () {
    if (l28Rev_(p) > rev) { stale = true; return; }   // un autre appareil a écrit plus récemment : l'appli refusionne
    l28Replace_(l28ShEx_(), 5, p, ex);
    l28Replace_(l28ShTpl_(), 9, p, tpl);
    l28Replace_(l28ShRev_(), 2, p, [[me.pseudo, rev]]);
  });
  if (stale) return { status: "success", stale: 1, lib: l28Lib_(p) };
  return { status: "success", rev: rev, ex: ex.length, tpl: tpl.length };
}

/** Supprime les données d'un membre (suppression de compte). */
function l28Delete_(pseudo) {
  var p = l28Lc_(pseudo);
  sp8Locked_(function () { l28Replace_(l28ShEx_(), 5, p, []); l28Replace_(l28ShTpl_(), 9, p, []); l28Replace_(l28ShRev_(), 2, p, []); });
}

function l28Install_() {
  if (L28.installed || typeof doPost !== "function" || typeof sessionUser_ !== "function") return;
  L28.installed = true;
  var prev = doPost, secPrev = typeof SEC !== "undefined" && SEC && SEC.installed && SEC.wrapper === doPost;
  var wrapper = function (e) {
    var raw = e && e.postData && typeof e.postData.contents === "string" ? e.postData.contents : "";
    var data = null; try { data = JSON.parse(raw); } catch (x) {}
    var a = data ? String(data.action || "") : "";
    var pal = a === "profil16" && typeof sp26Profile_ === "function";
    if (!pal && a !== "lib28Get" && a !== "lib28Save") return prev(e);
    if (secPrev) {
      if (raw.length > SEC.MAX_BYTES) return out_(err_("Requête trop volumineuse."));
      try { var stop = secGuard_(data); if (stop) return out_(stop); } catch (x) {}
      var flag = { changed: false }; data = secClean_(data, 0, flag);
    }
    try { return out_(pal ? sp26Profile_(data) : a === "lib28Get" ? l28Get_(data) : l28Save_(data)); }
    catch (err) {
      var m = String(err && err.message || err);
      // l'erreur exacte (avec la ligne) reste dans le journal d'exécution
      try { console.error("lot28 " + a + " " + (err && err.stack || m)); } catch (x) {}
      return out_({ status: "error", message: /lock/i.test(m) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
  };
  doPost = wrapper;
  if (secPrev) SEC.wrapper = doPost;

  if (typeof deleteAccountData_ === "function") {
    var del = deleteAccountData_;
    deleteAccountData_ = function (pseudo) { var r = del(pseudo); try { l28Delete_(pseudo); } catch (x) {} return r; };
  }
  if (typeof accountExport_ === "function") {
    var exp = accountExport_;
    accountExport_ = function (d) {
      var r = exp(d);
      try { if (r && r.status === "success" && r.data && r.data.pseudo) { var l = l28Lib_(l28Lc_(r.data.pseudo)); r.data.exercicesPerso = l.ex; r.data.modelesSeance = l.tpl; } } catch (x) {}
      return r;
    };
  }
}
l28Install_();

/** Vérifie l'installation et teste le palmarès de chaque membre (lecture seule). */
function lot28Verifier() {
  if (!L28.installed) return console.log("PROBLÈME : Lot28 n'est pas chargé (place-le tout en bas, sous Lot27).");
  l28ShEx_(); l28ShTpl_(); l28ShRev_();
  console.log("OK : exercices perso et modèles de séance actifs (onglets ExercicesPerso, ModelesSeance, Bibliotheque).");
  if (typeof sp26All_ !== "function" || typeof sp26Palmares_ !== "function") return console.log("Palmarès : fichier Performances introuvable.");
  var t0 = Date.now(), all = sp26All_(), t1 = Date.now(), by = {}, bad = 0;
  all.forEach(function (t) { var k = l28Lc_(t.owner); (by[k] = by[k] || []).push(t); });
  Object.keys(by).forEach(function (p) {
    try { sp26Palmares_(by[p], all, p, true); }
    catch (err) { bad++; console.log("PALMARÈS EN ERREUR pour " + p + " : " + (err && err.stack || err)); }
  });
  console.log("Palmarès : " + all.length + " séances lues en " + (t1 - t0) + " ms, " + Object.keys(by).length + " membres testés en " + (Date.now() - t1) + " ms, " + bad + " en erreur.");
}

;

// ===== 17-Lot29.gs =====
/**
 * Spary · Lot 29 : les entraînements comptent comme des séances (points), rattrapage du passé,
 * publication d'un entraînement dans le fil avec un commentaire.
 *
 * OÙ LE METTRE : nouveau fichier « Lot29 » (+ → Script), TOUT EN BAS de la liste des fichiers (sous Lot28).
 * Ne modifie aucun autre fichier, Code.gs compris. Comme Lot28, il réapplique lui-même les protections de Securite.
 *
 * PUIS :
 *  1. Exécuter lot29Simuler : le journal montre les points qui seraient ajoutés aux entraînements passés (rien n'est écrit).
 *  2. Exécuter lot29Rattrapage : ajoute ces points (une seule fois : relancer ne double rien).
 *  3. Exécuter lot29Verifier : le journal doit afficher « OK ».
 *  4. Déployer → Gérer les déploiements → crayon → Nouvelle version.
 *
 * Règle des points (modifiable ci-dessous) :
 *  - chaque entraînement d'au moins 10 min rapporte 100 pts, au plus 2 entraînements récompensés par jour (heure de Paris) ;
 *  - ce quota est séparé de celui de « Poster une séance » (1 par jour, inchangé) ;
 *  - supprimer un entraînement retire ses points (déjà le cas avant) ;
 *  - publier un entraînement dans le fil ne rapporte pas de points en plus : l'entraînement a déjà les siens.
 * Onglet créé tout seul : PublicationsEntrainement (entrainement | annonce | membre | date).
 */

var L29 = { installed: false, POINTS: 100, PER_DAY: 2, MIN_S: 600, TYPE: "entrainement",
  H_PUB: ["entrainement", "annonce", "membre", "date (ms)"] };

function l29Lc_(s) { return String(s == null ? "" : s).toLowerCase(); }
function l29Day_(ms) { return Utilities.formatDate(new Date(ms || Date.now()), (typeof SP8 !== "undefined" && SP8.TZ) || "Europe/Paris", "yyyy-MM-dd"); }
function l29ShPub_() { return sheetH_("PublicationsEntrainement", L29.H_PUB); }
function l29Rows_(sh, w) { var last = sh.getLastRow(); return last >= 2 ? sh.getRange(2, 1, last - 1, w).getValues() : []; }

/** Points d'un entraînement (clé "e:id" ou "e:id:g" pour l'invité). Appelée sous verrou. */
function l29Award_(pseudo, key) {
  var today = l29Day_(), p = l29Lc_(pseudo), n = 0, dup = false;
  l29Rows_(sp8ShPoints_(), 6).forEach(function (r) {
    if (l29Lc_(r[1]) !== p) return;
    var k = String(r[3]);
    if (k === key) dup = true;
    if (k.indexOf("e:") === 0 && String(r[5]) === today) n++;
  });
  if (dup) return { points: 0, capped: false, dup: true };
  if (n >= L29.PER_DAY) return { points: 0, capped: true };
  sp8ShPoints_().appendRow([Date.now(), pseudo, L29.TYPE, key, L29.POINTS, today]);
  sp26DropCaches_();
  return { points: L29.POINTS, capped: false };
}

/* ===================== Rattrapage des entraînements passés ===================== */
/** Lignes de points manquantes : entraînement ≥ 10 min, pas encore récompensé, 2 par membre et par jour au plus. */
function l29Missing_() {
  var have = {}, perDay = {}, hid = typeof hidden_ === "function" ? hidden_() : {};
  l29Rows_(sp8ShPoints_(), 6).forEach(function (r) {
    var k = String(r[3]); if (k.indexOf("e:") !== 0) return;
    have[l29Lc_(r[1]) + "|" + k] = 1;
    var d = l29Lc_(r[1]) + "|" + String(r[5]); perDay[d] = (perDay[d] || 0) + 1;
  });
  var add = [];
  sp26All_().sort(function (a, b) { return a.start - b.start; }).forEach(function (t) {
    if (!t.id || !(t.dur >= L29.MIN_S) || hid["entrainement:" + t.id]) return;
    var who = [[t.owner, "e:" + t.id]];
    if (t.with && t.wst === "accepté") who.push([t.with, "e:" + t.id + ":g"]);
    who.forEach(function (w) {
      var p = l29Lc_(w[0]); if (!p || have[p + "|" + w[1]]) return;
      var day = l29Day_(t.start || Date.now()), d = p + "|" + day;
      if ((perDay[d] || 0) >= L29.PER_DAY) return;
      perDay[d] = (perDay[d] || 0) + 1; have[p + "|" + w[1]] = 1;
      add.push([Number(t.start) || Date.now(), String(w[0]), L29.TYPE, w[1], L29.POINTS, day]);
    });
  });
  return add;
}
function l29Report_(add) {
  var by = {};
  add.forEach(function (r) { var k = r[1]; by[k] = (by[k] || 0) + r[4]; });
  var keys = Object.keys(by);
  keys.forEach(function (k) { console.log("  " + k + " : +" + by[k] + " pts"); });
  return keys.length;
}
/** Montre ce que ferait le rattrapage, sans rien écrire. */
function lot29Simuler() {
  var add = l29Missing_();
  console.log(add.length + " entraînement(s) passé(s) à récompenser :");
  l29Report_(add);
  if (!add.length) console.log("Rien à rattraper.");
}
/** Ajoute les points manquants (sous verrou ; relancer ne double rien). */
function lot29Rattrapage() {
  var add = sp8Locked_(function () {
    var a = l29Missing_();
    if (a.length) { var sh = sp8ShPoints_(); sh.getRange(sh.getLastRow() + 1, 1, a.length, 6).setValues(a); }
    return a;
  });
  sp26DropCaches_();
  console.log("Rattrapage fait : " + add.length + " entraînement(s) récompensé(s).");
  l29Report_(add);
}

/* ===================== Publier un entraînement dans le fil ===================== */
function l29Post_(e, data, prev) {
  var me = sessionUser_(data.token);
  if (!me) return out_(err_("Session expirée, reconnectez-vous."));
  var id = String(data.train || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40), p = l29Lc_(me.pseudo);
  if (!id) return prev(e);
  // déjà publiée (et l'annonce existe encore) ?
  var live = {};
  try { rowsAll_(sheet_("Annonces", true)).forEach(function (r) { if (r[0]) live[String(r[0])] = 1; }); } catch (x) { live = null; }
  var already = l29Rows_(l29ShPub_(), 4).some(function (r) { return String(r[0]) === id && l29Lc_(r[2]) === p && (!live || live[String(r[1])]); });
  if (already) return out_(err_("Cette séance est déjà publiée dans le fil."));
  // sport et durée lus sur le serveur quand l'entraînement y est déjà
  var t = null;
  sp26All_().forEach(function (x) { if (x.id === id && l29Lc_(x.owner) === p) t = x; });
  var d = JSON.parse(JSON.stringify(data));
  if (t) { d.sport = t.sport; d.dur = Math.max(1, Math.round(t.dur / 60)); }
  d.dur = Math.min(480, Math.max(1, Math.round(Number(d.dur) || 0)));
  delete d.train;
  var e2 = { parameter: e && e.parameter || {}, postData: { contents: JSON.stringify(d), type: "application/json" } };
  var keepDur = SP8.SEANCE_MIN_DUR, keepTxt = SP8.SEANCE_MIN_TEXT, res;
  SP8.SEANCE_MIN_DUR = 1; SP8.SEANCE_MIN_TEXT = 1;   // un entraînement publié peut être court ; le texte contient toujours le résumé
  try { res = sp8Parse_(prev(e2)); } finally { SP8.SEANCE_MIN_DUR = keepDur; SP8.SEANCE_MIN_TEXT = keepTxt; }
  if (!res || res.status !== "success" || !res.id) return out_(res || err_("Publication impossible."));
  var aid = String(res.id);
  sp8After_(function () {
    // pas de points en double : l'entraînement a déjà les siens
    if (res.points > 0) rewriteRows_(sp8ShPoints_(), function (r) { return r[2] === "seance" && String(r[3]) === aid && l29Lc_(r[1]) === p ? null : r; });
    l29ShPub_().appendRow([id, aid, me.pseudo, Date.now()]);
    sp26DropCaches_();
  });
  res.points = 0; res.capped = false; res.train = id;
  return out_(res);
}

/* ===================== Installation ===================== */
function l29Install_() {
  if (L29.installed || typeof doPost !== "function" || typeof sessionUser_ !== "function"
      || typeof SP26 === "undefined" || typeof sp26Award_ !== "function" || typeof SP8 === "undefined") return;
  L29.installed = true;
  SP26.MIN_POINTS_S = L29.MIN_S;
  var award = sp26Award_;
  sp26Award_ = function (pseudo, key) { return String(key).indexOf("e:") === 0 ? l29Award_(pseudo, key) : award(pseudo, key); };

  var prev = doPost, secPrev = typeof SEC !== "undefined" && SEC && SEC.installed && SEC.wrapper === doPost;
  var wrapper = function (e) {
    var raw = e && e.postData && typeof e.postData.contents === "string" ? e.postData.contents : "";
    var data = null; try { data = JSON.parse(raw); } catch (x) {}
    if (!data || data.action !== "postCreate" || !data.train) return prev(e);
    if (secPrev) {
      if (raw.length > SEC.MAX_BYTES) return out_(err_("Requête trop volumineuse."));
      try { var stop = secGuard_(data); if (stop) return out_(stop); } catch (x) {}
      var flag = { changed: false }; data = secClean_(data, 0, flag);
    }
    try { return l29Post_(e, data, prev); }
    catch (err) {
      var m = String(err && err.message || err);
      try { console.error("lot29 postCreate " + (err && err.stack || m)); } catch (x) {}
      return out_({ status: "error", message: /lock/i.test(m) ? "Serveur occupé, réessayez dans quelques secondes." : "Erreur serveur, réessayez dans un instant." });
    }
  };
  doPost = wrapper;
  if (secPrev) SEC.wrapper = doPost;

  if (typeof deleteAccountData_ === "function") {
    var del = deleteAccountData_;
    deleteAccountData_ = function (pseudo) {
      var r = del(pseudo), p = l29Lc_(pseudo);
      try { sp8Locked_(function () { rewriteRows_(l29ShPub_(), function (x) { return l29Lc_(x[2]) === p ? null : x; }); }); } catch (x) {}
      return r;
    };
  }
}
l29Install_();

/** Vérifie l'installation (lecture seule). */
function lot29Verifier() {
  if (!L29.installed) return console.log("PROBLÈME : Lot29 n'est pas chargé (place-le tout en bas, sous Lot28, et vérifie que Performances est présent).");
  l29ShPub_();
  var miss = l29Missing_().length;
  console.log("OK : entraînements récompensés dès " + Math.round(L29.MIN_S / 60) + " min, " + L29.POINTS + " pts, " + L29.PER_DAY + " par jour. Publication dans le fil active (onglet PublicationsEntrainement).");
  console.log(miss ? "À FAIRE : " + miss + " entraînement(s) passé(s) pas encore récompensé(s) → exécuter lot29Rattrapage." : "Rattrapage : à jour.");
}

;

// ===== 18-Lot30.gs =====
/**
 * Spary · Lot 30 : notifications quand on te mentionne (@pseudo), quand on répond à ton commentaire
 * et quand on commente ton annonce.
 * OÙ : nouveau fichier « Lot30 » (+ → Script), TOUT EN BAS de la liste (sous Lot29, ou sous Lot28 si Lot29 n'est pas là).
 * Ne modifie aucun autre fichier. Puis exécuter lot30Verifier (doit afficher « OK »), puis Déployer → Nouvelle version.
 * Aucune donnée nouvelle : les notifications passent par la file existante (onglet PushFile).
 */
var L30 = { installed: false, MAX: 10 };

function l30Lc_(s) { return String(s == null ? "" : s).toLowerCase(); }
function l30Tab_(n) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }
function l30Rows_(n) { var sh = l30Tab_(n); return sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues() : []; }
function l30Ats_(t) { var o = [], re = /@([A-Za-z0-9_.-]{3,20})/g, m; while ((m = re.exec(String(t || "")))) if (o.indexOf(l30Lc_(m[1])) < 0) o.push(l30Lc_(m[1])); return o; }
function l30Ok_(me, p) {
  var a = findAccount_(p); if (!a || l30Lc_(a.pseudo) === l30Lc_(me)) return "";
  try { if (isBanned_(a.pseudo) || hides_(blocks_(me), a.pseudo) || hides_(blocks_(a.pseudo), me)) return ""; } catch (x) {}
  return a.pseudo;
}
function l30Cut_(t) { t = String(t || "").replace(/\\s+/g, " ").trim(); return t.length > 90 ? t.slice(0, 89) + "…" : t; }

/** Prépare les notifications d'une annonce ou d'un commentaire réussi. */
function l30On_(data, res) {
  var me = sessionUser_(data.token); if (!me) return;
  var who = sp14Name_(me), sent = {}, n = 0;
  var send = function (p, title, body, url, subj, gap) {
    var k = l30Lc_(p); if (!p || sent[k] || n >= L30.MAX) return; sent[k] = 1; n++;
    sp14Queue_([p], { title: title, body: body, url: url, subject: subj }, gap ? { gap: gap, except: me.pseudo } : { except: me.pseudo });
  };
  if (data.action === "postCreate") {
    var pid = String(res.id || ""); if (!pid) return;
    l30Ats_(String(data.title || "") + " " + String(data.text || "")).forEach(function (p) {
      send(l30Ok_(me.pseudo, p), "Tu es identifié·e", who + " t'a identifié·e : « " + l30Cut_(data.title || data.text) + " »", "./#post=" + pid, "men:" + pid);
    });
    return;
  }
  var id = String(data.id || ""), txt = String(data.text || ""), author = "", title = "", cm = {};
  l30Rows_("Annonces").forEach(function (r) { if (String(r[0]) === id) { author = String(r[1]); title = String(r[4] || r[5] || ""); } });
  l30Rows_("Commentaires").forEach(function (r) { if (String(r[1]) === id) cm[l30Lc_(r[2])] = 1; });
  var url = "./#post=" + id, ats = l30Ats_(txt), first = (txt.match(/^\\s*@([A-Za-z0-9_.-]{3,20})/) || [])[1];
  if (first && cm[l30Lc_(first)]) send(l30Ok_(me.pseudo, first), "Nouvelle réponse", who + " a répondu à ton commentaire : « " + l30Cut_(txt) + " »", url, "rep:" + id);
  ats.forEach(function (p) { send(l30Ok_(me.pseudo, p), "Tu es mentionné·e", who + " t'a mentionné·e : « " + l30Cut_(txt) + " »", url, "men:" + id); });
  if (author) send(l30Ok_(me.pseudo, author), "Nouveau commentaire", who + " a commenté « " + l30Cut_(title) + " » : " + l30Cut_(txt), url, "cmt:" + id, 60);
}

function l30Install_() {
  if (L30.installed || typeof doPost !== "function" || typeof sp14Queue_ !== "function" || typeof sessionUser_ !== "function") return;
  L30.installed = true;
  var prev = doPost, sec = typeof SEC !== "undefined" && SEC && SEC.installed && SEC.wrapper === doPost;
  doPost = function (e) {
    var out = prev(e), data = null;
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (!data || (data.action !== "postCreate" && data.action !== "postComment")) return out;
    try {
      var res = sp8Parse_(out);
      if (res && res.status === "success") { sp8After_(function () { l30On_(data, res); }); sp14Flush_(); }
    } catch (x) { try { console.error("lot30 " + (x && x.stack || x)); } catch (y) {} }
    return out;
  };
  if (sec) SEC.wrapper = doPost;
}
l30Install_();

/** Vérifie l'installation (lecture seule). */
function lot30Verifier() {
  if (!L30.installed) return console.log("PROBLÈME : Lot30 n'est pas chargé. Place-le tout en bas de la liste des fichiers.");
  var a = l30Tab_("Annonces"), c = l30Tab_("Commentaires");
  if (!a || !c) return console.log("PROBLÈME : onglet " + (!a ? "Annonces" : "Commentaires") + " introuvable.");
  console.log("Colonnes Commentaires : " + c.getRange(1, 1, 1, 6).getValues()[0].join(" | "));
  console.log("OK : notifications actives (mention @, réponse à un commentaire, commentaire sur ton annonce).");
}
`;

// functions/api/index.ts
var env = (k) => Deno.env.get(k) || "";
var sql = postgres(env("SUPABASE_DB_URL"), { max: 4, prepare: false, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} });
var SELF = env("SUPABASE_URL").replace(/\/+$/, "") + "/functions/v1/api";
var CRON = new Set(["sp34Rappels", "sp34Nettoyer", "rgpdQuotidien", "secSauvegarder", "secControleQuotidien", "sp17MettreAJour"]);
function dueNow(d = new Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hourCycle: "h23", hour: "2-digit", minute: "2-digit", weekday: "short" }).formatToParts(d).map((x) => [x.type, x.value]));
  const h = +p.hour, m = +p.minute, top = m < 15, out = ["sp34Rappels"];
  if (top && h === 4)
    out.push("sp34Nettoyer", "rgpdQuotidien", "sp17MettreAJour");
  if (top && h === 7)
    out.push("secControleQuotidien");
  if (top && h === 3 && p.weekday === "Sun")
    out.push("secSauvegarder");
  return out;
}
var cronKey = "";
async function cronSecret() {
  if (cronKey)
    return cronKey;
  if (env("CRON_SECRET"))
    return cronKey = env("CRON_SECRET");
  try {
    const r = await sql`select decrypted_secret from vault.decrypted_secrets where name = 'spary_cron' limit 1`;
    cronKey = r[0]?.decrypted_secret || "";
  } catch {
    cronKey = "";
  }
  return cronKey;
}
var ORIGINS = ["https://spary.fr", "https://www.spary.fr", "capacitor://localhost", "http://localhost", "https://localhost", "ionic://localhost"];
function cors(req) {
  const o = req.headers.get("origin") || "";
  const okO = ORIGINS.includes(o) || /^https:\/\/[a-z0-9-]+(--[a-z0-9-]+)?\.netlify\.app$/.test(o);
  return { "Access-Control-Allow-Origin": okO ? o : ORIGINS[0], "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", Vary: "Origin" };
}
Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: h });
  const url = new URL(req.url);
  try {
    if (req.method === "POST" && url.searchParams.get("cron")) {
      const fn = url.searchParams.get("cron"), key = await cronSecret();
      if (!key || req.headers.get("x-cron-secret") !== key)
        return new Response("interdit", { status: 403 });
      const list = fn === "quart" ? dueNow() : CRON.has(fn) ? [fn] : [];
      if (!list.length)
        return new Response("tâche inconnue", { status: 400 });
      const done = {};
      for (const f of list) {
        try {
          const r = await runGas({ sql, code: CODE, env, scriptUrl: SELF }, { kind: "call", fn: f });
          done[f] = r.logs.slice(-5);
        } catch (e) {
          console.error("cron " + f, e);
          done[f] = "ERREUR " + String(e).slice(0, 300);
        }
      }
      return new Response(JSON.stringify({ ok: true, done }), { headers: { "Content-Type": "application/json" } });
    }
    if (req.method === "GET") {
      const params = {};
      url.searchParams.forEach((v, k) => {
        params[k] = v;
      });
      const r = await runGas({ sql, code: CODE, env, scriptUrl: SELF }, { kind: "get", params });
      return new Response(r.out, { headers: { ...h, "Content-Type": "application/json; charset=utf-8" } });
    }
    const body = await req.text();
    if (body.length > 150000)
      return new Response(JSON.stringify({ status: "error", message: "Requête trop volumineuse." }), { headers: { ...h, "Content-Type": "application/json" } });
    let action = "";
    try {
      action = String(JSON.parse(body).action || "");
    } catch {}
    const r = await runGas({ sql, code: CODE, env, scriptUrl: SELF }, { kind: "post", body, action });
    return new Response(r.out, { headers: { ...h, "Content-Type": "application/json; charset=utf-8" } });
  } catch (e) {
    console.error("api", e);
    return new Response(JSON.stringify({ status: "error", message: "Erreur serveur, réessayez dans un instant." }), { headers: { ...h, "Content-Type": "application/json" } });
  }
});
