/**
 * Shared formatting utilities for the leaderboard frontend.
 */

/** Returns Tailwind color class for P&L values. */
export function pnlColor(value: number): string {
  return value >= 0 ? "text-hud-success" : "text-hud-error";
}

/** Format a number as a signed percentage string (e.g. "+12.3%" or "-5.1%"). */
export function formatPercent(value: number, decimals = 1): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

/** Format a number as a signed dollar string (e.g. "+$1,234" or "-$567"). */
export function formatPnl(value: number, decimals = 0): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: decimals })}`;
}

/** Format a number as a dollar string (e.g. "$1,234" or "-$567"). */
export function formatCurrency(value: number, decimals = 0): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString(undefined, { maximumFractionDigits: decimals });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

/** Format a number or null with a fixed decimal, falling back to "--". */
export function formatMetric(value: number | null | undefined, decimals = 1, suffix = ""): string {
  if (value === null || value === undefined) return "--";
  return `${value.toFixed(decimals)}${suffix}`;
}
