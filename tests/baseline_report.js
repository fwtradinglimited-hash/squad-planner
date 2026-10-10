// Runs today's planning engine on every benchmark squad, in each of its
// three styles, and marks every plan with the scorecard against the
// proposed Balanced ethos. Writes tests/reports/baseline.json.
// Usage: node tests/baseline_report.js
const fs = require('fs');
const path = require('path');
const { launch, newMatch } = require('./_harness');
const { BENCHMARKS, ENGINE_STYLES, REFERENCE_PLANS, MID_SLOTS, MID_EDGES, NEAREST_ETHOS } = require('./benchmarks');

(async () => {
  const { browser, page, errors } = await launch();
  await newMatch(page);
  const results = [];
  for (const b of BENCHMARKS) {
    for (const [style, styleCfg] of Object.entries(ENGINE_STYLES)) {
      const r = await page.evaluate(({b, styleCfg, nearest}) => {
        try {
          const f = b.format;
          applyMatchFormat(f.players, f.gk, f.duration, f.periods, f.shape);
          PLAYERS = b.squad.map(p => ({...p, positions: {...p.positions}}));
          playersById = Object.fromEntries(PLAYERS.map(p => [p.id, p]));
          cfg = {autoSubs: true, maxBenchLength: 0, gkCountsForFairness: false, subTimingMode: 'anytime', subIntervalMinutes: 15, checkpointHalfway: false, ...styleCfg};
          cfgEras = []; lockedEvents = [];
          // Today's engine can only express a player leaving, not arriving late.
          unavailableFrom = {};
          for (const [pid, a] of Object.entries(b.availability || {})) if (a.to !== undefined) unavailableFrom[pid] = a.to;
          gkMode = b.keepers.mode; gkAuto = !!b.keepers.auto; gkKeepers = [...b.keepers.list];
          computeTargets(); GK_SEGMENTS = computeGkSegments();
          startingLineup = buildStartingLineup(PLAYERS, GK_SEGMENTS);
          regeneratePlan();
          const plan = planFromEngine();
          const spec = buildSpec({preset: 'balanced', duration: f.duration, periodBounds: [...PERIOD_BOUNDS], availability: b.availability || {}});
          const card = evaluatePlan(plan, PLAYERS, spec);
          const extra = {};
          const nsp = buildSpec({preset: nearest, duration: f.duration, periodBounds: [...PERIOD_BOUNDS], availability: b.availability || {}});
          extra.nearest = {ethos: nearest, card: evaluatePlan(plan, PLAYERS, nsp)};
          if (b.id === 'midfield') for (const preset of ['development', 'competitive', 'performance']) {
            const sp = buildSpec({preset, duration: f.duration, periodBounds: [...PERIOD_BOUNDS]});
            extra[preset] = evaluatePlan(plan, PLAYERS, sp);
          }
          return {ok: true, plan, card, extra, spec: {band: spec.band, floorFrac: spec.floorFrac, maxTimeOff: spec.maxTimeOff, minSpell: spec.minSpell, maxChangesPerStoppage: spec.maxChangesPerStoppage, windowLen: spec.windowLen}};
        } catch (e) { return {ok: false, error: String(e && e.message || e)}; }
      }, {b, styleCfg, nearest: NEAREST_ETHOS[style]});
      results.push({benchmark: b.id, name: b.name, why: b.why, style, ...r});
      const c = r.card && r.card.tiers;
      console.log(`${b.id.padEnd(12)} ${style.padEnd(17)} ` + (r.ok
        ? `t0=${c.t0.count} t1=${c.t1.count}(${c.t1.magnitude}) min=${c.t2.range.join('-')} over=${c.t2.overshoot} weakest=${c.t3.weakest && c.t3.weakest.perPlayer} fit=${c.t4.fitPct}% subs=${c.t5.subs}@${c.t5.subMoments}`
        : 'ERROR ' + r.error));
    }
  }
  // The midfield squad: today's engine against the two hand-made plans,
  // under each ethos, with the scorecard's verdict.
  const mid = BENCHMARKS.find(b => b.id === 'midfield');
  const comparisons = await page.evaluate(({mid, REFERENCE_PLANS, MID_SLOTS, MID_EDGES, engine}) => {
    const PB = [0, 25, 50];
    const plans = {engine, staggered: planFromRota(50, PB, MID_SLOTS, MID_EDGES, REFERENCE_PLANS.staggered.windows), naive: planFromRota(50, PB, MID_SLOTS, MID_EDGES, REFERENCE_PLANS.naive.windows)};
    const out = {};
    for (const preset of ['development', 'balanced', 'competitive', 'performance']) {
      const sp = buildSpec({preset, duration: 50, periodBounds: PB});
      const cards = Object.fromEntries(Object.entries(plans).map(([k, p]) => [k, evaluatePlan(p, mid.squad, sp)]));
      const names = Object.keys(cards);
      const order = names.slice().sort((a, b) => compareScorecards(cards[a], cards[b], sp).cmp);
      const why = [];
      for (let i = 0; i + 1 < order.length; i++) why.push({better: order[i], worse: order[i + 1], ...compareScorecards(cards[order[i]], cards[order[i + 1]], sp)});
      out[preset] = {order, why, cards};
    }
    return {plans, results: out};
  }, {mid, REFERENCE_PLANS, MID_SLOTS, MID_EDGES, engine: results.find(x => x.benchmark === 'midfield' && x.style === 'Balanced').plan});
  for (const [preset, v] of Object.entries(comparisons.results)) console.log(`midfield ranking under ${preset}: ${v.order.join(' > ')}  (${v.why.map(w => `${w.better} beats ${w.worse} at tier ${w.tier}: ${w.why}`).join('; ')})`);
  const out = path.join(__dirname, 'reports');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'baseline.json'), JSON.stringify({generated: new Date().toISOString(), engine: 'current (minute-by-minute greedy)', judgedAgainst: 'proposed Balanced ethos', results, comparisons}, null, 1));
  if (errors.length) console.log('PAGE ERRORS', errors);
  await browser.close();
})();
