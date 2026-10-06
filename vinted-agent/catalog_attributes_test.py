# vinted-agent/catalog_attributes_test.py
from catalog_attributes import listing_attribute_problems, parse_catalog_attributes


def _option(id_, title):
    return {"id": id_, "title": title, "group_title": None, "description": "", "type": "default", "has_children": False}


def _group(id_, title, options):
    return {"id": id_, "title": title, "group_title": title, "type": "group", "options": options}


def _configured(code, options, required=True, id_=1):
    return {
        "id": id_, "code": code, "value_ids": None, "value": None,
        "configuration": {"title": code, "required": required, "selection_type": "single", "options": options},
    }


CONDITION_GROUP = [_group(1, "État", [
    _option(6, "Neuf avec étiquette"), _option(1, "Neuf sans étiquette"), _option(2, "Très bon état"),
    _option(3, "Bon état"), _option(4, "Satisfaisant"),
])]

# Trimmed from the real POST /api/v2/item_upload/attributes response for
# catalog 2614 (Femmes > … > Doudounes), probed 2026-10-05.
PUFFER_JACKETS = [
    {"code": "brand", "value_ids": None, "value": None, "configuration": None},
    _configured("size", [
        _group(80, "S/M/L", [_option(1739, "M"), _option(1740, "L")]),
        _group(81, "EU", [_option(1944, "EU 38"), _option(1945, "EU 40")]),
    ], id_=8001),
    _configured("condition", CONDITION_GROUP, id_=431),
    {"code": "color", "value_ids": None, "value": None, "configuration": None},
    _configured("material", [_group(1, "Matière", [_option(468, "Acier")])], required=False),
]

# Catalog 145 (Hommes > Soins > Parfums): no size, no color, only "new".
PERFUME = [
    {"code": "brand", "value_ids": None, "value": None, "configuration": None},
    _configured("condition", [_group(1, "État", [_option(6, "Neuf avec étiquette")])]),
]


def test_parse_keeps_size_options_grouped_in_vinted_order():
    parsed = parse_catalog_attributes(PUFFER_JACKETS)
    assert parsed["size_options"] == [
        {"title": "S/M/L", "options": [{"id": 1739, "title": "M"}, {"id": 1740, "title": "L"}]},
        {"title": "EU", "options": [{"id": 1944, "title": "EU 38"}, {"id": 1945, "title": "EU 40"}]},
    ]
    assert parsed["size_required"] is True


def test_parse_flattens_the_condition_group_into_a_plain_list():
    parsed = parse_catalog_attributes(PUFFER_JACKETS)
    assert parsed["condition_options"] == [
        {"id": 6, "title": "Neuf avec étiquette"}, {"id": 1, "title": "Neuf sans étiquette"},
        {"id": 2, "title": "Très bon état"}, {"id": 3, "title": "Bon état"}, {"id": 4, "title": "Satisfaisant"},
    ]


def test_parse_reports_a_color_attribute_even_though_vinted_sends_it_without_configuration():
    assert parse_catalog_attributes(PUFFER_JACKETS)["has_color"] is True


def test_parse_a_category_without_size_or_color():
    parsed = parse_catalog_attributes(PERFUME)
    assert parsed["size_options"] is None
    assert parsed["size_required"] is False
    assert parsed["has_color"] is False
    assert parsed["condition_options"] == [{"id": 6, "title": "Neuf avec étiquette"}]


def test_parse_flattens_nested_groups_into_their_top_level_group():
    attributes = [_configured("size", [
        _group(1, "Chaussures", [_group(2, "Demi-pointures", [_option(777, "38,5")]), _option(776, "38")]),
    ])]
    assert parse_catalog_attributes(attributes)["size_options"] == [
        {"title": "Chaussures", "options": [{"id": 777, "title": "38,5"}, {"id": 776, "title": "38"}]},
    ]


def test_parse_puts_ungrouped_size_options_in_an_untitled_group():
    attributes = [_configured("size", [_option(213, "Taille unique")])]
    assert parse_catalog_attributes(attributes)["size_options"] == [
        {"title": None, "options": [{"id": 213, "title": "Taille unique"}]},
    ]


def _item(**overrides):
    item = {"vinted_size_id": 1740, "vinted_color_ids": [1], "vinted_condition_id": 2}
    item.update(overrides)
    return item


def test_a_complete_item_has_no_problem():
    assert listing_attribute_problems(_item(), parse_catalog_attributes(PUFFER_JACKETS)) == []


def test_a_missing_required_size_is_reported():
    problems = listing_attribute_problems(_item(vinted_size_id=None), parse_catalog_attributes(PUFFER_JACKETS))
    assert problems == ["Taille manquante"]


def test_a_size_from_another_category_is_reported():
    # 209 is "L" in men's sizes — not one of the women's puffer-jacket options.
    problems = listing_attribute_problems(_item(vinted_size_id=209), parse_catalog_attributes(PUFFER_JACKETS))
    assert problems == ["Taille invalide pour cette catégorie"]


def test_a_missing_color_is_reported_when_the_category_asks_for_one():
    problems = listing_attribute_problems(_item(vinted_color_ids=[]), parse_catalog_attributes(PUFFER_JACKETS))
    assert problems == ["Couleur manquante"]


def test_a_null_color_list_counts_as_missing():
    problems = listing_attribute_problems(_item(vinted_color_ids=None), parse_catalog_attributes(PUFFER_JACKETS))
    assert problems == ["Couleur manquante"]


def test_a_condition_the_category_does_not_accept_is_reported():
    # Perfume only accepts 6 ("Neuf avec étiquette").
    item = _item(vinted_size_id=None, vinted_color_ids=[], vinted_condition_id=2)
    assert listing_attribute_problems(item, parse_catalog_attributes(PERFUME)) == [
        "État non accepté pour cette catégorie",
    ]


def test_size_and_color_are_not_required_where_the_category_has_neither():
    item = _item(vinted_size_id=None, vinted_color_ids=[], vinted_condition_id=6)
    assert listing_attribute_problems(item, parse_catalog_attributes(PERFUME)) == []


def test_every_problem_is_listed_at_once():
    item = _item(vinted_size_id=None, vinted_color_ids=[], vinted_condition_id=99)
    assert listing_attribute_problems(item, parse_catalog_attributes(PUFFER_JACKETS)) == [
        "Taille manquante", "Couleur manquante", "État non accepté pour cette catégorie",
    ]


from catalog_attributes import resolve_size_id

# Catalog 1227 (men's parkas) as Vinted served it at 15:10 on 2026-10-05 —
# that morning it was a single "Tailles hommes" group where L was 209.
PARKAS_NEW_SIZES = parse_catalog_attributes([_configured("size", [
    _group(1, "S/M/L", [_option(2436, "M"), _option(2437, "L")]),
    _group(2, "Pouces", [_option(2501, '40"')]),
    _group(3, "EU", [_option(2601, "EU 52")]),
])])


def test_resolve_keeps_a_size_id_that_is_still_offered():
    assert resolve_size_id({"vinted_size_id": 2437, "size": "L"}, PARKAS_NEW_SIZES) == 2437


def test_resolve_finds_a_stale_size_again_by_its_label():
    assert resolve_size_id({"vinted_size_id": 209, "size": "L"}, PARKAS_NEW_SIZES) == 2437


def test_resolve_matches_labels_regardless_of_case_and_spacing():
    assert resolve_size_id({"vinted_size_id": 209, "size": "  l "}, PARKAS_NEW_SIZES) == 2437
    assert resolve_size_id({"vinted_size_id": None, "size": "eu  52"}, PARKAS_NEW_SIZES) == 2601


def test_resolve_matches_a_bare_number_to_a_single_prefixed_option():
    # "52" stored, Vinted now titles it "EU 52".
    assert resolve_size_id({"vinted_size_id": 999, "size": "52"}, PARKAS_NEW_SIZES) == 2601


def test_resolve_gives_up_on_an_ambiguous_label():
    ambiguous = parse_catalog_attributes([_configured("size", [
        _group(1, "EU", [_option(1, "EU 38")]), _group(2, "FR", [_option(2, "FR 38")]),
    ])])
    assert resolve_size_id({"vinted_size_id": 999, "size": "38"}, ambiguous) is None


def test_resolve_gives_up_without_a_label_or_without_sizes():
    assert resolve_size_id({"vinted_size_id": 209, "size": None}, PARKAS_NEW_SIZES) is None
    assert resolve_size_id({"vinted_size_id": 209, "size": "L"}, parse_catalog_attributes(PERFUME)) is None


from catalog_attributes import choose_package_size

CLOTHES_SIZES = [{"id": 1, "code": "SMALL"}, {"id": 2, "code": "MEDIUM"}, {"id": 3, "code": "LARGE"}, {"id": 8, "code": "HEAVY_SMALL"}]
VACUUM_SIZES = [{"id": 11, "code": "BULKY_SMALL"}, {"id": 12, "code": "BULKY_MEDIUM"}, {"id": 13, "code": "BULKY_LARGE"}]


def test_package_size_uses_the_items_own_choice_when_the_category_offers_it():
    assert choose_package_size(12, VACUUM_SIZES, suggest=lambda: 11) == 12


def test_package_size_keeps_petit_where_the_category_offers_it():
    calls = []
    assert choose_package_size(None, CLOTHES_SIZES, suggest=lambda: calls.append(1) or 2) == 1
    assert calls == []  # no suggestion asked when Petit is available


def test_package_size_takes_vinteds_suggestion_when_petit_is_not_offered():
    assert choose_package_size(None, VACUUM_SIZES, suggest=lambda: 11) == 11


def test_package_size_ignores_a_choice_or_suggestion_the_category_does_not_offer():
    assert choose_package_size(3, VACUUM_SIZES, suggest=lambda: 12) == 12
    assert choose_package_size(None, VACUUM_SIZES, suggest=lambda: 99) is None
    assert choose_package_size(None, VACUUM_SIZES, suggest=lambda: None) is None


def test_package_size_falls_back_to_petit_when_the_formats_are_unknown():
    assert choose_package_size(None, [], suggest=lambda: None) == 1
