// Stats across kinds of football:
//  - Home: a season overview (matches, tournaments, Future Fit 3v3 with W-D-L)
//    and one panel per kind (each match format, tournaments, Future Fit 3v3),
//    switched by tapping or swiping, so it's clear which format the stats are for.
//  - Future Fit 3v3: who's played with whom (this matchday or all), and
//    games that weren't a straight 3v3, shared out across matchdays.
const { launch, openPage, newMatch, ok, summary } = require('./_harness');

(async () => {
  const { browser, errors } = await launch();
  const page = await openPage(browser, errors);
  let s;
  const finishMatch = async (players, dur, periods, extra) => {
    await newMatch(page, players, dur, periods);
    await page.evaluate(x => { if (x) Object.assign(matchFixture, x); }, extra || null);
    await page.click('#startMatchBtn'); await page.waitForTimeout(80);
    await page.evaluate(() => { clearInterval(liveTicker); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); score = {us: 2, them: 1}; finishMatch(DURATION); showScreen('home'); });
  };

  console.log('Home panels');
  await finishMatch('7', '50', '2');
  await finishMatch('7', '50', '2');
  await finishMatch('5', '40', '2');
  await page.evaluate(() => { renderHome(); });
  s = await page.evaluate(() => ({ tabs: [...document.querySelectorAll('#fmtTabs .fmt-tab')].map(b => b.textContent), on: document.querySelector('#fmtTabs .on').textContent, title: document.querySelector('#fmtPanel h2').textContent }));
  ok(s.tabs.includes('7v7 matches') && s.tabs.includes('5v5 matches'), 'each match format gets its own panel', s.tabs);
  ok(s.on === '5v5 matches' && /5v5 matches: season so far/.test(s.title), 'the most recent format shows first, and its title says which format it is', s);
  s = await page.evaluate(() => document.querySelector('#fmtPanel').textContent);
  ok(/Played/.test(s) && /\b1\b/.test(s), 'the 5v5 panel counts just the 5v5 match');
  await page.click('[data-fmt="m7"]');
  s = await page.evaluate(() => ({ title: document.querySelector('#fmtPanel h2').textContent, played: aggregateStats(r => r.snapshot.playersOnPitch === 7).team.played, minutes: !!document.getElementById('homeMinutes') }));
  ok(/7v7 matches/.test(s.title) && s.played === 2 && s.minutes, 'tapping 7v7 shows the 7v7 season: results, minutes and the fair-minutes check', s);
  // Swipe left goes to the next panel.
  await page.evaluate(() => {
    const box = document.getElementById('fmtPanel');
    const t = (type, x) => { const ev = new Event(type, {bubbles: true}); ev.touches = [{clientX: x, clientY: 300}]; ev.changedTouches = [{clientX: x, clientY: 300}]; box.dispatchEvent(ev); };
    t('touchstart', 120); t('touchend', 300);
  });
  s = await page.evaluate(() => document.querySelector('#fmtTabs .on').textContent);
  ok(s === '5v5 matches', `a sideways swipe moves to the next panel (${s})`);

  console.log('Tournaments and Future Fit on Home');
  await page.evaluate(() => {
    const t = {id: 'tx', name: 'Spring Cup', date: todayISO(), format: {players: 7, duration: 10, periods: 1, hasGk: true}, fairness: 'day', keepers: 'day', players: squad.map(p => p.id), games: []};
    putTournament(t);
  });
  await finishMatch('7', '50', '2', { tournamentId: 'tx', tournamentGameId: 'g1', competition: 'Spring Cup · Game 1' });
  await page.evaluate(() => {
    const m = {id: 'ffa', opponent: 'Hawks', date: '2026-10-10', createdAt: 1, players: squad.slice(0, 8).map(p => p.id), absent: {}, sitOut: {}, seed: 4, current: 4, roundsCount: 4, gameLength: 8, theirs: 7, ethos: 'mixed', scoring: 'result'};
    planThrees(m, 0); m.rounds[0].games[0].result = 'W'; m.rounds[1].games[0].result = 'L'; putThrees(m);
    renderHome();
  });
  s = await page.evaluate(() => [...document.querySelectorAll('#homeOverview .ov-row')].map(r => [...r.children].map(c => c.textContent).join(' | ')));
  ok(s.length === 3 && /Matches \| 3 played \| W-D-L 3-0-0/.test(s[0]), 'the overview counts normal matches with W-D-L', s);
  ok(/Tournaments \| 1 tournament · 1 game \| W-D-L 1-0-0/.test(s[1]), '...tournaments and their games', s[1]);
  ok(/Future Fit 3v3 \| 1 matchday · \d+ games v other clubs \| W-D-L 1-0-1/.test(s[2]), '...and Future Fit 3v3 matchdays, with results where kept', s[2]);
  await page.click('[data-ov="tour"]');
  s = await page.evaluate(() => document.getElementById('fmtPanel').textContent);
  ok(/1 tournament: Spring Cup/.test(s) && /Tournament games/.test(s), 'tapping a row opens that panel: tournament games on their own');
  await page.click('[data-fmt="ff3"]');
  s = await page.evaluate(() => ({ text: document.getElementById('fmtPanel').textContent, rows: document.querySelectorAll('#fmtPanel .t3-stats tr').length }));
  ok(/Future Fit 3v3: season so far/.test(s.text) && /Matchdays/.test(s.text) && s.rows === 9, 'the Future Fit panel has matchdays, games, results and games per player', s.rows);
  ok(/Other sizes/.test(s.text) && /Sat out/.test(s.text), 'including who has played games that weren\'t a straight 3v3, and sat out');

  console.log('Who has played with whom');
  await page.evaluate(() => openThreesDay('ffa'));
  ok(await page.evaluate(() => !document.getElementById('t3WW').open), '"Who\'s played with whom" is tucked away until opened');
  await page.click('#t3WW summary');
  s = await page.evaluate(() => ({ rows: document.querySelectorAll('.t3-grid tr').length, cells: document.querySelectorAll('.t3-grid td.t3-gc').length, note: document.querySelector('#t3WW .config-note:last-child').textContent }));
  ok(s.rows === 9 && s.cells === 56, 'a grid shows how many times each pair played together (8 players)', s);
  ok(/Not played together yet today|Everyone has played with everyone/.test(s.note), 'it lists pairs who haven\'t played together yet', s.note);
  s = await page.evaluate(() => { const m = getThrees('ffa'); const h = threesHistory(m.rounds); const ids = m.players; const a = ids[0], b = ids[1]; return { shown: document.querySelector(`.t3-grid tr:nth-child(2) td:nth-child(3)`).textContent.replace('·', '0'), real: Math.round(h.mates[pairKey(a, b)] || 0) }; });
  ok(+s.shown === s.real, 'the grid matches the games planned', s);

  console.log('Games that aren\'t 3v3, across matchdays');
  s = await page.evaluate(() => {
    const m2 = {id: 'ffb', opponent: 'Owls', date: '2026-10-17', createdAt: 2, players: squad.slice(0, 8).map(p => p.id), absent: {}, sitOut: {}, seed: 11, current: 0, roundsCount: 4, gameLength: 8, theirs: 7, ethos: 'mixed'};
    planThrees(m2, 0); putThrees(m2);
    const day1 = threesPlayerStats(getThrees('ffa').rounds), both = threesPlayerStats([...getThrees('ffa').rounds, ...m2.rounds]);
    const odd = st => Object.values(st).map(x => x.odd);
    return { day1: odd(day1), both: odd(both) };
  });
  ok(Math.max(...s.both) - Math.min(...s.both) <= 1, `over two matchdays, games that weren't 3v3 are shared out: each player had ${Math.min(...s.both)}–${Math.max(...s.both)}`, s);
  await page.evaluate(() => { openThreesDay('ffb'); threesStatsOpen = true; threesStatsScope = 'all'; renderThreesDay(); });
  s = await page.evaluate(() => [...document.querySelectorAll('#threesBody .t3-stats tr')].slice(1).map(r => +r.children[1].textContent));
  ok(s.every(n => n === 8), '"All Future Fit 3v3" counts games from both matchdays (8 each)', s);

  summary('phase14_stats', errors);
  await browser.close();
})();
