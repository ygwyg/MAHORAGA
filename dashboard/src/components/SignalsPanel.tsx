import { motion } from 'motion/react'
import clsx from 'clsx'
import { Panel } from './Panel'
import { Tooltip, TooltipContent } from './Tooltip'
import { formatCurrency, getSentimentColor } from '../utils/formatters'
import type { Signal } from '../types'

interface SignalsPanelProps {
  signals: Signal[]
}

export function SignalsPanel({ signals }: SignalsPanelProps) {
  return (
    <div className="col-span-4 md:col-span-4 lg:col-span-4">
      <Panel title="ACTIVE SIGNALS" titleRight={signals.length.toString()} className="h-80">
        <div className="overflow-y-auto h-full space-y-1">
          {signals.length === 0 ? (
            <div className="text-hud-text-dim text-sm py-4 text-center">Gathering signals...</div>
          ) : (
            signals.slice(0, 20).map((sig: Signal, i: number) => (
              <Tooltip
                key={`${sig.symbol}-${sig.source}-${i}`}
                position="right"
                content={
                  <TooltipContent
                    title={`${sig.symbol} - ${sig.source.toUpperCase()}`}
                    items={[
                      { label: 'Sentiment', value: `${(sig.sentiment * 100).toFixed(0)}%`, color: getSentimentColor(sig.sentiment) },
                      { label: 'Volume', value: sig.volume },
                      ...(sig.bullish !== undefined ? [{ label: 'Bullish', value: sig.bullish, color: 'text-hud-success' }] : []),
                      ...(sig.bearish !== undefined ? [{ label: 'Bearish', value: sig.bearish, color: 'text-hud-error' }] : []),
                      ...(sig.score !== undefined ? [{ label: 'Score', value: sig.score }] : []),
                      ...(sig.upvotes !== undefined ? [{ label: 'Upvotes', value: sig.upvotes }] : []),
                      ...(sig.momentum !== undefined ? [{ label: 'Momentum', value: `${sig.momentum >= 0 ? '+' : ''}${sig.momentum.toFixed(2)}%` }] : []),
                      ...(sig.price !== undefined ? [{ label: 'Price', value: formatCurrency(sig.price) }] : []),
                    ]}
                    description={sig.reason}
                  />
                }
              >
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={clsx(
                    "flex items-center justify-between py-1 px-2 border-b border-hud-line/10 hover:bg-hud-line/10 cursor-help",
                    sig.isCrypto && "bg-hud-warning/5"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {sig.isCrypto && <span className="text-hud-warning text-xs">&#8383;</span>}
                    <span className="hud-value-sm">{sig.symbol}</span>
                    <span className={clsx('hud-label', sig.isCrypto ? 'text-hud-warning' : '')}>{sig.source.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {sig.isCrypto && sig.momentum !== undefined ? (
                      <span className={clsx('hud-label hidden sm:inline', sig.momentum >= 0 ? 'text-hud-success' : 'text-hud-error')}>
                        {sig.momentum >= 0 ? '+' : ''}{sig.momentum.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="hud-label hidden sm:inline">VOL {sig.volume}</span>
                    )}
                    <span className={clsx('hud-value-sm', getSentimentColor(sig.sentiment))}>
                      {(sig.sentiment * 100).toFixed(0)}%
                    </span>
                  </div>
                </motion.div>
              </Tooltip>
            ))
          )}
        </div>
      </Panel>
    </div>
  )
}
