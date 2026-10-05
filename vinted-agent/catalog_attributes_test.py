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
