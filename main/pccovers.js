// (beta.5) Choosing a PC game's cover: Steam, Epic, Quiver and games added by hand (console games have the Art Studio).
// The options: SteamGridDB's posters (with the player's own SteamGridDB key, Settings → Accounts & services), Steam's own
// cover for a Steam game, and a picture of your own. The chosen one is kept as data\pc-covers\<game id>.<ext> and wins over
// every automatic cover (cover(id)); Reset goes back to the automatic one.
// The page may only show local files, so the posters' thumbnails are fetched here into data\pc-cover-cache (by address,
// a few at a time) and handed back as bsfile: addresses. The page only ever names a game id and an option's key: the
// addresses stay here (last options per game).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let o = { dataDir: '', log: () => {} };
const EXTS = ['jpg', 'png', 'webp'];
const safeId = id => String(id || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 120);
const dir = () => path.join(o.dataDir, 'pc-covers'), autoDir = () => path.join(o.dataDir, 'pc-auto-covers'), cacheDir = () => path.join(o.dataDir, 'pc-cover-cache');
const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const sha = s => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 24);
const extOf = (u, buf) => { if (buf && buf[0] === 0x89 && buf[1] === 0x50) return 'png'; if (buf && buf.slice(8, 12).toString() === 'WEBP') return 'webp'; const m = /\.(png|webp|jpe?g)(?:$|\?)/i.exec(String(u || '')); return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg'; };

function init(opts) { o = Object.assign(o, opts || {}); }

// the chosen cover of a game, or null
function cover(id) { const b = path.join(dir(), safeId(id)); for (const e of EXTS) if (isFile(b + '.' + e)) return b + '.' + e; return null; }
function autoCover(id) { const b = path.join(autoDir(), safeId(id)); for (const e of EXTS) if (isFile(b + '.' + e)) return b + '.' + e; return null; }
function clear(id) { const b = path.join(dir(), safeId(id)); for (const e of EXTS) { try { fs.unlinkSync(b + '.' + e); } catch {} } }
async function save(id, buf, ext) {
  fs.mkdirSync(dir(), { recursive: true });
  const dest = path.join(dir(), safeId(id) + '.' + ext), tmp = dest + '.tmp';
  await fs.promises.writeFile(tmp, buf); clear(id); await fs.promises.rename(tmp, dest); return dest;
}
async function saveAuto(id, buf, ext) {
  if (!EXTS.includes(ext)) ext = extOf('', buf);
  fs.mkdirSync(autoDir(), { recursive: true });
  const b = path.join(autoDir(), safeId(id)), dest = b + '.' + ext, tmp = dest + '.tmp';
  await fs.promises.writeFile(tmp, buf);
  for (const e of EXTS) { if (e !== ext) try { await fs.promises.unlink(b + '.' + e); } catch {} }
  await fs.promises.rename(tmp, dest); return dest;
}

// PC titles have no ROM metadata to match against. Use the same exact-title SteamGridDB lookup as the cover picker,
// keeping automatic posters separate so Steam/library art and a user's explicit cover choice always take precedence.
async function fillMissing(games) {
  if (!o.steamgrid || !o.steamgrid.enabled()) return { checked: 0, downloaded: 0 };
  const unique = new Map();
  for (const g of Array.isArray(games) ? games : []) {
    if (!g || !g.id || !g.title || g.art && g.art.front || cover(g.id) || autoCover(g.id)) continue;
    unique.set(String(g.id), g);
  }
  let checked = 0, downloaded = 0;
  for (const g of unique.values()) {
    checked++;
    const posters = await o.steamgrid.posters(g.appid ? { appid: g.appid, title: g.title } : { title: g.title, names: [g.title] }, o.match);
    for (const p of posters.slice(0, 3)) {
      const buf = await o.fetchImage(p.url);
      if (!buf) continue;
      await saveAuto(g.id, buf, String(p.ext || extOf(p.url, buf)).replace(/^\./, ''));
      downloaded++; break;
    }
  }
  return { checked, downloaded };
}

// a thumbnail, fetched once into the cache (three at a time); null when it couldn't be fetched
let slots = 3; const waiting = [];
async function slot(fn) { if (slots > 0) slots--; else await new Promise(r => waiting.push(r)); try { return await fn(); } finally { const n = waiting.shift(); if (n) n(); else slots++; } }
async function thumb(url) {
  if (!url) return null;
  const f = path.join(cacheDir(), sha(url));
  for (const e of EXTS) if (isFile(f + '.' + e)) return f + '.' + e;
  return slot(async () => { const b = await o.fetchImage(url); if (!b) return null; fs.mkdirSync(cacheDir(), { recursive: true }); const p = f + '.' + extOf(url, b); await fs.promises.writeFile(p, b); return p; });
}

// the options for one game: { list: [{ key, thumb, source, label, sub }], sgdb: has a SteamGridDB key, current: chosen? }
const last = new Map(); // game id → { key → full address }
async function options(game) {
  const id = String(game.id), keys = {}, list = [];
  const mine = cover(id); if (mine) list.push({ key: 'current', thumb: o.fileUrl(mine), source: 'yours', label: 'Your choice now', sub: 'Chosen before' });
  if (game.appid) { const s = o.steamCover(game.appid); if (s) { keys.steam = { file: s }; list.push({ key: 'steam', thumb: o.fileUrl(s), source: 'steam', label: "Steam's cover", sub: 'From your Steam library' }); } }
  const sgdb = !!(o.steamgrid && o.steamgrid.enabled && o.steamgrid.enabled());
  if (sgdb) {
    let posters = [];
    try { posters = await o.steamgrid.posters(game.appid ? { appid: game.appid, title: game.title } : { title: game.title, names: [game.title] }, o.match); } catch (e) { o.log('PC cover: SteamGridDB', e.message); }
    const got = await Promise.all(posters.slice(0, 24).map(async (p, i) => ({ p, i, t: await thumb(p.thumbUrl || p.url) })));
    for (const { p, i, t } of got) { if (!t) continue; const k = 'sg' + i; keys[k] = { url: p.url }; list.push({ key: k, thumb: o.fileUrl(t), source: 'steamgriddb', label: p.styleName ? `SteamGridDB · ${p.styleName}` : 'SteamGridDB', sub: p.author ? 'by ' + p.author : '' }); }
  }
  last.set(id, keys);
  return { list, sgdb, current: !!mine };
}
// use one of the last options (by key) as the game's cover
async function use(id, key) {
  id = String(id); const k = (last.get(id) || {})[String(key || '')]; if (!k) throw new Error('That cover isn\'t in the list any more. Open the picker again.');
  let buf = null, ext = 'jpg';
  if (k.file) { buf = await fs.promises.readFile(k.file); ext = extOf(k.file, buf); }
  else if (k.url) { buf = await o.fetchImage(k.url); if (!buf) throw new Error("Couldn't download that cover. Check the connection and try again."); ext = extOf(k.url, buf); }
  const dest = await save(id, buf, ext); o.log('PC cover chosen:', id, key.startsWith('sg') ? 'SteamGridDB' : key); return dest;
}
// a picture of your own (a file the player picked in the dialog)
async function own(id, file) {
  const ext = String(path.extname(file)).slice(1).toLowerCase().replace('jpeg', 'jpg'); if (!EXTS.includes(ext)) throw new Error('Pick a JPG, PNG or WebP picture.');
  const st = await fs.promises.stat(file); if (st.size > 25e6) throw new Error('That picture is too big (over 25 MB).');
  return save(String(id), await fs.promises.readFile(file), ext);
}

module.exports = { init, cover, autoCover, fillMissing, options, use, own, reset: id => clear(String(id)) };
