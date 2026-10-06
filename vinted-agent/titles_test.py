# vinted-agent/titles_test.py
from titles import is_caps_rejection, soften_caps, vinted_title


def test_vinted_title_collapses_tabs_and_repeated_spaces():
    # Regression: a lot named from a spreadsheet paste kept its tabs.
    assert vinted_title("Carte Magic Final Fantasy\tSephiroth, Fabled SOLDIER\t115\tM [FR]") == \
        "Carte Magic Final Fantasy Sephiroth, Fabled Soldier 115 M [FR]"
    assert vinted_title("  Lot   de\ncartes  ") == "Lot de cartes"


def test_vinted_title_lowers_all_caps_words_of_four_letters_or_more():
    assert vinted_title("Imperméable RAINS Unisex Long Jacket") == "Imperméable Rains Unisex Long Jacket"
    assert vinted_title("Pikachu VMAX") == "Pikachu Vmax"
    assert vinted_title("ÉDITION LIMITÉE") == "Édition Limitée"


def test_vinted_title_keeps_short_codes_set_codes_and_the_language_tag():
    title = "Carte Pokémon Dracaufeu EX - (XYP 17) [FR]"
    assert vinted_title(title) == title
    assert vinted_title("Carte Pokémon Aquali Stamp - Gem Pack Vol. 2 (CBB2C 2) [CN]") == \
        "Carte Pokémon Aquali Stamp - Gem Pack Vol. 2 (CBB2C 2) [CN]"
    assert vinted_title("Nike Dunk Low Retro SE") == "Nike Dunk Low Retro SE"


def test_vinted_title_is_idempotent():
    once = vinted_title("Carte Magic SOLDIER\tVSTAR [FR]")
    assert vinted_title(once) == once


def test_soften_caps_also_lowers_short_all_caps_words_but_not_the_language_tag():
    assert soften_caps("Carte Pokémon Dracaufeu EX - (XYP 17) [FR]") == "Carte Pokémon Dracaufeu Ex - (Xyp 17) [FR]"


def test_soften_caps_leaves_single_letters_and_codes_with_digits():
    assert soften_caps("Sephiroth 115 M (CBB2C 2) [JP]") == "Sephiroth 115 M (CBB2C 2) [JP]"


def test_is_caps_rejection_spots_vinteds_title_error():
    body = {"code": 99, "message_code": "validation_error", "errors": [
        {"field": "title", "value": "Le titre contient trop de lettres majuscules. Essaie d'utiliser des minuscules."},
    ]}
    assert is_caps_rejection(body) is True


def test_is_caps_rejection_ignores_other_errors():
    assert is_caps_rejection({"errors": [{"field": "size", "value": "Le champ Taille doit être renseigné"}]}) is False
    assert is_caps_rejection({"errors": [{"field": "title", "value": "Le titre est trop court"}]}) is False
    assert is_caps_rejection(None) is False
    assert is_caps_rejection(["x"]) is False
