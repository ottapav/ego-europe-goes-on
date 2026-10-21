# EGO – Europe Goes On

**An async multiplayer strategy game about the oldest tension in Europe: national ego versus cooperation.**

You lead one EU member state. Many players share one EU on one server. Every year you choose between national moves, which pay off fast, and European moves, which pay off big, but only if enough states cooperate. Meanwhile the USA and China race ahead, and four threats press in: war, disease, an AI overtake, and hostile states using migration as a pressure tool.

If Europe completes enough of its seven goals and out-grows its rivals by 2040, every player wins big. If it stays divided, a rival wins and everyone's score drops.

## How it plays

- **6 states:** Germany, France, Spain, Poland, the Netherlands and Czechia. Each has real-world strengths, weaknesses and a special rule. Any number of players can pick the same state; each runs their own copy of it. A bot plays every state until a human joins.
- **One year per day.** You spend 3 action points on decision cards whenever you like. Everything resolves at once at the daily tick.
- **Three tiers of cards:** national (fast), bilateral (needs Trust 30+), and European (needs Trust 50+ and the right EU level).
- **Seven goals:** European Education Area, Single Power Market, European Health Union, Nuclear & Fusion Program, European AI, EU Space Program and Defence Union. A goal completes when its progress is full, at least 4 of the 6 states have half their players contributing, and the EU has reached the required level.
- **Exclusion:** a card that works against a goal (selling a chip company abroad, a cheap gas deal with an authoritarian supplier, a non-EU arms deal) locks you out of that goal's reward. You can buy your way back in.
- **Council of the EU:** one proposal a year. It starts with unanimity, so one state can block. When the EU reaches Union level, qualified majority applies: 55% of states representing 65% of the population.
- **Score:** Prosperity + Education + Security + Approval + Legacy. State score = average of its players; EU score = average of the six states.
- **Languages:** English and Czech. Choosing Czechia switches the game to Czech; the EN / CS switch in the header changes it at any time and is remembered. `?lang=cs` in the address also works.
- **Endings:** *Europe goes big* (×1.2), *Second-tier Europe* (×1.0), *The American / Chinese Century* (×0.8), *Divided Europe* (×0.6).

The balance is tuned so that cooperation follows a J-curve. National players lead for the first few years; cooperators overtake them around 2033–2035 and finish well ahead. `npm run simulate` shows it.

## Run it

Requires Node 18 or newer. There are no dependencies to install.

```bash
npm start            # http://localhost:3000, one year every 24 hours
npm run dev          # one year every 5 minutes, admin key "dev"
npm test             # engine tests, including the cooperation J-curve
npm run simulate     # full games with cooperative and national players
```

Open `http://localhost:3000/?admin=dev` (with `npm run dev`) to get a **Resolve the year now** button for testing.

### Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `TICK_MINUTES` | `1440` | Real minutes per in-game year |
| `ADMIN_KEY` | empty | Enables `POST /api/admin/tick` and `/api/admin/reset` with header `x-admin-key` |
| `DATA_FILE` | `data/world.json` | Where the shared world is saved |

The server keeps the whole world in one JSON file, so any host with a persistent disk works (a small VPS, Render or Fly.io with a volume).

## Project layout

| Path | Contents |
| --- | --- |
| `src/content.js` | All game numbers: states, cards, goals, threats, rivals, Council proposals, events. Rebalance here. |
| `src/engine.js` | Pure game logic: year resolution, goals and exclusion, Council voting, threats, bots, scoring, endings |
| `src/server.js` | Zero-dependency HTTP server, JSON persistence, daily tick |
| `public/` | The one-page client (HTML, CSS, vanilla JS) |
| `public/i18n.js` | All interface texts in English and Czech, plus Czech names and notes for every card, goal, state and event. Shared by the page and the server. |
| `test/` | Engine tests and the strategy simulator |

### API

| Method | Path | Body |
| --- | --- | --- |
| `GET` | `/api/content` | – |
| `GET` | `/api/world?player=ID` | – |
| `POST` | `/api/join` | `{ name, state }` → `{ playerId }` |
| `POST` | `/api/plan` | `{ playerId, cards: [ids], vote: "yes" \| "no" }` |

## Real-world starting point

The game starts from the EU of autumn 2026. Game values (Prosperity, Trust and so on) are abstractions; the figures shown to players are real:

- Population on 1 January 2025 and GDP in 2025: Eurostat
- Defence spending in 2025 as a share of GDP: NATO estimates
- SAFE: up to €150 billion in EU defence loans for joint procurement (ReArm Europe / Readiness 2030)
- AI gigafactories: €10 billion EU call for seven sites, July 2026
- Pact on Migration and Asylum: applies in all member states since 12 June 2026
- Czechia: ammunition initiative for Ukraine, new Dukovany units by KHNP (first due 2036)
- Spain: Almaraz nuclear plant extended to June 2030, 2035 phase-out kept

## Roadmap

- Accounts instead of a browser-stored player id
- Player chat and Council debate
- Classroom mode: private EUs, teacher dashboard, one year per lesson
- More states: Italy, Sweden, the Baltics, Romania, each in its own language
- End-of-game report comparing cooperators and defectors
