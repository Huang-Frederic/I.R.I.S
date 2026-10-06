# vinted-agent/titles.py
"""Vinted title hygiene, shared by every entity the bot posts (cards, lots,
other_items). Vinted rejects a title with "Le titre contient trop de lettres
majuscules" — an all-caps word like VMAX, VSTAR or SOLDIER is enough — and a
name pasted from a spreadsheet can carry tabs. Mirrored for the in-app
preview by lib/utils/vinted-title.ts."""
import re

# Unicode letters and digits — a "word" here is a run of those, so a set code
# like CBB2C or 30TH stays one token (and is left alone: it has digits).
_WORD = re.compile(r"[^\W_]+")


def _lower_caps_words(text: str, min_letters: int, keep_language_tag: bool) -> str:
    def repl(m: re.Match) -> str:
        word = m.group(0)
        if any(ch.isdigit() for ch in word) or len(word) < min_letters or not word.isupper():
            return word
        if keep_language_tag and text[m.start() - 1:m.start()] == "[" and text[m.end():m.end() + 1] == "]":
            return word
        return word[0] + word[1:].lower()

    return _WORD.sub(repl, text)


def vinted_title(title: str) -> str:
    """What every title goes through before it's sent: whitespace (tabs,
    newlines, runs of spaces) collapsed to single spaces, and all-caps words of
    4+ letters given a single capital (VMAX → Vmax, SOLDIER → Soldier). Short
    codes (EX, GX, V, SE), set codes with digits and the [FR] tag are kept.
    Idempotent."""
    return _lower_caps_words(" ".join(title.split()), min_letters=4, keep_language_tag=True)


def soften_caps(title: str) -> str:
    """The stronger pass, for a title Vinted still refused for its capitals:
    every all-caps word of 2+ letters loses its capitals (EX → Ex, XYP → Xyp),
    except the [FR]-style language tag and codes with digits."""
    return _lower_caps_words(vinted_title(title), min_letters=2, keep_language_tag=True)


def is_caps_rejection(body: object) -> bool:
    """Whether a Vinted validation-error body refuses the title for its capitals."""
    if not isinstance(body, dict) or not isinstance(body.get("errors"), list):
        return False
    return any(
        isinstance(e, dict) and e.get("field") == "title" and "majuscule" in str(e.get("value") or "").lower()
        for e in body["errors"]
    )
