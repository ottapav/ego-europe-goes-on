// EGO – Europe Goes On: one-page client. No framework, no build step.
// All texts come from i18n.js; choosing Czechia switches the game to Czech.
(() => {
  const $app = document.getElementById('app');
  const $clock = document.getElementById('clock');
  const $lang = document.getElementById('lang');
  const params = new URLSearchParams(location.search);
  const ADMIN = params.get('admin');
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  };
  let K = null;          // content
  let W = null;          // world view
  let T = null;          // translator for the current language
  let lang = params.get('lang') || store.get('ego.lang') || null;
  let playerId = store.get('ego.playerId');
  let selected = new Set();
  let dirty = false;
  let pickState = null;
  let toast = null;      // { key, params, err } or { code } or { text }

  const STATE_LANG = { CZ: 'cs' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function setLang(l, remember) {
    lang = EGO_I18N.langs.includes(l) ? l : 'en';
    if (remember) store.set('ego.lang', lang);
    T = EGO_I18N.make(lang, K);
    document.documentElement.lang = lang;
    document.getElementById('tagline').firstChild.nodeValue = T.t('app.tagline');
    document.getElementById('footer').textContent = T.t('app.footer');
    $lang.setAttribute('aria-label', T.t('lang.label'));
    $lang.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  }
  function defaultLang() {
    if (W?.me) return STATE_LANG[W.me.state] || 'en';
    return (navigator.language || '').toLowerCase().startsWith('cs') ? 'cs' : 'en';
  }

  async function api(path, body) {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...(ADMIN ? { 'x-admin-key': ADMIN } : {}) }, body: JSON.stringify(body) } : {});
    const data = await res.json();
    if (!res.ok) { const e = new Error(data.error || 'Request failed'); e.code = data.code; throw e; }
    return data;
  }
  const errToast = e => ({ err: true, code: e.code, text: e.message });

  async function refresh(keepSelection) {
    W = await api(`/api/world${playerId ? `?player=${encodeURIComponent(playerId)}` : ''}`);
    if (playerId && !W.me) { playerId = null; store.set('ego.playerId', null); }
    if (W.me && (!keepSelection || !dirty)) { selected = new Set(W.me.plan); dirty = false; }
    if (!lang) setLang(defaultLang(), false);
    render();
  }

  // ---------- small renderers ----------
  const t = (k, p) => T.t(k, p);
  const res = k => t(`res.${k}`);
  const stateName = s => T.name.state(s);
  function fxText(fx, later) {
    const one = fxs => Object.entries(fxs).map(([k, v]) => `${res(k)} ${T.signed(v)}`).join(', ');
    const parts = Object.keys(fx || {}).length ? [one(fx)] : [];
    for (const d of later || []) parts.push(t('card.later', { n: d.in, fx: one(d.fx) }));
    return parts.join('; ');
  }
  function costText(cost) {
    const parts = Object.entries(cost || {}).filter(([, v]) => v).map(([k, v]) => k === 'eur' ? `${v} €` : `${v} ${res(k)}`);
    return parts.length ? parts.join(', ') : t('card.free');
  }
  function toastHtml() {
    if (!toast) return '';
    const text = toast.code ? T.msg(toast.code) : toast.key ? t(toast.key, toast.params) : toast.text;
    return `<p class="toast ${toast.err ? 'err' : ''}" role="status">${esc(text)}</p>`;
  }
  function countdown() {
    if (!W || !T) return;
    const year = `<span class="year">${W.over ? t('clock.over') : W.year}</span>`;
    if (W.over || !W.nextTickAt) { $clock.innerHTML = year; return; }
    const ms = Math.max(0, W.nextTickAt - Date.now());
    const h = Math.floor(ms / 3.6e6), m = Math.floor(ms % 3.6e6 / 6e4), s = Math.floor(ms % 6e4 / 1000);
    $clock.innerHTML = year + esc(t('clock.resolves', { t: `${h ? h + ' h ' : ''}${m} min${h ? '' : ' ' + s + ' s'}` }));
  }

  function raceHtml() {
    const items = [
      { k: 'eu', name: t('race.europe'), v: W.euInfluence },
      ...Object.entries(K.RIVALS).map(([k, r]) => ({ k, name: `${r.flag} ${T.name.rival(k)}`, v: Math.round(W.rivals[k]) })),
    ];
    const max = Math.max(160, ...items.map(i => i.v + 10));
    const pos = v => Math.max(2, Math.min(98, v / max * 100));
    const ticks = []; for (let x = 0; x <= max; x += 40) ticks.push(`<div class="tick" style="left:${pos(x)}%"><span>${x}</span></div>`);
    const rivals = items.filter(i => i.k !== 'eu').sort((a, b) => a.v - b.v);
    const side = { eu: 'up' };
    rivals.forEach((r, i) => { side[r.k] = 'down'; if (i > 0 && Math.abs(r.v - rivals[i - 1].v) < 14 && Math.abs(r.v - W.euInfluence) > 14) side[r.k] = 'up'; });
    const lead = Math.max(...rivals.map(r => r.v)) - W.euInfluence;
    const headline = lead > 0 ? t('race.behind', { n: lead }) : t('race.ahead', { n: -lead });
    const threats = Object.entries(K.THREATS).map(([k, th]) => {
      const v = Math.round(W.threats[k]);
      const nm = T.name.threat(k);
      return `<div class="threat ${v >= 50 ? 'hot' : ''}">
        <div class="t-name"><span>${th.icon} ${esc(nm)}</span><b>${v}</b></div>
        <div class="bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-label="${esc(nm)}"><i style="width:${v}%"></i></div>
        <small>${esc(T.text.threat(k, 'text'))} ${v >= 75 ? t('threat.certain') : v >= 50 ? t('threat.can') : ''}</small>
      </div>`;
    }).join('');
    const done = Object.values(W.goals).filter(g => g.done).length;
    return `<section class="race" aria-label="${esc(t('race.aria'))}">
      <div class="race-head"><h2>${esc(headline)}</h2><p>${esc(t('race.explain'))}</p></div>
      <div class="track">${ticks.join('')}<div class="rail"></div>
        ${items.map(i => `<div class="runner ${i.k === 'eu' ? 'eu' : 'rival'} ${side[i.k]}" style="left:${pos(i.v)}%"><span class="who">${esc(i.name)} ${i.v}</span><span class="dot"></span></div>`).join('')}
      </div>
      <p class="legend">${items.map(i => `<span class="${i.k === 'eu' ? 'eu' : 'rival'}"><i></i>${esc(i.name)} <b>${i.v}</b></span>`).join('')}</p>
      <div class="threats">${threats}</div>
      <div class="eu-stats">
        <span>${t('stat.level', { level: esc(T.name.level(W.level)), n: Math.round(W.integration) })}</span>
        <span>${t('stat.voting', { rule: t(W.level >= 1 ? 'rule.qmv' : 'rule.unanimity') })}</span>
        <span>${t('stat.treasury', { n: Math.round(W.treasury) })}</span>
        <span>${t('stat.goals', { n: done })}</span>
        <span>${t('stat.euScore', { n: W.euScore })}</span>
        <span>${t('stat.partners', { a: Math.round(W.partners.africa), m: Math.round(W.partners.mideast) })}</span>
      </div>
    </section>`;
  }

  function factsHtml() {
    return `<section aria-label="${esc(t('facts.title'))}"><h2>${esc(t('facts.title'))}</h2><p class="sub">${esc(t('facts.sub'))}</p>
      <div class="facts">${K.EU_FACTS.map((_, i) => { const f = T.text.fact(i); return `<div class="fact"><b>${esc(f.value)}</b><span>${esc(f.label)}, ${esc(f.note)}</span></div>`; }).join('')}</div></section>`;
  }

  function goalsHtml() {
    const rows = Object.entries(K.GOALS).map(([g, d]) => {
      const st = W.goals[g];
      const pct = Math.min(100, Math.round(st.progress / st.needed * 100));
      const seats = Object.keys(K.STATES).map(s => {
        const v = W.participation[g][s];
        const title = v == null ? t('goal.seatNone', { state: stateName(s) }) : t('goal.seat', { state: stateName(s), pct: Math.round(v * 100) });
        return `<span class="seat ${v >= .5 ? 'ok' : ''}" title="${esc(title)}">${K.STATES[s].flag}</span>`;
      }).join('');
      const my = W.me ? `<span class="status ${W.me.status[g]}">${esc(t(`goal.${W.me.status[g]}`))}</span>` : '';
      const lock = W.level < d.level ? t('goal.needs', { x: T.name.level(d.level) }) : d.requires && !W.goals[d.requires].done ? t('goal.needs', { x: T.name.goal(d.requires) }) : '';
      const meta = st.done
        ? t('goal.done', { year: st.doneYear }) + (st.late ? t('goal.late') : '')
        : [t('goal.progress', { p: st.progress, n: st.needed }), lock, t('goal.deadline', { y: d.deadline })].filter(Boolean).join(', ');
      return `<div class="goal ${st.done ? 'done' : ''}">
        <span class="icon" aria-hidden="true">${d.icon}</span>
        <div><h3>${esc(T.name.goal(g))}</h3><p class="g-meta">${esc(meta)}. ${esc(t('goal.reward', { r: T.text.goal(g, 'rewardText') }))}</p></div>
        <div style="display:grid;gap:.35rem;justify-items:end">${my}<div class="seats" aria-label="${esc(t('goal.seatsAria'))}">${seats}</div></div>
        <div class="prog"><i style="width:${st.done ? 100 : pct}%"></i></div>
      </div>`;
    }).join('');
    return `<section><h2>${esc(t('goals.title'))}</h2><p class="sub">${esc(t('goals.sub'))}</p><div class="goals">${rows}</div></section>`;
  }

  function myStateHtml() {
    const me = W.me, st = K.STATES[me.state];
    const keys = ['eur', 'energy', 'prosperity', 'education', 'tech', 'security', 'trust', 'approval'];
    const resHtml = keys.map(k => {
      const v = me.res[k];
      const meter = k === 'eur' || k === 'energy' ? '' : `<div class="meter"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div>`;
      const hint = k === 'energy' ? t(v >= 0 ? 'res.surplus' : 'res.deficit') : k === 'eur' ? t('res.income', { n: T.num(me.lastIncome ?? st.income) }) : '';
      return `<div class="r"><small>${esc(res(k))}${hint ? ', ' + esc(hint) : ''}</small><span class="num">${k === 'energy' ? T.signed(v) : Math.round(v)}</span>${meter}</div>`;
    }).join('');
    const log = me.log?.length ? `<ul class="log">${me.log.map(l => `<li>${esc(T.msg(l))}</li>`).join('')}</ul>` : '';
    return `<section><h2>${esc(t('mine.title'))}</h2>
      <div class="mystate">
        <div class="who"><h3>${st.flag} ${esc(t('mine.ledBy', { state: stateName(me.state), name: me.name }))}</h3><span>${t('mine.score', { s: me.score, state: esc(stateName(me.state)), a: W.stateScores[me.state] ?? '–', e: W.euScore })}</span></div>
        <div class="res">${resHtml}</div>
        <p class="rule"><b>${esc(T.text.state(me.state, 'ruleName'))}:</b> ${esc(T.text.state(me.state, 'ruleText'))} ${esc(t('mine.formula', { n: Math.round(me.legacy) }))}</p>
        ${me.skipYear === W.year ? `<p class="toast err">${esc(t('mine.fell'))}</p>` : ''}
        ${log}
      </div></section>`;
  }

  function cardHtml(card, info) {
    const sel = selected.has(card.id);
    const tags = [];
    for (const [g, v] of Object.entries(card.contributes || {})) tags.push(`<span class="tag plus">${esc(t('card.builds', { goal: T.name.goal(g), n: v }))}</span>`);
    for (const g of card.conflicts || []) tags.push(`<span class="tag minus">${esc(t('card.excludes', { goal: T.name.goal(g) }))}</span>`);
    for (const [k, v] of Object.entries(card.rivals || {})) tags.push(`<span class="tag ${v > 0 ? 'minus' : 'plus'}">${esc(T.name.rival(k))} ${T.signed(v)}</span>`);
    for (const [k, v] of Object.entries(card.threats || {})) tags.push(`<span class="tag ${v > 0 ? 'minus' : 'plus'}">${esc(T.name.threat(k))} ${T.signed(v)}</span>`);
    for (const [k, v] of Object.entries(card.partners || {})) tags.push(`<span class="tag plus">${esc(T.name.partner(k))} ${T.signed(v)}</span>`);
    if (card.state) tags.push(`<span class="tag state">${esc(t('card.stateOnly', { state: stateName(card.state) }))}</span>`);
    const fx = fxText(card.fx, card.later);
    return `<button class="card ${sel ? 'sel' : ''}" data-card="${card.id}" ${info.lock ? 'disabled' : ''} aria-pressed="${sel}">
      <span class="top"><span class="name">${esc(T.name.card(card.id))}</span><span class="cost">${esc(t('card.ap', { ap: card.ap, cost: costText(info.cost) }))}</span></span>
      ${fx ? `<span class="fx">${esc(fx)}</span>` : ''}
      ${tags.length ? `<span class="tags">${tags.join('')}</span>` : ''}
      ${info.lock ? `<span class="lock">${esc(t('card.locked', { r: T.msg(info.lock) }))}</span>` : `<span class="note">${esc(T.text.cardNote(card.id))}</span>`}
    </button>`;
  }

  function decisionsHtml() {
    const me = W.me;
    const info = Object.fromEntries(me.cards.map(c => [c.id, c]));
    const cards = K.CARDS.filter(c => info[c.id]);
    const apUsed = [...selected].reduce((s, id) => s + (K.CARDS.find(c => c.id === id)?.ap || 0), 0);
    const eurUsed = [...selected].reduce((s, id) => s + (info[id]?.cost?.eur || 0), 0);
    const rank = c => (c.lock ? 1 : 0);
    const col = tier => {
      const list = cards.filter(c => c.tier === tier && !(c.rejoin && info[c.id].lock))
        .sort((a, b) => rank(info[a.id]) - rank(info[b.id]) || (a.state ? -1 : 0) - (b.state ? -1 : 0));
      return `<div class="tier"><h3>${esc(t(`tier.${tier}`))}</h3><p class="sub">${esc(t(`tier.${tier}.text`))}</p><div class="cards">${list.map(c => cardHtml(c, info[c.id])).join('')}</div></div>`;
    };
    const dots = Array.from({ length: K.AP_PER_YEAR }, (_, i) => `<i class="${i < apUsed ? 'on' : ''}"></i>`).join('');
    const canAct = me.skipYear !== W.year && !W.over;
    return `<section aria-label="${esc(t('dec.aria'))}">
      <h2>${esc(t('dec.title', { y: W.year }))}</h2>
      <p class="sub">${esc(t('dec.sub', { n: K.AP_PER_YEAR }))}</p>
      <div class="plan-bar">
        <span class="ap" aria-label="${esc(t('plan.aria', { u: apUsed, n: K.AP_PER_YEAR }))}">${dots} ${esc(t('plan.bar', { u: apUsed, n: K.AP_PER_YEAR, e: eurUsed, m: Math.round(me.res.eur) }))}</span>
        <span><button class="btn" id="save" ${!canAct || apUsed > K.AP_PER_YEAR ? 'disabled' : ''}>${esc(t(dirty ? 'plan.save' : 'plan.saved'))}</button>
        ${ADMIN ? `<button class="btn gold" id="tick">${esc(t('plan.tick'))}</button>` : ''}</span>
      </div>
      ${toastHtml()}
      <div class="tiers">${[1, 2, 3].map(col).join('')}</div>
    </section>`;
  }

  function councilHtml() {
    const pr = K.PROPOSALS.find(p => p.id === W.proposal);
    const lc = W.lastCouncil;
    const myVote = W.me?.vote;
    const effects = [fxText(pr.fx), pr.eu?.treasury ? `${res('treasury')} ${T.signed(pr.eu.treasury)}` : '', pr.eu?.integration ? `${res('integration')} ${T.signed(pr.eu.integration)}` : '',
      ...Object.entries(pr.eu?.threats || {}).map(([k, v]) => `${T.name.threat(k)} ${T.signed(v)}`),
      ...Object.entries(pr.stateApproval || {}).map(([s, v]) => `${stateName(s)}: ${res('approval')} ${T.signed(v)}`)].filter(Boolean).join('; ');
    const last = lc ? `<p class="sub" style="margin-top:1rem">${t('council.last', { name: esc(T.name.proposal(lc.id)), result: t(lc.passed ? 'council.passed' : 'council.rejected'), rule: t(lc.rule === 'QMV' ? 'rule.qmv' : 'rule.unanimity') })}</p>
      <div class="split">${Object.entries(lc.stateVotes).map(([s, v]) => `<span class="${v.vote}">${esc(t('council.split', { flag: K.STATES[s].flag, vote: t(`vote.${v.vote}`), y: v.yes, n: v.no }))}</span>`).join('')}</div>` : '';
    return `<section><h2>${esc(t('council.title'))}</h2><div class="panel">
      <h3>${esc(T.name.proposal(pr.id))}</h3><p class="sub">${esc(T.text.proposal(pr.id, 'text'))} ${esc(t('council.ifPasses', { e: effects }))}</p>
      <p class="sub">${esc(t(W.level >= 1 ? 'council.qmv' : 'council.unanimity'))}</p>
      ${W.me ? `<div class="vote"><button class="btn ${myVote === 'yes' ? 'on' : 'ghost'}" data-vote="yes">${esc(t('council.voteYes'))}</button><button class="btn ${myVote === 'no' ? 'on' : 'ghost'}" data-vote="no">${esc(t('council.voteNo'))}</button></div>` : ''}
      ${last}</div></section>`;
  }

  function newsHtml() {
    const ev = T.text.event(W.lastEvent);
    return `<section><h2>${esc(t('news.title'))}</h2><div class="panel">
      ${ev ? `<h3>${esc(ev.name)} (${W.lastEvent.year})</h3><p class="sub">${esc(ev.text)}</p>` : `<p class="sub">${esc(t('news.none'))}</p>`}
      <ul class="news">${W.news.map(n => `<li><b>${n.year}</b><span>${esc(n.k ? T.msg(n) : n.text)}</span></li>`).join('')}</ul></div></section>`;
  }

  function boardsHtml() {
    const states = Object.keys(K.STATES).map(s => ({ s, v: W.stateScores[s] })).sort((a, b) => (b.v ?? 0) - (a.v ?? 0));
    const pname = p => p.bot ? t('botName', { state: stateName(p.state) }) : p.name;
    return `<section><h2>${esc(t('boards.title'))}</h2>
      <div class="panel"><h3>${esc(t('boards.states'))}</h3><table><thead><tr><th>${esc(t('th.state'))}</th><th>${esc(t('th.players'))}</th><th class="n">${esc(t('th.score'))}</th></tr></thead><tbody>
      ${states.map(x => `<tr class="${W.me?.state === x.s ? 'me' : ''}"><td>${K.STATES[x.s].flag} ${esc(stateName(x.s))}</td><td>${W.counts[x.s].humans || (W.counts[x.s].bot ? esc(t('bot')) : 0)}</td><td class="n">${x.v ?? '–'}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="panel"><h3>${esc(t('boards.players'))}</h3><table><thead><tr><th>${esc(t('th.player'))}</th><th>${esc(t('th.state'))}</th><th class="n">${esc(t('th.score'))}</th></tr></thead><tbody>
      ${W.leaderboard.map(p => `<tr class="${W.me && p.name === W.me.name && p.state === W.me.state ? 'me' : ''}"><td>${esc(pname(p))}</td><td>${K.STATES[p.state].flag}</td><td class="n">${p.finalScore ?? p.score}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  function endingHtml() {
    if (!W.over) return '';
    const e = T.text.ending(W.ending);
    return `<div class="ending" role="status"><h2>${esc(e.name)}</h2><p>${esc(t('ending.text', { text: e.text, m: T.num(W.ending.mult) }))}${W.me ? t('ending.yours', { s: W.me.finalScore }) : ''}</p></div>`;
  }

  function joinHtml() {
    const cards = Object.entries(K.STATES).map(([s, d]) => {
      const f = k => T.text.state(s, k);
      return `
      <button class="state-card ${pickState === s ? 'sel' : ''}" data-state="${s}" aria-pressed="${pickState === s}">
        <span class="flag" aria-hidden="true">${d.flag}</span><h3>${esc(stateName(s))}</h3>
        <span class="facts-line">${esc(t('join.facts', { pop: f('population'), gdp: f('gdp'), def: f('defence') }))}</span>
        <span class="facts-line">${esc(f('line'))}</span>
        <span class="plus">${esc(t('join.strong', { t: f('strengthText') }))}</span>
        <span class="minus">${esc(t('join.weak', { t: f('weaknessText') }))}</span>
        <span class="facts-line"><b>${esc(f('ruleName'))}:</b> ${esc(f('ruleText'))}</span>
        <span class="players">${esc(t('join.players', { n: W.counts[s].humans, bot: W.counts[s].bot }))}</span>
      </button>`;
    }).join('');
    return `<section class="join"><h2>${esc(t('join.title'))}</h2>
      <p class="join-intro">${esc(t('join.intro', { min: K.TICK_MINUTES }))}</p>
      <div class="states">${cards}</div>
      <div class="join-form"><label for="pname" class="sub">${esc(t('join.name'))}</label><input id="pname" maxlength="40" placeholder="${esc(t('join.placeholder'))}" autocomplete="nickname">
      <button class="btn" id="join" ${pickState ? '' : 'disabled'}>${esc(pickState ? t('join.btn', { state: stateName(pickState) }) : t('join.pick'))}</button></div>
      ${toast?.err ? toastHtml() : ''}
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
  $lang.addEventListener('click', e => {
    const b = e.target.closest('[data-lang]');
    if (b && K) { setLang(b.dataset.lang, true); render(); }
  });

  $app.addEventListener('click', async e => {
    const st = e.target.closest('[data-state]');
    if (st) {
      pickState = st.dataset.state; toast = null;
      setLang(STATE_LANG[pickState] || 'en', true); // choosing Czechia switches the game to Czech
      render(); document.getElementById('pname')?.focus(); return;
    }
    if (e.target.closest('#join')) {
      try {
        const name = document.getElementById('pname').value;
        const r = await api('/api/join', { name, state: pickState });
        playerId = r.playerId; store.set('ego.playerId', playerId);
        toast = null; await refresh();
      } catch (err) { toast = errToast(err); render(); }
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
      try {
        await api('/api/plan', { playerId, cards: [...selected], vote: vote.dataset.vote });
        dirty = false; toast = { key: 'toast.vote', params: { v: t(`vote.${vote.dataset.vote}`) } }; await refresh();
      } catch (err) { toast = errToast(err); render(); }
      return;
    }
    if (e.target.closest('#save')) {
      try {
        const r = await api('/api/plan', { playerId, cards: [...selected] });
        dirty = false; toast = { key: 'toast.plan', params: { n: r.plan.length, ap: r.ap } }; await refresh();
      } catch (err) { toast = errToast(err); render(); }
      return;
    }
    if (e.target.closest('#tick')) {
      try { await api('/api/admin/tick', {}); toast = { key: 'toast.tick' }; dirty = false; await refresh(); }
      catch (err) { toast = errToast(err); render(); }
    }
  });

  (async () => {
    try {
      K = await api('/api/content');
      if (lang) setLang(lang, false);
      await refresh();
      setInterval(countdown, 1000);
      setInterval(() => refresh(true).catch(() => { }), 20000);
    } catch (err) {
      if (!T) T = EGO_I18N.make(lang || 'en', K || { CARDS: [] });
      $app.innerHTML = `<p class="loading">${esc(T.t('app.loadError', { e: err.message }))}</p>`;
    }
  })();
})();
