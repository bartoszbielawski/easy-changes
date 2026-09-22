// Progression tools: choose the easiest voicings for a sequence of chords,
// and rank transpositions / capo positions by how easy the result is to play.
import { getChord, getVoicings } from './chords.js';
import { mod12, parseNote, pcName, FLAT_NAMES, SHARP_NAMES } from './theory.js';
import { LEVELS, levelFor } from './difficulty.js';
import { detectKey } from './analysis.js';

export const DEFAULT_OPTIONS = {
  maxDifficulty: 10,     // skip voicings scoring above this (the player's level: 3, 4.5, 6.5 or 10)
  barres: 'normal',      // 'avoid' (skip barres over 4+ strings), 'normal', or 'easy' (discount barres)
  avoidBarre: false,     // same as barres: 'avoid' (kept for older callers)
  avoid: [],             // chord symbols you don't want to play, e.g. ["F", "Bm"]
  simplify: false,       // allow simpler substitutes (Cmaj9 -> Cmaj7 -> C) at a penalty
  simplifyPenalty: 2,    // cost per simplification step
  inversions: false,     // also consider inversions (C/E, C/G) of chords written without a bass
  inversionPenalty: 1.5, // cost of changing the written bass note
  bassOmitPenalty: 1.5,  // cost of playing a slash chord without its bass (G/B -> G)
  loop: true,            // include the move from the last chord back to the first
  maxCapo: 7,
  key: null,             // { tonicPc, minor }; guessed from the first chord when null
  accidentals: 'auto',   // 'auto' spells transposed chords by key; 'flat' / 'sharp' force one
  // Transition costs: per fret of hand travel, extra per fret when also regripping,
  // and per finger that adjusts a barre / slides with the hand / guides / regrips.
  weights: { travel: 0.2, jump: 0.3, adjust: 0.1, slide: 0.05, guide: 0.2, finger: 0.35 },
  // A chord's difficulty is mostly in forming the grip. When the grip carries over
  // (slide, or fingers staying put) only this share of its difficulty is paid again.
  hold: 0.5,
  easyBarreFactor: 0.35, // with barres: 'easy', barre difficulty counts this much
};

// Simpler chord to fall back on for each type (one step at a time).
const SIMPLER = {
  maj7: 'maj', 6: 'maj', add9: 'maj', '6/9': '6', sus2: 'maj', sus4: 'maj',
  7: 'maj', 9: '7', 11: '7sus4', 13: '9', '7sus4': '7', '7b5': '7', '7#5': '7', '7b9': '7', '7#9': '7',
  maj9: 'maj7',
  m7: 'min', m6: 'min', madd9: 'min', mmaj7: 'min', m9: 'm7', m11: 'm7',
  m7b5: 'dim', dim7: 'dim',
};

// Conventional tonic spelling and accidental preference per key.
const MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

/** Split "C G | Am F" / "C, G, Am, F" into chords. Unknown symbols are reported, not dropped silently. */
export function parseProgression(text) {
  const tokens = String(text).split(/[\s,|]+/).filter(Boolean);
  const chords = [], errors = [];
  for (const token of tokens) {
    const chord = getChord(token);
    if (chord) chords.push(chord); else errors.push(token);
  }
  return { chords, errors };
}

/** Guess the key: the key that fits the chords best (see analysis.detectKeys). */
export function guessKey(chords, { loop = true } = {}) {
  if (!chords.length) return null;
  const k = detectKey(chords, { loop });
  return { tonicPc: k.tonicPc, minor: k.minor, name: keyName(k.tonicPc, k.minor) };
}

export function keyName(tonicPc, minor, accidentals = 'auto') {
  const table = accidentals === 'flat' ? FLAT_NAMES : accidentals === 'sharp' ? SHARP_NAMES
    : minor ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES;
  return table[mod12(tonicPc)] + (minor ? 'm' : '');
}

function keyPrefersFlats(tonicPc, minor) {
  const name = (minor ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES)[mod12(tonicPc)];
  if (name.includes('b')) return true;
  if (name.includes('#')) return false;
  // Natural tonics: flat keys are F major, and D, G, C, F minor.
  return minor ? ['D', 'G', 'C', 'F'].includes(name) : name === 'F';
}

/**
 * Transpose chords by a number of semitones. With accidentals 'auto', roots are spelled
 * to suit the new key and untransposed chords keep the spelling they were typed with;
 * 'flat' / 'sharp' force one kind everywhere, the original key included.
 */
export function transposeChords(chords, semitones, key = guessKey(chords), accidentals = 'auto') {
  if (mod12(semitones) === 0 && accidentals === 'auto') return chords;
  const tonic = mod12(key.tonicPc + semitones);
  const prefer = accidentals !== 'auto' ? accidentals : keyPrefersFlats(tonic, key.minor) ? 'flat' : 'sharp';
  const name = pc => (pc === tonic ? keyName(tonic, key.minor, accidentals).replace(/m$/, '') : pcName(pc, { prefer }));
  return chords.map(c => {
    const root = name(mod12(c.rootPc + semitones));
    const chord = getChord(root, c.type);
    if (c.bass) {
      const bass = name(mod12(parseNote(c.bass).pc + semitones));
      return getChord(`${chord.symbol}/${bass}`);
    }
    return chord;
  });
}

// ---- Voicing selection -------------------------------------------------------

function handCenter(v) {
  const fretted = v.frets.filter(f => f > 0);
  return fretted.length ? fretted.reduce((a, b) => a + b, 0) / fretted.length : 0;
}

// Where each finger is: the strings it holds and its fret. A barre is described by
// the range it lies across, not the strings it happens to sound: in an E-shape barre
// the index covers all six strings whether the G string is fretted above it or not.
function fingerPlacements(v) {
  const map = new Map();
  v.frets.forEach((fret, i) => {
    const finger = v.fingers[i];
    if (!finger || !fret) return;
    if (!map.has(finger)) map.set(finger, { strings: [], fret });
    map.get(finger).strings.push(i);
  });
  for (const p of map.values()) {
    const lo = Math.min(...p.strings), hi = Math.max(...p.strings);
    p.strings = lo === hi ? [lo] : Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
  }
  return map;
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/**
 * How the hand gets from voicing a to voicing b. Each finger of b either
 *  - stays (same strings, same fret): free
 *  - adjusts (same fret, barre covers more or fewer strings): nearly free
 *  - slides with the hand (same strings, moves as far as the hand does): nearly free
 *  - guides (same strings, moves a different distance): cheap
 *  - regrips (lifts and lands on other strings): the expensive part
 * Travel along the neck is cheap on its own; moving while regripping costs extra.
 */
export function transitionDetails(a, b, weights = DEFAULT_OPTIONS.weights) {
  const w = { ...DEFAULT_OPTIONS.weights, ...weights };
  if (a.id === b.id || a.tab === b.tab) return { cost: 0, kind: 'stay', shift: 0, stay: 0, adjust: 0, slide: 0, guide: 0, regrip: 0 };
  const pa = fingerPlacements(a), pb = fingerPlacements(b);
  const count = { stay: 0, adjust: 0, slide: 0, guide: 0, regrip: 0 };
  const moves = [];
  for (const [finger, B] of pb) {
    const A = pa.get(finger);
    if (A && A.strings.join() === B.strings.join()) moves.push({ finger, d: B.fret - A.fret });
    else if (A && A.fret === B.fret && A.strings.some(i => B.strings.includes(i))) count.adjust++;
    else count.regrip++;
  }
  // The hand's own shift is how far most same-string fingers moved.
  const handShift = median(moves.map(m => m.d));
  for (const m of moves) {
    if (m.d === 0) count.stay++;
    else if (m.d === handShift) count.slide++;
    else count.guide++;
  }
  const shift = moves.length && handShift ? Math.abs(handShift) : Math.abs(handCenter(a) - handCenter(b));
  const cost = w.travel * shift + (count.regrip ? w.jump * shift : 0)
    + w.adjust * count.adjust + w.slide * count.slide + w.guide * count.guide + w.finger * count.regrip;
  const kind = count.regrip ? (count.stay + count.slide + count.guide + count.adjust ? 'partial' : 'regrip')
    : count.slide || count.guide ? 'slide' : 'stay';
  return { cost, kind, shift: Math.round(shift * 10) / 10, ...count };
}

/** Cost of moving the hand from voicing a to voicing b. */
export function transitionCost(a, b, weights = DEFAULT_OPTIONS.weights) {
  return transitionDetails(a, b, weights).cost;
}

function barreWidth(v) {
  return Math.max(0, ...v.difficulty.barres.map(b => b.width));
}

const chordKey = c => `${c.rootPc}:${c.type}:${c.bassPc ?? ''}`;

/**
 * Playable options for one chord: its own voicings, plus (depending on options)
 * inversions, the chord without its slash bass, and simpler substitutes.
 */
/** Difficulty of a voicing for this player (barres discounted if they find them easy). */
function effectiveDifficulty(v, opts) {
  const factor = opts.barres === 'easy' ? opts.easyBarreFactor : 1;
  // Rounded to the chord scale's half steps so levels stay comparable.
  return Math.round((v.difficulty.score - v.difficulty.barrePenalty * (1 - factor)) * 2) / 2;
}

function candidatesFor(chord, opts, avoidSet) {
  const out = [];
  const avoidBarres = opts.barres === 'avoid' || opts.avoidBarre;
  const add = (c, penalty, how) => {
    if (avoidSet.has(chordKey(c))) return;
    for (const v of getVoicings(c)) {
      const diff = effectiveDifficulty(v, opts);
      if (diff > opts.maxDifficulty) continue;
      if (avoidBarres && barreWidth(v) >= 4) continue;
      out.push({ chord: c, voicing: v, substituted: how === 'simpler' || how === 'no bass',
                 how, diff, penalty });
    }
  };

  add(chord, 0, 'as written');
  if (!chord.bass && opts.inversions) {
    for (const n of chord.notes.slice(1)) add(getChord(chord.root, chord.type, n.name), opts.inversionPenalty, 'inversion');
  }
  // A slash chord can drop its bass: always as a last resort, or whenever simplifying is allowed.
  let current = chord, penalty = 0;
  if (chord.bass) {
    current = getChord(chord.root, chord.type);
    penalty = opts.bassOmitPenalty;
    if (opts.simplify || !out.length) add(current, penalty, 'no bass');
  }
  if (opts.simplify) {
    for (let next = SIMPLER[current.type]; next; next = SIMPLER[next]) {
      penalty += opts.simplifyPenalty;
      add(getChord(current.root, next), penalty, 'simpler');
    }
  }
  return out;
}

function avoidKeys(avoid) {
  const set = new Set();
  for (const s of avoid) {
    const c = typeof s === 'string' ? getChord(s) : s;
    if (c) set.add(chordKey(c));
  }
  return set;
}

/**
 * Pick the voicing for each chord that minimises total difficulty + hand movement.
 * Returns { feasible, steps, cost, avgCost, maxDifficulty, movement, unplayable }.
 */
export function arrange(chords, options = {}) {
  return arrangeTop(chords, options, 1)[0];
}

/**
 * The k cheapest distinct voicing combinations for a progression, best first
 * (fewer if there aren't k). Each has the same shape as arrange()'s result.
 */
export function arrangeTop(chords, options = {}, k = 3) {
  const opts = { ...DEFAULT_OPTIONS, ...options, weights: { ...DEFAULT_OPTIONS.weights, ...options.weights } };
  const avoidSet = avoidKeys(opts.avoid);
  const cands = chords.map(c => candidatesFor(c, opts, avoidSet));
  const unplayable = chords.filter((c, i) => !cands[i].length).map(c => c.symbol);
  if (!chords.length || unplayable.length) {
    return [{ feasible: false, steps: [], cost: Infinity, avgCost: Infinity, maxDifficulty: Infinity, movement: 0, unplayable }];
  }
  // The lowest level this progression can be played at is set by its hardest unavoidable
  // chord: the largest, over chords, of each chord's easiest voicing.
  const floor = Math.max(...cands.map(cs => Math.min(...cs.map(c => c.diff))));
  const level = levelFor(floor);

  const n = chords.length;

  // Share of b's difficulty paid when coming from a: 1 for a fresh grip, down to
  // opts.hold when the grip carries over (fingers stay or slide together).
  const formFactor = (d, v) => {
    const fingers = new Set(v.voicing.fingers.filter(f => f > 0)).size;
    if (!fingers) return 1;
    const replaced = d.regrip + 0.5 * d.guide + 0.3 * d.adjust;
    return opts.hold + (1 - opts.hold) * Math.min(1, replaced / fingers);
  };
  // Cost of arriving at v from u: the move itself plus the part of v's difficulty that is new.
  const memo = new Map();
  const step = (u, v) => {
    const key = u.voicing.id + '>' + v.voicing.id;
    if (!memo.has(key)) {
      const d = transitionDetails(u.voicing, v.voicing, opts.weights);
      const f = formFactor(d, v);
      memo.set(key, { move: d.cost, effort: v.diff * f, formFactor: f, details: d, total: d.cost + v.diff * f + v.penalty });
    }
    return memo.get(key);
  };
  const first = v => v.diff + v.penalty;

  // k-best Viterbi: every (chord, voicing) state keeps its k cheapest partial paths,
  // each remembering which (voicing, rank) it came from. For a loop, the first
  // chord's voicing is fixed per run so the closing move can be priced exactly.
  const runFrom = startIdx => {
    let layer = cands[0].map((c, j) => (startIdx === null || j === startIdx ? [{ cost: first(c), from: null }] : []));
    const layers = [layer];
    for (let i = 1; i < n; i++) {
      const prev = cands[i - 1];
      layer = cands[i].map(v => {
        const options = [];
        prev.forEach((u, pj) => layer[pj].forEach((entry, pr) => {
          options.push({ cost: entry.cost + step(u, v).total, from: [pj, pr] });
        }));
        return options.sort((a, b) => a.cost - b.cost).slice(0, k);
      });
      layers.push(layer);
    }
    const finals = [];
    layer.forEach((entries, j) => entries.forEach((entry, r) => {
      // On repeat, the first chord is reached from the last one instead of formed from scratch.
      const close = startIdx !== null && n > 1 ? step(cands[n - 1][j], cands[0][startIdx]).total - first(cands[0][startIdx]) : 0;
      finals.push({ total: entry.cost + close, j, r });
    }));
    return finals.sort((a, b) => a.total - b.total).slice(0, k).map(f => {
      const path = [f.j];
      let from = layers[n - 1][f.j][f.r].from;
      for (let i = n - 2; i >= 0; i--) {
        path.unshift(from[0]);
        from = layers[i][from[0]][from[1]].from;
      }
      return { total: f.total, path };
    });
  };

  const starts = opts.loop && n > 1 ? cands[0].map((_, j) => j) : [null];
  const best = starts.flatMap(runFrom).sort((a, b) => a.total - b.total).slice(0, k);

  return best.map(({ total, path }) => {
    const steps = path.map((j, i) => ({ input: chords[i], ...cands[i][j] }));
    const arrivals = steps.map((s, i) => (i > 0 ? step(steps[i - 1], s) : opts.loop && n > 1 ? step(steps[n - 1], s) : null));
    const movement = arrivals.reduce((m, a, i) => m + (a && (i > 0 || opts.loop) ? a.move : 0), 0);
    return {
      feasible: true,
      steps: steps.map((s, i) => ({
        input: s.input.symbol,
        played: s.chord.symbol,
        substituted: s.substituted,
        how: s.how,
        voicing: s.voicing,
        difficulty: s.diff,
        // Difficulty actually paid here: less than `difficulty` when the grip carries over.
        effort: i > 0 ? arrivals[i].effort : s.diff,
        gripKept: i > 0 && arrivals[i].formFactor < 0.999,
        moveIn: i > 0 ? arrivals[i].move : 0,
        move: i > 0 ? arrivals[i].details : null,
      })),
      cost: total,
      avgCost: total / n,
      level: level.id,          // lowest level the progression can be played at
      levelName: level.name,
      maxDifficulty: Math.max(...steps.map(s => s.diff)),
      movement,
      substitutions: steps.filter(s => s.substituted).length,
      unplayable: [],
    };
  });
}

/**
 * Evaluate every way of playing the progression:
 *  - keys: transpose to each of the 12 keys, no capo (changes the sounding key)
 *  - capos: keep the sounding key, play shapes lower with a capo at fret 0..maxCapo
 * Both lists are sorted easiest first.
 */
export function rankOptions(chords, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const guessed = opts.key ?? guessKey(chords, { loop: opts.loop });
  const key = { ...guessed, name: keyName(guessed.tonicPc, guessed.minor, opts.accidentals) };
  // Arrangement for each shape shift (the chords actually fingered), computed once.
  const byShift = new Map();
  const shapesAt = shift => {
    const s = mod12(shift);
    if (!byShift.has(s)) {
      const played = transposeChords(chords, s, key, opts.accidentals);
      byShift.set(s, { played, arrangement: arrange(played, opts) });
    }
    return byShift.get(s);
  };
  // Easiest first: playable before unplayable, then the lowest level needed, then less effort.
  const levelRank = o => (o.arrangement.feasible ? LEVELS.findIndex(l => l.id === o.arrangement.level) : 0);
  const order = (a, b) => (b.arrangement.feasible - a.arrangement.feasible)
    || levelRank(a) - levelRank(b)
    || a.arrangement.cost - b.arrangement.cost || a.tiebreak - b.tiebreak;

  const keys = [];
  for (let shift = -5; shift <= 6; shift++) {
    const { played, arrangement } = shapesAt(shift);
    keys.push({ shift, capo: 0, key: keyName(key.tonicPc + shift, key.minor, opts.accidentals), chords: played, arrangement,
                tiebreak: Math.abs(shift) });
  }
  const capos = [];
  for (let capo = 0; capo <= opts.maxCapo; capo++) {
    const { played, arrangement } = shapesAt(-capo);
    capos.push({ shift: 0, capo, key: key.name, shapesKey: keyName(key.tonicPc - capo, key.minor, opts.accidentals),
                 chords: played, arrangement, tiebreak: capo });
  }
  return { key, keys: keys.sort(order), capos: capos.sort(order) };
}

