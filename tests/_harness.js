// Shared Playwright harness for the planner's browser tests.
const { chromium } = require('playwright');
const path = require('path');
const APP = 'file://' + path.resolve(__dirname, '..', 'index.html');

async function launch() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [];
  const page = await openPage(browser, errors);
  return { browser, page, errors };
}
// A fresh, isolated app instance (its own storage) in the same browser.
async function openPage(browser, errors) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.addInitScript(() => { try { if (!localStorage.getItem('rf_profile_v1') && !localStorage.getItem('rf_matches_v1')) localStorage.setItem('rf_matches_v1', '[]'); } catch (e) {} });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|net::/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
  await page.goto(APP);
  return page;
}

// New fixture through the real UI, default squad, chosen format.
async function newMatch(page, players = '7', dur = '50', periods = '2') {
  await page.click('[data-tab="matches"]'); await page.click('#newFixtureBtn');
  if (await page.locator('#modalConfirm').count()) await page.click('#modalConfirm');
  await page.click('#changeFormatLink');
  await page.selectOption('#fmt-players', players); await page.selectOption('#fmt-duration', dur); await page.selectOption('#fmt-periods', periods);
  await page.click('#confirmFormatBtn'); await page.click('#generateBtn'); await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(e => e.remove()));
}

let failures = 0, passes = 0;
function ok(cond, msg, detail) {
  if (cond) { passes++; console.log('  PASS ' + msg); }
  else { failures++; console.log('  FAIL ' + msg + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); }
}
function summary(name, errors) {
  if (errors && errors.length) { failures++; console.log('  FAIL page errors: ' + JSON.stringify(errors)); }
  console.log(`${name}: ${passes} passed, ${failures} failed`);
  process.exitCode = failures ? 1 : 0;
}
module.exports = { launch, openPage, newMatch, ok, summary };
