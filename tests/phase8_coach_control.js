// Coach control (feedback from first real use):
//  - "Pick it myself": no goalkeeper plan options; the planner never changes
//    the coach's team (no keeper swaps at breaks), it only advises and suggests.
//  - A plan the coach has seen is protected: the starting line-up stays, edits
//    re-plan as little as possible, and every planner change is recorded,
//    labelled and undoable.
//  - Goalkeepers can be subbed, and the coach's keeper stays in goal for the period.
//  - Tables: periods started/finished and times subbed on/off; no target or diff.
//  - Position moves describe what really happens (no "moves" for a player going off).
const { launch, openPage, newMatch, ok, summary } = require('./_harness');

(async () => {
  const { browser, errors } = await launch();
  let page = await openPage(browser, errors);
  const close = () => page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(e => e.remove()));

  console.log('Pick it myself');
  await page.click('[data-tab="matches"]'); await page.click('#newFixtureBtn'); await page.waitForTimeout(150);
  await page.click('[data-planmode="manual"]');
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('gkSection')).display === 'none'), 'no goalkeeper plan options: keepers are picked on the pitch');
  await page.click('[data-planmode="auto"]');
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('gkSection')).display !== 'none'), '(they come back for Auto-generate)');
  await page.click('[data-planmode="manual"]');
  await page.click('#generateBtn'); await page.waitForTimeout(300); await close();
  await page.evaluate(() => { const ids = PLAYERS.map(p => p.id).filter(x => x !== 'Archie'); const lu = {}; SLOTS.forEach((sl, i) => { lu[sl.id] = sl.group === 'GK' ? 'Archie' : ids[i]; }); startingLineup = lu; lineupByCoach = true; regeneratePlan(); render(0); });
  let s = await page.evaluate(() => { const st = new Set(); for (let t = 0; t < DURATION; t++) st.add(JSON.stringify(computeStateAt(t).onPitch)); return {subs: PLAN.rotations.filter(r => !r.type).length, distinct: st.size, gk: [0, 24, 25, 49].map(t => computeStateAt(t).onPitch.GK)}; });
  ok(s.subs === 0 && s.distinct === 1 && s.gk.every(g => g === 'Archie'), 'the team the coach picked stays exactly as picked all match (no keeper swap at half-time)', s);
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('scoreStrip')).display !== 'none'), 'the scorecard still advises');
  await page.click('#scoreStrip'); await page.waitForTimeout(400);
  s = await page.evaluate(() => ({text: document.querySelector('.modal-overlay').textContent, n: (window.__suggestions || []).length}));
  ok(/Suggestions \(you decide\)/.test(s.text) && s.n > 0, `the planner suggests changes without making them (${s.n} suggestions)`);
  await page.click('[data-add-sug="0"]'); await page.waitForTimeout(300); await close();
  s = await page.evaluate(() => PLAN.rotations.filter(r => !r.type).map(r => r.reason));
  ok(s.length === 1 && s[0] === 'coach planned', 'adding one suggestion adds exactly that change, as the coach\'s own', s);
  await page.click('#startMatchBtn'); await page.waitForTimeout(150);
  await page.evaluate(() => { clearInterval(liveTicker); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); matchStartTs = Date.now() - 5 * 60000; });
  const victim = await page.evaluate(() => displayStateAt(5).onPitch[SLOTS.find(sl => sl.group === 'DEF').id]);
  await page.evaluate(pid => markPlayerUnavailable(pid), victim); await page.click('#modalConfirm'); await page.waitForTimeout(150);
  s = await page.evaluate(() => ({picker: /Replace/.test((document.querySelector('.modal-overlay') || {}).textContent || ''), cover: lockedEvents.some(e => e.reason === 'unavailable replacement')}));
  ok(s.picker && !s.cover, 'when a player is marked unavailable, the coach chooses who comes on', s);
  await close();

  console.log('A reviewed plan is protected');
  page = await openPage(browser, errors);
  await newMatch(page);
  const start = await page.evaluate(() => JSON.stringify(startingLineup));
  const r = await page.evaluate(() => { const x = PLAN.rotations.find(y => !y.type && y.reason === 'planned rotation'); return {time: x.time, slot: x.slot}; });
  await page.evaluate(r => deletePlannedSub(r.time, r.slot), r); await close();
  s = await page.evaluate(() => ({lineup: JSON.stringify(startingLineup), n: planChanges.length, e: planChanges[0], pill: getComputedStyle(document.getElementById('planChangePill')).display, badges: document.querySelectorAll('#timeline .edited-badge.planner').length}));
  ok(s.lineup === start, 'editing the plan never changes the starting line-up the coach has seen');
  if (s.n) {
    ok(/after you removed/.test(s.e.cause) && s.e.changes.every(c => /^\d+': /.test(c.text)), `the planner's changes are recorded with their cause: "${s.e.cause}"`, s.e.changes.map(c => c.text));
    ok(s.pill !== 'none', 'and flagged on the pitch screen for review');
    const beforeUndo = await page.evaluate(() => JSON.stringify(PLAN.rotations.filter(x => !x.type).map(x => [x.time, x.on, x.off])));
    await page.evaluate(() => undoPlannerChange(planChanges[0].id));
    s = await page.evaluate(() => ({undone: planChanges[0].undone, ref: planChanges[0].ref.map(w => [w.from, JSON.stringify(w.onPitch)]), now: PLAN.windows.map(w => [w.from, JSON.stringify(w.onPitch)])}));
    const kept = s.now.filter(([t, o]) => s.ref.some(([t2, o2]) => t2 === t && o2 === o)).length;
    ok(s.undone && kept >= s.now.length - 2, `undo puts the plan back as it was, apart from the change the coach made (${kept} of ${s.now.length} stretches identical)`);
  } else ok(true, 'removing the sub needed no other changes');

  console.log('Subbing the goalkeeper');
  page = await openPage(browser, errors);
  await newMatch(page);
  await page.evaluate(() => { currentT = 10; render(10); openPlayerActionMenu(computeStateAt(10).onPitch.GK, 'GK'); });
  ok(await page.locator('.modal-overlay .picker-opt', {hasText: 'Substitute off'}).count() === 1, 'the keeper can be subbed off');
  await page.locator('.modal-overlay .picker-opt', {hasText: 'Substitute off'}).click(); await page.waitForTimeout(150);
  s = await page.evaluate(() => [...document.querySelectorAll('.modal-overlay .picker-opt .tier')].map(e => e.textContent));
  ok(s.length > 0 && s.every(t => /keeper|Capable|Emergency|Cannot/.test(t)), 'the picker shows each bench player\'s goalkeeping ability', s);
  const newGk = await page.evaluate(() => document.querySelector('.modal-overlay .picker-opt').dataset.on);
  await page.locator('.modal-overlay .picker-opt').first().click(); await page.waitForTimeout(300);
  s = await page.evaluate(() => { const end = PERIOD_BOUNDS[1]; const gks = []; for (let t = 10; t < end; t++) gks.push(computeStateAt(t).onPitch.GK); return {gks: [...new Set(gks)], t0: evaluatePlan(planFromEngine(), PLAYERS, currentMatchSpec(undefined, 0)).tiers.t0.count}; });
  ok(s.gks.length === 1 && s.gks[0] === newGk && s.t0 === 0, `${newGk} keeps goal until the end of the period, with no rule clashes`, s);

  console.log('Tables');
  await page.evaluate(() => { setPlanSubTab('details'); setDetailsSubTab('forecast'); });
  s = await page.evaluate(() => ({head: [...document.querySelectorAll('#fairnessTable th')].map(h => h.textContent), counts: playerMatchCounts(DURATION), subs: PLAN.rotations.filter(r => !r.type).length}));
  ok(s.head.join('|') === 'Player|So far|Forecasttotal|Periodsstarted|Periodsfinished|Subbedon|Subbedoff', 'the forecast table has periods started and finished and times subbed on and off, and no target or diff', s.head);
  const sumOn = Object.values(s.counts).reduce((a, k) => a + k.on, 0), sumOff = Object.values(s.counts).reduce((a, k) => a + k.off, 0);
  ok(sumOn === sumOff && sumOn > 0, `subs on and off balance (${sumOn} each)`);
  s = await page.evaluate(() => buildSummaryTable(DURATION));
  ok(!/Target|Diff/.test(s) && /Periods<br>started/.test(s), 'the full-time table drops target and diff too');
  ok(await page.evaluate(() => { try { renderLineupCanvas(); return true; } catch (e) { return e.message; } }) === true, 'the exported line-up image draws');

  console.log('Position moves');
  s = await page.evaluate(() => {
    const bad = [];
    for (const t of [...new Set(PLAN.rotations.map(r => r.time))]) {
      const offs = PLAN.rotations.filter(r => !r.type && r.time === t).map(r => r.off);
      for (const m of reshuffleMovesAt(t)) if (offs.includes(m.split(' ')[0])) bad.push(`${t}: ${m}`);
      for (const r of PLAN.rotations.filter(x => !x.type && x.time === t)) {
        const st = computeStateAt(t); const sl = Object.keys(st.onPitch).find(k => st.onPitch[k] === r.on);
        if (st.activeSlots.find(x => x.id === sl).label !== subPlaceLabel(r)) bad.push(`${t}: ${r.on} place`);
      }
    }
    return bad;
  });
  ok(!s.length, 'no player going off is described as moving, and each sub shows where the new player really plays', s);

  summary('phase8_coach_control', errors);
  await browser.close();
})();
