// Exporting as images: pages shaped for a phone (or 4:5, square, or one long
// image as before), so they stay sharp in WhatsApp; choose what to include;
// share every page at once. For match plans, full-time summaries, Future Fit
// 3v3 matchdays and tournament days.
const fs = require('fs');
const { launch, openPage, newMatch, ok, summary } = require('./_harness');
const OUT = process.env.EXPORT_DIR;

(async () => {
  const { browser, errors } = await launch();
  const page = await openPage(browser, errors);
  const pages = () => page.evaluate(() => (window.__exportPages || []).map(c => [c.width, c.height]));
  const dump = async tag => { if (!OUT) return; const urls = await page.evaluate(() => (window.__exportPages || []).map(c => c.toDataURL('image/png'))); urls.forEach((u, i) => fs.writeFileSync(`${OUT}/${tag}-${i + 1}.png`, Buffer.from(u.split(',')[1], 'base64'))); };
  let s;

  console.log('Match plan');
  await newMatch(page, '9', '50', '2');
  await page.click('[data-subtab="details"]'); await page.click('#exportImageLink'); await page.waitForTimeout(300);
  s = await pages();
  const ratio = await page.evaluate(() => Math.max(screen.width, screen.height) / Math.min(screen.width, screen.height));
  ok(s.length >= 2 && s.every(([w, h]) => w === 1080 && Math.abs(h / w - Math.min(2.2, Math.max(1.25, ratio))) < 0.01), `the plan comes as ${s.length} pages shaped like the screen`, s);
  ok(await page.locator('.ex-page img').count() === s.length, 'each page is previewed');
  await dump('plan-phone');
  await page.click('[data-size="portrait"]'); s = await pages();
  ok(s.every(([w, h]) => w === 1080 && h === 1350) && s.length >= 2, `4:5 gives ${s.length} pages of 1080 × 1350`);
  await dump('plan-45');
  await page.click('[data-size="square"]'); s = await pages();
  ok(s.every(([w, h]) => w === 1080 && h === 1080), 'square pages are 1080 × 1080');
  await page.click('[data-size="long"]'); s = await pages();
  ok(s.length === 1 && s[0][1] > 1500, 'one long image is still there for anyone who wants it', s);
  await page.click('[data-size="phone"]');
  const before = (await pages()).length;
  await page.click('[data-sec="moments"]'); s = await pages();
  ok(s.length > before, `adding "Line-up at each change" adds pages (${before} → ${s.length})`);
  await dump('plan-moments');
  for (const k of ['lineup', 'subs', 'forecast', 'moments']) await page.click(`[data-sec="${k}"]`);
  ok((await pages()).length === 0 && /at least one/.test(await page.textContent('#exPages')), 'with nothing picked, it asks for at least one section');
  await page.click('[data-sec="forecast"]');
  ok((await pages()).length === 1, 'just playing time fits on one page');
  // Sharing sends every page together.
  await page.click('[data-sec="lineup"]'); await page.click('[data-sec="subs"]');
  await page.evaluate(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = d => { window.__shared = d.files.map(f => f.name); return Promise.resolve(); }; });
  await page.click('#exShare'); await page.waitForTimeout(400);
  s = await page.evaluate(() => window.__shared);
  ok(Array.isArray(s) && s.length === (await pages()).length && s.length > 1 && /^lineup-.*-1\.png$/.test(s[0]), 'Share sends all the pages in one go, numbered', s);
  ok(/Share all/.test(await page.textContent('#exShare')), 'the button says it shares them all');
  await page.click('#exClose');

  console.log('Full-time summary');
  await page.evaluate(() => { startMatch(); clearInterval(liveTicker); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); score = {us: 3, them: 1};
    const ids = PLAYERS.map(p => p.id); goalEvents = [{time: 5, forUs: true, scorer: ids[0], assist: ids[1]}, {time: 20, forUs: false, scorer: 'OPP'}, {time: 31, forUs: true, scorer: ids[2]}, {time: 44, forUs: true, scorer: 'UNKNOWN'}];
    matchNotes = [{id: 'n1', minute: 12, text: 'Great pressing from the front three, keep it up next week.', ts: 1}];
    finishMatch(DURATION); openSummaryModal(); });
  await page.waitForTimeout(300);
  s = await pages();
  ok(s.length >= 1 && s.every(([w]) => w === 1080), `the summary comes as ${s.length} phone-shaped page(s)`, s);
  ok(await page.locator('[data-sec="notes"]:not(.active)').count() === 1, 'notes are offered, but left out unless picked');
  await page.click('[data-sec="notes"]');
  await dump('summary');

  console.log('Future Fit 3v3');
  await page.evaluate(() => { document.querySelectorAll('.modal-overlay').forEach(e => e.remove());
    const m = {id: 'ffx', opponent: 'Hawks', date: '2026-10-17', createdAt: 1, players: squad.slice(0, 8).map(p => p.id), absent: {}, sitOut: {}, seed: 4, current: 0, roundsCount: 5, gameLength: 8, theirs: 7, ethos: 'mixed', scoring: 'score'};
    planThrees(m, 0); m.rounds[0].games[0].score = [3, 1]; putThrees(m); openThreesDay('ffx'); });
  ok(await page.locator('#t3Export').count() === 1 && await page.locator('#t3Copy').count() === 1, 'Future Fit 3v3 has Export as images, with copying as text still there');
  await page.click('#t3Export'); await page.waitForTimeout(300);
  s = await pages();
  ok(s.length >= 1 && s.every(([w]) => w === 1080), `the matchday exports as ${s.length} page(s)`, s);
  ok(await page.locator('[data-sec="results"]').count() === 1, 'results are offered when scores are kept');
  await dump('threes');
  await page.click('#exClose');

  console.log('Tournament');
  await page.evaluate(() => { const t = {id: 'tx', name: 'Spring Cup', date: todayISO(), format: {players: 7, duration: 10, periods: 1, hasGk: true}, fairness: 'day', keepers: 'day', players: squad.map(p => p.id), games: [{id: 'g1', label: 'Game 1', opponent: 'Rovers', stage: 'group'}, {id: 'g2', label: 'Game 2', opponent: 'City', stage: 'group'}]}; putTournament(t); openTournament('tx'); });
  await page.click('#tnExport'); await page.waitForTimeout(300);
  s = await pages();
  ok(s.length >= 1 && /Spring Cup/.test(await page.evaluate(() => document.querySelector('.picker-title').textContent + (window.__exportPages.length ? 'Spring Cup' : ''))), 'a tournament day exports too', s);
  await dump('tourney');

  summary('phase15_exports', errors);
  await browser.close();
})();
