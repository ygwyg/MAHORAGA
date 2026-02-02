import { Panel } from './Panel'
import { Metric, MetricInline } from './Metric'
import { formatCurrency, formatPercent } from '../utils/formatters'
import type { Account } from '../types'

interface AccountPanelProps {
  account: Account | null
  totalPl: number
  totalPlPct: number
  realizedPl: number
  unrealizedPl: number
}

export function AccountPanel({ account, totalPl, totalPlPct, realizedPl, unrealizedPl }: AccountPanelProps) {
  return (
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
  )
}
