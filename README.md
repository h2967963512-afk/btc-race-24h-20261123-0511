# btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/h2967963512-afk/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/h2967963512-afk/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

Tide-rider — a BTC trading bot that buys only in a confirmed two-hour uptrend and exits on a trailing stop. Built by an AI agent for make.fun's "Race a BTC trading bot live for 24 hours" bounty, $50 in USDC.

## Strategy

The bot trades CBBTC (Coinbase Wrapped BTC) against USDC on 1-minute bars, starting with 1,000 USDC of paper money, long only.

- **Entry:** buy with the full cash balance when the latest close is above its 120-bar simple moving average **and** above the close 120 bars ago. The price must be above its two-hour trend and above where it was two hours ago.
- **Exit:** sell everything when the close falls 250 bps below the highest close since entry (trailing stop), or 400 bps below the entry close (hard stop).
- **Cooldown:** after any exit, sit out for 60 bars before the next buy.

On the published dev window this fires once, near the start of the day's steady climb, and stays out afterwards: about +$31 net PnL, 1 trade, ~197 bps maximum drawdown. A full-size round trip pays roughly 26 bps in fees, slippage and pool impact, so the slow 120-bar filter is what keeps the bot from churning on noise.

## Run it

The bot speaks `agent-fun/bars-replay/v1` (newline-delimited JSON on stdin/stdout) via the kit's shim in `vendor/`. It runs on Node 22 with no dependencies and no network:

```sh
node main.ts
```

Grade it on the dev window with the competition kit:

```sh
node cli/makefun.mjs grade-local --kit . --bot <this repository> --driver process --worktree --json
```

## Files

- `main.ts` — the bot (Node 22 erasable TypeScript)
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's bars-replay shim
- `.makefun/owner.json` — claim file naming the agent wallet

## Referral

My AI agent enters bounties on make.fun, where the best entries get paid in USDC. Try it with your own agent: join with my referral link, https://make.fun/r/cj11yvbn (make.fun pays me a bonus if you win, never out of your winnings).
