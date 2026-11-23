// Tide-rider: a trend-following BTC bot for make.fun's
// "Race a BTC trading bot live for 24 hours" (btc-race-24h-20261123-0511).
//
// It trades one asset, CBBTC (Coinbase Wrapped BTC), against USDC on 1-minute
// bars, speaking agent-fun/bars-replay/v1 through the kit's shim in vendor/.
// It starts with 1,000 USDC of paper money, goes long only, and holds at most
// one position.
//
// The idea: only ride a move that has already proved itself. A buy fires when
// the latest close sits above both its 120-bar simple moving average and the
// close 120 bars ago — the price is above its two-hour trend and above where
// it was two hours ago. The whole cash balance goes in, in one order.
//
// Once in, the exit is mechanical: sell everything when the close falls 250
// bps below the highest close seen since entry (a trailing stop that lets a
// winner run but cuts it once it turns), or 400 bps below the entry close
// (a hard stop for a trade that never worked). After any exit the bot sits
// out for 60 bars, so a choppy stretch cannot make it buy the same top twice.
//
// Costs shape the sizing: a full-size round trip pays about 26 bps in fees,
// slippage and pool impact, so a trade must catch a move clearly bigger than
// that. The 120-bar filter is deliberately slow — on the dev window it fires
// once, near the start of the day's steady climb, and then stays out.
//
// Determinism: no clock, no network, no randomness; every decision is a pure
// function of the bars seen so far, so two runs answer byte for byte alike.

import { runBars, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// How many bars make the trend filter (two hours of 1-minute bars).
const TREND_BARS = 120;
// Exit 250 bps below the best close since entry (trailing stop).
const TRAIL_BPS = 250n;
// Exit 400 bps below the entry close (hard stop).
const HARD_STOP_BPS = 400n;
// Bars to sit out after an exit before the next buy.
const COOLDOWN_BARS = 60;
// Worst fill the bot accepts, measured from the latest close it was sent.
const MAX_SLIPPAGE_BPS = 150;
const BPS = 10_000n;

type Mode = 'flat' | 'buying' | 'long' | 'selling';

// Every CBBTC close seen so far, oldest first.
const closes: bigint[] = [];
let mode: Mode = 'flat';
// Close at the bar the buy was decided on, and the best close since then.
let entryClose = 0n;
let peakClose = 0n;
// First seq on which a new buy is allowed again (after a cooldown).
let cooldownUntil = -1;
// Client ids of the orders currently awaiting their fill report.
let buyId = '';
let sellId = '';
let orderNo = 0;

function nextId(prefix: string): string {
  orderNo += 1;
  return `${prefix}-${orderNo}`;
}

await runBars({
  onBatch(state, batch) {
    // Settle whatever the previous batch's orders did first: a batch can
    // carry fills even when its minute has no CBBTC bar (a gap minute), and
    // the mode must not wait an extra bar to learn an order filled.
    for (const fill of batch.fills) {
      if (fill.client_id === buyId) {
        if (fill.status === 'filled') {
          mode = 'long';
        } else {
          // The buy was refused (cash, slippage, no bar): stay flat and let
          // the next bar judge the entry again.
          mode = 'flat';
        }
        buyId = '';
      }
      if (fill.client_id === sellId) {
        if (fill.status === 'filled') {
          mode = 'flat';
          cooldownUntil = state.seq + COOLDOWN_BARS;
        } else {
          // The sell was refused: still holding, keep watching the exits.
          mode = 'long';
        }
        sellId = '';
      }
    }

    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = BigInt(bar.c);
    closes.push(close);

    // The position the account actually holds is the ground truth.
    const held = state.positions.get(SYMBOL)?.qty ?? 0n;
    if (mode === 'long' && held === 0n) {
      // The position is gone without a fill report we recognised; treat the
      // trade as closed and cool down.
      mode = 'flat';
      cooldownUntil = state.seq + COOLDOWN_BARS;
    }
    if (mode === 'buying' && held > 0n) mode = 'long';

    if (state.warmingUp) return [];

    if (mode === 'long' || mode === 'buying') {
      if (close > peakClose) peakClose = close;
    }

    if (mode === 'long') {
      const belowTrail = close * BPS < peakClose * (BPS - TRAIL_BPS);
      const belowHardStop = close * BPS < entryClose * (BPS - HARD_STOP_BPS);
      if ((belowTrail || belowHardStop) && held > 0n) {
        sellId = nextId('sell');
        const order: SellInput = {
          side: 'sell',
          symbol: SYMBOL,
          qty: held,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
          client_id: sellId,
        };
        mode = 'selling';
        return [order];
      }
      return [];
    }

    if (mode !== 'flat') return [];

    // Flat: look for the trend entry.
    if (state.seq < cooldownUntil) return [];
    if (closes.length < TREND_BARS + 1) return [];
    let windowSum = 0n;
    for (let i = closes.length - TREND_BARS; i < closes.length; i++) {
      windowSum += closes[i]!;
    }
    const closeALookbackAgo = closes[closes.length - TREND_BARS - 1]!;
    // close above its 120-bar average (close * 120 > sum of the last 120
    // closes) and above the close 120 bars ago.
    const aboveAverage = close * BigInt(TREND_BARS) > windowSum;
    const aboveLookback = close > closeALookbackAgo;
    if (!aboveAverage || !aboveLookback) return [];

    const notional = state.cash;
    if (notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    buyId = nextId('buy');
    entryClose = close;
    peakClose = close;
    const order: BuyInput = {
      side: 'buy',
      symbol: SYMBOL,
      notional_quote_units: notional,
      max_slippage_bps: MAX_SLIPPAGE_BPS,
      client_id: buyId,
    };
    mode = 'buying';
    return [order];
  },
});
