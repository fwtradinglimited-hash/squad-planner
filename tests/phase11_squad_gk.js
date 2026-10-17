// Coach feedback before the beta:
//  - Adding players: a row per player with name, number, position and goal,
//    instead of one text box (in set-up and from the Squad tab).
//  - Home's minutes and fair-minutes check follow the team approach on whether
//    time in goal counts as playing time.
//  - Goalkeeper plan: same keeper or rotate by period; the planner picks the
//    keepers unless the coach chooses to pick them.
const { launch, openPage, newMatch, ok, summary, pasteNames } = require('./_harness');
const path = require('path');

(async () => {
  const { browser, errors } = await launch();

  console.log('Adding players, one row each');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let page = await ctx.newPage(); page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.fill('#wzTeam', 'Rows FC'); await page.check('#wzConsent'); await page.click('#wizNext');
  await page.click('#wizNext'); // keep the default format
  ok(/Your squad/.test(await page.textContent('.wiz-hero')) && await page.locator('#wzNames').count() === 0, 'the squad step has no big text box');
  const heads = await page.$$eval('.sq-table .sq-h', h => h.map(x => x.textContent));
  ok(heads.join('|') === 'Name|No.|Best at|In goal', 'it has columns for name, number, position and goal', heads);
  const nw = f => `.sq-new [data-f="${f}"]`;
  await page.fill(nw('name'), 'Oliver'); await page.fill(nw('num'), '7'); await page.selectOption(nw('pos'), 'DEF'); await page.selectOption(nw('goal'), '3');
  await page.press(nw('name'), 'Enter');
  let s = await page.evaluate(() => { const p = squad.find(x => x.id === 'Oliver'); return { p: p && {...p, kind: posKind(p)}, focus: document.activeElement.closest('.sq-new') !== null }; });
  ok(s.p && s.p.number === 7 && s.p.kind === 'DEF' && s.p.goal === 3 && s.p.gk, 'typing a row adds the player with their number, position and goalkeeping', s.p);
  ok(s.focus, 'and the cursor moves to a fresh row for the next player');
  await page.fill(nw('name'), 'Ruby'); await page.fill(nw('num'), '4'); await page.click('#wzCount');
  ok(await page.evaluate(() => (squad.find(x => x.id === 'Ruby') || {}).number === 4), 'leaving a row also adds the player');
  await pasteNames(page, '9 Ben\nCal\nDan 4\n\nOliver');
  s = await page.evaluate(() => squad.map(p => p.id + (p.number ? '#' + p.number : '')));
  ok(s.join(',') === 'Oliver#7,Ruby#4,Ben#9,Cal,Dan#4', 'pasting a list adds everyone, reading numbers either side and skipping duplicates', s);
  await page.fill(nw('name'), 'cal'); await page.click('#wzCount');
  ok(/already a cal/.test(await page.textContent('.sq-table')) && await page.evaluate(() => squad.length === 5), 'a duplicate name is explained, not added');
  await page.fill(nw('name'), '');
  await page.selectOption('.sq-row[data-row="3"] [data-f="pos"]', 'ATT');
  await page.fill('.sq-row[data-row="2"] [data-f="name"]', 'Benny'); await page.press('.sq-row[data-row="2"] [data-f="name"]', 'Enter');
  s = await page.evaluate(() => ({ cal: posKind(squad.find(x => x.id === 'Cal')), benny: !!squad.find(x => x.id === 'Benny'), ben: !!squad.find(x => x.id === 'Ben') }));
  ok(s.cal === 'ATT' && s.benny && !s.ben, 'changing a row updates that player in place (position, rename)', s);
  await page.fill('.sq-row[data-row="4"] [data-f="name"]', 'Dan Smith'); await page.press('.sq-row[data-row="4"] [data-f="name"]', 'Enter');
  ok(/Looks like a full name/.test(await page.textContent('.sq-table')), 'a full name is flagged on its row');
  await page.click('#wizNext');
  ok(/at least 7/.test(await page.textContent('#wizErr')), 'Next still checks there are enough players');
  await pasteNames(page, 'Eli\nFinn');
  await page.click('.sq-row[data-row="1"] .sq-rm');
  ok(await page.evaluate(() => !squad.some(x => x.id === 'Ruby') && squad.length === 6), 'the ✕ removes a player');
  await pasteNames(page, 'Gus\nHal');
  await page.click('#wizNext'); await page.waitForTimeout(100);
  ok(/Dan Smith/.test(await page.textContent('.modal-msg')), 'continuing with a full name asks first');
  await page.click('#modalConfirm');
  ok(/How you run your team/.test(await page.textContent('.wiz-hero')), 'then set-up carries on');
  await ctx.close();

  console.log('Editing the squad as a list later');
  page = await openPage(browser, errors);
  await page.click('[data-tab="squad"]'); await page.click('#editSquadBtn');
  const n0 = await page.evaluate(() => squad.length);
  await page.fill('.modal-overlay .sq-row[data-row="0"] [data-f="num"]', '12'); await page.press('.modal-overlay .sq-row[data-row="0"] [data-f="num"]', 'Tab');
  await page.fill('.modal-overlay .sq-new [data-f="name"]', 'Zed'); await page.click('#sqEditDone');
  s = await page.evaluate(() => ({ n: squad.length, num: squad[0].number, listed: [...document.querySelectorAll('#squadList .name')].some(e => /Zed/.test(e.textContent)) }));
  ok(s.n === n0 + 1 && s.num === 12 && s.listed, 'the Squad tab\'s "Edit squad as a list" edits and adds players the same way', s);

  console.log('Fair minutes and time in goal');
  page = await openPage(browser, errors);
  for (let k = 0; k < 2; k++) {
    await newMatch(page);
    await page.click('#startMatchBtn'); await page.waitForTimeout(100);
    await page.evaluate(() => { clearInterval(liveTicker); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); finishMatch(DURATION); showScreen('home'); });
  }
  const homeMins = () => page.evaluate(() => {
    const a = Object.values(aggregateStats().players).find(x => x.gk > 0);
    const row = document.querySelector(`#homeMinutes .home-row[data-pid="${a.id}"]`);
    return { id: a.id, mins: a.mins, gk: a.gk, shown: row.querySelector('b[style*="44px"]').textContent, extra: row.textContent, note: document.getElementById('homeMinutes').textContent, fair: (document.getElementById('homeFairNudge') || {}).textContent || '' };
  });
  await page.evaluate(() => { teamEthos.keepers.timeCounts = false; saveEthos(); renderHome(); });
  s = await homeMins();
  ok(s.shown === `${s.mins - s.gk}'` && new RegExp(`\\+${s.gk}' in goal`).test(s.extra), `when time in goal doesn't count, ${s.id} shows ${s.mins - s.gk}' played, plus ${s.gk}' in goal`, s);
  ok(/Time in goal isn't counted/.test(s.note), 'and the card says why');
  s = await page.evaluate(() => {
    const a = Object.values(aggregateStats().players).find(x => x.gk > 0); const f = fairMinutes(a);
    return { fm: f, raw: { m: a.mins, av: a.availMins }, gk: a.gk };
  });
  ok(s.fm.m === s.raw.m - s.gk && s.fm.av === s.raw.av - s.gk, 'the fair-minutes check leaves time in goal out of minutes played and available, as the planner does');
  await page.evaluate(() => { teamEthos.keepers.timeCounts = true; saveEthos(); renderHome(); });
  s = await homeMins();
  ok(s.shown === `${s.mins}'` && !/in goal<\/span>/.test(s.extra) && /Time in goal counts/.test(s.note), 'when the approach counts time in goal, it is included', s);
  await page.evaluate(() => { teamEthos.keepers.timeCounts = false; saveEthos(); openPlayerProfile(Object.values(aggregateStats().players).find(x => x.gk > 0).id); });
  ok(/Outfield minutes/.test(await page.textContent('body')) && /in goal, which isn't counted/.test(await page.textContent('body')), 'the player profile follows the same rule');

  console.log('Goalkeeper plan');
  page = await openPage(browser, errors);
  await page.click('[data-tab="matches"]'); await page.click('#newFixtureBtn');
  if (await page.locator('#modalConfirm').count()) await page.click('#modalConfirm');
  await page.click('#changeFormatLink'); await page.click('#confirmFormatBtn');
  s = await page.evaluate(() => ({ modes: [...document.querySelectorAll('#gkModeRow .radio-opt')].map(o => o.textContent), mine: document.getElementById('gkAutoCheckbox').checked, label: document.getElementById('gkAutoLabel').textContent, pickers: document.querySelectorAll('#gkPickers select').length, note: document.getElementById('gkPickers').textContent }));
  ok(s.modes.join('|') === 'Same keeper all game|Rotate by period', 'two choices: same keeper all game, or rotate by period', s.modes);
  ok(!s.mine && s.pickers === 0 && /planner picks/.test(s.note), 'the planner picks the keepers; the coach isn\'t asked to', s);
  ok(/I'll choose the keepers myself/.test(s.label), 'choosing your own keepers is a separate option', s.label);
  await page.click('#gkModeRow [data-mode="single"]');
  ok(/I'll choose the keeper myself/.test(await page.textContent('#gkAutoLabel')) && /stay in goal all match/.test(await page.textContent('#gkPickers')), 'same keeper all game: the planner picks one keeper for the match');
  await page.click('#gkModeRow [data-mode="rotate"]');
  await page.check('#gkAutoCheckbox');
  s = await page.evaluate(() => [...document.querySelectorAll('#gkPickers select')].map(x => x.id));
  ok(s.length === 2 && s[0] === 'gk-period-0', 'ticking it shows a keeper choice for each period', s);
  const want = await page.evaluate(() => { const el = document.getElementById('gk-period-0'); const v = [...el.options].map(o => o.value).reverse()[0]; el.value = v; el.dispatchEvent(new Event('change')); return v; });
  await page.click('#generateBtn'); await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(e => e.remove()));
  ok(await page.evaluate(() => computeStateAt(0).onPitch.GK) === want, `the coach's own keeper choice is used (${want} in goal first)`);

  summary('phase11_squad_gk', errors);
  await browser.close();
})();
