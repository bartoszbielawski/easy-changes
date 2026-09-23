// Correctness tests for scales and harmonic analysis. Expected values are written out
// from music theory, not computed by the code under test. Most checks run in all 12 keys.
import { getChord, rootName } from '../js/chords.js';
import { mod12 } from '../js/theory.js';
import { parseProgression, replaceChords, transposeChords, arrange, arrangeChoices, DEFAULT_OPTIONS } from '../js/progression.js';
import { SCALE_TYPES, makeScale, fitOverChord, suggestScales, scalePositions } from '../js/scales.js';
import { analyzeProgression, detectKeys, romanNumeral, rootMotion } from '../js/analysis.js';
import { TUNING } from '../js/chords.js';
import { loadJson } from '../js/data.js';

const songData = await loadJson('songs.json');

const results = [];
let current = '';
const suite = name => { current = name; };
function check(name, ok, detail = '') {
  results.push({ suite: current, name, ok: !!ok, detail: ok ? '' : detail });
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const chordsOf = text => parseProgression(text).chords;
// A chord on a pitch class, named the usual way for its type.
const ch = (pc, type, bassPc = null) => getChord(rootName(pc, type), type, bassPc === null ? null : NAMES[mod12(bassPc)]);
const transposeText = (text, n) => transposeChords(chordsOf(text), n, undefined, 'auto');

// ===========================================================================
suite('Scale spelling');
// Known spellings (the textbook answers).
const KNOWN = [
  [0, 'major', 'C D E F G A B'], [6, 'major', 'F# G# A# B C# D# E#'], [1, 'major', 'Db Eb F Gb Ab Bb C'],
  [3, 'minor', 'Eb F Gb Ab Bb Cb Db'], [8, 'minor', 'G# A# B C# D# E F#'], [9, 'harmonic-minor', 'A B C D E F G#'],
  [2, 'dorian', 'D E F G A B C'], [10, 'mixolydian', 'Bb C D Eb F G Ab'], [4, 'phrygian-dominant', 'E F G# A B C D'],
  [5, 'lydian', 'F G A B C D E'], [11, 'locrian', 'B C D E F G A'], [9, 'minor-pentatonic', 'A C D E G'],
  [0, 'major-pentatonic', 'C D E G A'], [9, 'blues', 'A C D Eb E G'], [2, 'melodic-minor', 'D E F G A B C#'],
  [7, 'mixolydian-b6', 'G A B C D Eb F'], [0, 'whole-tone', 'C D E F# G# Bb'],
  // Enharmonic choices: the spelling a musician would write.
  [1, 'phrygian-dominant', 'C# D E# F# G# A B'], [3, 'locrian', 'D# E F# G# A B C#'],
  [3, 'blues', 'Eb Gb Ab A Bb Db'], [8, 'harmonic-minor', 'G# A# B C# D# E F##'],
];
for (const [pc, id, notes] of KNOWN) {
  const s = makeScale(pc, id);
  check(`${s.name}`, s.notes.join(' ') === notes, `got ${s.notes.join(' ')}, expected ${notes}`);
}
// Every 7-note scale in every key: seven different letters, and pitch classes match the formula.
for (const t of SCALE_TYPES) {
  for (let pc = 0; pc < 12; pc++) {
    for (const acc of ['auto', 'flat', 'sharp']) {
      const s = makeScale(pc, t, acc);
      const pcs = [...s.spelled.keys()];
      const expected = t.intervals.map(i => mod12(pc + i));
      if (!eq(pcs.sort(), [...expected].sort())) check(`${s.name} (${acc}) pitch classes`, false, s.notes.join(' '));
      if (t.size === 7) {
        const letters = new Set(s.notes.map(n => n[0]));
        if (letters.size !== 7) check(`${s.name} (${acc}) uses 7 letters`, false, s.notes.join(' '));
      }
      if (acc === 'auto') {
        // No enharmonic respelling of the root reads more easily (a double sharp/flat counts as 2).
        const cost = sc => sc.notes.reduce((n, x) => n + (/##|bb/.test(x) ? 2 : /[#b]/.test(x) ? 1 : 0), 0);
        const others = ['flat', 'sharp'].map(a => makeScale(pc, t, a));
        if (others.some(o => cost(o) < cost(s))) check(`${s.name} (auto) is the easiest spelling`, false, `${s.notes.join(' ')} vs ${others.map(o => o.notes.join(' ')).join(' / ')}`);
        if (t.size !== 7 && s.notes.some(n => /##|bb/.test(n))) check(`${s.name} (auto) has no double accidentals`, false, s.notes.join(' '));
      }
    }
  }
}
check('all scales spelled with correct pitch classes and letters (12 keys × 3 spellings)', true);

// ===========================================================================
suite('Scale relationships');
for (let t = 0; t < 12; t++) {
  const ionian = makeScale(t, 'major').mask;
  const modes = [[2, 'dorian'], [4, 'phrygian'], [5, 'lydian'], [7, 'mixolydian'], [9, 'minor'], [11, 'locrian']];
  for (const [off, id] of modes) {
    if (makeScale(t + off, id).mask !== ionian) check(`${NAMES[t]} major = ${NAMES[mod12(t + off)]} ${id}`, false);
  }
  if (makeScale(t, 'major-pentatonic').mask !== makeScale(t + 9, 'minor-pentatonic').mask) check(`${NAMES[t]} major pent = relative minor pent`, false);
  if ((makeScale(t, 'major-pentatonic').mask & ~ionian) !== 0) check(`${NAMES[t]} major pent inside major`, false);
  const blues = makeScale(t, 'blues').mask, minPent = makeScale(t, 'minor-pentatonic').mask;
  if (blues !== (minPent | (1 << mod12(t + 6)))) check(`${NAMES[t]} blues = minor pent + b5`, false);
  if (makeScale(t + 7, 'mixolydian-b6').mask !== makeScale(t, 'melodic-minor').mask) check(`${NAMES[t]} melodic minor contains its 5th mode (mixolydian b6)`, false);
  if (makeScale(t + 7, 'phrygian-dominant').mask !== makeScale(t, 'harmonic-minor').mask) check(`${NAMES[t]} harmonic minor contains its 5th mode (phrygian dominant)`, false);
}
check('modes, pentatonics, blues, melodic/harmonic minor modes agree in all keys', true);

// ===========================================================================
suite('Avoid notes (chord-scale theory)');
// [chord type, scale, avoid degrees (semitones above the chord root)] from the standard chord-scale tables.
const AVOID = [
  ['maj', 'major', [5]], ['maj7', 'major', [5]], ['maj7', 'lydian', []],
  ['min', 'dorian', []], ['m7', 'dorian', []], ['m7', 'minor', [8]], ['m7', 'phrygian', [1, 8]],
  ['7', 'mixolydian', [5]], ['7', 'lydian-dominant', []], ['7', 'phrygian-dominant', [1, 5, 8]],
  ['m7b5', 'locrian', [1]], ['maj', 'major-pentatonic', []], ['min', 'minor-pentatonic', []],
];
for (const [type, scaleId, avoid] of AVOID) {
  let failures = [];
  for (let t = 0; t < 12; t++) {
    const fit = fitOverChord(makeScale(t, scaleId).mask, ch(t, type));
    const got = fit.clashes.map(c => mod12(c.pc - t)).sort((a, b) => a - b);
    if (!eq(got, avoid)) failures.push(`${NAMES[t]}: [${got}]`);
  }
  check(`${type} with ${scaleId}: avoid [${avoid}]`, !failures.length, failures.join(', '));
}
// Weights: quality contradictions are worse than the 4th over a major chord.
{
  const majorScaleOverMinor = fitOverChord(makeScale(0, 'major').mask, ch(0, 'min'));   // E over Cm
  const fourthOverMajor = fitOverChord(makeScale(0, 'major').mask, ch(0, 'maj'));       // F over C
  check('major 3rd over a minor chord weighs more than the 4th over a major chord',
    majorScaleOverMinor.score > fourthOverMajor.score, `${majorScaleOverMinor.score} vs ${fourthOverMajor.score}`);
  const b9 = fitOverChord(makeScale(4, 'phrygian-dominant').mask, ch(4, '7'));
  check('b9 / b13 over a dominant 7th are mild tensions', b9.clashes.filter(c => c.weight <= 0.5).length === 2,
    JSON.stringify(b9.clashes));
}

// ===========================================================================
suite('Scale positions');
{
  let bad = [];
  for (const t of SCALE_TYPES) for (let pc = 0; pc < 12; pc++) {
    const s = makeScale(pc, t);
    for (const w of scalePositions(s)) {
      w.perString.forEach((frets, i) => {
        if (frets.length < 2) bad.push(`${s.name} ${w.from}-${w.to} string ${6 - i}`);
        for (const f of frets) if (!s.spelled.has(mod12(TUNING[i].pc + f))) bad.push(`${s.name} fret ${f} not in scale`);
        if (frets.some(f => f < w.from || f > w.to)) bad.push(`${s.name} note outside box`);
      });
    }
    if (!scalePositions(s).length) bad.push(`${s.name}: no position`);
  }
  check('every position covers all 6 strings with ≥2 scale notes, inside the box', !bad.length, bad.slice(0, 5).join('; '));
  const openA = scalePositions(makeScale(9, 'minor-pentatonic'), { handFret: 2 })[0];
  check('A minor pentatonic near open chords starts in open position', openA.from === 0, `${openA.from}-${openA.to}`);
  const highA = scalePositions(makeScale(9, 'minor-pentatonic'), { handFret: 7 }).map(w => w.from);
  check('A minor pentatonic has the classic 5th-fret box', highA.includes(5), highA.join(','));
}

// ===========================================================================
suite('Scale suggestions');
// [progression, key, scales expected in the top N, N]
const SUGGEST = [
  ['C G Am F', 'C', ['C major pentatonic', 'C major'], 3],
  ['Am G F G', 'Am', ['A natural minor', 'A minor pentatonic'], 2],
  ['Em C G D', 'Em', ['E minor pentatonic', 'E natural minor'], 3],
  ['E7 A7 B7', 'E', ['E minor pentatonic'], 1],
  ['Am Dm E7', 'Am', ['A harmonic minor'], 2],
  ['Dm7 G7 Cmaj7', 'C', ['C major'], 2],
  ['G C D', 'G', ['G major pentatonic', 'G major'], 3],
];
for (const [text, keyName, expected, n] of SUGGEST) {
  for (let shift = 0; shift < 12; shift++) {
    const chords = transposeText(text, shift);
    const key = detectKeys(chords)[0];
    const top = suggestScales(chords, key, { limit: n });
    // Compare by pitch-class set + type, so enharmonic naming can't cause false failures.
    const want = expected.map(e => {
      const [root, ...rest] = e.split(' ');
      const t = SCALE_TYPES.find(s => s.name === rest.join(' '));
      return makeScale(mod12(getChord(root).rootPc + shift), t).mask;
    });
    const got = top.map(s => s.mask);
    const missing = want.filter(m => !got.includes(m));
    if (missing.length) { check(`${text} (+${shift}): top ${n} include ${expected.join(', ')}`, false, top.map(s => s.name).join(' | ')); break; }
    if (shift === 11) check(`${text}: top ${n} include ${expected.join(', ')} in all 12 keys`, true);
  }
}
// One-note fixes for chords outside the scale.
const FIXES = [
  ['Dm7 G7 Cmaj7 A7', 'A7', 'mixolydian b6', 'C#'],
  ['C E7 Am F', 'E7', 'phrygian dominant', 'G#'],
  ['Dm C Bb A7', 'A7', 'phrygian dominant', 'C#'],
];
for (const [text, chordSym, scaleName, added] of FIXES) {
  const chords = chordsOf(text);
  const key = detectKeys(chords)[0];
  const main = suggestScales(chords, key, { limit: 6 }).find(s => s.type.size === 7);
  const entry = main.perChord.find(p => p.chord === chordSym);
  const alt = entry?.alternative;
  check(`${text}: fix for ${chordSym} is ${scaleName} (${added})`, alt && alt.name.endsWith(scaleName) && eq(alt.added, [added]),
    alt ? `${alt.name}, adds ${alt.added}` : 'no alternative offered');
}

// ===========================================================================
suite('Roman numerals');
const MAJOR_TRIADS = [[0, 'maj', 'I'], [2, 'min', 'ii'], [4, 'min', 'iii'], [5, 'maj', 'IV'], [7, 'maj', 'V'], [9, 'min', 'vi'], [11, 'dim', 'vii°']];
const MAJOR_SEVENTHS = [[0, 'maj7', 'Imaj7'], [2, 'm7', 'ii7'], [4, 'm7', 'iii7'], [5, 'maj7', 'IVmaj7'], [7, '7', 'V7'], [9, 'm7', 'vi7'], [11, 'm7b5', 'viiø7']];
const MINOR_TRIADS = [[0, 'min', 'i'], [2, 'dim', 'ii°'], [3, 'maj', 'III'], [5, 'min', 'iv'], [7, 'min', 'v'], [8, 'maj', 'VI'], [10, 'maj', 'VII'], [7, 'maj', 'V'], [11, 'dim', 'vii°']];
const MINOR_SEVENTHS = [[0, 'm7', 'i7'], [2, 'm7b5', 'iiø7'], [3, 'maj7', 'IIImaj7'], [5, 'm7', 'iv7'], [7, 'm7', 'v7'], [8, 'maj7', 'VImaj7'], [10, '7', 'VII7'], [7, '7', 'V7'], [11, 'dim7', 'vii°7']];
for (const [label, table, minor] of [['major triads', MAJOR_TRIADS, false], ['major sevenths', MAJOR_SEVENTHS, false], ['minor triads', MINOR_TRIADS, true], ['minor sevenths', MINOR_SEVENTHS, true]]) {
  const failures = [];
  for (let t = 0; t < 12; t++) for (const [deg, type, expected] of table) {
    const got = romanNumeral(ch(t + deg, type), t, minor);
    if (got !== expected) failures.push(`${NAMES[t]}${minor ? 'm' : ''}: ${ch(t + deg, type).symbol} → ${got} (expected ${expected})`);
  }
  check(`diatonic ${label} in all 12 keys`, !failures.length, failures.slice(0, 4).join('; '));
}
// Chromatic chords in C major.
const CHROMATIC = [['Bb', 'bVII'], ['Ab', 'bVI'], ['Eb', 'bIII'], ['Fm', 'iv'], ['Db', 'bII'], ['D7', 'II7'], ['E7', 'III7'], ['F#dim', '#iv°']];
for (const [sym, expected] of CHROMATIC) {
  const got = romanNumeral(getChord(sym), 0, false);
  check(`${sym} in C is ${expected}`, got === expected, got);
}
// Inversions (figured bass).
const INV = [['C/E', 'I⁶'], ['C/G', 'I⁶₄'], ['G7/B', 'V⁶₅'], ['G7/D', 'V⁴₃'], ['G7/F', 'V⁴₂'], ['Am/C', 'vi⁶'], ['C/D', 'I/II'], ['F/G', 'IV/V']];
for (const [sym, expected] of INV) {
  const got = romanNumeral(getChord(sym), 0, false);
  check(`${sym} in C is ${expected}`, got === expected, got);
}

// ===========================================================================
suite('Chord roles');
{
  const failures = [];
  for (let t = 0; t < 12; t++) {
    // Secondary dominant followed by its target: V7/ii, V7/iii, V7/IV, V7/V, V7/vi.
    for (const [targetDeg, targetType, label] of [[2, 'min', 'V7/ii'], [4, 'min', 'V7/iii'], [5, 'maj', 'V7/IV'], [7, 'maj', 'V7/V'], [9, 'min', 'V7/vi']]) {
      const chords = [ch(t, 'maj'), ch(t + targetDeg + 7, '7'), ch(t + targetDeg, targetType), ch(t + 7, '7'), ch(t, 'maj')];
      const a = analyzeProgression(chords, { key: { tonicPc: t, minor: false }, loop: false });
      const s = a.steps[1];
      if (s.kind !== 'secondary' || s.label !== label || !/resolves/.test(s.note)) failures.push(`${NAMES[t]}: ${chords[1].symbol} → ${s.kind} ${s.label}`);
    }
    // Borrowed from the parallel minor.
    for (const [deg, type] of [[5, 'min'], [8, 'maj'], [10, 'maj'], [3, 'maj']]) {
      const a = analyzeProgression([ch(t, 'maj'), ch(t + deg, type), ch(t, 'maj')], { key: { tonicPc: t, minor: false }, loop: false });
      if (a.steps[1].kind !== 'borrowed') failures.push(`${NAMES[t]}: ${a.steps[1].symbol} not borrowed (${a.steps[1].kind})`);
    }
    // Functions of the diatonic triads.
    const fns = MAJOR_TRIADS.map(([deg, type]) => analyzeProgression([ch(t + deg, type)], { key: { tonicPc: t, minor: false } }).steps[0].fn).join('');
    if (fns !== 'TSTSDTD') failures.push(`${NAMES[t]} functions ${fns}`);
  }
  check('secondary dominants (with resolution), borrowed chords and functions in all 12 keys', !failures.length, failures.slice(0, 4).join('; '));
  // Tritone substitution, borrowed major IV in minor, non-resolving secondary dominant (all 12 keys).
  const special = [];
  for (let sft = 0; sft < 12; sft++) {
    const ipa = analyzeProgression(transposeText('Fmaj7 G7 Gm7 Gb7 Fmaj7', sft), { loop: false });
    if (ipa.steps[3].label !== 'subV7/I') special.push(`+${sft} Gb7 → ${ipa.steps[3].label ?? ipa.steps[3].kind}`);
    const hc = analyzeProgression(transposeText('Bm F# A E G D Em F#', sft), { loop: true });
    if (hc.steps[3].kind !== 'borrowed') special.push(`+${sft} E in Bm → ${hc.steps[3].kind} ${hc.steps[3].label ?? ''}`);
    const creep = analyzeProgression(transposeText('G B C Cm', sft), { loop: true });
    if (creep.steps[1].label !== 'V/vi' || creep.steps[3].kind !== 'borrowed') special.push(`+${sft} Creep → ${creep.steps.map(x => x.label ?? x.numeral).join(' ')}`);
  }
  check('tritone substitute (subV7/I), borrowed major IV in minor, V/vi and borrowed iv in all 12 keys', !special.length, special.slice(0, 4).join('; '));
  // A ii–V–I that steps outside the key is a brief key change, in all 12 keys.
  const mod = [];
  for (let sft = 0; sft < 12; sft++) {
    const bb = analyzeProgression(transposeText('Cm7 Fm7 Dm7b5 G7 Cm7 Ebm7 Ab7 Dbmaj7', sft), { loop: false });
    const [ii, v, i] = bb.steps.slice(5);
    if (ii.label !== 'ii7/bII' || v.label !== 'V7/bII' || i.kind !== 'tonicized') {
      mod.push(`+${sft}: ${bb.steps.slice(5).map(x => `${x.symbol}=${x.label ?? x.kind}`).join(' ')}`);
    }
    // The same chord type a half step up is a parallel move, not a resolution.
    const sw = analyzeProgression(transposeText('Dm7 Ebm7 Dm7', sft), { loop: true });
    if (!/parallel move/.test(sw.steps[1].note ?? '')) mod.push(`+${sft}: So What → ${sw.steps[1].note}`);
  }
  check('ii–V–I into another key, and parallel chord shifts, in all 12 keys', !mod.length, mod.slice(0, 4).join('; '));
  const blues = analyzeProgression(chordsOf('A7 D7 A7 E7'), {});
  check('blues I7 and IV7 are not called secondary dominants', blues.steps.every(s => s.kind === 'diatonic'), blues.steps.map(s => s.kind).join(','));
}

// ===========================================================================
suite('Root motion');
const MOTIONS = [['C', 'F', 'up a 4th', 'strong'], ['C', 'G', 'down a 4th', 'plagal'], ['C', 'D', 'up a whole step', 'step'],
  ['C', 'Bb', 'down a whole step', 'step'], ['C', 'Am', 'down a minor 3rd', 'third'], ['C', 'E', 'up a major 3rd', 'third'],
  ['C', 'F#', 'a tritone', 'tritone'], ['C', 'Db', 'up a half step', 'step'], ['C', 'C7', 'same root', 'static']];
for (const [a, b, text, strength] of MOTIONS) {
  const m = rootMotion(getChord(a), getChord(b));
  check(`${a} → ${b}: ${text}`, m.text === text && m.strength === strength, `${m.text} / ${m.strength}`);
}

// ===========================================================================
suite('Named patterns');
{
  const PATTERN_CASES = [
    ['Axis progression', [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']], false],
    ['50s progression', [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']], false],
    ['Three-chord song', [[0, 'maj'], [5, 'maj'], [7, 'maj']], false],
    ['Turnaround', [[0, 'maj'], [9, 'min'], [2, 'min'], [7, 'maj']], false],
    ['Mixolydian vamp', [[0, 'maj'], [10, 'maj'], [5, 'maj']], false],
    ['Royal road', [[5, 'maj'], [7, 'maj'], [4, 'min'], [9, 'min']], false],
    ['Andalusian cadence', [[0, 'min'], [10, 'maj'], [8, 'maj'], [7, 'maj']], true],
    ['Epic minor loop', [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']], true],
    ['Minor three-chord', [[0, 'min'], [5, 'min'], [7, 'maj']], true],
  ];
  for (const [name, seq, minor] of PATTERN_CASES) {
    const failures = [];
    for (let t = 0; t < 12; t++) for (let r = 0; r < seq.length; r++) {
      const rot = [...seq.slice(r), ...seq.slice(0, r)];
      const chords = rot.map(([d, type]) => ch(t + d, type));
      const a = analyzeProgression(chords, { key: { tonicPc: t, minor }, loop: true });
      if (!a.patterns.some(p => p.name === name)) failures.push(`${NAMES[t]} rotation ${r}: ${chords.map(c => c.symbol).join(' ')} → ${a.patterns.map(p => p.name).join(',') || 'none'}`);
    }
    check(`${name} in all keys and rotations`, !failures.length, failures.slice(0, 3).join('; '));
  }
  const iiVI = analyzeProgression(chordsOf('Em7 A7 Dmaj7 Bm7'), { loop: true });
  check('ii–V–I found inside a longer progression', iiVI.patterns.some(p => p.name === 'ii–V–I'), iiVI.patterns.map(p => p.name).join(','));
}

// ===========================================================================
suite('Cadences');
const CAD = [['C F G C', 'authentic cadence'], ['C F C', 'plagal cadence'], ['C F G Am', 'deceptive cadence'], ['C Am F G', 'half cadence'], ['Am Dm E7 Am', 'authentic cadence'], ['Am Dm E7 F', 'deceptive cadence']];
for (const [text, name] of CAD) {
  const failures = [];
  for (let s = 0; s < 12; s++) {
    const chords = transposeText(text, s);
    const a = analyzeProgression(chords, { loop: false });
    if (a.cadence?.name !== name) failures.push(`+${s}: ${chords.map(c => c.symbol).join(' ')} → ${a.cadence?.name ?? 'none'} (key ${a.key.name})`);
  }
  check(`${text}: ${name} in all 12 keys`, !failures.length, failures.slice(0, 3).join('; '));
}

// ===========================================================================
suite('Key detection');
// [progression, loop, acceptable keys]. Ambiguous relative-key loops list both answers.
const KEYS = [
  ['C G Am F', true, ['C']], ['C Am F G', true, ['C']], ['G C D', true, ['G']], ['C F G C', false, ['C']],
  ['Am G F G', true, ['Am']], ['Am Dm E7 Am', false, ['Am']], ['Am Dm G C', false, ['C']],
  ['Dm7 G7 Cmaj7', true, ['C']], ['Dm7 G7 Cmaj7 A7', true, ['C']], ['Em C G D', true, ['Em', 'G']],
  ['D A Bm G', true, ['D']], ['E7 A7 B7', true, ['E']], ['A7 D7 A7 E7 D7 A7', true, ['A']],
  ['Am G F E', true, ['Am']], ['Cm Ab Bb Cm', false, ['Cm']], ['Cm Fm G7 Cm', false, ['Cm']],
  ['F Bb C F', false, ['F']], ['Bb F Gm Eb', true, ['Bb']], ['C Bb F C', false, ['C']], ['G F C G', false, ['G']],
  ['Dm Bb F C', true, ['Dm', 'F']], ['C E7 Am F Fm C', false, ['C']], ['Em Am B7 Em', false, ['Em']],
  ['F#m D A E', true, ['F#m', 'A']], ['Bm G D A', true, ['Bm', 'D']], ['C Dm Em F G Am Bdim C', false, ['C']],
  ['C G/B Am G F C/E Dm G', true, ['C']], ['Gm Cm D7 Gm', false, ['Gm']], ['C C7 F Fm C', false, ['C']],
  ['Am F C G', true, ['Am', 'C']],
];
for (const [text, loop, accept] of KEYS) {
  const failures = [];
  for (let s = 0; s < 12; s++) {
    const chords = transposeText(text, s);
    const k = detectKeys(chords, { loop })[0];
    const ok = accept.some(a => { const c = getChord(a); return mod12(c.rootPc + s) === k.tonicPc && (c.type === 'min') === k.minor; });
    if (!ok) failures.push(`+${s}: ${chords.map(c => c.symbol).join(' ')} → ${k.name}`);
  }
  check(`${text} → ${accept.join(' or ')} (all 12 keys)`, !failures.length, failures.slice(0, 3).join('; '));
}

// ===========================================================================
suite('Song presets');
// Every preset must load cleanly: a typo in the data file would otherwise show up only
// as "Not recognised" after someone picks that song.
{
  const bad = songData.songs.filter(s => !['title', 'by', 'style', 'chords'].every(f => typeof s[f] === 'string' && s[f].trim()));
  check(`all ${songData.songs.length} songs have a title, artist, style and chords`, !bad.length, bad.map(s => s.title).join(', '));
  const unparsed = songData.songs.map(s => [s.title, parseProgression(s.chords).errors]).filter(([, e]) => e.length);
  check('every song chord is recognised', !unparsed.length, unparsed.map(([t, e]) => `${t}: ${e.join(' ')}`).join('; '));
  // Bar lines and lengths must add up: a song that lasts 7.5 bars has a bar line missing.
  const ragged = songData.songs.map(s => [s.title, parseProgression(s.chords).durations.reduce((a, b) => a + b, 0)])
    .filter(([, total]) => Math.abs(total - Math.round(total)) > 1e-9);
  check('every song lasts a whole number of bars', !ragged.length, ragged.map(([t, n]) => `${t}: ${n}`).join('; '));
  // A chord held longer is written C:2, not C C: the planner counts a repeat as a change.
  const repeats = songData.songs.filter(s => parseProgression(s.chords).chords.some((c, i, all) => i > 0 && c.symbol === all[i - 1].symbol));
  check('no song repeats a chord back to back (lengths are written C:2)', !repeats.length, repeats.map(s => s.title).join(', '));
  // The picker names a song by its chords, so two songs with the same chords would swap.
  const seen = new Map(), clashes = [];
  for (const song of songData.songs) {
    const key = song.chords.split(/[\s,|]+/).filter(Boolean).join(' ');
    if (seen.has(key)) clashes.push(`${seen.get(key)} = ${song.title}`); else seen.set(key, song.title);
  }
  check('no two songs have the same chords', !clashes.length, clashes.join('; '));
}

// ===========================================================================
suite('Chord lengths');
// How long a chord lasts, in bars: written as C:2, or implied by bar lines.
{
  const LENGTHS = [
    ['C G Am F', [1, 1, 1, 1]],             // no bar lines: one bar each
    ['Bb | Gm | Eb | F', [1, 1, 1, 1]],     // one chord per bar
    ['C | G Am | F', [1, 0.5, 0.5, 1]],     // two chords share a bar
    ['C | G Am F |', [1, 1 / 3, 1 / 3, 1 / 3]],
    ['C:2 G Am:0.5', [2, 1, 0.5]],          // explicit lengths
    ['| C:2 G |', [2, 1]],                  // G has the bar to itself
    ['C/G:2 D7/F#', [2, 1]],                // slash chords take lengths too
  ];
  for (const [text, want] of LENGTHS) {
    const { durations, errors } = parseProgression(text);
    check(`"${text}" lasts ${want.map(d => +d.toFixed(2)).join(', ')} bars`,
      !errors.length && durations.length === want.length && durations.every((d, i) => Math.abs(d - want[i]) < 1e-9),
      `got ${JSON.stringify(durations)}, errors ${JSON.stringify(errors)}`);
  }
  const bad = ['C:0', 'C:', 'C:x'].filter(t => parseProgression(t).errors.length !== 1);
  check('a zero or missing length is reported, not guessed', !bad.length, bad.join(', '));

  // Lengths of one bar change nothing: old progressions keep their exact scores.
  const same = [];
  for (const text of ['C G Am F', 'Am F C G', 'Dm7 G7 Cmaj7', 'Bm G D A', 'C G/B Am F']) {
    for (let s = 0; s < 12; s++) {
      const chords = transposeText(text, s);
      const plain = arrange(chords).cost, ones = arrange(chords, { durations: chords.map(() => 1) }).cost;
      if (Math.abs(plain - ones) > 1e-9) same.push(`${text} +${s}: ${plain} vs ${ones}`);
    }
  }
  check('one-bar lengths leave every score unchanged (5 progressions, 12 keys)', !same.length, same.slice(0, 3).join('; '));

  // A chord held on its own: each bar beyond the first adds `sustain` of its difficulty.
  const held = [];
  for (const type of ['maj', 'min', '7', 'm7', 'maj7']) {
    for (let pc = 0; pc < 12; pc++) {
      const c = [ch(pc, type)];
      const one = arrange(c).cost, three = arrange(c, { durations: [3] }).cost;
      if (Math.abs(three - one * (1 + 2 * DEFAULT_OPTIONS.sustain)) > 1e-9) held.push(`${c[0].symbol}: ${one} → ${three}`);
    }
  }
  check(`three bars of a chord count ${1 + 2 * DEFAULT_OPTIONS.sustain}× one bar (5 types, 12 roots)`, !held.length, held.slice(0, 3).join('; '));

  // Holding a chord longer never makes the progression easier, and never changes the
  // level it needs: the level is set by the hardest chord, however long it lasts.
  const worse = [];
  for (let s = 0; s < 12; s++) {
    const chords = transposeText('C G Am F', s), base = arrange(chords);
    chords.forEach((c, i) => {
      const a = arrange(chords, { durations: chords.map((_, j) => (j === i ? 4 : 1)) });
      if (a.cost < base.cost - 1e-9 || a.level !== base.level) worse.push(`+${s} ${c.symbol}:4 → ${a.cost.toFixed(2)} ${a.level} (was ${base.cost.toFixed(2)} ${base.level})`);
    });
  }
  check('a longer chord never lowers the effort or changes the level (12 keys)', !worse.length, worse.slice(0, 3).join('; '));
}

// ===========================================================================
suite('Top 3 variety');
// The top 3 should offer different ways to play a progression, not the cheapest one
// with a single chord swapped. #1 must still be the cheapest arrangement.
{
  const tabsOf = a => a.steps.map(s => s.voicing.tab + s.played);
  const PROGS = ['C G Am F', 'Am G F G', 'Em C G D', 'Dm7 G7 Cmaj7', 'Am C D F Am C E7 Am'];
  const notCheapest = [], duplicate = [], narrow = [];
  for (const text of PROGS) {
    for (let s = 0; s < 12; s++) {
      const chords = transposeText(text, s);
      const choices = arrangeChoices(chords), best = arrange(chords);
      const label = `${chords.map(c => c.symbol).join(' ')}`;
      if (Math.abs(choices[0].cost - best.cost) > 1e-9) notCheapest.push(`${label}: ${choices[0].cost} vs ${best.cost}`);
      const seen = new Set(choices.map(a => tabsOf(a).join(' ')));
      if (seen.size !== choices.length) duplicate.push(label);
      // A four-chord loop of common chords can always be played at least two ways
      // (open or barre shapes low down, or the same shapes higher up the neck).
      if (chords.length === 4 && choices.length === 3) {
        const far = choices.slice(1).filter(a => tabsOf(a).filter((t, i) => t !== tabsOf(choices[0])[i]).length >= 2);
        if (!far.length) narrow.push(label);
      }
    }
  }
  check(`#1 is still the cheapest arrangement (${PROGS.length} progressions, 12 keys)`, !notCheapest.length, notCheapest.slice(0, 3).join('; '));
  check('no arrangement appears twice in the top 3', !duplicate.length, duplicate.slice(0, 3).join('; '));
  check('four-chord loops get an alternative that changes at least two chords', !narrow.length, narrow.slice(0, 3).join('; '));

  // C G Am F is the textbook case: open chords, the same loop with barres, and higher up.
  const styles = arrangeChoices(chordsOf('C G Am F')).map(a => a.style.id);
  check(`C G Am F offers open chords first, then two other approaches (${styles.join(', ')})`,
    styles[0] === 'open' && new Set(styles).size === 3, styles.join(', '));
}

// ===========================================================================
suite('Copying transposed chords');
// The copied chords keep the layout as typed (bar lines, lengths, commas, spacing) and
// only the chord names change, spelled for the new key.
{
  const typed = 'C G | Am F:2 || Dm7 G7/B';
  const KNOWN = [
    [2, 'D A | Bm G:2 || Em7 A7/C#'],       // up a tone: D major, sharps
    [-3, 'A E | F#m D:2 || Bm7 E7/G#'],     // down a minor 3rd: A major, sharps
    [1, 'Db Ab | Bbm Gb:2 || Ebm7 Ab7/C'],  // up a semitone: Db major, flats
  ];
  for (const [shift, want] of KNOWN) {
    const got = replaceChords(typed, transposeText(typed, shift));
    check(`"${typed}" ${shift > 0 ? '+' : ''}${shift} → "${want}"`, got === want, `got "${got}"`);
  }
  const odd = replaceChords('C,  G  Xyz | Am', transposeText('C G Am', 2));
  check('unknown words, commas and spacing are kept', odd === 'D,  A  Xyz | Bm', `got "${odd}"`);

  // In every key: the same layout, and the text reads back as the transposed chords.
  const layout = t => t.replace(/[^\s,|]+/g, tok => (tok.includes(':') ? `#:${tok.split(':')[1]}` : '#'));
  const bad = [];
  for (const text of ['C G | Am F:2 || Dm7 G7/B', 'Am | C | E7:2 | Am', 'F#m7, A, Esus4, B7sus4', 'Bb | Gm Eb | F:0.5 C:0.5']) {
    for (let n = 0; n < 12; n++) {
      const chords = transposeText(text, n), out = replaceChords(text, chords);
      const back = parseProgression(out);
      if (layout(out) !== layout(text) || back.errors.length || back.chords.map(c => c.symbol).join(' ') !== chords.map(c => c.symbol).join(' ')
        || JSON.stringify(back.durations) !== JSON.stringify(parseProgression(text).durations)) bad.push(`${text} +${n} → ${out}`);
    }
  }
  check('layout and lengths survive transposing into all 12 keys (4 progressions)', !bad.length, bad.slice(0, 3).join('; '));
}

// ===========================================================================
suite('H and German naming');
// German, Polish, Czech and Scandinavian charts call B natural "H", and in those charts a
// plain "B" is B-flat. H is always B; a B means B-flat only in a progression that uses H.
{
  const H = [['H', 'B'], ['Hm', 'Bm'], ['H7', 'B7'], ['Hmaj7', 'Bmaj7'], ['Hm7b5', 'Bm7b5'], ['G/H', 'G/B'], ['H7/D#', 'B7/D#'], ['H#', 'B#']];
  const wrongH = H.filter(([h, b]) => getChord(h)?.symbol !== b).map(([h, b]) => `${h} → ${getChord(h)?.symbol} (want ${b})`);
  check(`H chords read as B (${H.map(x => x[0]).join(', ')})`, !wrongH.length, wrongH.join('; '));
  check('B on its own stays B natural', getChord('B').rootPc === 11 && getChord('Bm').symbol === 'Bm');

  const READINGS = [
    ['F B C H7', 'F Bb C B7', true],        // Polish/German chart: B is B-flat
    ['Bm H E', 'Bbm B E', true],            // b-moll next to H
    ['Xyz B | F/B H:2', null, true],        // an unknown word stays unknown; F/B is F/Bb
    ['Bb H', 'Bb B', false],                // an explicit Bb is already B-flat: nothing reread
    ['F B C', 'F B C', false],              // no H: English naming
    ['G D Em C', 'G D Em C', false],
  ];
  for (const [text, want, flagged] of READINGS) {
    const r = parseProgression(text);
    const got = r.chords.map(c => c.symbol).join(' ');
    if (want === null) {
      check(`"${text}" reads F/B as F/Bb and flags it`, r.germanB === flagged && got === 'Bb F/Bb B' && r.errors.join() === 'Xyz', `got "${got}", errors ${r.errors}, flag ${r.germanB}`);
    } else {
      check(`"${text}" reads as ${want}${flagged ? ' (B as B-flat, noted)' : ''}`, got === want && r.germanB === flagged, `got "${got}", flag ${r.germanB}`);
    }
  }
  // Copying a German chart transposed: same layout, English names in the new key.
  const german = 'F B | C H7:2';
  const moved = replaceChords(german, transposeChords(parseProgression(german).chords, 2, undefined, 'auto'));
  check(`"${german}" up a tone copies as "G C | D C#7:2"`, moved === 'G C | D C#7:2', `got "${moved}"`);
}

// ===========================================================================
suite('Polish note names');
// Polish (and German) names: a sharp adds -is, a flat adds -es (-s after A and E), H is
// B natural and B is B-flat. Songbooks write minor chords in lowercase.
{
  const same = (list, what) => {
    const bad = list.filter(([p, e]) => getChord(p)?.symbol !== e).map(([p, e]) => `${p} → ${getChord(p)?.symbol ?? 'nothing'} (want ${e})`);
    check(`${what}: ${list.map(x => x[0]).join(', ')}`, !bad.length, bad.join('; '));
  };
  same([['Cis', 'C#'], ['Dis', 'D#'], ['Eis', 'E#'], ['Fis', 'F#'], ['Gis', 'G#'], ['Ais', 'A#'], ['His', 'B#']], 'sharps end in -is');
  same([['Ces', 'Cb'], ['Des', 'Db'], ['Es', 'Eb'], ['Fes', 'Fb'], ['Ges', 'Gb'], ['As', 'Ab'], ['Hes', 'Bb']], 'flats end in -es, -s after A and E');
  same([['Fisis', 'F##'], ['Heses', 'Bbb'], ['Ases', 'Abb']], 'double sharps and flats');
  same([['a', 'Am'], ['e', 'Em'], ['d', 'Dm'], ['fis', 'F#m'], ['cis', 'C#m'], ['h', 'Bm'], ['b', 'Bbm'], ['es', 'Ebm']], 'lowercase is minor');
  same([['H#', 'B#'], ['f#', 'F#m'], ['eb7', 'Ebm7'], ['c#m', 'C#m']], 'mixed spellings');
  same([['a7', 'Am7'], ['fis7', 'F#m7'], ['h7', 'Bm7'], ['am', 'Am'], ['am7', 'Am7'], ['e9', 'Em9'], ['a6', 'Am6']], 'lowercase with a suffix');
  same([['Fis7', 'F#7'], ['Cis7', 'C#7'], ['Asmaj7', 'Abmaj7'], ['Es7', 'Eb7'], ['Gis', 'G#'], ['B7', 'B7']], 'uppercase stays major');
  same([['a-moll', 'Am'], ['A-moll', 'Am'], ['Fis-dur', 'F#'], ['a-dur', 'A'], ['B-dur', 'Bb']], 'moll and dur');
  same([['D/Fis', 'D/F#'], ['a/Gis', 'Am/G#'], ['Es/B', 'Eb/Bb'], ['G/H', 'G/B'], ['C/e', 'C/E']], 'bass notes');
  // English symbols that look Polish keep their English meaning.
  same([['Asus4', 'Asus4'], ['Esus4', 'Esus4'], ['Asus2', 'Asus2'], ['E7sus4', 'E7sus4'], ['Bb', 'Bb'], ['Eb', 'Eb'], ['Ab7', 'Ab7']], 'English stays English');

  const READINGS = [
    ['a C d G', 'Am C Dm G', false],          // a campfire classic: no B in it, nothing to note
    ['e a H7 e', 'Em Am B7 Em', false],       // the typical minor-key cadence
    ['F B C d', 'F Bb C Dm', true],           // lowercase d marks it Polish, so B is B-flat
    ['D Fis h G', 'D F# Bm G', false],
    ['Es B Es', 'Eb Bb Eb', true],
    ['G C D', 'G C D', false],                // plain English: untouched
  ];
  for (const [text, want, noted] of READINGS) {
    const r = parseProgression(text);
    const got = r.chords.map(c => c.symbol).join(' ');
    check(`"${text}" reads as ${want}${noted ? ' (B as B-flat, noted)' : ''}`, got === want && !r.errors.length && r.germanB === noted, `got "${got}", errors ${r.errors}, noted ${r.germanB}`);
  }
  const moved = replaceChords('a C | d G:2', transposeChords(parseProgression('a C | d G:2').chords, 2, undefined, 'auto'));
  check('"a C | d G:2" up a tone copies in English as "Bm D | Em A:2"', moved === 'Bm D | Em A:2', `got "${moved}"`);
}

export default results;
