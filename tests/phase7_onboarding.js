// Phase 7: onboarding. Team, formats and squad first, then the questionnaire
// sets everything up (each setting with its reason), a review, and the tour
// that calls out what was set. Gate: a new coach goes from registering to a
// configured team and a completed tour; every pre-set setting shows its
// reason; skipping the questions gives the Balanced preset.
const path = require('path');
const { launch, ok, summary } = require('./_harness');
const APP = 'file://' + path.resolve(__dirname, '..', 'index.html');

async function freshCoach(browser, errors) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|net::/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
  await page.goto(APP);
  return page;
}
// Picks answers by question id; anything not listed keeps its default.
async function answerAll(page, answers) {
  const seen = [];
  for (let i = 0; i < 8; i++) {
    if (!/How you run your team/.test(await page.textContent('.wiz-hero'))) break;
    for (let pass = 0; pass < 3; pass++) {
      const qs = await page.$$eval('.q-opts', els => els.map(e => e.dataset.q));
      let clicked = false;
      for (const q of qs) {
        if (!seen.includes(q)) seen.push(q);
        const want = answers[q];
        const sel = await page.evaluate(q => { const e = document.querySelector(`.q-opts[data-q="${q}"] .q-opt.selected`); return e ? e.dataset.v : null; }, q);
        if (want && sel !== want) { await page.click(`.q-opts[data-q="${q}"] .q-opt[data-v="${want}"]`); clicked = true; break; }
        if (!want && !sel) { await page.locator(`.q-opts[data-q="${q}"] .q-opt`).first().click(); clicked = true; break; }
      }
      if (!clicked) break;
    }
    await page.click('#wizNext'); await page.waitForTimeout(60);
  }
  return seen;
}

(async () => {
  const { browser, errors } = await launch();

  console.log('A new coach: team, formats and squad first');
  let page = await freshCoach(browser, errors);
  ok(await page.locator('#screen-onboard.active').count() === 1, 'a new coach starts in onboarding');
  await page.fill('#wzCoach', 'Sam'); await page.fill('#wzTeam', 'Oakfield U9s'); await page.check('#wzConsent'); await page.click('#wizNext');
  await page.click('#wzAddFormat'); await page.selectOption('#ofP', '9'); await page.selectOption('#ofD', '60'); await page.click('#ofSave');
  ok(await page.locator('[data-wzfmt-del]').count() === 1, 'more than one format can be added (7v7, and 9v9 for cups)');
  await page.click('#wizNext');
  await page.fill('#wzNames', 'Alex\nBen\nCal\nDan\nEli\nFinn\nGus\nHal\nIvo\nJay'); await page.click('#wzAdd');
  await page.check('[data-gk="0"]'); await page.check('[data-gk="1"]'); await page.click('#wizNext');
  ok(/How you run your team/.test(await page.textContent('.wiz-hero')), 'then the questionnaire');

  console.log('The questionnaire');
  const answers = {minutes: 'fairStrong', season: 'yes', league: '50', strength: 'key', levels: 'yes', units: 'avoid', positions: 'rotate', changes: 'often',
    timing: 'interval', interval: '10', timingRule: 'rule', unitChanges: 'avoid', gkPlan: 'one', gkTime: 'yes', gkShort: 'outfield', help: 'full', first: 'minutes', pairs: 'no'};
  const pages = await page.evaluate(() => qPages({}).length);
  const seen = await answerAll(page, answers);
  ok(pages === 5 && seen.length >= 15, `${seen.length} plain-language questions over ${pages} pages`, seen);
  ok(['interval', 'timingRule', 'units'].every(q => seen.includes(q)), 'follow-up questions appear when an answer needs them');
  ok(/Your team's setup/.test(await page.textContent('.wiz-hero')), 'then a review of the setup');
  let s = await page.evaluate(() => ({e: teamEthos, spec: compileSpec({ethos: teamEthos, duration: 50, periodBounds: [0, 25, 50], players: squad, subTimingCfg: teamEthos.timing}), gk: matchDefaults.gkMode, rot: rotations.defaultId}));
  const e = s.e, sp = s.spec;
  ok(e.preset === 'competitive', '"Fair, but stronger players play noticeably more" → Competitive', e.preset);
  ok(e.sliders.season === 70 && e.sliders.positions === 70 && e.sliders.changes === 75 && e.sliders.strength === undefined, 'answers that differ from Competitive become slider settings (season, positions, changes); the rest stay with the preset', e.sliders);
  ok(sp.strength.mode === 'keyMoments' && e.rules.leagueMinPct === 50 && e.rules.unitFloor === 'soft' && e.rules.oneChangePerUnit === 'soft', 'strength at key moments, a 50% league minimum, all-Developing units avoided, one change per unit discouraged', {mode: sp.strength.mode, rules: e.rules});
  ok(e.timing.mode === 'interval' && e.timing.interval === 10 && e.subTiming === 'strict', 'changes every 10\', as a rule', {timing: e.timing, strict: e.subTiming});
  ok(e.keepers.timeCounts === true && e.keepers.shortage === 'outfieldInGoal' && s.gk === 'single', 'keepers: time counts, an outfield player may go in, one keeper all match', {k: e.keepers, gk: s.gk});
  ok(e.live.replan === 'full' && sp.priority[0] === 'minutes', 'full re-planning during matches, and fair minutes first', {replan: e.live.replan, prio: sp.priority});
  ok(s.rot === 'bal', 'the current planner\'s rotation style follows the answers too', s.rot);
  s = await page.evaluate(() => ({lines: [...document.querySelectorAll('.review-row')].map(r => r.textContent.replace(/\s+/g, ' ')), keys: Object.keys(teamEthos.setFor)}));
  const settingRows = s.lines.filter(l => !/^ ?Formats|Player levels/.test(l));
  ok(settingRows.length >= 12 && settingRows.every(l => /Set for you .*because you said "/.test(l)), `every one of the ${settingRows.length} settings shows "Set for you" and the reason`, settingRows.filter(l => !/Set for you/.test(l)));
  ok(await page.isChecked('#rvEngine'), 'the new planner is on for a newly set-up team (it can be turned off here)');
  // Levels: one tap each.
  await page.click('[data-lvl-i="0"] [data-v="8"]'); await page.click('[data-lvl-i="2"] [data-v="2"]');
  ok(await page.evaluate(() => squad[0].level === 8 && squad[2].level === 2), 'levels can be given right here with one tap each');
  // Change one answer from the review.
  await page.locator('.review-row', {hasText: 'Help during a match'}).locator('[data-qpage]').click();
  ok(await page.locator('.q-opts[data-q="help"]').count() === 1, '"Change" goes back to the right question');
  await page.click('.q-opts[data-q="help"] [data-v="next"]');
  await page.click('#wizNext'); await page.waitForTimeout(60);
  ok(await page.evaluate(() => teamEthos.live.replan === 'nextStable' && /Re-plan, but keep/.test(teamEthos.setFor['live.replan'])), 'and the setting and its reason update');
  await page.click('#wizNext'); // review -> awards
  await page.click('#wizNext'); // awards -> lineup
  await page.click('#wizNext'); // lineup (skip) -> done
  ok(/is ready/.test(await page.textContent('.wiz-hero')) && /Competitive approach/.test(await page.textContent('#wizBody')), 'the finish page sums it up');

  console.log('The tour calls out what was set');
  await page.click('#wizFinish'); await page.waitForTimeout(200);
  const steps = await page.evaluate(() => tourSteps.map(st => ({title: st.title, sel: st.sel || '', setFor: st.setFor ? st.setFor() : []})));
  const ap = steps.find(st => st.sel === '#secApproach');
  ok(!!ap && ap.setFor.length >= 10 && ap.setFor.every(x => /because you said/.test(x)), `the tour has a Team approach stop listing ${ap ? ap.setFor.length : 0} settings set for you, each with why`);
  ok(steps.some(st => st.sel === '#secToday') && !steps.some(st => st.sel === '#rotPresetSection' || st.sel === '#secRotations'), 'and shows the new planner\'s screens (Today) instead of rotation settings');
  ok(steps.some(st => st.setFor.some(x => /Keeper plan/.test(x))) && steps.some(st => st.setFor.some(x => /Help during a match/.test(x))), 'keeper plan and match-day help are called out where they apply');
  // Walk the whole tour.
  let n = 0;
  while (await page.locator('#tourNext').count() && n < 40) {
    const txt = await page.textContent('#tourCard');
    if (/Team approach/.test(txt)) ok(/Set up from your answers/.test(txt) && /because you said/.test(txt), 'on the Team approach stop the card shows "Set up from your answers"');
    await page.click('#tourNext'); await page.waitForTimeout(60); n++;
  }
  ok(n === steps.length && await page.evaluate(() => profile.tourDone === true), `the tour runs to the end (${n} stops)`);
  await page.click('[data-tab="squad"]');
  s = await page.evaluate(() => [...document.querySelectorAll('#approachBody .set-note')].length);
  ok(s >= 3, 'in Squad › Team approach the settings keep their "Set for you" note', s);
  await page.click('#apFineToggle');
  await page.evaluate(() => { const r = document.querySelector('[data-slider="changes"]'); r.value = 50; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); });
  ok(await page.evaluate(() => !teamEthos.setFor['sliders.changes'] && !!teamEthos.setFor['sliders.positions']), 'changing a setting yourself removes its "Set for you" note (others keep theirs)');

  console.log('New fixtures use the formats and keeper plan');
  await page.click('[data-tab="matches"]'); await page.click('#newFixtureBtn'); await page.waitForTimeout(150);
  s = await page.evaluate(() => ({chips: [...document.querySelectorAll('#formatChips .radio-opt')].map(c => c.textContent), sel: (document.querySelector('#formatChips .selected') || {}).textContent, gk: gkMode}));
  ok(s.chips.length === 2 && /7v7/.test(s.sel) && s.gk === 'single', 'a fixture offers both formats (main one selected) and uses one keeper all match', s);
  await page.click('#formatChips [data-fmt="1"]'); await page.waitForTimeout(150);
  ok(/^9v9 · 60'/.test(await page.textContent('#formatSummaryLine')), 'one tap switches the fixture to 9v9');

  console.log('Skipping the questions');
  let p2 = await freshCoach(browser, errors);
  await p2.fill('#wzTeam', 'Skippers'); await p2.check('#wzConsent'); await p2.click('#wizNext'); await p2.click('#wizNext');
  await p2.fill('#wzNames', 'A1\nA2\nA3\nA4\nA5\nA6\nA7\nA8'); await p2.click('#wzAdd'); await p2.check('[data-gk="0"]'); await p2.click('#wizNext');
  await p2.click('#qSkip'); await p2.waitForTimeout(60);
  s = await p2.evaluate(() => ({preset: teamEthos.preset, setFor: Object.keys(teamEthos.setFor).length, sliders: Object.keys(teamEthos.sliders).length, text: document.getElementById('wizBody').textContent}));
  ok(s.preset === 'balanced' && s.setFor === 0 && s.sliders === 0 && /skipped the questions/.test(s.text), 'a coach who skips gets the Balanced preset, said plainly', s.preset);

  console.log('A second team under the same coach');
  await page.click('#teamTitle'); await page.click('#tmAdd'); await page.waitForTimeout(400);
  await page.fill('#wzTeam', 'Oakfield U11s'); await page.check('#wzConsent'); await page.click('#wizNext'); await page.click('#wizNext');
  await page.fill('#wzNames', 'Z1\nZ2\nZ3\nZ4\nZ5\nZ6\nZ7\nZ8'); await page.click('#wzAdd'); await page.check('[data-gk="0"]'); await page.click('#wizNext');
  ok(await page.locator('#qSame').count() === 1 && /Oakfield U9s/.test(await page.textContent('#wizBody')), 'the questionnaire offers "Same approach as Oakfield U9s?"');
  await page.click('#qSame'); await page.waitForTimeout(60);
  s = await page.evaluate(() => ({hero: document.querySelector('.wiz-hero').textContent, preset: teamEthos.preset, help: teamEthos.live.replan, reason: teamEthos.setFor.preset}));
  ok(/Your team's setup/.test(s.hero) && s.preset === 'competitive' && s.help === 'nextStable' && /because you said/.test(s.reason), 'one tap copies the answers (and their reasons), ready to confirm or change', s);

  summary('phase7_onboarding', errors);
  await browser.close();
})();
