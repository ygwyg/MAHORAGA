import { D1Client } from "../client";
import { generateId, nowISO, hashObject } from "../../../lib/utils";

export async function insertToolLog(
  db: D1Client,
  entry: {
    request_id: string;
    tool_name: string;
    input: object;
    output?: object;
    error?: object;
    latency_ms?: number;
    provider_calls?: number;
  }
): Promise<string> {
  const id = generateId();
  const inputJson = JSON.stringify(entry.input);
  const inputHash = hashObject(entry.input);

  await db.run(
    `INSERT INTO tool_logs (id, request_id, tool_name, input_hash, input_json, output_json, error_json, latency_ms, provider_calls, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      entry.request_id,
      entry.tool_name,
      inputHash,
      inputJson,
      entry.output ? JSON.stringify(entry.output) : null,
      entry.error ? JSON.stringify(entry.error) : null,
      entry.latency_ms ?? null,
      entry.provider_calls ?? 0,
      nowISO(),
    ]
  );

  return id;
}


