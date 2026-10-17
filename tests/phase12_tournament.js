// Tournament mode: a day of short games in one format.
//  - Set up from Matches: name, format, group games, playing time over the
//    day or per game, keepers taking turns.
//  - Planning the day: each game knows the minutes before it, so time evens
//    out over the day; keepers take turns, one per game.
//  - Knockout games added on the day; games still to play re-planned after a
//    game is played or the players change; the season keeps every game.
const { launch, openPage, ok, summary } = require('./_harness');

(async () => {
  const { browser, errors } = await launch();
  let page = await openPage(browser, errors);
  const close = () => page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(e => e.remove()));
  const waitPlanned = async () => { await page.waitForTimeout(50); await page.waitForFunction(() => !document.getElementById('tpBusy'), null, { timeout: 90000 }); };

  console.log('Setting up a tournament');
  await page.click('[data-tab="matches"]');
  ok(await page.locator('#newTourneyBtn').count() === 1 && await page.locator('#newThreesBtn').count() === 1, 'Matches offers a tournament and a 3v3 matchday alongside a normal fixture');
  await page.click('#newTourneyBtn');
  await page.fill('#tnName', 'Spring Cup'); await page.selectOption('#tnPlayers', '7'); await page.fill('#tnLen', '12'); await page.selectOption('#tnGames', '4');
  await page.fill('[data-opp="0"]', 'Hawks'); await page.fill('[data-opp="1"]', 'Rovers');
  let s = await page.evaluate(() => ({ fair: document.querySelector('[name="tnFair"]:checked').value, keep: document.querySelector('[name="tnKeep"]:checked').value }));
  ok(s.fair === 'day' && s.keep === 'day', 'by default playing time evens out over the whole day and keepers take turns', s);
  await page.click('#tnSave');
  s = await page.evaluate(() => ({ screen: document.querySelector('.screen.active').id, games: [...document.querySelectorAll('#tourneyBody [data-game] .mc-title')].map(e => e.textContent) }));
  ok(s.screen === 'screen-tournament' && s.games.length === 4 && /vs Hawks/.test(s.games[0]), 'the tournament opens with its four games', s.games);

  console.log('Any length, any number of periods');
  s = await page.evaluate(() => { const t = loadTournaments()[0]; return {d: t.format.duration}; });
  ok(s.d === 12, 'game length is typed in, so any length works');
  console.log('Planning the day');
  await page.click('#tnPlanAll'); await waitPlanned();
  s = await page.evaluate(() => {
    const t = loadTournaments()[0];
    const recs = t.games.map(g => loadMatchLibrary().find(r => r.id === g.matchId));
    return { planned: recs.filter(r => r && r.status === 'planned').length, keepers: recs.map(r => r.snapshot.startingLineup.GK),
      fmt: recs[0].format, comp: recs[0].fixture.competition, day: tourneyDayTable(t).map(r => ({ id: r.id, m: r.planned, gk: r.gk })) };
  });
  ok(s.planned === 4 && s.fmt === "7v7 · 12' · 1 period" && /Spring Cup · Game 1/.test(s.comp), 'all four games are planned in the tournament format', s.fmt);
  ok(new Set(s.keepers).size === 2 && s.keepers[0] !== s.keepers[1], `keepers take turns, one per game (${s.keepers.join(', ')})`);
  // Time in goal doesn't count (the default approach), so compare each player's
  // share of the outfield time they were available for over the day.
  const share = s.day.map(r => (r.m - r.gk) / (48 - r.gk));
  const spread = Math.max(...share) - Math.min(...share);
  ok(spread <= 0.15, `over the day, everyone gets a similar share of outfield time (${Math.round(Math.min(...share) * 100)}–${Math.round(Math.max(...share) * 100)}%)`, s.day);

  // The same day balanced per game: the gap grows, because nobody makes up time.
  s = await page.evaluate(() => {
    const t = loadTournaments()[0];
    const perGame = t.games.map(g => { const r = loadMatchLibrary().find(x => x.id === g.matchId); return r; });
    return perGame.every(r => r.snapshot.savedPlan);
  });
  ok(s, 'each game keeps its own plan, like any match');
  ok(await page.evaluate(() => { const t = loadTournaments()[0]; const g = t.games[1]; const r = loadMatchLibrary().find(x => x.id === g.matchId); return r.fixture.tournamentId === t.id; }), 'each game knows which tournament it belongs to');
  s = await page.evaluate(() => { const t = loadTournaments()[0]; return { cards: document.querySelectorAll('#matchesList .match-card').length }; });
  await page.click('#tnBack');
  s = await page.evaluate(() => ({ cards: [...document.querySelectorAll('#matchesList .match-card')].map(c => c.querySelector('.mc-title').textContent) }));
  ok(s.cards.length === 1 && /Spring Cup/.test(s.cards[0]), 'Matches shows the tournament as one card, not four separate games', s.cards);
  await page.click('[data-topen]');

  console.log('Minutes today');
  s = await page.evaluate(() => document.getElementById('tnMinutes').textContent);
  ok(/Minutes today/.test(s) && /Gap between most and least/.test(s), 'the tournament page shows everyone\'s minutes over the day');

  console.log('Playing a game');
  await page.click('[data-gopen="0"]');
  ok(await page.evaluate(() => document.querySelector('.screen.active').id) === 'screen-plan', 'a game opens like any match');
  const benchFirst = await page.evaluate(() => PLAYERS.map(p => p.id).find(id => !Object.values(computeStateAt(0).onPitch).includes(id)));
  // The coach keeps someone on the bench all game (available, but given no minutes).
  await page.evaluate(id => { matchFixture.exceptions = {...(matchFixture.exceptions || {}), [id]: {cap: 0}}; regeneratePlan(); }, benchFirst);
  await page.click('#startMatchBtn'); await page.waitForTimeout(100);
  await page.evaluate(() => { clearInterval(liveTicker); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); finishMatch(DURATION); });
  ok(await page.evaluate(id => { const r = loadMatchLibrary().find(x => x.id === loadTournaments()[0].games[0].matchId); return r.stats.players[id].mins === 0 && r.stats.players[id].avail > 0; }, benchFirst), `${benchFirst} was available for game 1 but didn't play`);
  await page.click('#planBackBtn');
  s = await page.evaluate(() => ({ screen: document.querySelector('.screen.active').id, stale: !!document.getElementById('tnStale'), played: document.querySelectorAll('#tourneyBody .badge').length }));
  ok(s.screen === 'screen-tournament', 'Back from a game returns to the tournament');
  ok(s.stale, 'after a game is played, the page offers to re-plan the games still to play with the real minutes');
  const before = await page.evaluate(id => { const t = loadTournaments()[0]; const rest = t.games.slice(1); const avg = rest.reduce((a, g) => a + Object.values(g.forecast).reduce((x, p) => x + p.mins - p.gk, 0) / Object.keys(g.forecast).length, 0);
    return { mins: rest.reduce((a, g) => a + ((g.forecast[id] || {}).mins || 0), 0), avg }; }, benchFirst);
  await page.click('#tnReplan'); await waitPlanned();
  const after = await page.evaluate(id => { const t = loadTournaments()[0]; return { mins: t.games.slice(1).reduce((a, g) => a + ((g.forecast[id] || {}).mins || 0), 0), first: t.games[1].forecast[id].mins, stale: tourneyStaleGames(t).length }; }, benchFirst);
  ok(after.stale === 0 && !(await page.locator('#tnStale').count()), 'Re-plan brings the rest of the day up to date');
  ok(after.mins > before.mins, `${benchFirst}, who didn't play in game 1, gets more time over the rest of the day (${before.mins}' → ${after.mins}')`, { before, after });

  console.log('Knockouts and changes');
  await page.click('#tnAddKo'); await page.selectOption('#tgLabel', 'Semi-final'); await page.fill('#tgOpp', 'City'); await page.click('#tgSave'); await waitPlanned();
  s = await page.evaluate(() => { const t = loadTournaments()[0]; const g = t.games[4]; const r = loadMatchLibrary().find(x => x.id === g.matchId); return { n: t.games.length, label: g.label, stage: g.stage, status: r && r.status, comp: r && r.fixture.competition }; });
  ok(s.n === 5 && s.stage === 'knockout' && s.status === 'planned' && /Semi-final/.test(s.comp), 'a knockout game is added and planned straight away', s);
  const outName = await page.evaluate(() => loadTournaments()[0].players[2]);
  await page.click(`[data-tp="${outName}"]`);
  s = await page.evaluate(() => tourneyStaleGames(loadTournaments()[0]).length);
  ok(s >= 3, 'taking a player out flags the games still to play for re-planning');
  await page.click('#tnReplan'); await waitPlanned();
  s = await page.evaluate(name => { const t = loadTournaments()[0]; return t.games.slice(1).map(g => loadMatchLibrary().find(r => r.id === g.matchId)).every(r => !r.snapshot.players.some(p => p.id === name)); }, outName);
  ok(s, `${outName} is left out of the games still to play`);

  console.log('Season and settings');
  s = await page.evaluate(() => aggregateStats().matches.length);
  ok(s === 1, 'the game already played counts in season stats like any match');
  await page.click('#tnEdit');
  ok(await page.locator('#tnGames').isDisabled(), 'the number of group games is fixed once games are planned (add knockouts instead)');
  await page.check('[name="tnFair"][value="game"]'); await page.click('#tnSave');
  s = await page.evaluate(() => ({ fair: loadTournaments()[0].fairness, stale: tourneyStaleGames(loadTournaments()[0]).length }));
  ok(s.fair === 'game' && s.stale > 0, 'switching to "even within each game" asks for the games still to play to be re-planned', s);
  s = await page.evaluate(() => { const t = loadTournaments()[0]; matchFixture = { tournamentId: t.id, tournamentGameId: t.games[2].id }; return tournamentLedgerFor(matchFixture); });
  ok(s === null, 'planned per game, earlier games no longer shift the minutes');

  console.log('Deleting');
  await page.click('#tnDelete'); await page.click('#modalConfirm');
  s = await page.evaluate(() => ({ t: loadTournaments().length, lib: loadMatchLibrary().map(r => r.status) }));
  ok(s.t === 0 && s.lib.length === 1 && s.lib[0] === 'finished', 'deleting the tournament removes games not played; the played game stays in the history', s);

  console.log('Long games, more periods');
  await page.click('#newTourneyBtn');
  await page.fill('#tnName', 'Summer Festival'); await page.fill('#tnLen', '40'); await page.selectOption('#tnHalves', '4'); await page.selectOption('#tnGames', '1');
  await page.click('#tnSave');
  await page.click('[data-gplan="0"]'); await waitPlanned();
  s = await page.evaluate(() => { const t = loadTournaments().find(x => x.name === 'Summer Festival'); const r = loadMatchLibrary().find(x => x.id === t.games[0].matchId); return { fmt: r && r.format, label: tourneyFormatLabel(t.format) }; });
  ok(s.fmt === "7v7 · 40' · 4 periods" && /4 × 10'/.test(s.label), 'a 40-minute game in four quarters plans fine (no 30-minute or two-period limit)', s);
  await page.click('#tnEdit'); await page.fill('#tnLen', '6'); await page.selectOption('#tnHalves', '4'); await page.click('#tnSave');
  ok(/too short for 4 periods/.test(await page.textContent('#tnErr')), 'a game too short for its periods is caught');
  await page.click('#tnCancel');

  console.log('From Matches');
  await page.click('#tnBack');
  ok(await page.locator('[data-tdel]').count() === 1, 'a tournament card has a Delete button');
  await page.click('[data-tdel]'); await page.click('#modalConfirm');
  ok(await page.evaluate(() => loadTournaments().length === 0 && !document.querySelector('[data-tourney]')), 'and it deletes the tournament');
  await page.click('#newTourneyBtn');
  ok(await page.evaluate(() => document.querySelector('.screen.active').id === 'screen-form' && !document.querySelector('.modal-overlay')), 'tournament set-up is a normal screen too');
  await page.click('#tnCancel');

  summary('phase12_tournament', errors);
  await browser.close();
})();
