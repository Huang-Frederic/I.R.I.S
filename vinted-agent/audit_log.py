import logging
from supabase import AsyncClient

log = logging.getLogger(__name__)


async def audit_log(
    supabase: AsyncClient,
    actor_user_id: str,
    action: str,
    *,
    entity_type: str = None,
    entity_id: str = None,
    details: dict = None,
) -> None:
    try:
        await supabase.table("audit_logs").insert({
            "actor_type": "agent",
            "actor_user_id": actor_user_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "details": details or {},
        }).execute()
    except Exception as e:
        log.warning("audit_log failed: %s", e)
