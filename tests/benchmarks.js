// Benchmark squads: the fixed set every planning engine is measured on.
// Positions are comfort per area (0 Do not use, 1 Can play, 2 Comfortable,
// 3 Preferred). Levels are 0-10 (Developing about 2, Core about 5, Strong
// about 8); a squad with no levels set is judged on positions and minutes only.
const P = (id, DEF, MID, ATT, extra = {}) => ({id, positions: {DEF, MID, ATT}, gk: false, ...extra});
const K = (id, DEF, MID, ATT, extra = {}) => P(id, DEF, MID, ATT, {gk: true, ...extra});
const S = 8, C = 5, D = 2; // quick-tap levels: Strong, Core, Developing

const BENCHMARKS = [
  {
    id: 'demo', name: 'Demo squad (7v7)',
    why: 'Your default ten, all rated the same, two keepers rotating at half-time. Covers V1, V2, V5 and V6.',
    format: {players: 7, gk: true, duration: 50, periods: 2, shape: {DEF: 2, MID: 2, ATT: 2}},
    keepers: {mode: 'rotate', list: ['Harry', 'Archie']},
    squad: ['Harry', 'Archie'].map(n => K(n, 2, 2, 1)).concat(['Jack', 'Alfie', 'Charlie', 'Oliver', 'George', 'Leo', 'Noah', 'Theo'].map(n => P(n, 2, 2, 1))),
  },
  {
    id: 'midfield', name: 'Your midfield problem (7v7)',
    why: 'Two Strong and two Developing midfielders, one keeper. The case behind V3 and V4.',
    format: {players: 7, gk: true, duration: 50, periods: 2, shape: {DEF: 2, MID: 2, ATT: 2}},
    keepers: {mode: 'single', list: ['Sam']},
    squad: [K('Sam', 1, 1, 1), P('Eli', 3, 1, 0), P('Finn', 3, 1, 0), P('Gus', 2, 1, 1),
      P('Ava', 1, 3, 2, {level: S}), P('Ben', 1, 3, 2, {level: S}), P('Cal', 1, 2, 1, {level: D}), P('Dan', 1, 2, 1, {level: D}),
      P('Hal', 0, 1, 3), P('Ike', 0, 1, 3)],
  },
  {
    id: 'mixed', name: 'Mixed levels (7v7)',
    why: 'Three Strong, four Core, three Developing, one keeper: the section 8 slider example.',
    format: {players: 7, gk: true, duration: 50, periods: 2, shape: {DEF: 2, MID: 2, ATT: 2}},
    keepers: {mode: 'single', list: ['Kai']},
    squad: [K('Kai', 1, 1, 0, {level: C}),
      P('Ada', 3, 2, 1, {level: S}), P('Bea', 2, 3, 2, {level: S}), P('Cy', 1, 2, 3, {level: S}),
      P('Dov', 3, 1, 0, {level: C}), P('Eve', 2, 3, 1, {level: C}), P('Fox', 1, 2, 3, {level: C}), P('Gil', 2, 2, 2, {level: C}),
      P('Hux', 3, 1, 1, {level: D}), P('Ivy', 1, 3, 1, {level: D}), P('Jon', 1, 1, 3, {level: D})],
  },
  {
    id: 'big', name: 'Big squad: 14 for 7v7',
    why: 'Lots of bench time to share; two keepers rotating; mixed levels. Covers V14.',
    format: {players: 7, gk: true, duration: 50, periods: 2, shape: {DEF: 2, MID: 3, ATT: 1}},
    keepers: {mode: 'rotate', list: ['Ash', 'Bo']},
    squad: [K('Ash', 2, 1, 1, {level: C}), K('Bo', 1, 2, 1, {level: C}),
      P('Col', 3, 2, 1, {level: S}), P('Dee', 3, 1, 0, {level: C}), P('Eli', 2, 2, 1, {level: D}),
      P('Fay', 1, 3, 2, {level: S}), P('Gus', 1, 3, 1, {level: C}), P('Hana', 1, 2, 2, {level: D}), P('Ian', 2, 3, 1, {level: C}),
      P('Jade', 0, 2, 3, {level: S}), P('Kit', 1, 1, 3, {level: C}), P('Lou', 0, 2, 3, {level: D}), P('Max', 2, 2, 2, {level: C}), P('Noor', 1, 2, 2, {level: D})],
  },
  {
    id: 'short', name: 'Short squad: 8 for 7v7',
    why: 'Only one substitute: tests spells, time off and minimum spells.',
    format: {players: 7, gk: true, duration: 50, periods: 2, shape: {DEF: 2, MID: 2, ATT: 2}},
    keepers: {mode: 'single', list: ['Ola']},
    squad: [K('Ola', 1, 1, 1), P('Pip', 3, 2, 1), P('Quin', 3, 2, 1), P('Rae', 1, 3, 2), P('Sol', 2, 3, 1), P('Tam', 1, 2, 3), P('Uma', 1, 2, 3), P('Vic', 2, 2, 2)],
  },
  {
    id: 'exact', name: 'Exactly seven (no subs)',
    why: 'Nobody to bring on: the plan must be the starting line-up all match.',
    format: {players: 7, gk: true, duration: 50, periods: 2, shape: {DEF: 2, MID: 2, ATT: 2}},
    keepers: {mode: 'single', list: ['Wes']},
    squad: [K('Wes', 1, 1, 1), P('Xan', 3, 2, 1), P('Yas', 3, 1, 1), P('Zed', 1, 3, 2), P('Abe', 2, 3, 1), P('Bex', 1, 2, 3), P('Cas', 1, 1, 3)],
  },
  {
    id: 'fives', name: '5v5, four quarters, rotating keeper',
    why: 'Short periods (10\'), a different keeper each quarter.',
    format: {players: 5, gk: true, duration: 40, periods: 4, shape: {DEF: 2, MID: 1, ATT: 1}},
    keepers: {mode: 'rotate', list: ['Ari', 'Bix', 'Cleo', 'Ari']},
    squad: [K('Ari', 2, 2, 1), K('Bix', 2, 1, 2), K('Cleo', 1, 2, 2), P('Dax', 3, 1, 1), P('Elle', 1, 3, 2), P('Fin', 1, 2, 3), P('Gia', 2, 2, 2), P('Hugo', 3, 2, 1)],
  },
  {
    id: 'nines', name: '9v9, 60 minutes',
    why: 'Bigger format, 3-3-2, 13 players, two keepers, mixed levels.',
    format: {players: 9, gk: true, duration: 60, periods: 2, shape: {DEF: 3, MID: 3, ATT: 2}},
    keepers: {mode: 'rotate', list: ['Ira', 'Jo']},
    squad: [K('Ira', 1, 1, 1, {level: C}), K('Jo', 2, 1, 1, {level: D}),
      P('Kemi', 3, 2, 1, {level: S}), P('Lars', 3, 1, 0, {level: C}), P('Mo', 3, 2, 1, {level: D}), P('Nia', 2, 2, 1, {level: C}),
      P('Oz', 1, 3, 2, {level: S}), P('Pia', 1, 3, 1, {level: C}), P('Raf', 2, 3, 2, {level: D}), P('Sia', 1, 2, 2, {level: C}),
      P('Tov', 0, 2, 3, {level: S}), P('Una', 1, 1, 3, {level: C}), P('Vin', 0, 2, 3, {level: D})],
  },
  {
    id: 'elevens', name: '11v11, 70 minutes',
    why: 'Full-size format, 4-4-2, 16 players, one keeper.',
    format: {players: 11, gk: true, duration: 70, periods: 2, shape: {DEF: 4, MID: 4, ATT: 2}},
    keepers: {mode: 'single', list: ['Gk1']},
    squad: [K('Gk1', 1, 0, 0, {level: C}),
      P('Df1', 3, 1, 0, {level: S}), P('Df2', 3, 1, 0, {level: C}), P('Df3', 3, 2, 0, {level: C}), P('Df4', 3, 1, 1, {level: D}), P('Df5', 2, 2, 1, {level: C}), P('Df6', 3, 1, 0, {level: D}),
      P('Md1', 1, 3, 2, {level: S}), P('Md2', 2, 3, 1, {level: S}), P('Md3', 1, 3, 1, {level: C}), P('Md4', 1, 3, 2, {level: D}), P('Md5', 1, 3, 1, {level: C}),
      P('At1', 0, 2, 3, {level: S}), P('At2', 0, 1, 3, {level: C}), P('At3', 1, 2, 3, {level: D}), P('At4', 0, 1, 3, {level: C})],
  },
  {
    id: 'arrivals', name: 'Late arrival and early leaver (7v7)',
    why: 'Max arrives at 15\', Zoe leaves at 35\'. Today\'s engine has no arrival time.',
    format: {players: 7, gk: true, duration: 50, periods: 2, shape: {DEF: 2, MID: 2, ATT: 2}},
    keepers: {mode: 'single', list: ['Ken']},
    availability: {Max: {from: 15}, Zoe: {to: 35}},
    squad: [K('Ken', 1, 1, 1), P('Lia', 3, 2, 1), P('Max', 2, 3, 2), P('Ned', 3, 1, 1), P('Oli', 1, 3, 2), P('Pat', 2, 2, 2), P('Rex', 1, 2, 3), P('Sky', 1, 1, 3), P('Tia', 2, 3, 1), P('Zoe', 2, 2, 2)],
  },
  {
    id: 'specialists', name: 'Specialists with "Do not use"',
    why: 'Several players can only play one area: tests that "Do not use" is never broken.',
    format: {players: 7, gk: true, duration: 50, periods: 2, shape: {DEF: 2, MID: 2, ATT: 2}},
    keepers: {mode: 'single', list: ['Gary']},
    squad: [K('Gary', 0, 0, 0), P('Dan', 3, 0, 0), P('Don', 3, 0, 0), P('Dot', 3, 1, 0), P('Mia', 0, 3, 0), P('Mo', 1, 3, 1), P('Mel', 0, 3, 1), P('Abi', 0, 0, 3), P('Ali', 0, 1, 3), P('Amy', 1, 1, 2)],
  },
  {
    id: 'developing', name: 'Mostly Developing (7v7)',
    why: 'Two Core and seven Developing outfielders: the unit rule can\'t always be met, so breaks must be few and shown.',
    format: {players: 7, gk: true, duration: 50, periods: 2, shape: {DEF: 2, MID: 2, ATT: 2}},
    keepers: {mode: 'single', list: ['Rio']},
    squad: [K('Rio', 1, 1, 1, {level: C}), P('Bo', 2, 3, 2, {level: C}), P('Cy', 3, 2, 1, {level: C}),
      P('Di', 3, 2, 1, {level: D}), P('Ed', 2, 2, 2, {level: D}), P('Flo', 1, 3, 2, {level: D}), P('Gee', 1, 2, 3, {level: D}),
      P('Hal', 2, 2, 2, {level: D}), P('Ina', 1, 2, 3, {level: D}), P('Jem', 3, 1, 1, {level: D})],
  },
  {
    id: 'nogk', name: '5v5 with no keeper',
    why: 'A format without a goalkeeper: every slot is outfield.',
    format: {players: 5, gk: false, duration: 40, periods: 2, shape: {DEF: 2, MID: 1, ATT: 2}},
    keepers: {mode: 'single', list: []},
    squad: [P('Ana', 3, 2, 1), P('Ben', 2, 3, 2), P('Cat', 1, 2, 3), P('Dex', 3, 1, 1), P('Eli', 2, 2, 2), P('Fae', 1, 3, 2), P('Gio', 1, 1, 3)],
  },
  {
    id: 'thirds', name: 'Three periods, three keepers (7v7, 60\')',
    why: 'Thirds with a keeper change each break: keepers who are also good outfielders.',
    format: {players: 7, gk: true, duration: 60, periods: 3, shape: {DEF: 2, MID: 2, ATT: 2}},
    keepers: {mode: 'rotate', list: ['Kip', 'Lev', 'Mae']},
    squad: [K('Kip', 2, 3, 1, {level: S}), K('Lev', 3, 2, 1, {level: C}), K('Mae', 1, 2, 3, {level: C}),
      P('Nat', 3, 2, 1, {level: C}), P('Oto', 2, 3, 2, {level: S}), P('Pru', 1, 2, 3, {level: D}), P('Quy', 2, 2, 2, {level: C}),
      P('Ros', 3, 1, 1, {level: D}), P('Sev', 1, 3, 2, {level: C}), P('Tex', 1, 2, 3, {level: S}), P('Ulf', 2, 2, 1, {level: D})],
  },
];

// The current engine's three built-in styles, run on every benchmark.
const ENGINE_STYLES = {
  Balanced: {fairnessPriority: 0.5, positionStrictness: 0.3, minShiftLength: 8},
  'Fewer subs': {fairnessPriority: 0.2, positionStrictness: 0.5, minShiftLength: 12},
  'Maximum fairness': {fairnessPriority: 0.9, positionStrictness: 0.2, minShiftLength: 5},
};

// Hand-made plans for the midfield squad (section 14 of the design review),
// used to check the scorecard ranks plans the way a coach would.
const MID_SLOTS = [{id: 'GK', group: 'GK', label: 'GK'}, {id: 'DEF1', group: 'DEF', label: 'DEF'}, {id: 'DEF2', group: 'DEF', label: 'DEF'},
  {id: 'MID1', group: 'MID', label: 'MID'}, {id: 'MID2', group: 'MID', label: 'MID'}, {id: 'ATT1', group: 'ATT', label: 'ATT'}, {id: 'ATT2', group: 'ATT', label: 'ATT'}];
const MID_EDGES = [0, 8, 17, 25, 33, 42, 50];
const MW = (d1, d2, m1, m2, a1, a2) => ({GK: 'Sam', DEF1: d1, DEF2: d2, MID1: m1, MID2: m2, ATT1: a1, ATT2: a2});
const REFERENCE_PLANS = {
  staggered: {name: 'Staggered: one Strong and one Developing together, changed one at a time',
    windows: [MW('Eli', 'Dan', 'Ava', 'Cal', 'Hal', 'Ben'), MW('Finn', 'Gus', 'Ava', 'Cal', 'Ike', 'Hal'), MW('Eli', 'Finn', 'Ava', 'Dan', 'Ike', 'Gus'),
      MW('Cal', 'Finn', 'Ben', 'Dan', 'Hal', 'Ava'), MW('Eli', 'Gus', 'Ben', 'Dan', 'Ike', 'Hal'), MW('Eli', 'Finn', 'Ben', 'Cal', 'Ike', 'Gus')]},
  naive: {name: 'Best XI first, then rotate: Ava + Ben, then Cal + Dan',
    windows: [MW('Eli', 'Cal', 'Ava', 'Ben', 'Hal', 'Ike'), MW('Finn', 'Dan', 'Ava', 'Ben', 'Hal', 'Gus'), MW('Eli', 'Finn', 'Ava', 'Ben', 'Ike', 'Gus'),
      MW('Eli', 'Gus', 'Cal', 'Dan', 'Hal', 'Ava'), MW('Finn', 'Gus', 'Cal', 'Dan', 'Ike', 'Ben'), MW('Eli', 'Finn', 'Cal', 'Dan', 'Hal', 'Ike')]},
};

// Today's engine styles and the proposed ethos closest to each.
const NEAREST_ETHOS = {Balanced: 'balanced', 'Fewer subs': 'competitive', 'Maximum fairness': 'development'};

module.exports = { BENCHMARKS, ENGINE_STYLES, REFERENCE_PLANS, MID_SLOTS, MID_EDGES, NEAREST_ETHOS };
