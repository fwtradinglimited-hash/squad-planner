// Beta launch, part 2: the sign-up page and opt-in usage counts.
//  - co-coach.uk/beta: checks the form, sends the sign-up with the coach's
//    choices recorded (news emails only if ticked), shows what to do next.
//  - Usage counts are off until the coach says yes; when on, only fixed event
//    names are sent (never names, teams or anything typed); turning off stops them.
//  - The offline copy doesn't hijack the beta page.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http');
const { launch, openPage, newMatch, ok, summary } = require('./_harness');
const ROOT = path.resolve(__dirname, '..');
const BETA = 'file://' + path.join(ROOT, 'beta', 'index.html');
const FB = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]';

// Records every count the app would send, instead of loading GoatCounter.
async function statsPage(browser, errors) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('rf_profile_v1') && !localStorage.getItem('rf_matches_v1')) localStorage.setItem('rf_matches_v1', '[]'); } catch (e) {}
    window.__sent = []; window.goatcounter = { count: v => window.__sent.push(v) };
  });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  return page;
}
const sent = page => page.evaluate(() => window.__sent.map(v => v.path));

(async () => {
  const { browser, errors } = await launch();

  console.log('Usage counts: off until the coach says yes');
  let page = await statsPage(browser, errors);
  ok(await page.evaluate(() => !document.getElementById('statsCard') && !!document.getElementById('fbCard')), 'one question at a time: the privacy notice comes first');
  await page.click('#fbNoticeOk');
  let s = await page.evaluate(() => ({ on: statsOn(), card: !!document.getElementById('statsCard'), text: (document.getElementById('statsCard') || {}).textContent || '' }));
  ok(!s.on && s.card, 'off by default, and Home asks "Help improve Co-Coach?"');
  ok(/Never names, teams, opponents, scores, notes/.test(s.text) && /turn it off any time/.test(s.text), 'the card says exactly what is and isn\'t shared, and how to turn it off');
  await newMatch(page);
  ok((await sent(page)).length === 0, 'nothing is sent before the coach agrees');
  await page.evaluate(() => showScreen('home'));
  await page.click('#statsNo');
  s = await page.evaluate(() => ({ stats: profile.stats, card: !!document.getElementById('statsCard') }));
  ok(s.stats && s.stats.on === false && !s.card, '"No thanks" is remembered and the card goes away');
  ok((await sent(page)).length === 0, 'and still nothing is sent');

  console.log('Turning it on in Privacy & data');
  await page.click('#teamTitle'); await page.click('#tmPrivacy');
  ok(/Anonymous usage counts: off/.test(await page.textContent('.modal-overlay')), 'Privacy & data shows the setting');
  await page.click('#pvStatsToggle');
  ok(/Anonymous usage counts: on/.test(await page.textContent('.modal-overlay')), 'and turns it on');
  await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(e => e.remove()));
  ok((await sent(page)).includes('stats-on') && (await sent(page)).includes('app-opened/browser'), 'turning on sends "stats on" and "app opened"');

  await newMatch(page);
  await page.click('#startMatchBtn'); await page.waitForTimeout(150);
  await page.evaluate(() => { clearInterval(liveTicker); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); });
  await page.evaluate(() => { recordGoal(PLAN.windows[0].onPitch[SLOTS[1].id], 3); openScorecardSheet(); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); openWhyForRotation(PLAN.rotations[0].time, PLAN.rotations[0].slot); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); finishMatch(50); });
  s = await sent(page);
  ok(['match-planned/planner', 'match-format/7-a-side-50min-2-periods', 'match-started', 'live-goal', 'scorecard-opened', 'why-opened', 'match-finished/full-time'].every(p => s.includes(p)), 'a planned, played and finished match is counted, with its format', s);
  const all = await page.evaluate(() => window.__sent);
  const names = await page.evaluate(() => [...squad.map(p => p.id), activeTeam().name].map(x => String(x).toLowerCase()));
  const leaks = all.filter(v => names.some(n => n.length > 1 && (v.path + ' ' + v.title).toLowerCase().includes(n)));
  ok(!leaks.length, `no player or team name ever appears in what's sent (${all.length} counts checked)`, leaks);
  ok(all.every(v => /^[a-z-]+(\/[a-z0-9-]+)?$/.test(v.path) && v.event === true), 'every count is a fixed event name plus at most one fixed detail');
  const known = await page.evaluate(() => Object.keys(statEvents()));
  ok(all.every(v => known.includes(v.path.split('/')[0])), 'and only events from the published list are sent');

  await page.evaluate(() => openPrivacyModal()); await page.click('#pvStatsToggle');
  await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(e => e.remove()));
  const before = (await sent(page)).length;
  await page.evaluate(() => { showScreen('home'); openScorecardSheet(); openFeedbackModal(); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); track('match-started'); });
  ok((await sent(page)).length === before && await page.evaluate(() => !statsOn()), 'turning it off stops all counts');

  console.log('Choosing at set-up');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p2 = await ctx.newPage(); p2.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    await p2.addInitScript(() => { window.__sent = []; window.goatcounter = { count: v => window.__sent.push(v) }; });
    await p2.goto('file://' + path.join(ROOT, 'index.html'));
    ok(await p2.locator('#wzStats').count() === 1 && !(await p2.isChecked('#wzStats')), 'set-up offers usage counts as an optional, unticked box');
    await p2.fill('#wzTeam', 'Test FC'); await p2.check('#wzConsent'); await p2.check('#wzStats'); await p2.click('#wizNext'); await p2.waitForTimeout(150);
    ok(await p2.evaluate(() => statsOn()), 'ticking it turns counts on');
    await ctx.close();
  }

  console.log('Loading the counter only after consent');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const held = []; await ctx.route('https://gc.zgo.at/**', r => { held.push(r); }); // left hanging, so the tag stays
    const p3 = await ctx.newPage();
    await p3.addInitScript(() => { if (!localStorage.getItem('rf_profile_v1')) localStorage.setItem('rf_matches_v1', '[]'); });
    await p3.goto('file://' + path.join(ROOT, 'index.html'));
    ok(await p3.locator('script[src*="gc.zgo.at"]').count() === 0, 'GoatCounter isn\'t even loaded while counts are off');
    await p3.evaluate(() => setStats(true)); await p3.waitForTimeout(100);
    s = await p3.evaluate(() => { const sc = document.querySelector('script[src*="gc.zgo.at"]'); return sc ? sc.dataset.goatcounter : null; });
    ok(s === 'https://co-coach.goatcounter.com/count', 'once on, it loads and sends to the Co-Coach account', s);
    for (const r of held) await r.abort().catch(() => {});
    await ctx.close();
  }

  console.log('Privacy notice for the new policy');
  page = await openPage(browser, errors);
  await page.evaluate(() => { fbState().noticeSeen = '2026-10-12'; saveProfile(); renderHome(); });
  s = await page.evaluate(() => (document.getElementById('fbCard') || {}).textContent || '');
  ok(/Anonymous usage counts are off unless you turn them on/.test(s), 'coaches who saw the old policy get the privacy notice again, mentioning usage counts');

  console.log('Team menu link');
  await page.click('#teamTitle');
  ok(await page.locator('#tmBeta').getAttribute('href') === 'beta/#join', 'the team menu links to the beta sign-up');
  await page.evaluate(() => { document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); localStorage.setItem('cc_beta', '{}'); });
  await page.click('#teamTitle');
  ok(await page.locator('#tmBeta').count() === 0, '...until the coach has signed up');
  await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(e => e.remove()));

  console.log('Beta sign-up page');
  const bctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let posts = [], reply = { status: 200, body: '{"success":true}' };
  await bctx.route('https://api.web3forms.com/**', r => { posts.push(JSON.parse(r.request().postData())); r.fulfill({ status: reply.status, contentType: 'application/json', body: reply.body }); });
  let bp = await bctx.newPage(); bp.on('pageerror', e => errors.push('PAGEERROR beta ' + e.message));
  await bp.goto(BETA);
  ok(await bp.locator('#rows .row').count() === 9, 'the page opens with the example minutes board');
  const err = () => bp.textContent('#formErr');
  await bp.click('#joinBtn');
  ok(/first name/.test(await err()) && posts.length === 0, 'an empty form says what to fill in, and sends nothing');
  await bp.fill('#fName', 'Sam'); await bp.fill('#fEmail', 'sam@'); await bp.click('#joinBtn');
  ok(/email address/.test(await err()), 'a bad email is caught');
  await bp.fill('#fEmail', 'sam@example.com'); await bp.selectOption('#fAge', 'U9–U10'); await bp.selectOption('#fFormat', '7-a-side'); await bp.click('#joinBtn');
  ok(/18 or over/.test(await err()) && posts.length === 0, 'the 18+ box is required');
  ok(!(await bp.isChecked('#fNews')), 'the news box starts unticked');
  await bp.check('#fAdult');
  reply = { status: 500, body: '{"success":false}' };
  await bp.click('#joinBtn'); await bp.waitForTimeout(200);
  ok(/didn't go through/.test(await err()) && !(await bp.isDisabled('#joinBtn')) && !/ryanfoo/.test(await err()), 'if sending fails, it says so and the button works again (no personal email shown)');
  reply = { status: 200, body: '{"success":true}' }; posts = [];
  await bp.click('#joinBtn'); await bp.waitForTimeout(200);
  s = posts[0] || {};
  ok(s.email === 'sam@example.com' && /U9–U10, 7-a-side/.test(s.subject) && /News and launch emails: no/.test(s.message) && /privacy policy version 2026-10-16/.test(s.message) && s.botcheck === '',
    'the sign-up arrives with the details, "news: no" and when and to which policy they agreed', s.subject);
  s = await bp.evaluate(() => ({ title: document.getElementById('doneTitle').textContent, open: document.querySelector('#done .open').getAttribute('href'), saved: JSON.parse(localStorage.getItem('cc_beta')), inapp: getComputedStyle(document.getElementById('inapp')).display }));
  ok(s.title === "You're in, Sam" && s.open === '../' && s.saved && s.saved.news === false && s.inapp === 'none', 'then "You\'re in, Sam" with a button to open Co-Coach', s);
  await bp.close();

  bp = await bctx.newPage(); posts = [];
  await bp.goto(BETA);
  ok(/already signed up on this phone/.test(await bp.textContent('#joinForm')), 'coming back later, the page says you\'ve already signed up');
  await bp.fill('#fName', 'Jo'); await bp.fill('#fEmail', 'jo@example.com'); await bp.selectOption('#fAge', 'U13–U14'); await bp.selectOption('#fFormat', '11-a-side'); await bp.check('#fAdult'); await bp.check('#fNews');
  await bp.click('#joinBtn'); await bp.waitForTimeout(200);
  ok(posts.length === 1 && /News and launch emails: YES/.test(posts[0].message) && /\[news: yes\]/.test(posts[0].subject), 'ticking news is recorded clearly, in the subject line too');
  await bp.close();

  bp = await bctx.newPage(); posts = [];
  await bp.goto(BETA);
  await bp.fill('#fName', 'Bot'); await bp.fill('#fEmail', 'bot@example.com'); await bp.selectOption('#fAge', 'Adults'); await bp.selectOption('#fFormat', '11-a-side'); await bp.check('#fAdult');
  await bp.evaluate(() => { document.getElementById('fBot').checked = true; });
  await bp.click('#joinBtn'); await bp.waitForTimeout(150);
  ok(posts.length === 0, 'spam bots that tick the hidden box are dropped');
  s = await bp.evaluate(() => { BETA_MODE = 'waitlist'; showDone('Al'); return { t: document.getElementById('doneTitle').textContent, open: getComputedStyle(document.querySelector('#done .open')).display }; });
  ok(s.t === "You're on the list" && s.open === 'none', 'waiting-list mode (for when a wave is full) confirms a place on the list instead');
  await bctx.close();

  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: FB, isMobile: true });
    await ctx.route('https://api.web3forms.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }));
    const p4 = await ctx.newPage(); await p4.goto(BETA);
    await p4.fill('#fName', 'Sam'); await p4.fill('#fEmail', 'sam@example.com'); await p4.selectOption('#fAge', 'U7–U8'); await p4.selectOption('#fFormat', '5-a-side or smaller'); await p4.check('#fAdult');
    await p4.click('#joinBtn'); await p4.waitForTimeout(200);
    ok(/inside Facebook/.test(await p4.textContent('#inapp')) && await p4.isVisible('#inapp'), 'signed up inside Facebook: it explains how to open Co-Coach in the browser first');
    await ctx.close();
  }

  console.log('The offline copy leaves the beta page alone');
  const types = { html: 'text/html', js: 'text/javascript', webmanifest: 'application/manifest+json', png: 'image/png' };
  const server = http.createServer((req, res) => {
    let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html';
    const p = path.join(ROOT, f);
    if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[p.split('.').pop()] || 'application/octet-stream' }); res.end(fs.readFileSync(p));
  }).listen(0);
  const URL = `http://localhost:${server.address().port}/`;
  const sctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const sp = await sctx.newPage();
  await sp.goto(URL);
  await sp.evaluate(async () => { await navigator.serviceWorker.ready; for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 100)); });
  await sp.goto(URL + 'beta/');
  ok(/assistant coach for match day/.test(await sp.textContent('h1')), 'with the app installed for offline use, co-coach.uk/beta still shows the sign-up page');
  await sctx.setOffline(true);
  await sp.goto(URL + 'beta/').catch(() => {});
  ok(/assistant coach/.test(await sp.textContent('h1').catch(() => '')), 'with no signal, a page already visited still opens');
  await new Promise(r => { server.close(r); server.closeAllConnections(); }); // really no network now, for the offline copy too
  await sp.goto(URL + 'some-new-page/').catch(() => {});
  ok(await sp.locator('#teamTitle').count() === 1, 'and a page never visited opens the app rather than an error');

  summary('phase10_beta', errors);
  await browser.close();
})();
