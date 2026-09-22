// Core music theory: note names, pitch classes, scale degrees and spelling.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// Most common name for each pitch class when no key context is given.
export const DEFAULT_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export const mod12 = n => ((n % 12) + 12) % 12;

const ACCIDENTAL_VALUE = { '': 0, '#': 1, '##': 2, 'x': 2, 'b': -1, 'bb': -2 };

function normalizeAccidentals(s) {
  return s.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/𝄪/g, '##').replace(/𝄫/g, 'bb');
}

function accidentalString(n) {
  return n > 0 ? '#'.repeat(n) : 'b'.repeat(-n);
}

/** Parse a note name like "C", "F#", "Bb", "Ebb", "G#4". Returns null if invalid. */
export function parseNote(input) {
  const m = /^([A-Ga-g])(##|#|x|bb|b)?(-?\d+)?$/.exec(normalizeAccidentals(String(input).trim()));
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const letterIndex = LETTERS.indexOf(letter);
  const alter = ACCIDENTAL_VALUE[m[2] || ''];
  const pc = mod12(LETTER_PC[letterIndex] + alter);
  const name = letter + accidentalString(alter);
  const octave = m[3] === undefined ? null : Number(m[3]);
  // MIDI: C4 = 60. Cb4 / B#3 edge cases resolve naturally through the raw semitone sum.
  const midi = octave === null ? null : 12 * (octave + 1) + LETTER_PC[letterIndex] + alter;
  return { letter, letterIndex, alter, pc, name, octave, midi };
}

/** Name a pitch class, optionally preferring flats or sharps. */
export function pcName(pc, { prefer } = {}) {
  const table = prefer === 'flat' ? FLAT_NAMES : prefer === 'sharp' ? SHARP_NAMES : DEFAULT_NAMES;
  return table[mod12(pc)];
}

/** Parse a scale degree like "1", "b3", "#5", "bb7", "9", "#11", "13". */
export function parseDegree(degree) {
  const m = /^(bb|b|##|#)?(\d+)$/.exec(degree);
  if (!m) throw new Error(`Invalid degree: ${degree}`);
  const number = Number(m[2]);
  const alter = ACCIDENTAL_VALUE[m[1] || ''];
  const semitones = MAJOR_SCALE[(number - 1) % 7] + 12 * Math.floor((number - 1) / 7) + alter;
  return { degree, number, alter, semitones };
}

/**
 * Spell the note a given degree above a root, respecting letter names.
 * spellDegree('Eb', 'b7') -> 'Db'; spellDegree('C', 'bb7') -> 'Bbb'.
 */
export function spellDegree(root, degree) {
  const r = typeof root === 'string' ? parseNote(root) : root;
  const d = typeof degree === 'string' ? parseDegree(degree) : degree;
  const letterIndex = (r.letterIndex + d.number - 1) % 7;
  const targetPc = mod12(r.pc + d.semitones);
  let alter = mod12(targetPc - LETTER_PC[letterIndex]);
  if (alter > 6) alter -= 12;
  return LETTERS[letterIndex] + accidentalString(alter);
}

/** True if a spelled name is awkward (double accidentals, Cb, Fb, E#, B#). */
export function isAwkwardSpelling(name) {
  return /##|bb|^(Cb|Fb|E#|B#)$/.test(name);
}

/**
 * Transpose a note name by a number of semitones.
 * If `prefer` is omitted, the direction of the original accidental is kept.
 */
export function transposeNote(note, semitones, { prefer } = {}) {
  const n = parseNote(note);
  if (!n) throw new Error(`Invalid note: ${note}`);
  const pref = prefer ?? (n.alter < 0 ? 'flat' : n.alter > 0 ? 'sharp' : undefined);
  return pcName(n.pc + semitones, { prefer: pref });
}

/** Semitone distance going up from note a to note b (0..11). */
export function interval(a, b) {
  return mod12(parseNote(b).pc - parseNote(a).pc);
}
