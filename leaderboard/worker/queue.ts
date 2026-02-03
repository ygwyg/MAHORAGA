/**
 * Queue consumer: processes per-trader sync messages.
 *
 * Each message triggers an Alpaca data sync for one trader via their SyncerDO.
 * On success, the message re-enqueues itself with a tier-appropriate delay,
 * creating a perpetual sync loop per trader.
 *
 * Failure handling:
 *   - Bad signal (401, reset account, decrypt failure): mark inactive, start 7-day grace period
 *   - Transient (5xx, 429): retry with exponential backoff, don't change is_active
 *   - Success after failure: auto-recover (is_active = 1, clear failure state)
 *   - After 7 days inactive: cron purges the entire account
 */

import { tierDelaySeconds, type SyncTier } from "./tiers";
import { decryptToken } from "./crypto";
import { invalidateTraderCache } from "./cache";
import { isTransientFailure, markInactive, clearFailureState } from "./failure-handling";
import type { SyncMessage, TraderWithTokenRow } from "./types";

export async function processSyncMessage(
  message: Message<SyncMessage>,
  env: Env
): Promise<void> {
  const { traderId } = message.body;

  // 1. Look up trader + token from D1
  //    Note: We sync inactive accounts too (they can recover during grace period)
  const row = await env.DB.prepare(
    `SELECT t.id, t.username, t.sync_tier, t.is_active,
            ot.access_token_encrypted
     FROM traders t
     LEFT JOIN oauth_tokens ot ON ot.trader_id = t.id
     WHERE t.id = ?1`
  ).bind(traderId).first<TraderWithTokenRow>();

  // Missing trader or token → ack and let message die
  if (!row || !row.access_token_encrypted) {
    message.ack();
    return;
  }

  const tier = row.sync_tier as SyncTier;

  // 2. Decrypt token
  let token: string;
  try {
    token = await decryptToken(
      row.access_token_encrypted,
      env.ENCRYPTION_KEY,
      traderId
    );
  } catch (err) {
    // Decrypt failure = bad signal (encryption key mismatch or data corruption)
    const reason = `Decrypt failed: ${err instanceof Error ? err.message : "unknown"}`;
    console.error(`[queue] ${reason} for trader ${traderId}`);
    await markInactive(env, traderId, reason);
    message.ack();
    // Re-enqueue to keep trying during grace period
    await safeReEnqueue(env, traderId, tier);
    return;
  }

  // 3. Call SyncerDO.sync()
  const doId = env.SYNCER.idFromName(traderId);
  const stub = env.SYNCER.get(doId);
  const result = await stub.sync(traderId, token);

  if (result.success) {
    // 4a. Success: clear failure state (auto-recovery if was inactive)
    message.ack();
    await clearFailureState(env, traderId);
    try { await invalidateTraderCache(env, row.username); }
    catch (err) { console.error(`[queue] Cache invalidation failed for ${row.username}:`, err instanceof Error ? err.message : err); }
    await safeReEnqueue(env, traderId, tier);
  } else if (isTransientFailure(result.alpacaStatus)) {
    // 4b. Transient failure (5xx, 429): retry with backoff, don't change is_active
    console.error(`[queue] Transient failure for trader ${traderId} (attempt ${message.attempts}): ${result.error}`);
    const backoffDelay = Math.min(
      tierDelaySeconds(tier) * Math.pow(2, message.attempts - 1),
      21600 // Cap at 6 hours
    );
    message.retry({ delaySeconds: backoffDelay });
  } else {
    // 4c. Bad signal (401, 403, reset account, etc.): mark inactive
    const reason = result.error || `Alpaca ${result.alpacaStatus}`;
    console.error(`[queue] Bad signal for trader ${traderId}: ${reason}`);
    await markInactive(env, traderId, reason);
    message.ack();
    // Re-enqueue to keep trying during grace period (can still recover)
    await safeReEnqueue(env, traderId, tier);
  }
}

/**
 * Safely re-enqueue a sync message. Logs but doesn't throw on failure.
 */
async function safeReEnqueue(env: Env, traderId: string, tier: SyncTier): Promise<void> {
  try {
    await env.SYNC_QUEUE.send(
      { traderId } satisfies SyncMessage,
      { delaySeconds: tierDelaySeconds(tier) }
    );
  } catch (err) {
    console.error(`[queue] Re-enqueue failed for trader ${traderId} (tier ${tier}):`, err instanceof Error ? err.message : err);
  }
}
