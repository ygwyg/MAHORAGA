import { useState, useEffect } from 'react'
import type { Status, PortfolioSnapshot } from '../types'
import type { Config } from '../types'
import { API_BASE, authFetch } from '../services/api'

function generateMockPortfolioHistory(equity: number, points: number = 24): PortfolioSnapshot[] {
  const history: PortfolioSnapshot[] = []
  const now = Date.now()
  const interval = 3600000 // 1 hour in ms
  let value = equity * 0.95 // Start slightly lower

  for (let i = points; i >= 0; i--) {
    const change = (Math.random() - 0.45) * equity * 0.005
    value = Math.max(value + change, equity * 0.8)
    const pl = value - equity * 0.95
    history.push({
      timestamp: now - i * interval,
      equity: value,
      pl,
      pl_pct: (pl / (equity * 0.95)) * 100,
    })
  }
  // Ensure last point is current equity
  history[history.length - 1] = {
    timestamp: now,
    equity,
    pl: equity - history[0].equity,
    pl_pct: ((equity - history[0].equity) / history[0].equity) * 100,
  }
  return history
}

export function useAgentStatus() {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [setupChecked, setSetupChecked] = useState(false)
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioSnapshot[]>([])

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const res = await authFetch(`${API_BASE}/setup/status`)
        const data = await res.json()
        if (data.ok && !data.data.configured) {
          setShowSetup(true)
        }
        setSetupChecked(true)
      } catch {
        setSetupChecked(true)
      }
    }
    checkSetup()
  }, [])

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await authFetch(`${API_BASE}/status`)
        const data = await res.json()
        if (data.ok) {
          setStatus(data.data)
          setError(null)

          if (data.data.account && portfolioHistory.length === 0) {
            setPortfolioHistory(generateMockPortfolioHistory(data.data.account.equity))
          } else if (data.data.account) {
            setPortfolioHistory(prev => {
              const now = Date.now()
              const newSnapshot: PortfolioSnapshot = {
                timestamp: now,
                equity: data.data.account.equity,
                pl: data.data.account.equity - (prev[0]?.equity || data.data.account.equity),
                pl_pct: prev[0] ? ((data.data.account.equity - prev[0].equity) / prev[0].equity) * 100 : 0,
              }
              return [...prev, newSnapshot].slice(-48)
            })
          }
        } else {
          setError(data.error || 'Failed to fetch status')
        }
      } catch {
        setError('Connection failed - is the agent running?')
      }
    }

    if (setupChecked && !showSetup) {
      fetchStatus()
      const interval = setInterval(fetchStatus, 5000)
      return () => clearInterval(interval)
    }
  }, [setupChecked, showSetup])

  const saveConfig = async (config: Config) => {
    const res = await authFetch(`${API_BASE}/config`, {
      method: 'POST',
      body: JSON.stringify(config),
    })
    const data = await res.json()
    if (data.ok && status) {
      setStatus({ ...status, config: data.data })
    }
  }

  return {
    status,
    error,
    showSetup,
    setShowSetup,
    setupChecked,
    portfolioHistory,
    saveConfig,
  }
}
