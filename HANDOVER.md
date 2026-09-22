# Hand-over: state of Chord Finder

Written 2026-09-22, at the end of the first build. `CLAUDE.md` has the commands and
conventions; this file explains what exists, why it works the way it does, and what is left.

## Status

Everything described below is built and verified: `python tools/validate.py` passes
(1049 data voicings, 18 scales) and the browser suite at `/tests/` passes (130 checks).
Both were re-run at the time of writing.

**Chords page** (`index.html`)
- 29 chord types × 12 roots = 348 chords, 1020 root-position voicings from the data file.
- Inversions and slash chords are **generated** on demand (2195 inversion voicings across
  the database): low strings are muted, or a bass note is added on a lower string using an
  open string, a free finger, a barre extension or the thumb (shown as `T`).
- Pickers: root, common types as buttons with the rest in a "More…" dropdown, and bass
  (root, each inversion, or any other note).
- Sharps/flats: **Auto / ♭ / ♯**, remembered per browser. Auto spells by chord type
  (Db, Eb, Ab, Bb for major chords; C#m, G#m for minor; sharps for diminished).

**Progression page** (`progression.html`)
- **Harmony**: key detection, Roman numerals with inversion figures, chord roles (tonic /
  subdominant / dominant, secondary dominants, borrowed chords, tritone substitutions,
  brief key changes), root motion, named patterns, cadences.
- **Easiest voicings**: a Viterbi search over difficulty plus transition cost, with the
  top 3 combinations shown and their differences highlighted.
- **Key and capo rankings**: every key and every capo position, rated by the lowest level
  it can be played at, then by effort relative to the top pick.
- **Options**: My level, barre comfort, chords to avoid, highest capo, simpler chords,
  inversions, repeats, sharps/flats.
- **Scales**: ranked suggestions, a per-chord breakdown with a one-note fix where a chord
  doesn't fit, and a fretboard with the easiest hand position.
- **Song presets** (`SONGS` in `js/progression-app.js`): 14 progressions, chords only.

## Decisions worth knowing

1. **Voicings are formulas, not tables.** Open chords are fixed; movable shapes are stored
   relative to their lowest fret with a root string, so every key comes from one entry.
   The Python validator re-derives every transposition from the chord formulas, which is
   how several data mistakes were caught.
2. **Slash chords are generated, not stored.** Only shapes the generator cannot reach
   (e.g. a movable 7th chord with its 3rd in the bass) are hand-entered, marked with a
   `bass` degree in the data file.
3. **A chord's difficulty is mostly in forming the grip.** When the grip carries over —
   fingers stay, or the shape slides — only `hold` (0.5) of the next chord's difficulty is
   charged. This is what lets "Am G F" come out as one barre shape sliding down the neck
   for a player who finds barres easy.
4. **Transitions are costed per finger**, not as one lump: staying is free, a barre widening
   or a finger sliding with the hand is nearly free, a finger lifting to another string is
   the expensive part. Travel along the neck is cheap on its own and expensive only while
   re-gripping.
5. **The player is a setting, not an assumption.** "My level" caps which voicings may be
   used; barre comfort discounts barre difficulty. An earlier version forced the lowest
   possible level and fought the barre setting; it was replaced.
6. **Two numbers, two questions.** *Level* answers "can I play this?" (named bands on the
   1–10 chord scale, anchored to real chords). *Effort* answers "how much more work is this
   option?" and is always relative, because the absolute cost has an unavoidable floor.
7. **Key detection scores all 24 keys** on chord fit, the tonic at the start (and the end,
   if the progression doesn't repeat), V→I and ii–V–I, with a special case for all-dominant
   blues. It replaced "assume the first chord is the tonic", which mis-read ii–V–I songs.
8. **Scale ranking is clash-based**: a scale note a half step above a chord tone is weighted
   by how badly it rubs (a major 3rd over a minor chord contradicts the chord; a 4th over a
   major chord is mild). Dominant chords accept b9/b13; blues progressions accept the
   minor 3rd. Coverage of chord tones and closeness to the key also count.

## Tuning constants

| Where | Value | Meaning |
|---|---|---|
| `DEFAULT_OPTIONS.weights` (`js/progression.js`) | travel 0.2, jump 0.3, adjust 0.1, slide 0.05, guide 0.2, finger 0.35 | transition cost per fret / per finger |
| `DEFAULT_OPTIONS.hold` | 0.5 | share of difficulty charged when the grip carries over |
| `DEFAULT_OPTIONS.easyBarreFactor` | 0.35 | barre penalty kept when barres are "easy for me" |
| `DEFAULT_OPTIONS` penalties | simplify 2, inversion 1.5, bass omit 1.5 | cost of changing what is played |
| `LEVELS` (`js/difficulty.js`) | ≤3, ≤4.5, ≤6.5, above | Beginner / Improver / Intermediate / Advanced |
| `suggestScales` (`js/scales.js`) | clash + 2×(1−coverage) + 0.75 off-tonic + style terms | scale ranking |

All of these are judgement calls, fixed in place by tests on known progressions. If a result
ever sounds wrong, change the constant and re-run the suite to see what it disturbs.

## Known limitations

- **Voicing coverage drives quality.** 101 open + 79 movable shapes; rare inversions of
  extended chords (m9 with the 3rd in the bass, 13 with the 9th) have no voicing.
- **Relative-key loops are ambiguous** (F#m D A E). One key is picked and the other named as
  an alternative; the Key picker overrides.
- **No rhythm or duration.** Every chord counts once, however long it lasts, so a progression
  with one bar of a hard chord is scored like one with four.
- **Standard tuning only**, and no left-handed or non-guitar instruments, though the data
  file has a `tuning` field that the code reads.
- **The top-3 combinations are the literal three cheapest**, so #2 sometimes differs from #1
  by a single chord instead of offering a different approach.
- **Song presets are simplified** sections, not full arrangements.

## If you continue

Likely next steps, roughly in order of value:
1. More voicings, especially inversions of extended chords and higher-position shapes.
2. Rhythm or bar counts, so chord duration can weigh into effort.
3. Alternative tunings and capo-aware chord naming on the Chords page.
4. Diversity in the top 3 (open / barre / up the neck) instead of the three cheapest.
5. Audio playback of a voicing or scale.
6. Saving a progression to a URL to share (the hash already carries the chord text).

The project is a local git repository (branch `main`, no remote), started from this state.
