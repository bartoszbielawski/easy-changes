import { parseProgression, rankOptions, arrangeChoices, guessKey, keyName } from './progression.js';
import { renderDiagram } from './diagram.js';
import { LEVELS, levelFor } from './difficulty.js';
import { renderLegend } from './legend.js';
import { getAccidentals, setAccidentals } from './prefs.js';
import { getChord } from './chords.js';
import { suggestScales, scalePositions, handFretOf, makeScale } from './scales.js';
import { renderFretboard } from './fretboard.js';
import { analyzeProgression, FUNCTION_NAMES } from './analysis.js';
import { loadJson } from './data.js';
import { parseNote } from './theory.js';

const songData = await loadJson('songs.json');

const $ = sel => document.querySelector(sel);
const EXAMPLES = ['C G Am F', 'Bb Gm Eb F', 'F#m D A E', 'Dm7 G7 Cmaj7 A7', 'Ab Fm Db Eb', 'Em C G D'];
// Harder real-world progressions to try the optimizer on (data/songs.json).
const SONGS = songData.songs;

let result = null;
let altIndex = 0;   // which of the top-3 combinations is shown for the selected key/capo
let scaleIndex = 0; // which suggested scale is shown
let positionIndex = 0;
// Selection is by identity (shift or capo), since rankings re-sort when options change.
let selected = { list: 'keys', shift: 0 };
const isSelected = (o, list) => selected.list === list && (list === 'keys' ? o.shift === selected.shift : o.capo === selected.capo);

$('#examples').insertAdjacentHTML('afterbegin',
  EXAMPLES.map(e => `<button type="button" data-example="${e}">${e}</button>`).join(''));
// Songs are grouped by style, in the order the data file first mentions each style.
for (const style of new Set(SONGS.map(s => s.style))) {
  const group = document.createElement('optgroup');
  group.label = style;
  SONGS.forEach((s, i) => { if (s.style === style) group.append(new Option(`${s.title} · ${s.by}`, i)); });
  $('#song').append(group);
}
// Compare chord text by its chords, so spacing or bar lines don't hide a match.
const chordKey = text => String(text).split(/[\s,|]+/).filter(Boolean).join(' ');

function fillKeySelect(guess) {
  const current = $('#key').value;
  const acc = $('#accidentals').value;
  const opts = [`<option value="auto">Auto${guess ? ` (${keyName(guess.tonicPc, guess.minor, acc)})` : ''}</option>`];
  for (const minor of [false, true]) {
    for (let pc = 0; pc < 12; pc++) opts.push(`<option value="${pc}${minor ? 'm' : ''}">${keyName(pc, minor, acc)}</option>`);
  }
  $('#key').innerHTML = opts.join('');
  $('#key').value = current || 'auto';
}

function readOptions() {
  const k = $('#key').value;
  return {
    key: k === 'auto' ? null : { tonicPc: parseInt(k, 10), minor: k.endsWith('m') },
    maxDifficulty: Number($('#max').value),
    avoid: $('#avoid').value.split(/[\s,]+/).filter(Boolean),
    maxCapo: Math.max(0, Math.min(11, Number($('#max-capo').value) || 0)),
    barres: $('#barres').value,
    simplify: $('#simplify').checked,
    inversions: $('#inversions').checked,
    loop: $('#loop').checked,
    accidentals: $('#accidentals').value,
    durations: parseProgression($('#prog').value).durations,
  };
}

// "2 bars", "½ bar", "1½ bars" for a length in bars.
const FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
function barsLabel(d) {
  const whole = Math.floor(d), frac = Math.round((d - whole) * 100) / 100;
  const third = Math.abs(frac - 1 / 3) < 0.01 ? '⅓' : Math.abs(frac - 2 / 3) < 0.01 ? '⅔' : null;
  const text = frac === 0 ? String(whole)
    : (FRACTIONS[frac] ?? third) ? `${whole || ''}${FRACTIONS[frac] ?? third}` : fmt1(d);
  return `${text} bar${d > 1 ? 's' : ''}`;
}

const fmt1 = x => (Math.round(x * 10) / 10).toString();

const levelIndex = o => LEVELS.findIndex(l => l.id === o.arrangement.level);

const levelBadge = (score, title) => {
  const l = levelFor(score);
  return `<span class="badge ${l.id}" title="${title ?? `Hardest chord scores ${fmt1(score)}`}">${l.name}</span>`;
};

// Effort relative to a reference (the top-ranked option): "+27%", "−8%" or "same".
function relEffort(cost, ref) {
  const pct = Math.round((cost / ref - 1) * 100);
  return pct === 0 ? 'same' : pct > 0 ? `+${pct}%` : `−${-pct}%`;
}

function optionRow(opt, list, index, best, range) {
  const a = opt.arrangement;
  const label = list === 'keys'
    ? `${opt.key} <small>${opt.shift === 0 ? 'original' : (opt.shift > 0 ? '+' : '') + opt.shift}</small>`
    : `${opt.capo === 0 ? 'No capo' : `Capo ${opt.capo}`} <small>${opt.shapesKey} shapes</small>`;
  const chords = opt.chords.map((c, i) => a.feasible && a.steps[i].played !== c.symbol ? `<s>${c.symbol}</s>→${a.steps[i].played}` : c.symbol);
  // Bar spans the range between the least and most effort shown, so differences are visible.
  const bar = a.feasible ? 12 + 88 * (a.cost - range.min) / Math.max(1e-9, range.max - range.min) : 0;
  return `<li><button type="button" class="option${a.feasible ? '' : ' infeasible'}" data-list="${list}" data-index="${index}" aria-pressed="${isSelected(opt, list)}">
    <span class="opt-label">${label}</span>
    <span class="opt-chords">${[...new Set(chords)].join(' ')}</span>
    ${a.feasible
      ? `<span class="opt-meter"><span style="width:${bar}%"></span></span>
         <span class="opt-score" title="Total effort ${a.cost.toFixed(1)}, relative to the top pick"><span class="badge ${a.level}" title="Can be played at ${a.levelName} level">${a.levelName}</span> <span class="effort">${index === 0 && opt.arrangement.cost === best ? 'top pick' : relEffort(a.cost, best)}</span></span>`
      : `<span class="opt-score">can't play ${[...new Set(a.unplayable)].join(', ')}</span>`}
  </button></li>`;
}

function renderRankings() {
  const all = [...result.keys, ...result.capos].filter(o => o.arrangement.feasible);
  // Both lists are sorted easiest first; effort is shown relative to the overall top option.
  const top = [result.keys[0], result.capos[0]].filter(o => o.arrangement.feasible)
    .sort((x, y) => levelIndex(x) - levelIndex(y) || x.arrangement.cost - y.arrangement.cost)[0];
  const best = top ? top.arrangement.cost : 1;
  const costs = all.map(o => o.arrangement.cost);
  const range = { min: Math.min(...costs), max: Math.max(...costs) };
  $('#keys').innerHTML = result.keys.map((o, i) => optionRow(o, 'keys', i, best, range)).join('');
  $('#capos').innerHTML = result.capos.map((o, i) => optionRow(o, 'capos', i, best, range)).join('');
}

function renderArrangement() {
  writeHash();
  const opt = result[selected.list].find(o => isSelected(o, selected.list));
  const title = selected.list === 'keys'
    ? `In ${opt.key}${opt.shift ? ` (${opt.shift > 0 ? 'up' : 'down'} ${Math.abs(opt.shift)} semitone${Math.abs(opt.shift) > 1 ? 's' : ''})` : ''}`
    : opt.capo ? `Capo ${opt.capo}, play ${opt.shapesKey} shapes, sounds in ${opt.key}` : `No capo, in ${opt.key}`;
  if (!opt.arrangement.feasible) {
    $('#arrangement').innerHTML = `<h2>${title}</h2><p class="hint">No voicing of ${opt.arrangement.unplayable.join(', ')} fits the current limits. Try raising the difficulty cap or allowing simpler chords.</p>`;
    $('#scales').innerHTML = '';
    return;
  }
  const alts = arrangeChoices(opt.chords, readOptions(), 3);
  if (altIndex >= alts.length) altIndex = 0;
  const a = alts[altIndex];
  const best = alts[0];
  const differs = (alt, i) => alt.steps[i].voicing.tab !== best.steps[i].voicing.tab || alt.steps[i].played !== best.steps[i].played;
  const sounding = selected.list === 'capos' && opt.capo ? parseProgression($('#prog').value).chords : null;

  $('#arrangement').innerHTML = `
    <h2>${title}</h2>
    <ol class="alts" aria-label="Best voicing combinations">
      ${alts.map((alt, k) => `<li><button type="button" class="alt" data-alt="${k}" aria-pressed="${k === altIndex}">
        <span class="alt-rank">#${k + 1}</span>
        <span class="alt-main">
          <span class="alt-style" title="${STYLE_TIPS[alt.style.id]}">${alt.style.name}</span>
          <span class="alt-tabs">${alt.steps.map((s, i) => `<span class="${k > 0 && differs(alt, i) ? 'diff' : ''}" title="${s.played}">${s.voicing.tab}</span>`).join('')}</span>
        </span>
        <span class="alt-cost">${levelBadge(alt.maxDifficulty)} <span class="effort" title="Total effort ${alt.cost.toFixed(1)}">${k === 0 ? 'best' : relEffort(alt.cost, best.cost).replace('easiest', 'same')}</span></span>
      </button></li>`).join('')}
    </ol>
    <p class="hint">${summarize(a)} · ${a.substitutions ? `${a.substitutions} simplified · ` : ''}${a.steps.filter(s => s.how === 'inversion').length ? `${a.steps.filter(s => s.how === 'inversion').length} inverted · ` : ''}${opt.capo ? 'fret numbers count from the capo' : 'standard tuning'}${altIndex > 0 ? ' · highlighted chords differ from #1' : ''}</p>
    <div class="sequence">${a.steps.map((s, i) => `
      ${i > 0 ? moveLabel(s.move) : ''}
      <figure class="voicing${altIndex > 0 && differs(a, i) ? ' differs' : ''}">
        <div class="step-name">${s.played}${s.played !== s.input ? ` <small>${s.how === 'inversion' ? 'inversion of' : 'for'} ${s.input}</small>` : ''}${s.duration !== 1 ? ` <small class="bars" title="Lasts ${barsLabel(s.duration)}. Changing chords costs the same however long a chord lasts, but holding a grip is work too: this one counts ${s.heldEffort >= 0 ? `${fmt1(s.heldEffort)} more` : `${fmt1(-s.heldEffort)} less`} than a one-bar chord.">${barsLabel(s.duration)}</small>` : ''}</div>
        ${sounding ? `<div class="sounds">sounds ${sounding[i].symbol}</div>` : ''}
        ${renderDiagram(s.voicing)}
        <figcaption>
          <span class="badge ${levelFor(s.difficulty).id}" title="Difficulty for you: ${fmt1(s.difficulty)} on the 1-10 chord scale">${levelFor(s.difficulty).name} · ${fmt1(s.difficulty)}</span>
          ${s.gripKept ? `<span class="reasons" title="Only ${fmt1(s.effort)} of its ${fmt1(s.difficulty)} difficulty counts, since fingers stay or slide from the previous chord">grip carried over: ${fmt1(s.effort)}</span>` : ''}
          <span class="tab">${s.voicing.tab}</span>
        </figcaption>
      </figure>`).join('')}
    </div>`;
  renderScales(opt, a);
}

// ---- Harmony --------------------------------------------------------------------

const KIND_LABEL = { secondary: 'secondary dominant', borrowed: 'borrowed', chromatic: 'chromatic', tonicized: 'brief key change' };
const FN_SHORT = { T: 'tonic', S: 'subdominant', D: 'dominant' };

function renderHarmony(chords) {
  const opts = readOptions();
  const h = analyzeProgression(chords, { key: opts.key, loop: opts.loop });
  const keyLabel = keyName(h.key.tonicPc, h.key.minor, opts.accidentals).replace(/m$/, ' minor').replace(/^([A-G][#b]?)$/, '$1 major');
  const alts = h.alternatives.map(k => keyName(k.tonicPc, k.minor, opts.accidentals).replace(/m$/, ' minor').replace(/^([A-G][#b]?)$/, '$1 major'));
  const notes = [
    ...h.patterns.map(p => `<li><strong>${p.name}</strong>: ${p.desc}${p.how === 'exactly' ? '' : ` (${p.how})`}.</li>`),
    ...h.steps.filter((s, i, all) => s.note && all.findIndex(x => x.symbol === s.symbol) === i)
      .map(s => `<li><strong>${s.symbol}</strong> (${s.label ?? s.numeral}): ${s.note}.</li>`),
    ...(h.cadence ? [`<li>Ends with a <strong>${h.cadence.name}</strong>: ${h.cadence.desc}.</li>`] : []),
  ];

  $('#harmony').innerHTML = `
    <h2>Harmony</h2>
    <p class="hint">In <strong>${keyLabel}</strong>${h.detected ? ' (detected' + (alts.length ? `; could also be heard in ${alts.join(' or ')}` : '') + ')' : ''}.
      Roman numerals give each chord's place in the key, so they stay the same when you transpose.</p>
    <div class="h-flow">${h.steps.map((s, i) => `
      <div class="h-chord ${s.kind} fn-${s.fn ?? 'none'}" title="${s.fn ? FUNCTION_NAMES[s.fn] : 'no clear function'}${s.note ? ' · ' + s.note : ''}">
        <span class="h-sym">${s.symbol}</span>
        <span class="h-num">${s.label ?? s.numeral}</span>
        <span class="h-fn">${KIND_LABEL[s.kind] ?? (s.fn ? FN_SHORT[s.fn] : '')}</span>
      </div>
      ${s.motion ? `<div class="h-move ${s.motion.strength}" title="Root ${s.motion.text}${s.motion.strength === 'strong' ? ': a fifth down, the strongest pull in tonal music' : ''}">${s.motion.short}${i === h.steps.length - 1 ? '<small>repeat</small>' : ''}</div>` : ''}`).join('')}
    </div>
    <p class="h-key"><span class="k-T">tonic: home</span><span class="k-S">subdominant: moving away</span><span class="k-D">dominant: tension that wants to resolve</span><span class="k-out">dashed: from outside the key</span><span><b>↑4</b> root up a 4th (down a 5th), the strongest pull</span></p>
    ${notes.length ? `<ul class="h-notes">${notes.join('')}</ul>` : ''}`;
}

// ---- Scales ---------------------------------------------------------------------

function renderScales(opt, a) {
  const acc = $('#accidentals').value;
  const chords = a.steps.map(s => getChord(s.played));
  // Key of the chords actually fingered: shifted for a key change, lowered for a capo.
  const tonicPc = result.key.tonicPc + (selected.list === 'keys' ? opt.shift : -opt.capo);
  const scales = suggestScales(chords, { tonicPc, minor: result.key.minor }, { accidentals: acc, limit: 6 });
  if (scaleIndex >= scales.length) scaleIndex = 0;
  const sc = scales[scaleIndex];
  const positions = scalePositions(sc, { handFret: handFretOf(a.steps.map(s => s.voicing)) });
  if (positionIndex >= positions.length) positionIndex = 0;
  const pos = positions[positionIndex] ?? null;
  const sounds = opt.capo ? makeScale(sc.rootPc + opt.capo, sc.type, acc).name : null;
  const ease = t => t.family === 'pentatonic' ? 'easiest' : t.size <= 6 ? 'easy' : t.size === 7 ? '7 notes' : `${t.size} notes`;

  $('#scales').innerHTML = `
    <h2>Scales to play over it</h2>
    <p class="hint">For soloing or writing a melody over these chords${opt.capo ? `, as shapes with capo ${opt.capo}` : ''}. Pentatonic scales leave out the notes most likely to clash, so they're the easiest place to start.</p>
    <ol class="alts scale-list">
      ${scales.map((s, k) => `<li><button type="button" class="alt scale-row" data-scale="${k}" aria-pressed="${k === scaleIndex}">
        <span class="alt-rank">#${k + 1}</span>
        <span class="scale-main"><strong>${s.name}</strong>${s.aka.length ? ` <small>= ${s.aka[0]}</small>` : ''}<br><small class="scale-notes">${s.notes.join(' ')} · ${s.type.feel}</small></span>
        <span class="alt-cost"><span class="badge ${s.clash === 0 ? 'beginner' : s.clash < 1 ? 'improver' : s.clash < 2 ? 'intermediate' : 'advanced'}" title="How well it fits every chord">${s.verdict}</span><span class="effort">${ease(s.type)}</span></span>
      </button></li>`).join('')}
    </ol>

    <h3>${sc.name} over each chord${sounds ? ` <small>(sounds as ${sounds})</small>` : ''}</h3>
    <ul class="per-chord">
      ${sc.perChord.map(p => `<li class="${p.alternative ? 'misfit' : ''}">
        <span class="pc-chord">${p.chord}</span>
        <span class="pc-body">${p.mode ? `plays as <strong>${p.mode}</strong> · ` : ''}hits ${p.hits.join(', ') || 'none'} of the chord${p.misses.length ? ` (not ${p.misses.join(', ')})` : ''}${p.clashes.length
          ? ` · watch ${p.clashes.map(c => `<span class="watch" title="${c.reason}">${c.note}</span>`).join(', ')}`
          : ' · no clashes'}${p.alternative
          ? `<br>better: <strong>${p.alternative.name}</strong> (${p.alternative.added.join(', ')} instead of ${p.alternative.removed.join(', ')})`
          : ''}</span>
      </li>`).join('')}
    </ul>

    <div class="fb-head">
      <h3>Where to play it</h3>
      <div class="picker positions" role="group" aria-label="Hand position">
        ${positions.map((p, k) => `<button type="button" data-position="${k}" aria-pressed="${k === positionIndex}" title="Frets ${p.from}–${p.to}">${p.from === 0 ? 'Open' : `Fret ${p.from}`}</button>`).join('')}
      </div>
    </div>
    <div class="fb-wrap">${renderFretboard(sc, { position: pos })}</div>
    <p class="hint">Filled notes are the root (${sc.root}). ${pos ? `The highlighted box (frets ${pos.from}–${pos.to}) has every string covered without moving your hand${positionIndex === 0 ? ', chosen to be close to where you play the chords' : ''}.` : ''}${opt.capo ? ' Fret numbers count from the capo.' : ''}</p>`;
}

// One sentence on what makes this arrangement as hard as it is.
function summarize(a) {
  const hardest = a.steps.reduce((m, s) => (s.difficulty > m.difficulty ? s : m));
  const moves = a.steps.slice(1).map(s => s.move);
  const easyMoves = moves.filter(m => m.kind === 'stay' || m.kind === 'slide').length;
  const jumps = moves.filter(m => m.regrip && m.shift >= 3).length;
  const used = levelFor(a.maxDifficulty);
  const parts = [`<strong>${used.name}</strong>: hardest chord ${hardest.played} ${hardest.voicing.tab} (${fmt1(hardest.difficulty)})`];
  if (used.id !== a.level) parts.push(`playable at ${a.levelName} level too: set <em>My level</em> to ${a.levelName} for easier chords`);
  if (moves.length) parts.push(`${easyMoves} of ${moves.length} changes keep the grip or slide`);
  if (jumps) parts.push(`${jumps} jump${jumps > 1 ? 's' : ''} along the neck with a new grip`);
  return parts.join(' · ');
}

// Tooltips for the style label on each of the top 3.
const STYLE_TIPS = {
  open: 'Most chords in open position: frets 1-4, open strings, no full barres',
  barre: 'Most chords are barre shapes, which move to any key unchanged',
  neck: 'Most chords from the 5th fret up, where the hand can stay in one place',
  mixed: 'A mix of open chords, barres and higher positions',
};

const MOVE_TEXT = { stay: 'stay', slide: 'slide', partial: 'shift', regrip: 'change' };

function moveLabel(m) {
  const parts = [['stay', 'stay put'], ['adjust', 'adjust barre'], ['slide', 'slide'], ['guide', 'guide'], ['regrip', 'regrip']]
    .filter(([k]) => m[k]).map(([k, label]) => `${m[k]} ${label}`);
  const title = `${parts.join(', ') || 'no fingers'}${m.shift ? ` · hand moves ${m.shift} fret${m.shift === 1 ? '' : 's'}` : ''} · cost ${m.cost.toFixed(2)}`;
  const detail = m.kind === 'slide' && m.shift ? `${m.shift} fr` : m.cost ? m.cost.toFixed(1) : '';
  return `<div class="move ${m.kind}" title="${title}">→<small>${MOVE_TEXT[m.kind]}</small>${detail ? `<small>${detail}</small>` : ''}</div>`;
}

function update() {
  const text = $('#prog').value;
  writeHash();
  // The picker names a song only while the chords are still that song's.
  const song = SONGS.findIndex(s => chordKey(s.chords) === chordKey(text));
  $('#song').value = song < 0 ? '' : String(song);
  const { chords, errors } = parseProgression(text);
  $('#prog-errors').textContent = errors.length ? `Not recognised: ${errors.join(', ')}` : '';
  fillKeySelect(guessKey(chords, { loop: $('#loop').checked }));
  if (!chords.length) {
    result = null;
    $('#keys').innerHTML = $('#capos').innerHTML = $('#arrangement').innerHTML = $('#scales').innerHTML = $('#harmony').innerHTML = '';
    return;
  }
  renderHarmony(chords);
  result = rankOptions(chords, readOptions());
  altIndex = 0;
  scaleIndex = 0;
  positionIndex = 0;
  if (!result[selected.list].some(o => isSelected(o, selected.list))) selected = { list: 'keys', shift: 0 };
  renderRankings();
  renderArrangement();
}

// Start on the original key so the first view answers "how do I play this as written?"
function loadProgression(text) {
  $('#prog').value = text;
  $('#key').value = 'auto';
  update();
  selectOriginal();
}

function selectOriginal() {
  selected = { list: 'keys', shift: 0 };
  altIndex = 0;
  scaleIndex = 0;
  positionIndex = 0;
  renderRankings();
  renderArrangement();
}

$('#accidentals').value = getAccidentals();
$('#prog-form').addEventListener('input', e => {
  if (e.target.id === 'song') { if (e.target.value) loadProgression(SONGS[e.target.value].chords); return; }
  if (e.target.id === 'accidentals') setAccidentals(e.target.value);
  update();
  if (e.target.id === 'prog' && result) selectOriginal();
});
$('#prog-form').addEventListener('submit', e => e.preventDefault());
document.addEventListener('click', e => {
  const ex = e.target.closest('[data-example]');
  if (ex) { loadProgression(ex.dataset.example); return; }
  const alt = e.target.closest('button.alt');
  const scaleBtn = e.target.closest('button[data-scale]');
  if (scaleBtn) { scaleIndex = Number(scaleBtn.dataset.scale); positionIndex = 0; renderArrangement(); return; }
  const posBtn = e.target.closest('button[data-position]');
  if (posBtn) { positionIndex = Number(posBtn.dataset.position); renderArrangement(); return; }
  if (alt) { altIndex = Number(alt.dataset.alt); positionIndex = 0; renderArrangement(); return; }
  const opt = e.target.closest('button.option');
  if (opt) {
    const o = result[opt.dataset.list][Number(opt.dataset.index)];
    selected = { list: opt.dataset.list, shift: o.shift, capo: o.capo };
    altIndex = 0;
    scaleIndex = 0;
    positionIndex = 0;
    renderRankings();
    renderArrangement();
    $('#arrangement').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

$('#legend').innerHTML = renderLegend({ effort: true });

// ---- Shareable address ------------------------------------------------------------
// The address holds the chords, every setting that differs from its default, and the
// chosen key or capo, so a shared link opens the view it was copied from:
//   #chords=C+G+Am+F&level=beginner&barres=easy&capo=3
// Older links held only the chord text (#C%20G%20Am%20F); those still open, with
// default settings. Sharps/flats stay a per-browser preference and aren't included.

// Values from a link are untrusted: anything a control can't hold keeps its default.
const textField = sel => ({ get: () => $(sel).value, set: v => { $(sel).value = v; } });
const choice = sel => ({
  get: () => $(sel).value,
  set: v => { if ([...$(sel).options].some(o => o.value === v)) $(sel).value = v; },
});
const number = (sel, min, max) => ({
  get: () => $(sel).value,
  set: v => { if (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max) $(sel).value = v; },
});
const box = sel => ({ get: () => ($(sel).checked ? '1' : '0'), set: v => { $(sel).checked = v === '1'; } });
const SETTINGS = {
  level: {
    get: () => LEVELS[$('#max').selectedIndex].id,
    set: v => { const i = LEVELS.findIndex(l => l.id === v); if (i >= 0) $('#max').selectedIndex = i; },
  },
  barres: choice('#barres'),
  avoid: textField('#avoid'),
  maxcapo: number('#max-capo', 0, 11),
  key: {
    // Named in the link ("Am"), stored in the picker as pitch class + minor flag ("9m").
    get: () => { const k = $('#key').value; return !k || k === 'auto' ? 'auto' : keyName(parseInt(k, 10), k.endsWith('m')); },
    set: v => {
      const m = /^([A-G][#b]?)(m?)$/.exec(v);
      const note = m && parseNote(m[1]);
      $('#key').value = note ? `${note.pc}${m[2]}` : 'auto';
    },
  },
  simpler: box('#simplify'),
  inversions: box('#inversions'),
  repeat: box('#loop'),
};
// Read before any link is applied, so these are the page's own defaults.
const DEFAULTS = Object.fromEntries(Object.entries(SETTINGS).map(([name, s]) => [name, s.get()]));

// Keep the address readable: spaces as '+', and / : | , as they are.
const enc = v => encodeURIComponent(v).replace(/%20/g, '+').replace(/%(2F|3A|7C|2C)/gi, decodeURIComponent);

function writeHash() {
  const parts = [`chords=${enc($('#prog').value)}`];
  for (const [name, s] of Object.entries(SETTINGS)) {
    const v = s.get();
    if (v !== DEFAULTS[name]) parts.push(`${name}=${enc(v)}`);
  }
  if (result && selected.list === 'capos') parts.push(`capo=${selected.capo}`);
  else if (result && selected.shift) parts.push(`shift=${selected.shift}`);
  history.replaceState(null, '', `#${parts.join('&')}`);
}

function readHash() {
  const raw = location.hash.slice(1);
  if (/(^|&)chords=/.test(raw)) return new URLSearchParams(raw);
  // An old link: the whole hash is chord text. A hand-edited one can hold a stray '%',
  // which decodeURIComponent rejects; fall back to nothing rather than break the page.
  let chords = '';
  try { chords = decodeURIComponent(raw); } catch { /* keep '' */ }
  return new URLSearchParams({ chords });
}

function applyHash() {
  const params = readHash();
  fillKeySelect(null); // the key picker needs its options before a key can be chosen
  for (const [name, s] of Object.entries(SETTINGS)) {
    s.set(DEFAULTS[name]);
    if (params.has(name)) s.set(params.get(name));
  }
  $('#prog').value = params.get('chords') || 'C G Am F';
  update();
  if (!result) return;
  const capo = params.get('capo'), shift = Number(params.get('shift') ?? 0);
  const want = capo !== null ? { list: 'capos', shift: 0, capo: Number(capo) } : { list: 'keys', shift };
  const found = result[want.list].some(o => (want.list === 'keys' ? o.shift === want.shift : o.capo === want.capo));
  if (!found) { selectOriginal(); return; }
  selected = want;
  altIndex = scaleIndex = positionIndex = 0;
  renderRankings();
  renderArrangement();
}

applyHash();
// Back/forward and edits to the address change the hash without reloading; follow them.
// (The page writes the hash with replaceState, which doesn't fire this, so there is no loop.)
window.addEventListener('hashchange', applyHash);

// Tells the guard script in the page head that everything loaded and ran.
window.easyChangesReady = true;
