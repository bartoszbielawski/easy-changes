# Easy Changes

A web page for choosing guitar chords, transposing, and finding the easiest ways to play things.

**Live site:** https://bartoszbielawski.github.io/easy-changes/

Working on the code? Start with [CLAUDE.md](CLAUDE.md) (commands, conventions, gotchas) and [HANDOVER.md](HANDOVER.md) (state, design decisions, limitations, next steps).

## Run

ES modules and the data files need a local server (they don't load from `file://`):

```
python -m http.server 8000
```

Then open http://localhost:8000. You can link straight to a chord, e.g. `#F%23m7`.

## Pages

- **Chords** (`index.html`): look up any chord and see its voicings, easiest first. Pick a bass note for inversions (C/E, C/G) or slash chords (C/D).
- **Sharps / flats** (both pages, remembered in the browser):
  - *Auto:* the chord page spells by chord type (Db, Eb, Ab, Bb for major; C#m, G#m for minor; sharps for diminished), and the progression page spells by key
  - *♭ / ♯:* always flats or always sharps
  - a chord you type keeps your spelling
- **Progression** (`progression.html`): enter a progression, e.g. `Bb Gm Eb F`, or pick one of the built-in songs from the dropdown (Hotel California, Wonderwall, Autumn Leaves, Blue Bossa, So What…) to get:
  - **harmony analysis**:
    - the key, detected from how well each key fits the chords, plus V→I and ii–V–I resolutions (the picker can override it)
    - Roman numerals with inversions (I–V–vi–IV, V⁶, IV⁶₄)
    - each chord's role: tonic / subdominant / dominant, secondary dominants (V7/ii), and borrowed chords (bVII, iv)
    - root motion between chords
    - named patterns (Axis, 50s, ii–V–I, Andalusian, blues…), tritone substitutions, brief key changes (a ii–V–I into another key) and the cadence
  - the easiest voicing for each chord, counting both chord difficulty and hand movement between chords. Each finger is tracked across a change: staying put or sliding with the hand is nearly free, re-gripping is not. When the grip carries over (e.g. sliding one barre shape), only half of the next chord's difficulty is counted, since forming the grip is the hard part
  - a **Barre chords** setting (avoid / normal / easy for me) to match the player
  - a **My level** setting (Beginner / Improver / Intermediate / Advanced) that caps the chords used
  - each key and capo is rated by the **lowest level** it can be played at, then by **effort** relative to the top pick (+27% = about a quarter more work). The levels are bands of the 1–10 chord scale, named after the chords in them (Beginner: open C/G/D/Am; Improver: small F, B7; Intermediate: barre chords; Advanced: stretched barres)
  - the **top 3 ways to play it** for whichever key or capo you select: the easiest, plus the best way with mostly open chords, barres or up the neck, each labelled, with the chords that differ from #1 highlighted
  - **chord lengths**: `C:2` lasts two bars, and bar lines share a bar (`C | G Am` = 1, ½, ½). A long hard chord counts more than a passing one; changes cost the same either way
  - a **shareable address**: it carries the chords, any changed settings and the chosen key or capo, so a link opens exactly what you see; **Copy link** copies it
  - **Copy chords**: the chords in the chosen key or with the chosen capo, with your bar lines and lengths kept, ready to paste
  - **H chords** (German and Polish naming) are read as B; in a progression that uses H, a plain B is read as B♭, and a note says so
  - harmony and scales come last, in a section that starts folded for Beginner and Improver levels
  - **scale suggestions** for soloing over the progression:
    - ranked by clashes (scale notes a half-step above a chord tone), coverage of the chord tones, and relevance to the key
    - blues progressions get minor pentatonic / blues, and dominant chords accept b9 / b13
    - for each chord, the mode the scale plays as, the notes to watch, and a one-note fix where it doesn't fit (e.g. A7 in C → A mixolydian b6, C# for C)
    - a fretboard with the easiest hand position, chosen to be near where you play the chords
  - every key ranked by ease (changing key)
  - every capo position ranked by ease (keeping the key)
  - optional limits: a difficulty cap, no full barres, chords to avoid, and simpler substitutes
  - slash chords (G/B, D/F#) played with their real bass; optionally, inversions where they make changes smoother

## Chord database

| File | Contents |
|---|---|
| `data/chord-types.json` | 29 chord qualities as scale-degree formulas (`1 b3 5 b7`), with symbol aliases and optional degrees |
| `data/guitar-voicings.json` | Standard-tuning voicings: fixed **open** chords, plus **movable** shapes that shift to any key |
| `data/scales.json` | 18 scales as degree formulas, with a short description of each |
| `data/songs.json` | Song presets for the planner: `title`, `by`, `style` (groups the dropdown) and `chords` as typed |
| `tools/validate.py` | Checks every voicing in every key against its formula, plus fingering sanity |
| `tools/make_images.py` | Draws the link-preview card and home-screen icon (PNG) from the logo's shapes |

Frets and fingers are written from the low E string to the high e string: `x` = muted, `0` = open.
Movable shapes are written relative to their lowest fret, with `rootString` marking the string that carries the root.
An optional `bass` degree (e.g. `"3"`) marks a hand-entered inversion.

**Slash chords and inversions** are mostly generated, not stored. Each root-position voicing is turned into slash voicings by muting low strings until the wanted note is lowest, or by adding the bass on a lower string (open, a free finger, extending the barre, or the thumb, shown as `T`). The results are filtered for correct notes, at least 4 strings, a stretch of 4 frets or less, and a consistent fingering. Hand-entered `bass` entries fill the gaps.

Run `python tools/validate.py` after editing the data.

## Tests

Open http://localhost:8000/tests/ to run the music-theory test suite ([tests/tests.js](tests/tests.js)). Expected answers are written out from theory, and most checks run in all 12 keys:

- scale spelling, including the enharmonic choices a musician would make
- mode relationships
- avoid notes (chord-scale theory)
- hand positions and scale suggestions
- Roman numerals for every diatonic triad and seventh chord in all 24 keys, plus inversions
- secondary dominants and borrowed chords
- root motion, named patterns in every rotation, and cadences
- key detection on 30 progressions, each transposed into all 12 keys
- every song preset loads: all fields present, every chord recognised, a whole number of bars, and held chords written as lengths rather than repeats
- chord lengths: parsing, one-bar lengths leaving every score unchanged, and longer chords never lowering the effort or changing the level
- the top 3: #1 still the cheapest, no repeats, and real alternatives for four-chord loops in every key
- copying transposed chords: spelling in the new key, and bar lines, lengths and spacing kept in all 12 keys
- H naming: H chords as B, and B as B♭ only in progressions that use H

## Library (`js/`)

- `theory.js`: note parsing, correctly spelled degrees (`spellDegree('Eb', 'b7')` → `Db`), transposition
- `chords.js`: `getChord('F#m7')`, `getChord('C', 'maj', 'E')`, `getVoicings('D/F#')` (easiest first, slash chords generated), `getInversions('C7')`, `identifyChord('x32010')`, `listAllChords()`
- `difficulty.js`: difficulty score (1–10) from finger count, stretch, barres and muted inner strings; `LEVELS` / `levelFor()` name the skill bands
- `legend.js`: the "How difficulty is scored" explainer shown on both pages
- `prefs.js`: viewer preferences (the sharps/flats setting) in localStorage, guarded for when storage is unavailable
- `progression.js`: `arrange(chords, options)` / `arrangeTop(chords, options, k)` pick the best (or k best) voicings with a Viterbi search over difficulty + transition cost; `rankOptions()` scores all keys and capo positions
- `analysis.js`: `analyzeProgression(chords)`, `detectKeys()`, `romanNumeral()`, `rootMotion()`
- `scales.js`: `suggestScales(chords, key)`, `fitOverChord()`, `scalePositions()`
- `fretboard.js`: SVG fretboard for a scale, with a highlighted position
- `diagram.js`: SVG chord diagrams
