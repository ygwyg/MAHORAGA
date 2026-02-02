import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Panel } from './components/Panel'
import { Metric, MetricInline } from './components/Metric'
import { StatusIndicator, StatusBar } from './components/StatusIndicator'
import { SettingsModal } from './components/SettingsModal'
import { SetupWizard } from './components/SetupWizard'
import { NotificationBell } from './components/NotificationBell'
import { AccountPanel } from './components/AccountPanel'
import { PositionsTable } from './components/PositionsTable'
import { SignalsPanel } from './components/SignalsPanel'
import { ActivityFeed } from './components/ActivityFeed'
import { useAgentStatus } from './hooks/useAgentStatus'

export default function App() {
  const {
    status,
    error,
    showSetup,
    setShowSetup,
    portfolioHistory,
    saveConfig,
  } = useAgentStatus()

  const [showSettings, setShowSettings] = useState(false)
  const [time, setTime] = useState(new Date())

  // Clock tick
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Derived state
  const account = status?.account
  const positions = status?.positions || []
  const signals = status?.signals || []
  const logs = status?.logs || []
  const costs = status?.costs || { total_usd: 0, calls: 0, tokens_in: 0, tokens_out: 0 }
  const config = status?.config
  const isMarketOpen = status?.clock?.is_open ?? false

  const startingEquity = config?.starting_equity || 100000
  const unrealizedPl = positions.reduce((sum, p) => sum + p.unrealized_pl, 0)
  const totalPl = account ? account.equity - startingEquity : 0
  const realizedPl = totalPl - unrealizedPl
  const totalPlPct = account ? (totalPl / startingEquity) * 100 : 0

  // Early returns (after all hooks)
  if (showSetup) {
    return <SetupWizard onComplete={() => setShowSetup(false)} />
  }

  if (error && !status) {
    const isAuthError = error.includes('Unauthorized')
    return (
      <div className="min-h-screen bg-hud-bg flex items-center justify-center p-6">
        <Panel title={isAuthError ? "AUTHENTICATION REQUIRED" : "CONNECTION ERROR"} className="max-w-md w-full">
          <div className="text-center py-8">
            <div className="text-hud-error text-2xl mb-4">{isAuthError ? "NO TOKEN" : "OFFLINE"}</div>
            <p className="text-hud-text-dim text-sm mb-6">{error}</p>
            {isAuthError ? (
              <div className="space-y-4">
                <div className="text-left bg-hud-panel p-4 border border-hud-line">
                  <label className="hud-label block mb-2">API Token</label>
                  <input
                    type="password"
                    className="hud-input w-full mb-2"
                    placeholder="Enter MAHORAGA_API_TOKEN"
                    defaultValue={localStorage.getItem('mahoraga_api_token') || ''}
                    onChange={(e) => localStorage.setItem('mahoraga_api_token', e.target.value)}
                  />
                  <button
                    onClick={() => window.location.reload()}
                    className="hud-button w-full"
                  >
                    Save & Reload
                  </button>
                </div>
                <p className="text-hud-text-dim text-xs">
                  Find your token in <code className="text-hud-primary">.dev.vars</code> (local) or Cloudflare secrets (deployed)
                </p>
              </div>
            ) : (
              <p className="text-hud-text-dim text-xs">
                Enable the agent: <code className="text-hud-primary">curl -H "Authorization: Bearer $TOKEN" localhost:8787/agent/enable</code>
              </p>
            )}
          </div>
        </Panel>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-hud-bg">
      <div className="max-w-[1920px] mx-auto p-4">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 pb-3 border-b border-hud-line">
          <div className="flex items-center gap-4 md:gap-6">
            <div className="flex items-baseline gap-2">
              <span className="text-xl md:text-2xl font-light tracking-tight text-hud-text-bright">
                MAHORAGA
              </span>
              <span className="hud-label">v2</span>
            </div>
            <StatusIndicator
              status={isMarketOpen ? 'active' : 'inactive'}
              label={isMarketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
              pulse={isMarketOpen}
            />
          </div>
          <div className="flex items-center gap-3 md:gap-6 flex-wrap">
            <StatusBar
              items={[
                { label: 'LLM COST', value: `$${costs.total_usd.toFixed(4)}`, status: costs.total_usd > 1 ? 'warning' : 'active' },
                { label: 'API CALLS', value: costs.calls.toString() },
              ]}
            />
            <NotificationBell
              overnightActivity={status?.overnightActivity}
              premarketPlan={status?.premarketPlan}
            />
            <button
              className="hud-label hover:text-hud-primary transition-colors"
              onClick={() => setShowSettings(true)}
            >
              [CONFIG]
            </button>
            <span className="hud-value-sm font-mono">
              {time.toLocaleTimeString('en-US', { hour12: false })}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12 gap-4">
          {/* Row 1: Account + Positions + LLM Costs */}
          <AccountPanel
            account={account ?? null}
            config={config}
            totalPl={totalPl}
            totalPlPct={totalPlPct}
            realizedPl={realizedPl}
            unrealizedPl={unrealizedPl}
            portfolioHistory={portfolioHistory}
          />

          <PositionsTable
            positions={positions}
            config={config}
            status={status}
          />

          <div className="col-span-4 md:col-span-8 lg:col-span-4">
            <Panel title="LLM COSTS" className="h-full">
              <div className="grid grid-cols-2 gap-4">
                <Metric label="TOTAL SPENT" value={`$${costs.total_usd.toFixed(4)}`} size="lg" />
                <Metric label="API CALLS" value={costs.calls.toString()} size="lg" />
                <MetricInline label="TOKENS IN" value={costs.tokens_in.toLocaleString()} />
                <MetricInline label="TOKENS OUT" value={costs.tokens_out.toLocaleString()} />
                <MetricInline
                  label="AVG COST/CALL"
                  value={costs.calls > 0 ? `$${(costs.total_usd / costs.calls).toFixed(6)}` : '$0'}
                />
                <MetricInline label="MODEL" value={config?.llm_model || 'gpt-4o-mini'} />
              </div>
            </Panel>
          </div>

          {/* Row 2: Portfolio chart is in AccountPanel */}
          {/* Row 2: Position chart is in PositionsTable */}

          {/* Row 3: Signals, Activity, Research */}
          <SignalsPanel
            signals={signals}
            signalResearch={status?.signalResearch || {}}
          />

          <ActivityFeed logs={logs} />
        </div>

        <footer className="mt-4 pt-3 border-t border-hud-line flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex flex-wrap gap-4 md:gap-6">
            {config && (
              <>
                <MetricInline label="MAX POS" value={`$${config.max_position_value}`} />
                <MetricInline label="MIN SENT" value={`${(config.min_sentiment_score * 100).toFixed(0)}%`} />
                <MetricInline label="TAKE PROFIT" value={`${config.take_profit_pct}%`} />
                <MetricInline label="STOP LOSS" value={`${config.stop_loss_pct}%`} />
                <span className="hidden lg:inline text-hud-line">|</span>
                <MetricInline
                  label="OPTIONS"
                  value={config.options_enabled ? 'ON' : 'OFF'}
                  valueClassName={config.options_enabled ? 'text-hud-purple' : 'text-hud-text-dim'}
                />
                {config.options_enabled && (
                  <>
                    <MetricInline label="OPT Δ" value={config.options_target_delta?.toFixed(2) || '0.35'} />
                    <MetricInline label="OPT DTE" value={`${config.options_min_dte || 7}-${config.options_max_dte || 45}`} />
                  </>
                )}
                <span className="hidden lg:inline text-hud-line">|</span>
                <MetricInline
                  label="CRYPTO"
                  value={config.crypto_enabled ? '24/7' : 'OFF'}
                  valueClassName={config.crypto_enabled ? 'text-hud-warning' : 'text-hud-text-dim'}
                />
                {config.crypto_enabled && (
                  <MetricInline label="SYMBOLS" value={(config.crypto_symbols || ['BTC', 'ETH', 'SOL']).map(s => s.split('/')[0]).join('/')} />
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="hud-label hidden md:inline">AUTONOMOUS TRADING SYSTEM</span>
            <span className="hud-value-sm">PAPER MODE</span>
          </div>
        </footer>
      </div>

      <AnimatePresence>
        {showSettings && config && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <SettingsModal
              config={config}
              onSave={saveConfig}
              onClose={() => setShowSettings(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
