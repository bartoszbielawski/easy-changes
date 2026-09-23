import { CHORD_TYPES, getChord, getVoicings, getInversions, listAllChords, rootName } from './chords.js';
import { pcName, mod12 } from './theory.js';
import { renderDiagram } from './diagram.js';
import { levelFor } from './difficulty.js';
import { renderLegend } from './legend.js';
import { getAccidentals, setAccidentals } from './prefs.js';

// rootPc: the root as a pitch class; its name comes from the accidentals setting, unless
// the chord was typed, in which case typedRoot keeps the user's spelling (A#7 stays A#7).
// bass: null (root), { inv: i } (chord tone i in the bass), or { semis: n } (any other note).
// Keeping it relative means C/E -> click D -> D/F#, and C/E -> click m -> Cm/Eb.
const state = { rootPc: 0, typedRoot: null, type: 'maj', bass: null, accidentals: getAccidentals() };
const rootNow = () => state.typedRoot ?? rootName(state.rootPc, state.type, state.accidentals);

// Spelling for bass notes that aren't chord tones: follow the setting, or the root's own accidental.
function bassPrefer(root) {
  if (state.accidentals !== 'auto') return state.accidentals;
  return root.includes('b') ? 'flat' : root.includes('#') ? 'sharp' : undefined;
}

const $ = sel => document.querySelector(sel);
const input = $('#symbol');
const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th'];
// Chord types shown as buttons; the rest go in the "More…" dropdown.
const COMMON_TYPES = ['maj', 'min', '7', 'maj7', 'm7', 'sus2', 'sus4', 'add9', '6', 'dim', 'aug', '5'];

function currentChord() {
  const base = getChord(rootNow(), state.type);
  if (!state.bass) return base;
  if (state.bass.inv !== undefined) {
    const note = base.notes[state.bass.inv];
    return note ? getChord(base.root, state.type, note.name) : base;
  }
  const pc = mod12(base.rootPc + state.bass.semis);
  const tone = base.notes.find(n => n.pc === pc);
  return getChord(base.root, state.type, tone ? tone.name : pcName(pc, { prefer: bassPrefer(base.root) }));
}

function setBassFromChord(chord) {
  if (!chord.bass) { state.bass = null; return; }
  const inv = chord.notes.findIndex(n => n.pc === chord.bassPc);
  state.bass = inv > 0 ? { inv } : { semis: mod12(chord.bassPc - chord.rootPc) };
}

// Root buttons are labelled for the current type and setting (Ab major, but G# minor in Auto).
function renderRoots() {
  $('#roots').innerHTML = Array.from({ length: 12 }, (_, pc) => {
    const label = pc === state.rootPc && state.typedRoot ? state.typedRoot : rootName(pc, state.type, state.accidentals);
    return `<button type="button" data-root-pc="${pc}" aria-pressed="${pc === state.rootPc}">${label}</button>`;
  }).join('') + `
    <span class="seg" role="group" aria-label="Sharps or flats">
      ${[['auto', 'Auto', 'Spell by chord type: Db, Eb, Ab, Bb for major; C#m, G#m for minor'], ['flat', '♭', 'Always flats'], ['sharp', '♯', 'Always sharps']]
        .map(([mode, text, title]) => `<button type="button" data-acc="${mode}" title="${title}" aria-pressed="${state.accidentals === mode}">${text}</button>`).join('')}
    </span>`;
}

function renderPickers() {

  const common = COMMON_TYPES.map(id => CHORD_TYPES.find(t => t.id === id));
  // Grouped by hand rather than with Map.groupBy, which needs a 2024 browser.
  const more = new Map();
  for (const t of CHORD_TYPES.filter(t => !COMMON_TYPES.includes(t.id))) {
    if (!more.has(t.category)) more.set(t.category, []);
    more.get(t.category).push(t);
  }
  $('#types').innerHTML = `
    ${common.map(t => `<button type="button" data-type="${t.id}" title="${t.name}" aria-pressed="${t.id === state.type}">${t.symbol || 'maj'}</button>`).join('')}
    <select id="type-more" aria-label="More chord types">
      <option value="">More…</option>
      ${[...more].map(([category, types]) => `<optgroup label="${category[0].toUpperCase() + category.slice(1)}">
        ${types.map(t => `<option value="${t.id}">${t.symbol}: ${t.name}</option>`).join('')}
      </optgroup>`).join('')}
    </select>`;
}

// Common types light up their button; the others show in the dropdown, highlighted the same way.
function syncTypePicker() {
  document.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', b.dataset.type === state.type));
  const select = $('#type-more');
  const inMore = !COMMON_TYPES.includes(state.type);
  select.value = inMore ? state.type : '';
  select.classList.toggle('active', inMore);
}

function setType(type) {
  state.type = type;
  // An inversion the new chord doesn't have (e.g. 3rd inversion of a triad) falls back to root position.
  if (state.bass?.inv >= getChord(rootNow(), state.type).notes.length) state.bass = null;
}

function renderBassPicker(chord) {
  const base = getChord(rootNow(), state.type);
  const isInv = i => state.bass?.inv === i || (state.bass?.semis !== undefined && base.notes[i]?.pc === chord.bassPc);
  const others = Array.from({ length: 12 }, (_, s) => s)
    .filter(s => !base.notes.some(n => n.pc === mod12(base.rootPc + s)));
  const otherSelected = chord.bass && chord.bassKind === 'slash' ? mod12(chord.bassPc - chord.rootPc) : '';
  $('#bass').innerHTML = `
      <button type="button" data-bass="root" aria-pressed="${!chord.bass}" title="Root position">${base.root}</button>
      ${base.notes.slice(1).map((n, k) => `<button type="button" data-bass-inv="${k + 1}" aria-pressed="${isInv(k + 1)}"
        title="${ORDINALS[k + 1]} inversion (${n.degree} in bass)">/${n.name}</button>`).join('')}
      <select id="bass-other" aria-label="Other bass note">
        <option value="">other…</option>
        ${others.map(s => {
          const name = pcName(base.rootPc + s, { prefer: bassPrefer(base.root) });
          return `<option value="${s}" ${s === otherSelected ? 'selected' : ''}>/${name}</option>`;
        }).join('')}
      </select>`;
}

function describeBass(chord) {
  if (!chord.bass) return '';
  if (chord.bassKind === 'inversion') {
    const i = chord.notes.findIndex(n => n.pc === chord.bassPc);
    return `${ORDINALS[i]} inversion: the ${chord.bassDegree} (${chord.bass}) is the lowest note.`;
  }
  return `Slash chord: ${getChord(chord.root, state.type).symbol} over a ${chord.bass} bass, which isn't a chord tone.`;
}

function render() {
  const chord = currentChord();
  const voicings = getVoicings(chord);

  $('#chord-info').innerHTML = `
    <h2>${chord.symbol} <small>${chord.typeName}</small></h2>
    <dl>
      <div><dt>Formula</dt><dd>${chord.notes.map(n => `<span class="${n.optional ? 'optional' : ''}">${n.degree}</span>`).join(' ')}</dd></div>
      <div><dt>Notes</dt><dd>${chord.notes.map(n => `<span class="${n.optional ? 'optional' : ''}">${n.name}</span>`).join(' ')}</dd></div>
      <div><dt>Voicings</dt><dd>${voicings.length}</dd></div>
    </dl>
    ${chord.notes.some(n => n.optional) ? '<p class="hint">Faded notes are optional and are often left out.</p>' : ''}
    ${chord.bass ? `<p class="hint">${describeBass(chord)}</p>` : ''}`;

  $('#voicings').innerHTML = voicings.map(v => `
    <figure class="voicing">
      ${renderDiagram(v)}
      <figcaption>
        <span class="badge ${v.difficulty.level}" title="Difficulty ${v.difficulty.score} on the 1-10 chord scale">${levelFor(v.difficulty.score).name} · ${v.difficulty.score}</span>
        <span class="tab">${v.tab}</span>
        <span class="shape">${v.name}</span>
        ${v.difficulty.reasons.length ? `<span class="reasons">${v.difficulty.reasons.join(', ')}</span>` : ''}
      </figcaption>
    </figure>`).join('') || '<p class="empty">No playable voicing for this bass note in the database.</p>';

  renderBassPicker(chord);
  renderRoots();
  syncTypePicker();
  if (document.activeElement !== input) input.value = chord.symbol;
  history.replaceState(null, '', `#${encodeURIComponent(chord.symbol)}`);
}

function applySymbol(symbol) {
  const chord = getChord(symbol);
  if (!chord) return false;
  Object.assign(state, { rootPc: chord.rootPc, typedRoot: chord.root, type: chord.type });
  setBassFromChord(chord);
  render();
  return true;
}

document.addEventListener('click', e => {
  const btn = e.target.closest('button[data-root-pc], button[data-type], button[data-bass], button[data-bass-inv], button[data-acc]');
  if (!btn) return;
  // Choosing a root, type or spelling hands naming back to the setting.
  if (btn.dataset.rootPc || btn.dataset.type || btn.dataset.acc) state.typedRoot = null;
  if (btn.dataset.rootPc) state.rootPc = Number(btn.dataset.rootPc);
  if (btn.dataset.type) setType(btn.dataset.type);
  if (btn.dataset.acc) { state.accidentals = btn.dataset.acc; setAccidentals(state.accidentals); }
  if (btn.dataset.bass) state.bass = null;
  if (btn.dataset.bassInv) state.bass = { inv: Number(btn.dataset.bassInv) };
  input.blur();
  render();
});
document.addEventListener('change', e => {
  if (e.target.value === '') return;
  if (e.target.id === 'bass-other') state.bass = { semis: Number(e.target.value) };
  else if (e.target.id === 'type-more') { state.typedRoot = null; setType(e.target.value); }
  else return;
  render();
});

input.addEventListener('input', () => {
  const ok = !input.value.trim() || applySymbol(input.value);
  input.classList.toggle('invalid', !ok);
});
$('#search').addEventListener('submit', e => { e.preventDefault(); input.blur(); render(); });

renderPickers();
$('#legend').innerHTML = renderLegend();
// The address carries the current chord text. A hand-edited address can hold a stray '%',
// which decodeURIComponent rejects, so fall back to nothing rather than break the page.
function hashText() {
  try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
}

const fromHash = hashText();
if (!(fromHash && applySymbol(fromHash))) render();
// Back/forward and edits to the address change the hash without reloading; follow them.
// (render() writes the hash with replaceState, which doesn't fire this, so there is no loop.)
window.addEventListener('hashchange', () => {
  const symbol = hashText();
  if (symbol && applySymbol(symbol)) input.classList.remove('invalid');
});

// Database size, counted after first paint since generating every inversion takes a moment.
setTimeout(() => {
  const chords = listAllChords();
  const rootCount = chords.reduce((n, c) => n + getVoicings(c).length, 0);
  const invCount = chords.reduce((n, c) => n + getInversions(c).reduce((m, i) => m + getVoicings(i).length, 0), 0);
  $('#stats').textContent = `${CHORD_TYPES.length} chord types · ${chords.length} chords · ${rootCount} root-position voicings + ${invCount} inversion voicings · any slash chord generated on demand (standard tuning)`;
}, 50);

// Tells the guard script in the page head that everything loaded and ran, and lets it
// recover again after a future deploy (see the guard in the page head).
window.easyChangesReady = true;
try { sessionStorage.removeItem('easyChangesRefreshed'); } catch { /* storage off: nothing to clear */ }
