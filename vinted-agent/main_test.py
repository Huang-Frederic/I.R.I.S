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
from main import _sync_cookies_from_supabase

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
