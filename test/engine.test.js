const test = require('node:test');
const assert = require('node:assert');
const E = require('../src/engine');
const C = require('../src/content');
const { runGame } = require('./simulate');

test('a new world has one bot per state, including Czechia', () => {
  const w = E.newWorld({ seed: 1 });
  const states = Object.values(w.players).map(p => p.state).sort();
  assert.deepStrictEqual(states, ['CZ', 'DE', 'ES', 'FR', 'NL', 'PL']);
  assert.ok(Object.values(w.players).every(p => p.bot));
});

test('the first human of a state replaces its bot, and ids never collide', () => {
  const w = E.newWorld({ seed: 2 });
  const ids = new Set();
  for (let i = 0; i < 20; i++) ids.add(E.addPlayer(w, { name: `p${i}`, state: 'CZ' }).id);
  assert.strictEqual(ids.size, 20);
  assert.ok(!Object.values(w.players).some(p => p.bot && p.state === 'CZ'));
});

test('plans are checked for action points, money and locks', () => {
  const w = E.newWorld({ seed: 3 });
  const p = E.addPlayer(w, { name: 'x', state: 'DE' });
  assert.strictEqual(E.validatePlan(w, p, ['c_univ', 'c_subsidy', 'c_defense']).ok, false); // 4 AP
  assert.strictEqual(E.validatePlan(w, p, ['cz_cars']).ok, false); // another state's card
  assert.match(E.validatePlan(w, p, ['g_defense']).error, /Trust|level/);
  assert.strictEqual(E.validatePlan(w, p, ['c_univ', 'c_defense']).ok, true);
});

test('a conflicting card excludes the player from that goal, rejoining costs Trust and money', () => {
  const w = E.newWorld({ seed: 4 });
  const p = E.addPlayer(w, { name: 'x', state: 'NL' });
  w.plans[p.id] = ['nl_chips'];
  E.resolveYear(w);
  assert.strictEqual(w.players[p.id].status.ai, 'excluded');
  const lock = E.cardsForPlayer(w, w.players[p.id]).find(c => c.card.id === 'r_ai').lock;
  assert.strictEqual(lock, null);
});

test('non-voting players abstain and do not block unanimity', () => {
  const w = E.newWorld({ seed: 5 });
  E.addPlayer(w, { name: 'silent', state: 'FR' });
  E.resolveYear(w);
  assert.strictEqual(w.lastCouncil.stateVotes.FR.vote, 'abstain');
});

test('a full game always ends with one of the four endings', () => {
  const w = E.newWorld({ seed: 6 });
  let guard = 0;
  while (!w.over && guard++ < 20) E.resolveYear(w);
  assert.ok(w.over);
  assert.ok(['big', 'second', 'rival', 'divided'].includes(w.ending.id));
  assert.ok(w.year <= C.END_YEAR);
});

test('cooperation pays off: cooperators finish ahead and a cooperative EU wins', () => {
  for (const seed of [42, 7, 99]) {
    const { w, curves } = runGame(seed, { coop: 3, national: 1 });
    assert.strictEqual(w.ending.id, 'big', `seed ${seed}: ${w.ending.name}`);
    assert.ok(curves.coop.at(-1) > curves.national.at(-1) * 1.2, `seed ${seed}: coop ${curves.coop.at(-1)} vs national ${curves.national.at(-1)}`);
    assert.ok(curves.national[2] > curves.coop[2], `seed ${seed}: national play should lead early`);
  }
});

test('a mostly national EU loses to a rival or falls apart', () => {
  const { w } = runGame(42, { coop: 1, national: 3 });
  assert.ok(['rival', 'divided'].includes(w.ending.id));
});
