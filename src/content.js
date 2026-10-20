// EGO – Europe Goes On: game content.
// All game numbers live here so designers can rebalance without touching the engine.
// "facts" fields are real-world figures shown to players; game values are abstractions.

const START_YEAR = 2027;
const END_YEAR = 2040;
const AP_PER_YEAR = 3;
const LEVELS = ['Confederation', 'Union', 'Federation'];
const LEVEL_THRESHOLDS = [0, 35, 70]; // Integration Index needed for each level

const EU_FACTS = [
  { label: 'Population', value: '450.4 million', note: '1 Jan 2025, Eurostat' },
  { label: 'GDP', value: '€18.8 trillion', note: '2025, Eurostat' },
  { label: 'War', value: "Russia's full-scale war on Ukraine is in its 5th year", note: '2026' },
  { label: 'Defence', value: '€150 bn SAFE loans for joint procurement', note: 'ReArm Europe / Readiness 2030' },
  { label: 'AI', value: '€10 bn call for 7 AI gigafactories', note: 'July 2026' },
  { label: 'Migration', value: 'Pact on Migration and Asylum applies', note: 'since 12 June 2026' },
];

const STATES = {
  DE: {
    name: 'Germany', flag: '🇩🇪', weight: 83.6, income: 26,
    start: { prosperity: 62, education: 60, tech: 55, security: 40, trust: 50, approval: 45, energy: -6 },
    strengths: ['ai', 'defense'],
    strengthText: 'Money, industry, research',
    weaknessText: 'Energy-hungry, slow to rearm',
    rule: { id: 'debtBrake', name: 'Debt brake', text: 'Cards costing more than 15 € also cost 3 Approval, unless Education is 60+.' },
    facts: { population: '83.6 M', gdp: '€4.47 tn', defence: '2.4% of GDP', line: 'Largest EU economy, about a quarter of EU GDP.' },
  },
  FR: {
    name: 'France', flag: '🇫🇷', weight: 68.6, income: 23,
    start: { prosperity: 58, education: 55, tech: 50, security: 55, trust: 50, approval: 38, energy: 6 },
    strengths: ['nuclear', 'space', 'defense'],
    strengthText: 'Nuclear surplus, spaceport, defence industry',
    weaknessText: 'High debt, fragile parliament',
    rule: { id: 'protests', name: 'Street protests', text: 'Losing 5+ Approval in one year triggers a further −3.' },
    facts: { population: '68.6 M', gdp: '€2.99 tn', defence: '2.05% of GDP', line: "Runs the EU's largest nuclear fleet and Europe's spaceport in Kourou." },
  },
  ES: {
    name: 'Spain', flag: '🇪🇸', weight: 49.1, income: 19,
    start: { prosperity: 52, education: 45, tech: 35, security: 35, trust: 55, approval: 45, energy: 4 },
    strengths: ['power', 'edu'],
    strengthText: 'Solar and wind surplus, links to North Africa',
    weaknessText: 'Low Tech, weak grid links to France',
    rule: { id: 'energyIsland', name: 'Energy island', text: 'Energy surplus sells at half price until the Pyrenees interconnector is built.' },
    facts: { population: '49.1 M', gdp: '€1.69 tn', defence: '2.0% of GDP', line: 'Extended the Almaraz nuclear plant to June 2030 but keeps a 2035 phase-out.' },
  },
  PL: {
    name: 'Poland', flag: '🇵🇱', weight: 36.5, income: 17,
    start: { prosperity: 52, education: 50, tech: 35, security: 65, trust: 45, approval: 50, energy: -4 },
    strengths: ['defense'],
    strengthText: 'Strongest army in the EU, fast growth',
    weaknessText: 'Coal dependence, low Tech',
    rule: { id: 'frontline', name: 'Frontline state', text: 'War and border crises hit Poland twice as hard.' },
    facts: { population: '36.5 M', gdp: '€0.92 tn', defence: '4.48% of GDP', line: 'Highest NATO defence spender relative to GDP in 2025.' },
  },
  NL: {
    name: 'Netherlands', flag: '🇳🇱', weight: 18.0, income: 17,
    start: { prosperity: 70, education: 65, tech: 65, security: 42, trust: 55, approval: 45, energy: -3 },
    strengths: ['ai', 'power'],
    strengthText: 'Chips, ports, high Tech',
    weaknessText: 'Small, imports energy',
    rule: { id: 'frugal', name: 'Frugal voters', text: 'EU-tier cards cost 2 extra Approval.' },
    facts: { population: '18.0 M', gdp: '€1.17 tn', defence: '2.49% of GDP', line: "Home of ASML, the only maker of EUV chip lithography machines." },
  },
  CZ: {
    name: 'Czechia', flag: '🇨🇿', weight: 10.9, income: 13,
    start: { prosperity: 55, education: 55, tech: 45, security: 45, trust: 45, approval: 50, energy: -2 },
    strengths: ['nuclear', 'defense'],
    strengthText: 'Car and defence industry, nuclear know-how',
    weaknessText: 'Small budget, coal still in the mix',
    rule: { id: 'sovereign', name: 'Sovereignty-minded coalition', text: 'EU-tier cards cost 2 extra Approval; sovereignty cards give +2 Approval.' },
    facts: { population: '10.9 M', gdp: '€0.35 tn', defence: '2.0% of GDP', line: 'Coordinates the ammunition initiative for Ukraine; new Dukovany reactors are due from 2036.' },
  },
};

// Seven European megaprojects. level = minimum EU level index (0 Confederation, 1 Union, 2 Federation).
const GOALS = {
  edu: {
    name: 'European Education Area', icon: '🎓', level: 0, deadline: 2031, cost: 8,
    rewardText: 'Education +2/yr, Trust +8, no brain-drain events',
    once: { trust: 8 }, perYear: { education: 2 }, onComplete: { rivals: { usa: -3 } },
    note: 'Mutual degree recognition and joint universities.',
  },
  power: {
    name: 'Single Power Market', icon: '⚡', level: 0, deadline: 2032, cost: 10,
    rewardText: 'Energy deficit costs −30%, surplus sells +50%',
    modifiers: { deficitPrice: 0.7, surplusPrice: 1.5 }, onComplete: { threats: { war: -10 } },
    note: 'EU electricity can cost two to three times as much as in the US or China.',
  },
  health: {
    name: 'European Health Union', icon: '🩺', level: 0, deadline: 2032, cost: 8,
    rewardText: 'Disease crises halved, Approval +4',
    once: { approval: 4 }, onComplete: { threats: { disease: -25 } },
    note: 'Joint stockpiles, joint vaccine purchase, shared surveillance.',
  },
  nuclear: {
    name: 'Nuclear & Fusion Program', icon: '☢️', level: 1, deadline: 2036, cost: 12,
    rewardText: 'Energy +6 for good',
    once: { energy: 6 }, onComplete: { threats: { war: -10 }, rivals: { china: -3 } },
    note: 'New reactors, fusion research and a shared fuel supply.',
  },
  ai: {
    name: 'European AI', icon: '🤖', level: 1, requires: 'power', deadline: 2034, cost: 12,
    rewardText: 'Income ×1.15, Tech +3/yr',
    perYear: { tech: 3 }, modifiers: { incomeMult: 1.15 }, onComplete: { threats: { ai: -25 }, rivals: { usa: -5, china: -5 } },
    note: "All five of the EU's largest cloud providers are American.",
  },
  space: {
    name: 'EU Space Program', icon: '🚀', level: 1, deadline: 2036, cost: 12,
    rewardText: 'Security +8, Tech +2/yr',
    once: { security: 8 }, perYear: { tech: 2 }, onComplete: { rivals: { usa: -3, china: -2 } },
    note: 'Own launchers, secure satellite links, Earth observation.',
  },
  defense: {
    name: 'Defence Union', icon: '🛡️', level: 2, deadline: 2038, cost: 12,
    rewardText: 'Security +20, defence cards −30%',
    once: { security: 20 }, modifiers: { defenseDiscount: 0.7 }, onComplete: { threats: { war: -20, migration: -10 } },
    note: 'About 40% of EU defence equipment spending goes to suppliers outside the EU.',
  },
};

// Four threat tracks (0–100). Baseline growth per year; a crisis can strike from 50, is certain from 75.
const THREATS = {
  war: { name: 'War', icon: '💥', start: 45, growth: 2, text: "Russia's war and hybrid attacks: drones, sabotage, cyberattacks." },
  disease: { name: 'Disease', icon: '🦠', start: 25, growth: 2, text: 'Pandemic risk: avian influenza, measles, new respiratory viruses.' },
  ai: { name: 'AI overtake', icon: '🧠', start: 40, growth: 2, text: 'Rivals lead in AI: jobs, deepfakes, dependence on foreign models.' },
  migration: { name: 'Hybrid migration pressure', icon: '🚧', start: 35, growth: 1, text: 'Hostile states push migrants to EU borders as a pressure tool.' },
};

const RIVALS = {
  usa: { name: 'USA', flag: '🇺🇸', start: 60, growth: 1.5, role: 'Competitor and ally: tempting deals, attracts European talent.' },
  china: { name: 'China', flag: '🇨🇳', start: 55, growth: 2, role: 'Systemic rival: buys strategic assets, leads clean-tech supply.' },
};

const PARTNERS = {
  africa: { name: 'Africa', drift: -3, rewardText: 'Energy +3/yr for all, EU Influence +5' },
  mideast: { name: 'Middle East', drift: -2, rewardText: 'Energy price shocks halved, EU Influence +5' },
};

// Card fields: tier 1 national / 2 bilateral (Trust 30+) / 3 EU (Trust 50+ and goal level).
// cost: resources paid up front. fx: immediate effects. later: [{ in: years, fx }].
// contributes: { goal: points }. conflicts: [goal]. rivals/threats/partners: EU-wide pushes (scaled by player count).
const COMMON_CARDS = [
  // Tier 1 — national
  { id: 'c_univ', name: 'Fund universities', tier: 1, ap: 1, cost: { eur: 8 }, fx: { approval: 1 }, later: [{ in: 2, fx: { education: 6 } }], edu: true,
    note: 'Education pays off in years, not months.' },
  { id: 'c_vocational', name: 'Vocational training', tier: 1, ap: 1, cost: { eur: 5 }, fx: { prosperity: 1 }, later: [{ in: 1, fx: { education: 3 } }], edu: true,
    note: 'Skilled workers raise growth quickly.' },
  { id: 'c_cut_edu', name: 'Cut the education budget', tier: 1, ap: 1, cost: {}, fx: { eur: 10 }, later: [{ in: 1, fx: { education: -6 } }], conflicts: ['edu'],
    note: 'Money now, weaker schools and research later.' },
  { id: 'c_tax_cut', name: 'Tax cut', tier: 1, ap: 1, cost: {}, fx: { approval: 6 }, later: [{ in: 1, fx: { eur: -3 } }, { in: 2, fx: { eur: -3 } }, { in: 3, fx: { eur: -3 } }],
    note: 'Popular today, paid for over the next three years.' },
  { id: 'c_subsidy', name: 'National champion subsidy', tier: 1, ap: 2, cost: { eur: 12 }, fx: { tech: 3, prosperity: 3, trust: -3 },
    note: 'State aid helps one company and distorts the single market.' },
  { id: 'c_defense', name: 'Raise the defence budget', tier: 1, ap: 1, cost: { eur: 10 }, fx: { security: 6 }, defense: true,
    note: 'Every EU member of NATO reached 2% of GDP on defence in 2025.' },
  { id: 'c_foreign_arms', name: 'Buy non-EU arms off the shelf', tier: 1, ap: 1, cost: { eur: 8 }, fx: { security: 10, trust: -4 }, defense: true,
    conflicts: ['defense'], rivals: { usa: 1 }, note: 'Fast delivery, but no European industry or common standard.' },
  { id: 'c_gas', name: 'Cheap long-term gas deal', tier: 1, ap: 1, cost: {}, fx: { energy: 5, eur: 5, trust: -8 }, conflicts: ['power'], threats: { war: 3 },
    note: 'Dependence on an authoritarian supplier is leverage over you.' },
  { id: 'c_sell_asset', name: 'Sell a tech company abroad', tier: 1, ap: 1, cost: {}, fx: { eur: 15, trust: -5 }, conflicts: ['ai'], rivals: { china: 2 },
    note: 'Strategic know-how leaves Europe for good.' },
  { id: 'c_ai_cloud', name: 'Exclusive deal with a foreign AI cloud', tier: 1, ap: 1, cost: { eur: 3 }, fx: { tech: 4 }, conflicts: ['ai'], rivals: { usa: 2 }, threats: { ai: 1 },
    note: 'Quick AI access, deeper dependence.' },
  { id: 'c_fence', name: 'National border fence', tier: 1, ap: 1, cost: { eur: 8 }, fx: { security: 2, approval: 3, trust: -1 }, threats: { migration: -1 },
    note: 'Protects one border; pressure moves to the neighbours.' },
  { id: 'c_shield', name: 'Disinformation and deepfake shield', tier: 1, ap: 1, cost: { eur: 5 }, fx: { approval: 1 }, threats: { ai: -2 },
    note: 'Media literacy and detection tools.' },
  // Tier 2 — bilateral
  { id: 'b_erasmus', name: 'Erasmus exchange', tier: 2, ap: 1, cost: { eur: 4 }, fx: { trust: 3 }, later: [{ in: 1, fx: { education: 3 } }], contributes: { edu: 1 }, edu: true,
    note: 'Erasmus has sent students abroad since 1987.' },
  { id: 'b_research', name: 'Joint research centre', tier: 2, ap: 1, cost: { eur: 6 }, fx: { tech: 2, trust: 3 }, partnerBonus: { tech: 2 },
    note: 'Shared labs pool scarce talent.' },
  { id: 'b_interconnector', name: 'Cross-border interconnector', tier: 2, ap: 2, cost: { eur: 10 }, fx: { energy: 2, trust: 4 }, contributes: { power: 2 },
    note: 'Cables between grids let cheap power flow where it is needed.' },
  { id: 'b_ukraine', name: 'Support Ukraine with partners', tier: 2, ap: 1, cost: { eur: 8 }, fx: { trust: 4, security: 1, approval: -1 }, threats: { war: -2 },
    note: "Europe's security is decided on Ukraine's front line." },
  { id: 'b_joint_buy', name: 'Joint vaccine and medicine purchase', tier: 2, ap: 1, cost: { eur: 5 }, fx: { trust: 2 }, contributes: { health: 1 }, threats: { disease: -1 },
    note: 'Buying together gets lower prices and fair distribution.' },
  { id: 'b_solidarity', name: 'Asylum solidarity with frontline states', tier: 2, ap: 1, cost: { eur: 6 }, fx: { trust: 4, approval: -2 }, threats: { migration: -2 },
    note: 'The Pact on Migration and Asylum includes a yearly solidarity pool.' },
  // Tier 3 — EU (goal contribution cards are generated below)
  { id: 'e_gateway', name: 'Global Gateway: Africa', tier: 3, ap: 2, level: 0, cost: { eur: 10 }, fx: { trust: 2 }, later: [{ in: 3, fx: { energy: 3 } }], partners: { africa: 6 }, rivals: { china: -1 },
    note: 'EU investment in African energy and transport.' },
  { id: 'e_med', name: 'Mediterranean energy corridor', tier: 3, ap: 2, level: 0, cost: { eur: 10 }, fx: { energy: 2, trust: 2 }, partners: { mideast: 6 }, threats: { war: -1 },
    note: 'Gas and hydrogen links that bypass hostile suppliers.' },
];

const STATE_CARDS = [
  // Germany
  { id: 'de_energy_sub', state: 'DE', name: 'Industrial energy subsidy', tier: 1, ap: 1, cost: { eur: 10 }, fx: { prosperity: 4, trust: -2 }, note: 'Keeps factories running, angers neighbours.' },
  { id: 'de_block_nuclear', state: 'DE', name: 'Block EU nuclear funding', tier: 1, ap: 1, cost: {}, fx: { approval: 4, trust: -6 }, conflicts: ['nuclear'], note: 'Germany shut its last reactors in 2023.' },
  { id: 'de_china_cars', state: 'DE', name: 'Car export deal with China', tier: 1, ap: 1, cost: {}, fx: { eur: 10 }, rivals: { china: 2 }, note: 'Sales today, dependence tomorrow.' },
  { id: 'de_fusion', state: 'DE', name: 'Fund EU fusion research', tier: 3, ap: 2, level: 1, cost: { eur: 10 }, fx: { tech: 2, trust: 3 }, contributes: { nuclear: 3 }, note: 'Contributes to nuclear without building reactors.' },
  { id: 'de_tanks', state: 'DE', name: 'Joint tank programme with France and Poland', tier: 2, ap: 2, cost: { eur: 12 }, fx: { trust: 5 }, later: [{ in: 1, fx: { security: 6 } }], contributes: { defense: 2 }, defense: true, note: 'One European tank instead of three national ones.' },
  { id: 'de_eurobonds', state: 'DE', name: 'Back Eurobonds', tier: 3, ap: 2, level: 0, cost: { approval: 5 }, fx: { integration: 3, treasury: 20, trust: 5 }, note: 'Common debt for common goals: the biggest taboo in Berlin.' },
  // France
  { id: 'fr_reactors', state: 'FR', name: 'Build new reactors', tier: 1, ap: 2, cost: { eur: 15 }, later: [{ in: 3, fx: { energy: 10 } }], note: 'France plans a new generation of EPR2 reactors.' },
  { id: 'fr_grid', state: 'FR', name: 'Open reactors to the EU grid', tier: 3, ap: 2, level: 0, cost: {}, fx: { trust: 5 }, contributes: { power: 2, nuclear: 2 }, note: 'French nuclear power at European prices.' },
  { id: 'fr_kourou', state: 'FR', name: 'Kourou spaceport for Europe', tier: 3, ap: 2, level: 1, cost: { eur: 8 }, fx: { tech: 2 }, contributes: { space: 4 }, note: "Europe's launch site in French Guiana." },
  { id: 'fr_buy_eu', state: 'FR', name: 'Buy European defence clause', tier: 2, ap: 1, cost: {}, fx: { trust: 4 }, contributes: { defense: 1 }, note: 'SAFE loans favour European suppliers.' },
  { id: 'fr_farm', state: 'FR', name: 'Protect farm subsidies, block a trade deal', tier: 1, ap: 1, cost: {}, fx: { approval: 6, trust: -4 }, note: 'Farmers are a powerful lobby in France.' },
  { id: 'fr_jets', state: 'FR', name: 'Fighter jet exports outside the EU', tier: 1, ap: 1, cost: {}, fx: { eur: 12, security: 2 }, note: 'Rafale exports fund the French defence industry.' },
  // Spain
  { id: 'es_solar', state: 'ES', name: 'Solar boom', tier: 1, ap: 1, cost: { eur: 8 }, fx: { energy: 8 }, note: 'Spain has some of the best solar conditions in Europe.' },
  { id: 'es_pyrenees', state: 'ES', name: 'Pyrenees interconnector', tier: 2, ap: 2, cost: { eur: 12 }, fx: { trust: 5 }, flag: 'pyrenees', contributes: { power: 4 }, note: 'The Iberian grid has only weak links to France.' },
  { id: 'es_hydrogen', state: 'ES', name: 'Green hydrogen with North Africa', tier: 3, ap: 2, level: 0, cost: { eur: 10 }, later: [{ in: 2, fx: { energy: 4 } }], partners: { africa: 5 }, note: 'Sun and wind turned into fuel for industry.' },
  { id: 'es_academies', state: 'ES', name: 'Youth tech academies', tier: 1, ap: 1, cost: { eur: 7 }, fx: { approval: 3 }, later: [{ in: 2, fx: { education: 8 } }], edu: true, note: 'Youth unemployment is a long-standing Spanish problem.' },
  { id: 'es_sell_grid', state: 'ES', name: 'Sell a grid stake to a foreign state fund', tier: 1, ap: 1, cost: {}, fx: { eur: 15 }, conflicts: ['power'], rivals: { china: 2 }, note: 'Critical infrastructure under foreign control.' },
  { id: 'es_almaraz', state: 'ES', name: 'Keep the Almaraz nuclear plant running', tier: 1, ap: 1, cost: { eur: 4 }, fx: { energy: 3, approval: -1 }, note: 'Spain extended Almaraz to June 2030 in August 2026.' },
  // Poland
  { id: 'pl_coal', state: 'PL', name: 'Modernise coal plants', tier: 1, ap: 1, cost: { eur: 6 }, fx: { energy: 5, trust: -5 }, later: [{ in: 1, fx: { prosperity: -1 } }, { in: 2, fx: { prosperity: -1 } }, { in: 3, fx: { prosperity: -1 } }], note: 'Cheap now; carbon costs keep rising.' },
  { id: 'pl_wind', state: 'PL', name: 'Baltic offshore wind', tier: 1, ap: 2, cost: { eur: 12 }, later: [{ in: 2, fx: { energy: 8 } }], contributes: { power: 1 }, note: 'The Baltic Sea is a growing wind hub.' },
  { id: 'pl_us_arms', state: 'PL', name: 'Large US arms deal', tier: 1, ap: 2, cost: { eur: 15 }, fx: { security: 15 }, conflicts: ['defense'], rivals: { usa: 2 }, defense: true, note: 'Poland buys F-35 jets, among other US systems.' },
  { id: 'pl_tanks', state: 'PL', name: 'Joint tank production with Germany', tier: 2, ap: 2, cost: { eur: 10 }, fx: { trust: 5 }, later: [{ in: 1, fx: { security: 6 } }], contributes: { defense: 2 }, defense: true, note: 'Building together creates jobs at home.' },
  { id: 'pl_hub', state: 'PL', name: 'Host the EU eastern defence hub', tier: 3, ap: 2, level: 2, cost: { eur: 8 }, fx: { security: 8, prosperity: 2 }, contributes: { defense: 4 }, defense: true, note: 'Poland borders Russia, Belarus and Ukraine.' },
  { id: 'pl_nuclear', state: 'PL', name: 'First nuclear plant with an EU partner', tier: 3, ap: 2, level: 1, cost: { eur: 14 }, later: [{ in: 3, fx: { energy: 8 } }], contributes: { nuclear: 3 }, note: 'Poland has no nuclear plant yet.' },
  // Netherlands
  { id: 'nl_chips', state: 'NL', name: 'Export chip machines to anyone', tier: 1, ap: 1, cost: {}, fx: { eur: 15 }, conflicts: ['ai'], rivals: { china: 2 }, note: 'Export controls on chip tools are a geopolitical weapon.' },
  { id: 'nl_compute', state: 'NL', name: 'Anchor a European AI compute centre', tier: 3, ap: 2, level: 1, cost: { eur: 10 }, fx: { tech: 3 }, contributes: { ai: 4 }, note: 'Compute is the bottleneck for European AI.' },
  { id: 'nl_frugal', state: 'NL', name: 'Frugal veto on the EU budget', tier: 1, ap: 1, cost: {}, fx: { approval: 6, trust: -8, integration: -2 }, note: 'The Netherlands often leads the "frugal" camp.' },
  { id: 'nl_northsea', state: 'NL', name: 'North Sea wind hub with Germany', tier: 2, ap: 2, cost: { eur: 10 }, fx: { energy: 5, trust: 4 }, contributes: { power: 2 }, note: 'Offshore wind shared across borders.' },
  { id: 'nl_rotterdam', state: 'NL', name: 'Rotterdam hydrogen port', tier: 3, ap: 2, level: 0, cost: { eur: 10 }, fx: { energy: 3 }, partners: { africa: 3, mideast: 3 }, note: "Europe's largest port as an energy gateway." },
  { id: 'nl_talent', state: 'NL', name: 'Talent visa for researchers', tier: 1, ap: 1, cost: { eur: 5 }, fx: { education: 4, tech: 2 }, flag: 'talent', edu: true, note: 'Blocks brain drain to the USA.' },
  // Czechia
  { id: 'cz_ammo', state: 'CZ', name: 'Ammunition initiative for Ukraine', tier: 2, ap: 1, cost: { eur: 4 }, fx: { security: 2, trust: 6 }, contributes: { defense: 1 }, threats: { war: -3 }, note: 'Czechia coordinates it; in 2026 partner countries pay for it.' },
  { id: 'cz_optout', state: 'CZ', name: 'Opt out of EU Ukraine funding', tier: 1, ap: 1, cost: {}, fx: { eur: 8, approval: 3, trust: -6 }, sovereign: true, conflicts: ['defense'], threats: { war: 2 }, note: "In 2026 Czechia secured an opt-out from the EU's €90 bn Ukraine package." },
  { id: 'cz_dukovany', state: 'CZ', name: 'New Dukovany reactors', tier: 1, ap: 2, cost: { eur: 14 }, later: [{ in: 3, fx: { energy: 8 } }], contributes: { nuclear: 2 }, note: "Two new units by Korea's KHNP; the first is due in 2036." },
  { id: 'cz_cars', state: 'CZ', name: 'Protect the car industry', tier: 1, ap: 1, cost: { eur: 6 }, fx: { prosperity: 3, trust: -2 }, sovereign: true, note: 'Car making is the backbone of Czech industry.' },
  { id: 'cz_gigafactory', state: 'CZ', name: 'Bid for an EU AI gigafactory', tier: 3, ap: 2, level: 1, cost: { eur: 8 }, fx: { tech: 2 }, contributes: { ai: 3 }, note: 'Prague is among the cities bidding to host one.' },
  { id: 'cz_v4', state: 'CZ', name: 'Align with Slovakia and Hungary', tier: 1, ap: 1, cost: {}, fx: { approval: 4, trust: -4, integration: -1 }, sovereign: true, note: 'A Central European bloc against Brussels majorities.' },
];

// One contribution card per goal, plus a re-entry card for excluded players.
const GOAL_CARDS = Object.entries(GOALS).flatMap(([gid, g]) => [
  { id: `g_${gid}`, name: `Contribute: ${g.name}`, tier: 3, ap: 2, level: g.level, goalCard: gid, cost: { eur: g.cost }, fx: { trust: 3 }, contributes: { [gid]: 2 },
    defense: gid === 'defense', note: g.note },
  { id: `r_${gid}`, name: `Rejoin: ${g.name}`, tier: 1, ap: 1, rejoin: gid, cost: { eur: 20, trust: 15 }, fx: {},
    note: 'Pay to be eligible for the reward again.' },
]);

const CARDS = [...COMMON_CARDS, ...GOAL_CARDS, ...STATE_CARDS];

// Council proposals: one per year. stateApproval = extra Approval change for specific states if it passes.
const PROPOSALS = [
  { id: 'p_eurobonds', name: 'Eurobonds for common goals', text: 'Joint EU borrowing pays into the treasury.',
    fx: { approval: -2 }, eu: { treasury: 40, integration: 4 }, stateApproval: { DE: -2, NL: -3 } },
  { id: 'p_ukraine', name: 'Joint support package for Ukraine', text: 'Every state pays in; Russian pressure drops.',
    fx: { eur: -4, trust: 2 }, eu: { threats: { war: -8 } }, stateApproval: { CZ: -3 } },
  { id: 'p_solidarity', name: 'Asylum solidarity pool', text: 'States share the reception of asylum seekers or pay into a fund.',
    fx: { eur: -3 }, eu: { threats: { migration: -12 } }, stateApproval: { NL: -2, CZ: -3, PL: -2 } },
  { id: 'p_health', name: 'Joint stockpile of vaccines and medicines', text: 'Shared reserves for the next pandemic.',
    fx: { eur: -3 }, eu: { threats: { disease: -12 }, progress: { health: 1 } } },
  { id: 'p_ai', name: 'AI sovereignty fund', text: 'The treasury pays for European AI models and chips.',
    fx: {}, eu: { treasury: -20, threats: { ai: -8 }, progress: { ai: 1 } } },
  { id: 'p_cbam', name: 'Carbon border tax', text: 'Imports pay the same carbon price as European products.',
    fx: { eur: 2 }, eu: { rivals: { china: 2, usa: 1 } } },
  { id: 'p_gas', name: 'Joint gas purchasing', text: 'Buy gas together instead of competing for it.',
    fx: { energy: 1, trust: 1 }, eu: { threats: { war: -5 } } },
  { id: 'p_qmv', name: 'Majority voting in foreign policy', text: 'No single state can block sanctions any more.',
    fx: {}, eu: { integration: 6 }, stateApproval: { CZ: -4, NL: -1 } },
];

const NEUTRAL_EVENTS = [
  { id: 'n_calm', name: 'A quiet year', text: 'No major crisis. Markets are calm.' },
  { id: 'n_breakthrough', name: 'Research breakthrough', text: 'States with Education 60+ gain Tech +2.' },
  { id: 'n_prices', name: 'Commodity price spike', text: 'Every state pays 3 €; halved with the Power Market reward.' },
  { id: 'n_tariffs', name: 'US tariffs on European goods', text: 'Every state loses 4 €; the AI reward protects you.' },
];

const CRISES = {
  war: { name: 'Drone incursions and sabotage', text: 'Prosperity −3, 5 €, Approval −3. Security 60+ halves it. Frontline states hit twice as hard.' },
  disease: { name: 'Outbreak of a new respiratory virus', text: 'Prosperity −5, Approval −4. The Health Union halves it; Education 60+ halves the Approval loss.' },
  ai: { name: 'AI shock: lost jobs and deepfakes', text: 'Approval −5, Prosperity −2. The European AI reward halves it; Education 60+ halves the Approval loss.' },
  migration: { name: 'Migrants pushed to the eastern border', text: 'Frontline Approval −5, others −2; Trust −3 unless the solidarity pool passed. Security 60+ halves the frontline loss.' },
};

module.exports = {
  START_YEAR, END_YEAR, AP_PER_YEAR, LEVELS, LEVEL_THRESHOLDS, EU_FACTS,
  STATES, GOALS, THREATS, RIVALS, PARTNERS, CARDS, PROPOSALS, NEUTRAL_EVENTS, CRISES,
};
