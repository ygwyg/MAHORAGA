import { motion } from 'motion/react'
import clsx from 'clsx'
import { Panel } from './Panel'
import { Tooltip } from './Tooltip'
import { getSentimentColor, getQualityColor, getVerdictColor } from '../utils/formatters'
import type { SignalResearch } from '../types'

interface SignalResearchPanelProps {
  signalResearch: Record<string, SignalResearch>
  isAgentEnabled: boolean
}

export function SignalResearchPanel({ signalResearch, isAgentEnabled }: SignalResearchPanelProps) {
  return (
    <div className="col-span-4 md:col-span-8 lg:col-span-4">
      <Panel title="SIGNAL RESEARCH" titleRight={Object.keys(signalResearch).length.toString()} className="h-80">
        <div className="overflow-y-auto h-full space-y-2">
          {Object.entries(signalResearch).length === 0 ? (
            <div className="text-hud-text-dim text-sm py-4 text-center">
              {isAgentEnabled ? 'Researching candidates...' : 'Agent is disabled — enable to start research'}
            </div>
          ) : (
            Object.entries(signalResearch).map(([symbol, research]: [string, SignalResearch]) => (
              <Tooltip
                key={symbol}
                position="left"
                content={
                  <div className="space-y-2 min-w-[200px]">
                    <div className="hud-label text-hud-primary border-b border-hud-line/50 pb-1">
                      {symbol} DETAILS
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-hud-text-dim">Confidence</span>
                        <span className="text-hud-text-bright">{(research.confidence * 100).toFixed(0)}%</span>
                      </div>
                      {research.sentiment != null && (
                        <div className="flex justify-between">
                          <span className="text-hud-text-dim">Sentiment</span>
                          <span className={getSentimentColor(research.sentiment)}>
                            {(research.sentiment * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-hud-text-dim">Analyzed</span>
                        <span className="text-hud-text">
                          {new Date(research.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                        </span>
                      </div>
                    </div>
                    {research.catalysts.length > 0 && (
                      <div className="pt-1 border-t border-hud-line/30">
                        <span className="text-[9px] text-hud-text-dim">CATALYSTS:</span>
                        <ul className="mt-1 space-y-0.5">
                          {research.catalysts.map((c, i) => (
                            <li key={i} className="text-[10px] text-hud-success">+ {c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {research.red_flags.length > 0 && (
                      <div className="pt-1 border-t border-hud-line/30">
                        <span className="text-[9px] text-hud-text-dim">RED FLAGS:</span>
                        <ul className="mt-1 space-y-0.5">
                          {research.red_flags.map((f, i) => (
                            <li key={i} className="text-[10px] text-hud-error">- {f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                }
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-2 border border-hud-line/30 rounded hover:border-hud-line/60 cursor-help transition-colors"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="hud-value-sm">{symbol}</span>
                    <div className="flex items-center gap-2">
                      <span className={clsx('hud-label', getQualityColor(research.entry_quality))}>
                        {research.entry_quality.toUpperCase()}
                      </span>
                      <span className={clsx('hud-value-sm font-bold', getVerdictColor(research.verdict))}>
                        {research.verdict}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-hud-text-dim leading-tight mb-1">{research.reasoning}</p>
                  {research.red_flags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {research.red_flags.slice(0, 2).map((flag, i) => (
                        <span key={i} className="text-xs text-hud-error bg-hud-error/10 px-1 rounded">
                          {flag.slice(0, 30)}...
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              </Tooltip>
            ))
          )}
        </div>
      </Panel>
    </div>
  )
}
