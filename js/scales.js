// Scale suggestions for a progression: which scales fit every chord, how each one
// sounds over each chord, and where to play it on the neck.
import { loadJson } from './data.js';
import { parseDegree, spellDegree, mod12, pcName, parseNote, SHARP_NAMES, FLAT_NAMES } from './theory.js';
import { rootName, TUNING } from './chords.js';

const scaleData = await loadJson('scales.json');

export const SCALE_TYPES = scaleData.types.map((t, priority) => {
  const intervals = t.degrees.map(d => mod12(parseDegree(d).semitones));
  return { ...t, priority, intervals, size: intervals.length, hasMinorThird: intervals.includes(3) && !intervals.includes(4) };
});

const bit = pc => 1 << mod12(pc);
const maskOf = (rootPc, type) => type.intervals.reduce((m, i) => m | bit(rootPc + i), 0);
const has = (mask, pc) => (mask & bit(pc)) !== 0;
const popcount = m => { let n = 0; for (; m; m &= m - 1) n++; return n; };

// Reading cost of a spelling: one per sharp/flat, two for a double sharp/flat.
const accidentalCost = notes => notes.reduce((n, x) => n + (/##|bb/.test(x) ? 2 : /[#b]/.test(x) ? 1 : 0), 0);

/**
 * A named scale: root + type, with its notes spelled from the root.
 * preferredRoot: a spelling to use for the root (e.g. the chord's own name, G#m -> G#).
 * Otherwise, with accidentals 'auto', the root spelling that needs the fewest accidentals
 * wins (C# phrygian dominant rather than Db phrygian dominant with E𝄫 and B𝄫).
 */
export function makeScale(rootPc, type, accidentals = 'auto', preferredRoot = null) {
  const t = typeof type === 'string' ? SCALE_TYPES.find(s => s.id === type) : type;
  const spell = r => {
    const notes = t.degrees.map(d => spellDegree(r, d));
    if (t.size === 7) return notes;
    // Scales without one note per letter (pentatonic, blues, whole tone...) don't need
    // double accidentals at all: write Eb blues as Eb Gb Ab A Bb Db, not with B𝄫.
    const prefer = r.includes('b') ? 'flat' : r.includes('#') ? 'sharp' : undefined;
    return notes.map((n, i) => (/##|bb/.test(n) ? pcName(rootPc + t.intervals[i], { prefer }) : n));
  };
  let root = rootName(rootPc, t.hasMinorThird ? 'min' : 'maj', accidentals);
  if (accidentals === 'auto') {
    const preferred = preferredRoot && parseNote(preferredRoot)?.pc === mod12(rootPc) ? preferredRoot : null;
    if (preferred) root = preferred;
    else {
      // Candidates in order of preference; the first one wins ties.
      const candidates = [...new Set([root, SHARP_NAMES[mod12(rootPc)], FLAT_NAMES[mod12(rootPc)]])];
      root = candidates.reduce((best, r) => (accidentalCost(spell(r)) < accidentalCost(spell(best)) ? r : best));
    }
  }
  const notes = spell(root);
  return { rootPc: mod12(rootPc), root, type: t, name: `${root} ${t.name}`, notes, mask: maskOf(rootPc, t),
           spelled: new Map(notes.map((n, i) => [mod12(rootPc + t.intervals[i]), n])) };
}

// ---- How a set of notes sounds over one chord --------------------------------

// A scale note a half-step above a chord tone rubs against it. How badly depends on
// which chord tone it sits on (by interval above the chord root).
const RUB_WEIGHT = { 0: 1.5, 3: 2, 4: 1, 7: 1, 10: 2 };
const RUB_REASON = {
  0: 'a half-step above the root', 3: 'a major 3rd against the minor 3rd', 4: 'the 4th against the 3rd',
  7: 'a half-step above the 5th', 10: 'a major 7th against the flat 7th',
};

function chordTones(chord) {
  const tones = new Set(chord.pcs);
  if (chord.bassPc !== null) tones.add(chord.bassPc);
  return tones;
}

const isDominant = chord => chord.pcs.includes(mod12(chord.rootPc + 4)) && chord.pcs.includes(mod12(chord.rootPc + 10));

/**
 * Clashes and coverage of a pitch-class set over a chord.
 * bluesy: the progression is mostly dominant 7ths, so the minor 3rd over them is the
 * accepted "blue note" rather than a wrong note.
 * Returns { score, coverage, clashes: [{ pc, weight, reason }] }.
 */
export function fitOverChord(mask, chord, { bluesy = false } = {}) {
  const tones = chordTones(chord);
  const rel = pc => mod12(pc - chord.rootPc);
  const dominant = isDominant(chord);
  const clashes = [];
  for (let pc = 0; pc < 12; pc++) {
    if (!has(mask, pc) || tones.has(pc)) continue;
    const below = mod12(pc - 1);
    if (tones.has(below)) {
      const r = rel(below);
      // On dominant chords the b9 and b13 are standard altered tensions, not wrong notes.
      const altered = dominant && (r === 0 || r === 7);
      clashes.push({ pc, weight: altered ? 0.5 : RUB_WEIGHT[r] ?? 1,
                     reason: altered ? (r === 0 ? 'a b9 tension (fine on a dominant chord)' : 'a b13 tension (fine on a dominant chord)')
                                     : RUB_REASON[r] ?? 'a half-step above a chord tone' });
    }
  }
  // Scales that miss a quality-defining tone but have the note just below it contradict the chord.
  const contradicts = (interval, weight, reason) => {
    const t = mod12(chord.rootPc + interval);
    if (tones.has(t) && !has(mask, t) && has(mask, t - 1) && !tones.has(mod12(t - 1)) && !clashes.some(c => c.pc === mod12(t - 1)))
      clashes.push({ pc: mod12(t - 1), weight, reason });
  };
  if (dominant && bluesy) contradicts(4, 0.25, 'the blue note (minor 3rd over a dominant chord)');
  else contradicts(4, 1.5, 'a minor 3rd against the major 3rd');
  contradicts(11, 1.5, 'a flat 7th against the major 7th');
  contradicts(7, 1, 'a flat 5th against the 5th');

  const required = chord.notes.filter(n => !n.optional).map(n => n.pc);
  const coverage = required.filter(pc => has(mask, pc)).length / required.length;
  return { score: clashes.reduce((s, c) => s + c.weight, 0), coverage, clashes };
}

// ---- Scales for a whole progression ------------------------------------------

const NAMING_TYPES = ['major', 'minor', 'major-pentatonic', 'minor-pentatonic'];

/**
 * Rank scales for a progression. Scales with the same notes (C major / A minor /
 * D dorian...) are merged and named after the key where possible.
 * key: { tonicPc, minor }. Returns up to `limit` suggestions, best first.
 */
export function suggestScales(chords, key, { accidentals = 'auto', limit = 6 } = {}) {
  const tonic = mod12(key.tonicPc);
  const chordRoots = new Set(chords.map(c => c.rootPc));
  // Spell scale roots the way the progression spells its chords (G#m -> G# minor, not Ab minor).
  const spelledRoot = new Map();
  for (const c of chords) if (!spelledRoot.has(c.rootPc)) spelledRoot.set(c.rootPc, c.root);
  // Mostly dominant 7ths (12-bar blues and friends): minor pentatonic / blues on the tonic is the idiom.
  const bluesy = chords.filter(isDominant).length > chords.length / 2;

  // Every (root, type) grouped by its set of notes.
  const groups = new Map();
  for (const type of SCALE_TYPES) {
    for (let r = 0; r < 12; r++) {
      const mask = maskOf(r, type);
      if (!groups.has(mask)) groups.set(mask, []);
      groups.get(mask).push({ rootPc: r, type });
    }
  }

  const results = [];
  for (const [mask, members] of groups) {
    const fits = chords.map(c => fitOverChord(mask, c, { bluesy }));
    const clash = fits.reduce((s, f) => s + f.score, 0) / chords.length;
    const coverage = fits.reduce((s, f) => s + f.coverage, 0) / chords.length;
    // Name it on the tonic if possible (A minor, not C major, in A minor), else on a chord root.
    const order = m => (m.rootPc === tonic ? 0 : chordRoots.has(m.rootPc) ? 1 : 2) * 100 + m.type.priority;
    members.sort((a, b) => order(a) - order(b));
    const lead = members[0];
    const onTonic = lead.rootPc === tonic;
    // Keep the tonic scale matching the key's mood: in a minor key prefer minor-3rd scales on the tonic.
    const moodMismatch = onTonic && key.minor !== lead.type.hasMinorThird ? 0.5 : 0;
    const size = lead.type.size;
    // Plain scales before colourful ones, unless the progression calls for them (blues).
    const family = lead.type.family;
    const style = family === 'blues' ? (bluesy ? 0 : 0.4)
      : family === 'symmetric' ? 0.5 : family === 'minor' ? 0.2
      : ['major', 'minor'].includes(lead.type.id) ? 0 : 0.3;   // modes on the tonic are colours, not defaults
    const bluesIdiom = bluesy && onTonic && ['minor-pentatonic', 'blues'].includes(lead.type.id) ? -1 : 0;
    const score = clash + 2 * (1 - coverage) + (onTonic ? 0 : 0.75) + moodMismatch + (size - 5) * 0.1 + style + bluesIdiom;
    results.push({ mask, lead, members, fits, clash, coverage, score });
  }

  results.sort((a, b) => a.score - b.score);
  return results.slice(0, limit).map(r => {
    const scale = makeScale(r.lead.rootPc, r.lead.type, accidentals, spelledRoot.get(r.lead.rootPc));
    const aka = r.members.slice(1)
      .filter(m => NAMING_TYPES.includes(m.type.id) && m.type.family === r.lead.type.family)
      .slice(0, 1)
      .map(m => makeScale(m.rootPc, m.type, accidentals, spelledRoot.get(m.rootPc)).name);
    return {
      ...scale,
      aka,
      clash: r.clash,
      coverage: r.coverage,
      score: r.score,
      verdict: r.clash === 0 ? 'no clashes' : r.clash < 1 ? 'mild tension' : r.clash < 2 ? 'some clashes' : 'clashes',
      perChord: describePerChord(scale, chords, { accidentals, bluesy }),
    };
  });
}

/** How the scale works over each distinct chord, with a fix where it doesn't. */
export function describePerChord(scale, chords, { accidentals = 'auto', bluesy = false } = {}) {
  const seen = new Set();
  const out = [];
  for (const chord of chords) {
    if (seen.has(chord.symbol)) continue;
    seen.add(chord.symbol);
    const fit = fitOverChord(scale.mask, chord, { bluesy });
    const name = pc => scale.spelled.get(pc) ?? pcName(pc);
    // The same notes seen from this chord's root, e.g. C major over Dm7 = D dorian.
    const modeType = SCALE_TYPES.find(t => maskOf(chord.rootPc, t) === scale.mask);
    const mode = modeType ? makeScale(chord.rootPc, modeType, accidentals, chord.root).name : null;
    const entry = {
      chord: chord.symbol, mode, score: fit.score,
      // Which of the chord's own notes the scale contains, e.g. G, D of G (not B).
      hits: chord.notes.filter(n => has(scale.mask, n.pc)).map(n => n.name),
      misses: chord.notes.filter(n => !n.optional && !has(scale.mask, n.pc)).map(n => n.name),
      clashes: fit.clashes.map(c => ({ note: name(c.pc), weight: c.weight, reason: c.reason })),
      alternative: null,
    };
    // Only suggest a different scale when this one really fights the chord.
    if (fit.score > 2) entry.alternative = alternativeFor(chord, scale, accidentals, bluesy);
    out.push(entry);
  }
  return out;
}

// Best scale on the chord's root for this chord, changing as few notes of the main scale as possible.
function alternativeFor(chord, scale, accidentals, bluesy) {
  const current = fitOverChord(scale.mask, chord, { bluesy }).score;
  let best = null;
  for (const type of SCALE_TYPES) {
    if (type.size < 7) continue;   // a full scale, so it can replace the main one for this chord
    const mask = maskOf(chord.rootPc, type);
    const fit = fitOverChord(mask, chord, { bluesy });
    if (mask === scale.mask || fit.score > current - 1) continue;   // must fit clearly better
    const changed = popcount(mask ^ scale.mask);
    // Each changed note is a real cost: players adapt a scale they know rather than switch.
    const score = fit.score + 0.75 * changed + 1.5 * (1 - fit.coverage) + type.priority * 0.01;
    if (!best || score < best.score) best = { type, mask, score };
  }
  if (!best) return null;
  const alt = makeScale(chord.rootPc, best.type, accidentals, chord.root);
  const added = [...alt.spelled].filter(([pc]) => !has(scale.mask, pc)).map(([, n]) => n);
  const removed = [...scale.spelled].filter(([pc]) => !has(alt.mask, pc)).map(([, n]) => n);
  return { name: alt.name, notes: alt.notes, added, removed };
}

// ---- Where to play it ---------------------------------------------------------

/**
 * Hand positions for a scale: windows of 4 frets (5 for 7+ note scales) with at least
 * two scale notes on every string. Best first: open position, then near `handFret`
 * (where the chords are played), then more roots on the low strings.
 */
export function scalePositions(scale, { handFret = 2, maxFret = 15 } = {}) {
  const span = scale.type.size <= 6 ? 4 : 5;
  const windows = [];
  for (let from = 0; from + span - 1 <= maxFret; from++) {
    const to = from + span - 1;
    const perString = TUNING.map(s => {
      const frets = [];
      for (let f = from; f <= to; f++) if (has(scale.mask, s.pc + f)) frets.push(f);
      return frets;
    });
    if (perString.some(fs => fs.length < 2)) continue;
    const lowRoots = [0, 1].reduce((n, s) => n + perString[s].filter(f => mod12(TUNING[s].pc + f) === scale.rootPc).length, 0);
    const center = (from + to) / 2;
    const score = (from === 0 ? -1.5 : 0) + Math.abs(center - handFret) * 0.3 - lowRoots * 0.4;
    windows.push({ from, to, score, perString });
  }
  // Keep distinct positions: drop windows that overlap a better one by all but one fret.
  const chosen = [];
  for (const w of windows.sort((a, b) => a.score - b.score)) {
    if (chosen.every(c => Math.abs(c.from - w.from) >= span - 1)) chosen.push(w);
  }
  return chosen;
}

/** Average fret the hand sits at for a list of voicings (open chords count as fret ~1.5). */
export function handFretOf(voicings) {
  const centers = voicings.map(v => {
    const fretted = v.frets.filter(f => f > 0);
    return fretted.length ? fretted.reduce((a, b) => a + b, 0) / fretted.length : 1.5;
  });
  return centers.reduce((a, b) => a + b, 0) / Math.max(1, centers.length);
}

