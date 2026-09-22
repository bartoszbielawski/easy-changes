// Harmonic analysis of a progression: key detection, Roman numerals, chord roles
// (secondary dominants, borrowed chords), root motion and well-known patterns.
import { mod12 } from './theory.js';

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const KEY_NAMES_MAJOR = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const KEY_NAMES_MINOR = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

const rel = (chord, tonic) => mod12(chord.rootPc - tonic);
const tonesOf = chord => [...new Set([...chord.pcs, ...(chord.bassPc !== null ? [chord.bassPc] : [])])];

/** 'M' (major 3rd or no 3rd), 'm' (minor 3rd), 'd' (diminished 5th with minor 3rd). */
export function qualityOf(chord) {
  const has = i => chord.pcs.includes(mod12(chord.rootPc + i));
  if (has(3) && !has(4)) return has(6) && !has(7) ? 'd' : 'm';
  return 'M';
}
const isDominant = chord => qualityOf(chord) === 'M' && chord.pcs.includes(mod12(chord.rootPc + 10));

function inScale(chord, tonic, minor) {
  const scale = new Set((minor ? MINOR_SCALE : MAJOR_SCALE).map(i => mod12(tonic + i)));
  return tonesOf(chord).every(pc => scale.has(pc));
}

/** Diatonic to the key; in minor, the harmonic-minor V, V7 and vii° count as diatonic too. */
function isDiatonic(chord, tonic, minor) {
  if (inScale(chord, tonic, minor)) return true;
  if (!minor) return false;
  const r = rel(chord, tonic);
  const harmonic = new Set([...MINOR_SCALE.filter(i => i !== 10), 11].map(i => mod12(tonic + i)));
  return (r === 7 || r === 11) && tonesOf(chord).every(pc => harmonic.has(pc));
}

// ---- Key detection ------------------------------------------------------------

/**
 * Rank all 24 keys for a progression. Evidence: how many chord tones fit the key,
 * the tonic chord at the start / end / repeated, dominant-to-tonic resolutions and ii–V–I.
 * Returns [{ tonicPc, minor, name, score }], best first.
 */
export function detectKeys(chords, { loop = true } = {}) {
  const n = chords.length;
  const out = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const minor of [false, true]) {
      const tonicQ = minor ? 'm' : 'M';
      const isTonic = c => rel(c, tonic) === 0 && qualityOf(c) === tonicQ;
      let score = 0;
      for (const c of chords) {
        const tones = tonesOf(c);
        score += isDiatonic(c, tonic, minor) ? 1 : tones.filter(pc => inScale({ ...c, pcs: [pc], bassPc: null }, tonic, minor)).length / tones.length * 0.75;
        if (isTonic(c)) score += 0.5;
      }
      if (n && isTonic(chords[0])) score += 1;
      // A loop has no real last chord; a one-off progression usually ends at home.
      if (n && !loop && isTonic(chords[n - 1])) score += 1;
      const pairs = chords.map((c, i) => [c, chords[i + 1] ?? (loop ? chords[0] : null)]).filter(([, b]) => b);
      for (const [a, b] of pairs) {
        if (rel(a, tonic) === 7 && qualityOf(a) === 'M' && rel(b, tonic) === 0) score += 0.75;   // V → I
      }
      for (let i = 0; i + 2 < n; i++) {
        const [a, b, c] = chords.slice(i, i + 3);
        if (rel(a, tonic) === 2 && rel(b, tonic) === 7 && qualityOf(b) === 'M' && rel(c, tonic) === 0) score += 1.5;   // ii–V–I
      }
      // Blues: all dominant 7ths, so "diatonic" means little; roots on I, IV and V decide the key.
      if (!minor && n && chords.every(isDominant) && chords.every(c => [0, 5, 7].includes(rel(c, tonic)))) score += 3;
      out.push({ tonicPc: tonic, minor, name: (minor ? KEY_NAMES_MINOR : KEY_NAMES_MAJOR)[tonic] + (minor ? 'm' : ''), score });
    }
  }
  return out.sort((a, b) => b.score - a.score || (a.minor - b.minor));
}

export function detectKey(chords, opts) {
  return detectKeys(chords, opts)[0];
}

// ---- Roman numerals -------------------------------------------------------------

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
// Scale degree (0-6) and accidental for each semitone above the tonic.
const DEGREE_MAJOR = [[0, ''], [1, 'b'], [1, ''], [2, 'b'], [2, ''], [3, ''], [4, 'b'], [4, ''], [5, 'b'], [5, ''], [6, 'b'], [6, '']];
const DEGREE_MINOR = [[0, ''], [1, 'b'], [1, ''], [2, ''], [2, '#'], [3, ''], [4, 'b'], [4, ''], [5, ''], [5, '#'], [6, ''], [6, '#']];

// Suffix after the numeral: the chord type, minus what the numeral's case already says.
function numeralSuffix(chord) {
  switch (chord.type) {
    case 'maj': case 'min': return '';
    case 'dim': return '°';
    case 'dim7': return '°7';
    case 'm7b5': return 'ø7';
    case 'aug': return '+';
    case '7#5': return '+7';
    case 'mmaj7': return '(maj7)';
    default: return chord.type.startsWith('m') && !chord.type.startsWith('maj') ? chord.type.slice(1) : chord.type;
  }
}

// Figured-bass style inversion marks: ⁶ ⁶₄ for triads, ⁶₅ ⁴₃ ⁴₂ for seventh chords.
function inversionMark(chord) {
  if (!chord.bass || chord.bassKind !== 'inversion') return '';
  const seventh = chord.notes.length >= 4;
  const d = chord.bassDegree.replace(/[b#]/g, '');
  if (d === '3') return seventh ? '⁶₅' : '⁶';
  if (d === '5') return seventh ? '⁴₃' : '⁶₄';
  if (d === '7') return '⁴₂';
  return '';
}

function degreeName(semis, minor, chord) {
  let [deg, acc] = (minor ? DEGREE_MINOR : DEGREE_MAJOR)[semis];
  // In minor the raised leading-tone chord is written vii° with no accidental.
  if (minor && semis === 11 && qualityOf(chord) === 'd') acc = '';
  // A diminished chord a tritone above the tonic is #iv°, not bv°.
  if (!minor && semis === 6 && qualityOf(chord) === 'd') { deg = 3; acc = '#'; }
  return { deg, acc };
}

/** Roman numeral for a chord in a key, e.g. V7, ii, bVII, vii°, I⁶. */
export function romanNumeral(chord, tonic, minor) {
  const { deg, acc } = degreeName(rel(chord, tonic), minor, chord);
  const q = qualityOf(chord);
  const base = q === 'M' ? ROMAN[deg] : ROMAN[deg].toLowerCase();
  const inv = inversionMark(chord);
  // Figured bass for an inverted seventh chord (⁶₅ ⁴₃ ⁴₂) already implies the 7th: V⁶₅, not V7⁶₅.
  const suffix = inv && chord.notes.length >= 4 ? numeralSuffix(chord).replace(/7$/, '') : numeralSuffix(chord);
  let numeral = acc + base + suffix + inv;
  // A bass note outside the chord: show it as a degree, e.g. IV/I.
  if (chord.bass && chord.bassKind === 'slash') {
    const b = degreeName(mod12(chord.bassPc - tonic), minor, { pcs: [], rootPc: 0 });
    numeral += '/' + b.acc + ROMAN[b.deg];
  }
  return numeral;
}

// ---- Chord roles ------------------------------------------------------------------

const FUNCTION_MAJOR = { 0: 'T', 2: 'S', 4: 'T', 5: 'S', 7: 'D', 9: 'T', 11: 'D' };
const FUNCTION_MINOR = { 0: 'T', 2: 'S', 3: 'T', 5: 'S', 7: 'D', 8: 'S', 10: 'D', 11: 'D' };
// Chords borrowed into a major key from its parallel minor mostly act as subdominants.
const FUNCTION_BORROWED_IN_MAJOR = { 0: 'T', 2: 'S', 3: 'T', 5: 'S', 8: 'S', 10: 'S' };
export const FUNCTION_NAMES = { T: 'tonic (home)', S: 'subdominant (away)', D: 'dominant (tension, wants to go home)' };

const isMinorSeventh = chord => qualityOf(chord) === 'm' && chord.pcs.includes(mod12(chord.rootPc + 10));
// The name of a key on a pitch class, for "a brief key change to Db major".
const keyNameOf = (pc, minorKey) => (minorKey ? KEY_NAMES_MINOR : KEY_NAMES_MAJOR)[mod12(pc)] + (minorKey ? ' minor' : ' major');

function roleOf(chord, prev, next, after, tonic, minor, bluesy) {
  const r = rel(chord, tonic);
  // In blues every chord is a dominant 7th; on I, IV and V that's the style, not a secondary dominant.
  if (bluesy && isDominant(chord) && [0, 5, 7].includes(r)) {
    return { kind: 'diatonic', fn: { 0: 'T', 5: 'S', 7: 'D' }[r], note: r === 7 ? null : 'a blues dominant 7th' };
  }
  const nextRel = next ? rel(next, tonic) : null;
  // A dominant 7th that steps down a fifth into a chord outside the key borrows that chord
  // as a temporary home ("Ab7 -> Dbmaj7" inside C minor).
  const tonicizes = c => isDominant(c) && next && nextRel === mod12(rel(c, tonic) + 5) && !isDiatonic(next, tonic, minor);
  if (isDiatonic(chord, tonic, minor)) {
    return { kind: 'diatonic', fn: (minor ? FUNCTION_MINOR : FUNCTION_MAJOR)[r] ?? null, note: null };
  }
  const romanFor = (semis, q) => {
    const { deg, acc } = degreeName(semis, minor, { pcs: [], rootPc: 0 });
    return acc + (q === 'm' ? ROMAN[deg].toLowerCase() : ROMAN[deg]);
  };
  const targetKey = t => keyNameOf(tonic + t, qualityOf(next ?? chord) === 'm');
  // ii–V into a key of its own: the ii7 before such a dominant belongs to that key too.
  if (isMinorSeventh(chord) && next && isDominant(next) && nextRel === mod12(r + 5)
      && after && rel(after, tonic) === mod12(r + 10) && !isDiatonic(after, tonic, minor)) {
    const target = romanFor(mod12(r + 10), qualityOf(after));
    return { kind: 'tonicized', fn: 'S', label: `ii7/${target}`,
             note: `the start of a ii–V–I that moves to ${keyNameOf(tonic + r + 10, qualityOf(after) === 'm')} for a moment` };
  }
  if (tonicizes(chord)) {
    const target = romanFor(nextRel, qualityOf(next));
    return { kind: 'tonicized', fn: 'D', label: `V7/${target}`,
             note: `treats ${targetKey(nextRel)} as home for a moment` };
  }
  // The chord that a ii–V or V7 has just made home: a brief key change.
  if (prev && isDominant(prev) && rel(prev, tonic) === mod12(r + 7)) {
    return { kind: 'tonicized', fn: 'T', note: `a brief key change: its own V7 leads into it` };
  }
  // Tritone substitution: a dominant 7th a half step above the chord it resolves to
  // (Gb7 -> Fmaj7 stands in for C7 -> Fmaj7).
  if (isDominant(chord) && next && nextRel === mod12(r - 1) && (nextRel === 0 || isDiatonic(next, tonic, minor))) {
    const target = romanFor(nextRel, qualityOf(next));
    return { kind: 'secondary', fn: 'D', label: `subV7/${target}`,
             note: `tritone substitution: stands in for the V7 of ${target} and slides down a half step to it` };
  }
  // A plain major triad from the parallel key that doesn't move to "its" chord is borrowed,
  // not a secondary dominant (the major IV in a minor key, e.g. E in B minor).
  const resolvesAsDominant = next && nextRel === mod12(r - 7);
  if (!isDominant(chord) && !resolvesAsDominant && isDiatonic(chord, tonic, !minor)) {
    const parallel = (minor ? KEY_NAMES_MAJOR : KEY_NAMES_MINOR)[tonic] + (minor ? ' major' : ' minor');
    return { kind: 'borrowed', fn: (minor ? FUNCTION_MAJOR : FUNCTION_BORROWED_IN_MAJOR)[r] ?? null, note: `borrowed from ${parallel}` };
  }
  // Secondary dominant: a major/dominant chord a 5th above a diatonic chord other than the tonic.
  if (qualityOf(chord) === 'M') {
    const targetRel = mod12(r - 7);
    const scale = minor ? MINOR_SCALE : MAJOR_SCALE;
    if (targetRel !== 0 && scale.includes(targetRel)) {
      const targetQ = minor
        ? { 2: 'd', 3: 'M', 5: 'm', 7: 'm', 8: 'M', 10: 'M' }[targetRel]
        : { 2: 'm', 4: 'm', 5: 'M', 7: 'M', 9: 'm', 11: 'd' }[targetRel];
      if (targetQ && targetQ !== 'd') {
        const { deg, acc } = degreeName(targetRel, minor, { pcs: [], rootPc: 0 });
        const target = acc + (targetQ === 'M' ? ROMAN[deg] : ROMAN[deg].toLowerCase());
        const resolves = next && rel(next, tonic) === targetRel;
        const label = `V${isDominant(chord) ? '7' : ''}/${target}`;
        return { kind: 'secondary', fn: 'D', label,
                 note: `secondary dominant: the V of ${target}${resolves ? ', and it resolves there' : ', though here it moves elsewhere'}` };
      }
    }
  }
  // Borrowed from the parallel major/minor key (modal interchange).
  if (isDiatonic(chord, tonic, !minor)) {
    const parallel = (minor ? KEY_NAMES_MAJOR : KEY_NAMES_MINOR)[tonic] + (minor ? ' major' : ' minor');
    return { kind: 'borrowed', fn: (minor ? FUNCTION_MAJOR : FUNCTION_BORROWED_IN_MAJOR)[r] ?? null, note: `borrowed from ${parallel}` };
  }
  // The same chord type shifted by a step: a parallel move rather than a functional one.
  if (prev && prev.type === chord.type) {
    const step = mod12(r - rel(prev, tonic));
    if ([1, 2, 10, 11].includes(step)) {
      const dir = step <= 2 ? 'up' : 'down';
      const size = step === 1 || step === 11 ? 'a half step' : 'a whole step';
      return { kind: 'chromatic', fn: null, note: `the same chord shifted ${dir} ${size} (a parallel move, not a resolution)` };
    }
  }
  return { kind: 'chromatic', fn: null, note: 'chromatic: outside the key and its parallel key' };
}

// ---- Root motion ------------------------------------------------------------------

const STEP_NAMES = { 1: 'a half step', 2: 'a whole step', 3: 'a minor 3rd', 4: 'a major 3rd', 5: 'a 4th', 6: 'a tritone' };

/** How the root moves from a to b, and how strong that motion is. */
export function rootMotion(a, b) {
  const up = mod12(b.rootPc - a.rootPc);
  if (up === 0) return { text: 'same root', short: '=', strength: 'static' };
  const dir = up <= 6 ? 'up' : 'down';
  const size = up <= 6 ? up : 12 - up;
  const text = up === 6 ? 'a tritone' : `${dir} ${STEP_NAMES[size]}`;
  // Up a 4th = down a 5th: the strongest motion in tonal music (V → I).
  const strength = up === 5 ? 'strong' : up === 7 ? 'plagal' : size <= 2 ? 'step' : size <= 4 ? 'third' : 'tritone';
  const short = `${dir === 'up' ? '↑' : '↓'}${{ 1: 'H', 2: 'W', 3: 'm3', 4: 'M3', 5: '4', 6: 'TT' }[size]}`;
  return { text, short, strength, semitones: up };
}

// ---- Named progressions -------------------------------------------------------------

// Degrees (semitones above the tonic) with quality. Matched as whole loops (any rotation)
// or as a run inside a longer progression.
const PATTERNS = [
  { name: 'Axis progression', seq: ['0M', '7M', '9m', '5M'], desc: 'I–V–vi–IV, the most common pop progression of the last decades' },
  { name: '50s progression', seq: ['0M', '9m', '5M', '7M'], desc: 'I–vi–IV–V, doo-wop and early rock ballads' },
  { name: 'Three-chord song', seq: ['0M', '5M', '7M'], desc: 'I–IV–V, the backbone of folk, country and rock' },
  { name: 'ii–V–I', seq: ['2m', '7M', '0M'], run: true, desc: 'the jazz cadence: away, tension, home' },
  { name: 'minor ii–V–i', seq: ['2d', '7M', '0m'], run: true, desc: 'the jazz cadence in a minor key' },
  { name: 'Turnaround', seq: ['0M', '9m', '2m', '7M'], desc: 'I–vi–ii–V, the classic jazz and standards turnaround' },
  { name: 'Andalusian cadence', seq: ['0m', '10M', '8M', '7M'], desc: 'i–VII–VI–V, a stepwise descent heard in flamenco and rock' },
  { name: 'Epic minor loop', seq: ['0m', '8M', '3M', '10M'], desc: 'i–VI–III–VII, film scores and anthemic rock' },
  { name: 'Aeolian vamp', seq: ['0m', '10M', '8M'], desc: 'i–VII–VI, a descending minor rock riff' },
  { name: 'Mixolydian vamp', seq: ['0M', '10M', '5M'], desc: 'I–bVII–IV, classic rock with a borrowed bVII' },
  { name: 'Royal road', seq: ['5M', '7M', '4m', '9m'], desc: 'IV–V–iii–vi, a staple of J-pop' },
  { name: 'Pachelbel\'s Canon', seq: ['0M', '7M', '9m', '4m', '5M', '0M', '5M', '7M'], desc: 'the Canon in D sequence, used in countless songs' },
  { name: 'Minor three-chord', seq: ['0m', '5m', '7M'], desc: 'i–iv–V, the basic minor-key cadence' },
];

function patternKey(chord, tonic) {
  const q = qualityOf(chord);
  return `${rel(chord, tonic)}${q}`;
}

function findPatterns(chords, tonic, loop) {
  // Collapse repeated chords (C C G G -> C G) before matching.
  const keys = chords.map(c => patternKey(c, tonic)).filter((k, i, a) => i === 0 || k !== a[i - 1]);
  if (loop && keys.length > 1 && keys[0] === keys[keys.length - 1]) keys.pop();
  const found = [];
  const joined = arr => arr.join(' ');
  for (const p of PATTERNS) {
    const rotations = p.seq.map((_, i) => [...p.seq.slice(i), ...p.seq.slice(0, i)]);
    if (!p.run && keys.length === p.seq.length && rotations.some(r => joined(r) === joined(keys))) {
      const rotated = joined(p.seq) !== joined(keys);
      found.push({ name: p.name, desc: p.desc, how: rotated ? 'the same loop, started at a different chord' : 'exactly' });
      continue;
    }
    const hay = ` ${joined(loop ? [...keys, ...keys.slice(0, p.seq.length - 1)] : keys)} `;
    if (keys.length >= p.seq.length && (p.run || keys.length > p.seq.length) && hay.includes(` ${joined(p.seq)} `)) {
      found.push({ name: p.name, desc: p.desc, how: 'inside the progression' });
    }
  }
  // A whole-loop match says it all; drop smaller loop patterns spotted inside it.
  if (found.some(f => f.how !== 'inside the progression')) {
    for (let i = found.length - 1; i >= 0; i--) {
      const p = PATTERNS.find(x => x.name === found[i].name);
      if (found[i].how === 'inside the progression' && !p.run) found.splice(i, 1);
    }
  }
  // 12-bar blues family: only dominant 7ths on I, IV and V.
  const degs = new Set(chords.map(c => rel(c, tonic)));
  if (chords.every(isDominant) && [...degs].every(d => [0, 5, 7].includes(d)) && degs.has(0) && degs.size >= 2) {
    found.push({ name: 'Blues changes', desc: 'I7–IV7–V7 dominant chords, the 12-bar blues harmony', how: 'chords' });
  }
  // A chain of roots falling by fifths (up a 4th each time), e.g. E7–A7–D7–G7.
  let run = 1, best = 1;
  for (let i = 1; i < chords.length; i++) {
    run = mod12(chords[i].rootPc - chords[i - 1].rootPc) === 5 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  if (best >= 4) found.push({ name: 'Circle of fifths', desc: `${best} chords in a row with roots falling by fifths, each one pulling to the next`, how: 'inside the progression' });
  return found;
}

// ---- Cadence -----------------------------------------------------------------------

function cadenceOf(chords, tonic, minor) {
  if (chords.length < 2) return null;
  const [a, b] = chords.slice(-2);
  const ra = rel(a, tonic), rb = rel(b, tonic);
  if (ra === 7 && qualityOf(a) === 'M' && rb === 0) return { name: 'authentic cadence', desc: 'V → I: the strongest way to end' };
  if (ra === 5 && rb === 0) return { name: 'plagal cadence', desc: 'IV → I: the "amen" ending' };
  if (ra === 7 && qualityOf(a) === 'M' && rb === (minor ? 8 : 9)) return { name: 'deceptive cadence', desc: `V → ${minor ? 'VI' : 'vi'}: sets up home, then swerves` };
  if (rb === 7) return { name: 'half cadence', desc: 'ends on V: unresolved, wants to continue' };
  return null;
}

// ---- Everything together -------------------------------------------------------------

/**
 * Analyse a progression. key: { tonicPc, minor } or null to detect it.
 * Returns { key, alternatives, steps, patterns, cadence }.
 */
export function analyzeProgression(chords, { key = null, loop = true } = {}) {
  if (!chords.length) return null;
  const ranked = detectKeys(chords, { loop });
  const chosen = key
    ? ranked.find(k => k.tonicPc === mod12(key.tonicPc) && k.minor === key.minor)
    : ranked[0];
  // Close runners-up (usually the relative major/minor) are worth mentioning.
  const alternatives = ranked.filter(k => k !== chosen && k.score >= ranked[0].score - 1).slice(0, 2);
  const { tonicPc: tonic, minor } = chosen;
  const bluesy = chords.every(isDominant);

  const steps = chords.map((c, i) => {
    const next = chords[i + 1] ?? (loop ? chords[0] : null);
    const role = roleOf(c, chords[i - 1] ?? (loop ? chords[chords.length - 1] : null), next,
                        chords[i + 2] ?? (loop ? chords[(i + 2) % chords.length] : null), tonic, minor, bluesy);
    return {
      symbol: c.symbol,
      numeral: romanNumeral(c, tonic, minor),
      ...role,
      motion: next && (i + 1 < chords.length || loop) ? rootMotion(c, next) : null,
    };
  });
  return {
    key: chosen,
    detected: !key,
    alternatives,
    steps,
    patterns: findPatterns(chords, tonic, loop),
    cadence: loop ? null : cadenceOf(chords, tonic, minor),
  };
}
