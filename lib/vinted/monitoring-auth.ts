/**
 * Throws unless both the requester and the target user are Vinted-enabled
 * (present in VINTED_USER_IDS) — the boundary for the monitoring section's
 * one genuinely cross-user write, pasting a partner's session cookies.
 */
export function assertVintedAccess(requesterId: string, targetUserId: string): void {
  const enabledIds = (process.env.VINTED_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!enabledIds.includes(requesterId) || !enabledIds.includes(targetUserId)) {
    throw new Error('Vinted monitoring access denied');
  }
}
