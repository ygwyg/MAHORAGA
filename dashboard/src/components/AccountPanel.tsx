import { useMemo } from 'react'
import { Panel } from './Panel'
import { Metric, MetricInline } from './Metric'
import { LineChart } from './LineChart'
import { formatCurrency, formatPercent } from '../utils/formatters'
import type { Account, Config, PortfolioSnapshot } from '../types'

interface AccountPanelProps {
  account: Account | null
  config: Config | undefined
  totalPl: number
  totalPlPct: number
  realizedPl: number
  unrealizedPl: number
  portfolioHistory: PortfolioSnapshot[]
}

export function AccountPanel({ account, totalPl, totalPlPct, realizedPl, unrealizedPl, portfolioHistory }: AccountPanelProps) {
  const portfolioChartData = useMemo(() => {
    return portfolioHistory.map(s => s.equity)
  }, [portfolioHistory])

  const portfolioChartLabels = useMemo(() => {
    return portfolioHistory.map(s =>
      new Date(s.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    )
  }, [portfolioHistory])

  return (
    <>
      <div className="col-span-4 md:col-span-4 lg:col-span-3">
        <Panel title="ACCOUNT" className="h-full">
          {account ? (
            <div className="space-y-4">
              <Metric label="EQUITY" value={formatCurrency(account.equity)} size="xl" />
              <div className="grid grid-cols-2 gap-4">
                <Metric label="CASH" value={formatCurrency(account.cash)} size="md" />
                <Metric label="BUYING POWER" value={formatCurrency(account.buying_power)} size="md" />
              </div>
              <div className="pt-2 border-t border-hud-line space-y-2">
                <Metric
                  label="TOTAL P&L"
                  value={`${formatCurrency(totalPl)} (${formatPercent(totalPlPct)})`}
                  size="md"
                  color={totalPl >= 0 ? 'success' : 'error'}
                />
                <div className="grid grid-cols-2 gap-2">
                  <MetricInline
                    label="REALIZED"
                    value={formatCurrency(realizedPl)}
                    color={realizedPl >= 0 ? 'success' : 'error'}
                  />
                  <MetricInline
                    label="UNREALIZED"
                    value={formatCurrency(unrealizedPl)}
                    color={unrealizedPl >= 0 ? 'success' : 'error'}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="text-hud-text-dim text-sm">Loading...</div>
          )}
        </Panel>
      </div>

      <div className="col-span-4 md:col-span-8 lg:col-span-8">
        <Panel title="PORTFOLIO PERFORMANCE" titleRight="24H" className="h-[320px]">
          {portfolioChartData.length > 1 ? (
            <div className="h-full w-full">
              <LineChart
                series={[{ label: 'Equity', data: portfolioChartData, variant: totalPl >= 0 ? 'green' : 'red' }]}
                labels={portfolioChartLabels}
                showArea={true}
                showGrid={true}
                showDots={false}
                formatValue={(v) => `$${(v / 1000).toFixed(1)}k`}
              />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-hud-text-dim text-sm">
              Collecting performance data...
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
