// Heuristic playing difficulty for a guitar voicing.
// frets: array (low E -> high e) of numbers or null (muted); fingers: array of 0-4, 5 = thumb.
const THUMB = 5;

// Skill levels on the 1-10 chord scale, with chords that score in each band.
export const LEVELS = [
  { id: 'beginner',     name: 'Beginner',     max: 3,        examples: 'open C, G, D, E, A, Am, Em, Dm (2-3)' },
  { id: 'improver',     name: 'Improver',     max: 4.5,      examples: 'small F xx3211, B7, C7, 4-finger G (3.5)' },
  { id: 'intermediate', name: 'Intermediate', max: 6.5,      examples: 'barre chords: Fm 5.5, Bb 6, F / Bm 6.5; D/F# with thumb 5' },
  { id: 'advanced',     name: 'Advanced',     max: Infinity, examples: 'stretched barres like D x54232 (7), thumb + barre shapes' },
];

export function levelFor(score) {
  return LEVELS.find(l => score <= l.max);
}

/** Describe barres: a finger holding 2+ strings at the same fret. */
export function findBarres(frets, fingers) {
  const byFinger = new Map();
  frets.forEach((fret, i) => {
    const finger = fingers[i];
    if (!fret || !finger || finger === THUMB) return;
    if (!byFinger.has(finger)) byFinger.set(finger, { finger, fret, strings: [] });
    byFinger.get(finger).strings.push(i);
  });
  return [...byFinger.values()]
    .filter(b => b.strings.length > 1)
    // A barre covers every string between its outermost notes.
    .map(b => ({ finger: b.finger, fret: b.fret, from: Math.min(...b.strings), to: Math.max(...b.strings),
                 width: Math.max(...b.strings) - Math.min(...b.strings) + 1 }));
}

export function scoreVoicing(frets, fingers) {
  const fretted = frets.filter(f => f > 0);
  const fingerCount = new Set(fingers.filter(f => f > 0 && f !== THUMB)).size;
  const thumb = fingers.includes(THUMB);
  const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
  const minFret = fretted.length ? Math.min(...fretted) : 0;
  const barres = findBarres(frets, fingers);
  const widestBarre = Math.max(0, ...barres.map(b => b.width));

  const sounded = frets.map((f, i) => (f === null ? null : i)).filter(i => i !== null);
  const first = Math.min(...sounded), last = Math.max(...sounded);
  const innerMutes = frets.slice(first, last + 1).filter(f => f === null).length;

  const reasons = [];
  let score = 1;
  let barrePenalty = 0;
  if (fingerCount > 1) { score += (fingerCount - 1) * 0.8; }
  if (span >= 3) { score += (span - 2) * 1.5; reasons.push(`${span + 1}-fret stretch`); }
  if (widestBarre >= 5) { barrePenalty += 3; reasons.push('full barre'); }
  else if (widestBarre >= 3) { barrePenalty += 2; reasons.push('partial barre'); }
  else if (widestBarre === 2) { barrePenalty += 1; reasons.push('mini barre'); }
  if (barres.length > 1) { barrePenalty += barres.length - 1; reasons.push('two barres'); }
  score += barrePenalty;
  if (innerMutes) { score += innerMutes; reasons.push('muted inner string'); }
  if (thumb) { score += 1.5; reasons.push('thumb over the neck'); }
  if (minFret >= 8) { score += 0.5; reasons.push('high position'); }
  if (fretted.length === 0) reasons.push('all open strings');
  else if (frets.some(f => f === 0)) reasons.push('open strings');

  score = Math.min(10, Math.round(score * 2) / 2);
  const level = levelFor(score).id;
  // barrePenalty is the part of the score due to barres, so players who find barres easy can discount it.
  return { score, level, fingerCount, span, barres, barrePenalty, innerMutes, reasons };
}
