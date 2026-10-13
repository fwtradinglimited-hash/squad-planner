// Phase 5: live re-planning with the new engine. What has happened is fixed
// at the real minutes; only the rest of the match is re-planned, starting
// from the plan the coach has seen.
const { launch, openPage, newMatch, ok, summary } = require('./_harness');
let browser, page, errors;

async function liveMatch(setup) {
  if (page) await page.context().close();
  page = await openPage(browser, errors);
  await newMatch(page);
  await page.evaluate(setup || (() => {}));
  await page.evaluate(() => { cfg.engine = 'window'; regeneratePlan(); render(0); });
  await page.click('#startMatchBtn'); await page.waitForTimeout(150);
  await page.evaluate(() => { clearInterval(liveTicker); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); });
}
const at = m => page.evaluate(m => { matchStartTs = Date.now() - m * 60000; pausedAccumMs = 0; pauseStartedAt = null; }, m);
const confirm = () => page.evaluate(() => { const b = document.getElementById('modalConfirm'); if (b) b.click(); });
// The plan as a list, and the segments before minute m.
const snapshot = () => page.evaluate(() => ({rots: PLAN.rotations.map(r => [r.time, r.type || 'sub', r.slot || '', r.off || '', r.on || '']), windows: PLAN.windows.map(w => [w.from, w.to, JSON.stringify(w.onPitch)])}));
// Who is in each position, minute by minute (however the plan splits it into windows).
const canon = j => { const o = JSON.parse(j); return JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]])); };
const minutesOf = (snap, from, to) => { const out = []; for (const w of snap.windows) for (let t = Math.max(w[0], from); t < Math.min(w[1], to); t++) out.push(t + ':' + canon(w[2])); return out; };
const pastOf = (snap, m) => minutesOf(snap, 0, m);
const firstDiff = (a, b) => { const i = a.findIndex((x, k) => x !== b[k]); return i < 0 ? {lengths: [a.length, b.length]} : {before: a[i], after: b[i]}; };
const scorecardNow = () => page.evaluate(() => { const c = evaluatePlan(planFromEngine(), PLAYERS, currentMatchSpec(undefined, liveElapsedMinute())); return {t0: c.tiers.t0.items.map(x => x.text), t1: c.tiers.t1.count}; });

(async () => {
  ({ browser, page, errors } = await launch());

  // ---------- Confirming on time changes nothing ----------
  console.log('Confirming a sub on time keeps the plan as shown');
  await liveMatch();
  let r = await page.evaluate(() => { const f = PLAN.rotations.find(x => !x.type); return {...f}; });
  await at(r.time);
  let before = await snapshot();
  const due = await page.evaluate(t => dueRotations(t).length, r.time);
  let ms = await page.evaluate(t => { const t0 = performance.now(); dueRotations(t).forEach(x => confirmDueSub(x, t)); return Math.round(performance.now() - t0); }, r.time);
  let after = await snapshot();
  ok(JSON.stringify(after.rots.filter(x => x[0] > r.time)) === JSON.stringify(before.rots.filter(x => x[0] > r.time)), `confirming all ${due} changes at ${r.time}' leaves every later change as shown`);
  ok(JSON.stringify(pastOf(after, r.time)) === JSON.stringify(pastOf(before, r.time)), 'the minutes already played are unchanged', firstDiff(pastOf(before, r.time), pastOf(after, r.time)));
  ok(ms / due < 400, `each re-plan takes ${Math.round(ms / due)} ms on this machine`, ms);

  // ---------- Delay then confirm late ----------
  console.log('DELAY, then DONE three minutes late');
  await liveMatch();
  r = await page.evaluate(() => { const f = PLAN.rotations.find(x => !x.type && x.reason === 'planned rotation'); return {...f}; });
  await at(r.time);
  await page.evaluate(r => { const x = PLAN.rotations.find(y => y.time === r.time && y.slot === r.slot); delayDueSub(x, r.time, 2); }, r);
  await at(r.time + 3);
  before = await snapshot();
  await page.evaluate(r => { const x = PLAN.rotations.find(y => y.time === r.time && y.slot === r.slot); confirmDueSub(x, r.time + 3); }, r);
  let s = await page.evaluate(r => ({during: computeStateAt(r.time + 1).onPitch[r.slot], after: computeStateAt(r.time + 3).onPitch[r.slot], onMins: computeStateAt(r.time + 3).minutesPlayed[r.on]}), r);
  ok(s.during === r.off && s.after === r.on && s.onMins === 0, `${r.off} stayed on until ${r.time + 3}', then ${r.on} came on`, s);
  ok((await scorecardNow()).t0.length === 0, 'the re-planned match breaks no rules');

  // ---------- Skip late ----------
  console.log('SKIP three minutes late');
  await liveMatch();
  r = await page.evaluate(() => { const f = PLAN.rotations.find(x => !x.type && x.reason === 'planned rotation'); return {...f}; });
  await at(r.time + 3);
  before = await snapshot();
  await page.evaluate(r => { const x = PLAN.rotations.find(y => y.time === r.time && y.slot === r.slot); skipDueSub(x, r.time + 3); }, r);
  after = await snapshot();
  s = await page.evaluate(r => ({stillOn: computeStateAt(r.time + 3).onPitch[r.slot], onLater: PLAN.rotations.some(x => !x.type && x.on === r.on && x.time > r.time + 3), mins: PLAN.projectedMinutes[r.on]}), r);
  ok(s.stillOn === r.off, `${r.off} stayed on`, s);
  ok(s.onLater && s.mins > 0, `${r.on} is planned on later instead (${s.mins}')`, s);
  ok(JSON.stringify(pastOf(after, r.time)) === JSON.stringify(pastOf(before, r.time)), 'everything before the skipped change is unchanged');
  ok((await scorecardNow()).t0.length === 0, 'the re-planned match breaks no rules');

  // ---------- Player unavailable, and a keeper ----------
  console.log('A player and then the keeper become unavailable');
  await liveMatch();
  await at(12);
  r = await page.evaluate(() => { const st = displayStateAt(12); const sl = st.activeSlots.find(x => x.group !== 'GK' && !playersById[st.onPitch[x.id]].gk); return {pid: st.onPitch[sl.id], gk: st.onPitch.GK}; });
  await page.evaluate(pid => markPlayerUnavailable(pid), r.pid); await confirm(); await page.waitForTimeout(100);
  s = await page.evaluate(pid => ({later: PLAN.windows.some(w => w.to > 12 && Object.values(w.onPitch).includes(pid)), n: new Set(Object.values(computeStateAt(12).onPitch)).size}), r.pid);
  ok(!s.later && s.n === 7, `${r.pid} is covered and never planned back on`, s);
  await at(20);
  const gk = await page.evaluate(() => displayStateAt(20).onPitch.GK);
  await page.evaluate(id => markPlayerUnavailable(id), gk); await confirm(); await page.waitForTimeout(100);
  // With no other keeper left the coach is asked who goes in goal: pick the first.
  const asked = await page.evaluate(() => { const o = [...document.querySelectorAll('.modal-overlay')].find(x => /Who goes in goal/.test(x.textContent)); if (o) o.querySelector('.picker-opt').click(); return !!o; });
  await page.waitForTimeout(100);
  await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(e => e.remove()));
  console.log(`  (${asked ? 'no keeper left: the coach chose who goes in goal' : 'another keeper covered'})`);
  s = await page.evaluate(gk => ({inGoalLater: PLAN.windows.filter(w => w.to > 20).map(w => w.onPitch.GK), back: PLAN.windows.some(w => w.to > 20 && Object.values(w.onPitch).includes(gk))}), gk);
  ok(!s.back && s.inGoalLater.every(id => id && id !== gk), `the keeper ${gk} is covered and never planned back on`, s);
  ok((await scorecardNow()).t0.length === 0, 'no rule clashes after both');

  console.log('No keeper left: the coach chooses who goes in goal');
  await liveMatch();
  await at(12);
  const others = await page.evaluate(() => { const st = displayStateAt(12); return PLAYERS.filter(p => p.gk && p.id !== st.onPitch.GK).map(p => p.id); });
  for (const k of others) { await page.evaluate(id => markPlayerUnavailable(id), k); await confirm(); await page.waitForTimeout(100); await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(e => e.remove())); }
  await at(20);
  const gk2 = await page.evaluate(() => displayStateAt(20).onPitch.GK);
  await page.evaluate(id => markPlayerUnavailable(id), gk2); await confirm(); await page.waitForTimeout(100);
  const pick = await page.evaluate(() => { const o = [...document.querySelectorAll('.modal-overlay')].find(x => /Who goes in goal/.test(x.textContent)); if (!o) return null; const el = o.querySelector('.picker-opt'); const id = el.textContent.split(' (')[0]; el.click(); return id; });
  await page.waitForTimeout(100);
  ok(!!pick, 'the coach is asked who goes in goal', pick);
  s = await page.evaluate(() => ({inGoal: PLAN.windows.filter(w => w.to > 20).map(w => w.onPitch.GK)}));
  ok(s.inGoal.length && s.inGoal.every(id => id === pick), `${pick} stays in goal for the rest of the match, including the next period`, s);
  ok((await scorecardNow()).t0.length === 0, 'no rule clashes (the coach\'s choice counts as today\'s keeper)', await scorecardNow());

  // ---------- Marked available again ----------
  console.log('A player marked unavailable comes back');
  await liveMatch();
  await at(10);
  r = await page.evaluate(() => { const st = displayStateAt(10); const sl = st.activeSlots.find(x => x.group === 'MID'); return {pid: st.onPitch[sl.id]}; });
  await page.evaluate(pid => markPlayerUnavailable(pid), r.pid); await confirm(); await page.waitForTimeout(100);
  await at(20);
  const menu = await page.evaluate(pid => { openPlayerActionMenu(pid, null); const t = [...document.querySelectorAll('.modal-overlay .picker-opt')].map(e => e.textContent); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); return t; }, r.pid);
  ok(menu.includes('Mark available again') && !menu.includes('Mark unavailable'), 'tapping them on the bench offers "Mark available again"', menu);
  ok(await page.evaluate(pid => [...document.querySelectorAll('#benchRow .bench-card.out')].some(e => e.textContent.startsWith(pid)), r.pid), 'the bench shows them as out');
  before = await snapshot();
  await page.evaluate(pid => markPlayerAvailable(pid), r.pid); await confirm(); await page.waitForTimeout(100);
  after = await snapshot();
  s = await page.evaluate(pid => ({back: PLAN.windows.some(w => w.from >= 20 && Object.values(w.onPitch).includes(pid)), away: PLAN.windows.some(w => w.from < 20 && w.to > 10 && Object.values(w.onPitch).includes(pid)),
    out: !!document.querySelector('#benchRow .bench-card.out'), logged: PLAN.rotations.some(x => x.type === 'available' && x.player === pid)}), r.pid);
  ok(s.back && !s.away, `${r.pid} is planned back on after 20', and never during the time they were out`, s);
  ok(JSON.stringify(pastOf(after, 20)) === JSON.stringify(pastOf(before, 20)), 'the minutes already played are unchanged', firstDiff(pastOf(before, 20), pastOf(after, 20)));
  ok(!s.out && s.logged, 'they are no longer shown as out, and the match record notes it', s);
  ok((await scorecardNow()).t0.length === 0, 'no rule clashes');
  await at(50);
  s = await page.evaluate(pid => { dueRotations(50).forEach(x => confirmDueSub(x, 49)); const st = computeMatchStats(50, [], {us: 0, them: 0}); return st.players[pid].avail; }, r.pid);
  ok(s === 40, `the 10' they were out isn't counted as time they were available (${s}' of 50')`, s);

  // ---------- Formation change during the match ----------
  console.log('Changing formation mid-match');
  await liveMatch();
  await at(30);
  r = await page.evaluate(() => {
    const st = computeStateAt(30);
    const newSlots = buildFormation({DEF: 3, MID: 2, ATT: 1}, HAS_GK);
    lockedEvents.push({time: 30, type: 'formation', slots: newSlots, remap: buildFormationRemap(st.onPitch, newSlots)});
    regeneratePlan();
    const later = PLAN.windows.filter(w => w.from >= 30);
    return {shapes: later.map(w => (w.slots || SLOTS).filter(sl => sl.group === 'DEF').length), filled: later.every(w => (w.slots || SLOTS).every(sl => w.onPitch[sl.id]))};
  });
  ok(r.shapes.length && r.shapes.every(n => n === 3) && r.filled, 'every window after 30\' uses the new shape, fully filled', r);
  ok((await scorecardNow()).t0.length === 0, 'no rule clashes after the change');

  // ---------- How much the planner may change (coach setting) ----------
  console.log('Re-planning level');
  const levelTest = async level => {
    await liveMatch(level => { teamEthos.live.replan = level; }, level);
    await page.evaluate(level => { teamEthos.live.replan = level; }, level);
    const x = await page.evaluate(() => { const f = PLAN.rotations.find(y => !y.type && y.reason === 'planned rotation'); return {...f}; });
    await at(x.time + 3);
    const b = await snapshot();
    await page.evaluate(x => { const y = PLAN.rotations.find(z => z.time === x.time && z.slot === x.slot); skipDueSub(y, x.time + 3); }, x);
    const a = await snapshot();
    return {x, b, a};
  };
  let lv = await levelTest('off');
  // Who is on in each later stretch of play is exactly as shown (the changes
  // themselves can read differently, as the skipped player stayed on).
  const nextEdge = lv.b.windows.find(w => w[0] > lv.x.time + 3)[0];
  const laterOf = snap => minutesOf(snap, nextEdge, 50);
  ok(JSON.stringify(laterOf(lv.a)) === JSON.stringify(laterOf(lv.b)), '"Off": the rest of the plan stays as shown', firstDiff(laterOf(lv.b), laterOf(lv.a)));
  lv = await levelTest('nextStable');
  const nextB = lv.b.rots.filter(q => q[0] > lv.x.time + 3)[0], nextA = lv.a.rots.filter(q => q[0] > lv.x.time + 3)[0];
  ok(nextB && nextA && nextA[0] === nextB[0], '"Keep the next change": the next change stays at the same minute', {nextB, nextA});

  // ---------- Go strongest now ----------
  console.log('Go strongest now');
  await liveMatch(() => {
    // Give the squad levels so strength means something.
    PLAYERS.forEach((p, i) => { p.level = [8, 8, 2, 2, 5, 5, 8, 2, 5, 5][i % 10]; });
    squad.forEach((p, i) => { p.level = [8, 8, 2, 2, 5, 5, 8, 2, 5, 5][i % 10]; });
  });
  await at(30);
  // Average level on the pitch over the rest of the match, minute by minute,
  // weighted by how well each player fits their position (as the scorecard does).
  const strength = () => page.evaluate(() => {
    const fit = window.__fit = window.__fit || currentMatchSpec(undefined, 30).fit; // the same measure before and after
    let n = 0, sum = 0;
    for (let t = 30; t < DURATION; t++) {
      const w = PLAN.windows.find(x => t >= x.from && t < x.to);
      for (const sl of (w.slots || SLOTS)) { if (sl.group === 'GK') continue; const p = playersById[w.onPitch[sl.id]]; sum += playerLevel(p, sl.group) * (fit[p.positions[sl.group] ?? 0] ?? 0); n++; }
    }
    return sum / n;
  });
  const sBefore = await strength();
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('goStrongestLink')).display !== 'none'), '"Go strongest now" is offered during the match');
  await page.click('#goStrongestLink'); await confirm(); await page.waitForTimeout(150);
  const sAfter = await strength();
  s = await page.evaluate(() => ({eras: matchFixture.todayEras, link: getComputedStyle(document.getElementById('goStrongestLink')).display}));
  ok(s.eras && s.eras[0].from === 30 && s.eras[0].today === 'mustwin', 'it is recorded from this minute', s.eras);
  ok(sAfter > sBefore, `stronger players play more of the rest of the match (level ${sBefore.toFixed(2)} → ${sAfter.toFixed(2)})`, {sBefore, sAfter});
  ok(s.link === 'none', 'and it isn\'t offered twice', s.link);

  // ---------- Not assumed made until confirmed ----------
  console.log('A due sub is not shown as made until confirmed');
  for (const engine of ['window']) {
    if (page) await page.context().close();
    page = await openPage(browser, errors);
    await newMatch(page);
    await page.evaluate(e => { cfg.engine = e; regeneratePlan(); render(0); }, engine);
    await page.click('#startMatchBtn'); await page.waitForTimeout(150);
    await page.evaluate(() => { clearInterval(liveTicker); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); });
    r = await page.evaluate(() => { const f = PLAN.rotations.find(x => !x.type); return {...f}; });
    await at(r.time + 1);
    // (The player coming on may be placed in a different position by the
    // moves planned with the sub, so this looks at who is on, not where.)
    s = await page.evaluate(r => { render(r.time + 1); const d = displayStateAt(r.time + 1), c = computeStateAt(r.time + 1); return {shownOff: Object.values(d.onPitch).includes(r.off), shownOn: Object.values(d.onPitch).includes(r.on), plannedOn: Object.values(c.onPitch).includes(r.on), plannedOff: Object.values(c.onPitch).includes(r.off)}; }, r);
    ok(s.shownOff && !s.shownOn && s.plannedOn && !s.plannedOff, `${engine} engine: ${r.off} is shown on until the change is confirmed`, s);
    await page.evaluate(r => { const x = PLAN.rotations.find(y => y.time === r.time && y.slot === r.slot); confirmDueSub(x, r.time + 1); }, r);
    s = await page.evaluate(r => { const d = displayStateAt(r.time + 1); return {on: Object.values(d.onPitch).includes(r.on), off: Object.values(d.onPitch).includes(r.off), pending: (d.pending || []).length}; }, r);
    ok(s.on && (!s.off || s.pending > 0), `${engine} engine: once confirmed, ${r.on} is shown on`, s);
  }

  // ---------- Coach changes a position that has a sub waiting ----------
  console.log('Coach makes their own change where a planned one is waiting');
  await liveMatch();
  r = await page.evaluate(() => { const f = PLAN.rotations.find(x => !x.type && x.reason === 'planned rotation'); return {...f}; });
  await at(r.time + 2);
  const third = await page.evaluate(r => { const on = new Set(Object.values(displayStateAt(r.time + 2).onPitch)); return PLAYERS.find(p => !on.has(p.id) && p.id !== r.on).id; }, r);
  await page.evaluate(r => openLiveChangePicker(r.slot), r);
  await page.locator(`.picker-opt[data-on="${third}"]`).click(); await page.waitForTimeout(100);
  s = await page.evaluate(r => ({atPlanned: computeStateAt(r.time).onPitch[r.slot], now: computeStateAt(r.time + 2).onPitch[r.slot], due: dueRotations(r.time + 2).filter(x => x.slot === r.slot).length}), r);
  ok(s.atPlanned === r.off && s.now === third && s.due === 0, `${r.off} stayed on until the coach brought ${third} on; the planned change is gone`, s);

  // ---------- Reopening the app mid-match ----------
  console.log('Reopening the app mid-match');
  await liveMatch();
  await at(14);
  await page.evaluate(() => { dueRotations(14).forEach(x => confirmDueSub(x, 14)); saveLiveMatchState(); });
  before = await snapshot();
  await page.reload(); await page.waitForTimeout(500);
  await page.evaluate(() => { clearInterval(liveTicker); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); });
  after = await snapshot();
  ok(await page.evaluate(() => liveMode && PLAN.engine === 'window'), 'the match reopens live on the new engine');
  ok(JSON.stringify(after.rots) === JSON.stringify(before.rots), 'the plan is exactly as it was');

  // ---------- Finishing keeps the record ----------
  console.log('Finishing the match');
  await at(50);
  r = await page.evaluate(() => { dueRotations(50).forEach(x => confirmDueSub(x, 49)); finishMatch(50); const rec = loadMatchLibrary().find(x => x.status === 'finished'); return {stats: !!rec.stats, sum: Object.values(rec.stats.players).reduce((a, p) => a + p.mins, 0), saved: !!rec.snapshot.savedPlan}; });
  ok(r.stats && r.sum === 350 && r.saved, 'the finished match has full stats (350 player-minutes) and keeps its plan', r);

  // ---------- Matches saved before the switch to the new planner ----------
  console.log('Matches saved before the switch');
  const oldMatch = async status => {
    if (page) await page.context().close();
    page = await openPage(browser, errors);
    await newMatch(page);
    // Planned by the earlier engine, as every match was before the switch.
    await page.evaluate(() => { cfg = {...cfg, engine: undefined}; computeTargets(); regeneratePlan(); render(0); saveLiveMatchState(); });
    await page.click('#startMatchBtn'); await page.waitForTimeout(150);
    await page.evaluate(() => { clearInterval(liveTicker); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); });
    await at(14);
    await page.evaluate(() => { dueRotations(14).forEach(x => confirmDueSub(x, 14)); saveLiveMatchState(); });
    if (status === 'finished') {
      await at(50);
      await page.evaluate(() => { dueRotations(50).forEach(x => confirmDueSub(x, 49)); finishMatch(50); });
    }
    return page.evaluate(() => ({id: currentMatchId, engine: PLAN.engine || 'earlier', plan: (() => { const out = []; for (let t = 0; t < DURATION; t++) { const o = computeStateAt(t).onPitch; out.push(JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]))); } return out; })()}));
  };
  let om = await oldMatch('finished');
  ok(om.engine === 'earlier', 'setup: a finished match planned by the earlier engine');
  await page.reload(); await page.waitForTimeout(400);
  s = await page.evaluate(id => { openMatchFromLibrary(id); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); const out = []; for (let t = 0; t < DURATION; t++) { const o = computeStateAt(t).onPitch; out.push(JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]))); } return {plan: out, finished: matchFinished, engine: PLAN.engine || 'earlier'}; }, om.id);
  ok(s.finished && JSON.stringify(s.plan) === JSON.stringify(om.plan), 'it reopens exactly as it was played, minute by minute', firstDiff(om.plan, s.plan));
  om = await oldMatch('live');
  await page.reload(); await page.waitForTimeout(500);
  await page.evaluate(() => { clearInterval(liveTicker); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); });
  s = await page.evaluate(() => ({live: liveMode, engine: PLAN.engine, plan: (() => { const out = []; for (let t = 0; t < DURATION; t++) { const o = computeStateAt(t).onPitch; out.push(JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]))); } return out; })(), t0: evaluatePlan(planFromEngine(), PLAYERS, currentMatchSpec(undefined, 14)).tiers.t0.count}));
  ok(s.live && s.engine === 'window', 'a match in progress moves to the new planner when it is reopened', s.engine);
  ok(JSON.stringify(s.plan.slice(0, 14)) === JSON.stringify(om.plan.slice(0, 14)), 'everything already played is kept exactly', firstDiff(om.plan.slice(0, 14), s.plan.slice(0, 14)));
  ok(s.t0 === 0, 'and the rest of the match breaks no rules');

  summary('phase5_live', errors);
  await browser.close();
})();
