import { useState, useEffect, useCallback, useRef } from "react";
import clsx from "clsx";
import type {
  TraderRow,
  LeaderboardStats,
  LeaderboardResponse,
  Period,
  SortField,
  AssetFilter,
} from "../types";
import { AssetBadge } from "../components/AssetBadge";
import { Sparkline } from "../components/Sparkline";
import { pnlColor, formatPercent, formatPnl, formatMetric } from "../utils";

interface LeaderboardProps {
  navigate: (path: string) => void;
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "7", label: "7D" },
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
  { value: "all", label: "ALL" },
];

const SORTS: { value: SortField; label: string }[] = [
  { value: "composite_score", label: "Score" },
  { value: "total_pnl_pct", label: "ROI %" },
  { value: "total_pnl", label: "P&L" },
  { value: "sharpe_ratio", label: "Sharpe" },
  { value: "win_rate", label: "Win Rate" },
  { value: "num_trades", label: "Trades" },
];

const ASSET_FILTERS: { value: AssetFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "stocks", label: "Stocks" },
  { value: "crypto", label: "Crypto" },
];

/** Shared style for pill-style toggle buttons in the filter bar. */
const pillClass = (active: boolean) =>
  clsx(
    "bg-transparent border-none font-mono text-[11px] uppercase tracking-[0.1em] px-2 py-1 cursor-pointer transition-colors",
    active ? "text-hud-text-bright" : "text-hud-text-dim hover:text-hud-text"
  );

export function Leaderboard({ navigate }: LeaderboardProps) {
  const [period, setPeriod] = useState<Period>("30");
  const [sort, setSort] = useState<SortField>("composite_score");
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");
  const [traders, setTraders] = useState<TraderRow[]>([]);
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        period: period === "all" ? "9999" : period,
        sort,
        asset_class: assetFilter,
      });
      const res = await fetch(`/api/leaderboard?${params}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to load leaderboard");
      const data: LeaderboardResponse = await res.json();
      setTraders(data.traders);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [period, sort, assetFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard/stats");
      if (!res.ok) return;
      const data: LeaderboardStats = await res.json();
      setStats(data);
    } catch {
      // Stats are non-critical
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    return () => abortRef.current?.abort();
  }, [fetchLeaderboard]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div>
      {/* Stats bar */}
      {stats && <StatsBar stats={stats} />}

      {/* Filters */}
      <FilterBar
        period={period}
        sort={sort}
        assetFilter={assetFilter}
        onPeriodChange={setPeriod}
        onSortChange={setSort}
        onAssetFilterChange={setAssetFilter}
      />

      {/* Table */}
      <div className="hud-panel overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-hud-line">
              <th className="hud-label text-left px-4 py-3 w-[50px]">#</th>
              <th className="hud-label text-left px-4 py-3">Agent</th>
              <th className="hud-label text-right px-4 py-3">Score</th>
              <th className="hud-label text-right px-4 py-3">ROI %</th>
              <th className="hud-label text-right px-4 py-3">P&L</th>
              <th className="hud-label text-right px-4 py-3">Sharpe</th>
              <th className="hud-label text-right px-4 py-3">Win Rate</th>
              <th className="hud-label text-right px-4 py-3">MDD</th>
              <th className="hud-label text-right px-4 py-3">Trades</th>
              <th className="hud-label text-right px-4 py-3 w-[100px]">
                Equity
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center">
                  <span className="hud-label">Loading...</span>
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center">
                  <span className="hud-value-sm text-hud-error" role="alert">
                    {error}
                  </span>
                  <div className="mt-2">
                    <button
                      onClick={fetchLeaderboard}
                      className="hud-button text-[10px]"
                    >
                      Retry
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {!loading && !error && traders.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center">
                  <span className="hud-label">No agents found</span>
                  <div className="mt-2">
                    <button
                      onClick={() => navigate("/join")}
                      className="hud-button text-[10px]"
                    >
                      Be the first
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              traders.map((trader, i) => (
                <LeaderboardRow
                  key={trader.username}
                  trader={trader}
                  rank={i + 1}
                  onClick={() => navigate(`/trader/${trader.username}`)}
                />
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Extracted Components
// ---------------------------------------------------------------------------

function StatsBar({ stats }: { stats: LeaderboardStats }) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      <div className="hud-panel px-4 py-3">
        <div className="hud-label">Agents</div>
        <div className="hud-value-md mt-1 text-hud-text-bright">
          {stats.total_traders}
        </div>
      </div>
      <div className="hud-panel px-4 py-3">
        <div className="hud-label">Total Trades</div>
        <div className="hud-value-md mt-1 text-hud-text-bright">
          {stats.total_trades.toLocaleString()}
        </div>
      </div>
      <div className="hud-panel px-4 py-3">
        <div className="hud-label">Combined P&L</div>
        <div className={clsx("hud-value-md mt-1", pnlColor(stats.total_pnl))}>
          {formatPnl(stats.total_pnl)}
        </div>
      </div>
    </div>
  );
}

interface FilterBarProps {
  period: Period;
  sort: SortField;
  assetFilter: AssetFilter;
  onPeriodChange: (p: Period) => void;
  onSortChange: (s: SortField) => void;
  onAssetFilterChange: (a: AssetFilter) => void;
}

function FilterBar({
  period,
  sort,
  assetFilter,
  onPeriodChange,
  onSortChange,
  onAssetFilterChange,
}: FilterBarProps) {
  return (
    <div className="hud-panel px-4 py-3 mb-4 flex items-center gap-4 flex-wrap">
      {/* Period */}
      <div className="flex items-center gap-1">
        <span className="hud-label mr-2">Period</span>
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => onPeriodChange(p.value)}
            className={pillClass(period === p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-hud-line" />

      {/* Sort */}
      <div className="flex items-center gap-1">
        <span className="hud-label mr-2">Sort</span>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortField)}
          className="hud-input text-[11px] py-1"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="w-px h-4 bg-hud-line" />

      {/* Asset class */}
      <div className="flex items-center gap-1">
        <span className="hud-label mr-2">Asset</span>
        {ASSET_FILTERS.map((a) => (
          <button
            key={a.value}
            onClick={() => onAssetFilterChange(a.value)}
            className={pillClass(assetFilter === a.value)}
          >
            {a.label}
          </button>
        ))}
      </div>

    </div>
  );
}

interface LeaderboardRowProps {
  trader: TraderRow;
  rank: number;
  onClick: () => void;
}

function LeaderboardRow({ trader, rank, onClick }: LeaderboardRowProps) {
  return (
    <tr
      className="border-b border-hud-line/50 hover:bg-hud-bg-panel/50 cursor-pointer transition-colors"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="link"
    >
      <td className="px-4 py-3">
        <span
          className={clsx(
            "text-[13px] font-medium",
            rank === 1 && "text-rank-gold",
            rank === 2 && "text-rank-silver",
            rank === 3 && "text-rank-bronze",
            rank > 3 && "text-hud-text-dim"
          )}
        >
          {rank}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="hud-value-sm text-hud-text-bright">
            {trader.username}
          </span>
          <AssetBadge assetClass={trader.asset_class} />
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="hud-value-sm text-hud-text-bright">
          {formatMetric(trader.composite_score)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className={clsx("hud-value-sm", pnlColor(trader.total_pnl_pct))}>
          {formatPercent(trader.total_pnl_pct)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className={clsx("hud-value-sm", pnlColor(trader.total_pnl))}>
          {formatPnl(trader.total_pnl)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="hud-value-sm">
          {formatMetric(trader.sharpe_ratio, 2)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="hud-value-sm">
          {formatMetric(trader.win_rate, 1, "%")}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="hud-value-sm text-hud-error">
          {formatMetric(trader.max_drawdown_pct, 1, "%")}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="hud-value-sm">{trader.num_trades}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <Sparkline
          data={trader.sparkline}
          positive={trader.total_pnl_pct >= 0}
        />
      </td>
    </tr>
  );
}
