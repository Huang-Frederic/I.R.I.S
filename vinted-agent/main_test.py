# vinted-agent/main_test.py
import asyncio
import os
from unittest.mock import MagicMock, AsyncMock

# main.py reads these at import time; this worktree has no .env, so set
# harmless placeholders (only if unset) before importing the module under test.
os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_KEY", "test-key")

from main import process_job

def _mock_supabase_for_delete_job():
    """A minimal AsyncClient stand-in: only the calls process_job's
    'delete' branch is expected to make are wired; anything else raises,
    so an unexpected extra call fails the test loudly."""
    supabase = MagicMock()

    # supabase.table("card_listings").update({...}).eq(...).eq(...).execute()
    listings_update_execute = AsyncMock(return_value=MagicMock(data=[{"card_id": "card-1"}]))
    listings_eq2 = MagicMock(execute=listings_update_execute)
    listings_eq1 = MagicMock(eq=MagicMock(return_value=listings_eq2))
    listings_update = MagicMock(eq=MagicMock(return_value=listings_eq1))

    # supabase.table("vinted_post_jobs").update({"status": "done"}).eq("id", ...).execute()
    jobs_update_execute = AsyncMock(return_value=MagicMock(data=[{"id": "job-1"}]))
    jobs_update_eq = MagicMock(execute=jobs_update_execute)
    jobs_update = MagicMock(eq=MagicMock(return_value=jobs_update_eq))

    def table(name):
        if name == "card_listings":
            return MagicMock(update=MagicMock(return_value=listings_update))
        if name == "vinted_post_jobs":
            return MagicMock(update=MagicMock(return_value=jobs_update))
        raise AssertionError(f"unexpected table: {name}")

    supabase.table = MagicMock(side_effect=table)
    return supabase, listings_update, jobs_update


def test_process_job_delete_type_removes_listing_without_reposting():
    supabase, listings_update, jobs_update = _mock_supabase_for_delete_job()
    vinted = MagicMock()
    vinted.delete_listing = MagicMock()
    job = {
        "id": "job-1",
        "card_id": "card-1",
        "user_id": "other-user",
        "job_type": "delete",
    }

    asyncio.run(process_job(supabase, vinted, job))

    vinted.delete_listing.assert_called_once()
    # The job must be marked done, and no new listing created — create_listing
    # is never called on the mock, which would raise if accessed as anything
    # other than a MagicMock attribute (no explicit assertion needed beyond
    # "vinted.create_listing was never called").
    vinted.create_listing.assert_not_called()
    listings_update.eq.assert_called()
    jobs_update.eq.assert_called_with("id", "job-1")
