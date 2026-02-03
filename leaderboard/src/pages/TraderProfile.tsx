import { useState, useEffect, useRef } from "react";
import type { TraderProfile as TraderProfileType, Trade, EquityPoint } from "../types";
import { MetricCard } from "../components/MetricCard";
import { AssetBadge } from "../components/AssetBadge";
import { Sparkline } from "../components/Sparkline";
import { formatPercent, formatPnl, formatCurrency, formatMetric } from "../utils";
import clsx from "clsx";

interface TraderProfileProps {
  username: string;
  navigate: (path: string) => void;
}

export function TraderProfile({ username, navigate }: TraderProfileProps) {
  const [profile, setProfile] = useState<TraderProfileType | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [equity, setEquity] = useState<EquityPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justRegistered, setJustRegistered] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Detect ?registered=true from registration OAuth callback redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get("registered") === "true") {
      setJustRegistered(true);
      // Clean the URL without triggering navigation
      window.history.replaceState(null, "", `/trader/${username}`);
    }

    // Scroll to top on navigation
    window.scrollTo(0, 0);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/trader/${username}`, { signal: controller.signal }).then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Agent not found" : "Failed to load profile");
        return r.json() as Promise<TraderProfileType>;
      }),
      fetch(`/api/trader/${username}/trades?limit=50`, { signal: controller.signal }).then((r) => {
        if (!r.ok) return { trades: [] };
        return r.json() as Promise<{ trades: Trade[] }>;
      }),
      fetch(`/api/trader/${username}/equity?days=90`, { signal: controller.signal }).then((r) => {
        if (!r.ok) return { equity: [] };
        return r.json() as Promise<{ equity: EquityPoint[] }>;
      }),
    ])
      .then(([profileData, tradesData, equityData]) => {
        setProfile(profileData);
        setTrades(tradesData.trades);
        setEquity(equityData.equity);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [username]);

  if (loading) {
    return (
      <div className="text-center py-20">
        <span className="hud-label">Loading...</span>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="text-center py-20">
        <div className="hud-value-md text-hud-text-dim" role="alert">
          {error || "Agent not found"}
        </div>
        <button onClick={() => navigate("/")} className="hud-button mt-4">
          Back to Leaderboard
        </button>
      </div>
    );
  }

  const { trader, snapshot } = profile;
  const equityCurve = equity.map((e) => e.equity);

  return (
    <div>
      {/* Back link */}
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          navigate("/");
        }}
        className="text-[11px] text-hud-text-dim hover:text-hud-text uppercase tracking-[0.1em] mb-4 inline-block"
      >
        &larr; Leaderboard
      </a>

      {/* Header */}
      <div className="hud-panel p-6 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="hud-value-lg">{trader.username}</span>
              <AssetBadge assetClass={trader.asset_class} />
            </div>
            <div className="flex items-center gap-4 mt-3">
              <span className="hud-label">
                Joined{" "}
                {new Date(trader.joined_at).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
              {trader.last_synced_at && (
                <span className="hud-label">
                  Last sync{" "}
                  {new Date(trader.last_synced_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <a
            href={trader.github_repo}
            target="_blank"
            rel="noopener noreferrer"
            className="hud-button text-[10px]"
          >
            View Code
          </a>
        </div>
      </div>

      {/* Registration success banner */}
      {justRegistered && (
        <div className="hud-panel p-4 mb-4 border-hud-success/30 bg-hud-success/5">
          <span className="hud-value-sm text-hud-success">
            Registered and connected. Your first sync is in progress — data
            will appear shortly.
          </span>
        </div>
      )}

      {/* Equity curve */}
      {equityCurve.length > 1 && (
        <div className="hud-panel p-4 mb-4">
          <div className="hud-label mb-2">Equity Curve (90D)</div>
          <div className="w-full overflow-hidden">
            <Sparkline
              data={equityCurve}
              width="100%"
              height={80}
              positive={snapshot ? snapshot.total_pnl_pct >= 0 : true}
            />
          </div>
        </div>
      )}

      {/* Metrics grid */}
      {snapshot && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricCard
              label="ROI"
              value={formatPercent(snapshot.total_pnl_pct, 2)}
              positive={snapshot.total_pnl_pct >= 0}
            />
            <MetricCard
              label="Total P&L"
              value={formatPnl(snapshot.total_pnl)}
              sub={`on ${formatCurrency(snapshot.total_deposits)} starting capital`}
              positive={snapshot.total_pnl >= 0}
            />
            <MetricCard
              label="Sharpe Ratio"
              value={formatMetric(snapshot.sharpe_ratio, 2)}
            />
            <MetricCard
              label="Composite Score"
              value={formatMetric(snapshot.composite_score)}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricCard
              label="Win Rate"
              value={formatMetric(snapshot.win_rate, 1, "%")}
              sub={snapshot.win_rate !== null ? `${snapshot.num_winning_trades} winning days` : undefined}
            />
            <MetricCard
              label="Max Drawdown"
              value={formatMetric(snapshot.max_drawdown_pct, 1, "%")}
              positive={false}
            />
            <MetricCard
              label="Today"
              value={formatPnl(snapshot.day_pnl)}
              positive={snapshot.day_pnl >= 0}
            />
            <MetricCard
              label="Open Positions"
              value={String(snapshot.open_positions)}
            />
          </div>

          {/* Equity breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <MetricCard
              label="Equity"
              value={formatCurrency(snapshot.equity)}
            />
            <MetricCard
              label="Unrealized P&L"
              value={formatPnl(snapshot.unrealized_pnl)}
              positive={snapshot.unrealized_pnl >= 0}
            />
            <MetricCard
              label="Realized P&L"
              value={formatPnl(snapshot.realized_pnl)}
              positive={snapshot.realized_pnl >= 0}
            />
          </div>
        </>
      )}

      {!snapshot && (
        <div className="hud-panel p-6 mb-4 text-center">
          <span className="hud-label">
            No performance data yet. Data will appear after the next sync cycle.
          </span>
        </div>
      )}

      {/* Trade history */}
      <TradeHistoryTable trades={trades} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Extracted Component
// ---------------------------------------------------------------------------

function TradeHistoryTable({ trades }: { trades: Trade[] }) {
  return (
    <div className="hud-panel">
      <div className="px-4 py-3 border-b border-hud-line">
        <span className="hud-label">Recent Trades</span>
      </div>
      {trades.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <span className="hud-label">No trades recorded yet</span>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-hud-line">
              <th className="hud-label text-left px-4 py-2">Symbol</th>
              <th className="hud-label text-left px-4 py-2">Side</th>
              <th className="hud-label text-right px-4 py-2">Qty</th>
              <th className="hud-label text-right px-4 py-2">Price</th>
              <th className="hud-label text-right px-4 py-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, i) => (
              <tr key={i} className="border-b border-hud-line/50">
                <td className="px-4 py-2">
                  <span className="hud-value-sm text-hud-text-bright">
                    {trade.symbol}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={clsx(
                      "hud-value-sm uppercase",
                      trade.side === "buy"
                        ? "text-hud-success"
                        : "text-hud-error"
                    )}
                  >
                    {trade.side}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="hud-value-sm">{trade.qty}</span>
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="hud-value-sm">
                    {formatCurrency(trade.price, 2)}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="hud-value-sm text-hud-text-dim">
                    {new Date(trade.filled_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
