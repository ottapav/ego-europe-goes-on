// EGO – Europe Goes On: one-page client. No framework, no build step.
(() => {
  const $app = document.getElementById('app');
  const $clock = document.getElementById('clock');
  const params = new URLSearchParams(location.search);
  const ADMIN = params.get('admin');
  let K = null;          // content
  let W = null;          // world view
  let playerId = null;
  try { playerId = localStorage.getItem('ego.playerId'); } catch { /* storage unavailable */ }
  let selected = new Set();
  let dirty = false;
  let pickState = null;
  let toast = null;

  const LABEL = { eur: '€', energy: 'Energy', prosperity: 'Prosperity', education: 'Education', tech: 'Tech', security: 'Security', trust: 'Trust', approval: 'Approval', integration: 'Integration', treasury: 'EU treasury' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = v => (v > 0 ? '+' : '') + (Math.round(v * 10) / 10);

  async function api(path, body) {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...(ADMIN ? { 'x-admin-key': ADMIN } : {}) }, body: JSON.stringify(body) } : {});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function refresh(keepSelection) {
    W = await api(`/api/world${playerId ? `?player=${encodeURIComponent(playerId)}` : ''}`);
    if (playerId && !W.me) { playerId = null; try { localStorage.removeItem('ego.playerId'); } catch { } }
    if (W.me && (!keepSelection || !dirty)) { selected = new Set(W.me.plan); dirty = false; }
    render();
  }

  // ---------- small renderers ----------
  function fxText(fx, later) {
    const parts = Object.entries(fx || {}).map(([k, v]) => `${LABEL[k] || k} ${fmt(v)}`);
    for (const d of later || []) parts.push(`in ${d.in} yr: ` + Object.entries(d.fx).map(([k, v]) => `${LABEL[k] || k} ${fmt(v)}`).join(', '));
    return parts.join('; ');
  }
  function costText(cost) {
    const parts = Object.entries(cost || {}).filter(([, v]) => v).map(([k, v]) => k === 'eur' ? `${v} €` : `${v} ${LABEL[k]}`);
    return parts.length ? parts.join(', ') : 'free';
  }
  function countdown() {
    if (!W) return;
    const year = `<span class="year">${W.over ? 'Game over' : W.year}</span>`;
    if (W.over || !W.nextTickAt) { $clock.innerHTML = year; return; }
    const ms = Math.max(0, W.nextTickAt - Date.now());
    const h = Math.floor(ms / 3.6e6), m = Math.floor(ms % 3.6e6 / 6e4), s = Math.floor(ms % 6e4 / 1000);
    $clock.innerHTML = `${year}Year resolves in ${h ? h + ' h ' : ''}${m} min ${h ? '' : s + ' s'}`;
  }

  function raceHtml() {
    const items = [
      { k: 'eu', name: 'Europe', v: W.euInfluence },
      ...Object.entries(K.RIVALS).map(([k, r]) => ({ k, name: `${r.flag} ${r.name}`, v: Math.round(W.rivals[k]) })),
    ];
    const max = Math.max(160, ...items.map(i => i.v + 10));
    const pos = v => Math.max(2, Math.min(98, v / max * 100));
    const ticks = []; for (let t = 0; t <= max; t += 40) ticks.push(`<div class="tick" style="left:${pos(t)}%"><span>${t}</span></div>`);
    const rivals = items.filter(i => i.k !== 'eu').sort((a, b) => a.v - b.v);
    const side = {};
    side.eu = 'up';
    rivals.forEach((r, i) => { side[r.k] = 'down'; if (i > 0 && Math.abs(r.v - rivals[i - 1].v) < 14 && Math.abs(r.v - W.euInfluence) > 14) side[r.k] = 'up'; });
    const lead = Math.max(...rivals.map(r => r.v)) - W.euInfluence;
    const headline = lead > 0 ? `Europe trails the leading power by ${lead} points.` : `Europe leads every rival by ${-lead} points.`;
    const threats = Object.entries(K.THREATS).map(([k, t]) => {
      const v = Math.round(W.threats[k]);
      return `<div class="threat ${v >= 50 ? 'hot' : ''}">
        <div class="t-name"><span>${t.icon} ${esc(t.name)}</span><b>${v}</b></div>
        <div class="bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-label="${esc(t.name)}"><i style="width:${v}%"></i></div>
        <small>${esc(t.text)} ${v >= 75 ? 'A crisis is certain this year.' : v >= 50 ? 'A crisis can strike.' : ''}</small>
      </div>`;
    }).join('');
    const done = Object.values(W.goals).filter(g => g.done).length;
    return `<section class="race" aria-label="World race">
      <div class="race-head"><h2>${headline}</h2><p>EU influence grows with completed goals, integration and the wellbeing of its states. If a rival is still ahead in 2040, or 40 points ahead from 2033, the rival wins and every player loses 20% of their score.</p></div>
      <div class="track">${ticks.join('')}<div class="rail"></div>
        ${items.map(i => `<div class="runner ${i.k === 'eu' ? 'eu' : 'rival'} ${side[i.k]}" style="left:${pos(i.v)}%"><span class="who">${esc(i.name)} ${i.v}</span><span class="dot"></span></div>`).join('')}
      </div>
      <p class="legend">${items.map(i => `<span class="${i.k === 'eu' ? 'eu' : 'rival'}"><i></i>${esc(i.name)} <b>${i.v}</b></span>`).join('')}</p>
      <div class="threats">${threats}</div>
      <div class="eu-stats">
        <span>EU level <b>${K.LEVELS[W.level]}</b> (integration ${Math.round(W.integration)}/100)</span>
        <span>Council votes by <b>${W.level >= 1 ? 'qualified majority' : 'unanimity'}</b></span>
        <span>Treasury <b>${Math.round(W.treasury)} €</b></span>
        <span>Goals done <b>${done}/7</b></span>
        <span>EU score <b>${W.euScore}</b></span>
        <span>Africa <b>${Math.round(W.partners.africa)}</b>, Middle East <b>${Math.round(W.partners.mideast)}</b> alignment</span>
      </div>
    </section>`;
  }

  function factsHtml() {
    return `<section aria-label="Europe today"><h2>Europe today</h2><p class="sub">The game starts from the real EU of autumn 2026.</p>
      <div class="facts">${K.EU_FACTS.map(f => `<div class="fact"><b>${esc(f.value)}</b><span>${esc(f.label)}, ${esc(f.note)}</span></div>`).join('')}</div></section>`;
  }

  function goalsHtml() {
    const rows = Object.entries(K.GOALS).map(([g, d]) => {
      const st = W.goals[g];
      const pct = Math.min(100, Math.round(st.progress / st.needed * 100));
      const seats = Object.keys(K.STATES).map(s => {
        const v = W.participation[g][s];
        return `<span class="seat ${v >= .5 ? 'ok' : ''}" title="${esc(K.STATES[s].name)}: ${v == null ? 'no players' : Math.round(v * 100) + '% contributing'}">${K.STATES[s].flag}</span>`;
      }).join('');
      const my = W.me ? `<span class="status ${W.me.status[g]}">${W.me.status[g] === 'contributor' ? 'You contribute' : W.me.status[g] === 'excluded' ? 'You are excluded' : 'You are neutral'}</span>` : '';
      const lock = W.level < d.level ? `needs ${K.LEVELS[d.level]}` : d.requires && !W.goals[d.requires].done ? `needs ${K.GOALS[d.requires].name}` : '';
      return `<div class="goal ${st.done ? 'done' : ''}">
        <span class="icon" aria-hidden="true">${d.icon}</span>
        <div><h3>${esc(d.name)}</h3><p class="g-meta">${st.done ? `Completed ${st.doneYear}${st.late ? ' (late: half reward)' : ''}` : `${st.progress}/${st.needed} progress${lock ? ', ' + lock : ''}, deadline ${d.deadline}`}. Reward: ${esc(d.rewardText)}.</p></div>
        <div style="display:grid;gap:.35rem;justify-items:end">${my}<div class="seats" aria-label="States with at least half of their players contributing">${seats}</div></div>
        <div class="prog"><i style="width:${st.done ? 100 : pct}%"></i></div>
      </div>`;
    }).join('');
    return `<section><h2>Seven goals for Europe</h2>
      <p class="sub">A goal completes when its progress bar is full, at least 4 of 6 states have half their players contributing, and the EU has reached the required level. Contributors get the full reward, neutral states 40%, and states that played a conflicting card get nothing.</p>
      <div class="goals">${rows}</div></section>`;
  }

  function myStateHtml() {
    const me = W.me, st = K.STATES[me.state];
    const keys = ['eur', 'energy', 'prosperity', 'education', 'tech', 'security', 'trust', 'approval'];
    const res = keys.map(k => {
      const v = me.res[k];
      const meter = k === 'eur' || k === 'energy' ? '' : `<div class="meter"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div>`;
      const hint = k === 'energy' ? (v >= 0 ? 'surplus per year' : 'deficit per year') : k === 'eur' ? `income ${me.lastIncome ?? st.income}/yr` : '';
      return `<div class="r"><small>${LABEL[k]}${hint ? ', ' + hint : ''}</small><span class="num">${k === 'energy' ? fmt(v) : Math.round(v)}</span>${meter}</div>`;
    }).join('');
    const stateAvg = W.stateScores[me.state];
    const log = me.log?.length ? `<ul class="log">${me.log.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '';
    return `<section><h2>Your state</h2>
      <div class="mystate">
        <div class="who"><h3>${st.flag} ${esc(st.name)}, led by ${esc(me.name)}</h3><span>Score <b class="num">${me.score}</b>, ${esc(st.name)} average ${stateAvg ?? '–'}, EU average ${W.euScore}</span></div>
        <div class="res">${res}</div>
        <p class="rule"><b>${esc(st.rule.name)}:</b> ${esc(st.rule.text)} Score = Prosperity + Education + Security + Approval + Legacy (${Math.round(me.legacy)}).</p>
        ${me.skipYear === W.year ? '<p class="toast err">Your government fell. You cannot act this year.</p>' : ''}
        ${log}
      </div></section>`;
  }

  function cardHtml(card, info) {
    const sel = selected.has(card.id);
    const tags = [];
    for (const [g, v] of Object.entries(card.contributes || {})) tags.push(`<span class="tag plus">Builds ${esc(K.GOALS[g].name)} +${v}</span>`);
    for (const g of card.conflicts || []) tags.push(`<span class="tag minus">Excludes you from ${esc(K.GOALS[g].name)}</span>`);
    for (const [k, v] of Object.entries(card.rivals || {})) tags.push(`<span class="tag ${v > 0 ? 'minus' : 'plus'}">${esc(K.RIVALS[k].name)} ${fmt(v)}</span>`);
    for (const [k, v] of Object.entries(card.threats || {})) tags.push(`<span class="tag ${v > 0 ? 'minus' : 'plus'}">${esc(K.THREATS[k].name)} ${fmt(v)}</span>`);
    for (const [k, v] of Object.entries(card.partners || {})) tags.push(`<span class="tag plus">${esc(K.PARTNERS[k].name)} ${fmt(v)}</span>`);
    if (card.state) tags.push(`<span class="tag state">${esc(K.STATES[card.state].name)} only</span>`);
    return `<button class="card ${sel ? 'sel' : ''}" data-card="${card.id}" ${info.lock ? 'disabled' : ''} aria-pressed="${sel}">
      <span class="top"><span class="name">${esc(card.name)}</span><span class="cost">${card.ap} AP, ${costText(info.cost)}</span></span>
      ${fxText(card.fx, card.later) ? `<span class="fx">${esc(fxText(card.fx, card.later))}</span>` : ''}
      ${tags.length ? `<span class="tags">${tags.join('')}</span>` : ''}
      ${info.lock ? `<span class="lock">Locked: ${esc(info.lock)}</span>` : `<span class="note">${esc(card.note || '')}</span>`}
    </button>`;
  }

  function decisionsHtml() {
    const me = W.me;
    const info = Object.fromEntries(me.cards.map(c => [c.id, c]));
    const cards = K.CARDS.filter(c => info[c.id]);
    const apUsed = [...selected].reduce((s, id) => s + (K.CARDS.find(c => c.id === id)?.ap || 0), 0);
    const eurUsed = [...selected].reduce((s, id) => s + (info[id]?.cost?.eur || 0), 0);
    const tiers = [
      { t: 1, name: 'National', text: 'Fast and cheap. Never builds Trust; some cards work against European goals.' },
      { t: 2, name: 'Bilateral', text: 'Needs Trust 30+. Works best when other states cooperate too.' },
      { t: 3, name: 'European', text: 'Needs Trust 50+ and the right EU level. Slow, but it builds the goals.' },
    ];
    const rank = c => (c.lock ? 1 : 0);
    const col = ({ t, name, text }) => {
      const list = cards.filter(c => c.tier === t && !(c.rejoin && info[c.id].lock)).sort((a, b) => rank(info[a.id]) - rank(info[b.id]) || (a.state ? -1 : 0) - (b.state ? -1 : 0));
      return `<div class="tier"><h3>${name}</h3><p class="sub">${text}</p><div class="cards">${list.map(c => cardHtml(c, info[c.id])).join('')}</div></div>`;
    };
    const dots = Array.from({ length: K.AP_PER_YEAR }, (_, i) => `<i class="${i < apUsed ? 'on' : ''}"></i>`).join('');
    const canAct = me.skipYear !== W.year && !W.over;
    return `<section aria-label="Decisions">
      <h2>Your decisions for ${W.year}</h2>
      <p class="sub">Pick cards for up to ${K.AP_PER_YEAR} action points. You can change them until the year resolves; everything happens at once for all players.</p>
      <div class="plan-bar">
        <span class="ap" aria-label="${apUsed} of ${K.AP_PER_YEAR} action points used">${dots} ${apUsed}/${K.AP_PER_YEAR} AP, ${eurUsed} of ${Math.round(me.res.eur)} € planned</span>
        <span><button class="btn" id="save" ${!canAct || apUsed > K.AP_PER_YEAR ? 'disabled' : ''}>${dirty ? 'Save my plan' : 'Plan saved'}</button>
        ${ADMIN ? '<button class="btn gold" id="tick">Resolve the year now</button>' : ''}</span>
      </div>
      ${toast ? `<p class="toast ${toast.err ? 'err' : ''}" role="status">${esc(toast.text)}</p>` : ''}
      <div class="tiers">${tiers.map(col).join('')}</div>
    </section>`;
  }

  function councilHtml() {
    const pr = K.PROPOSALS.find(p => p.id === W.proposal);
    const lc = W.lastCouncil;
    const myVote = W.me?.vote;
    const effects = [fxText(pr.fx), pr.eu?.treasury ? `EU treasury ${fmt(pr.eu.treasury)}` : '', pr.eu?.integration ? `Integration ${fmt(pr.eu.integration)}` : '',
      ...Object.entries(pr.eu?.threats || {}).map(([k, v]) => `${K.THREATS[k].name} ${fmt(v)}`),
      ...Object.entries(pr.stateApproval || {}).map(([s, v]) => `${K.STATES[s].name} Approval ${fmt(v)}`)].filter(Boolean).join('; ');
    const last = lc ? `<p class="sub" style="margin-top:1rem">Last year: <b>${esc(lc.name)}</b> ${lc.passed ? 'passed' : 'was rejected'} by ${lc.rule === 'QMV' ? 'qualified majority' : 'unanimity'}.</p>
      <div class="split">${Object.entries(lc.stateVotes).map(([s, v]) => `<span class="${v.vote}">${K.STATES[s].flag} ${v.vote} (${v.yes} yes, ${v.no} no)</span>`).join('')}</div>` : '';
    return `<section><h2>Council of the EU</h2><div class="panel">
      <h3>${esc(pr.name)}</h3><p class="sub">${esc(pr.text)} If it passes: ${esc(effects)}.</p>
      <p class="sub">${W.level >= 1 ? 'Passes with at least 55% of states representing 65% of the population.' : 'Unanimity: one state voting no blocks it; abstaining does not. A state votes the way the majority of its voting players vote.'}</p>
      ${W.me ? `<div class="vote"><button class="btn ${myVote === 'yes' ? 'on' : 'ghost'}" data-vote="yes">Vote yes</button><button class="btn ${myVote === 'no' ? 'on' : 'ghost'}" data-vote="no">Vote no</button></div>` : ''}
      ${last}</div></section>`;
  }

  function newsHtml() {
    const ev = W.lastEvent;
    return `<section><h2>News</h2><div class="panel">
      ${ev ? `<h3>${esc(ev.name)} (${ev.year})</h3><p class="sub">${esc(ev.text)}</p>` : '<p class="sub">The first year has not resolved yet.</p>'}
      <ul class="news">${W.news.map(n => `<li><b>${n.year}</b><span>${esc(n.text)}</span></li>`).join('')}</ul></div></section>`;
  }

  function boardsHtml() {
    const states = Object.entries(K.STATES).map(([s, d]) => ({ s, d, v: W.stateScores[s] })).sort((a, b) => (b.v ?? 0) - (a.v ?? 0));
    return `<section><h2>Leaderboards</h2>
      <div class="panel"><h3>States: average of their players</h3><table><thead><tr><th>State</th><th>Players</th><th class="n">Score</th></tr></thead><tbody>
      ${states.map(x => `<tr class="${W.me?.state === x.s ? 'me' : ''}"><td>${x.d.flag} ${esc(x.d.name)}</td><td>${W.counts[x.s].humans || (W.counts[x.s].bot ? 'bot' : 0)}</td><td class="n">${x.v ?? '–'}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="panel"><h3>Players</h3><table><thead><tr><th>Player</th><th>State</th><th class="n">Score</th></tr></thead><tbody>
      ${W.leaderboard.map(p => `<tr class="${W.me && p.name === W.me.name && p.state === W.me.state ? 'me' : ''}"><td>${esc(p.name)}</td><td>${K.STATES[p.state].flag}</td><td class="n">${p.finalScore ?? p.score}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  function endingHtml() {
    if (!W.over) return '';
    const e = W.ending;
    return `<div class="ending" role="status"><h2>${esc(e.name)}</h2><p>${esc(e.text)} Every final score is multiplied by ${e.mult}.${W.me ? ` Your final score: <b>${W.me.finalScore}</b>.` : ''}</p></div>`;
  }

  function joinHtml() {
    const cards = Object.entries(K.STATES).map(([s, d]) => `
      <button class="state-card ${pickState === s ? 'sel' : ''}" data-state="${s}" aria-pressed="${pickState === s}">
        <span class="flag" aria-hidden="true">${d.flag}</span><h3>${esc(d.name)}</h3>
        <span class="facts-line">${esc(d.facts.population)} people, GDP ${esc(d.facts.gdp)} (2025), defence ${esc(d.facts.defence)} (2025)</span>
        <span class="facts-line">${esc(d.facts.line)}</span>
        <span class="plus">Strong in: ${esc(d.strengthText)}</span>
        <span class="minus">Weak in: ${esc(d.weaknessText)}</span>
        <span class="facts-line"><b>${esc(d.rule.name)}:</b> ${esc(d.rule.text)}</span>
        <span class="players">${W.counts[s].humans} player${W.counts[s].humans === 1 ? '' : 's'}${W.counts[s].bot ? ', a bot plays it until someone joins' : ''}</span>
      </button>`).join('');
    return `<section class="join"><h2>Lead a member state</h2>
      <p class="join-intro">Every player runs their own government inside one shared EU. National moves pay off fast. European moves pay off big, but only if enough states cooperate. One year passes every ${K.TICK_MINUTES >= 1440 ? 'day' : K.TICK_MINUTES + ' minutes'}.</p>
      <div class="states">${cards}</div>
      <div class="join-form"><label for="pname" class="sub">Your name</label><input id="pname" maxlength="40" placeholder="e.g. Minister Novák" autocomplete="nickname">
      <button class="btn" id="join" ${pickState ? '' : 'disabled'}>${pickState ? `Join as ${esc(K.STATES[pickState].name)}` : 'Pick a state first'}</button></div>
      ${toast?.err ? `<p class="toast err">${esc(toast.text)}</p>` : ''}
    </section>`;
  }

  // ---------- render ----------
  function render() {
    countdown();
    const typed = document.getElementById('pname')?.value;
    const top = raceHtml() + endingHtml();
    if (!W.me) {
      $app.innerHTML = top + factsHtml() + joinHtml() + goalsHtml();
      if (typed) document.getElementById('pname').value = typed;
      return;
    }
    $app.innerHTML = top + `<div class="grid2"><div>${myStateHtml()}${goalsHtml()}</div><div>${councilHtml()}${newsHtml()}</div></div>` + decisionsHtml() + boardsHtml() + factsHtml();
  }

  // ---------- events ----------
  $app.addEventListener('click', async e => {
    const st = e.target.closest('[data-state]');
    if (st) { pickState = st.dataset.state; toast = null; render(); document.getElementById('pname')?.focus(); return; }
    if (e.target.closest('#join')) {
      try {
        const name = document.getElementById('pname').value;
        const r = await api('/api/join', { name, state: pickState });
        playerId = r.playerId; try { localStorage.setItem('ego.playerId', playerId); } catch { }
        toast = null; await refresh();
      } catch (err) { toast = { err: true, text: err.message }; render(); }
      return;
    }
    const card = e.target.closest('[data-card]');
    if (card && !card.disabled) {
      const id = card.dataset.card;
      selected.has(id) ? selected.delete(id) : selected.add(id);
      dirty = true; toast = null; render(); return;
    }
    const vote = e.target.closest('[data-vote]');
    if (vote) {
      try { await api('/api/plan', { playerId, cards: [...selected], vote: vote.dataset.vote }); dirty = false; toast = { text: `Vote saved: ${vote.dataset.vote}.` }; await refresh(); }
      catch (err) { toast = { err: true, text: err.message }; render(); }
      return;
    }
    if (e.target.closest('#save')) {
      try { const r = await api('/api/plan', { playerId, cards: [...selected] }); dirty = false; toast = { text: `Plan saved: ${r.plan.length} card${r.plan.length === 1 ? '' : 's'}, ${r.ap} AP.` }; await refresh(); }
      catch (err) { toast = { err: true, text: err.message }; render(); }
      return;
    }
    if (e.target.closest('#tick')) {
      try { await api('/api/admin/tick', {}); toast = { text: 'Year resolved.' }; dirty = false; await refresh(); }
      catch (err) { toast = { err: true, text: err.message }; render(); }
    }
  });

  (async () => {
    try {
      K = await api('/api/content');
      await refresh();
      setInterval(countdown, 1000);
      setInterval(() => refresh(true).catch(() => { }), 20000);
    } catch (err) { $app.innerHTML = `<p class="loading">Could not reach the game server: ${esc(err.message)}</p>`; }
  })();
})();
