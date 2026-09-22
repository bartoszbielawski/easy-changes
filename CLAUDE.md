# Working on Easy Changes

A guitar chord and progression helper: two static pages, no build step, no dependencies.
Plain ES modules plus JSON data files. There is no Node on this machine; Python is available.

## Run

```bash
python -m http.server 8000
```

ES modules and the `fetch` of data files do not work from `file://`, so the server is required.
Pages: http://localhost:8000 (chords), `/progression.html` (planner), `/tests/` (test suite).

## Verify before finishing — both must pass

```bash
python tools/validate.py
```

Checks the chord and scale **data**: every voicing, in every key, sounds its chord's formula
with the right bass, and its fingering is physically possible (1049 voicings, 18 scales).

Open **http://localhost:8000/tests/** for the music-theory suite (`tests/tests.js`, 149 checks).
Expected values are written out from theory, not computed by the code under test, and most
checks run in all 12 keys. Add a case there whenever you change theory behaviour.

## Layout of the code

| File | Responsibility |
|---|---|
| `js/theory.js` | notes, pitch classes, scale degrees, spelling (`spellDegree`), transposition |
| `js/chords.js` | chord types, symbol parsing, voicing lookup, slash/inversion generation, `identifyChord` |
| `js/difficulty.js` | per-voicing difficulty 1–10, `LEVELS` (Beginner…Advanced) |
| `js/progression.js` | `parseProgression` (chords and their lengths in bars), `arrange`/`arrangeTop` (Viterbi over difficulty + transitions), `arrangeChoices` (the varied top 3: open / barre / up the neck), `rankOptions` (keys + capos), transposition |
| `js/analysis.js` | key detection, Roman numerals, chord roles, root motion, named patterns, cadences |
| `js/scales.js` | scale spelling, clash scoring, `suggestScales`, fretboard positions |
| `js/diagram.js`, `js/fretboard.js` | SVG chord diagrams and fretboard |
| `js/app.js`, `js/progression-app.js` | the two pages' UI; the planner's address holds the chords, changed settings and the chosen key or capo (`writeHash`/`applyHash`) |
| `js/data.js` | `loadJson()`: fetches a `data/*.json` file (see Conventions) |
| `js/prefs.js`, `js/legend.js` | sharps/flats preference, shared scoring legend |
| `data/*.json` | chord types, guitar voicings, scales, song presets — formats documented in `README.md` |
| `img/og-image.png`, `img/apple-touch-icon.png` | link-preview card and home-screen icon, drawn by `python tools/make_images.py`; re-run it after changing the logo |
| `img/logo.svg` | the pick logo, used in every header and as the favicon; its colours copy `--accent` and `--accent-contrast` by hand (an `<img>` can't read page CSS), so change both together |

## Conventions

- **No build, no dependencies.** Keep it that way: plain modules.
- **Data is loaded with `loadJson()`** (fetch + top-level await), not `import … with { type: 'json' }`:
  import attributes only reached Firefox in 2025, fetch works back to 2021 browsers. Add a
  `<link rel="preload" as="fetch" crossorigin>` for each file a page needs so they download in
  parallel. Don't use JS newer than 2021 either (e.g. `Map.groupBy`, `Array.prototype.at`, `toSorted`).
- **Data belongs in `data/*.json`**, logic in `js/`. Voicings are stored as formulas and
  shapes, never as per-key duplicates; slash chords and inversions are generated.
- **CSS design tokens** at the top of `css/styles.css` (`--content`, `--control-h`,
  `--score-col`…) keep blocks aligned. Use them rather than new fixed pixel values.
- **User-facing wording is plain English** ("grip carried over", "brief key change"), and
  every score shown has a tooltip that explains it.
- **Comments explain why**, not what.

## Gotchas

- **The browser pane caches modules aggressively.** After editing, `fetch(url, {cache:'reload'})`
  each changed file and then reload the page; a JSON data file needs a full page reload.
- **Difficulty vs effort are different things.** Difficulty is per voicing (1–10, and the
  named level); effort is a whole arrangement's cost and is shown only as a percentage
  relative to the top pick.
- **Tuning constants** live in `DEFAULT_OPTIONS` in `js/progression.js` (transition weights,
  `hold`, `easyBarreFactor`, `sustain`, penalties), `STYLES` (what counts as open / barre /
  up the neck), `LEVELS` in `js/difficulty.js`, and the scoring
  formula in `suggestScales` in `js/scales.js`. Changing them changes test expectations —
  run the suite.
- **A page that fails to start shows a message, not a blank page.** A small ES5 script in each
  page head listens for errors until the app sets `window.easyChangesReady = true` at the end of
  `app.js` / `progression-app.js`. Keep that line last, and keep the head script ES5.
- **Enharmonic spelling is deliberate.** `rootName()` in `chords.js` spells by chord type in
  Auto; scales pick the root spelling with fewest accidentals, or the progression's own
  spelling. G# harmonic minor keeps its F##; that is correct.
- The project is a **git repository**: branch `main`, remote `origin` =
  github.com/bartoszbielawski/easy-changes, served by GitHub Pages from `main`, so a
  push publishes. Commit and push only when the user asks; `.gitattributes` keeps LF endings.
