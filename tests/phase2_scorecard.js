// Phase 2: the scorecard (evaluator). Hand-built plans with known faults
// check that each tier catches what it should, and that plans are ranked
// the way the coach's ethos says.
const { launch, newMatch, ok, summary } = require('./_harness');
const { BENCHMARKS, REFERENCE_PLANS, MID_SLOTS, MID_EDGES } = require('./benchmarks');

const MID = BENCHMARKS.find(b => b.id === 'midfield');
const SLOTS = MID_SLOTS, EDGES = MID_EDGES;
const STAGGERED = REFERENCE_PLANS.staggered.windows, NAIVE = REFERENCE_PLANS.naive.windows;

(async () => {
  const { browser, page, errors } = await launch();
  await newMatch(page); // so there is a current-engine plan to convert
  const r = await page.evaluate(({squad, SLOTS, EDGES, STAGGERED, NAIVE}) => {
    const PB = [0, 25, 50];
    const W = (d1, d2, m1, m2, a1, a2) => ({GK: 'Sam', DEF1: d1, DEF2: d2, MID1: m1, MID2: m2, ATT1: a1, ATT2: a2});
    const plan = w => planFromRota(50, PB, SLOTS, EDGES, w);
    const spec = (preset, extra = {}) => buildSpec({preset, duration: 50, periodBounds: PB, ...extra});
    const ev = (w, sp) => evaluatePlan(plan(w), squad, sp);
    const out = {};
    // Tier 0: "Do not use", keeper, duplicate, availability
    const bad = STAGGERED.map(x => ({...x}));
    bad[0].ATT1 = 'Eli';            // Eli is "Do not use" in attack...
    bad[0].DEF1 = 'Hal';            // ...and Hal "Do not use" in defence
    bad[1].GK = 'Finn'; bad[1].DEF1 = 'Sam'; // non-keeper in goal
    bad[2].MID2 = 'Ava';            // Ava in two positions
    const cBad = ev(bad, spec('balanced', {availability: {Ike: {from: 20}}}));
    out.t0codes = cBad.tiers.t0.items.map(x => x.code);
    // Equal-minutes staggered plan under each ethos
    for (const preset of ['development', 'balanced', 'competitive']) {
      const sp = spec(preset);
      const a = ev(STAGGERED, sp), b = ev(NAIVE, sp);
      out[preset] = {staggered: a.tiers, naive: b.tiers, verdict: compareScorecards(a, b, sp), linesA: a.lines.map(l => l.text), linesB: b.lines.map(l => l.text)};
    }
    // Unit floor off and "strong start": the naive plan should now win on strength
    const sp2 = spec('competitive', {rules: {unitFloor: 'off', strengthMode: 'strongStart'}});
    out.strongStart = compareScorecards(ev(NAIVE, sp2), ev(STAGGERED, sp2), sp2);
    // Unit floor soft: no tier-1 break, but tier 3 is worse for the naive plan
    const sp3 = spec('balanced', {rules: {unitFloor: 'soft'}});
    const n3 = ev(NAIVE, sp3), s3 = ev(STAGGERED, sp3);
    out.soft = {naiveT1: n3.tiers.t1.items.filter(x => x.code === 'UNIT_FLOOR').length, softItems: n3.tiers.t3.softUnitFloor.length, verdict: compareScorecards(s3, n3, sp3)};
    // Minutes: a plan that benches Cal for the whole second half
    const unfair = STAGGERED.map(x => ({...x}));
    unfair[5] = W('Eli', 'Finn', 'Ben', 'Dan', 'Ike', 'Gus'); // Cal off, Dan on again
    const cu = ev(unfair, spec('balanced'));
    out.unfair = {t2: cu.tiers.t2.perPlayer.Cal, dan: cu.tiers.t2.perPlayer.Dan, overshoot: cu.tiers.t2.overshoot, verdict: compareScorecards(ev(STAGGERED, spec('balanced')), cu, spec('balanced'))};
    // Time off and short spells
    const spellPlan = planFromRota(50, PB, SLOTS, [0, 8, 17, 25, 33, 42, 48, 50], [...STAGGERED, W('Eli', 'Finn', 'Ben', 'Cal', 'Ike', 'Dan')]);
    const cs = evaluatePlan(spellPlan, squad, spec('balanced'));
    out.spells = cs.tiers.t1.items.filter(x => x.code === 'SHORT_SPELL' || x.code === 'TIME_OFF').map(x => x.text);
    // Too many changes at once (not at half-time)
    const batch = STAGGERED.map(x => ({...x}));
    batch[1] = W('Finn', 'Gus', 'Ben', 'Dan', 'Ike', 'Hal');
    out.batch = ev(batch, spec('balanced')).tiers.t1.items.filter(x => x.code === 'TOO_MANY_CHANGES').map(x => x.text);
    // One change per unit (strict): naive swaps both midfielders at 25' (half-time is exempt) - move it to 17'
    const naive17 = NAIVE.map(x => ({...x}));
    naive17[2] = W('Eli', 'Finn', 'Cal', 'Dan', 'Ike', 'Gus');
    out.unitTogether = ev(naive17, spec('balanced', {rules: {oneChangePerUnit: 'strict'}})).tiers.t1.items.filter(x => x.code === 'UNIT_CHANGED_TOGETHER').map(x => x.text);
    // Keeper time: Sam keeps goal all match - with keeper time not counting he has no outfield target
    out.keeper = ev(STAGGERED, spec('balanced')).tiers.t2.perPlayer.Sam;
    // Pairs
    const pairSpec = spec('balanced', {pairs: [{a: 'Ava', b: 'Ben', kind: 'apart'}]});
    out.pairs = {staggered: ev(STAGGERED, pairSpec).tiers.t4.pairApart, naive: ev(NAIVE, pairSpec).tiers.t4.pairApart};
    // No levels anywhere: the unit rule stays quiet
    const flat = squad.map(p => ({...p, level: undefined}));
    out.flat = evaluatePlan(plan(NAIVE), flat, spec('balanced')).tiers.t1.items.filter(x => x.code === 'UNIT_FLOOR').length;
    // Engine plan converts cleanly (current app state)
    const ep = planFromEngine();
    out.engine = {segments: ep.segments.length, covers: ep.segments[0].from === 0 && ep.segments[ep.segments.length - 1].to === DURATION};
    // Speed: evaluations per second (the search will call this thousands of times)
    const t0 = performance.now(); let n = 0;
    while (performance.now() - t0 < 300) { evaluatePlan(plan(STAGGERED), squad, spec('balanced')); n++; }
    out.perSecond = Math.round(n / ((performance.now() - t0) / 1000));
    return out;
  }, {squad: MID.squad, SLOTS, EDGES, STAGGERED, NAIVE});

  console.log('Tier 0 catches rule clashes');
  for (const c of ['DO_NOT_USE', 'NOT_A_KEEPER', 'TWO_POSITIONS', 'NOT_AVAILABLE']) ok(r.t0codes.includes(c), `catches ${c}`, r.t0codes);

  console.log('Ranking follows the ethos');
  for (const preset of ['development', 'balanced', 'competitive']) {
    const x = r[preset];
    ok(x.verdict.cmp < 0, `${preset}: the staggered plan beats "best XI then rotate" (${x.verdict.why}, tier ${x.verdict.tier})`, x.verdict);
    ok(x.naive.t1.items.some(i => i.code === 'UNIT_FLOOR'), `${preset}: the all-Developing midfield is flagged`, x.naive.t1.items.map(i => i.text));
    ok(x.staggered.t1.items.every(i => i.code !== 'UNIT_FLOOR'), `${preset}: the staggered plan never fields an all-Developing midfield`);
  }
  ok(r.development.staggered.t2.overshoot === 0, 'equal-minute plan sits inside the band', r.development.staggered.t2);
  ok(r.strongStart.cmp < 0 && r.strongStart.tier === 3, 'with the unit rule off and a "strong start" ethos, the best-XI-first plan wins on strength', r.strongStart);
  ok(r.soft.naiveT1 === 0 && r.soft.softItems > 0 && r.soft.verdict.cmp < 0 && r.soft.verdict.tier === 3, 'unit rule "soft": no broken guarantee, but strength prefers the staggered plan', r.soft);

  console.log('Minutes, spells and changes');
  ok(r.unfair.t2.outside > 0 || r.unfair.dan.outside > 0, 'a player well under target is outside the band', r.unfair);
  ok(r.unfair.verdict.cmp < 0 && r.unfair.verdict.tier <= 2, 'the fair plan beats the unfair one on minutes', r.unfair.verdict);
  ok(r.spells.some(t => /only 2'/.test(t) || /for only 2'/.test(t)), 'a 2-minute spell at the end is flagged', r.spells);
  ok(r.batch.length > 0, 'four changes at once mid-half are flagged', r.batch);
  ok(r.unitTogether.length > 0, '"one change per unit" (strict) flags both midfielders changing together', r.unitTogether);

  console.log('Keepers, pairs, no levels');
  ok(r.keeper.target === 0 && r.keeper.gk === 50, 'a keeper in goal all match has no outfield target (keeper time does not count)', r.keeper);
  ok(r.pairs.naive > r.pairs.staggered, '"keep apart" pair counts minutes together', r.pairs);
  ok(r.flat === 0, 'with no levels set, the unit rule never fires', r.flat);
  ok(r.engine.segments > 0 && r.engine.covers, 'the current engine\'s plan converts to the neutral form', r.engine);
  ok(r.perSecond > 2000, `fast enough for the planner's search (${r.perSecond} evaluations a second)`, r.perSecond);

  console.log('\nScorecard lines (Balanced), staggered plan:');
  r.balanced.linesA.forEach(l => console.log('   ' + l));
  console.log('Scorecard lines (Balanced), best XI then rotate:');
  r.balanced.linesB.forEach(l => console.log('   ' + l));
  summary('phase2_scorecard', errors);
  await browser.close();
})();
