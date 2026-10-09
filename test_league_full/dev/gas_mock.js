// In-memory mock of the Apps Script services used by Code.gs (test harness only).
const crypto = require('crypto'), vm = require('vm');
function load(code) {

function colToNum(c) { return c.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0); }
class Sheet {
  constructor(name) { this.name = name; this.data = []; }
  getLastRow() { let n = this.data.length; while (n && this.data[n - 1].every(v => v === '' || v === undefined)) n--; return n; }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
  ensure(r, c) { while (this.data.length < r) this.data.push([]); for (const row of this.data) while (row.length < c) row.push(''); }
  getRange(r, c, nr, nc) {
    if (typeof r === 'string') { const [a, b] = r.split(':'); return new Range(this, 1, colToNum(a), 1000, colToNum(b) - colToNum(a) + 1); }
    return new Range(this, r, c, nr || 1, nc || 1);
  }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(row) { const r = this.getLastRow(); this.ensure(r + 1, row.length); this.data[r] = row.slice(); for (let i = row.length; i < this.data[r].length; i++) this.data[r][i] = ''; }
  deleteRow(i) { this.data.splice(i - 1, 1); }
  setFrozenRows() {}
}
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { this.sh.ensure(this.r + this.nr - 1, this.c + this.nc - 1); const out = [];
    for (let i = 0; i < this.nr; i++) out.push(this.sh.data[this.r - 1 + i].slice(this.c - 1, this.c - 1 + this.nc)); return out; }
  setValues(v) { if (v.length !== this.nr || v[0].length !== this.nc) throw new Error('setValues size mismatch ' + v.length + 'x' + v[0].length + ' vs ' + this.nr + 'x' + this.nc);
    this.sh.ensure(this.r + this.nr - 1, this.c + this.nc - 1);
    v.forEach((row, i) => row.forEach((x, j) => { this.sh.data[this.r - 1 + i][this.c - 1 + j] = x; })); return this; }
  clearContent() { this.sh.ensure(this.r + this.nr - 1, this.c + this.nc - 1);
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.data[this.r - 1 + i][this.c - 1 + j] = ''; return this; }
  setFontWeight() { return this; } setNumberFormat() { return this; }
}
const sheets = {};
const SS = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)) };
let now = Date.now();
const cacheStore = {};
const Cache = {
  get: k => { const e = cacheStore[k]; return e && e.exp > now ? e.v : null; },
  put: (k, v, s) => { if (v.length > 100000) throw new Error('too big'); cacheStore[k] = { v, exp: now + (s || 600) * 1000 }; },
  remove: k => { delete cacheStore[k]; }, removeAll: ks => ks.forEach(k => delete cacheStore[k]),
};
const props = {};
const toBytes = s => Array.from(Buffer.from(s, 'utf8'));
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => SS, flush() {} },
  CacheService: { getScriptCache: () => Cache },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] === undefined ? null : props[k], setProperty: (k, v) => { props[k] = v; } }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    base64EncodeWebSafe: x => Buffer.from(typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.map(b => b & 255))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: s => Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    newBlob: bytes => ({ getDataAsString: () => Buffer.from(bytes.map(b => b & 255)).toString('utf8') }),
    computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()).map(b => b > 127 ? b - 256 : b),
  },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ content: s, setMimeType() { return this; } }) },
  Logger: { log: () => {} },
  Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } },
  console, JSON, Math, Number, String, Object, Array, Error, isFinite, parseInt,
};


  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx, sheets, props, setNow: t => { now = t; }, getNow: () => now, advance: ms => { now += ms; } };
}
module.exports = { load };
