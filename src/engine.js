// EGO – Europe Goes On: game engine. Pure functions over a plain JSON world object.
const C = require('./content');
const I18N = require('../public/i18n.js');
const EN = I18N.make('en', C); // English sentences for API error strings

const CARD_BY_ID = Object.fromEntries(C.CARDS.map(c => [c.id, c]));
const STATE_IDS = Object.keys(C.STATES);
const GOAL_IDS = Object.keys(C.GOALS);
const GOAL_PER_PLAYER = 4;
const STOCKS = ['prosperity', 'education', 'tech', 'security', 'trust', 'approval'];

// ---------- helpers ----------
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = v => Math.round(v * 10) / 10;
const uid = (world, r) => { world.nextId = (world.nextId || 0) + 1; return world.nextId.toString(36) + Math.floor(r() * 1e9).toString(36); };

function levelIndex(integration) {
  let lvl = 0;
  C.LEVEL_THRESHOLDS.forEach((t, i) => { if (integration >= t) lvl = i; });
  return lvl;
}
function maxApproval(p) { return 70 + p.res.education / 5; }

// ---------- world setup ----------
function newWorld(opts = {}) {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const world = {
    version: 1, seed, year: C.START_YEAR, over: false, ending: null,
    integration: 20, level: 0, treasury: 0,
    goals: Object.fromEntries(GOAL_IDS.map(g => [g, { progress: 0, done: false, doneYear: null, late: false }])),
    threats: Object.fromEntries(Object.entries(C.THREATS).map(([k, t]) => [k, t.start])),
    rivals: Object.fromEntries(Object.entries(C.RIVALS).map(([k, r]) => [k, r.start])),
    partners: { africa: 0, mideast: 0 },
    euInfluence: 30, euScore: 0, lowTrustYears: 0,
    flags: {}, // EU-wide flags (e.g. solidarityPassed)
    players: {}, plans: {}, votes: {},
    proposal: null, lastEvent: null, lastCouncil: null, news: [], history: [],
    nextTickAt: null, createdAt: Date.now(),
  };
  for (const s of STATE_IDS) addPlayer(world, { name: `${C.STATES[s].name} (bot)`, state: s, bot: true });
  world.proposal = pickProposal(world);
  computeScores(world);
  for (const p of Object.values(world.players)) if (p.bot) world.plans[p.id] = botPlan(world, p);
  return world;
}

function addPlayer(world, { name, state, bot = false }) {
  if (!C.STATES[state]) throw new Error('Unknown state');
  const r = rng(world.seed + (world.nextId || 0) * 7919 + (Date.now() % 100000));
  const st = C.STATES[state];
  const humans = Object.values(world.players).filter(p => p.state === state && !p.bot);
  // A late joiner starts from the average of the state's humans (or the state's start values).
  const base = humans.length
    ? Object.fromEntries([...STOCKS, 'energy', 'eur'].map(k => [k, Math.floor(humans.reduce((s, h) => s + h.res[k], 0) / humans.length)]))
    : { ...st.start, eur: st.income };
  const p = {
    id: uid(world, r), name: String(name).slice(0, 40) || 'Player', state, bot,
    res: { ...base }, legacy: 0,
    status: Object.fromEntries(GOAL_IDS.map(g => [g, 'neutral'])),
    contributed: Object.fromEntries(GOAL_IDS.map(g => [g, 0])),
    rewards: {}, delayed: [], flags: {}, joinedYear: world.year, lastActiveYear: world.year,
    skipYear: null, coopLastYear: false, score: 0, history: [], log: [],
  };
  world.players[p.id] = p;
  // The first human of a state replaces that state's bot.
  if (!bot) {
    for (const b of Object.values(world.players)) if (b.bot && b.state === state) { delete world.players[b.id]; delete world.plans[b.id]; }
  }
  computeScores(world);
  return p;
}

function activePlayers(world) {
  return Object.values(world.players).filter(p => p.bot || world.year - p.lastActiveYear <= 3);
}

// ---------- card availability ----------
function cardsForPlayer(world, p) {
  return C.CARDS.filter(c => (!c.state || c.state === p.state)).map(c => ({ card: c, lock: lockReason(world, p, c) }));
}

function lockReason(world, p, c) {
  if (c.rejoin) return p.status[c.rejoin] === 'excluded' ? null : { k: 'lock.rejoinOnly' };
  if (c.goalCard && world.goals[c.goalCard].done) return { k: 'lock.goalDone' };
  if (c.tier === 2 && p.res.trust < 30) return { k: 'lock.trust', n: 30 };
  if (c.tier === 3 && p.res.trust < 50) return { k: 'lock.trust', n: 50 };
  if (c.level != null && world.level < c.level) return { k: 'lock.level', level: c.level };
  const gReq = c.goalCard && C.GOALS[c.goalCard].requires;
  if (gReq && !world.goals[gReq].done) return { k: 'lock.requires', goal: gReq };
  if (c.id === 'nl_compute' && !world.goals.power.done) return { k: 'lock.requires', goal: 'power' };
  if (c.flag && p.flags[c.flag]) return { k: 'lock.built' };
  return null;
}

function cardCost(p, c) {
  const cost = { ...(c.cost || {}) };
  if (cost.eur && c.defense && p.rewards.defense) cost.eur = Math.round(cost.eur * (1 - 0.3 * p.rewards.defense));
  if (cost.eur && c.goalCard) cost.eur = Math.ceil(cost.eur * 0.75); // EU treasury co-funds 25% (paid at resolution)
  return cost;
}

const fail = code => ({ ok: false, code, error: EN.msg(code) });

function validatePlan(world, p, cardIds) {
  const ids = [...new Set((cardIds || []).filter(id => CARD_BY_ID[id]))];
  let ap = 0, eur = p.res.eur;
  for (const id of ids) {
    const c = CARD_BY_ID[id];
    if (c.state && c.state !== p.state) return fail({ k: 'err.notYourState', card: c.id, state: p.state });
    const lock = lockReason(world, p, c);
    if (lock) return fail({ k: 'err.locked', card: c.id, lock });
    ap += c.ap;
    const cost = cardCost(p, c);
    eur -= cost.eur || 0;
    if (cost.trust && p.res.trust < cost.trust) return fail({ k: 'err.trust', card: c.id });
  }
  if (ap > C.AP_PER_YEAR) return fail({ k: 'err.ap', ap, max: C.AP_PER_YEAR });
  if (eur < 0) return fail({ k: 'err.eur' });
  return { ok: true, cards: ids, ap };
}

// ---------- effects ----------
function applyFx(world, p, fx, ctx) {
  for (const [k, v] of Object.entries(fx || {})) {
    if (k === 'integration') { ctx.integrationPts += v; continue; }
    if (k === 'treasury') { world.treasury += v; continue; }
    if (k === 'approval' && v < 0) ctx.approvalLoss[p.id] = (ctx.approvalLoss[p.id] || 0) - v;
    if (k === 'approval' && v < 0 && p.res.education >= 60) { p.res.approval += v / 2; continue; } // Education cushion
    if (k === 'approval' && v < 0 && p.res.education < 40) { p.res.approval += v * 1.5; continue; }
    p.res[k] = (p.res[k] || 0) + v;
  }
}

function addScaled(map, key, v, scale) { map[key] = (map[key] || 0) + v * scale; }

function playCard(world, p, c, ctx) {
  const cost = cardCost(p, c);
  if ((cost.eur || 0) > p.res.eur) { p.log.push({ k: 'log.skipped', card: c.id }); return false; }
  p.res.eur -= cost.eur || 0;
  if (c.goalCard) world.treasury -= Math.min(world.treasury, Math.floor(C.GOALS[c.goalCard].cost * 0.25));
  if (cost.trust) p.res.trust -= cost.trust;
  if (cost.approval) applyFx(world, p, { approval: -cost.approval }, ctx);
  // State rules
  if (p.state === 'DE' && (c.cost?.eur || 0) > 15 && p.res.education < 60) applyFx(world, p, { approval: -3 }, ctx);
  if ((p.state === 'NL' || p.state === 'CZ') && c.tier === 3) applyFx(world, p, { approval: -2 }, ctx);
  if (p.state === 'CZ' && c.sovereign) applyFx(world, p, { approval: 2 }, ctx);

  applyFx(world, p, c.fx, ctx);
  if (c.partnerBonus) {
    const share = partnerShare(world, p.state);
    applyFx(world, p, Object.fromEntries(Object.entries(c.partnerBonus).map(([k, v]) => [k, Math.round(v * share)])), ctx);
  }
  for (const d of c.later || []) p.delayed.push({ year: world.year + d.in, fx: d.fx, from: c.name });
  if (c.flag) p.flags[c.flag] = true;
  if (c.edu) ctx.eduInvested[p.id] = true;
  if (c.tier >= 2) ctx.coop[p.id] = true;
  ctx.integrationPts += c.tier === 3 ? 3 : c.tier === 2 ? 1 : 0;

  for (const [g, pts] of Object.entries(c.contributes || {})) {
    if (world.goals[g].done) continue;
    const bonus = c.goalCard && C.STATES[p.state].strengths.includes(g) ? 1 : 0;
    world.goals[g].progress += pts + bonus;
    p.contributed[g] += pts + bonus;
    if (p.status[g] !== 'excluded') p.status[g] = 'contributor';
  }
  for (const g of c.conflicts || []) {
    p.status[g] = 'excluded';
    ctx.integrationPts -= 1;
  }
  if (c.rejoin) p.status[c.rejoin] = 'neutral';
  for (const [k, v] of Object.entries(c.rivals || {})) addScaled(ctx.rivals, k, v, 1);
  for (const [k, v] of Object.entries(c.threats || {})) addScaled(ctx.threats, k, v, 1);
  for (const [k, v] of Object.entries(c.partners || {})) addScaled(ctx.partners, k, v, 1);
  return true;
}

function partnerShare(world, state) {
  const others = activePlayers(world).filter(p => p.state !== state);
  if (!others.length) return 0;
  return others.filter(p => p.coopLastYear).length / others.length;
}

// ---------- goals ----------
function checkGoals(world) {
  const act = activePlayers(world);
  const n = Math.max(1, act.length);
  for (const g of GOAL_IDS) {
    const goal = world.goals[g], def = C.GOALS[g];
    if (goal.done) continue;
    if (world.level < def.level) continue;
    if (def.requires && !world.goals[def.requires].done) continue;
    if (goal.progress < GOAL_PER_PLAYER * n) continue;
    const statesOk = STATE_IDS.filter(s => {
      const ps = act.filter(p => p.state === s);
      return ps.length && ps.filter(p => p.status[g] === 'contributor').length / ps.length >= 0.5;
    }).length;
    if (statesOk < 4) continue;
    completeGoal(world, g);
  }
}

function completeGoal(world, g) {
  const goal = world.goals[g], def = C.GOALS[g];
  goal.done = true; goal.doneYear = world.year; goal.late = world.year > def.deadline;
  const lateMult = goal.late ? 0.5 : 1;
  const act = activePlayers(world);
  const contribs = act.filter(p => p.status[g] === 'contributor');
  const avg = contribs.reduce((s, p) => s + p.contributed[g], 0) / Math.max(1, contribs.length);
  for (const p of Object.values(world.players)) {
    const share = (p.status[g] === 'contributor' ? 1 : p.status[g] === 'neutral' ? 0.4 : 0) * lateMult;
    p.rewards[g] = share;
    if (share > 0) {
      const once = { ...(def.once || {}) };
      for (const k of Object.keys(once)) once[k] = Math.round(once[k] * share);
      applyFx(world, p, once, { approvalLoss: {}, integrationPts: 0, eduInvested: {}, coop: {} });
    }
    if (p.status[g] === 'contributor') {
      p.res.prosperity += 15 * lateMult;
      p.legacy = Math.min(100, p.legacy + Math.min(20, 10 * p.contributed[g] / Math.max(1, avg)));
      p.log.push({ k: 'log.goalFull', goal: g });
    } else if (p.status[g] === 'excluded') {
      p.log.push({ k: 'log.goalMissed', goal: g });
    } else {
      p.log.push({ k: 'log.goalNeutral', goal: g });
    }
  }
  for (const [k, v] of Object.entries(def.onComplete?.threats || {})) world.threats[k] += v;
  for (const [k, v] of Object.entries(def.onComplete?.rivals || {})) world.rivals[k] += v;
  world.news.unshift({ year: world.year, k: 'news.goal', goal: g, late: goal.late });
}

// ---------- council ----------
function pickProposal(world) {
  const r = rng(world.seed + world.year * 31);
  const pool = C.PROPOSALS.filter(pr => !(world.flags.passed || []).includes(pr.id));
  const list = pool.length ? pool : C.PROPOSALS;
  return list[Math.floor(r() * list.length)].id;
}

function resolveCouncil(world) {
  const pr = C.PROPOSALS.find(x => x.id === world.proposal);
  if (!pr) return null;
  const act = activePlayers(world);
  const stateVotes = {};
  for (const s of STATE_IDS) {
    const ps = act.filter(p => p.state === s);
    if (!ps.length) continue;
    const votes = ps.map(p => voteOf(world, p, pr)).filter(Boolean); // players who did not vote abstain
    const yes = votes.filter(v => v === 'yes').length, no = votes.length - yes;
    stateVotes[s] = { yes, no, vote: !votes.length ? 'abstain' : yes > no ? 'yes' : 'no' };
  }
  const yesStates = Object.keys(stateVotes).filter(s => stateVotes[s].vote === 'yes');
  const voting = Object.keys(stateVotes).filter(s => stateVotes[s].vote !== 'abstain'); // abstaining never blocks
  const totalW = voting.reduce((s, x) => s + C.STATES[x].weight, 0);
  const yesW = yesStates.reduce((s, x) => s + C.STATES[x].weight, 0);
  const rule = world.level >= 1 ? 'QMV' : 'Unanimity';
  const passed = !voting.length ? false : rule === 'Unanimity'
    ? yesStates.length === voting.length
    : yesStates.length >= Math.ceil(0.55 * voting.length) && yesW >= 0.65 * totalW;
  if (passed) {
    for (const p of Object.values(world.players)) {
      const ctx = { approvalLoss: {}, integrationPts: 0, eduInvested: {}, coop: {} };
      applyFx(world, p, pr.fx, ctx);
      if (pr.stateApproval?.[p.state]) applyFx(world, p, { approval: pr.stateApproval[p.state] }, ctx);
    }
    const eu = pr.eu || {};
    if (eu.treasury) world.treasury = Math.max(0, world.treasury + eu.treasury);
    if (eu.integration) world.integration += eu.integration;
    for (const [k, v] of Object.entries(eu.threats || {})) world.threats[k] += v;
    for (const [k, v] of Object.entries(eu.rivals || {})) world.rivals[k] += v;
    for (const [g, v] of Object.entries(eu.progress || {})) if (!world.goals[g].done) world.goals[g].progress += v * act.length;
    if (pr.id === 'p_solidarity') world.flags.solidarityPassed = true;
    world.flags.passed = [...(world.flags.passed || []), pr.id];
  }
  const result = { year: world.year, id: pr.id, name: pr.name, rule, passed, stateVotes, yesWeight: round1(yesW), totalWeight: round1(totalW) };
  world.news.unshift({ year: world.year, k: 'news.council', proposal: pr.id, passed, rule });
  return result;
}

function voteOf(world, p, pr) {
  if (!p.bot) return world.votes[p.id] || null;
  if ((pr.stateApproval?.[p.state] || 0) <= -3) return 'no';
  return 'yes';
}

// ---------- events ----------
function drawEvent(world, r) {
  const t = world.threats;
  const worst = Object.keys(t).sort((a, b) => t[b] - t[a])[0];
  if (t[worst] >= 75) return { kind: 'crisis', id: worst, severe: true };
  for (const k of Object.keys(t).sort((a, b) => t[b] - t[a])) {
    if (t[k] >= 50 && r() < t[k] / 150) return { kind: 'crisis', id: k, severe: false };
  }
  if (Object.values(world.players).some(p => p.res.education < 45 && !world.goals.edu.done) && r() < 0.3) return { kind: 'braindrain', id: 'braindrain' };
  const ev = C.NEUTRAL_EVENTS[Math.floor(r() * C.NEUTRAL_EVENTS.length)];
  return { kind: 'neutral', id: ev.id };
}

function applyEvent(world, ev) {
  const ctx = { approvalLoss: {}, integrationPts: 0, eduInvested: {}, coop: {} };
  const mult = ev.severe ? 1.5 : 1;
  for (const p of Object.values(world.players)) {
    const frontline = p.state === 'PL' ? 2 : 1;
    const fx = {};
    if (ev.kind === 'crisis' && ev.id === 'war') {
      const half = p.res.security >= 60 ? 0.5 : 1;
      Object.assign(fx, { prosperity: -3, eur: -5, approval: -3 });
      for (const k in fx) fx[k] *= half * frontline * mult;
    } else if (ev.kind === 'crisis' && ev.id === 'disease') {
      const half = 1 - 0.5 * (p.rewards.health || 0);
      Object.assign(fx, { prosperity: -5 * half * mult, approval: -4 * half * mult });
    } else if (ev.kind === 'crisis' && ev.id === 'ai') {
      const half = 1 - 0.5 * (p.rewards.ai || 0);
      Object.assign(fx, { approval: -5 * half * mult, prosperity: -2 * half * mult });
    } else if (ev.kind === 'crisis' && ev.id === 'migration') {
      const front = p.state === 'PL';
      const loss = front ? -5 * (p.res.security >= 60 ? 0.5 : 1) : -2;
      fx.approval = loss * mult;
      if (!world.flags.solidarityPassed) fx.trust = -3;
    } else if (ev.id === 'braindrain') {
      if (p.res.education < 45 && !p.flags.talent && !p.rewards.edu) Object.assign(fx, { education: -4, tech: -2 });
    } else if (ev.id === 'n_breakthrough') {
      if (p.res.education >= 60) fx.tech = 2;
    } else if (ev.id === 'n_prices') {
      fx.eur = p.rewards.power ? -1.5 : -3;
    } else if (ev.id === 'n_tariffs') {
      fx.eur = p.rewards.ai ? -1 : -4;
    }
    for (const k in fx) fx[k] = round1(fx[k]);
    applyFx(world, p, fx, ctx);
  }
  const def = ev.kind === 'crisis' ? C.CRISES[ev.id]
    : ev.id === 'braindrain' ? { name: 'Brain drain to the USA', text: 'States with Education under 45 lose Education −4 and Tech −2.' }
      : C.NEUTRAL_EVENTS.find(e => e.id === ev.id);
  return { year: world.year, ...ev, name: (ev.severe ? 'Severe: ' : '') + def.name, text: def.text };
}

// ---------- bots ----------
function botPlan(world, p) {
  const avail = cardsForPlayer(world, p).filter(x => !x.lock).map(x => x.card);
  const plan = []; let ap = 0; let eur = p.res.eur;
  const take = c => { const cost = cardCost(p, c).eur || 0; if (ap + c.ap <= C.AP_PER_YEAR && cost <= eur && !plan.includes(c.id)) { plan.push(c.id); ap += c.ap; eur -= cost; return true; } return false; };
  // 1. contribute to an open goal, strengths first, then the least advanced
  const goalCards = avail.filter(c => c.contributes && !c.conflicts && c.tier >= 2 && Object.keys(c.contributes).some(g => !world.goals[g].done))
    .sort((a, b) => score(b) - score(a));
  function score(c) {
    const n = Math.max(1, activePlayers(world).length);
    return Object.entries(c.contributes).reduce((s, [g, v]) => {
      const goal = world.goals[g], def = C.GOALS[g];
      if (goal.done) return s;
      const unlockable = world.level >= def.level && (!def.requires || world.goals[def.requires].done);
      const remaining = Math.max(0, GOAL_PER_PLAYER * n - goal.progress);
      const mine = p.status[g] === 'contributor' ? 0 : 3; // spread: join goals you have not joined yet
      return s + v + (C.STATES[p.state].strengths.includes(g) ? 1 : 0) + (unlockable ? 3 : -3) + mine + (remaining > 0 ? 1 : -5) + (def.deadline - world.year < 3 ? 2 : 0);
    }, 0);
  }
  if (goalCards.length) take(goalCards[0]);
  // 2. keep the home base healthy
  const byId = id => avail.find(c => c.id === id);
  if (p.res.education < 65 && byId('c_univ')) take(byId('c_univ'));
  if (p.res.security < 45 && byId('c_defense')) take(byId('c_defense'));
  if (p.res.approval < 35 && byId('c_tax_cut')) take(byId('c_tax_cut'));
  if (p.res.energy < 0) { const e = avail.find(c => (c.fx?.energy > 0 || c.later?.some(l => l.fx.energy > 0)) && !c.conflicts); if (e) take(e); }
  if (byId('b_erasmus')) take(byId('b_erasmus'));
  if (byId('b_ukraine')) take(byId('b_ukraine'));
  if (byId('c_vocational')) take(byId('c_vocational'));
  return plan;
}

// ---------- scoring ----------
function computeScores(world) {
  const act = activePlayers(world);
  for (const p of Object.values(world.players)) {
    p.score = Math.round(clamp(p.res.prosperity, 0, 100) + clamp(p.res.education, 0, 100) + clamp(p.res.security, 0, 100) + clamp(p.res.approval, 0, 100) + clamp(p.legacy, 0, 100));
  }
  const stateScores = {};
  for (const s of STATE_IDS) {
    const ps = act.filter(p => p.state === s);
    stateScores[s] = ps.length ? Math.round(ps.reduce((a, p) => a + p.score, 0) / ps.length) : null;
  }
  const vals = Object.values(stateScores).filter(v => v != null);
  world.stateScores = stateScores;
  world.euScore = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  const done = GOAL_IDS.filter(g => world.goals[g].done).length;
  const aligned = (world.partners.africa >= 50 ? 1 : 0) + (world.partners.mideast >= 50 ? 1 : 0);
  world.euInfluence = Math.round(30 + 10 * done + world.integration / 3 + (world.euScore - 250) / 10 + 5 * aligned);
}

// ---------- year resolution ----------
function resolveYear(world) {
  if (world.over) return world;
  const r = rng(world.seed + world.year * 1009);
  const act = activePlayers(world);
  const n = Math.max(1, act.length);
  const ctx = { approvalLoss: {}, integrationPts: 0, eduInvested: {}, coop: {}, rivals: {}, threats: {}, partners: {} };
  for (const p of Object.values(world.players)) { p.log = []; }

  // 1. income and EU contribution
  for (const p of Object.values(world.players)) {
    const mult = 1 + 0.15 * (p.rewards.ai || 0);
    const income = C.STATES[p.state].income * (clamp(p.res.prosperity, 0, 100) / 50) * mult;
    const contribution = income * 0.05;
    p.res.eur += income - contribution;
    world.treasury += contribution;
    p.lastIncome = round1(income);
  }
  // 2. cards
  for (const p of Object.values(world.players)) {
    if (p.skipYear === world.year) { p.log.push({ k: 'log.fellNow' }); continue; }
    const plan = world.plans[p.id] || [];
    if (plan.length && !p.bot) p.lastActiveYear = world.year;
    for (const id of plan) { const c = CARD_BY_ID[id]; if (c && !lockReason(world, p, c)) playCard(world, p, c, ctx); }
  }
  // 3. delayed effects
  for (const p of Object.values(world.players)) {
    const due = p.delayed.filter(d => d.year <= world.year);
    p.delayed = p.delayed.filter(d => d.year > world.year);
    for (const d of due) applyFx(world, p, d.fx, ctx);
  }
  // 4. energy, growth, decay, rewards
  for (const p of Object.values(world.players)) {
    const surplusPrice = (p.rewards.power ? 1 + 0.5 * p.rewards.power : 1) * (p.state === 'ES' && !p.flags.pyrenees ? 0.5 : 1);
    const deficitPrice = 1.5 * (p.rewards.power ? 1 - 0.3 * p.rewards.power : 1);
    if (p.res.energy >= 0) p.res.eur += p.res.energy * surplusPrice;
    else { p.res.eur += p.res.energy * deficitPrice; p.res.prosperity += p.res.energy * 0.3; }
    p.res.tech += Math.floor(p.res.education / 30);
    p.res.prosperity += 0.5 + p.res.tech / 50;
    if (!ctx.eduInvested[p.id]) p.res.education -= 1;
    p.res.security -= 1;
    for (const [g, share] of Object.entries(p.rewards)) {
      for (const [k, v] of Object.entries(C.GOALS[g].perYear || {})) p.res[k] += v * share;
    }
    if (world.partners.africa >= 50) p.res.energy += 0; // Africa reward is counted below once per year
    p.coopLastYear = !!ctx.coop[p.id];
  }
  if (world.partners.africa >= 50) for (const p of Object.values(world.players)) p.res.eur += 3;
  // France: street protests
  for (const p of Object.values(world.players)) if (p.state === 'FR' && (ctx.approvalLoss[p.id] || 0) >= 5) p.res.approval -= 3;

  // 5. goals
  checkGoals(world);
  // 6. council
  world.lastCouncil = resolveCouncil(world);
  // 7. integration, rivals, threats, partners
  world.integration = clamp(world.integration + (ctx.integrationPts / n) * 4 - 0.5, 0, 100);
  const newLevel = levelIndex(world.integration);
  if (newLevel !== world.level) world.news.unshift({ year: world.year, k: 'news.level', level: newLevel });
  world.level = newLevel;
  computeScores(world);
  for (const [k, def] of Object.entries(C.RIVALS)) world.rivals[k] += def.growth + ((ctx.rivals[k] || 0) / n) * 3;
  const rivalLead = Math.max(...Object.values(world.rivals)) - world.euInfluence;
  for (const [k, def] of Object.entries(C.THREATS)) {
    let g = def.growth + ((ctx.threats[k] || 0) / n) * 3;
    if (k === 'ai' && rivalLead > 20) g += 1;
    if (k === 'migration') g += world.threats.war / 50;
    if (k === 'disease') g += r() < 0.15 ? 8 : 0; // random spillover from abroad
    world.threats[k] = clamp(world.threats[k] + g, 0, 100);
  }
  for (const [k, def] of Object.entries(C.PARTNERS)) world.partners[k] = clamp(world.partners[k] + def.drift + ((ctx.partners[k] || 0) / n) * 3, -100, 100);
  // missed deadlines: the rival claims the domain
  for (const g of GOAL_IDS) {
    const goal = world.goals[g], def = C.GOALS[g];
    if (!goal.done && !goal.claimed && world.year >= def.deadline) {
      goal.claimed = true;
      const rival = g === 'nuclear' ? 'china' : g === 'power' || g === 'defense' ? null : 'usa';
      if (rival) world.rivals[rival] += 8; else world.threats.war = clamp(world.threats.war + 8, 0, 100);
      world.news.unshift({ year: world.year, k: 'news.deadline', goal: g, rival });
    }
  }
  // 8. event
  world.lastEvent = applyEvent(world, drawEvent(world, r));
  world.news.unshift({ year: world.year, k: 'news.event', event: { kind: world.lastEvent.kind, id: world.lastEvent.id, severe: world.lastEvent.severe } });
  // 9. clamp, government falls, elections
  for (const p of Object.values(world.players)) {
    for (const k of STOCKS) p.res[k] = round1(clamp(p.res[k], 0, 100));
    p.res.approval = Math.min(p.res.approval, maxApproval(p));
    p.res.eur = round1(Math.max(-50, p.res.eur));
    p.res.energy = round1(clamp(p.res.energy, -20, 20));
    if (p.res.eur < 0) p.res.approval = round1(p.res.approval - 2);
    const election = (world.year - C.START_YEAR) % 4 === 1;
    if (p.res.approval < 20 || (election && p.res.approval < 35)) {
      p.skipYear = world.year + 1; p.res.approval = 35;
      p.log.push({ k: election ? 'log.lostElection' : 'log.fellNext' });
    }
  }
  computeScores(world);
  // 10. history + endings
  const avgTrust = act.reduce((s, p) => s + p.res.trust, 0) / n;
  world.lowTrustYears = avgTrust < 25 ? world.lowTrustYears + 1 : 0;
  world.history.push({
    year: world.year, euScore: world.euScore, euInfluence: world.euInfluence, integration: round1(world.integration),
    rivals: { ...world.rivals }, threats: { ...world.threats }, stateScores: { ...world.stateScores },
    goalsDone: GOAL_IDS.filter(g => world.goals[g].done).length,
  });
  for (const p of Object.values(world.players)) {
    p.history.push({ year: world.year, score: p.score });
    if (p.history.length > 20) p.history.shift();
  }
  checkEnding(world, avgTrust);
  world.news = world.news.slice(0, 40);
  // 11. next year
  if (!world.over) {
    world.year += 1;
    world.plans = {}; world.votes = {};
    world.proposal = pickProposal(world);
    for (const p of Object.values(world.players)) if (p.bot) world.plans[p.id] = botPlan(world, p);
  }
  return world;
}

function checkEnding(world) {
  const goalsDone = GOAL_IDS.filter(g => world.goals[g].done).length;
  const topRival = Object.keys(world.rivals).sort((a, b) => world.rivals[b] - world.rivals[a])[0];
  let ending = null;
  if (world.threats.war >= 100 || world.lowTrustYears >= 2 || (world.integration <= 5 && world.year >= 2031)) ending = 'divided';
  else if (world.year >= 2033 && world.rivals[topRival] >= world.euInfluence + 40) ending = 'rival';
  else if (world.year >= C.END_YEAR) {
    if (world.rivals[topRival] > world.euInfluence) ending = 'rival';
    else ending = goalsDone >= 4 ? 'big' : 'second';
  }
  if (!ending) return;
  const ENDINGS = {
    big: { name: 'Europe Goes On — and goes big', mult: 1.2, text: `${goalsDone} goals completed and the EU leads every rival.` },
    second: { name: 'Second-tier Europe', mult: 1.0, text: 'No rival is ahead, but too few goals were completed.' },
    rival: { name: `The ${C.RIVALS[topRival].name === 'USA' ? 'American' : 'Chinese'} Century`, mult: 0.8, text: `${C.RIVALS[topRival].name} overtook a divided Europe.` },
    divided: { name: 'Divided Europe', mult: 0.6, text: 'Trust collapsed or war pressure broke the Union apart.' },
  };
  world.over = true;
  world.ending = { id: ending, ...ENDINGS[ending], rival: topRival, year: world.year, goalsDone };
  for (const p of Object.values(world.players)) p.finalScore = Math.round(p.score * world.ending.mult);
  world.news.unshift({ year: world.year, k: 'news.over', ending: { id: ending, rival: topRival, goalsDone } });
}

// ---------- views ----------
function publicView(world, playerId) {
  const me = world.players[playerId] || null;
  const act = activePlayers(world);
  const leaderboard = Object.values(world.players).map(p => ({ name: p.name, state: p.state, bot: p.bot, score: p.score, finalScore: p.finalScore }))
    .sort((a, b) => b.score - a.score).slice(0, 25);
  const participation = Object.fromEntries(GOAL_IDS.map(g => [g, Object.fromEntries(STATE_IDS.map(s => {
    const ps = act.filter(p => p.state === s);
    return [s, ps.length ? round1(ps.filter(p => p.status[g] === 'contributor').length / ps.length) : null];
  }))]));
  const counts = Object.fromEntries(STATE_IDS.map(s => [s, {
    humans: Object.values(world.players).filter(p => p.state === s && !p.bot).length,
    bot: Object.values(world.players).some(p => p.state === s && p.bot),
  }]));
  return {
    year: world.year, over: world.over, ending: world.ending,
    integration: round1(world.integration), level: world.level, treasury: round1(world.treasury),
    goals: Object.fromEntries(GOAL_IDS.map(g => [g, { ...world.goals[g], needed: GOAL_PER_PLAYER * Math.max(1, act.length) }])),
    participation, threats: world.threats, rivals: world.rivals, partners: world.partners,
    euInfluence: world.euInfluence, euScore: world.euScore, stateScores: world.stateScores,
    proposal: world.proposal, lastEvent: world.lastEvent, lastCouncil: world.lastCouncil,
    news: world.news.slice(0, 15), history: world.history, nextTickAt: world.nextTickAt,
    activePlayers: act.length, counts, leaderboard,
    me: me && {
      ...me, plan: world.plans[me.id] || [], vote: world.votes[me.id] || null,
      cards: cardsForPlayer(world, me).map(({ card, lock }) => ({ id: card.id, lock, cost: cardCost(me, card) })),
    },
  };
}

module.exports = { newWorld, addPlayer, resolveYear, validatePlan, publicView, botPlan, cardsForPlayer, activePlayers, computeScores, CARD_BY_ID, levelIndex };
