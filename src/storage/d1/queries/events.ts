import { D1Client, StructuredEventRow } from "../client";
import { generateId, nowISO } from "../../../lib/utils";

export async function insertRawEvent(
  db: D1Client,
  params: {
    source: string;
    source_id: string;
    raw_content: string;
    r2_key?: string;
  }
): Promise<string> {
  const id = generateId();

  await db.run(
    `INSERT OR IGNORE INTO raw_events (id, source, source_id, raw_content, r2_key, ingested_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.source,
      params.source_id,
      params.raw_content,
      params.r2_key ?? null,
      nowISO(),
    ]
  );

  return id;
}

export async function rawEventExists(
  db: D1Client,
  source: string,
  sourceId: string
): Promise<boolean> {
  const row = await db.executeOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM raw_events WHERE source = ? AND source_id = ?`,
    [source, sourceId]
  );
  return (row?.cnt ?? 0) > 0;
}

export async function insertStructuredEvent(
  db: D1Client,
  params: {
    raw_event_id?: string;
    event_type: string;
    symbols: string[];
    summary: string;
    confidence: number;
    validated?: boolean;
    validation_errors?: string[];
  }
): Promise<string> {
  const id = generateId();

  await db.run(
    `INSERT INTO structured_events (id, raw_event_id, event_type, symbols, summary, confidence, validated, validation_errors, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.raw_event_id ?? null,
      params.event_type,
      params.symbols.join(","),
      params.summary,
      params.confidence,
      params.validated ? 1 : 0,
      params.validation_errors ? JSON.stringify(params.validation_errors) : null,
      nowISO(),
    ]
  );

  return id;
}

export async function queryStructuredEvents(
  db: D1Client,
  params: {
    event_type?: string;
    symbol?: string;
    validated?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<StructuredEventRow[]> {
  const { event_type, symbol, validated, limit = 50, offset = 0 } = params;
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (event_type) {
    conditions.push("event_type = ?");
    values.push(event_type);
  }
  if (symbol) {
    conditions.push("symbols LIKE ?");
    values.push(`%${symbol.toUpperCase()}%`);
  }
  if (validated !== undefined) {
    conditions.push("validated = ?");
    values.push(validated ? 1 : 0);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(limit, offset);

  return db.execute<StructuredEventRow>(
    `SELECT * FROM structured_events ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    values
  );
}

interface NewsItemRow {
  id: string;
  source: string;
  source_id: string;
  headline: string;
  summary: string | null;
  url: string | null;
  symbols: string;
  r2_key: string | null;
  published_at: string | null;
  created_at: string;
}

export async function insertNewsItem(
  db: D1Client,
  params: {
    source: string;
    source_id: string;
    headline: string;
    summary?: string;
    url?: string;
    symbols: string[];
    r2_key?: string;
    published_at?: string;
  }
): Promise<string> {
  const id = generateId();

  await db.run(
    `INSERT OR IGNORE INTO news_items (id, source, source_id, headline, summary, url, symbols, r2_key, published_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.source,
      params.source_id,
      params.headline,
      params.summary ?? null,
      params.url ?? null,
      params.symbols.join(","),
      params.r2_key ?? null,
      params.published_at ?? null,
      nowISO(),
    ]
  );

  return id;
}

export async function queryNewsItems(
  db: D1Client,
  params: {
    symbol?: string;
    source?: string;
    limit?: number;
    offset?: number;
  }
): Promise<NewsItemRow[]> {
  const { symbol, source, limit = 50, offset = 0 } = params;
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (symbol) {
    conditions.push("symbols LIKE ?");
    values.push(`%${symbol.toUpperCase()}%`);
  }
  if (source) {
    conditions.push("source = ?");
    values.push(source);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(limit, offset);

  return db.execute<NewsItemRow>(
    `SELECT * FROM news_items ${whereClause} ORDER BY COALESCE(published_at, created_at) DESC LIMIT ? OFFSET ?`,
    values
  );
}


