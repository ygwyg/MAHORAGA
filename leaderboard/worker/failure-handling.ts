/**
 * Failure state management for trader accounts.
 *
 * When a sync fails with a "bad signal" (401, reset account, etc.), the trader
 * is marked inactive with first_failure_at set. If they recover (successful sync),
 * the failure state is cleared. After 7 days inactive, cron purges the account.
 */

/**
 * Check if a failure is transient (should retry) vs bad signal (mark inactive).
 *
 * Transient failures (retry with backoff):
 *   - 5xx: Alpaca server errors
 *   - 429: Rate limited
 *
 * Bad signals (mark inactive):
 *   - 401: Token revoked
 *   - 403: Forbidden
 *   - 200 with failure: Reset/deleted account
 *   - undefined: Decrypt failure or other non-API error
 */
export function isTransientFailure(alpacaStatus: number | undefined): boolean {
  if (alpacaStatus === undefined) return false;
  if (alpacaStatus >= 500) return true;
  if (alpacaStatus === 429) return true;
  return false;
}

/**
 * Mark trader as inactive and record failure info.
 * Only sets first_failure_at if not already set (preserves original failure time).
 */
export async function markInactive(
  env: Env,
  traderId: string,
  reason: string
): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE traders SET
         is_active = 0,
         first_failure_at = COALESCE(first_failure_at, datetime('now')),
         last_failure_reason = ?2
       WHERE id = ?1`
    ).bind(traderId, reason).run();
  } catch (err) {
    console.error(
      `[failure-handling] Failed to mark trader ${traderId} inactive:`,
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Clear failure state on successful sync (auto-recovery).
 * Sets is_active = 1 and clears failure tracking fields.
 */
export async function clearFailureState(
  env: Env,
  traderId: string
): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE traders SET
         is_active = 1,
         first_failure_at = NULL,
         last_failure_reason = NULL
       WHERE id = ?1`
    ).bind(traderId).run();
  } catch (err) {
    console.error(
      `[failure-handling] Failed to clear failure state for trader ${traderId}:`,
      err instanceof Error ? err.message : err
    );
  }
}
