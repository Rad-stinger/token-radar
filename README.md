# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Rad-stinger/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Rad-stinger/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for token launches: it reads a sealed DefiLlama snapshot, finds the protocols that record no token yet, and ranks them by what a launch would be worth — with a farm plan for each one.

## The value model

Nothing is hand-tuned to a protocol name. The snapshot calibrates its own model. Protocols whose token already trades carry both a TVL and a market cap, so they are a comparison set, and the program fits a power law to them by ordinary least squares:

```
ln(mcap_usd) = 8.97 + 0.41 · ln(tvl_usd)      n = 92 peers, R² = 0.11
```

Market cap grows sublinearly with TVL, so a protocol twice the size is not worth twice as much. Each category then keeps the median residual its own trading peers leave, shrunk toward zero when the category is thin, and that factor tilts the line:

```
implied = e^(a + b·ln TVL) · category_factor · growth_multiplier · maturity_multiplier
```

- `growth_multiplier` — the 7-day TVL change, clamped to −60%…+120% and weighted by 0.5.
- `maturity_multiplier` — 0.6 at a brand-new protocol rising to 1.0 after 1095 days with no token; an unknown age reads as 365 days.

Every row in `board.json` carries the three multipliers and the fitted value, and the dashboard shows the same arithmetic in each protocol's detail view, so the number on the page can be recomputed from the snapshot by hand.

The board covers all 40 watchlist protocols and adds 186 pre-token protocols below the floor, ranked together — 226 rows. The 60 trading protocols the fit is measured on are kept in their own tab rather than mixed into the ranking, because their value is the market's, not a model's.

## The dashboard

A static page with no framework and no network. Sortable columns, filters by category and chain, a search box, a tab for protocols that already trade, and a detail drawer for every protocol with its derivation and its farm plan.

- `screenshots/1-board.png` — the board.
- `screenshots/2-detail.png` — a protocol's detail view with the derivation.
- `screenshots/3-filtered.png` — the board filtered to RWA on Ethereum.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22.18 or later; standard library only, nothing to install. Inside the grader the program reads `/input/snapshot.json` and writes `/output` — `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json`.

## Layout

| Path | What it is |
| --- | --- |
| `main.ts` | Reads the snapshot, scores the board, copies the page, writes the dossier. |
| `lib/model.ts` | The fit, the category calibration, the implied-value function and the farm plans. |
| `dashboard/` | `index.html`, `app.css`, `app.js` — the page. Reads `../data.js`. |
| `vendor/makefun-board.ts` | The bounty's own `buildDossier`, vendored from the kit. |

## Licence

MIT.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
