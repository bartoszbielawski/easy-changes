// Viewer preferences kept in localStorage. Every access is guarded: storage can be
// unavailable (private windows, blocked site data) and the pages must still work.
const KEY = 'chords.accidentals';
export const ACCIDENTAL_MODES = ['auto', 'flat', 'sharp'];

export function getAccidentals() {
  try {
    const v = localStorage.getItem(KEY);
    return ACCIDENTAL_MODES.includes(v) ? v : 'auto';
  } catch { return 'auto'; }
}

export function setAccidentals(mode) {
  try { localStorage.setItem(KEY, mode); } catch { /* not persisted; fine */ }
}
