# vinted-agent/catalog_attributes.py
"""Pure helpers around a category's Vinted listing attributes — what
POST /api/v2/item_upload/attributes returns for
{"attributes": [{"code": "category", "value": [<catalog_id>]}]}. No I/O, so
it's testable without a session.

The response is a list of attributes keyed by `code`. Those that take a
value from a list ("size", "condition", "material") carry a `configuration`
with `required` and nested `options`, where an option of `type: "group"`
holds further options (women's sizes come grouped S/M/L / EU / UK / ...,
conditions inside a single "État" group). "color" and "brand" come back with
no configuration at all — their presence alone says the category asks for
them (colors are a global list, GET /api/v2/item_upload/colors).
"""


def _leaf_options(options: list[dict]) -> list[dict]:
    leaves = []
    for option in options:
        if option.get("type") == "group":
            leaves.extend(_leaf_options(option.get("options") or []))
        else:
            leaves.append({"id": option["id"], "title": option["title"]})
    return leaves


def _size_groups(options: list[dict]) -> list[dict]:
    groups: list[dict] = []
    ungrouped: list[dict] = []
    for option in options:
        if option.get("type") == "group":
            groups.append({"title": option.get("title"), "options": _leaf_options(option.get("options") or [])})
        else:
            ungrouped.append({"id": option["id"], "title": option["title"]})
    if ungrouped:
        groups.append({"title": None, "options": ungrouped})
    return groups


def parse_catalog_attributes(attributes: list[dict]) -> dict:
    """Reduces the raw attribute list to what posting and the form need —
    the shape stored in the vinted_catalog_attributes table:
    `size_options` (grouped, None when the category has no size at all),
    `size_required`, `condition_options` (flat) and `has_color`."""
    by_code = {a.get("code"): a for a in attributes}

    size_config = (by_code.get("size") or {}).get("configuration") or {}
    size_options = _size_groups(size_config["options"]) if size_config.get("options") else None

    condition_config = (by_code.get("condition") or {}).get("configuration") or {}
    condition_options = _leaf_options(condition_config.get("options") or [])

    return {
        "size_options": size_options,
        "size_required": bool(size_options) and bool(size_config.get("required")),
        "condition_options": condition_options,
        "has_color": "color" in by_code,
    }


def listing_attribute_problems(item: dict, parsed: dict) -> list[str]:
    """What's missing or invalid in an other_item for its category, checked
    before anything is uploaded — Vinted would otherwise reject the listing
    only after every photo has gone up. Empty list = ready to post."""
    problems = []

    size_options = parsed.get("size_options")
    if size_options:
        size_id = item.get("vinted_size_id")
        valid_sizes = {option["id"] for group in size_options for option in group["options"]}
        if size_id is None:
            if parsed.get("size_required"):
                problems.append("Taille manquante")
        elif size_id not in valid_sizes:
            problems.append("Taille invalide pour cette catégorie")

    if parsed.get("has_color") and not item.get("vinted_color_ids"):
        problems.append("Couleur manquante")

    valid_conditions = {option["id"] for option in parsed.get("condition_options") or []}
    if valid_conditions and item.get("vinted_condition_id") not in valid_conditions:
        problems.append("État non accepté pour cette catégorie")

    return problems


def _normalize_size_label(label: str) -> str:
    return " ".join(label.lower().split())


def resolve_size_id(item: dict, parsed: dict) -> int | None:
    """The size option id to post with. Vinted renumbers a category's sizes
    from time to time — on 2026-10-05 men's parkas moved from a single
    "Tailles hommes" group (L = 209) to S/M/L / Pouces / EU groups (L = 2437)
    within hours — so a stored id can go stale. Keeps the stored id while it's
    still offered; otherwise finds the stored label (`size`) again, as an exact
    title or, for a bare number, a single prefixed title ("52" → "EU 52").
    None when nothing matches unambiguously."""
    options = [o for group in parsed.get("size_options") or [] for o in group["options"]]
    if not options:
        return None
    stored = item.get("vinted_size_id")
    if stored is not None and any(o["id"] == stored for o in options):
        return stored

    label = _normalize_size_label(item.get("size") or "")
    if not label:
        return None
    exact = [o["id"] for o in options if _normalize_size_label(o["title"]) == label]
    if len(exact) == 1:
        return exact[0]
    if not exact and label.replace(",", "").replace(".", "").isdigit():
        suffixed = [o["id"] for o in options if _normalize_size_label(o["title"]).split(" ")[-1] == label]
        if len(suffixed) == 1:
            return suffixed[0]
    return None
