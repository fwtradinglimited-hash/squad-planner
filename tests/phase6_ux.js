// Phase 6: what the coach sees of the new planner. Team approach (cards,
// fine-tune, advanced), player level and goal ability, Today and player
// exceptions on a new fixture, the scorecard strip and "Why?" everywhere.
// Gate: a coach can answer "why did X come off?" from the app.
const { launch, openPage, newMatch, ok, summary } = require('./_harness');

(async () => {
  const { browser, errors } = await launch();
  let page = await openPage(browser, errors);
  const close = () => page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(e => e.remove()));

  console.log('Team approach');
  await page.click('[data-tab="squad"]');
  ok(await page.isVisible('#secApproach') && await page.isVisible('#secRotations'), 'the Squad tab has a Team approach section; rotation presets show while the current planner is used');
  await page.click('#apEngine'); await page.waitForTimeout(300);
  let s = await page.evaluate(() => ({engine: JSON.parse(localStorage.getItem(ETHOS_KEY)).engine, rot: getComputedStyle(document.getElementById('secRotations')).display, preview: document.getElementById('apPreview').textContent}));
  ok(s.engine === 'window' && s.rot === 'none', 'switching the new planner on is saved for the team, and the old rotation presets are hidden', s);
  ok(/Minutes \d+'–\d+'/.test(s.preview) && /subs/.test(s.preview), `a live preview from the squad: "${s.preview}"`);
  await page.click('.ethos-card[data-preset="competitive"]'); await page.waitForTimeout(300);
  s = await page.evaluate(() => ({preset: teamEthos.preset, prio: compileSpec({ethos: teamEthos, duration: 50, periodBounds: [0, 25, 50], players: PLAYERS}).priority, sel: document.querySelector('.ethos-card.selected').dataset.preset}));
  ok(s.preset === 'competitive' && s.sel === 'competitive' && s.prio[0] === 'strength', 'picking Competitive sets the preset (strength first)', s);
  await page.click('#apFineToggle');
  await page.evaluate(() => { const r = document.querySelector('[data-slider="changes"]'); r.value = 80; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(200);
  s = await page.evaluate(() => ({v: teamEthos.sliders.changes, label: [...document.querySelectorAll('#apFine .config-row')].find(r => r.textContent.includes('Changes')).textContent}));
  ok(s.v === 80 && /your setting/.test(s.label) && /reset/.test(s.label), 'fine-tuning a slider is saved and shows as "your setting" with a reset', s);
  await page.click('[data-reset-slider="changes"]'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => teamEthos.sliders.changes === undefined), 'reset puts it back to the preset');
  await page.click('#apAdvToggle');
  await page.click('[data-prio-down="0"]'); await page.waitForTimeout(100);
  s = await page.evaluate(() => teamEthos.priority);
  ok(JSON.stringify(s) === JSON.stringify(['minutes', 'strength', 'positions']), 'the priority order can be changed in Advanced', s);
  await page.click('[data-choice="unitFloor"] [data-v="soft"]');
  await page.click('[data-choice="replan"] [data-v="major"]');
  await page.click('[data-choice="timingMode"] [data-v="interval"]');
  s = await page.evaluate(() => ({u: teamEthos.rules.unitFloor, r: teamEthos.live.replan, t: teamEthos.timing.mode, spec: (() => { const sp = compileSpec({ethos: teamEthos, duration: 50, periodBounds: [0, 25, 50], players: PLAYERS, subTimingCfg: teamEthos.timing}); return {u: sp.unitFloor, r: sp.replan, t: sp.subTiming.mode}; })()}));
  ok(s.u === 'soft' && s.r === 'major' && s.t === 'interval' && s.spec.u === 'soft' && s.spec.r === 'major' && s.spec.t === 'interval', 'Advanced settings feed straight into the Planning Spec', s);
  await page.evaluate(() => { document.getElementById('apPairA').value = 'Jack'; document.getElementById('apPairB').value = 'Leo'; document.getElementById('apPairKind').value = 'apart'; });
  await page.click('#apPairAdd'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => teamEthos.pairs.some(p => p.a === 'Jack' && p.b === 'Leo' && p.kind === 'apart')), 'a keep-apart pair can be added');
  // Back to a clean Balanced approach for the rest.
  await page.evaluate(() => { teamEthos = normaliseEthos({engine: 'window'}); saveEthos(); renderApproachSection(); });

  console.log('Player form: level and goal ability');
  await page.click('#squadList .player-card >> nth=2'); await page.waitForTimeout(150);
  const editBtn = page.locator('#psBody >> text=Edit');
  if (await editBtn.count()) await editBtn.first().click(); else await page.evaluate(() => openPlayerForm(squad[2].id));
  await page.waitForTimeout(150);
  const pid = await page.inputValue('#pf-name');
  await page.click('#pf-levelChips [data-lvl="8"]');
  ok(await page.isVisible('#pf-levelFine'), 'a quick tap sets the level and shows the fine-tune slider');
  await page.selectOption('#pf-goal', '1');
  await page.click('#pf-save'); await page.waitForTimeout(150);
  s = await page.evaluate(pid => { const p = squad.find(x => x.id === pid); return {level: p.level, goal: p.goal, gk: p.gk, saved: JSON.parse(localStorage.getItem(STORAGE_KEY)).find(x => x.id === pid).level}; }, pid);
  ok(s.level === 8 && s.saved === 8 && s.goal === 1 && s.gk === false, `${pid}: level Strong (8) and Emergency keeper are saved`, s);
  await page.evaluate(pid => openPlayerForm(pid), pid);
  ok(await page.evaluate(() => document.querySelector('#pf-levelChips .selected').dataset.lvl === '8' && document.getElementById('pf-goal').value === '1'), 'reopening the form shows them');
  await page.fill('#pf-number', '21'); await page.click('#pf-save'); await page.waitForTimeout(100);
  ok(await page.evaluate(pid => squad.find(x => x.id === pid).level === 8, pid), 'editing something else keeps the level');
  ok(await page.evaluate(() => /never shown/.test(document.getElementById('pf-levelField').textContent)), 'the form says the level is private');

  console.log('New fixture: Today and exceptions');
  await page.click('[data-tab="matches"]'); await page.click('#newFixtureBtn');
  if (await page.locator('#modalConfirm').count()) await page.click('#modalConfirm');
  await page.waitForTimeout(150);
  s = await page.evaluate(() => ({today: getComputedStyle(document.getElementById('secToday')).display, rot: getComputedStyle(document.getElementById('rotationCard')).display, line: getComputedStyle(document.getElementById('secApproachLine')).display}));
  ok(s.today !== 'none' && s.rot === 'none' && s.line !== 'none', 'the new-fixture screen shows Today and the team approach instead of rotation settings', s);
  await page.fill('#fx-comp', 'County Cup');
  ok(await page.evaluate(() => draftFixture.today === 'strong' && document.querySelector('#todayChips .selected').dataset.today === 'strong'), 'a cup competition pre-selects Today: Strong');
  await page.click('#todayChips [data-today="normal"]');
  await page.fill('#fx-comp', 'Friendly');
  ok(await page.evaluate(() => draftFixture.today === 'normal'), 'once the coach picks Today, the competition no longer changes it');
  // Exceptions: Jack arrives at 10', Leo must start.
  const nameEl = name => page.locator('#availList .avail-row .name', {hasText: name}).first();
  await nameEl('Jack').click(); await page.waitForTimeout(100);
  await page.fill('#exArrive', '10'); await page.click('#exSave'); await page.waitForTimeout(100);
  await nameEl('Leo').click(); await page.waitForTimeout(100);
  await page.click('[data-choice="exStart"] [data-v="start"]'); await page.click('#exSave'); await page.waitForTimeout(100);
  s = await page.evaluate(() => ({ex: draftFixture.exceptions, badges: [...document.querySelectorAll('#availList .ex-badge')].map(b => b.parentElement.firstChild.textContent.trim() + ':' + b.textContent)}));
  ok(s.ex.Jack && s.ex.Jack.arrive === 10 && s.ex.Leo && s.ex.Leo.mustStart, 'exceptions are set from a tap on the name', s.ex);
  ok(s.badges.includes("Jack:from 10'") && s.badges.includes('Leo:starts'), 'and show as badges on the list', s.badges);
  await nameEl('Charlie').click(); await page.waitForTimeout(100);
  await page.fill('#exArrive', '30'); await page.fill('#exLeave', '20'); await page.click('#exSave');
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('exErr')).display !== 'none'), 'leaving before arriving is caught'); await close();
  await page.click('#todayChips [data-today="strong"]');
  await page.click('#generateBtn'); await page.waitForTimeout(600); await close();
  s = await page.evaluate(() => {
    let jackBefore10 = false; for (let t = 0; t < 10; t++) if (Object.values(computeStateAt(t).onPitch).includes('Jack')) jackBefore10 = true;
    return {engine: PLAN.engine, today: matchFixture.today, prio: currentMatchSpec(undefined, 0).priority[0], leoStarts: Object.values(startingLineup).includes('Leo'), jackBefore10, draftReset: draftFixture.today === 'normal' && !Object.keys(draftFixture.exceptions).length};
  });
  ok(s.engine === 'window' && s.today === 'strong' && s.prio === 'strength', 'the match is planned by the new planner on Today: Strong', s);
  ok(s.leoStarts && !s.jackBefore10, 'Leo starts and Jack never plays before he arrives', s);
  ok(s.draftReset, 'Today and exceptions are for that fixture only (the next new fixture starts afresh)');

  console.log('Scorecard strip and Why?');
  s = await page.evaluate(() => ({vis: getComputedStyle(document.getElementById('scoreStrip')).display, text: document.getElementById('scoreStrip').textContent}));
  ok(s.vis !== 'none' && /Minutes \d+'–\d+'/.test(s.text) && /\d+ subs?/.test(s.text), `the plan shows a scorecard strip: "${s.text}"`, s);
  await page.click('#scoreStrip'); await page.waitForTimeout(300);
  s = await page.evaluate(() => { const o = document.querySelector('.modal-overlay'); return {h: [...o.querySelectorAll('h3')].map(h => h.textContent), text: o.textContent}; });
  ok(s.h[0] === 'Rules' && s.h[1] === 'Guarantees' && s.h[2] === 'Strength', 'tapping it opens the breakdown by tier, in the order Today: Strong sets', s.h);
  ok(/Who starts/.test(s.text) && /starts on the bench\. (If \w+ started|They|You)/.test(s.text), 'it says why each bench player starts on the bench');
  await close();
  const r = await page.evaluate(() => { const x = PLAN.rotations.find(y => !y.type && y.reason === 'planned rotation'); return {time: x.time, slot: x.slot, on: x.on, off: x.off}; });
  await page.click('#planSubtabs [data-subtab="details"]'); await page.waitForTimeout(150);
  ok(await page.locator('#timeline .why-link').count() > 0, 'every planned change in the timeline has a "Why?"');
  await page.click(`#timeline .why-link[data-why-time="${r.time}"][data-why-slot="${r.slot}"]`); await page.waitForTimeout(300);
  s = await page.evaluate(() => { const o = document.querySelector('.modal-overlay'); return {h: [...o.querySelectorAll('h3')].map(h => h.textContent), p: [...o.querySelectorAll('p')].map(p => p.textContent)}; });
  ok(s.h.includes(`Why ${r.off} comes off`) && s.h.includes(`Why ${r.on} comes on`), `"Why?" answers why ${r.off} comes off and why ${r.on} comes on`, s.h);
  const offWhy = s.p[s.h.indexOf(`Why ${r.off} comes off`)];
  ok(/^If \w+ came off instead: /.test(offWhy) && (/\d/.test(offWhy) || /either works|your approach/.test(offWhy)), `the reason names the alternative and a number: "${offWhy}"`);
  await close();
  await page.click('#planSubtabs [data-subtab="live"]');

  console.log('Show me another');
  s = await page.evaluate(() => { const before = JSON.stringify(PLAN.windows.map(w => w.onPitch)); showAnotherPlan(); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); return {changed: JSON.stringify(PLAN.windows.map(w => w.onPitch)) !== before, salt: matchFixture.planSalt, engine: PLAN.engine}; });
  ok(s.engine === 'window' && (s.changed || s.salt), '"Show me another" gives a different plan (or says this one is clearly best)', s);

  console.log('Live: Why? on the due change and on any player');
  await page.click('#startMatchBtn'); await page.waitForTimeout(200);
  await page.evaluate(() => { clearInterval(liveTicker); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); });
  const first = await page.evaluate(() => { const x = PLAN.rotations.filter(y => !y.type).sort((a, b) => a.time - b.time)[0]; return {time: x.time, slot: x.slot, off: x.off}; });
  await page.evaluate(m => { matchStartTs = Date.now() - m * 60000; pausedAccumMs = 0; pauseStartedAt = null; openSubsPopup(); }, first.time);
  ok(await page.locator('.modal-overlay .action-panel .why-link').count() > 0, 'the due change in the Substitutions popup has a "Why?"');
  await page.locator('.modal-overlay .action-panel .why-link').first().click(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => /comes off|Keeper change|cover/.test(document.querySelector('.modal-overlay').textContent)), 'and it opens the reasons');
  await close();
  await page.evaluate(pid => openPlayerActionMenu(pid, null), (await page.evaluate(() => PLAYERS.find(p => !Object.values(displayStateAt(liveElapsedMinute()).onPitch).includes(p.id)).id)));
  const whyRow = page.locator('.modal-overlay .picker-opt', {hasText: 'Why?'});
  ok(await whyRow.count() === 1, 'tapping a player offers "Why?"');
  await whyRow.click(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !!document.querySelector('.modal-overlay .why-sheet h3')), 'which explains how the plan uses them');
  await close();

  console.log('Details › Settings with the new planner');
  await page.click('#planSubtabs [data-subtab="details"]'); await page.click('#detailsSubtabs [data-dtab="settings"]'); await page.waitForTimeout(150);
  ok(await page.locator('[data-choice="stToday"]').count() === 1 && await page.locator('#stFair').count() === 0, 'the match settings show Today and help level instead of the old sliders');
  const from = await page.evaluate(() => settingsFromMinute());
  await page.click('[data-choice="stToday"] [data-v="development"]'); await page.waitForTimeout(400);
  s = await page.evaluate(() => matchFixture.todayEras);
  ok(s && s.some(e => e.today === 'development' && e.from === from), `changing Today mid-match applies from ${from}' on`, s);

  console.log('With the new planner off, nothing changes');
  const p2 = await openPage(browser, errors);
  page = p2;
  await newMatch(page);
  s = await page.evaluate(() => ({engine: PLAN.engine || 'classic', strip: getComputedStyle(document.getElementById('scoreStrip')).display, why: document.querySelectorAll('#timeline .why-link').length}));
  ok(s.engine === 'classic' && s.strip === 'none' && s.why === 0, 'a team that hasn\'t switched keeps the current planner and screens', s);

  summary('phase6_ux', errors);
  await browser.close();
})();
