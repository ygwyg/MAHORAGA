import { D1Client, RiskStateRow } from "../client";
import { nowISO } from "../../../lib/utils";

export interface RiskState {
  kill_switch_active: boolean;
  kill_switch_reason: string | null;
  kill_switch_at: string | null;
  daily_loss_usd: number;
  daily_loss_reset_at: string | null;
  last_loss_at: string | null;
  cooldown_until: string | null;
  updated_at: string;
}

export async function getRiskState(db: D1Client): Promise<RiskState> {
  const row = await db.executeOne<RiskStateRow>(
    `SELECT * FROM risk_state WHERE id = 1`
  );

  if (!row) {
    return {
      kill_switch_active: false,
      kill_switch_reason: null,
      kill_switch_at: null,
      daily_loss_usd: 0,
      daily_loss_reset_at: nowISO(),
      last_loss_at: null,
      cooldown_until: null,
      updated_at: nowISO(),
    };
  }

  return {
    kill_switch_active: row.kill_switch_active === 1,
    kill_switch_reason: row.kill_switch_reason,
    kill_switch_at: row.kill_switch_at,
    daily_loss_usd: row.daily_loss_usd,
    daily_loss_reset_at: row.daily_loss_reset_at,
    last_loss_at: row.last_loss_at,
    cooldown_until: row.cooldown_until,
    updated_at: row.updated_at,
  };
}

export async function enableKillSwitch(
  db: D1Client,
  reason: string
): Promise<void> {
  const now = nowISO();
  await db.run(
    `UPDATE risk_state SET kill_switch_active = 1, kill_switch_reason = ?, kill_switch_at = ?, updated_at = ? WHERE id = 1`,
    [reason, now, now]
  );
}

export async function disableKillSwitch(db: D1Client): Promise<void> {
  await db.run(
    `UPDATE risk_state SET kill_switch_active = 0, kill_switch_reason = NULL, kill_switch_at = NULL, updated_at = ? WHERE id = 1`,
    [nowISO()]
  );
}

export async function resetDailyLoss(db: D1Client): Promise<void> {
  const now = nowISO();
  await db.run(
    `UPDATE risk_state SET daily_loss_usd = 0, daily_loss_reset_at = ?, cooldown_until = NULL, updated_at = ? WHERE id = 1`,
    [now, now]
  );
}
