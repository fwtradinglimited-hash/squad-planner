// Builds the human-readable baseline report from tests/reports/baseline.json.
// Usage: node tests/make_report.js [output.html]
const fs = require('fs');
const path = require('path');
const { BENCHMARKS, REFERENCE_PLANS } = require('./benchmarks');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'reports', 'baseline.json'), 'utf8'));
const outFile = process.argv[2] || path.join(__dirname, 'reports', 'baseline.html');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const byId = Object.fromEntries(BENCHMARKS.map(b => [b.id, b]));
const STYLES = ['Balanced', 'Fewer subs', 'Maximum fairness'];
const ETHOS = {development: 'Development', balanced: 'Balanced', competitive: 'Competitive', performance: 'Performance'};
const PLAN_NAMES = {engine: "Today's engine (Balanced)", staggered: 'Staggered pairs', naive: 'Best XI first, then rotate'};
const TIER_WORDS = {0: 'a rule clash', 1: 'a broken guarantee', 2: 'minutes', 3: 'strength', 4: 'positions', 5: 'smoothness', 6: 'a tie'};

const mid = byId.midfield;
const midPlayers = Object.fromEntries(mid.squad.map(p => [p.id, p]));
const lvlClass = p => !p || typeof p.level !== 'number' ? '' : p.level >= 7 ? 'lv-s' : p.level <= 3 ? 'lv-d' : '';

function rotaTable(plan) {
  const segs = plan.segments;
  const slots = segs[0].slots;
  const head = segs.map(s => `<th scope="col"><span class="t">${s.from}'</span><span class="len">${s.to - s.from}'</span></th>`).join('');
  const rows = slots.map(sl => {
    const cells = segs.map((s, i) => {
      const pid = s.onPitch[sl.id];
      const prev = i ? segs[i - 1].onPitch[sl.id] : null;
      const changed = i && prev !== pid;
      return `<td class="${lvlClass(midPlayers[pid])}${changed ? ' ch' : ''}">${esc(pid || '')}</td>`;
    }).join('');
    return `<tr class="${sl.group === 'MID' ? 'mid' : ''}"><th scope="row">${esc(sl.label || sl.group)}</th>${cells}</tr>`;
  }).join('');
  return `<div class="scroll"><table class="rota"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function linesHtml(lines) {
  return `<ul class="lines">${lines.map(l => `<li class="${l.ok ? 'ok' : 'warn'} tier${l.tier}"><span class="tier-tag">${l.tier}</span><span>${esc(l.text)}</span></li>`).join('')}</ul>`;
}

// ---------- findings ----------
const bal = data.results.filter(r => r.ok && r.style === 'Balanced');
const all = data.results.filter(r => r.ok);
const items = (r, code) => r.card.tiers.t1.items.filter(x => x.code === code);
const unitPlans = bal.filter(r => items(r, 'UNIT_FLOOR').length);
const shortEnd = all.filter(r => items(r, 'SHORT_SPELL').some(x => /at the end/.test(x.text)));
const batches = bal.filter(r => items(r, 'TOO_MANY_CHANGES').length);
const outsideBand = bal.filter(r => r.card.tiers.t2.overshoot > 0);
const subsBy = st => { const rs = all.filter(r => r.style === st); return Math.round(rs.reduce((a, r) => a + r.card.tiers.t5.subs, 0) / rs.length); };
const t0Plans = all.filter(r => r.card.tiers.t0.count);
const keeperShort = bal.flatMap(r => Object.entries(r.card.tiers.t2.perPlayer).filter(([id, v]) => v.gk > 0 && v.gk < r.plan.duration && v.outside > 0).map(([id, v]) => `${id} (${r.name}: ${v.basis}' outfield, target ${Math.round(v.target)}')`));
const unitMinutes = r => items(r, 'UNIT_FLOOR').reduce((a, x) => a + x.magnitude, 0);

const findings = [
  {head: `All-Developing units in ${unitPlans.length} of ${bal.filter(r => r.card.withLevels).length} squads that have levels`,
    body: `On Balanced, ${unitPlans.map(r => `${r.name.replace(/ \(.*\)$/, '')} (${unitMinutes(r)}')`).join(', ')}. The midfield case is ${unitMinutes(bal.find(r => r.benchmark === 'midfield'))} minutes of Cal and Dan together. The "Mostly Developing" squad can't avoid it entirely, but today's engine doesn't try.`},
  {head: `Token appearances at the end in ${shortEnd.length} of ${all.length} plans`,
    body: 'A player comes on for the last 1–7 minutes. The scorecard flags any spell more than a minute under the minimum (8\' on Balanced).'},
  {head: `Changes in batches in ${batches.length} of ${bal.length} squads`,
    body: `Balanced allows 2 changes at once during play (period breaks are free). Today's engine regularly makes 3 to 6 at once: everyone reaches the fairness threshold in the same minute.`},
  {head: `Minutes outside the band in ${outsideBand.length} of ${bal.length} squads`,
    body: `Worst: ${outsideBand.slice().sort((a, b) => b.card.tiers.t2.overshoot - a.card.tiers.t2.overshoot).slice(0, 3).map(r => `${r.name} (${r.card.tiers.t2.range[0]}'–${r.card.tiers.t2.range[1]}')`).join(', ')}.`},
  {head: 'Keepers miss out on outfield minutes',
    body: keeperShort.length ? `With keeper time not counting (your decision), a keeper is owed their share of outfield time too. Today's engine doesn't give it: ${keeperShort.join('; ')}.` : 'No keeper fell outside the band.'},
  {head: `Maximum fairness churns: ${subsBy('Maximum fairness')} subs a match on average`,
    body: `Against ${subsBy('Balanced')} on Balanced and ${subsBy('Fewer subs')} on Fewer subs. Most of its broken guarantees are spells under the minimum.`},
  {head: `Rule clashes in ${t0Plans.length} plans, all in the late-arrival squad`,
    body: "Today's engine has no arrival time, so Max plays before he arrives, and Zoe is kept on after she has left. Every other plan passes tier 0: no \"Do not use\" position or keeper rule is ever broken."},
];

// ---------- baseline tables ----------
function cellNum(v, warnIf, critIf) {
  const cls = critIf ? 'crit' : warnIf ? 'warn' : 'good';
  return `<td class="num ${cls}">${v}</td>`;
}
function benchTable(b) {
  const rows = STYLES.map(st => {
    const r = data.results.find(x => x.benchmark === b.id && x.style === st);
    if (!r || !r.ok) return `<tr><th scope="row">${st}</th><td colspan="7">Could not plan: ${esc(r ? r.error : 'missing')}</td></tr>`;
    const t = r.card.tiers;
    const outside = Object.values(t.t2.perPlayer).filter(v => v.outside > 0).length;
    return `<tr><th scope="row">${st}</th>${cellNum(t.t0.count, false, t.t0.count > 0)}${cellNum(`${t.t1.magnitude}' <span class="sub">(${t.t1.count})</span>`, t.t1.magnitude > 0, t.t1.magnitude >= 20)}<td class="num">${t.t2.range[0]}'–${t.t2.range[1]}'</td>${cellNum(outside, outside > 0, outside >= 3)}<td class="num">${t.t3.weakest ? t.t3.weakest.perPlayer : '–'}</td><td class="num">${t.t4.fitPct}%</td><td class="num">${t.t5.subs} <span class="sub">at ${t.t5.subMoments}</span></td></tr>`;
  }).join('');
  const r = data.results.find(x => x.benchmark === b.id && x.style === 'Balanced');
  return `<section class="bench" id="b-${b.id}">
    <h3>${esc(b.name)}</h3>
    <p class="why">${esc(b.why)}</p>
    <div class="scroll"><table class="grid">
      <thead><tr><th scope="col">Today's style</th><th scope="col" title="Tier 0">Rule clashes</th><th scope="col" title="Tier 1">Guarantees broken</th><th scope="col" title="Tier 2">Minutes</th><th scope="col" title="Tier 2">Outside band</th><th scope="col" title="Tier 3">Weakest spell</th><th scope="col" title="Tier 4">Position fit</th><th scope="col" title="Tier 5">Subs</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    ${r && r.ok ? `<details><summary>Balanced scorecard in full</summary>${linesHtml(r.card.lines)}</details>` : ''}
  </section>`;
}

// ---------- midfield comparison ----------
const comp = data.comparisons;
const balancedCards = comp.results.balanced.cards;
const planBlocks = ['staggered', 'naive', 'engine'].map(k => `
  <article class="plan">
    <h3>${esc(PLAN_NAMES[k])}</h3>
    <p class="why">${esc(k === 'engine' ? 'What the app plans today on its Balanced setting.' : REFERENCE_PLANS[k].name.replace(/^[^:]*:\s*/, '').replace(/^./, c => c.toUpperCase()) + '.')}</p>
    ${rotaTable(comp.plans[k])}
    <h4>Scorecard (Balanced)</h4>
    ${linesHtml(balancedCards[k].lines)}
  </article>`).join('');
const rankRows = Object.entries(comp.results).map(([preset, v]) => `<tr><th scope="row">${ETHOS[preset]}</th>
  <td>${v.order.map((k, i) => `<span class="rank r${i}">${i + 1}. ${esc(PLAN_NAMES[k])}</span>`).join('')}</td>
  <td>${v.why.map(w => `${esc(PLAN_NAMES[w.better])} beats ${esc(PLAN_NAMES[w.worse].toLowerCase())} on ${TIER_WORDS[w.tier]} (${esc(w.why)})`).join('. ')}.</td></tr>`).join('');

const sb = data.results.find(x => x.benchmark === 'midfield' && x.style === 'Balanced').spec;

const html = `<title>Scorecard Baseline Review</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Source+Sans+3:wght@400;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>
/* Layout: one reading column; wide tables scroll inside their own frame. Touchline whiteboard: chalk ground, pitch-green ink. */
:root {
  --bg: #f6f8f5; --panel: #ffffff; --ink: #15211a; --muted: #56655c; --line: #d6dfd8;
  --pitch: #1d6a43; --pitch-soft: #e3efe7; --strong: #1f4f8f; --strong-soft: #e2eaf6; --dev: #8a5310; --dev-soft: #f6ead9;
  --good: #2d7a4c; --warn: #9a6a00; --warn-soft: #fbf1d8; --crit: #b42318; --crit-soft: #fbe4e1;
  --display: "Barlow Condensed", "Arial Narrow", "Roboto Condensed", sans-serif;
  --body: "Source Sans 3", "Segoe UI", system-ui, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0f1612; --panel: #16201a; --ink: #e5ece7; --muted: #9db0a4; --line: #2a3830;
  --pitch: #5cc28a; --pitch-soft: #1b3326; --strong: #8db4ee; --strong-soft: #1c2a40; --dev: #e7a95a; --dev-soft: #3a2a14;
  --good: #6fcf97; --warn: #e6b450; --warn-soft: #3a2f12; --crit: #f28b82; --crit-soft: #3d1c1a; color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #0f1612; --panel: #16201a; --ink: #e5ece7; --muted: #9db0a4; --line: #2a3830;
  --pitch: #5cc28a; --pitch-soft: #1b3326; --strong: #8db4ee; --strong-soft: #1c2a40; --dev: #e7a95a; --dev-soft: #3a2a14;
  --good: #6fcf97; --warn: #e6b450; --warn-soft: #3a2f12; --crit: #f28b82; --crit-soft: #3d1c1a; color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font: 400 16px/1.55 var(--body); }
.wrap { max-width: 960px; margin: 0 auto; padding-inline: 16px; padding-block: 28px 64px; display: grid; gap: 40px; }
.prose { max-width: 68ch; }
.wrap > *, .plans > *, .bench > * { min-width: 0; }
header .eyebrow { font: 600 13px/1 var(--body); letter-spacing: .08em; text-transform: uppercase; color: var(--pitch); }
h1 { font: 700 clamp(40px, 7vw, 60px)/1 var(--display); letter-spacing: .01em; margin: 10px 0 14px; text-wrap: balance; }
h2 { font: 700 30px/1.1 var(--display); letter-spacing: .01em; margin: 0 0 12px; text-wrap: balance; }
h3 { font: 600 22px/1.15 var(--display); letter-spacing: .01em; margin: 0 0 4px; }
h4 { font: 700 13px/1 var(--body); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 16px 0 8px; }
p { margin: 0 0 12px; }
.lede { font-size: 18px; color: var(--muted); }
.why { color: var(--muted); margin: 0 0 10px; }
.callout { border: 2px solid var(--pitch); background: var(--pitch-soft); padding: 16px 18px; border-radius: 6px; }
.callout strong { color: var(--pitch); }
.tiers { display: grid; gap: 0; border-top: 1px solid var(--line); }
.tier-row { display: grid; grid-template-columns: 44px 1fr; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.tier-row .n { font: 700 34px/1 var(--display); color: var(--pitch); text-align: center; }
.tier-row h3 { font-size: 20px; }
.tier-row p { margin: 2px 0 0; color: var(--muted); }
.tier-row .nums { font-family: var(--mono); font-size: 13px; color: var(--ink); }
.scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
.rota { font: 400 13px/1.2 var(--mono); }
.rota th, .rota td { border: 1px solid var(--line); padding: 6px 7px; text-align: center; white-space: nowrap; }
.rota thead th { background: var(--panel); font-weight: 600; }
.rota thead .t { display: block; }
.rota thead .len { display: block; color: var(--muted); font-size: 11px; font-weight: 400; }
.rota tbody th { text-align: left; color: var(--muted); font-weight: 600; background: var(--panel); }
.rota tr.mid th { color: var(--pitch); }
.rota tr.mid td { border-top: 2px solid var(--pitch); border-bottom: 2px solid var(--pitch); }
.rota td { background: var(--panel); }
.rota td.lv-s { background: var(--strong-soft); color: var(--strong); font-weight: 600; }
.rota td.lv-d { background: var(--dev-soft); color: var(--dev); font-weight: 600; }
.rota td.ch { box-shadow: inset 3px 0 0 var(--pitch); }
.legend { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 14px; color: var(--muted); margin: 8px 0 0; }
.chip { display: inline-block; padding: 1px 8px; border-radius: 4px; font: 600 12px/1.6 var(--mono); }
.chip.s { background: var(--strong-soft); color: var(--strong); }
.chip.d { background: var(--dev-soft); color: var(--dev); }
.chip.c { box-shadow: inset 3px 0 0 var(--pitch); background: var(--panel); color: var(--ink); }
.plans { display: grid; gap: 28px; }
.plan { min-width: 0; }
.lines { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.lines li { display: grid; grid-template-columns: 26px 1fr; gap: 10px; align-items: start; padding: 6px 10px; border-radius: 4px; background: var(--panel); border: 1px solid var(--line); }
.lines li.warn { background: var(--warn-soft); border-color: transparent; }
.lines li.tier0.warn, .lines li.tier1.warn { background: var(--crit-soft); }
.tier-tag { font: 700 14px/22px var(--display); text-align: center; border-radius: 3px; background: var(--line); color: var(--ink); }
.lines li.warn .tier-tag { background: var(--warn); color: var(--panel); }
.lines li.tier0.warn .tier-tag, .lines li.tier1.warn .tier-tag { background: var(--crit); }
.grid { width: 100%; min-width: 640px; font-size: 14px; }
.grid th, .grid td { padding: 7px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.grid thead th { font: 700 12px/1.2 var(--body); letter-spacing: .04em; text-transform: uppercase; color: var(--muted); border-bottom: 2px solid var(--ink); }
.grid td.num { font-family: var(--mono); text-align: right; white-space: nowrap; }
.grid td.good { color: var(--good); }
.grid td.warn { color: var(--warn); font-weight: 600; }
.grid td.crit { color: var(--crit); font-weight: 600; }
.grid .sub { color: var(--muted); font-weight: 400; }
.rank { display: block; }
.rank.r0 { font-weight: 700; color: var(--pitch); }
.bench { display: grid; gap: 6px; padding-top: 18px; border-top: 1px solid var(--line); }
details summary { cursor: pointer; color: var(--pitch); font-weight: 600; padding: 6px 0; }
details summary:focus-visible { outline: 2px solid var(--pitch); outline-offset: 2px; }
details .lines { margin-top: 6px; }
.findings { display: grid; gap: 14px; }
.finding { display: grid; gap: 2px; padding-left: 14px; border-left: 3px solid var(--warn); }
.finding.good { border-left-color: var(--good); }
.finding strong { font-size: 17px; }
.finding span { color: var(--muted); }
ol.asks { padding-left: 22px; display: grid; gap: 10px; margin: 0; }
ol.asks li::marker { font: 700 18px var(--display); color: var(--pitch); }
.toc { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 14px; }
.toc a { color: var(--pitch); }
footer { color: var(--muted); font-size: 13px; }
@media (max-width: 560px) { .tier-row { grid-template-columns: 34px 1fr; } .tier-row .n { font-size: 28px; } }
</style>
<div class="wrap">
<header class="prose">
  <div class="eyebrow">Engine redesign · Phase 2 review</div>
  <h1>Scorecard Baseline</h1>
  <p class="lede">The new scorecard marks any plan against your rules, tier by tier, and says why. Here it marks three plans for your midfield squad and every plan today's engine makes for 14 test squads. Nothing in the app has changed yet.</p>
  <div class="callout"><strong>What I need from you:</strong> check that the scorecard ranks plans the way you would. If it does, I build the new planner on top of it. If it doesn't, we fix the scorecard first, because the planner will chase whatever the scorecard rewards.</div>
</header>

<section class="prose" aria-labelledby="h-tiers">
  <h2 id="h-tiers">How a plan is judged</h2>
  <p>A higher tier always wins. Each tier leaves a little room so the tiers below can still improve the plan. Numbers shown are the proposed Balanced ethos for a 50-minute 7v7 match; other ethos settings move the numbers, never the order.</p>
  <div class="tiers">
    <div class="tier-row"><div class="n">0</div><div><h3>Rules that can't be broken</h3><p>One player per position, the right numbers, no "Do not use" positions, only keepers in goal, nobody playing when they aren't there, caps and league minimums.</p></div></div>
    <div class="tier-row"><div class="n">1</div><div><h3>Guarantees</h3><p>Broken as little as possible, and every break is listed.</p><p class="nums">Minute floor ${Math.round(sb.floorFrac * 100)}% of an equal share · no all-Developing unit · rest at most ${sb.maxTimeOff}' · spells at least ${sb.minSpell}' · at most ${sb.maxChangesPerStoppage} changes at once during play (period breaks are free)</p></div></div>
    <div class="tier-row"><div class="n">2</div><div><h3>Minutes</h3><p>Each player's minutes against their target. Inside the band costs nothing; outside it, the cost grows quickly. Keeper time doesn't count, so keepers are owed outfield time too.</p><p class="nums">Band ± ${sb.band}' around each target</p></div></div>
    <div class="tier-row"><div class="n">3</div><div><h3>Strength</h3><p>Level × position fit for everyone on the pitch. Balanced lifts the weakest spell towards the average, with some weight on the first and last minutes. Shown per player on the 0–10 level scale.</p></div></div>
    <div class="tier-row"><div class="n">4</div><div><h3>Positions</h3><p>How well players fit where they play (Preferred 1.0, Comfortable 0.85, Can play 0.6), plus variety and "plays well with" or "keep apart" pairs when set.</p></div></div>
    <div class="tier-row"><div class="n">5</div><div><h3>Smoothness</h3><p>Fewer stoppages, fewer subs and position moves, and keeping the plan the coach has already seen.</p></div></div>
  </div>
</section>

<section aria-labelledby="h-mid">
  <div class="prose">
    <h2 id="h-mid">Your midfield squad: three plans</h2>
    <p>Sam in goal all match. Ava and Ben are Strong midfielders, Cal and Dan are Developing. Everyone else is level 5 (not set). The midfield rows are outlined.</p>
    <div class="legend"><span><span class="chip s">Ava</span> Strong</span><span><span class="chip d">Cal</span> Developing</span><span><span class="chip c">Name</span> came on or moved at this point</span></div>
  </div>
  <div class="plans" style="margin-top:18px">${planBlocks}</div>
  <h3 style="margin-top:28px">Which plan wins, by ethos</h3>
  <div class="scroll"><table class="grid">
    <thead><tr><th scope="col">Ethos</th><th scope="col">Ranking</th><th scope="col">Why</th></tr></thead>
    <tbody>${rankRows}</tbody></table></div>
  <p class="why prose" style="margin-top:10px">The two hand-made plans aren't optimised: both make 3 changes at once twice, which Balanced flags. The new planner will do better than both. These plans are here to test the judge, not to be the answer.</p>
</section>

<section class="prose" aria-labelledby="h-found">
  <h2 id="h-found">What it found in today's engine</h2>
  <div class="findings">${findings.map(f => `<div class="finding"><strong>${esc(f.head)}</strong><span>${esc(f.body)}</span></div>`).join('')}</div>
</section>

<section aria-labelledby="h-bench">
  <div class="prose">
    <h2 id="h-bench">Today's engine on 14 test squads</h2>
    <p>Each squad was planned with today's three styles and marked against the proposed Balanced ethos. "Guarantees broken" is the total size of the breaks in minutes, with the number of breaks in brackets. "Subs" is the number of substitutions, then how many separate stoppages they need during play.</p>
    <nav class="toc" aria-label="Squads">${BENCHMARKS.map(b => `<a href="#b-${b.id}">${esc(b.name)}</a>`).join('')}</nav>
  </div>
  ${BENCHMARKS.map(benchTable).join('')}
</section>

<section class="prose" aria-labelledby="h-ask">
  <h2 id="h-ask">Questions for you</h2>
  <ol class="asks">
    <li><strong>The order of the tiers.</strong> Rules, then guarantees, then minutes, then strength, then positions, then smoothness. Does that match how you'd judge a plan from the touchline?</li>
    <li><strong>The midfield ranking.</strong> The staggered plan wins under every ethos, and today's engine comes last under three of the four. Is that your judgement too?</li>
    <li><strong>The Balanced numbers.</strong> A ± ${sb.band}' band, a floor of ${Math.round(sb.floorFrac * 100)}% of an equal share, no rest longer than ${sb.maxTimeOff}', no spell shorter than ${sb.minSpell}', and at most ${sb.maxChangesPerStoppage} changes at once during play. Too strict, too loose, or about right?</li>
    <li><strong>Changes at period breaks.</strong> I've made changes at half-time (and quarter breaks) free of the "at once" limit, because play has stopped anyway. Agree?</li>
    <li><strong>Keepers.</strong> With keeper time not counting, the scorecard expects a keeper who kept goal for a half to get a full outfield share in the other half as well. Is that what you want?</li>
  </ol>
</section>

<footer class="prose">Generated ${esc(new Date(data.generated).toUTCString())} from the benchmark run. Regenerated after each phase, so the new planner can be compared against this baseline.</footer>
</div>`;

fs.writeFileSync(outFile, html);
console.log('wrote', outFile, html.length, 'bytes');
