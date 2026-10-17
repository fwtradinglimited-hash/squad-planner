// 3v3 matchdays (FA Future Fits): short games on several pitches, no subs,
// no keepers, everyone plays every game. The coach picks who plays with whom:
// mixed, balanced or fixed. Our trios play the other club's; spare players
// play each other (8 of ours v 6 of theirs: two 3v3s and a 1v1).
const { launch, openPage, ok, summary } = require('./_harness');

(async () => {
  const { browser, errors } = await launch();
  const page = await openPage(browser, errors);

  console.log('How a round is laid out');
  let s = await page.evaluate(() => {
    const desc = l => l.map(x => x.kind === 'opp' ? `T${x.size}` : x.kind === 'free' ? 'F' : `i${x.size}`).join(' ');
    return { e86: desc(threesLayout(8, 6)), e9: desc(threesLayout(9, null)), e10: desc(threesLayout(10, null)), e7: desc(threesLayout(7, 6)), e12v6: desc(threesLayout(12, 6)), e5: desc(threesLayout(5, 0)) };
  });
  ok(s.e86 === 'T3 T3 i1 i1', '8 of ours v 6 of theirs: two 3v3s, and our other two play 1v1', s.e86);
  ok(s.e9 === 'T3 T3 T3', '9 v 9: three trios', s.e9);
  ok(s.e10 === 'T4 T3 T3', '10 v 10: one spare joins a team (4 v 3)', s.e10);
  ok(s.e7 === 'T4 T3', '7 v 6: one spare joins a team', s.e7);
  ok(s.e12v6 === 'T3 T3 i3 i3', '12 of ours v 6 of theirs: two trios v them, and a 3v3 among ours', s.e12v6);
  ok(s.e5 === 'i3 i2', 'no opposition: our own 3v2', s.e5);

  console.log('Setting up a matchday');
  await page.evaluate(() => { squad = squad.slice(0, 8); saveSquad(); });
  await page.click('[data-tab="matches"]'); await page.click('#newThreesBtn');
  await page.fill('#t3Opp', 'Hawks'); await page.selectOption('#t3Len', '8'); await page.selectOption('#t3Rounds', '4'); await page.selectOption('#t3Theirs', '6');
  ok(/32 minutes of football each/.test(await page.textContent('#t3Total')), 'it shows each child\'s total time (the FA suggests 30–40)');
  ok(await page.isChecked('[name="t3Ethos"][value="mixed"]'), 'mixed teammates is the default');
  await page.click('#t3Save');
  s = await page.evaluate(() => { const m = loadThrees()[0]; return { screen: document.querySelector('.screen.active').id, rounds: m.rounds.length,
    everyone: m.rounds.every(r => r.games.flatMap(g => g.sides.flat()).sort().join() === m.players.slice().sort().join()),
    shape: m.rounds.map(r => r.games.map(g => g.kind + g.sides.map(x => x.length).join('v')).join(' ')) }; });
  ok(s.screen === 'screen-threes' && s.rounds === 4, 'the matchday opens with four games planned');
  ok(s.everyone, 'everyone plays in every game (no subs)');
  ok(s.shape.every(x => x === 'opp3 opp3 int1v1'), 'each game: two trios v Hawks and a 1v1 between our other two', s.shape);
  s = await page.evaluate(() => { const m = loadThrees()[0]; const h = threesHistory(m.rounds); return { maxMates: Math.max(...Object.values(h.mates)), small: Object.values(h.small), summary: threesSummary(m) }; });
  ok(s.maxMates <= 2, `mixed: no two players are teammates more than twice in four games (max ${s.maxMates})`);
  ok(Math.max(...s.small) === 1, 'the 1v1 is shared round: nobody plays it twice while others never do', s.small);

  console.log('Swapping and changes');
  const g1 = await page.evaluate(() => { const r = loadThrees()[0].rounds[0]; return [r.games[0].sides[0][0], r.games[1].sides[0][0]]; });
  await page.click(`.t3-name[data-r="0"][data-id="${g1[0]}"]`); await page.click(`.t3-name[data-r="0"][data-id="${g1[1]}"]`);
  s = await page.evaluate(() => { const r = loadThrees()[0].rounds[0]; return [r.games[0].sides[0].includes(window.__a), r.games[1].sides[0]]; });
  s = await page.evaluate(ids => { const r = loadThrees()[0].rounds[0]; return r.games[0].sides[0].includes(ids[1]) && r.games[1].sides[0].includes(ids[0]); }, g1);
  ok(s, 'tapping two names in a game swaps them');
  await page.click('#t3Start');
  ok(/\d:\d\d/.test(await page.textContent('#t3Clock')), 'Start runs a countdown for the game');
  await page.click('#t3Next');
  const late = await page.evaluate(() => loadThrees()[0].players[7]);
  const round1Before = await page.evaluate(() => JSON.stringify(loadThrees()[0].rounds[0]));
  await page.click(`[data-t3p="${late}"]`);
  s = await page.evaluate(id => { const m = loadThrees()[0]; return { first: JSON.stringify(m.rounds[0]), later: m.rounds.slice(1).every(r => !r.games.some(g => g.sides.flat().includes(id))), shape: m.rounds[1].games.map(g => g.kind + g.sides.map(x => x.length).join('v')).join(' ') }; }, late);
  ok(s.first === round1Before && s.later, `when ${late} has to stop, games from now on are re-planned and the game played stays as it was`);
  ok(s.shape === 'opp4 opp3', '7 left v their 6: one joins a team (4 v 3)', s.shape);

  console.log('Fixed and balanced');
  s = await page.evaluate(() => {
    const m = {id: 'x', players: squad.map(p => p.id), absent: {}, seed: 5, roundsCount: 4, gameLength: 8, theirs: 6, ethos: 'fixed'};
    planThrees(m, 0);
    const teams = r => r.games.map(g => g.sides.map(x => x.slice().sort().join('+')).sort().join('|')).sort().join(' / ');
    return m.rounds.map(teams);
  });
  ok(new Set(s).size === 1, 'fixed: the same groups all day', s[0]);
  s = await page.evaluate(() => {
    squad.forEach((p, i) => { p.level = [9, 9, 8, 2, 2, 3, 5, 5][i]; });
    const m = {id: 'y', players: squad.map(p => p.id), absent: {}, seed: 9, roundsCount: 4, gameLength: 8, theirs: 6, ethos: 'balanced'};
    planThrees(m, 0);
    const lv = id => squad.find(p => p.id === id).level;
    return m.rounds.map(r => { const t = r.games.filter(g => g.kind === 'opp').map(g => g.sides[0].reduce((a, id) => a + lv(id), 0) / 3); return Math.abs(t[0] - t[1]); });
  });
  ok(s.every(d => d <= 1.5), `balanced: our two trios are close in strength every game (gaps ${s.map(d => d.toFixed(1)).join(', ')})`);

  console.log('Sharing');
  await page.click('#t3Copy');
  s = await page.evaluate(() => window.__threesText || '');
  ok(/Game 1 \(0–8'\)/.test(s) && /Pitch 1: .+ v Hawks/.test(s), 'Copy for WhatsApp gives a plain list of every game', s.slice(0, 120));
  await page.click('#t3Back');
  s = await page.evaluate(() => [...document.querySelectorAll('#matchesList .match-card .mc-title')].map(e => e.textContent));
  ok(s.some(x => /3v3 v Hawks/.test(x)), 'the matchday is listed in Matches', s);

  summary('phase13_threes', errors);
  await browser.close();
})();
