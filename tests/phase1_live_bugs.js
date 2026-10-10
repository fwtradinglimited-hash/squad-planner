// Phase 1: the three live-match bugs from the design review (V9, V10, V11).
//
// Rules being tested (agreed in the design review):
//  - A sub only counts once the coach confirms it.
//  - DONE without a delay counts at the planned minute.
//  - DELAY then DONE counts at the minute it was actually confirmed.
//  - SKIP removes the planned sub: the player who was due off stays on.
//  - An unavailable keeper is replaced: a keeper from the bench if there is
//    one, otherwise a keeper-capable outfielder moves into goal and a bench
//    player comes on. An unavailable keeper never comes back later.
const { launch, openPage, newMatch, ok, summary } = require('./_harness');
let browser, page, errors;

async function atMinute(page, m) {
  await page.evaluate(m => { matchStartTs = Date.now() - m * 60000; pausedAccumMs = 0; pauseStartedAt = null; }, m);
}
async function freshLiveMatch(_, tweak) {
  // A clean app for every scenario: no saved matches or live state.
  if (page) await page.context().close();
  page = await openPage(browser, errors);
  await newMatch(page);
  if (tweak) await page.evaluate(tweak);
  await page.click('#startMatchBtn'); await page.waitForTimeout(150);
  // Freeze the clock: tests drive the minute themselves.
  await page.evaluate(() => { clearInterval(liveTicker); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); });
}
const firstSub = () => page.evaluate(() => {
  const r = PLAN.rotations.find(r => !r.type && r.reason === 'playing-time fairness');
  return r && {...r};
});

(async () => {
  ({ browser, page, errors } = await launch());

  // ---------- V9: DELAY then DONE lands at the real minute ----------
  console.log('V9 delayed sub is recorded at the minute it is confirmed');
  await freshLiveMatch(page);
  let r = await firstSub(page);
  ok(!!r, 'plan has a fairness sub to work with', r);
  const T = r.time;
  await atMinute(page, T);
  await page.evaluate(([r, T]) => delayDueSub(PLAN.rotations.find(x => x.time === r.time && x.slot === r.slot), T, 2), [r, T]);
  await atMinute(page, T + 3);
  await page.evaluate(([r, T]) => confirmDueSub(PLAN.rotations.find(x => x.time === r.time && x.slot === r.slot) || r, T + 3), [r, T]);
  let s = await page.evaluate(([r, T]) => ({
    during: computeStateAt(T + 1).onPitch[r.slot],
    after: computeStateAt(T + 3).onPitch[r.slot],
    onMins: computeStateAt(T + 3).minutesPlayed[r.on],
    offMins: computeStateAt(T + 3).minutesPlayed[r.off],
    subAt: PLAN.rotations.filter(x => !x.type && x.slot === r.slot && x.on === r.on && x.time <= T + 3).map(x => x.time),
    dueAgain: dueRotations(T + 3).filter(x => x.slot === r.slot).map(x => x.time),
  }), [r, T]);
  ok(s.during === r.off, `${r.off} is still on at ${T + 1}' (sub not made yet)`, s);
  ok(s.after === r.on, `${r.on} is on at ${T + 3}'`, s);
  ok(JSON.stringify(s.subAt) === JSON.stringify([T + 3]), `the sub is recorded once, at ${T + 3}'`, s.subAt);
  ok(s.onMins === 0 && s.offMins === T + 3, 'minutes reflect the real minute of the change', s);
  ok(s.dueAgain.length === 0, 'the confirmed sub does not pop up as due again', s.dueAgain);

  // ---------- Plain DONE while overdue counts at the planned minute ----------
  console.log('DONE without a delay counts at the planned minute');
  await freshLiveMatch(page);
  r = await firstSub(page);
  await atMinute(page, r.time + 3);
  await page.evaluate(([r]) => confirmDueSub(PLAN.rotations.find(x => x.time === r.time && x.slot === r.slot), r.time + 3), [r]);
  s = await page.evaluate(([r]) => ({
    subAt: PLAN.rotations.filter(x => !x.type && x.slot === r.slot && x.on === r.on && x.time <= r.time + 3).map(x => x.time),
    onMins: computeStateAt(r.time + 3).minutesPlayed[r.on],
    due: dueRotations(r.time + 3).filter(x => x.slot === r.slot).length,
  }), [r]);
  ok(JSON.stringify(s.subAt) === JSON.stringify([r.time]), `recorded at the planned ${r.time}'`, s);
  ok(s.onMins === 3, `${r.on} credited with 3 minutes`, s);
  ok(s.due === 0, 'not due again', s);

  // ---------- V10: SKIP removes the planned sub ----------
  console.log('V10 skipping an overdue sub removes it');
  await freshLiveMatch(page);
  r = await firstSub(page);
  await atMinute(page, r.time + 3);
  await page.evaluate(([r]) => skipDueSub(PLAN.rotations.find(x => x.time === r.time && x.slot === r.slot), r.time + 3), [r]);
  s = await page.evaluate(([r]) => ({
    stillOn: computeStateAt(r.time + 3).onPitch[r.slot],
    onPitch: Object.values(computeStateAt(r.time + 2).onPitch),
    offMins: computeStateAt(r.time + 3).minutesPlayed[r.off],
    pastSubsWithOn: PLAN.rotations.filter(x => !x.type && x.on === r.on && x.time < r.time + 3).map(x => [x.time, x.slot]),
  }), [r]);
  ok(s.stillOn === r.off, `${r.off} is still on after the skip`, s);
  ok(!s.onPitch.includes(r.on), `${r.on} is not shown on the pitch in the minutes already played`, s);
  ok(s.offMins === r.time + 3, `${r.off} keeps all their minutes`, s);
  ok(s.pastSubsWithOn.length === 0, `${r.on} is not slotted in somewhere else in the past instead`, s);

  // The corrected past survives closing and reopening the app mid-match.
  const before = await page.evaluate(() => JSON.stringify(PLAN.rotations.map(x => [x.time, x.type || 'sub', x.slot, x.off, x.on])));
  await page.evaluate(() => saveLiveMatchState());
  await page.reload(); await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({live: liveMode, rots: JSON.stringify(PLAN.rotations.map(x => [x.time, x.type || 'sub', x.slot, x.off, x.on]))}));
  ok(after.live && after.rots === before, 'after reopening the app the plan is exactly the same', {live: after.live});
  await page.evaluate(() => { clearInterval(liveTicker); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); });

  // Skip then later suggestions still work (the plan is not frozen forever).
  s = await page.evaluate(([r]) => PLAN.rotations.filter(x => !x.type && x.time > r.time + 3).length, [r]);
  ok(s > 0, 'the planner still suggests later subs after a skip', s);

  // ---------- Keeper rotation delayed at half-time still happens ----------
  console.log('Delaying the half-time keeper change, then confirming it');
  await freshLiveMatch(page);
  r = await page.evaluate(() => { const x = PLAN.rotations.find(x => x.reason === 'scheduled GK rotation'); return x && {...x}; });
  ok(!!r, 'plan has a keeper rotation', r);
  await page.evaluate(([r]) => { const x = PLAN.rotations.find(y => y.time === r.time && y.slot === r.slot); delayDueSub(x, r.time, 1); }, [r]);
  await page.evaluate(([r]) => { const x = PLAN.rotations.find(y => y.time === r.time && y.slot === r.slot); confirmDueSub(x, r.time + 2); }, [r]);
  s = await page.evaluate(([r]) => ({gk: computeStateAt(r.time + 2).onPitch.GK, n: new Set(Object.values(computeStateAt(r.time + 2).onPitch)).size}), [r]);
  ok(s.gk === r.on && s.n === 7, `${r.on} is in goal after the confirmed keeper change`, s);

  // ---------- V11: keeper unavailable, keeper-capable outfielder on the pitch ----------
  console.log('V11 unavailable keeper, no keeper on the bench');
  await freshLiveMatch(page);
  let k = await page.evaluate(() => ({gk: computeStateAt(5).onPitch.GK, bench: PLAYERS.filter(p => !Object.values(computeStateAt(5).onPitch).includes(p.id)).map(p => [p.id, p.gk])}));
  await atMinute(page, 5);
  await page.evaluate(gk => markPlayerUnavailable(gk), k.gk);
  await page.click('#modalConfirm'); await page.waitForTimeout(100);
  s = await page.evaluate(gk => {
    const at5 = computeStateAt(5);
    const back = [];
    for (let t = 5; t < DURATION; t++) if (Object.values(computeStateAt(t).onPitch).includes(gk)) back.push(t);
    return { newGk: at5.onPitch.GK, newGkIsKeeper: !!playersById[at5.onPitch.GK].gk, count: Object.keys(at5.onPitch).length,
      unique: new Set(Object.values(at5.onPitch)).size, back, alert: !!document.querySelector('.modal-overlay') };
  }, k.gk);
  ok(s.newGk !== k.gk && s.newGkIsKeeper, `a keeper-capable player (${s.newGk}) goes in goal`, s);
  ok(s.count === 7 && s.unique === 7, 'team stays at full strength (7 players, no duplicates)', s);
  ok(s.back.length === 0, `${k.gk} never returns later in the match`, s.back);
  ok(!s.alert, 'no "plays short" message', s);

  // ---------- V11: keeper on the bench is brought on ----------
  console.log('V11 unavailable keeper, keeper on the bench');
  await freshLiveMatch(page, () => {
    // Start the second keeper on the bench.
    const benchPid = PLAYERS.find(p => !Object.values(startingLineup).includes(p.id)).id;
    const slot = Object.keys(startingLineup).find(sl => startingLineup[sl] === 'Archie');
    startingLineup[slot] = benchPid; regeneratePlan();
  });
  k = await page.evaluate(() => ({gk: computeStateAt(3).onPitch.GK, benchKeepers: PLAYERS.filter(p => p.gk && !Object.values(computeStateAt(3).onPitch).includes(p.id)).map(p => p.id), outfield: {...computeStateAt(3).onPitch}}));
  ok(k.benchKeepers.length === 1, 'setup: a keeper starts on the bench', k);
  await atMinute(page, 3);
  await page.evaluate(gk => markPlayerUnavailable(gk), k.gk);
  await page.click('#modalConfirm'); await page.waitForTimeout(100);
  s = await page.evaluate(() => ({...computeStateAt(3).onPitch}));
  ok(s.GK === k.benchKeepers[0], `the bench keeper ${k.benchKeepers[0]} comes on in goal`, s);
  const outfieldSame = Object.keys(k.outfield).filter(sl => sl !== 'GK').every(sl => k.outfield[sl] === s[sl]);
  ok(outfieldSame, 'outfield players are left where they were', {before: k.outfield, after: s});

  // ---------- V11: no keeper available at all ----------
  console.log('V11 unavailable keeper, no keeper anywhere');
  await freshLiveMatch(page);
  await atMinute(page, 2);
  const other = await page.evaluate(() => PLAYERS.find(p => p.gk && p.id !== computeStateAt(2).onPitch.GK).id);
  await page.evaluate(id => markPlayerUnavailable(id), other);
  await page.click('#modalConfirm'); await page.waitForTimeout(100);
  await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(e => e.remove()));
  const gk = await page.evaluate(() => computeStateAt(2).onPitch.GK);
  await page.evaluate(id => markPlayerUnavailable(id), gk);
  await page.click('#modalConfirm'); await page.waitForTimeout(150);
  s = await page.evaluate(() => ({ text: (document.querySelector('.modal-overlay') || {}).textContent || '' }));
  ok(/goal/i.test(s.text), 'the coach is asked who goes in goal', s.text.slice(0, 160));
  await page.locator('.modal-overlay .picker-opt').first().click(); await page.waitForTimeout(100);
  s = await page.evaluate(gk => { const st = computeStateAt(2).onPitch; return { gk: st.GK, n: new Set(Object.values(st)).size, harryOn: Object.values(st).includes(gk) }; }, gk);
  ok(s.gk && s.gk !== gk && s.n === 7 && !s.harryOn, `the chosen player (${s.gk}) goes in goal and the team stays at 7`, s);

  summary('phase1_live_bugs', errors);
  await browser.close();
})();
