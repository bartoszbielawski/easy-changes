// "How difficulty is scored" explainer, shared by both pages.
import { LEVELS } from './difficulty.js';

export function renderLegend({ effort = false } = {}) {
  let lo = 1;
  const rows = LEVELS.map(l => {
    const range = l.max === Infinity ? `over ${lo}` : `${lo}–${l.max}`;
    lo = l.max;
    return `<tr><td><span class="badge ${l.id}">${l.name}</span></td><td class="num">${range}</td><td>${l.examples}</td></tr>`;
  }).join('');
  return `<details class="legend">
    <summary>How difficulty is scored</summary>
    <p>Each voicing gets a score from 1 to 10 based on the number of fingers, stretch, barres, muted inner strings, thumb use and neck position. The levels are named by the chords that land in them:</p>
    <table><tbody>${rows}</tbody></table>
    ${effort ? `<p>Each key or capo shows the <strong>lowest level</strong> it can be played at, set by its hardest unavoidable chord, and the lists are sorted by that level first.
      <em>My level</em> caps the chords used; within it the least-effort voicings win, so an Intermediate player may get sliding barre chords where a Beginner gets open chords.
      <em>Barre chords: Easy for me</em> scores barres as a comfortable player feels them.
      <strong>Effort</strong> adds up every chord and every change (fingers that re-grip, hand jumps) and is shown relative to the top pick:
      <em>+25%</em> means a quarter more work over the whole progression; a negative value means less work but a higher level needed. Sliding a shape or keeping fingers down makes changes nearly free.</p>` : ''}
  </details>`;
}
