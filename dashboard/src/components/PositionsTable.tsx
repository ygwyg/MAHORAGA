import { useMemo } from 'react'
import { motion } from 'motion/react'
import clsx from 'clsx'
import { Panel } from './Panel'
import { Sparkline, LineChart } from './LineChart'
import { Tooltip, TooltipContent } from './Tooltip'
import { formatCurrency, formatPercent, isCryptoSymbol } from '../utils/formatters'
import type { Position, Config, Status } from '../types'

const positionColors = ['cyan', 'purple', 'yellow', 'blue', 'green'] as const

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

  const normalizedPositionSeries = useMemo(() => {
    return positions.map((pos, idx) => {
      const priceHistory = positionPriceHistories[pos.symbol] || []
      if (priceHistory.length < 2) return null
      const startPrice = priceHistory[0]
      const normalizedData = priceHistory.map(price => ((price - startPrice) / startPrice) * 100)
      return {
        label: pos.symbol,
        data: normalizedData,
        variant: positionColors[idx % positionColors.length],
      }
    }).filter(Boolean) as { label: string; data: number[]; variant: typeof positionColors[number] }[]
  }, [positions, positionPriceHistories])

  return (
    <>
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

      <div className="col-span-4 md:col-span-8 lg:col-span-4">
        <Panel title="POSITION PERFORMANCE" titleRight="% CHANGE" className="h-[320px]">
          {positions.length === 0 ? (
            <div className="h-full flex items-center justify-center text-hud-text-dim text-sm">
              No positions to display
            </div>
          ) : normalizedPositionSeries.length > 0 ? (
            <div className="h-full flex flex-col">
              <div className="flex flex-wrap gap-3 mb-2 pb-2 border-b border-hud-line/30 shrink-0">
                {positions.slice(0, 5).map((pos: Position, idx: number) => {
                  const isPositive = pos.unrealized_pl >= 0
                  const plPct = (pos.unrealized_pl / (pos.market_value - pos.unrealized_pl)) * 100
                  const color = positionColors[idx % positionColors.length]
                  return (
                    <div key={pos.symbol} className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: `var(--color-hud-${color})` }}
                      />
                      <span className="hud-value-sm">{pos.symbol}</span>
                      <span className={clsx('hud-label', isPositive ? 'text-hud-success' : 'text-hud-error')}>
                        {formatPercent(plPct)}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="flex-1 min-h-0 w-full">
                <LineChart
                  series={normalizedPositionSeries.slice(0, 5)}
                  showArea={false}
                  showGrid={true}
                  showDots={false}
                  animated={false}
                  formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-hud-text-dim text-sm">
              Loading position data...
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
