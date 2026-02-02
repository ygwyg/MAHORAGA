import { useState } from 'react'
import { Panel } from './Panel'
import { authFetch } from '../services/api'

interface SetupWizardProps {
  onComplete: () => void
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(0)
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [alpacaKey, setAlpacaKey] = useState('')
  const [alpacaSecret, setAlpacaSecret] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [paperMode, setPaperMode] = useState(true)
  const [startingEquity, setStartingEquity] = useState(100000)

  const handleSubmit = async () => {
    if (!alpacaKey || !alpacaSecret) {
      setError('Alpaca API Key and Secret are required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await authFetch('/api/setup/keys', {
        method: 'POST',
        body: JSON.stringify({
          alpaca_key: alpacaKey,
          alpaca_secret: alpacaSecret,
          openai_key: openaiKey || undefined,
          paper_mode: paperMode,
          starting_equity: startingEquity,
        }),
      })
      
      const data = await res.json()
      
      if (data.ok) {
        setStep(3)
      } else {
        setError(data.error || 'Failed to save configuration')
      }
    } catch {
      setError('Failed to connect to agent')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-hud-bg flex items-center justify-center p-6">
      <Panel title="MAHORAGA SETUP" className="w-full max-w-xl">
        {step === 0 && (
          <div className="space-y-6">
            <div className="text-center py-2">
              <h2 className="text-xl font-light text-hud-warning mb-2">Risk Disclaimer</h2>
              <p className="text-hud-text-dim text-xs">
                Please read carefully before proceeding
              </p>
            </div>

            <div className="bg-hud-bg p-4 rounded text-xs text-hud-text-dim space-y-3 max-h-64 overflow-y-auto">
              <p>
                This software is provided for <strong className="text-hud-text">educational and informational purposes only</strong>. 
                Nothing in this software constitutes financial, investment, legal, or tax advice.
              </p>
              <p>
                <strong className="text-hud-text">By using this software, you acknowledge and agree that:</strong>
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>All trading and investment decisions are made <strong className="text-hud-warning">at your own risk</strong></li>
                <li>Markets are volatile and <strong className="text-hud-error">you can lose some or all of your capital</strong></li>
                <li>No guarantees of performance, profits, or outcomes are made</li>
                <li>The authors, contributors, and maintainers are not responsible for any financial losses</li>
                <li>You are solely responsible for your own trades and investment decisions</li>
                <li>This software may contain bugs, errors, or behave unexpectedly</li>
                <li>Past performance does not guarantee future results</li>
              </ul>
              <p>
                <strong className="text-hud-error">If you do not fully understand the risks involved in trading or investing, you should not use this software.</strong>
              </p>
              <p>
                No member, contributor, or operator of this project shall be held liable for losses of any kind.
              </p>
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="acceptDisclaimer"
                checked={disclaimerAccepted}
                onChange={e => setDisclaimerAccepted(e.target.checked)}
                className="accent-hud-primary mt-1"
              />
              <label htmlFor="acceptDisclaimer" className="text-xs text-hud-text">
                I have read and understand the risks. I accept full responsibility for any losses that may occur from using this software.
              </label>
            </div>

            <div className="pt-4 border-t border-hud-line">
              <button 
                className="hud-button w-full disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setStep(1)}
                disabled={!disclaimerAccepted}
              >
                I Understand, Continue
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center py-4">
              <h2 className="text-2xl font-light text-hud-text-bright mb-2">Welcome to Mahoraga</h2>
              <p className="text-hud-text-dim text-sm">
                Autonomous trading powered by social sentiment and AI analysis
              </p>
            </div>

            <div className="space-y-4 text-sm text-hud-text">
              <div className="flex items-start gap-3">
                <span className="text-hud-success">1.</span>
                <span>Monitors StockTwits for sentiment signals</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-hud-success">2.</span>
                <span>AI research agents analyze candidates 24/7</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-hud-success">3.</span>
                <span>LLM makes final trading decisions at market open</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-hud-success">4.</span>
                <span>Automatic stop-loss and take-profit protection</span>
              </div>
            </div>

            <div className="pt-4 border-t border-hud-line">
              <button 
                className="hud-button w-full"
                onClick={() => setStep(2)}
              >
                Get Started
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h3 className="hud-label mb-4 text-hud-primary">Alpaca Trading Account</h3>
              <p className="text-xs text-hud-text-dim mb-4">
                Get your API keys from{' '}
                <a href="https://app.alpaca.markets" target="_blank" rel="noopener noreferrer" className="text-hud-primary hover:underline">
                  app.alpaca.markets
                </a>
              </p>
              
              <div className="space-y-3">
                <div>
                  <label className="hud-label block mb-1">API Key</label>
                  <input
                    type="text"
                    className="hud-input w-full"
                    placeholder="PK..."
                    value={alpacaKey}
                    onChange={e => setAlpacaKey(e.target.value)}
                  />
                </div>
                <div>
                  <label className="hud-label block mb-1">API Secret</label>
                  <input
                    type="password"
                    className="hud-input w-full"
                    placeholder="Secret key..."
                    value={alpacaSecret}
                    onChange={e => setAlpacaSecret(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="paperMode"
                    checked={paperMode}
                    onChange={e => setPaperMode(e.target.checked)}
                    className="accent-hud-primary"
                  />
                  <label htmlFor="paperMode" className="hud-label">
                    Paper Trading Mode (recommended for testing)
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="hud-label mb-4 text-hud-primary">OpenAI API Key (Optional)</h3>
              <p className="text-xs text-hud-text-dim mb-4">
                Required for AI-powered analysis. Get from{' '}
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-hud-primary hover:underline">
                  platform.openai.com
                </a>
              </p>
              <input
                type="password"
                className="hud-input w-full"
                placeholder="sk-..."
                value={openaiKey}
                onChange={e => setOpenaiKey(e.target.value)}
              />
            </div>

            <div>
              <h3 className="hud-label mb-4 text-hud-primary">Starting Equity</h3>
              <p className="text-xs text-hud-text-dim mb-4">
                Your account starting balance (for P&L tracking)
              </p>
              <input
                type="number"
                className="hud-input w-full"
                value={startingEquity}
                onChange={e => setStartingEquity(Number(e.target.value))}
              />
            </div>

            {error && (
              <div className="text-hud-error text-sm p-2 border border-hud-error/30 rounded">
                {error}
              </div>
            )}

            <div className="flex gap-4 pt-4 border-t border-hud-line">
              <button 
                className="hud-button flex-1"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button 
                className="hud-button flex-1"
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save & Continue'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 text-center py-8">
            <div className="text-hud-success text-4xl mb-4">✓</div>
            <h2 className="text-xl font-light text-hud-text-bright">Configuration Saved</h2>
            <p className="text-hud-text-dim text-sm">
              Please restart the agent to apply the new settings:
            </p>
            <code className="block bg-hud-bg p-3 text-hud-primary text-sm rounded">
              curl localhost:8787/agent/disable && curl localhost:8787/agent/enable
            </code>
            <button 
              className="hud-button mt-4"
              onClick={onComplete}
            >
              Continue to Dashboard
            </button>
          </div>
        )}
      </Panel>
    </div>
  )
}
