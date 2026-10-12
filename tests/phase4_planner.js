// Phase 4: the new window planner against today's engine, on every
// benchmark squad and every ethos, both marked by the same scorecard.
// Gate: the new planner is never worse on rules or guarantees, never worse
// at the ethos's first priority, at least as good overall, and better on
// the squads that show today's failures.
const fs = require('fs');
const path = require('path');
const { launch, openPage, newMatch, ok, summary } = require('./_harness');
const { BENCHMARKS } = require('./benchmarks');

const ETHOS = ['development', 'balanced', 'competitive', 'performance'];
// The classic engine's nearest style for each ethos.
const CLASSIC_STYLE = {
  development: {fairnessPriority: 0.9, positionStrictness: 0.2, minShiftLength: 5},
  balanced: {fairnessPriority: 0.5, positionStrictness: 0.3, minShiftLength: 8},
  competitive: {fairnessPriority: 0.2, positionStrictness: 0.5, minShiftLength: 12},
  performance: {fairnessPriority: 0.2, positionStrictness: 0.5, minShiftLength: 12},
};
const FAILURE_SQUADS = ['midfield', 'developing', 'mixed', 'big'];

(async () => {
  const { browser, page, errors } = await launch();
  await newMatch(page);
  const rows = [];
  for (const b of BENCHMARKS) {
    for (const ethos of ETHOS) {
      const r = await page.evaluate(({b, ethos, classic}) => {
        const f = b.format;
        applyMatchFormat(f.players, f.gk, f.duration, f.periods, f.shape);
        const PB = [...PERIOD_BOUNDS];
        const exceptions = {};
        for (const [pid, a] of Object.entries(b.availability || {})) exceptions[pid] = {...(a.from !== undefined ? {arrive: a.from} : {}), ...(a.to !== undefined ? {leave: a.to} : {})};
        const spec = compileSpec({ethos: {...defaultEthos(), preset: ethos}, duration: f.duration, periodBounds: PB, players: b.squad, exceptions,
          outfieldSlots: SLOTS.filter(s => s.group !== 'GK').length, allSlots: SLOTS.length});
        const keepers = f.gk ? PB.slice(0, -1).map((from, i) => ({from, to: PB[i + 1], player: b.keepers.mode === 'single' ? b.keepers.list[0] : b.keepers.list[i] || null})) : [];
        // Today's engine
        PLAYERS = b.squad.map(normalisePlayer); playersById = Object.fromEntries(PLAYERS.map(p => [p.id, p]));
        cfg = {autoSubs: true, maxBenchLength: 0, gkCountsForFairness: false, subTimingMode: 'anytime', subIntervalMinutes: 15, checkpointHalfway: false, ...classic};
        cfgEras = []; lockedEvents = []; unavailableFrom = {};
        for (const [pid, a] of Object.entries(b.availability || {})) if (a.to !== undefined) unavailableFrom[pid] = a.to;
        gkMode = b.keepers.mode; gkAuto = false; gkKeepers = [...b.keepers.list];
        computeTargets(); GK_SEGMENTS = computeGkSegments();
        startingLineup = buildStartingLineup(PLAYERS, GK_SEGMENTS);
        regeneratePlan();
        const oldCard = evaluatePlan(planFromEngine(), PLAYERS, spec);
        // The new planner
        const t0 = performance.now();
        const res = planMatchWindows({players: b.squad, slots: SLOTS, duration: f.duration, periodBounds: PB, spec, keepers, seed: b.id + ':' + ethos});
        const ms = performance.now() - t0;
        const v = compareScorecards(res.card, oldCard, spec);
        const first = spec.priority[0];
        const tierOf = {minutes: 't2', strength: 't3', positions: 't4'};
        const firstWorse = (() => {
          const a = res.card.tiers[tierOf[first]], o = oldCard.tiers[tierOf[first]];
          if (first === 'minutes') return a.cost > o.cost + spec.tolerances.t2;
          if (first === 'positions') return a.value > o.value + spec.tolerances.t4;
          return a.value > o.value + Math.max(5, spec.tolerances.t3 * Math.max(Math.abs(a.value), Math.abs(o.value), 1));
        })();
        const brief = c => ({t0: c.tiers.t0.count, t1: c.tiers.t1.magnitude, t1n: c.tiers.t1.count, t2: c.tiers.t2.cost, range: c.tiers.t2.range, t3: c.tiers.t3.value,
          weakest: c.tiers.t3.weakest && c.tiers.t3.weakest.perPlayer, avg: c.tiers.t3.perPlayer, fit: c.tiers.t4.fitPct, subs: c.tiers.t5.subs, moments: c.tiers.t5.subMoments, moves: c.tiers.t5.positionMoves});
        return {verdict: v, firstWorse, ms: Math.round(ms), old: brief(oldCard), neu: brief(res.card), lines: res.card.lines, oldLines: oldCard.lines,
          windows: res.windows.map(w => ({from: w.from, to: w.to, onPitch: w.onPitch})), slots: SLOTS.map(s => ({id: s.id, group: s.group}))};
      }, {b, ethos, classic: CLASSIC_STYLE[ethos]});
      rows.push({benchmark: b.id, name: b.name, ethos, ...r});
      const o = r.old, n = r.neu;
      console.log(`${b.id.padEnd(12)} ${ethos.padEnd(12)} ${r.verdict.cmp < 0 ? 'NEW' : r.verdict.cmp > 0 ? 'OLD' : 'TIE'} t${r.verdict.tier} ${String(r.ms).padStart(4)}ms | old t0=${o.t0} t1=${o.t1} t2=${o.t2} weak=${o.weakest} fit=${o.fit} subs=${o.subs}@${o.moments} | new t0=${n.t0} t1=${n.t1} t2=${n.t2} weak=${n.weakest} fit=${n.fit} subs=${n.subs}@${n.moments}`);
    }
  }
  fs.mkdirSync(path.join(__dirname, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'reports', 'phase4.json'), JSON.stringify({generated: new Date().toISOString(), rows}, null, 1));

  console.log('\nSharing starts across the season, and determinism');
  const share = await page.evaluate(() => {
    const b = {squad: ['Kai'].map(id => normalisePlayer({id, positions: {DEF: 1, MID: 1, ATT: 1}, gk: true}))
      .concat(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map(id => normalisePlayer({id, positions: {DEF: 2, MID: 2, ATT: 2}})))};
    applyMatchFormat(7, true, 50, 2, {DEF: 2, MID: 2, ATT: 2});
    const PB = [...PERIOD_BOUNDS];
    // A, B and C have started every match; G, H and I never have.
    const mk = (date, starters) => ({status: 'finished', fixture: {date}, createdAt: 1, stats: {v: 2, minutes: 50,
      players: Object.fromEntries(b.squad.map(p => [p.id, {mins: 33, gk: p.id === 'Kai' ? 50 : 0, avail: 50, started: starters.includes(p.id) || p.id === 'Kai', finished: false, goals: 0}]))}});
    const ledger = buildSeasonLedger([mk('2026-09-01', ['A', 'B', 'C', 'D', 'E', 'F']), mk('2026-09-08', ['A', 'B', 'C', 'D', 'E', 'F']), mk('2026-09-15', ['A', 'B', 'C', 'D', 'E', 'F'])]);
    const spec = compileSpec({ethos: defaultEthos(), duration: 50, periodBounds: PB, players: b.squad, ledger, outfieldSlots: 6, allSlots: 7});
    const keepers = [{from: 0, to: 25, player: 'Kai'}, {from: 25, to: 50, player: 'Kai'}];
    const run = seed => planMatchWindows({players: b.squad, slots: SLOTS, duration: 50, periodBounds: PB, spec, keepers, seed});
    const a = run('fixture-1'), a2 = run('fixture-1');
    const starters = Object.entries(a.windows[0].onPitch).filter(([sl]) => sl !== 'GK').map(([, id]) => id);
    return {starters, same: JSON.stringify(a.windows) === JSON.stringify(a2.windows)};
  });
  ok(['G', 'H', 'I'].every(id => share.starters.includes(id)), 'players who never start are picked to start when all else is equal', share.starters);
  ok(share.same, 'the same match and squad always give the same plan', share.same);

  console.log('\nInside the app (behind the switch)');
  const appPage = await openPage(browser, errors);
  await newMatch(appPage);
  const app = await appPage.evaluate(() => {
    cfg.engine = 'window'; regeneratePlan(); render(0);
    const mismatches = [];
    for (let t = 0; t < DURATION; t++) {
      const w = PLAN.windows.find(x => t >= x.from && t < x.to);
      const st = computeStateAt(t).onPitch;
      if (JSON.stringify(Object.keys(w.onPitch).sort().map(k => [k, w.onPitch[k]])) !== JSON.stringify(Object.keys(st).sort().map(k => [k, st[k]]))) mismatches.push(t);
    }
    return {engine: PLAN.engine, mismatches, subs: PLAN.rotations.filter(r => !r.type).length, timeline: document.querySelectorAll('#timeline .tl-event').length};
  });
  ok(app.engine === 'window' && app.subs > 0, 'the app plans with the new engine when the switch is on', app);
  ok(app.mismatches.length === 0, 'the app\'s own plan format matches the rota minute by minute', app.mismatches);
  ok(app.timeline > 0, 'the plan shows on the timeline', app.timeline);
  await appPage.click('#startMatchBtn'); await appPage.waitForTimeout(200);
  const live = await appPage.evaluate(() => { clearInterval(liveTicker); matchStartTs = Date.now() - 9 * 60000; liveTick(); return {live: liveMode, pill: document.getElementById('subsPill').textContent.trim().slice(0, 40)}; });
  ok(live.live && live.pill.length > 0, 'a new-engine plan runs in live mode', live);
  await appPage.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(e => e.remove()));

  console.log('\nGate');
  const worseRules = rows.filter(r => r.neu.t0 > r.old.t0);
  ok(!worseRules.length, 'never more rule clashes than today', worseRules.map(r => `${r.benchmark}/${r.ethos}`));
  const worseGuar = rows.filter(r => r.neu.t1 > r.old.t1 + 0.5);
  ok(!worseGuar.length, 'guarantees never broken by more than today', worseGuar.map(r => `${r.benchmark}/${r.ethos}: ${r.old.t1} -> ${r.neu.t1}`));
  const worseFirst = rows.filter(r => r.firstWorse && !(r.neu.t1 < r.old.t1 - 0.5));
  ok(!worseFirst.length, 'never worse at the ethos\'s first priority (unless that bought fewer broken guarantees)', worseFirst.map(r => `${r.benchmark}/${r.ethos}`));
  const lost = rows.filter(r => r.verdict.cmp > 0);
  ok(!lost.length, 'at least as good as today overall on every squad and ethos', lost.map(r => `${r.benchmark}/${r.ethos} (tier ${r.verdict.tier}: ${r.verdict.why})`));
  const fail = rows.filter(r => FAILURE_SQUADS.includes(r.benchmark) && !(r.verdict.cmp < 0));
  ok(!fail.length, 'strictly better on the squads that show today\'s failures', fail.map(r => `${r.benchmark}/${r.ethos}`));
  const slow = rows.filter(r => r.ms > 1500);
  ok(!slow.length, `plans in good time (slowest ${Math.max(...rows.map(r => r.ms))} ms on this machine)`, slow.map(r => `${r.benchmark}/${r.ethos} ${r.ms}ms`));
  summary('phase4_planner', errors);
  await browser.close();
})();
