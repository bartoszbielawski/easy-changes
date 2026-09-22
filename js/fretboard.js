// Horizontal fretboard with a scale's notes, high e string on top (as in tab).
import { TUNING } from './chords.js';
import { mod12 } from './theory.js';

const MARKERS = [3, 5, 7, 9, 12, 15];

/**
 * scale: from scales.makeScale(); position: { from, to } to highlight (or null).
 * Notes outside the position are dimmed so the hand shape stands out.
 */
export function renderFretboard(scale, { position = null, frets = 15 } = {}) {
  const width = 960, left = 30, openW = 34, right = 12, top = 14, gap = 22;
  const strings = TUNING.length;
  const fretW = (width - left - openW - right) / frets;
  const nutX = left + openW;
  const height = top + gap * (strings - 1) + 40;
  const y = s => top + gap * (strings - 1 - s);           // string index 0 = low E, drawn at the bottom
  const x = f => (f === 0 ? left + openW / 2 : nutX + (f - 0.5) * fretW);
  const inPos = f => !position || (f >= position.from && f <= position.to);

  const parts = [];
  if (position) {
    const x0 = position.from === 0 ? left + 2 : nutX + (position.from - 1) * fretW;
    const x1 = nutX + position.to * fretW;
    parts.push(`<rect class="fb-pos" x="${x0}" y="${top - 11}" width="${x1 - x0}" height="${gap * (strings - 1) + 22}" rx="8"/>`);
  }
  for (const m of MARKERS) {
    if (m > frets) continue;
    const cx = nutX + (m - 0.5) * fretW, cy = top + gap * (strings - 1) / 2;
    if (m === 12) parts.push(`<circle class="fb-marker" cx="${cx}" cy="${cy - gap}" r="4"/><circle class="fb-marker" cx="${cx}" cy="${cy + gap}" r="4"/>`);
    else parts.push(`<circle class="fb-marker" cx="${cx}" cy="${cy}" r="4"/>`);
  }
  for (let f = 1; f <= frets; f++) {
    const fx = nutX + f * fretW;
    parts.push(`<line class="fb-fret" x1="${fx}" x2="${fx}" y1="${top}" y2="${y(0)}"/>`);
    parts.push(`<text class="fb-num" x="${nutX + (f - 0.5) * fretW}" y="${y(0) + 30}" text-anchor="middle">${f}</text>`);
  }
  parts.push(`<line class="fb-nut" x1="${nutX}" x2="${nutX}" y1="${top}" y2="${y(0)}"/>`);
  TUNING.forEach((t, s) => {
    parts.push(`<line class="fb-string" x1="${left}" x2="${width - right}" y1="${y(s)}" y2="${y(s)}"/>`);
    parts.push(`<text class="fb-num" x="${left - 10}" y="${y(s) + 4}" text-anchor="middle">${s === strings - 1 ? 'e' : t.name.replace(/\d/, '')}</text>`);
  });
  TUNING.forEach((t, s) => {
    for (let f = 0; f <= frets; f++) {
      const pc = mod12(t.pc + f);
      const note = scale.spelled.get(pc);
      if (!note) continue;
      const cls = `fb-note${pc === scale.rootPc ? ' root' : ''}${inPos(f) ? '' : ' dim'}`;
      parts.push(`<g class="${cls}"><circle cx="${x(f)}" cy="${y(s)}" r="9.5"/><text x="${x(f)}" y="${y(s) + 3.5}" text-anchor="middle">${note}</text></g>`);
    }
  });
  return `<svg class="fretboard" viewBox="0 0 ${width} ${height}" role="img" aria-label="${scale.name} on the fretboard${position ? `, position frets ${position.from} to ${position.to}` : ''}">${parts.join('')}</svg>`;
}
