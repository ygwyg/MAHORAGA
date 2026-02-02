import { useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import clsx from 'clsx'
import { Panel } from './Panel'
import { getAgentColor } from '../utils/formatters'
import type { LogEntry } from '../types'

interface ActivityFeedProps {
  logs: LogEntry[]
}

export function ActivityFeed({ logs }: ActivityFeedProps) {
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="col-span-4 md:col-span-4 lg:col-span-4">
      <Panel title="ACTIVITY FEED" titleRight="LIVE" className="h-80">
        <div className="overflow-y-auto h-full font-mono text-xs space-y-1">
          {logs.length === 0 ? (
            <div className="text-hud-text-dim py-4 text-center">Waiting for activity...</div>
          ) : (
            logs.slice(-50).map((log: LogEntry, i: number) => (
              <motion.div
                key={`${log.timestamp}-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-start gap-2 py-1 border-b border-hud-line/10"
              >
                <span className="text-hud-text-dim shrink-0 hidden sm:inline w-[52px]">
                  {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                </span>
                <span className={clsx('shrink-0 w-[72px] text-right', getAgentColor(log.agent))}>
                  {log.agent}
                </span>
                <span className="text-hud-text flex-1 text-right break-words">
                  {log.action}
                  {log.symbol && <span className="text-hud-primary ml-1">({log.symbol})</span>}
                </span>
              </motion.div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </Panel>
    </div>
  )
}
