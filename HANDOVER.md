# Hand-over: state of Easy Changes

Written 2026-09-22, at the end of the first build. `CLAUDE.md` has the commands and
conventions; this file explains what exists, why it works the way it does, and what is left.

## Status

Everything described below is built and verified: `python tools/validate.py` passes
(1049 data voicings, 18 scales) and the browser suite at `/tests/` passes (163 checks).
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
- **Easiest voicings**: a Viterbi search over difficulty plus transition cost. The top 3
  are different approaches, not near-copies: #1 is the cheapest, the others the best way to
  play it mostly with open chords, barres or up the neck (labelled), when they change at
  least a third of the chords; the next cheapest fill any gap.
- **Chord lengths**: `C:2` (bars) or bar lines (`C | G Am` = 1, ½, ½). Changes cost the same
  however long a chord lasts; each bar beyond the first adds `sustain` (0.25) of its difficulty.
- **Key and capo rankings**: every key and every capo position, rated by the lowest level
  it can be played at, then by effort relative to the top pick.
- **Options**: My level, barre comfort, chords to avoid, highest capo, simpler chords,
  inversions, repeats, sharps/flats.
- **Shareable links**: the address holds the chords, every setting that differs from its
  default, and the chosen key or capo (`#chords=C+G+Am+F&level=beginner&capo=3`). Old
  chord-only links still open; bad values fall back to defaults. Sharps/flats stay per browser.
  A **Copy link** button sits above the chord box, right of its label.
- **Copy chords**: under the arrangement heading, the chords in the chosen key or with the
  chosen capo, laid out as typed (bars, `C:2`, sections), with a button that copies them
  ("Capo 3: A E | F#m D:2"). Hidden when they match the chord box.
- **H naming**: H is read as B on both pages. A progression that uses H is taken to be in
  German/Polish naming, so its plain B is B♭ (noted under the chord box). Results stay in
  English names. A German chart without any H ("F B C") is still read the English way.
- **Harmony and scales** sit below the voicings in one fold-out section, closed for Beginner
  and Improver, open for Intermediate and Advanced; it follows the level when that changes.
- **Scales**: ranked suggestions, a per-chord breakdown with a one-note fix where a chord
  doesn't fit, and a fretboard with the easiest hand position.
- **Song presets** (`data/songs.json`): 36 progressions (30 rock & pop, 6 jazz), chords only; 18 have
  verse + chorus and/or bar lengths (`|` bars, `||` sections, `C:2`). Picked from a
  dropdown grouped by style. The picker follows the chord box: it names the song while the
  chords match and resets when they are edited.

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
| `DEFAULT_OPTIONS.sustain` | 0.25 | share of a chord's difficulty added per bar beyond the first |
| `STYLES` (`js/progression.js`) | open: frets ≤ 4, no 4-string barre; barre: 4+ strings; neck: lowest fret ≥ 5 | top-3 approaches; an alternative must change ⌈n/3⌉ chords |
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
- **Lengths are in bars only.** No beats, tempo or strumming, so a quick change inside a bar
  is priced like any other change.
- **Standard tuning only**, and no left-handed or non-guitar instruments, though the data
  file has a `tuning` field that the code reads.
- **Some songs have only two real approaches** (their barres already sit up the neck); the
  third slot then shows the cheapest near-variant of #1.
- **Song presets are simplified** to their main sections; 18 of 36 are fuller, the rest are
  one section without lengths. Key detection still reads Wish You Were Here as Em (not G)
  and power-chord songs like Smells Like Teen Spirit as the relative major.
- **Browser support** is 2021 on (modules, top-level await, fetch), tested only in current
  Chrome; older browsers get a message instead of a blank page.

## If you continue

Likely next steps, roughly in order of value:
1. Automatic checks on push (GitHub Actions: `validate.py` plus the browser suite headless),
   since every push to `main` publishes the site.
2. More voicings, especially inversions of extended chords and higher-position shapes.
3. Audio playback of a voicing, an arrangement or a scale (Web Audio, no library).
4. Works offline / installable (manifest + service worker).
5. Alternative tunings and capo-aware chord naming on the Chords page.
6. Verse/chorus and lengths for the remaining presets; power-chord key detection.

The project is a local git repository (branch `main`, pushed to
github.com/bartoszbielawski/easy-changes), started from this state.
