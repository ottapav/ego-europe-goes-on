// Runs full games with scripted strategies and prints how cooperators and defectors end up.
// Usage: node test/simulate.js [seed]
const E = require('../src/engine');
const C = require('../src/content');

function nationalPlan(world, p) {
  // Never cooperates, but invests at home: fast money from conflict cards, then national spending.
  const prefer = [];
  if (p.res.energy < 5) prefer.push('c_gas');
  prefer.push('c_sell_asset');
  if (p.res.security < 60) prefer.push('c_foreign_arms');
  if (p.res.education < 65) prefer.push('c_univ');
  prefer.push('c_subsidy');
  if (p.res.approval < 45) prefer.push('c_tax_cut');
  prefer.push('c_defense', 'c_vocational', 'c_fence');
  const plan = []; let ap = 0;
  for (const id of prefer) {
    const c = E.CARD_BY_ID[id];
    if (ap + c.ap > C.AP_PER_YEAR) continue;
    const v = E.validatePlan(world, p, [...plan, id]);
    if (v.ok) { plan.push(id); ap += c.ap; }
  }
  return plan;
}

function runGame(seed, mix) {
  const w = E.newWorld({ seed });
  // Add humans per state: mix = { coop: n, national: n } per state
  const roles = {};
  for (const s of Object.keys(C.STATES)) {
    for (let i = 0; i < mix.coop; i++) roles[E.addPlayer(w, { name: `${s}-coop-${i}`, state: s }).id] = 'coop';
    for (let i = 0; i < mix.national; i++) roles[E.addPlayer(w, { name: `${s}-nat-${i}`, state: s }).id] = 'national';
  }
  const curves = { coop: [], national: [] };
  while (!w.over) {
    for (const p of Object.values(w.players)) {
      if (p.bot) continue;
      const plan = roles[p.id] === 'coop' ? E.botPlan(w, p) : nationalPlan(w, p);
      const v = E.validatePlan(w, p, plan);
      w.plans[p.id] = v.ok ? v.cards : [];
      w.votes[p.id] = roles[p.id] === 'coop' ? 'yes' : 'no';
    }
    E.resolveYear(w);
    for (const role of ['coop', 'national']) {
      const ps = Object.values(w.players).filter(p => roles[p.id] === role);
      curves[role].push(ps.length ? Math.round(ps.reduce((s, p) => s + p.score, 0) / ps.length) : null);
    }
  }
  return { w, curves };
}

module.exports = { runGame, nationalPlan };
if (require.main !== module) return;
const seed = Number(process.argv[2] || 42);
for (const mix of [{ coop: 3, national: 1 }, { coop: 2, national: 2 }, { coop: 1, national: 3 }, { coop: 4, national: 0 }]) {
  const { w, curves } = runGame(seed, mix);
  const goals = Object.entries(w.goals).filter(([, g]) => g.done).map(([k, g]) => `${k}@${g.doneYear}`).join(' ');
  console.log(`\nMix per state: ${mix.coop} coop / ${mix.national} national`);
  console.log(`  Ending: ${w.ending.name} (${w.ending.year}) | EU influence ${w.euInfluence} | USA ${Math.round(w.rivals.usa)} | China ${Math.round(w.rivals.china)}`);
  console.log(`  Integration ${w.integration} | Goals: ${goals || 'none'}`);
  console.log(`  Threats: ${Object.entries(w.threats).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')}`);
  console.log(`  Coop score by year:     ${curves.coop.join(' ')}`);
  console.log(`  National score by year: ${curves.national.join(' ')}`);
}
