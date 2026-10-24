// Date « à l'heure de Paris », comme dans Apps Script (fuseau du script = Europe/Paris).
// Le serveur Supabase tourne en UTC : sans ça, getHours(), new Date(a, m, j)… seraient décalés.

const TZ = "Europe/Paris";
const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
});
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

type Parts = { y: number; mo: number; d: number; h: number; mi: number; s: number; ms: number; wd: number };
function parts(t: number): Parts {
  const o: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(t))) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month - 1, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, ms: ((t % 1000) + 1000) % 1000, wd: WD[o.weekday] };
}
// Décalage (ms) de Paris par rapport à UTC à l'instant t.
function offsetAt(t: number): number {
  const p = parts(t);
  return Date.UTC(p.y, p.mo, p.d, p.h, p.mi, p.s, p.ms) - t;
}
// Heure locale de Paris → instant UTC.
export function parisToUtc(y: number, mo: number, d = 1, h = 0, mi = 0, s = 0, ms = 0): number {
  const guess = Date.UTC(y, mo, d, h, mi, s, ms);
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return t;
}

const NativeDate = Date;

function parseLocal(str: string): number {
  // « 2026-10-24 » seul = UTC en JS ; « 2026-10-24T18:00 » sans fuseau = heure locale (Paris).
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (m) return parisToUtc(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), +((m[7] || "0").padEnd(3, "0")));
  const m2 = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m2) return parisToUtc(+m2[1], +m2[2] - 1, +m2[3], +(m2[4] || 0), +(m2[5] || 0), +(m2[6] || 0));
  return NativeDate.parse(str);
}

// deno-lint-ignore no-explicit-any
export class ParisDate extends (NativeDate as any) {
  // deno-lint-ignore no-explicit-any
  constructor(...a: any[]) {
    if (a.length === 0) super(ParisDate._now());
    else if (a.length === 1) {
      const v = a[0];
      if (typeof v === "string") super(parseLocal(v));
      else if (v instanceof NativeDate) super(v.getTime());
      else super(v);
    } else super(parisToUtc(a[0], a[1], a.length > 2 ? a[2] : 1, a[3] || 0, a[4] || 0, a[5] || 0, a[6] || 0));
  }
  static _now: () => number = () => NativeDate.now();
  static now() { return ParisDate._now(); }
  static parse(s: string) { return parseLocal(String(s)); }
  static UTC(...a: number[]) { return (NativeDate.UTC as (...x: number[]) => number)(...a); }
  _p(): Parts { return parts(this.getTime()); }
  getFullYear() { return this._p().y; }
  getMonth() { return this._p().mo; }
  getDate() { return this._p().d; }
  getDay() { return this._p().wd; }
  getHours() { return this._p().h; }
  getMinutes() { return this._p().mi; }
  getSeconds() { return this._p().s; }
  getMilliseconds() { return this._p().ms; }
  getYear() { return this._p().y - 1900; }
  getTimezoneOffset() { return -Math.round(offsetAt(this.getTime()) / 60000); }
  _set(ch: Partial<Parts>) {
    const p = { ...this._p(), ...ch };
    const t = parisToUtc(p.y, p.mo, p.d, p.h, p.mi, p.s, p.ms);
    this.setTime(t); return t;
  }
  setFullYear(y: number, mo?: number, d?: number) { return this._set({ y, ...(mo !== undefined ? { mo } : {}), ...(d !== undefined ? { d } : {}) }); }
  setMonth(mo: number, d?: number) { return this._set({ mo, ...(d !== undefined ? { d } : {}) }); }
  setDate(d: number) { return this._set({ d }); }
  setHours(h: number, mi?: number, s?: number, ms?: number) {
    return this._set({ h, ...(mi !== undefined ? { mi } : {}), ...(s !== undefined ? { s } : {}), ...(ms !== undefined ? { ms } : {}) });
  }
  setMinutes(mi: number, s?: number, ms?: number) { return this._set({ mi, ...(s !== undefined ? { s } : {}), ...(ms !== undefined ? { ms } : {}) }); }
  setSeconds(s: number, ms?: number) { return this._set({ s, ...(ms !== undefined ? { ms } : {}) }); }
  setMilliseconds(ms: number) { return this._set({ ms }); }
  toLocaleDateString(l?: string, o?: Intl.DateTimeFormatOptions) { return new NativeDate(this.getTime()).toLocaleDateString(l, { timeZone: TZ, ...(o || {}) }); }
  toLocaleTimeString(l?: string, o?: Intl.DateTimeFormatOptions) { return new NativeDate(this.getTime()).toLocaleTimeString(l, { timeZone: TZ, ...(o || {}) }); }
  toLocaleString(l?: string, o?: Intl.DateTimeFormatOptions) { return new NativeDate(this.getTime()).toLocaleString(l, { timeZone: TZ, ...(o || {}) }); }
  toString() {
    const p = this._p(), off = -this.getTimezoneOffset(), sg = off >= 0 ? "+" : "-", a = Math.abs(off);
    const z = (n: number, w = 2) => String(n).padStart(w, "0");
    const D = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${D[p.wd]} ${M[p.mo]} ${z(p.d)} ${p.y} ${z(p.h)}:${z(p.mi)}:${z(p.s)} GMT${sg}${z(Math.floor(a / 60))}${z(a % 60)} (CEST)`;
  }
}

export { parts as parisParts };
