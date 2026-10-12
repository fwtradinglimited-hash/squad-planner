// Phase 3: player profile (level, goal ability), Team Ethos, fixture
// exceptions, season record and the spec compiler. Gate: existing tests
// pass and old backups load.
const fs = require('fs');
const path = require('path');
const { launch, openPage, newMatch, ok, summary } = require('./_harness');
const OLD_BACKUP = JSON.parse(fs.readFileSync(path.join(__dirname, 'old_backup_main_2026-10-09.json'), 'utf8'));

(async () => {
  const { browser, page: first, errors } = await launch();
  await first.context().close();

  // ---------- An old backup (made with the live version) loads ----------
  console.log('An old backup loads');
  let page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.addInitScript(data => { try { if (!sessionStorage.getItem('seeded')) { Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } } catch (e) {} }, OLD_BACKUP.data);
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(400);
  let r = await page.evaluate(() => ({
    squad: squad.map(p => [p.id, p.gk, p.goal]),
    ledger: buildSeasonLedger(loadMatchLibrary()),
    ethos: teamEthos.preset,
    screen: document.querySelector('.screen.active').id,
  }));
  const harry = r.squad.find(x => x[0] === 'Harry'), archie = r.squad.find(x => x[0] === 'Archie'), zara = r.squad.find(x => x[0] === 'Zara');
  ok(harry && harry[1] === true && harry[2] === 2, 'a keeper from the old squad becomes "Capable" in goal', harry);
  ok(archie && archie[1] === false && archie[2] === 0, 'a player whose keeper tick was removed stays a non-keeper', archie);
  ok(zara && zara[2] === 0, 'a player added in the old version loads', zara);
  ok(r.ledger.matches === 1 && r.ledger.players.Jack && r.ledger.players.Jack.goals === 1, 'the old finished match feeds the season record (Jack 1 goal)', r.ledger.players.Jack);
  ok(r.ledger.players.Jack.availMins === 20, 'old stats without availability count the whole match as available', r.ledger.players.Jack);
  ok(r.ethos === 'balanced', 'a team with no ethos yet gets Balanced', r.ethos);
  // Plan a new match on the restored data
  await newMatch(page);
  r = await page.evaluate(() => ({subs: PLAN.rotations.filter(x => !x.type).length, players: PLAYERS.length}));
  ok(r.subs > 0 && r.players === 11, 'a new match plans normally on the restored squad', r);
  await page.context().close();

  // ---------- Player profile ----------
  console.log('Player levels and goal ability');
  page = await openPage(browser, errors);
  r = await page.evaluate(() => [
    normalisePlayer({id: 'A', positions: {DEF: 3}, gk: true}),
    normalisePlayer({id: 'B', gk: false, goal: 3}),           // keeper tick removed in an older screen
    normalisePlayer({id: 'C', gk: true, goal: 1}),            // keeper tick added in an older screen
    normalisePlayer({id: 'D', level: 12, levels: {MID: 7.3, ATT: 'x', GK: -2}}),
    normalisePlayer({id: 'E', level: 'strong'}),
  ]);
  ok(r[0].goal === 2 && r[0].positions.MID === 2 && r[0].positions.ATT === 1, 'old keeper becomes Capable; missing positions get sensible defaults', r[0]);
  ok(r[1].goal === 1 && r[1].gk === false, 'unticking keeper keeps them as an Emergency option at most', r[1]);
  ok(r[2].goal === 2 && r[2].gk === true, 'ticking keeper makes them Capable', r[2]);
  ok(r[3].level === 10 && r[3].levels.MID === 7.5 && r[3].levels.GK === 0 && !('ATT' in r[3].levels), 'levels are kept between 0 and 10 in half steps; junk is dropped', r[3]);
  ok(!('level' in r[4]), 'a non-number level is removed', r[4]);

  // Editing a player in the form keeps their level
  await page.evaluate(() => { squad = [normalisePlayer({id: 'Ava', positions: {DEF: 1, MID: 3, ATT: 2}, gk: false, level: 8, levels: {MID: 9}}), normalisePlayer({id: 'Ben', positions: {DEF: 2, MID: 2, ATT: 2}, gk: false})];
    saveSquad(); teamEthos.pairs = [{a: 'Ava', b: 'Ben', kind: 'apart'}]; saveEthos(); openPlayerForm('Ava'); });
  await page.fill('#pf-name', 'Ava B');
  await page.click('#pf-save'); await page.waitForTimeout(100);
  if (await page.locator('#modalConfirm').count()) { await page.click('#modalConfirm'); await page.waitForTimeout(100); }
  r = await page.evaluate(() => ({p: squad.find(x => x.id === 'Ava B'), pairs: teamEthos.pairs}));
  ok(r.p && r.p.level === 8 && r.p.levels.MID === 9, 'editing a player keeps their private level', r.p);
  ok(r.pairs.length === 1 && r.pairs[0].a === 'Ava B', 'renaming a player keeps their pairs', r.pairs);
  await page.evaluate(() => { openPlayerForm('Ben'); });
  await page.click('#pf-delete'); await page.click('#modalConfirm'); await page.waitForTimeout(100);
  r = await page.evaluate(() => teamEthos.pairs);
  ok(r.length === 0, 'removing a player removes their pairs', r);

  // ---------- Team Ethos ----------
  console.log('Team Ethos');
  r = await page.evaluate(() => {
    const bad = normaliseEthos({preset: 'nonsense', sliders: {strength: 250, positions: 'x'}, priority: ['strength', 'x'], rules: {unitFloor: 'maybe', oneChangePerUnit: 'strict', leagueMinPct: 40},
      subTiming: 'whenever', keepers: {timeCounts: 1, shortage: 'ask'}, live: {replan: 'major'}, pairs: [{a: 'X', b: 'X', kind: 'with'}, {a: 'X', b: 'Y', kind: 'with'}]});
    teamEthos = normaliseEthos({preset: 'competitive', sliders: {changes: 80}}); saveEthos();
    return {bad, stored: JSON.parse(localStorage.getItem(ETHOS_KEY))};
  });
  ok(r.bad.preset === 'balanced' && r.bad.sliders.strength === 100 && !('positions' in r.bad.sliders), 'bad values fall back or are clamped', r.bad);
  ok(r.bad.priority && r.bad.priority.join() === 'minutes,strength,positions', 'an invalid priority order falls back to the preset order', r.bad.priority);
  ok(r.bad.rules.unitFloor === null && r.bad.rules.oneChangePerUnit === 'strict' && r.bad.rules.leagueMinPct === 40, 'team rules are kept when valid', r.bad.rules);
  ok(r.bad.subTiming === 'flexible' && r.bad.keepers.timeCounts === true && r.bad.keepers.shortage === 'ask' && r.bad.live.replan === 'major', 'other settings are kept when valid', r.bad);
  ok(r.bad.pairs.length === 1, 'a pair of a player with themself is dropped', r.bad.pairs);
  ok(r.stored.preset === 'competitive' && r.stored.sliders.changes === 80, 'the ethos is saved with the team', r.stored);
  await page.reload(); await page.waitForTimeout(300);
  r = await page.evaluate(() => teamEthos);
  ok(r.preset === 'competitive' && r.sliders.changes === 80, 'the ethos survives reopening the app', r);

  // ---------- The compiler ----------
  console.log('The spec compiler');
  r = await page.evaluate(() => {
    const players = [{id: 'K', positions: {DEF: 1, MID: 1, ATT: 1}, goal: 3}, {id: 'E', positions: {DEF: 2, MID: 2, ATT: 2}, goal: 1},
      {id: 'P1', positions: {DEF: 3, MID: 2, ATT: 1}}, {id: 'P2', positions: {DEF: 2, MID: 3, ATT: 1}}, {id: 'P3', positions: {DEF: 1, MID: 2, ATT: 3}},
      {id: 'P4', positions: {DEF: 2, MID: 2, ATT: 2}}, {id: 'P5', positions: {DEF: 2, MID: 2, ATT: 2}}, {id: 'P6', positions: {DEF: 2, MID: 2, ATT: 2}}].map(normalisePlayer);
    const base = {duration: 50, periodBounds: [0, 25, 50], players, outfieldSlots: 6, allSlots: 7};
    const balanced = compileSpec({...base, ethos: defaultEthos()});
    const plain = buildSpec({preset: 'balanced', duration: 50, periodBounds: [0, 25, 50]});
    const mustwin = compileSpec({...base, ethos: defaultEthos(), today: 'mustwin'});
    const dev = compileSpec({...base, ethos: defaultEthos(), today: 'development'});
    const myOrder = compileSpec({...base, ethos: {...defaultEthos(), priority: ['positions', 'strength', 'minutes']}});
    const ex = compileSpec({...base, ethos: {...defaultEthos(), keepers: {timeCounts: false, shortage: 'outfieldInGoal'}},
      exceptions: {P1: {arrive: 15}, P2: {leave: 30, cap: 20}, P3: {mustStart: true}, P4: {benchStart: true}, P5: {keeperToday: true}, P6: {extra: 5}, ghost: {}}});
    return {balanced: {band: balanced.band, floor: balanced.floorFrac, maxTimeOff: balanced.maxTimeOff, minSpell: balanced.minSpell, pri: balanced.priority, ms: balanced.minSpellMode, uf: balanced.unitFloor},
      plain: {band: plain.band, floor: plain.floorFrac, maxTimeOff: plain.maxTimeOff, minSpell: plain.minSpell},
      mustwin: {pri: mustwin.priority, s: mustwin.sliders, prov: mustwin.provenance.sliders.strength, mode: mustwin.strength.mode},
      dev: {s: dev.sliders, pri: dev.priority}, myOrder: myOrder.priority,
      ex: {avail: ex.availability, caps: ex.caps, pins: ex.startPins, kp: ex.keeperPins, allowed: ex.allowedKeepers, adj: ex.targetAdjust}};
  });
  ok(r.balanced.band === r.plain.band && r.balanced.floor === r.plain.floor && r.balanced.maxTimeOff === r.plain.maxTimeOff && r.balanced.minSpell === r.plain.minSpell,
    'a default team compiles to exactly the Balanced numbers you agreed', r.balanced);
  ok(r.balanced.pri.join() === 'minutes,strength,positions' && r.balanced.ms === 'strict' && r.balanced.uf === 'strict', 'Balanced: minutes first, strict minimum spell, unit rule on', r.balanced);
  ok(r.mustwin.pri[0] === 'strength' && Math.abs(r.mustwin.s.strength - 0.85) < 1e-9 && /Must-win/.test(r.mustwin.prov) && r.mustwin.mode === 'keyMoments', 'Today: Must-win puts strength first for this match, with the Performance settings', r.mustwin);
  ok(Math.abs(r.dev.s.playingTime - 0.13) < 0.011 && r.dev.pri[0] === 'minutes', 'Today: Development leans the sliders half way towards Development', r.dev);
  ok(r.myOrder.join() === 'positions,strength,minutes', 'a coach\'s own priority order is used', r.myOrder);
  ok(r.ex.avail.P1.from === 15 && r.ex.avail.P1.to === 50 && r.ex.avail.P2.to === 30, 'late arrival and early leaving become availability', r.ex.avail);
  ok(r.ex.caps.P2 === 20, 'a minutes cap is passed through', r.ex.caps);
  ok(r.ex.pins.P3 === 'start' && r.ex.pins.P4 === 'bench' && r.ex.kp.includes('P5'), 'must start, start on the bench and keeper today are pinned', r.ex);
  ok(r.ex.allowed.includes('E') && r.ex.allowed.includes('P5') && !r.ex.allowed.includes('K'), 'an Emergency keeper may go in goal when the shortage rule allows it; so may today\'s named keeper', r.ex.allowed);
  ok(r.ex.adj.P6 > 1.1 && r.ex.adj.P6 < 1.2, '"extra minutes" raises that player\'s target', r.ex.adj);

  // ---------- Season record and catch-up ----------
  console.log('Season record: only available-but-benched players are owed minutes');
  r = await page.evaluate(() => {
    const mk = (date, players) => ({status: 'finished', fixture: {date}, createdAt: 1, stats: {v: 2, minutes: 50, players}});
    const ps = (mins, avail, extra = {}) => ({mins, gk: 0, avail, started: mins > 0, goals: 0, assists: 0, ...extra});
    const lib = [
      mk('2026-09-01', {Ben: ps(10, 50), Ill: ps(5, 10), Ok: ps(30, 50), Ok2: ps(30, 50), Ok3: ps(30, 50)}),
      mk('2026-09-08', {Ben: ps(10, 50), Ill: ps(0, 0), Ok: ps(30, 50), Ok2: ps(30, 50), Ok3: ps(30, 50)}),
    ];
    const ledger = buildSeasonLedger(lib);
    const gaps = seasonGaps(ledger, false).gaps;
    const players = ['Ben', 'Ill', 'Ok', 'Ok2', 'Ok3', 'New'].map(id => normalisePlayer({id, positions: {DEF: 2, MID: 2, ATT: 2}}));
    const spec = compileSpec({duration: 50, periodBounds: [0, 25, 50], players, outfieldSlots: 4, allSlots: 4, ledger, ethos: defaultEthos()});
    const off = compileSpec({duration: 50, periodBounds: [0, 25, 50], players, outfieldSlots: 4, allSlots: 4, ledger, ethos: {...defaultEthos(), sliders: {season: 0}}});
    return {ledger: ledger.players, gaps, catchUp: spec.catchUp, adj: spec.targetAdjust, off: off.catchUp};
  });
  ok(r.ledger.Ill.matches === 1 && r.ledger.Ill.availMins === 10, 'a match a player missed entirely doesn\'t count against them', r.ledger.Ill);
  ok(r.gaps.Ben >= 25, 'Ben, benched while available, is owed minutes', r.gaps);
  ok(Math.abs(r.gaps.Ill) < 3, 'Ill, who played a fair share of the time he was there, is owed (almost) nothing', r.gaps);
  ok(r.catchUp.Ben === 7 && r.adj.Ben > 1.19 && r.adj.Ben < 1.21, 'Ben\'s target rises, capped at 20% of an equal share (+7\')', {c: r.catchUp, a: r.adj});
  ok(!r.catchUp.Ill && !r.catchUp.New, 'no catch-up for Ill or for a new player', r.catchUp);
  ok(Object.keys(r.off).length === 0, 'with "Across the season" at 0 there is no catch-up', r.off);

  // ---------- Scorecard: pins, timing, soft minimum spell ----------
  console.log('Scorecard uses the new spec fields');
  r = await page.evaluate(() => {
    const slots = [{id: 'GK', group: 'GK'}, {id: 'D', group: 'DEF'}, {id: 'M', group: 'MID'}];
    const players = ['K', 'A', 'B', 'C', 'X'].map(id => normalisePlayer({id, positions: {DEF: 2, MID: 2, ATT: 2}, gk: id === 'K' || id === 'X'}));
    const plan = planFromRota(30, [0, 15, 30], slots, [0, 7, 15, 28, 30],
      [{GK: 'K', D: 'A', M: 'B'}, {GK: 'K', D: 'C', M: 'B'}, {GK: 'K', D: 'C', M: 'A'}, {GK: 'K', D: 'C', M: 'B'}]);
    const sp = (extra) => ({...buildSpec({preset: 'balanced', duration: 30, periodBounds: [0, 15, 30]}), ...extra});
    const strict = evaluatePlan(plan, players, sp({subTiming: {strictness: 'strict', mode: 'interval', interval: 10}, startPins: {C: 'start', A: 'bench'}, keeperPins: ['X']}));
    const flex = evaluatePlan(plan, players, sp({subTiming: {strictness: 'flexible', mode: 'interval', interval: 10}}));
    const soft = evaluatePlan(plan, players, sp({minSpellMode: 'soft'}));
    const hard = evaluatePlan(plan, players, sp({minSpellMode: 'strict'}));
    return {codes: strict.tiers.t0.items.map(x => x.code), flexT0: flex.tiers.t0.count, flexT5: flex.tiers.t5.offTiming, flexLines: flex.lines.map(l => l.text),
      softT1: soft.tiers.t1.items.filter(x => x.code === 'SHORT_SPELL').length, softT5: soft.tiers.t5.softShortSpells, hardT1: hard.tiers.t1.items.filter(x => x.code === 'SHORT_SPELL').length};
  });
  ok(['MUST_START', 'START_ON_BENCH', 'KEEPER_TODAY', 'OFF_TIMING'].every(c => r.codes.includes(c)), 'must start, start on the bench, keeper today and strict sub timing are rules', r.codes);
  ok(r.flexT0 === 0 && r.flexT5 > 0 && r.flexLines.some(t => /outside your usual sub timing/.test(t)), 'flexible sub timing allows off-timing changes at a small cost, and says so', r);
  ok(r.hardT1 > 0 && r.softT1 === 0 && r.softT5 > 0, 'a soft minimum spell is a cost, not a broken guarantee', r);

  // ---------- Match stats v2, fixture editor, feedback privacy ----------
  console.log('Match record, fixture and privacy');
  await page.context().close();
  page = await openPage(browser, errors);
  await newMatch(page);
  r = await page.evaluate(() => {
    matchFixture.today = 'strong';
    const bench = PLAYERS.find(p => !Object.values(startingLineup).includes(p.id)).id;
    matchFixture.exceptions = {[bench]: {arrive: 10}};
    return bench;
  });
  const late = r;
  await page.click('#startMatchBtn'); await page.waitForTimeout(150);
  await page.evaluate(() => { clearInterval(liveTicker); document.querySelectorAll('.modal-overlay').forEach(e => e.remove()); });
  // the fixture editor must not lose today's choice or exceptions
  await page.evaluate(() => openFixtureEditor());
  await page.fill('#fe-opp', 'Rovers'); await page.click('#feSave');
  r = await page.evaluate(() => ({today: matchFixture.today, ex: matchFixture.exceptions, opp: matchFixture.opponent}));
  ok(r.today === 'strong' && r.ex && r.opp === 'Rovers', 'editing the fixture keeps "Today" and player exceptions', r);
  r = await page.evaluate(late => {
    PLAYERS.forEach(p => { p.level = 7; });
    const keeper = startingLineup.GK;
    goalEvents.push({time: 3, scorer: 'OPP', forUs: false}); score.them = 1;
    finishMatch(20);
    const rec = loadMatchLibrary().find(x => x.status === 'finished');
    const st = rec.stats.players;
    const fb = fbSnapshot();
    return {v: rec.stats.v, late: st[late], keeper: st[keeper], fbLevels: (fb.players || []).filter(p => 'level' in p || 'levels' in p).length, fbPlayers: (fb.players || []).length};
  }, late);
  ok(r.v === 2 && r.late.avail === 10 && r.late.availAtStart === false, `a late arrival is recorded as available for 10 of 20 minutes`, r.late);
  ok(r.keeper.gaOn === 1 && r.keeper.finished === true, 'goals conceded on the pitch and finishing the match are recorded', r.keeper);
  ok(r.fbPlayers > 0 && r.fbLevels === 0, 'a feedback report never includes a player\'s level', r);

  summary('phase3_spec', errors);
  await browser.close();
})();
