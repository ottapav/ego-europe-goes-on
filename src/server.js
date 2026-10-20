// EGO – Europe Goes On: zero-dependency Node server.
// One shared EU world, persisted to a JSON file, resolved once per tick.
const http = require('http');
const fs = require('fs');
const path = require('path');
const E = require('./engine');
const C = require('./content');

const PORT = Number(process.env.PORT || 3000);
const TICK_MINUTES = Number(process.env.TICK_MINUTES || 1440); // one in-game year per real day by default
const ADMIN_KEY = process.env.ADMIN_KEY || ''; // empty = admin endpoints disabled
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'world.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

let world = load();

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return fresh(); }
}
function fresh() {
  const w = E.newWorld();
  w.nextTickAt = Date.now() + TICK_MINUTES * 60000;
  return w;
}
function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(world));
  fs.renameSync(tmp, DATA_FILE);
}
function tick() {
  E.resolveYear(world);
  world.nextTickAt = world.over ? null : Date.now() + TICK_MINUTES * 60000;
  save();
  console.log(`[tick] resolved, now year ${world.year}${world.over ? ' (game over: ' + world.ending.name + ')' : ''}`);
}
setInterval(() => { if (!world.over && world.nextTickAt && Date.now() >= world.nextTickAt) tick(); }, 10000);

const CONTENT = JSON.stringify({
  START_YEAR: C.START_YEAR, END_YEAR: C.END_YEAR, AP_PER_YEAR: C.AP_PER_YEAR, LEVELS: C.LEVELS, LEVEL_THRESHOLDS: C.LEVEL_THRESHOLDS,
  EU_FACTS: C.EU_FACTS, STATES: C.STATES, GOALS: C.GOALS, THREATS: C.THREATS, RIVALS: C.RIVALS, PARTNERS: C.PARTNERS,
  CARDS: C.CARDS, PROPOSALS: C.PROPOSALS, TICK_MINUTES,
});

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e5) { reject(new Error('Body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); } });
  });
}
function isAdmin(req) { return ADMIN_KEY && req.headers['x-admin-key'] === ADMIN_KEY; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/content') return send(res, 200, CONTENT);
    if (url.pathname === '/api/world' && req.method === 'GET') return send(res, 200, E.publicView(world, url.searchParams.get('player')));

    if (url.pathname === '/api/join' && req.method === 'POST') {
      const { name, state } = await readBody(req);
      if (world.over) return send(res, 400, { error: 'This game is over. Wait for a new one.' });
      if (!C.STATES[state]) return send(res, 400, { error: 'Pick one of the states.' });
      const p = E.addPlayer(world, { name: String(name || '').trim() || 'Anonymous', state });
      save();
      return send(res, 200, { playerId: p.id });
    }

    if (url.pathname === '/api/plan' && req.method === 'POST') {
      const { playerId, cards, vote } = await readBody(req);
      const p = world.players[playerId];
      if (!p || p.bot) return send(res, 404, { error: 'Unknown player. Join the game first.' });
      if (world.over) return send(res, 400, { error: 'The game is over.' });
      if (p.skipYear === world.year) return send(res, 400, { error: 'Your government fell: no actions this year.' });
      const v = E.validatePlan(world, p, cards);
      if (!v.ok) return send(res, 400, { error: v.error });
      world.plans[p.id] = v.cards;
      if (vote === 'yes' || vote === 'no') world.votes[p.id] = vote;
      p.lastActiveYear = world.year;
      save();
      return send(res, 200, { ok: true, plan: v.cards, ap: v.ap });
    }

    if (url.pathname === '/api/admin/tick' && req.method === 'POST') {
      if (!isAdmin(req)) return send(res, 403, { error: 'Admin key required' });
      tick();
      return send(res, 200, { ok: true, year: world.year, over: world.over });
    }
    if (url.pathname === '/api/admin/reset' && req.method === 'POST') {
      if (!isAdmin(req)) return send(res, 403, { error: 'Admin key required' });
      world = fresh(); save();
      return send(res, 200, { ok: true });
    }

    // static files
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Forbidden' });
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, { error: 'Not found' });
      send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream');
    });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});

if (require.main === module) {
  save();
  server.listen(PORT, () => console.log(`EGO – Europe Goes On running on http://localhost:${PORT} (one year every ${TICK_MINUTES} min)`));
}
module.exports = { server };
