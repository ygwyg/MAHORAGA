import { D1Client } from "../client";
import { generateId, nowISO } from "../../../lib/utils";

interface CreateTradeParams {
  approval_id?: string;
  alpaca_order_id: string;
  symbol: string;
  side: string;
  qty?: number;
  notional?: number;
  order_type: string;
  limit_price?: number;
  stop_price?: number;
  status: string;
}

export async function createTrade(
  db: D1Client,
  params: CreateTradeParams
): Promise<string> {
  const id = generateId();
  const now = nowISO();

  await db.run(
    `INSERT INTO trades (id, approval_id, alpaca_order_id, symbol, side, qty, order_type, limit_price, stop_price, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.approval_id ?? null,
      params.alpaca_order_id,
      params.symbol,
      params.side,
      params.qty ?? params.notional ?? 0,
      params.order_type,
      params.limit_price ?? null,
      params.stop_price ?? null,
      params.status,
      now,
      now,
    ]
  );

  return id;
}


