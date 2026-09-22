// Render a guitar voicing (from chords.getVoicings) as an SVG chord diagram.
import { findBarres } from './difficulty.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderDiagram(voicing, { frets: visibleFrets = 5, showNotes = true } = {}) {
  const strings = voicing.frets.length;
  const gap = 18, fretH = 22, left = 26, top = 30;
  const width = left + gap * (strings - 1) + 18;
  const height = top + fretH * visibleFrets + (showNotes ? 34 : 14);

  // Show from the nut when the chord fits there, otherwise start at its lowest fret.
  const startFret = voicing.maxFret <= visibleFrets ? 1 : voicing.minFret;
  const x = i => left + i * gap;
  const y = fret => top + (fret - startFret + 0.5) * fretH;

  const parts = [];
  // Frets and nut
  for (let f = 0; f <= visibleFrets; f++) {
    const cls = f === 0 && startFret === 1 ? 'nut' : 'fret';
    parts.push(`<line class="${cls}" x1="${x(0)}" x2="${x(strings - 1)}" y1="${top + f * fretH}" y2="${top + f * fretH}"/>`);
  }
  for (let i = 0; i < strings; i++) {
    parts.push(`<line class="string" x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${top + visibleFrets * fretH}"/>`);
  }
  if (startFret > 1) {
    parts.push(`<text class="fret-label" x="${left - 8}" y="${y(startFret) + 4}" text-anchor="end">${startFret}fr</text>`);
  }
  // Open / muted markers
  voicing.frets.forEach((f, i) => {
    if (f === null) parts.push(`<text class="marker" x="${x(i)}" y="${top - 9}" text-anchor="middle">×</text>`);
    else if (f === 0) parts.push(`<circle class="open${voicing.strings[i].degree === '1' ? ' root' : ''}" cx="${x(i)}" cy="${top - 13}" r="4.5"/>`);
  });
  // Barres
  for (const b of findBarres(voicing.frets, voicing.fingers)) {
    const r = 7.5;
    parts.push(`<rect class="barre" x="${x(b.from) - r}" y="${y(b.fret) - r}" width="${x(b.to) - x(b.from) + 2 * r}" height="${2 * r}" rx="${r}"/>`);
  }
  // Fretted notes
  voicing.frets.forEach((f, i) => {
    if (!f) return;
    const s = voicing.strings[i];
    parts.push(`<circle class="dot${s.degree === '1' ? ' root' : ''}" cx="${x(i)}" cy="${y(f)}" r="7.5"/>`);
    if (s.finger) parts.push(`<text class="finger" x="${x(i)}" y="${y(f) + 3.5}" text-anchor="middle">${s.finger === 5 ? 'T' : s.finger}</text>`);
  });
  // Note names under the strings
  if (showNotes) {
    voicing.strings.forEach((s, i) => {
      if (s) parts.push(`<text class="note-name" x="${x(i)}" y="${top + visibleFrets * fretH + 16}" text-anchor="middle">${s.note}</text>`);
    });
  }

  const label = `${voicing.chord} chord diagram, frets ${voicing.tab}`;
  return `<svg xmlns="${SVG_NS}" class="chord-diagram" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${label}">${parts.join('')}</svg>`;
}
