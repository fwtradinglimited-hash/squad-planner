// Beta launch: the Co-Coach name, installing to the home screen, offline use
// and updates.
//  - The app is called Co-Coach everywhere a coach sees a name; backups made
//    under the old name still restore.
//  - On a phone that hasn't installed it, Home offers "Add to home screen" with
//    step-by-step help for iPhone and Android; not shown once installed.
//  - Inside Facebook/Instagram's own browser, a banner explains how to open the
//    app in Safari/Chrome (data there may not be kept, and it can't be installed).
//  - Served over http, the app works with no signal and offers "Update now"
//    when a new version has downloaded.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http');
const { launch, openPage, ok, summary } = require('./_harness');
const ROOT = path.resolve(__dirname, '..');
const APP = 'file://' + path.join(ROOT, 'index.html');

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  facebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.40.104;FBBV/123;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.5;FBSS/3;FBCR/;FBID/phone;FBLC/en_GB;FBOP/5]',
};
async function phone(browser, errors, ua, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(standalone => {
    try { if (!localStorage.getItem('rf_profile_v1') && !localStorage.getItem('rf_matches_v1')) localStorage.setItem('rf_matches_v1', '[]'); } catch (e) {}
    if (standalone) Object.defineProperty(navigator, 'standalone', { get: () => true });
  }, !!opts.standalone);
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.goto(APP);
  return page;
}
const vis = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === 'none') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }, sel);
const closeModals = page => page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(e => e.remove()));

(async () => {
  const { browser, errors } = await launch();

  console.log('The Co-Coach name');
  let page = await openPage(browser, errors);
  let s = await page.evaluate(() => ({ title: document.title, app: collectBackup().app, ver: APP_VERSION }));
  ok(/· Co-Coach$/.test(s.title), `the browser tab and home-screen title say Co-Coach ("${s.title}")`);
  ok(s.app === 'co-coach', 'backups are labelled Co-Coach');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  ok(sw.includes(`const VERSION = '${s.ver}';`), `the offline copy's version matches the app version (${s.ver}), so devices pick up each release`);
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  ok(man.name === 'Co-Coach' && man.display === 'standalone' && man.icons.every(i => fs.existsSync(path.join(ROOT, i.src))) && man.icons.some(i => i.purpose === 'maskable'),
    'the install manifest names the app, opens full-screen and its icons exist (including Android\'s adaptive icon)');
  s = await page.evaluate(() => ['manifest', 'apple-touch-icon', 'icon'].map(r => { const l = document.querySelector(`link[rel="${r}"]`); return !!l; }).concat([!!document.querySelector('meta[name="apple-mobile-web-app-capable"]')]));
  ok(s.every(Boolean), 'the page links the manifest, the iPhone home-screen icon and the favicon');

  // An old "squad-planner" backup still restores.
  await page.evaluate(() => { activeTeam().name = 'Old Name FC'; saveProfile(); });
  const old = await page.evaluate(() => { const b = collectBackup(); b.app = 'squad-planner'; return JSON.stringify(b); });
  const tmp = path.join(os.tmpdir(), 'old-backup.json'); fs.writeFileSync(tmp, old);
  page = await openPage(browser, errors);
  await page.evaluate(() => openBackupModal());
  await page.setInputFiles('#bkFile', tmp); await page.waitForTimeout(200);
  if (await page.locator('#modalConfirm').count()) await page.click('#modalConfirm');
  await page.waitForTimeout(600);
  s = await page.evaluate(() => activeTeam().name);
  ok(s === 'Old Name FC', 'a backup made before the rename restores', s);

  console.log('Add to home screen: iPhone');
  page = await phone(browser, errors, UA.iphone);
  ok(await vis(page, '#installCard'), 'Home offers "Add Co-Coach to your home screen" on an iPhone that hasn\'t installed it');
  ok(/Safari can clear saved data/.test(await page.textContent('#installCard')), 'and says why it matters on iPhone');
  await page.click('#installGo'); await page.waitForTimeout(150);
  s = await page.evaluate(() => ({ on: document.querySelector('.ig-tab.on').dataset.ig, text: document.querySelector('.modal-overlay').textContent, steps: document.querySelectorAll('.ig-steps li').length }));
  ok(s.on === 'ios' && /Share/.test(s.text) && /Add to Home Screen/.test(s.text) && s.steps === 4, 'the guide opens on the iPhone steps: Share, Add to Home Screen, Add, open from the icon', s.steps);
  ok(/Already set up your team here\?/.test(s.text) && /Download backup/.test(s.text), 'and, as this phone already has a squad, says to back up first (iPhone keeps the home-screen app\'s data separate)');
  await page.click('[data-ig="android"]');
  s = await page.evaluate(() => ({ on: document.querySelector('.ig-tab.on').dataset.ig, text: document.querySelector('.modal-overlay').textContent }));
  ok(s.on === 'android' && /Install app/.test(s.text) && /Samsung Internet/.test(s.text), 'the Android tab covers Chrome and Samsung Internet');
  await page.click('#igClose');
  await page.click('#installLater'); await page.waitForTimeout(150);
  s = await page.evaluate(() => ({ card: !!document.getElementById('installCard'), snooze: Math.round((profile.install.snoozeUntil - Date.now()) / 86400000) }));
  ok(!s.card && s.snooze === 7, '"Not now" hides it for a week', s);
  await page.click('#teamTitle');
  ok(await page.locator('#tmInstall').count() === 1, 'the team menu always has "Add to home screen"');
  await page.click('#tmInstall'); await page.waitForTimeout(100);
  ok(await page.locator('.ig-steps').count() === 1, '...which opens the same guide');
  await closeModals(page);

  console.log('A new coach on iPhone');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA.iphone, isMobile: true });
    const p2 = await ctx.newPage(); p2.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    await p2.goto(APP);
    ok(await vis(p2, '#wzInstallTip'), 'set-up suggests adding to the home screen first, before any team is entered');
    await p2.click('#wzInstallHow');
    ok(await p2.locator('.ig-steps').count() === 1 && !/Already set up your team/.test(await p2.textContent('.modal-overlay')), 'with the steps, and no backup warning as there\'s nothing to move yet');
    await ctx.close();
  }

  console.log('Already installed');
  page = await phone(browser, errors, UA.iphone, { standalone: true });
  ok(!(await page.locator('#installCard').count()), 'opened from the home screen: no install card');
  await page.click('#teamTitle');
  ok(!(await page.locator('#tmInstall').count()), 'and no "Add to home screen" in the menu');
  await closeModals(page);

  console.log('Android');
  page = await phone(browser, errors, UA.android);
  ok(await vis(page, '#installCard') && !/Safari/.test(await page.textContent('#installCard')), 'Android phones get the card, without the iPhone-only warning');
  // Chrome's own install prompt, when it offers one, is used directly.
  s = await page.evaluate(async () => {
    let prompted = false;
    const ev = new Event('beforeinstallprompt', { cancelable: true });
    ev.prompt = () => { prompted = true; }; ev.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(ev);
    await new Promise(r => setTimeout(r, 50));
    const label = document.getElementById('installGo').textContent;
    document.getElementById('installGo').click();
    await new Promise(r => setTimeout(r, 50));
    return { label, prompted, defaulted: ev.defaultPrevented };
  });
  ok(s.label === 'Install Co-Coach' && s.prompted && s.defaulted, 'when Chrome offers its install prompt, the button installs in one tap', s);

  console.log('Inside Facebook');
  page = await phone(browser, errors, UA.facebook);
  ok(await vis(page, '#inAppBanner') && /inside Facebook/.test(await page.textContent('#inAppBanner')), 'opened from a Facebook post: a banner says to open it in the browser');
  ok(!(await page.locator('#installCard').count()), 'and no install card (it can\'t be installed from inside Facebook)');
  await page.click('#inAppHow'); await page.waitForTimeout(100);
  s = await page.evaluate(() => document.querySelector('.modal-overlay').textContent);
  ok(/Leave Facebook first/.test(s) && /Open in external browser/.test(s) && /co-coach\.uk/.test(s), 'the guide starts with how to leave Facebook, with the link to copy');
  await closeModals(page);
  await page.click('#inAppX');
  ok(!(await vis(page, '#inAppBanner')), 'the banner can be dismissed');

  console.log('Computer');
  page = await openPage(browser, errors);
  ok(!(await page.locator('#installCard').count()), 'no install card on a computer');
  await page.click('#teamTitle'); await page.click('#tmInstall'); await page.waitForTimeout(100);
  ok(/made for your phone/.test(await page.evaluate(() => document.querySelector('.modal-overlay').textContent)), 'the guide tells computer users to open it on their phone');
  await closeModals(page);

  console.log('Offline and updates (served over http)');
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-site-'));
  for (const f of ['index.html', 'privacy.html', 'manifest.webmanifest', 'sw.js']) fs.copyFileSync(path.join(ROOT, f), path.join(site, f));
  fs.mkdirSync(path.join(site, 'icons')); for (const f of fs.readdirSync(path.join(ROOT, 'icons'))) fs.copyFileSync(path.join(ROOT, 'icons', f), path.join(site, 'icons', f));
  const types = { html: 'text/html', js: 'text/javascript', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html';
    const p = path.join(site, f);
    if (!p.startsWith(site) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[p.split('.').pop()] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(p));
  }).listen(0);
  const URL = `http://localhost:${server.address().port}/`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await ctx.newPage();
  const errs2 = []; page.on('pageerror', e => errs2.push(e.message));
  await page.addInitScript(() => { try { if (!localStorage.getItem('rf_profile_v1') && !localStorage.getItem('rf_matches_v1')) localStorage.setItem('rf_matches_v1', '[]'); } catch (e) {} });
  await page.goto(URL);
  s = await page.evaluate(async () => { await navigator.serviceWorker.ready; for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 100)); return !!navigator.serviceWorker.controller; });
  ok(s, 'the offline copy installs on first visit');
  await page.evaluate(() => { activeTeam().name = 'Offline FC'; saveProfile(); });
  await ctx.setOffline(true);
  await page.reload(); await page.waitForTimeout(300);
  s = await page.evaluate(() => ({ team: document.getElementById('teamTitleText').textContent, home: !!document.getElementById('homeBody') }));
  ok(s.team === 'Offline FC' && s.home, 'with no signal, the app still opens with the coach\'s team', s);
  await page.goto(URL + 'privacy.html');
  ok(/Privacy Policy/.test(await page.textContent('h1')), 'the privacy policy opens offline too');
  await ctx.setOffline(false);
  await page.goto(URL);
  // Release a new version.
  fs.writeFileSync(path.join(site, 'sw.js'), fs.readFileSync(path.join(site, 'sw.js'), 'utf8').replace(/const VERSION = '[^']+';/, "const VERSION = 'beta next';"));
  fs.writeFileSync(path.join(site, 'index.html'), fs.readFileSync(path.join(site, 'index.html'), 'utf8').replace(/const APP_VERSION = '[^']+';/, "const APP_VERSION = 'beta next';"));
  await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  await page.waitForSelector('#updateBar', { state: 'visible', timeout: 8000 }).catch(() => {});
  ok(await vis(page, '#updateBar'), 'a new release downloads in the background and the app offers "Update now"');
  ok(await page.evaluate(() => APP_VERSION) !== 'beta next', 'nothing changes until the coach taps it (no surprise reloads mid-match)');
  await Promise.all([page.waitForEvent('load', { timeout: 8000 }).catch(() => {}), page.click('#updateNow')]);
  await page.waitForTimeout(300);
  s = await page.evaluate(() => ({ v: APP_VERSION, team: document.getElementById('teamTitleText').textContent }));
  ok(s.v === 'beta next' && s.team === 'Offline FC', '"Update now" reloads into the new version with the team intact', s);
  ok(!errs2.length, 'no errors while served over http', errs2);
  server.close();

  summary('phase9_install', errors);
  await browser.close();
})();
