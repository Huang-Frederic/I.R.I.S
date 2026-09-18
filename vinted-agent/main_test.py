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
