import { useMemo } from 'react'
import { motion } from 'motion/react'
import clsx from 'clsx'
import { Panel } from './Panel'
import { Sparkline } from './LineChart'
import { Tooltip, TooltipContent } from './Tooltip'
import { formatCurrency, formatPercent, isCryptoSymbol } from '../utils/formatters'
import type { Position, Config, Status } from '../types'

function generateMockPriceHistory(currentPrice: number, unrealizedPl: number, points: number = 20): number[] {
  const prices: number[] = []
  const isPositive = unrealizedPl >= 0
  const startPrice = currentPrice * (isPositive ? 0.95 : 1.05)

  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1)
    const trend = startPrice + (currentPrice - startPrice) * progress
    const noise = trend * (Math.random() - 0.5) * 0.02
    prices.push(trend + noise)
  }
  prices[prices.length - 1] = currentPrice
  return prices
}

interface PositionsTableProps {
  positions: Position[]
  config: Config | undefined
  status: Status | null
}

export function PositionsTable({ positions, config, status }: PositionsTableProps) {
  const positionPriceHistories = useMemo(() => {
    const histories: Record<string, number[]> = {}
    positions.forEach(pos => {
      histories[pos.symbol] = generateMockPriceHistory(pos.current_price, pos.unrealized_pl)
    })
    return histories
  }, [positions.map(p => p.symbol).join(',')])

  return (
    <div className="col-span-4 md:col-span-4 lg:col-span-5">
      <Panel title="POSITIONS" titleRight={`${positions.length}/${config?.max_positions || 5}`} className="h-full">
        {positions.length === 0 ? (
          <div className="text-hud-text-dim text-sm py-8 text-center">No open positions</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hud-line/50">
                  <th className="hud-label text-left py-2 px-2">Symbol</th>
                  <th className="hud-label text-right py-2 px-2 hidden sm:table-cell">Qty</th>
                  <th className="hud-label text-right py-2 px-2 hidden md:table-cell">Value</th>
                  <th className="hud-label text-right py-2 px-2">P&L</th>
                  <th className="hud-label text-center py-2 px-2">Trend</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos: Position) => {
                  const plPct = (pos.unrealized_pl / (pos.market_value - pos.unrealized_pl)) * 100
                  const priceHistory = positionPriceHistories[pos.symbol] || []
                  const posEntry = status?.positionEntries?.[pos.symbol]
                  const staleness = status?.stalenessAnalysis?.[pos.symbol]
                  const holdTime = posEntry ? Math.floor((Date.now() - posEntry.entry_time) / 3600000) : null

                  return (
                    <motion.tr
                      key={pos.symbol}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b border-hud-line/20 hover:bg-hud-line/10"
                    >
                      <td className="hud-value-sm py-2 px-2">
                        <Tooltip
                          position="right"
                          content={
                            <TooltipContent
                              title={pos.symbol}
                              items={[
                                { label: 'Entry Price', value: posEntry ? formatCurrency(posEntry.entry_price) : 'N/A' },
                                { label: 'Current Price', value: formatCurrency(pos.current_price) },
                                { label: 'Hold Time', value: holdTime !== null ? `${holdTime}h` : 'N/A' },
                                { label: 'Entry Sentiment', value: posEntry ? `${(posEntry.entry_sentiment * 100).toFixed(0)}%` : 'N/A' },
                                ...(staleness ? [{
                                  label: 'Staleness',
                                  value: `${(staleness.score * 100).toFixed(0)}%`,
                                  color: staleness.shouldExit ? 'text-hud-error' : 'text-hud-text'
                                }] : []),
                              ]}
                              description={posEntry?.entry_reason}
                            />
                          }
                        >
                          <span className="cursor-help border-b border-dotted border-hud-text-dim">
                            {isCryptoSymbol(pos.symbol, config?.crypto_symbols) && (
                              <span className="text-hud-warning mr-1">&#8383;</span>
                            )}
                            {pos.symbol}
                          </span>
                        </Tooltip>
                      </td>
                      <td className="hud-value-sm text-right py-2 px-2 hidden sm:table-cell">{pos.qty}</td>
                      <td className="hud-value-sm text-right py-2 px-2 hidden md:table-cell">{formatCurrency(pos.market_value)}</td>
                      <td className={clsx(
                        'hud-value-sm text-right py-2 px-2',
                        pos.unrealized_pl >= 0 ? 'text-hud-success' : 'text-hud-error'
                      )}>
                        <div>{formatCurrency(pos.unrealized_pl)}</div>
                        <div className="text-xs opacity-70">{formatPercent(plPct)}</div>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex justify-center">
                          <Sparkline data={priceHistory} width={60} height={20} />
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
