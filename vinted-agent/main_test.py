# vinted-agent/main_test.py
import asyncio
import os
from unittest.mock import MagicMock, AsyncMock

# main.py reads these at import time; this worktree has no .env, so set
# harmless placeholders (only if unset) before importing the module under test.
os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_KEY", "test-key")

from main import process_job, process_lot_job


def _mock_supabase_for_delete_job(existing_listing_id="v123"):
    """A minimal AsyncClient stand-in for process_job's 'delete' branch.

    vinted_post_jobs has no vinted_listing_id column, so the branch must look
    up the listing to delete via a select() on card_listings. `existing_listing_id`
    controls what that lookup returns — pass None to simulate "no active listing
    found" (empty result set).

    Only the calls the 'delete' branch is expected to make are wired; anything
    else raises, so an unexpected extra call fails the test loudly.
    """
    supabase = MagicMock()

    # supabase.table("card_listings").select("vinted_listing_id").eq(...).eq(...).limit(1).execute()
    select_data = [{"vinted_listing_id": existing_listing_id}] if existing_listing_id else []
    select_execute = AsyncMock(return_value=MagicMock(data=select_data))
    select_limit = MagicMock(execute=select_execute)
    select_eq2 = MagicMock(limit=MagicMock(return_value=select_limit))
    select_eq1 = MagicMock(eq=MagicMock(return_value=select_eq2))
    select = MagicMock(eq=MagicMock(return_value=select_eq1))

    # supabase.table("card_listings").update({...}).eq(...).eq(...).execute()
    listings_update_execute = AsyncMock(return_value=MagicMock(data=[{"card_id": "card-1"}]))
    listings_eq2 = MagicMock(execute=listings_update_execute)
    listings_eq1 = MagicMock(eq=MagicMock(return_value=listings_eq2))
    listings_update = MagicMock(eq=MagicMock(return_value=listings_eq1))

    # supabase.table("vinted_post_jobs").update({...}).eq("id", ...).execute()
    jobs_update_execute = AsyncMock(return_value=MagicMock(data=[{"id": "job-1"}]))
    jobs_update_eq = MagicMock(execute=jobs_update_execute)
    jobs_update = MagicMock(eq=MagicMock(return_value=jobs_update_eq))
    jobs_update_fn = MagicMock(return_value=jobs_update)

    card_listings_table = MagicMock(
        select=MagicMock(return_value=select),
        update=MagicMock(return_value=listings_update),
    )
    jobs_table = MagicMock(update=jobs_update_fn)

    def table(name):
        if name == "card_listings":
            return card_listings_table
        if name == "vinted_post_jobs":
            return jobs_table
        raise AssertionError(f"unexpected table: {name}")

    supabase.table = MagicMock(side_effect=table)
    return supabase, listings_update, jobs_update, jobs_update_fn


def _mock_supabase_for_delete_lot_job(existing_listing_id="v123"):
    """Same as _mock_supabase_for_delete_job, mirrored for lot_listings/lot_id."""
    supabase = MagicMock()

    select_data = [{"vinted_listing_id": existing_listing_id}] if existing_listing_id else []
    select_execute = AsyncMock(return_value=MagicMock(data=select_data))
    select_limit = MagicMock(execute=select_execute)
    select_eq2 = MagicMock(limit=MagicMock(return_value=select_limit))
    select_eq1 = MagicMock(eq=MagicMock(return_value=select_eq2))
    select = MagicMock(eq=MagicMock(return_value=select_eq1))

    listings_update_execute = AsyncMock(return_value=MagicMock(data=[{"lot_id": "lot-1"}]))
    listings_eq2 = MagicMock(execute=listings_update_execute)
    listings_eq1 = MagicMock(eq=MagicMock(return_value=listings_eq2))
    listings_update = MagicMock(eq=MagicMock(return_value=listings_eq1))

    jobs_update_execute = AsyncMock(return_value=MagicMock(data=[{"id": "job-1"}]))
    jobs_update_eq = MagicMock(execute=jobs_update_execute)
    jobs_update = MagicMock(eq=MagicMock(return_value=jobs_update_eq))
    jobs_update_fn = MagicMock(return_value=jobs_update)

    lot_listings_table = MagicMock(
        select=MagicMock(return_value=select),
        update=MagicMock(return_value=listings_update),
    )
    jobs_table = MagicMock(update=jobs_update_fn)

    def table(name):
        if name == "lot_listings":
            return lot_listings_table
        if name == "vinted_post_jobs":
            return jobs_table
        raise AssertionError(f"unexpected table: {name}")

    supabase.table = MagicMock(side_effect=table)
    return supabase, listings_update, jobs_update, jobs_update_fn


def test_process_job_delete_type_removes_listing_without_reposting():
    supabase, listings_update, jobs_update, jobs_update_fn = _mock_supabase_for_delete_job(
        existing_listing_id="v123"
    )
    vinted = MagicMock()
    vinted.delete_listing = MagicMock()
    job = {
        "id": "job-1",
        "card_id": "card-1",
        "user_id": "other-user",
        "job_type": "delete",
    }

    asyncio.run(process_job(supabase, vinted, job))

    # The listing id must come from the card_listings lookup (vinted_post_jobs
    # has no vinted_listing_id column to carry it on the job row itself).
    vinted.delete_listing.assert_called_once_with("v123")
    # The job must be marked done, and no new listing created — create_listing
    # is never called on the mock, which would raise if accessed as anything
    # other than a MagicMock attribute (no explicit assertion needed beyond
    # "vinted.create_listing was never called").
    vinted.create_listing.assert_not_called()
    listings_update.eq.assert_called()
    jobs_update.eq.assert_called_with("id", "job-1")
    status_arg = jobs_update_fn.call_args.args[0]
    assert status_arg["status"] == "done"


def test_process_job_delete_type_fails_job_when_no_listing_found():
    supabase, listings_update, jobs_update, jobs_update_fn = _mock_supabase_for_delete_job(
        existing_listing_id=None
    )
    vinted = MagicMock()
    vinted.delete_listing = MagicMock()
    job = {
        "id": "job-1",
        "card_id": "card-1",
        "user_id": "other-user",
        "job_type": "delete",
    }

    asyncio.run(process_job(supabase, vinted, job))

    # Nothing to delete was found — must not call Vinted, must not clear the
    # listing row, and must fail the job rather than silently mark it done.
    vinted.delete_listing.assert_not_called()
    listings_update.eq.assert_not_called()
    status_arg = jobs_update_fn.call_args.args[0]
    assert status_arg["status"] == "error"


def test_process_lot_job_delete_type_removes_listing_without_reposting():
    supabase, listings_update, jobs_update, jobs_update_fn = _mock_supabase_for_delete_lot_job(
        existing_listing_id="v456"
    )
    vinted = MagicMock()
    vinted.delete_listing = MagicMock()
    job = {
        "id": "job-1",
        "lot_id": "lot-1",
        "user_id": "other-user",
        "job_type": "delete",
    }

    asyncio.run(process_lot_job(supabase, vinted, job))

    vinted.delete_listing.assert_called_once_with("v456")
    vinted.create_listing.assert_not_called()
    listings_update.eq.assert_called()
    jobs_update.eq.assert_called_with("id", "job-1")
    status_arg = jobs_update_fn.call_args.args[0]
    assert status_arg["status"] == "done"


def test_process_lot_job_delete_type_fails_job_when_no_listing_found():
    supabase, listings_update, jobs_update, jobs_update_fn = _mock_supabase_for_delete_lot_job(
        existing_listing_id=None
    )
    vinted = MagicMock()
    vinted.delete_listing = MagicMock()
    job = {
        "id": "job-1",
        "lot_id": "lot-1",
        "user_id": "other-user",
        "job_type": "delete",
    }

    asyncio.run(process_lot_job(supabase, vinted, job))

    vinted.delete_listing.assert_not_called()
    listings_update.eq.assert_not_called()
    status_arg = jobs_update_fn.call_args.args[0]
    assert status_arg["status"] == "error"


# Append to vinted-agent/main_test.py
import json
from pathlib import Path
from main import _sync_cookies_from_supabase, _sync_cookies_to_supabase

def test_sync_cookies_from_supabase_writes_the_local_file(tmp_path):
    cookies_data = {"access_token_web": "abc", "datadome": "xyz"}
    execute = AsyncMock(return_value=MagicMock(data={"cookies": cookies_data}))
    maybe_single_result = MagicMock(execute=execute)
    eq_result = MagicMock(maybe_single=MagicMock(return_value=maybe_single_result))
    select_result = MagicMock(eq=MagicMock(return_value=eq_result))
    table_result = MagicMock(select=MagicMock(return_value=select_result))
    supabase = MagicMock()
    supabase.table = MagicMock(return_value=table_result)

    cookies_file = tmp_path / "cookies_test.json"
    asyncio.run(_sync_cookies_from_supabase(supabase, "user-1", str(cookies_file)))

    assert json.loads(cookies_file.read_text()) == cookies_data


def test_sync_cookies_from_supabase_leaves_the_file_untouched_when_no_row_exists():
    execute = AsyncMock(return_value=MagicMock(data=None))
    maybe_single_result = MagicMock(execute=execute)
    eq_result = MagicMock(maybe_single=MagicMock(return_value=maybe_single_result))
    select_result = MagicMock(eq=MagicMock(return_value=eq_result))
    table_result = MagicMock(select=MagicMock(return_value=select_result))
    supabase = MagicMock()
    supabase.table = MagicMock(return_value=table_result)

    # No file created, no exception — the caller falls back to whatever
    # local file already exists (or fails the same way it does today).
    asyncio.run(_sync_cookies_from_supabase(supabase, "user-1", "/nonexistent/path/cookies.json"))


def test_sync_cookies_to_supabase_upserts_the_local_files_current_content(tmp_path):
    # Regression: VintedClient rotates access_token_web/refresh_token_web
    # locally on refresh (vinted_api.py::_try_token_refresh) but never told
    # Supabase — the next job's _sync_cookies_from_supabase then overwrote the
    # rotation with the old, already-used refresh token, which Vinted rejects
    # outright (401 invalid_grant), permanently breaking the account.
    cookies_data = {"access_token_web": "new-access", "refresh_token_web": "new-refresh"}
    cookies_file = tmp_path / "cookies_test.json"
    cookies_file.write_text(json.dumps(cookies_data))

    upserted = []
    execute = AsyncMock(return_value=MagicMock(data=[{"user_id": "user-1"}]))
    supabase = MagicMock()
    supabase.table = MagicMock(
        return_value=MagicMock(upsert=MagicMock(side_effect=lambda row: (upserted.append(row), MagicMock(execute=execute))[1]))
    )

    asyncio.run(_sync_cookies_to_supabase(supabase, "user-1", str(cookies_file)))

    assert len(upserted) == 1
    assert upserted[0]["user_id"] == "user-1"
    assert upserted[0]["cookies"] == cookies_data
    assert "updated_at" in upserted[0]


def test_sync_cookies_to_supabase_is_a_no_op_when_the_local_file_does_not_exist():
    supabase = MagicMock()
    asyncio.run(_sync_cookies_to_supabase(supabase, "user-1", "/nonexistent/path/cookies.json"))
    supabase.table.assert_not_called()


def test_sync_cookies_to_supabase_does_not_raise_when_the_upsert_fails(tmp_path):
    cookies_file = tmp_path / "cookies_test.json"
    cookies_file.write_text(json.dumps({"access_token_web": "abc"}))

    supabase = MagicMock()
    supabase.table = MagicMock(side_effect=RuntimeError("network error"))

    asyncio.run(_sync_cookies_to_supabase(supabase, "user-1", str(cookies_file)))  # must not raise


def test_sync_cookies_from_supabase_does_not_crash_when_execute_returns_none():
    # Regression: postgrest-py 1.0.2's async client returns None itself (not
    # a response object with .data=None) from .maybe_single().execute() when
    # zero rows match — this is what actually happens in production for a
    # user with no vinted_sessions row yet, and previously crashed the
    # scheduling loop with AttributeError: 'NoneType' object has no
    # attribute 'data'.
    execute = AsyncMock(return_value=None)
    maybe_single_result = MagicMock(execute=execute)
    eq_result = MagicMock(maybe_single=MagicMock(return_value=maybe_single_result))
    select_result = MagicMock(eq=MagicMock(return_value=eq_result))
    table_result = MagicMock(select=MagicMock(return_value=select_result))
    supabase = MagicMock()
    supabase.table = MagicMock(return_value=table_result)

    asyncio.run(_sync_cookies_from_supabase(supabase, "user-1", "/nonexistent/path/cookies.json"))


# Append to vinted-agent/main_test.py
from main import _push_log

def test_push_log_inserts_a_row():
    inserted = []
    execute = AsyncMock(return_value=MagicMock(data=[{"id": "log-1"}]))
    insert = MagicMock(execute=execute)
    supabase = MagicMock()
    supabase.table = MagicMock(return_value=MagicMock(insert=MagicMock(side_effect=lambda row: (inserted.append(row), insert)[1])))

    asyncio.run(_push_log(supabase, "error", "Session expirée", user_id="user-1"))

    assert inserted == [{"level": "error", "message": "Session expirée", "user_id": "user-1"}]


def test_push_log_never_raises_when_the_insert_fails():
    supabase = MagicMock()
    supabase.table = MagicMock(side_effect=Exception("connection refused"))

    # The whole point of _push_log is that a broken logging path must never
    # interrupt the job it's describing — this must not raise.
    asyncio.run(_push_log(supabase, "info", "Publié", user_id="user-1"))


# Append to vinted-agent/main_test.py
from main import _strip_ansi, _log


def test_strip_ansi_removes_color_codes():
    # Regression: _utag() wraps a name in color codes for the terminal
    # (e.g. "\x1b[96m[Fred]\x1b[0m") — pushed to the web UI raw, this shows
    # up as literal garbage ("[96m[Fred][0m"), which is exactly what a user
    # reported seeing in a "Dernière erreur" banner.
    colored = "\x1b[96m[Fred]\x1b[0m: session expirée — relance import_cookies.py"
    assert _strip_ansi(colored) == "[Fred]: session expirée — relance import_cookies.py"


def test_strip_ansi_leaves_plain_text_untouched():
    assert _strip_ansi("no colors here") == "no colors here"


def test_log_pushes_the_formatted_ansi_stripped_message_when_user_id_is_given():
    inserted = []
    execute = AsyncMock(return_value=MagicMock(data=[{"id": "log-1"}]))
    supabase = MagicMock()
    supabase.table = MagicMock(
        return_value=MagicMock(insert=MagicMock(side_effect=lambda row: (inserted.append(row), MagicMock(execute=execute))[1]))
    )

    asyncio.run(_log(supabase, "user-1", "info", "%s publié", "\x1b[96m[Fred]\x1b[0m"))

    assert inserted == [{"level": "info", "message": "[Fred] publié", "user_id": "user-1"}]


def test_log_maps_python_warning_level_to_the_db_warn_value():
    inserted = []
    execute = AsyncMock(return_value=MagicMock(data=[{"id": "log-1"}]))
    supabase = MagicMock()
    supabase.table = MagicMock(
        return_value=MagicMock(insert=MagicMock(side_effect=lambda row: (inserted.append(row), MagicMock(execute=execute))[1]))
    )

    asyncio.run(_log(supabase, "user-1", "warning", "careful"))

    # vinted_agent_logs' CHECK constraint only allows 'info'/'warn'/'error' —
    # Python's own logging level is spelled "warning", which would violate it.
    assert inserted[0]["level"] == "warn"


def test_log_does_not_push_when_there_is_no_user_id():
    supabase = MagicMock()
    asyncio.run(_log(supabase, None, "info", "no one to attribute this to"))
    # Console-only messages (heartbeat, cooldown countdowns, Realtime infra)
    # call _log with user_id=None — this must never touch Supabase at all.
    supabase.table.assert_not_called()


def test_log_does_not_crash_when_no_supabase_client_is_given():
    # Some call sites might only have a user_id but not the client handy —
    # _log must degrade to console-only rather than raising.
    asyncio.run(_log(None, "user-1", "info", "still just a console message"))


from main import build_other_item_title, build_other_item_description, NO_VINTED_GO_WARNING, MAX_TITLE_LENGTH


def test_build_other_item_title_uses_the_name_verbatim():
    item = {"name": "Robot Aspirateur Midea S8+"}
    assert build_other_item_title(item) == "Robot Aspirateur Midea S8+"


def test_build_other_item_title_truncates_at_80_chars():
    item = {"name": "x" * 100}
    title = build_other_item_title(item)
    assert len(title) == MAX_TITLE_LENGTH
    assert title == "x" * MAX_TITLE_LENGTH


def test_build_other_item_description_full_template():
    item = {
        "name": "Robot Aspirateur Midea S8+",
        "brand_name": "Midea",
        "size": "L",
        "vinted_condition_id": 6,
        "description": "Utilisé une fois pour tester.",
    }
    desc = build_other_item_description(item)
    assert desc == (
        "✨ Robot Aspirateur Midea S8+\n"
        "📘 Marque : Midea\n"
        "📏 Taille : L\n"
        "✅ État : Neuf avec étiquette.\n"
        "\n"
        "Utilisé une fois pour tester.\n"
        "\n"
        "🚀 Expédition rapide sous 1 à 2 jours ouvrés 📦\n"
        "🤝 Remise en main propre possible sur Paris / 92 / 95\n"
        "📸 Besoin de photos supplémentaires ? N'hésitez pas à me demander !"
    )


def test_build_other_item_description_omits_brand_and_size_when_absent():
    item = {"name": "X", "vinted_condition_id": 2, "description": ""}
    desc = build_other_item_description(item)
    assert "Marque" not in desc
    assert "Taille" not in desc
    assert desc.startswith("✨ X\n✅ État : Très bon état.")


def test_build_other_item_description_no_longer_includes_the_vinted_go_banner():
    item = {"name": "X", "vinted_condition_id": 3, "description": "test"}
    assert NO_VINTED_GO_WARNING not in build_other_item_description(item)


def test_build_other_item_description_defaults_condition_label_when_missing():
    item = {"name": "X", "description": ""}
    assert "✅ État : Très bon état." in build_other_item_description(item)


from main import process_other_item_job


def _mock_supabase_for_post_other_item(other_item: dict, existing_listing_id=None):
    """Mocks the chain process_other_item_job's 'post' path drives:
    other_item_listings.select(...).eq(...).eq(...).limit(1).execute() -> the
      double-post guard's lookup. Empty by default ("not already posted");
      pass existing_listing_id to simulate an already-posted item instead.
    other_items.select(...).eq("id", ...).single().execute() -> the item row
    other_item_listings.upsert({...}).execute()
    vinted_post_jobs.update({...}).eq("id", ...).execute()
    Unmocked tables (vinted_agent_logs, audit_logs) are fine to leave
    unhandled — _log/audit_log both swallow any exception internally.
    """
    supabase = MagicMock()

    item_single_execute = AsyncMock(return_value=MagicMock(data=other_item))
    item_single = MagicMock(execute=item_single_execute)
    item_eq = MagicMock(single=MagicMock(return_value=item_single))
    item_select = MagicMock(eq=MagicMock(return_value=item_eq))
    item_update_execute = AsyncMock(return_value=MagicMock(data=[other_item]))
    item_update_fn = MagicMock(return_value=MagicMock(eq=MagicMock(return_value=MagicMock(execute=item_update_execute))))
    other_items_table = MagicMock(select=MagicMock(return_value=item_select), update=item_update_fn)

    guard_data = [{"vinted_listing_id": existing_listing_id}] if existing_listing_id else []
    guard_execute = AsyncMock(return_value=MagicMock(data=guard_data))
    guard_limit = MagicMock(execute=guard_execute)
    guard_eq2 = MagicMock(limit=MagicMock(return_value=guard_limit))
    guard_eq1 = MagicMock(eq=MagicMock(return_value=guard_eq2))
    guard_select_fn = MagicMock(return_value=MagicMock(eq=MagicMock(return_value=guard_eq1)))

    upsert_execute = AsyncMock(return_value=MagicMock(data=[{"other_item_id": other_item["id"]}]))
    upsert_fn = MagicMock(return_value=MagicMock(execute=upsert_execute))
    other_item_listings_table = MagicMock(select=guard_select_fn, upsert=upsert_fn)

    jobs_update_execute = AsyncMock(return_value=MagicMock(data=[{"id": "job-1"}]))
    jobs_update_eq = MagicMock(execute=jobs_update_execute)
    jobs_update_fn = MagicMock(return_value=MagicMock(eq=MagicMock(return_value=jobs_update_eq)))
    jobs_table = MagicMock(update=jobs_update_fn)

    catalog_upsert_execute = AsyncMock(return_value=MagicMock(data=[]))
    catalog_upsert_fn = MagicMock(return_value=MagicMock(execute=catalog_upsert_execute))
    catalog_table = MagicMock(upsert=catalog_upsert_fn)

    def table(name):
        if name == "other_items":
            return other_items_table
        if name == "other_item_listings":
            return other_item_listings_table
        if name == "vinted_post_jobs":
            return jobs_table
        if name == "vinted_catalog_attributes":
            return catalog_table
        raise AssertionError(f"unexpected table: {name}")

    supabase.table = MagicMock(side_effect=table)
    supabase.catalog_upsert_fn = catalog_upsert_fn
    supabase.item_update_fn = item_update_fn
    return supabase, upsert_fn, jobs_update_fn


def test_process_other_item_job_posts_and_upserts_listing():
    item = {
        "id": "item-1", "name": "Robot Aspirateur", "description": "desc",
        "price": 90, "photo_urls": ["item-1/0.jpg"], "vinted_catalog_id": 2994,
        "vinted_condition_id": 6, "brand_name": "Midea", "status": "for_sale",
    }
    supabase, upsert_fn, jobs_update_fn = _mock_supabase_for_post_other_item(item)
    vinted = MagicMock()
    vinted.get_catalog_attributes = MagicMock(return_value=[])
    vinted.upload_photo = MagicMock(return_value=111)
    vinted.create_listing = MagicMock(return_value="999")
    job = {"id": "job-1", "other_item_id": "item-1", "user_id": "35385d3c-5966-4a10-8568-8d92d1be47e7", "job_type": "post"}

    asyncio.run(process_other_item_job(supabase, vinted, job))

    # Regression: process_other_item_job previously built this URL from
    # NEXT_PUBLIC_SUPABASE_URL (a Next.js-frontend-only env var never set in
    # vinted-agent's own process), which resolved to a schemeless
    # "" + "/storage/..." path — vinted.upload_photo()'s requests.get() would
    # reject that with MissingSchema in real use. Asserting the actual
    # argument (not just mocking it away) is what catches that class of bug.
    vinted.upload_photo.assert_called_once_with(
        "http://localhost:54321/storage/v1/object/public/other-item-photos/item-1/0.jpg"
    )
    vinted.create_listing.assert_called_once()
    kwargs = vinted.create_listing.call_args.kwargs
    assert kwargs["catalog_id"] == 2994
    assert kwargs["condition_id"] == 6  # Vinted's own id, sent as-is
    upsert_payload = upsert_fn.call_args.args[0]
    assert upsert_payload["vinted_listing_id"] == "999"
    assert upsert_payload["other_item_id"] == "item-1"
    status_arg = jobs_update_fn.call_args.args[0]
    assert status_arg["status"] == "done"


def test_process_other_item_job_uploads_every_photo_not_just_the_first():
    # Regression: process_other_item_job used to upload only image_urls[0]
    # and pass photo_ids=[photo_id] (a single-element list) to
    # create_listing, so a listing with 3 uploaded photos would post to
    # Vinted with just 1 — unlike process_lot_job, which already loops over
    # every URL. Asserting call_count (not just "was called") and the full
    # photo_ids list is what catches that class of bug.
    item = {
        "id": "item-1", "name": "Robot Aspirateur", "description": "desc",
        "price": 90,
        "photo_urls": ["item-1/0.jpg", "item-1/1.jpg", "item-1/2.jpg"],
        "vinted_catalog_id": 2994, "vinted_condition_id": 1,
        "brand_name": "Midea", "status": "for_sale",
    }
    supabase, upsert_fn, jobs_update_fn = _mock_supabase_for_post_other_item(item)
    vinted = MagicMock()
    vinted.upload_photo = MagicMock(side_effect=[111, 222, 333])
    vinted.create_listing = MagicMock(return_value="999")
    job = {"id": "job-1", "other_item_id": "item-1", "user_id": "35385d3c-5966-4a10-8568-8d92d1be47e7", "job_type": "post"}

    asyncio.run(process_other_item_job(supabase, vinted, job))

    assert vinted.upload_photo.call_count == 3
    uploaded_urls = [call.args[0] for call in vinted.upload_photo.call_args_list]
    assert uploaded_urls == [
        "http://localhost:54321/storage/v1/object/public/other-item-photos/item-1/0.jpg",
        "http://localhost:54321/storage/v1/object/public/other-item-photos/item-1/1.jpg",
        "http://localhost:54321/storage/v1/object/public/other-item-photos/item-1/2.jpg",
    ]
    kwargs = vinted.create_listing.call_args.kwargs
    assert kwargs["photo_ids"] == [111, 222, 333]


def test_process_other_item_job_fails_gracefully_on_vinted_api_error():
    item = {
        "id": "item-1", "name": "X", "description": "", "price": 10,
        "photo_urls": ["item-1/0.jpg"], "vinted_catalog_id": 1, "vinted_condition_id": 1, "status": "for_sale",
    }
    supabase, upsert_fn, jobs_update_fn = _mock_supabase_for_post_other_item(item)
    vinted = MagicMock()
    vinted.upload_photo = MagicMock(return_value=111)
    vinted.create_listing = MagicMock(side_effect=RuntimeError("Vinted 500"))
    job = {"id": "job-1", "other_item_id": "item-1", "user_id": "35385d3c-5966-4a10-8568-8d92d1be47e7", "job_type": "post"}

    asyncio.run(process_other_item_job(supabase, vinted, job))

    update_call = jobs_update_fn.call_args.args[0]
    assert update_call["status"] == "error"
    assert "Vinted 500" in update_call["error"]


def test_process_other_item_job_skips_posting_when_already_posted():
    # Parity guard with process_job (~main.py:494) and process_lot_job
    # (main.py:667-676): a second 'post' job for an item/user pair that
    # already has a vinted_listing_id must not call create_listing again —
    # it should just mark the job done.
    item = {
        "id": "item-1", "name": "Robot Aspirateur", "description": "desc",
        "price": 90, "photo_urls": ["item-1/0.jpg"], "vinted_catalog_id": 2994,
        "vinted_condition_id": 1, "brand_name": "Midea", "status": "for_sale",
    }
    supabase, upsert_fn, jobs_update_fn = _mock_supabase_for_post_other_item(
        item, existing_listing_id="888"
    )
    vinted = MagicMock()
    vinted.upload_photo = MagicMock(return_value=111)
    vinted.create_listing = MagicMock(return_value="999")
    job = {"id": "job-1", "other_item_id": "item-1", "user_id": "35385d3c-5966-4a10-8568-8d92d1be47e7", "job_type": "post"}

    asyncio.run(process_other_item_job(supabase, vinted, job))

    vinted.create_listing.assert_not_called()
    upsert_fn.assert_not_called()
    status_arg = jobs_update_fn.call_args.args[0]
    assert status_arg["status"] == "done"


# ---------------------------------------------------------------------------
# Size / color / condition — validated against the category before posting
# ---------------------------------------------------------------------------
from contextlib import contextmanager
from unittest.mock import patch

from main import (
    _fail_job, _fetch_queue_front, _fetch_requested_attributes, _requeue_after_failure,
    _store_catalog_attributes, build_other_item_description,
)
from vinted_api import VintedValidationError

FRED = "35385d3c-5966-4a10-8568-8d92d1be47e7"


def _attr_option(id_, title):
    return {"id": id_, "title": title, "type": "default", "has_children": False}


def _attr_group(title, options):
    return {"id": 1, "title": title, "type": "group", "options": options}


# Trimmed real attributes of catalog 2614 (women's puffer jackets).
PUFFER_ATTRIBUTES = [
    {"code": "brand", "value_ids": None, "value": None, "configuration": None},
    {"id": 8001, "code": "size", "configuration": {"required": True, "options": [
        _attr_group("S/M/L", [_attr_option(1739, "M"), _attr_option(1740, "L")]),
    ]}},
    {"id": 431, "code": "condition", "configuration": {"required": True, "options": [
        _attr_group("État", [_attr_option(6, "Neuf avec étiquette"), _attr_option(2, "Très bon état")]),
    ]}},
    {"code": "color", "value_ids": None, "value": None, "configuration": None},
]
# A bag: no size, still a color.
BACKPACK_ATTRIBUTES = [a for a in PUFFER_ATTRIBUTES if a["code"] != "size"]
# Perfume: no size, no color.
PERFUME_ATTRIBUTES = [
    {"id": 431, "code": "condition", "configuration": {"required": True, "options": [
        _attr_group("État", [_attr_option(6, "Neuf avec étiquette")]),
    ]}},
]


def _puffer_item(**overrides):
    item = {
        "id": "item-1", "name": "Doudoune", "description": "", "price": 75,
        "photo_urls": ["item-1/0.jpg"], "vinted_catalog_id": 2614, "brand_name": "Uniqlo",
        "status": "for_sale", "size": "L", "vinted_size_id": 1740, "vinted_color_ids": [1],
        "vinted_condition_id": 2,
    }
    item.update(overrides)
    return item


@contextmanager
def _fast_and_isolated():
    """No real sleeps, and _requeue_after_failure replaced by a spy — its own
    behaviour is covered separately below."""
    with patch("main.asyncio.sleep", new=AsyncMock()), \
            patch("main._requeue_after_failure", new=AsyncMock()) as requeue:
        yield requeue


def _vinted(attributes, create_listing=None):
    vinted = MagicMock()
    vinted.get_catalog_attributes = MagicMock(return_value=attributes)
    vinted.upload_photo = MagicMock(return_value=111)
    vinted.create_listing = create_listing or MagicMock(return_value="999")
    return vinted


def _post_job():
    return {"id": "job-1", "other_item_id": "item-1", "user_id": FRED, "job_type": "post"}


def test_other_item_condition_labels_follow_vinteds_own_ids():
    def label(cid):
        return build_other_item_description({"name": "X", "vinted_condition_id": cid}).split("\n")[1]
    assert label(6) == "✅ État : Neuf avec étiquette."
    assert label(1) == "✅ État : Neuf sans étiquette."
    assert label(2) == "✅ État : Très bon état."
    assert label(3) == "✅ État : Bon état."
    assert label(4) == "✅ État : Satisfaisant."
    assert label(7) == "✅ État : Certaines pièces ne fonctionnent pas."


def test_process_other_item_job_posts_with_size_colors_and_vinteds_condition_id():
    supabase, upsert_fn, jobs_update_fn = _mock_supabase_for_post_other_item(_puffer_item())
    vinted = _vinted(PUFFER_ATTRIBUTES)

    with _fast_and_isolated():
        asyncio.run(process_other_item_job(supabase, vinted, _post_job()))

    vinted.get_catalog_attributes.assert_called_once_with(2614)
    kwargs = vinted.create_listing.call_args.kwargs
    assert kwargs["size_id"] == 1740
    assert kwargs["color_ids"] == [1]
    assert kwargs["condition_id"] == 2
    assert jobs_update_fn.call_args.args[0]["status"] == "done"


def test_process_other_item_job_sends_no_size_where_the_category_has_none():
    item = _puffer_item(vinted_catalog_id=246, vinted_size_id=None, size=None)
    supabase, _, _ = _mock_supabase_for_post_other_item(item)
    vinted = _vinted(BACKPACK_ATTRIBUTES)

    with _fast_and_isolated():
        asyncio.run(process_other_item_job(supabase, vinted, _post_job()))

    assert vinted.create_listing.call_args.kwargs["size_id"] is None


def test_process_other_item_job_drops_colors_where_the_category_has_no_color_field():
    item = _puffer_item(vinted_catalog_id=145, vinted_size_id=None, vinted_color_ids=[1], vinted_condition_id=6)
    supabase, _, _ = _mock_supabase_for_post_other_item(item)
    vinted = _vinted(PERFUME_ATTRIBUTES)

    with _fast_and_isolated():
        asyncio.run(process_other_item_job(supabase, vinted, _post_job()))

    assert vinted.create_listing.call_args.kwargs["color_ids"] == []


def test_process_other_item_job_refreshes_the_category_cache():
    supabase, _, _ = _mock_supabase_for_post_other_item(_puffer_item())

    with _fast_and_isolated():
        asyncio.run(process_other_item_job(supabase, _vinted(PUFFER_ATTRIBUTES), _post_job()))

    row = supabase.catalog_upsert_fn.call_args.args[0]
    assert row["catalog_id"] == 2614
    assert row["status"] == "ready"
    assert row["size_required"] is True
    assert row["has_color"] is True
    assert row["size_options"][0]["options"][1] == {"id": 1740, "title": "L"}
    assert row["condition_options"] == [{"id": 6, "title": "Neuf avec étiquette"}, {"id": 2, "title": "Très bon état"}]


def test_process_other_item_job_stops_before_any_upload_when_the_size_is_missing():
    supabase, upsert_fn, jobs_update_fn = _mock_supabase_for_post_other_item(
        _puffer_item(vinted_size_id=None, size=None, vinted_color_ids=[])
    )
    vinted = _vinted(PUFFER_ATTRIBUTES)

    with _fast_and_isolated() as requeue:
        asyncio.run(process_other_item_job(supabase, vinted, _post_job()))

    vinted.upload_photo.assert_not_called()
    vinted.create_listing.assert_not_called()
    error = jobs_update_fn.call_args.args[0]["error"]
    assert error == "À compléter dans la fiche : Taille manquante · Couleur manquante"
    requeue.assert_awaited_once()
    assert requeue.await_args.args[3] is True  # permanent: needs a fix, not a retry


def test_process_other_item_job_treats_a_vinted_validation_error_as_permanent():
    supabase, _, jobs_update_fn = _mock_supabase_for_post_other_item(_puffer_item())
    rejected = MagicMock(side_effect=VintedValidationError("Vinted a refusé l'annonce : Le champ Couleur doit être renseigné"))
    vinted = _vinted(PUFFER_ATTRIBUTES, create_listing=rejected)

    with _fast_and_isolated() as requeue:
        asyncio.run(process_other_item_job(supabase, vinted, _post_job()))

    assert "Le champ Couleur doit être renseigné" in jobs_update_fn.call_args.args[0]["error"]
    assert requeue.await_args.args[3] is True


def test_process_other_item_job_treats_a_network_error_as_transient():
    supabase, _, _ = _mock_supabase_for_post_other_item(_puffer_item())
    vinted = _vinted(PUFFER_ATTRIBUTES, create_listing=MagicMock(side_effect=RuntimeError("curl: (28) timed out")))

    with _fast_and_isolated() as requeue:
        asyncio.run(process_other_item_job(supabase, vinted, _post_job()))

    assert requeue.await_args.args[3] is False


def test_process_other_item_job_fails_transiently_when_the_attributes_cannot_be_fetched():
    supabase, _, jobs_update_fn = _mock_supabase_for_post_other_item(_puffer_item())
    vinted = _vinted(PUFFER_ATTRIBUTES)
    vinted.get_catalog_attributes = MagicMock(side_effect=RuntimeError("HTTP Error 503: "))

    with _fast_and_isolated() as requeue:
        asyncio.run(process_other_item_job(supabase, vinted, _post_job()))

    vinted.upload_photo.assert_not_called()
    assert "503" in jobs_update_fn.call_args.args[0]["error"]
    assert requeue.await_args.args[3] is False


# ---------------------------------------------------------------------------
# Re-queueing a failed job's item
# ---------------------------------------------------------------------------
class _FakeQuery:
    def __init__(self, db, table):
        self.db, self.table, self.op, self.cols, self.payload = db, table, None, None, None
        self.filters = {}

    def select(self, cols):
        self.op, self.cols = "select", cols
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def upsert(self, payload):
        self.op, self.payload = "upsert", payload
        return self

    def eq(self, col, value):
        self.filters[col] = value
        return self

    def is_(self, col, value):
        self.filters[f"{col} is"] = value
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, n):
        return self

    def maybe_single(self):
        return self

    async def execute(self):
        self.db.calls.append((self.table, self.op, self.cols, dict(self.filters), self.payload))
        if self.db.fail:
            raise RuntimeError("db down")
        return MagicMock(data=self.db.responses.get((self.table, self.op, self.cols)))


class _FakeDb:
    def __init__(self, responses=None, fail=False):
        self.responses, self.fail, self.calls = responses or {}, fail, []

    def table(self, name):
        return _FakeQuery(self, name)

    def writes(self, table):
        return [c for c in self.calls if c[0] == table and c[1] in ("insert", "update", "upsert")]


def _other_item_db(status="for_sale", listed=False, queued=False, front_position=3):
    return _FakeDb({
        ("other_items", "select", "status"): {"status": status},
        ("other_item_listings", "select", "vinted_listing_id"): [{"vinted_listing_id": "v1" if listed else None}],
        ("vinted_queue", "select", "id"): [{"id": "q-1"}] if queued else [],
        ("vinted_queue", "select", "position"): [{"position": front_position}] if front_position is not None else [],
    })


def test_requeue_puts_a_permanently_failed_item_back_at_the_front_flagged():
    db = _other_item_db(front_position=3)
    with patch("main._log", new=AsyncMock()):
        asyncio.run(_requeue_after_failure(db, _post_job(), "À compléter dans la fiche : Taille manquante", True))

    [(table, op, _, _, row)] = db.writes("vinted_queue")
    assert op == "insert"
    assert row["user_id"] == FRED and row["other_item_id"] == "item-1"
    assert row["position"] == 2  # in front of the current head (3)
    assert row["last_error"] == "À compléter dans la fiche : Taille manquante"
    assert row["failed_at"] is not None


def test_requeue_puts_a_transiently_failed_item_back_unflagged():
    db = _other_item_db()
    with patch("main._log", new=AsyncMock()):
        asyncio.run(_requeue_after_failure(db, _post_job(), "curl: (28) timed out", False))

    [(_, _, _, _, row)] = db.writes("vinted_queue")
    assert row["last_error"] is None
    assert row["failed_at"] is None


def test_requeue_into_an_empty_queue_starts_at_position_1():
    db = _other_item_db(front_position=None)
    with patch("main._log", new=AsyncMock()):
        asyncio.run(_requeue_after_failure(db, _post_job(), "x", False))

    assert db.writes("vinted_queue")[0][4]["position"] == 1


def test_requeue_flags_an_item_that_is_somehow_still_queued_instead_of_duplicating_it():
    db = _other_item_db(queued=True)
    with patch("main._log", new=AsyncMock()):
        asyncio.run(_requeue_after_failure(db, _post_job(), "Taille manquante", True))

    [(_, op, _, filters, row)] = db.writes("vinted_queue")
    assert op == "update"
    assert filters == {"id": "q-1"}
    assert row["last_error"] == "Taille manquante"


def test_requeue_ignores_delete_jobs():
    db = _other_item_db()
    asyncio.run(_requeue_after_failure(db, {**_post_job(), "job_type": "delete"}, "x", False))
    assert db.calls == []


def test_requeue_leaves_an_item_that_is_still_listed_alone():
    db = _other_item_db(listed=True)
    asyncio.run(_requeue_after_failure(db, {**_post_job(), "job_type": "repost"}, "x", False))
    assert db.writes("vinted_queue") == []


def test_requeue_leaves_an_item_that_is_no_longer_for_sale_alone():
    db = _other_item_db(status="sold")
    asyncio.run(_requeue_after_failure(db, _post_job(), "x", False))
    assert db.writes("vinted_queue") == []


def test_requeue_applies_the_card_price_confirmation_gate():
    db = _FakeDb({
        ("cards", "select", "status, price_confirmed_at"): {"status": "for_sale", "price_confirmed_at": None},
        ("card_listings", "select", "vinted_listing_id"): [],
    })
    job = {"id": "job-1", "card_id": "card-1", "user_id": FRED, "job_type": "post"}
    asyncio.run(_requeue_after_failure(db, job, "x", False))
    assert db.writes("vinted_queue") == []


def test_requeue_never_raises_when_the_database_fails():
    asyncio.run(_requeue_after_failure(_FakeDb(fail=True), _post_job(), "x", False))


def test_fail_job_hands_the_job_and_its_permanence_to_requeue():
    supabase, _, _ = _mock_supabase_for_post_other_item(_puffer_item())
    job = _post_job()
    with patch("main._requeue_after_failure", new=AsyncMock()) as requeue:
        asyncio.run(_fail_job(supabase, "job-1", "item-1", "Taille manquante", FRED,
                              entity_type="other_item", job=job, permanent=True))
    requeue.assert_awaited_once_with(supabase, job, "Taille manquante", True)


def test_fail_job_without_a_job_does_not_requeue():
    supabase, _, _ = _mock_supabase_for_post_other_item(_puffer_item())
    with patch("main._requeue_after_failure", new=AsyncMock()) as requeue:
        asyncio.run(_fail_job(supabase, "job-1", "item-1", "x", FRED, entity_type="other_item"))
    requeue.assert_not_awaited()


def test_the_scheduler_only_looks_at_unflagged_queue_rows():
    db = _FakeDb({("vinted_queue", "select", "card_id, lot_id, other_item_id, position"): [{"other_item_id": "i"}]})
    rows = asyncio.run(_fetch_queue_front(db, FRED))
    assert rows == [{"other_item_id": "i"}]
    [(_, _, _, filters, _)] = db.calls
    assert filters == {"user_id": FRED, "failed_at is": "null"}


# ---------------------------------------------------------------------------
# Category attribute cache — rows the app requests, the bot fills
# ---------------------------------------------------------------------------
def test_store_catalog_attributes_upserts_a_ready_row():
    db = _FakeDb()
    parsed = {"size_options": None, "size_required": False, "condition_options": [{"id": 6, "title": "Neuf"}], "has_color": False}
    asyncio.run(_store_catalog_attributes(db, 145, parsed))
    [(_, op, _, _, row)] = db.writes("vinted_catalog_attributes")
    assert op == "upsert"
    assert row["catalog_id"] == 145 and row["status"] == "ready" and row["error"] is None
    assert row["condition_options"] == [{"id": 6, "title": "Neuf"}]
    assert row["fetched_at"] is not None


def test_store_catalog_attributes_never_raises():
    asyncio.run(_store_catalog_attributes(_FakeDb(fail=True), 145, {
        "size_options": None, "size_required": False, "condition_options": [], "has_color": False,
    }))


@contextmanager
def _bot_session(vinted):
    with patch("main.VINTED_USERS", {FRED: "cookies_fhuang5.json"}), \
            patch("main._sync_cookies_from_supabase", new=AsyncMock()), \
            patch("main._sync_cookies_to_supabase", new=AsyncMock()) as to_supabase, \
            patch("main._make_vinted_client", return_value=vinted):
        yield to_supabase


def test_fetch_requested_attributes_fills_the_row_with_the_requesters_session():
    db = _FakeDb()
    vinted = _vinted(PUFFER_ATTRIBUTES)
    with _bot_session(vinted) as to_supabase:
        asyncio.run(_fetch_requested_attributes(db, {"catalog_id": 2614, "requested_by": FRED}))

    vinted.get_catalog_attributes.assert_called_once_with(2614)
    [(_, op, _, _, row)] = db.writes("vinted_catalog_attributes")
    assert op == "upsert" and row["status"] == "ready" and row["has_color"] is True
    to_supabase.assert_awaited()  # a token rotated by the client goes back to Supabase


def test_fetch_requested_attributes_marks_the_row_as_failed_when_vinted_errors():
    db = _FakeDb()
    vinted = _vinted(PUFFER_ATTRIBUTES)
    vinted.get_catalog_attributes = MagicMock(side_effect=RuntimeError("HTTP Error 403: "))
    with _bot_session(vinted):
        asyncio.run(_fetch_requested_attributes(db, {"catalog_id": 2614, "requested_by": FRED}))

    [(_, op, _, filters, row)] = db.writes("vinted_catalog_attributes")
    assert op == "update" and filters == {"catalog_id": 2614}
    assert row["status"] == "error" and "403" in row["error"]


def test_fetch_requested_attributes_marks_the_row_as_failed_without_a_session_for_the_requester():
    db = _FakeDb()
    with _bot_session(_vinted(PUFFER_ATTRIBUTES)):
        asyncio.run(_fetch_requested_attributes(db, {"catalog_id": 2614, "requested_by": "someone-else"}))

    [(_, op, _, _, row)] = db.writes("vinted_catalog_attributes")
    assert op == "update" and row["status"] == "error"


# Catalog 1227 as Vinted served it at 15:10 on 2026-10-05: sizes renumbered
# (L was 209 that morning, in a single "Tailles hommes" group).
PARKAS_RENUMBERED = [
    {"id": 8001, "code": "size", "configuration": {"required": True, "options": [
        _attr_group("S/M/L", [_attr_option(2436, "M"), _attr_option(2437, "L")]),
        _attr_group("EU", [_attr_option(2601, "EU 52")]),
    ]}},
    {"id": 431, "code": "condition", "configuration": {"required": True, "options": [
        _attr_group("État", [_attr_option(2, "Très bon état")]),
    ]}},
    {"code": "color", "value_ids": None, "value": None, "configuration": None},
]


def test_process_other_item_job_finds_a_renumbered_size_again_by_its_label():
    item = _puffer_item(vinted_catalog_id=1227, vinted_size_id=209, size="L")
    supabase, _, jobs_update_fn = _mock_supabase_for_post_other_item(item)
    vinted = _vinted(PARKAS_RENUMBERED)

    with _fast_and_isolated():
        asyncio.run(process_other_item_job(supabase, vinted, _post_job()))

    assert vinted.create_listing.call_args.kwargs["size_id"] == 2437
    supabase.item_update_fn.assert_called_once_with({"vinted_size_id": 2437})
    assert jobs_update_fn.call_args.args[0]["status"] == "done"


def test_process_other_item_job_still_flags_a_stale_size_it_cannot_match():
    item = _puffer_item(vinted_catalog_id=1227, vinted_size_id=209, size="Taille unique")
    supabase, _, jobs_update_fn = _mock_supabase_for_post_other_item(item)
    vinted = _vinted(PARKAS_RENUMBERED)

    with _fast_and_isolated() as requeue:
        asyncio.run(process_other_item_job(supabase, vinted, _post_job()))

    vinted.create_listing.assert_not_called()
    assert jobs_update_fn.call_args.args[0]["error"] == "À compléter dans la fiche : Taille invalide pour cette catégorie"
    assert requeue.await_args.args[3] is True


from main import build_lot_title


def test_build_lot_title_cleans_spreadsheet_tabs_and_all_caps_words():
    # Regression: Vinted refused "Carte Magic Final Fantasy\tSephiroth, Fabled SOLDIER\t115\tM [FR]".
    lot = {"name": "Final Fantasy\tSephiroth, Fabled SOLDIER\t115\tM", "language": "FR", "brand_label": "Magic", "is_lot": False}
    assert build_lot_title(lot) == "Carte Magic Final Fantasy Sephiroth, Fabled Soldier 115 M [FR]"


def test_build_other_item_title_cleans_all_caps_words():
    assert build_other_item_title({"name": "Imperméable RAINS Unisex Long Jacket"}) == "Imperméable Rains Unisex Long Jacket"
