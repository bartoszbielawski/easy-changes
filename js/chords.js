// Chord database: chord types, symbol parsing, spelling, guitar voicings and lookup.
import { loadJson } from './data.js';
import { parseNote, parseDegree, spellDegree, mod12, pcName, DEFAULT_NAMES, SHARP_NAMES, FLAT_NAMES } from './theory.js';
import { scoreVoicing } from './difficulty.js';

const [chordTypesData, voicingData] = await Promise.all([loadJson('chord-types.json'), loadJson('guitar-voicings.json')]);

export const CHORD_TYPES = chordTypesData.types.map(t => {
  const degrees = t.degrees.map(parseDegree);
  return { ...t, intervals: degrees.map(d => d.semitones), pcs: degrees.map(d => mod12(d.semitones)) };
});
const TYPE_BY_ID = new Map(CHORD_TYPES.map(t => [t.id, t]));

// Suffix -> type, e.g. "m7" -> m7, "-7" -> m7, "" -> maj.
const TYPE_BY_SUFFIX = new Map();
for (const t of CHORD_TYPES) for (const s of [t.symbol, ...t.aliases]) TYPE_BY_SUFFIX.set(s, t);

export const TUNING = voicingData.tuning.map(n => parseNote(n));
export const STRING_COUNT = TUNING.length;
export const ROOTS = DEFAULT_NAMES;

// Root spellings when no key is known ('auto'): the name whose key signature is simplest
// for that kind of chord. Major-type: Db (5 flats) not C# (7 sharps). Minor-type: G#m
// (5 sharps) not Abm (7 flats). Diminished chords usually lead up a semitone, so sharps.
const MAJOR_ROOT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_ROOT_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const DIMINISHED_TYPES = new Set(['dim', 'dim7', 'm7b5']);

/** Name for a root pitch class: accidentals 'auto' (by chord type), 'flat' or 'sharp'. */
export function rootName(pc, typeId = 'maj', accidentals = 'auto') {
  pc = mod12(pc);
  if (accidentals === 'flat') return FLAT_NAMES[pc];
  if (accidentals === 'sharp') return SHARP_NAMES[pc];
  if (DIMINISHED_TYPES.has(typeId)) return SHARP_NAMES[pc];
  return (TYPE_BY_ID.get(typeId)?.degrees.includes('b3') ? MINOR_ROOT_NAMES : MAJOR_ROOT_NAMES)[pc];
}

export function getChordType(id) {
  const t = TYPE_BY_ID.get(id);
  if (!t) throw new Error(`Unknown chord type: ${id}`);
  return t;
}

// German, Polish, Czech and Scandinavian charts call B natural "H". It is read as B and
// shown as B. (In those charts a plain "B" means B-flat; parseProgression handles that,
// since only the rest of the progression can tell which naming a "B" is in.)
const englishLetter = note => note.replace(/^H/, 'B');

/**
 * Parse a chord symbol such as "C", "F#m7", "Bbmaj7", "Dm7b5", "G7/B", "C6/9", "H7".
 * Returns null if the symbol is not recognised.
 */
export function parseChordSymbol(symbol) {
  const s = String(symbol).trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const m = /^([A-H](?:#|b)?)(.*)$/.exec(s);
  if (!m) return null;
  const root = parseNote(englishLetter(m[1]));
  let rest = m[2].trim();
  let bass = null;
  // A trailing "/X" where X is a note is a bass note ("6/9" is not, since 9 is not a note).
  const slash = /^(.*)\/([A-H](?:#|b)?)$/.exec(rest);
  if (slash) { rest = slash[1]; bass = parseNote(englishLetter(slash[2])); }
  const type = TYPE_BY_SUFFIX.get(rest) ?? TYPE_BY_SUFFIX.get(rest.replace(/[()]/g, ''));
  if (!type) return null;
  return { root, type, bass };
}

/** Build a full chord description from a symbol, or from (root, typeId[, bass]). */
export function getChord(symbolOrRoot, typeId, bassName = null) {
  let root, type, bass = null;
  if (typeId === undefined) {
    const parsed = parseChordSymbol(symbolOrRoot);
    if (!parsed) return null;
    ({ root, type, bass } = parsed);
  } else {
    root = parseNote(symbolOrRoot);
    type = getChordType(typeId);
    bass = bassName ? parseNote(bassName) : null;
    if (!root) return null;
  }
  if (bass && bass.pc === root.pc) bass = null;
  const notes = type.degrees.map((degree, i) => ({
    degree,
    name: spellDegree(root, degree),
    pc: mod12(root.pc + type.intervals[i]),
    optional: type.optional.includes(degree),
  }));
  const symbol = root.name + type.symbol + (bass ? `/${bass.name}` : '');
  const bassTone = bass && notes.find(n => n.pc === bass.pc);
  return {
    symbol,
    root: root.name,
    rootPc: root.pc,
    type: type.id,
    typeName: type.name,
    category: type.category,
    formula: type.degrees.join(' '),
    notes,
    pcs: notes.map(n => n.pc),
    bass: bass ? bass.name : null,
    bassPc: bass ? bass.pc : null,
    // 'inversion' when the bass is a chord tone (C/E), 'slash' when it is not (C/D).
    bassKind: !bass ? null : bassTone ? 'inversion' : 'slash',
    bassDegree: bassTone ? bassTone.degree : null,
  };
}

const parseFrets = s => [...s].map(c => (c === 'x' ? null : Number(c)));
// Fingers: 1-4 = index..pinky, 'T' (stored as 5) = thumb over the neck.
export const THUMB = 5;
const parseFingers = s => [...s].map(c => (c === 'T' ? THUMB : Number(c)));

function buildVoicing(chord, frets, fingers, meta) {
  const spelled = new Map(chord.notes.map(n => [n.pc, n.name]));
  if (chord.bass && !spelled.has(chord.bassPc)) spelled.set(chord.bassPc, chord.bass);
  const strings = frets.map((f, i) => {
    if (f === null) return null;
    const pc = mod12(TUNING[i].pc + f);
    return { fret: f, finger: fingers[i], pc, note: spelled.get(pc) ?? pcName(pc),
             degree: chord.notes.find(n => n.pc === pc)?.degree ?? null };
  });
  const fretted = frets.filter(f => f > 0);
  return {
    ...meta,
    chord: chord.symbol,
    frets,
    fingers,
    tab: frets.map(f => (f === null ? 'x' : f)).join(frets.some(f => f > 9) ? '-' : ''),
    minFret: fretted.length ? Math.min(...fretted) : 0,
    maxFret: fretted.length ? Math.max(...fretted) : 0,
    strings,
    difficulty: scoreVoicing(frets, fingers),
  };
}

/** Root-position voicings from the database (open chords + transposed movable shapes). */
function rootVoicings(chord) {
  const result = [];
  for (const v of voicingData.open) {
    if (v.bass || v.type !== chord.type || parseNote(v.root).pc !== chord.rootPc) continue;
    result.push(buildVoicing(chord, parseFrets(v.frets), parseFingers(v.fingers),
      { id: `open:${v.root}${v.type}:${v.frets}`, source: 'open', name: 'Open position' }));
  }
  for (const s of voicingData.movable) {
    if (s.bass || s.type !== chord.type) continue;
    const shape = parseFrets(s.shape);
    const rootIndex = STRING_COUNT - s.rootString;
    const base = mod12(chord.rootPc - TUNING[rootIndex].pc - shape[rootIndex]) || 12;
    const frets = shape.map(f => (f === null ? null : f + base));
    result.push(buildVoicing(chord, frets, parseFingers(s.fingers),
      { id: `shape:${s.id}@${base}`, source: 'movable', shapeId: s.id, name: s.name, rootString: s.rootString }));
  }
  return result;
}

// ---- Slash chords and inversions -------------------------------------------
// Generated from the root-position voicings in the two ways guitarists build them:
//  1. mute low strings until the wanted note is lowest (C x32010 -> C/E xx2010)
//  2. add the bass note on a lower string: open, with a free finger, by extending
//     the barre, or with the thumb (C -> C/G 332010, D -> D/F# 2x0232)

const soundedIndexes = frets => frets.flatMap((f, i) => (f === null ? [] : [i]));

function trimLow(frets, fingers, count) {
  const idx = soundedIndexes(frets);
  if (idx.length - count < 3) return null;
  const f = [...frets], g = [...fingers];
  for (const i of idx.slice(0, count)) { f[i] = null; g[i] = 0; }
  return { frets: f, fingers: g };
}

/** Pick a finger for a new note at (string, fret), or null if the hand can't manage it. */
function fingerFor(frets, fingers, string, fret) {
  const fretOf = new Map();
  frets.forEach((f, i) => { if (f > 0 && fingers[i] && fingers[i] !== THUMB) fretOf.set(fingers[i], f); });
  const fretted = frets.filter(f => f > 0);
  const minFret = fretted.length ? Math.min(...fretted) : fret;

  // Extend the lowest-fret finger (usually a barre) down to the new string,
  // as long as it wouldn't also press an open string on the way.
  for (const [finger, f] of fretOf) {
    if (f !== fret || f !== minFret) continue;
    const reach = Math.max(...frets.flatMap((x, i) => (fingers[i] === finger ? [i] : [])));
    if (!frets.slice(string, reach + 1).some(x => x === 0)) return finger;
  }
  // A free finger that keeps fingers in order across the frets (1 lowest ... 4 highest).
  for (let k = 1; k <= 4; k++) {
    if (fretOf.has(k)) continue;
    if ([...fretOf].every(([j, f]) => (j < k ? f <= fret : f >= fret))) return k;
  }
  // Thumb over the neck on the low E string, near the hand position.
  if (string === 0 && fret >= minFret - 1 && fret <= minFret + 1) return THUMB;
  return null;
}

function addBassBelow(frets, fingers, bassPc) {
  const first = soundedIndexes(frets)[0];
  const out = [];
  // Directly below the lowest sounded string, or skipping (muting) one string.
  for (let s = first - 1; s >= Math.max(0, first - 2); s--) {
    for (let fret = 0; fret <= 15; fret++) {
      if (mod12(TUNING[s].pc + fret) !== bassPc) continue;
      const f = [...frets], g = [...fingers];
      f[s] = fret;
      if (fret > 0) {
        const finger = fingerFor(frets, fingers, s, fret);
        if (finger === null) continue;
        g[s] = finger;
      }
      out.push({ frets: f, fingers: g });
    }
  }
  return out;
}

function isPlayableSlash(chord, frets) {
  const idx = soundedIndexes(frets);
  // At least 4 strings (3 for power chords): thinner top-string triads are a different tool.
  if (idx.length < Math.min(4, chord.notes.length + 1)) return false;
  const pcs = idx.map(i => mod12(TUNING[i].pc + frets[i]));
  if (pcs[0] !== chord.bassPc) return false;
  const allowed = new Set([...chord.pcs, chord.bassPc]);
  if (!pcs.every(p => allowed.has(p))) return false;
  const required = chord.notes.filter(n => !n.optional).map(n => n.pc);
  if (!required.every(p => pcs.includes(p))) return false;
  const fretted = frets.filter(f => f > 0);
  if (fretted.length && Math.max(...fretted) - Math.min(...fretted) > 3) return false;
  const innerMutes = frets.slice(idx[0], idx[idx.length - 1] + 1).filter(f => f === null).length;
  return innerMutes <= 1;
}

const INVERSION_NAMES = {
  3: '1st inversion', b3: '1st inversion', 5: '2nd inversion', b5: '2nd inversion', '#5': '2nd inversion',
  7: '3rd inversion', b7: '3rd inversion', bb7: '3rd inversion',
};

/** Hand-entered inversion shapes from the data file (entries with a 'bass' degree). */
function curatedSlashVoicings(chord) {
  const bassOf = deg => mod12(chord.rootPc + parseDegree(deg).semitones);
  const result = [];
  for (const v of voicingData.open) {
    if (!v.bass || v.type !== chord.type || parseNote(v.root).pc !== chord.rootPc || bassOf(v.bass) !== chord.bassPc) continue;
    result.push(buildVoicing(chord, parseFrets(v.frets), parseFingers(v.fingers),
      { id: `open:${v.root}${v.type}/${v.bass}:${v.frets}`, source: 'open', name: 'Open position' }));
  }
  for (const s of voicingData.movable) {
    if (!s.bass || s.type !== chord.type || bassOf(s.bass) !== chord.bassPc) continue;
    const shape = parseFrets(s.shape);
    const rootIndex = STRING_COUNT - s.rootString;
    const base = mod12(chord.rootPc - TUNING[rootIndex].pc - shape[rootIndex]) || 12;
    result.push(buildVoicing(chord, shape.map(f => (f === null ? null : f + base)), parseFingers(s.fingers),
      { id: `shape:${s.id}@${base}`, source: 'movable', shapeId: s.id, name: s.name, rootString: s.rootString }));
  }
  return result;
}

function slashVoicings(chord) {
  const rootChord = getChord(chord.root, chord.type);
  const kind = chord.bassKind === 'inversion'
    ? (INVERSION_NAMES[chord.bassDegree] ?? `${chord.bassDegree} in bass`)
    : 'Slash chord';
  const result = curatedSlashVoicings(chord);
  for (const v of rootVoicings(rootChord)) {
    for (let trim = 0; trim <= 3; trim++) {
      const t = trim ? trimLow(v.frets, v.fingers, trim) : { frets: v.frets, fingers: v.fingers };
      if (!t) break;
      const variants = [...(trim ? [t] : []), ...addBassBelow(t.frets, t.fingers, chord.bassPc)];
      for (const x of variants) {
        if (!isPlayableSlash(chord, x.frets)) continue;
        result.push(buildVoicing(chord, x.frets, x.fingers, {
          id: `slash:${v.id}:${x.frets.join(',')}`, source: 'slash', shapeId: v.shapeId,
          name: `${kind}, from ${v.name.toLowerCase()}`, derivedFrom: v.tab,
        }));
      }
    }
  }
  return result;
}

/**
 * All guitar voicings for a chord, easiest first.
 * Accepts a symbol ("Am7", "G/B") or a chord object from getChord().
 * Slash chords and inversions are generated from the root-position voicings.
 */
const voicingCache = new Map();

export function getVoicings(chordOrSymbol) {
  const chord = typeof chordOrSymbol === 'string' ? getChord(chordOrSymbol) : chordOrSymbol;
  if (!chord) return [];
  // Results are treated as read-only by callers, so they can be shared.
  if (!voicingCache.has(chord.symbol)) voicingCache.set(chord.symbol, computeVoicings(chord));
  return voicingCache.get(chord.symbol);
}

function computeVoicings(chord) {
  const result = chord.bass ? slashVoicings(chord) : rootVoicings(chord);
  // Different sources can land on the same frets; keep the easiest fingering of each.
  result.sort((a, b) => a.difficulty.score - b.difficulty.score || a.minFret - b.minFret);
  const seen = new Set();
  return result.filter(v => !seen.has(v.tab) && seen.add(v.tab));
}

/** The chord's inversions: the same chord with each non-root chord tone in the bass. */
export function getInversions(chordOrSymbol) {
  const chord = typeof chordOrSymbol === 'string' ? getChord(chordOrSymbol) : chordOrSymbol;
  return chord.notes.filter(n => n.degree !== '1').map(n => getChord(chord.root, chord.type, n.name));
}

/** Every chord in the database: 12 roots x all chord types. */
export function listAllChords() {
  return ROOTS.flatMap(root => CHORD_TYPES.map(t => getChord(root, t.id)));
}

/**
 * Name the chord(s) sounded by a fret pattern, e.g. identifyChord("x32010") -> ["C", ...].
 * Accepts a tab string or an array of frets. Best matches first.
 */
export function identifyChord(frets) {
  const fr = typeof frets === 'string' ? parseFrets(frets) : frets;
  const sounded = fr.map((f, i) => (f === null ? null : mod12(TUNING[i].pc + f))).filter(p => p !== null);
  if (!sounded.length) return [];
  const present = new Set(sounded);
  const bassPc = sounded[0];
  const matches = [];
  for (const rootPc of present) {
    for (const t of CHORD_TYPES) {
      const allowed = new Set(t.pcs.map(p => mod12(p + rootPc)));
      const required = t.degrees.filter(d => !t.optional.includes(d))
        .map(d => mod12(parseDegree(d).semitones + rootPc));
      if (![...present].every(p => allowed.has(p)) || !required.every(p => present.has(p))) continue;
      const omitted = allowed.size - present.size;
      const root = rootName(rootPc, t.id);
      const symbol = root + t.symbol + (bassPc === rootPc ? '' : `/${pcName(bassPc, { prefer: root.includes('b') ? 'flat' : 'sharp' })}`);
      matches.push({ symbol, root, type: t.id, omitted, rootInBass: bassPc === rootPc });
    }
  }
  return matches.sort((a, b) => (b.rootInBass - a.rootInBass) || a.omitted - b.omitted
    || getChordType(a.type).degrees.length - getChordType(b.type).degrees.length);
}
