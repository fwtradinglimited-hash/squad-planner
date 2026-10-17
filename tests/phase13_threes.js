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
    const desc = l => l.map(x => x.kind === 'opp' ? `T${x.size}` : x.kind === 'sit' ? 'S' : x.kind === 'mix' ? `m${x.size}${x.theirs ? '+' + x.theirs : ''}` : `i${x.size}`).join(' ');
    return { e86: desc(threesLayout(8, 6)), e9: desc(threesLayout(9, null)), e10: desc(threesLayout(10, null)), e10four: desc(threesLayout(10, null, {oneSpare: 'four'})), e7: desc(threesLayout(7, 6)),
      e12v6: desc(threesLayout(12, 6)), e5: desc(threesLayout(5, 0)), e97: desc(threesLayout(9, 7)), e97nomix: desc(threesLayout(9, 7, {mix: false})), e76: desc(threesLayout(7, 7)), e87: desc(threesLayout(8, 7)), e78: desc(threesLayout(7, 8)), e1310: desc(threesLayout(13, 6)), e510: desc(threesLayout(5, 10)) };
  });
  ok(s.e86 === 'T3 T3 i1 i1', '8 of ours v 6 of theirs: two 3v3s, and our other two play 1v1', s.e86);
  ok(s.e9 === 'T3 T3 T3', '9 v 9: three trios', s.e9);
  ok(s.e10 === 'T3 T3 T3 S', '10 v 10: by default the one spare sits out (no 4 v 3)', s.e10);
  ok(s.e10four === 'T4 T3 T3', '...or joins a trio for 4 v 3 if the coach chooses', s.e10four);
  ok(s.e7 === 'T3 T3 S', '7 v 6: one spare sits out', s.e7);
  ok(s.e97 === 'T3 T3 m2 m1+1', '9 v 7: two 3v3s, and our 3 spares with their 1 spare make a 2v2', s.e97);
  ok(s.e97nomix === 'T3 T3 i2 i1', '...or, without combining, our 3 spares play 2v1', s.e97nomix);
  ok(s.e76 === 'T3 T3 m1 m0+1', '7 v 7: the spare from each club play 1v1', s.e76);
  ok(s.e87 === 'T3 T3 m2 m0+1', '8 v 7: our two spares and their one make a 2v1, so everyone plays', s.e87);
  ok(s.e78 === 'T3 T3 m0+2 m1', '7 v 8: their two spares stay together against our one (the app doesn\'t assume we\'re the bigger side)', s.e78);
  ok(s.e510 === 'T3 m0+3 m2 m0+2 m0+2', '5 v 10: their three v our two, and their other four play 2v2, so everyone plays', s.e510);
  ok(s.e1310 === 'T3 T3 i2 i2 i2 i1', '13 v 6: our 7 spares make a 2v2 and a 2v1 (never more than 3 a side)', s.e1310);
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
  ok(s.shape === 'opp3 opp3', '7 left v their 6: two trios, and the spare sits out', s.shape);
  s = await page.evaluate(() => { const m = loadThrees()[0]; return m.rounds.slice(1).map(r => (r.sat || [])[0]); });
  ok(new Set(s).size === s.length, `a different player sits out each game (${s.join(', ')})`);
  await page.click('[data-four]');
  s = await page.evaluate(() => { const m = loadThrees()[0]; return { four: m.oneSpare, shape: m.rounds[1].games.map(g => g.kind + g.sides.map(x => x.length).join('v')).join(' ') }; });
  ok(s.four === 'four' && s.shape === 'opp4 opp3', '"Make it 4 v 3 instead" puts the spare in a trio', s);

  console.log('Sitting a player out');
  const sitter = await page.evaluate(() => loadThrees()[0].rounds[2].games[0].sides[0][0]);
  await page.click(`.t3-name[data-r="2"][data-id="${sitter}"]`); await page.click('#t3SitBtn');
  s = await page.evaluate(id => { const m = loadThrees()[0]; return { out: m.rounds[2].coachSat, playing: m.rounds[2].games.some(g => g.sides.flat().includes(id)), next: m.rounds[3].games.some(g => g.sides.flat().includes(id)) }; }, sitter);
  ok(s.out.includes(sitter) && !s.playing && s.next, `${sitter} can sit out game 3 and still plays game 4`, s);
  ok(/plays 3 of 4 games/.test(await page.textContent('#threesBody')), 'the page says who plays fewer games');
  await page.click(`[data-back="${sitter}"]`);
  ok(await page.evaluate(id => loadThrees()[0].rounds[2].games.some(g => g.sides.flat().includes(id)), sitter), 'tapping them again brings them back in');

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

  console.log('The coach\'s own set-up');
  await page.evaluate(() => { const m = {id: 'own', opponent: 'Owls', date: todayISO(), players: squad.map(p => p.id), absent: {}, sitOut: {}, seed: 3, current: 0, roundsCount: 3, gameLength: 8, theirs: 6, ethos: 'mixed'}; planThrees(m, 0); putThrees(m); openThreesDay('own'); });
  await page.click('[data-struct="1"]');
  ok(await page.locator('.t3-srow').count() === 3, 'Change the games shows the current set-up for that game (pitch by pitch)');
  await page.selectOption('[data-row="2"][data-k="type"]', 'two');
  await page.selectOption('[data-row="0"][data-k="a"]', '2');
  await page.selectOption('[data-row="2"][data-k="a"]', '1'); await page.selectOption('[data-row="2"][data-k="b"]', '1'); await page.selectOption('[data-row="2"][data-k="tb"]', '1');
  ok(/7 of our 8 players placed · 1 sits out/.test(await page.textContent('#t3sCount')), 'it counts who is placed and who sits out as the coach changes it');
  await page.selectOption('[data-row="1"][data-k="a"]', '6');
  await page.click('#t3sSave');
  ok(/only 8 are here/.test(await page.textContent('#t3sErr')), 'placing more players than are here is stopped');
  await page.selectOption('[data-row="1"][data-k="a"]', '3');
  await page.check('[name="t3sScope"][value="all"]'); await page.click('#t3sSave');
  s = await page.evaluate(() => { const m = getThrees('own'); return { r0: m.rounds[0].custom, shapes: m.rounds.slice(1).map(r => r.games.map(g => g.kind + (g.cap || []).join('v') + (g.theirs ? '+' + g.theirs.join('/') : '')).join(' ')), sat: m.rounds.slice(1).map(r => (r.sat || []).length), full: m.rounds.slice(1).every(r => r.games.every(g => g.sides.every((sd, i) => sd.length === g.cap[i]))) }; });
  ok(!s.r0 && s.shapes.every(x => x === 'opp2 opp3 mix1v1+0/1'), 'games 2 and 3 use the coach\'s set-up (2 v them, 3 v them, 1 v 1 + one of theirs); game 1 is unchanged', s.shapes);
  ok(s.full && s.sat.every(n => n === 1), 'Co-Coach fills in the names, and the one left over sits out', s);
  await page.click('[data-struct="2"]'); await page.click('#t3sAuto');
  ok(await page.evaluate(() => !getThrees('own').layouts[2] && !getThrees('own').rounds[2].custom && !!getThrees('own').layouts[1]), '"Back to automatic" undoes it for that game only');

  console.log('Pick it myself');
  await page.click('#t3Edit'); await page.check('[name="t3Ethos"][value="manual"]'); await page.click('#t3Save');
  s = await page.evaluate(() => { const r = getThrees('own').rounds[0]; return { pool: r.pool.length, placed: r.games.flatMap(g => g.sides.flat()).length }; });
  ok(s.pool === 8 && s.placed === 0, 'every player starts unplaced, for the coach to put where they want', s);
  const first = await page.evaluate(() => getThrees('own').rounds[0].pool[0]);
  await page.click(`.t3-name[data-r="0"][data-id="${first}"]`);
  await page.click('[data-add="0:1:0"]');
  s = await page.evaluate(id => { const r = getThrees('own').rounds[0]; return r.games[1].sides[0].includes(id) && !r.pool.includes(id); }, first);
  ok(s, 'tap a name, then an empty place, to put them there');
  await page.click('[data-fill="0"]');
  s = await page.evaluate(() => { const r = getThrees('own').rounds[0]; return { pool: r.pool.length, full: r.games.every(g => g.sides.every((sd, i) => sd.length === g.cap[i])) }; });
  ok(s.pool === 0 && s.full, '"Fill the rest for me" places everyone left', s);
  const mover = await page.evaluate(() => getThrees('own').rounds[0].games[0].sides[0][0]);
  await page.click(`.t3-name[data-r="0"][data-id="${mover}"]`); await page.click('#t3SitBtn');
  s = await page.evaluate(id => { const r = getThrees('own').rounds[0]; return { out: r.coachSat.includes(id), gap: r.games[0].sides[0].length < r.games[0].cap[0], others: r.games.slice(1).every(g => g.sides.every((sd, i) => sd.length === g.cap[i])) }; }, mover);
  ok(s.out && s.gap && s.others, 'sitting someone out in a hand-picked game leaves everyone else where the coach put them', s);

  summary('phase13_threes', errors);
  await browser.close();
})();
