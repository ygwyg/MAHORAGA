import { createError, ErrorCode } from "../lib/errors";

const ALLOWED_DOMAINS = ["finance.yahoo.com", "www.sec.gov", "stockanalysis.com", "companiesmarketcap.com"];

const MAX_CONTENT_SIZE = 500_000;
const TIMEOUT_MS = 10_000;

export interface ScrapeResult {
  url: string;
  domain: string;
  title: string;
  text: string;
  timestamp: string;
  truncated: boolean;
}

export function isAllowedDomain(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_DOMAINS.some((d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  if (!isAllowedDomain(url)) {
    throw createError(ErrorCode.FORBIDDEN, `Domain not allowed. Allowed domains: ${ALLOWED_DOMAINS.join(", ")}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Mahoraga/1.0; +https://example.com/bot)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw createError(ErrorCode.PROVIDER_ERROR, `Failed to fetch ${url}: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw createError(ErrorCode.INVALID_INPUT, `Invalid content type: ${contentType}. Only HTML/text allowed.`);
    }

    let html = await response.text();
    let truncated = false;

    if (html.length > MAX_CONTENT_SIZE) {
      html = html.slice(0, MAX_CONTENT_SIZE);
      truncated = true;
    }

    const parsed = new URL(url);
    const title = extractTitle(html);
    const text = extractText(html);

    return {
      url,
      domain: parsed.hostname,
      title,
      text: text.slice(0, 50000),
      timestamp: new Date().toISOString(),
      truncated,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw createError(ErrorCode.PROVIDER_ERROR, `Request timed out after ${TIMEOUT_MS}ms`);
    }

    throw error;
  }
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? decodeHtmlEntities(match[1] ?? "").trim() : "";
}

function extractText(html: string): string {
  let text = html;

  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ");
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ");
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");

  text = text.replace(/<[^>]+>/g, " ");
  text = decodeHtmlEntities(text);
  text = text.replace(/\s+/g, " ");
  text = text.trim();

  return text;
}

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&mdash;": "—",
    "&ndash;": "–",
    "&hellip;": "…",
    "&copy;": "©",
    "&reg;": "®",
    "&trade;": "™",
  };

  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.split(entity).join(char);
  }

  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));

  result = result.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

  return result;
}

export function extractFinancialData(
  text: string,
  symbol: string
): {
  mentions: number;
  priceReferences: string[];
  percentChanges: string[];
  keyPhrases: string[];
} {
  const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const symbolRegex = new RegExp(`\\b${escapedSymbol}\\b`, "gi");
  const mentions = (text.match(symbolRegex) || []).length;

  const priceRegex = /\$[\d,]+\.?\d*/g;
  const priceReferences = (text.match(priceRegex) || []).slice(0, 10);

  const percentRegex = /[-+]?\d+\.?\d*%/g;
  const percentChanges = (text.match(percentRegex) || []).slice(0, 10);

  const keyPhrasePatterns = [
    /earnings (beat|miss|surprise)/gi,
    /revenue (growth|decline|increase|decrease)/gi,
    /guidance (raised|lowered|cut|increased)/gi,
    /upgraded? to \w+/gi,
    /downgraded? to \w+/gi,
    /price target \$[\d,]+/gi,
    /market cap/gi,
    /pe ratio/gi,
  ];

  const keyPhrases: string[] = [];
  for (const pattern of keyPhrasePatterns) {
    const matches = text.match(pattern) || [];
    keyPhrases.push(...matches.slice(0, 3));
  }

  return {
    mentions,
    priceReferences,
    percentChanges,
    keyPhrases: [...new Set(keyPhrases)].slice(0, 10),
  };
}
