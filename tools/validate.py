"""Validate the chord database.

Checks that every guitar voicing, including every transposition of every
movable shape, sounds exactly the notes its chord formula requires, with the
root (or the voicing's 'bass' degree) lowest, and that the fingering is physically plausible.

Usage: python tools/validate.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LETTER_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
ACCIDENTALS = {"": 0, "#": 1, "##": 2, "b": -1, "bb": -2}
NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]


def note_pc(name):
    m = re.fullmatch(r"([A-G])(#{1,2}|b{1,2})?(-?\d+)?", name)
    if not m:
        raise ValueError(f"bad note {name!r}")
    return (LETTER_PC[m[1]] + ACCIDENTALS[m[2] or ""]) % 12


def degree_semitones(degree):
    m = re.fullmatch(r"(bb|b|##|#)?(\d+)", degree)
    if not m:
        raise ValueError(f"bad degree {degree!r}")
    n = int(m[2])
    return MAJOR_SCALE[(n - 1) % 7] + 12 * ((n - 1) // 7) + ACCIDENTALS[m[1] or ""]


def parse_frets(s):
    assert len(s) == 6, f"expected 6 strings in {s!r}"
    return [None if c == "x" else int(c) for c in s]


def check_voicing(label, root_pc, ctype, frets, fingers, tuning_pcs, errors, bass=None):
    bass_pc = root_pc if bass is None else (root_pc + degree_semitones(bass)) % 12
    required = {(root_pc + degree_semitones(d)) % 12 for d in ctype["degrees"] if d not in ctype["optional"]}
    allowed = {(root_pc + degree_semitones(d)) % 12 for d in ctype["degrees"]} | {bass_pc}
    sounded = [(tuning_pcs[i] + f) % 12 for i, f in enumerate(frets) if f is not None]
    if not sounded:
        errors.append(f"{label}: no sounded strings")
        return
    got = set(sounded)
    if got - allowed:
        errors.append(f"{label}: foreign notes {[NAMES[p] for p in sorted(got - allowed)]}")
    if required - got:
        errors.append(f"{label}: missing notes {[NAMES[p] for p in sorted(required - got)]}")
    if sounded[0] != bass_pc:
        errors.append(f"{label}: bass note is {NAMES[sounded[0]]}, expected {NAMES[bass_pc]}")

    # Fingering: fretted strings need a finger, open/muted ones must not have one.
    finger_fret = {}
    for i, (f, fg) in enumerate(zip(frets, fingers)):
        if f and not fg:
            errors.append(f"{label}: string {6 - i} fretted with no finger")
        if not f and fg:
            errors.append(f"{label}: string {6 - i} has finger {fg} but is not fretted")
        if f and fg:
            if finger_fret.setdefault(fg, f) != f:
                errors.append(f"{label}: finger {fg} used on two different frets")
    # Lower-numbered fingers should not sit on higher frets than higher-numbered ones.
    ordered = sorted(finger_fret.items())
    for (fa, ra), (fb, rb) in zip(ordered, ordered[1:]):
        if ra > rb:
            errors.append(f"{label}: finger {fa} (fret {ra}) is above finger {fb} (fret {rb})")
    fretted = [f for f in frets if f]
    if fretted and max(fretted) - min(fretted) > 4:
        errors.append(f"{label}: stretch of {max(fretted) - min(fretted)} frets")


def main():
    types = json.loads((ROOT / "data/chord-types.json").read_text(encoding="utf-8"))["types"]
    voicings = json.loads((ROOT / "data/guitar-voicings.json").read_text(encoding="utf-8"))
    by_id = {t["id"]: t for t in types}
    tuning_pcs = [note_pc(n) for n in voicings["tuning"]]
    errors = []

    # Chord type sanity: unique ids and suffixes, optional degrees exist, no duplicate pitch classes.
    seen_suffix = {}
    for t in types:
        for suffix in [t["symbol"], *t["aliases"]]:
            if suffix in seen_suffix:
                errors.append(f"suffix {suffix!r} used by both {seen_suffix[suffix]} and {t['id']}")
            seen_suffix[suffix] = t["id"]
        for d in t["optional"]:
            if d not in t["degrees"]:
                errors.append(f"type {t['id']}: optional degree {d} not in degrees")
        pcs = [degree_semitones(d) % 12 for d in t["degrees"]]
        if len(set(pcs)) != len(pcs):
            errors.append(f"type {t['id']}: duplicate pitch classes")
    if len(by_id) != len(types):
        errors.append("duplicate chord type ids")

    count = 0
    fingerings = set()
    for v in voicings["open"]:
        ctype = by_id.get(v["type"])
        if not ctype:
            errors.append(f"open {v['root']}{v['type']}: unknown type")
            continue
        label = f"open {v['root']}{ctype['symbol']} {v['frets']}"
        check_voicing(label, note_pc(v["root"]), ctype, parse_frets(v["frets"]),
                      [int(c) for c in v["fingers"]], tuning_pcs, errors, v.get("bass"))
        key = (v["root"], v["type"], v.get("bass"), v["frets"])
        if key in fingerings:
            errors.append(f"{label}: duplicate")
        fingerings.add(key)
        count += 1

    for s in voicings["movable"]:
        ctype = by_id.get(s["type"])
        if not ctype:
            errors.append(f"shape {s['id']}: unknown type")
            continue
        shape = parse_frets(s["shape"])
        fingers = [int(c) for c in s["fingers"]]
        ri = 6 - s["rootString"]
        if shape[ri] is None:
            errors.append(f"shape {s['id']}: root string is muted")
            continue
        if min(f for f in shape if f is not None) != 0:
            errors.append(f"shape {s['id']}: lowest relative fret must be 0")
        for root_pc in range(12):
            base = (root_pc - tuning_pcs[ri] - shape[ri]) % 12 or 12
            frets = [None if f is None else f + base for f in shape]
            label = f"shape {s['id']} as {NAMES[root_pc]}{ctype['symbol']} (fret {base})"
            check_voicing(label, root_pc, ctype, frets, fingers, tuning_pcs, errors, s.get("bass"))
            count += 1

    # Scales: parseable degrees, unique ids, no repeated notes, and every one starts on the root.
    scales = json.loads((ROOT / "data/scales.json").read_text(encoding="utf-8"))["types"]
    if len({t["id"] for t in scales}) != len(scales):
        errors.append("duplicate scale ids")
    for t in scales:
        pcs = [degree_semitones(d) % 12 for d in t["degrees"]]
        if pcs[0] != 0:
            errors.append(f"scale {t['id']}: must start on the root")
        if len(set(pcs)) != len(pcs):
            errors.append(f"scale {t['id']}: repeated notes")

    covered = {v["type"] for v in voicings["open"]} | {s["type"] for s in voicings["movable"]}
    for t in types:
        if t["id"] not in {s["type"] for s in voicings["movable"] if "bass" not in s}:
            errors.append(f"type {t['id']}: no movable shape, so not every key is covered")
    uncovered = [t["id"] for t in types if t["id"] not in covered]

    print(f"{len(types)} chord types, {len(voicings['open'])} open voicings, "
          f"{len(voicings['movable'])} movable shapes -> {count} voicings checked, {len(scales)} scales")
    if uncovered:
        print("types without any voicing:", ", ".join(uncovered))
    if errors:
        print(f"\n{len(errors)} problem(s):")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
