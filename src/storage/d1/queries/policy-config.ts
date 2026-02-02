import { D1Client, PolicyConfigRow } from "../client";
import type { PolicyConfig } from "../../../policy/config";

export async function getPolicyConfig(
  db: D1Client
): Promise<PolicyConfig | null> {
  const row = await db.executeOne<PolicyConfigRow>(
    `SELECT * FROM policy_config WHERE id = 1`
  );

  if (!row) {
    return null;
  }

  return JSON.parse(row.config_json) as PolicyConfig;
}
