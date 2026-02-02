import { useState, useEffect } from 'react'
import type { Config } from '../types'
import { Panel } from './Panel'

function ConfigInput({ label, value, onChange, step, type = 'number', disabled }: {
  label: string
  value: number | string
  onChange: (v: number) => void
  step?: string
  type?: string
  disabled?: boolean
}) {
  return (
    <div>
      <label className="hud-label block mb-1">{label}</label>
      <input
        type={type}
        step={step}
        className="hud-input w-full"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        disabled={disabled}
      />
    </div>
  )
}

interface SettingsModalProps {
  config: Config
  onSave: (config: Config) => void
  onClose: () => void
}

export function SettingsModal({ config, onSave, onClose }: SettingsModalProps) {
  const [localConfig, setLocalConfig] = useState<Config>(config)
  const [saving, setSaving] = useState(false)
  const [apiToken, setApiToken] = useState(localStorage.getItem('mahoraga_api_token') || '')

  useEffect(() => {
    setLocalConfig(config)
  }, [config])

  const handleTokenSave = () => {
    if (apiToken) {
      localStorage.setItem('mahoraga_api_token', apiToken)
    } else {
      localStorage.removeItem('mahoraga_api_token')
    }
    window.location.reload()
  }

  const handleChange = (key: keyof Config, value: string | number | boolean | string[]) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(localConfig)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <Panel 
        title="TRADING CONFIGURATION" 
        className="w-full max-w-2xl max-h-[90vh] overflow-auto"
        titleRight={
          <button onClick={onClose} className="hud-label hover:text-hud-primary">
            [ESC]
          </button>
        }
      >
        <div onClick={e => e.stopPropagation()} className="space-y-6">
          {/* API Authentication */}
          <div className="pb-4 border-b border-hud-line">
            <h3 className="hud-label mb-3 text-hud-error">API Authentication (Required)</h3>
            <div className="flex gap-2">
              <input
                type="password"
                className="hud-input flex-1"
                value={apiToken}
                onChange={e => setApiToken(e.target.value)}
                placeholder="Enter MAHORAGA_API_TOKEN"
              />
              <button className="hud-button" onClick={handleTokenSave}>
                Save & Reload
              </button>
            </div>
            <p className="text-[9px] text-hud-text-dim mt-1">
              Your MAHORAGA_API_TOKEN from Cloudflare secrets. Required for all API access.
            </p>
          </div>

          {/* Position Limits */}
          <div>
            <h3 className="hud-label mb-3 text-hud-primary">Position Limits</h3>
            <div className="grid grid-cols-2 gap-4">
              <ConfigInput label="Max Position Value ($)" value={localConfig.max_position_value} onChange={v => handleChange('max_position_value', v)} />
              <ConfigInput label="Max Positions" value={localConfig.max_positions} onChange={v => handleChange('max_positions', v)} />
              <ConfigInput label="Position Size (% of Cash)" value={localConfig.position_size_pct_of_cash} onChange={v => handleChange('position_size_pct_of_cash', v)} />
            </div>
          </div>

          {/* Sentiment Thresholds */}
          <div>
            <h3 className="hud-label mb-3 text-hud-primary">Sentiment Thresholds</h3>
            <div className="grid grid-cols-2 gap-4">
              <ConfigInput label="Min Sentiment to Buy (0-1)" value={localConfig.min_sentiment_score} onChange={v => handleChange('min_sentiment_score', v)} step="0.05" />
              <ConfigInput label="Min Analyst Confidence (0-1)" value={localConfig.min_analyst_confidence} onChange={v => handleChange('min_analyst_confidence', v)} step="0.05" />
              <ConfigInput label="Sell Sentiment Threshold" value={localConfig.sell_sentiment_threshold} onChange={v => handleChange('sell_sentiment_threshold', v)} step="0.05" />
            </div>
          </div>

          {/* Risk Management */}
          <div>
            <h3 className="hud-label mb-3 text-hud-primary">Risk Management</h3>
            <div className="grid grid-cols-2 gap-4">
              <ConfigInput label="Take Profit (%)" value={localConfig.take_profit_pct} onChange={v => handleChange('take_profit_pct', v)} />
              <ConfigInput label="Stop Loss (%)" value={localConfig.stop_loss_pct} onChange={v => handleChange('stop_loss_pct', v)} />
            </div>
          </div>

          {/* Timing */}
          <div>
            <h3 className="hud-label mb-3 text-hud-primary">Polling Intervals</h3>
            <div className="grid grid-cols-2 gap-4">
              <ConfigInput label="Data Poll (ms)" value={localConfig.data_poll_interval_ms} onChange={v => handleChange('data_poll_interval_ms', v)} step="1000" />
              <ConfigInput label="Analyst Interval (ms)" value={localConfig.analyst_interval_ms} onChange={v => handleChange('analyst_interval_ms', v)} step="1000" />
            </div>
          </div>

          {/* LLM Config */}
          <div>
            <h3 className="hud-label mb-3 text-hud-primary">LLM Configuration</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="hud-label block mb-1">Research Model (cheap)</label>
                <select
                  className="hud-input w-full"
                  value={localConfig.llm_model}
                  onChange={e => handleChange('llm_model', e.target.value)}
                >
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                </select>
              </div>
              <div>
                <label className="hud-label block mb-1">Analyst Model (smart)</label>
                <select
                  className="hud-input w-full"
                  value={localConfig.llm_analyst_model || 'gpt-4o'}
                  onChange={e => handleChange('llm_analyst_model', e.target.value)}
                >
                  <option value="gpt-5.2-2025-12-11">GPT-5.2 (best)</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini (cheaper)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Account Config */}
          <div>
            <h3 className="hud-label mb-3 text-hud-primary">Account</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <ConfigInput label="Starting Equity ($)" value={localConfig.starting_equity || 100000} onChange={v => handleChange('starting_equity', v)} />
                <p className="text-xs text-hud-text-dim mt-1">For P&L calculation</p>
              </div>
            </div>
          </div>

          {/* Options Trading */}
          <div>
            <h3 className="hud-label mb-3 text-hud-purple">Options Trading (Beta)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="hud-input w-4 h-4"
                    checked={localConfig.options_enabled || false}
                    onChange={e => handleChange('options_enabled', e.target.checked)}
                  />
                  <span className="hud-label">Enable Options Trading</span>
                </label>
              </div>
              <ConfigInput label="Min Confidence (0-1)" value={localConfig.options_min_confidence || 0.75} onChange={v => handleChange('options_min_confidence', v)} step="0.05" disabled={!localConfig.options_enabled} />
              <ConfigInput label="Max % Per Trade" value={localConfig.options_max_pct_per_trade || 2} onChange={v => handleChange('options_max_pct_per_trade', v)} step="0.5" disabled={!localConfig.options_enabled} />
              <ConfigInput label="Min DTE (days)" value={localConfig.options_min_dte || 7} onChange={v => handleChange('options_min_dte', v)} disabled={!localConfig.options_enabled} />
              <ConfigInput label="Max DTE (days)" value={localConfig.options_max_dte || 45} onChange={v => handleChange('options_max_dte', v)} disabled={!localConfig.options_enabled} />
              <ConfigInput label="Target Delta" value={localConfig.options_target_delta || 0.35} onChange={v => handleChange('options_target_delta', v)} step="0.05" disabled={!localConfig.options_enabled} />
              <ConfigInput label="Max Positions" value={localConfig.options_max_positions || 3} onChange={v => handleChange('options_max_positions', v)} disabled={!localConfig.options_enabled} />
              <ConfigInput label="Stop Loss (%)" value={localConfig.options_stop_loss_pct || 50} onChange={v => handleChange('options_stop_loss_pct', v)} disabled={!localConfig.options_enabled} />
              <ConfigInput label="Take Profit (%)" value={localConfig.options_take_profit_pct || 100} onChange={v => handleChange('options_take_profit_pct', v)} disabled={!localConfig.options_enabled} />
            </div>
          </div>

          {/* Crypto Trading */}
          <div>
            <h3 className="hud-label mb-3 text-hud-cyan">Crypto Trading (24/7)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="hud-input w-4 h-4"
                    checked={localConfig.crypto_enabled || false}
                    onChange={e => handleChange('crypto_enabled', e.target.checked)}
                  />
                  <span className="hud-label">Enable Crypto Trading</span>
                </label>
                <p className="text-[9px] text-hud-text-dim mt-1">Trade crypto 24/7 based on momentum. Alpaca supports 20+ coins.</p>
              </div>
              <div>
                <label className="hud-label block mb-1">Symbols (comma-separated)</label>
                <input
                  type="text"
                  className="hud-input w-full"
                  value={(localConfig.crypto_symbols || ['BTC/USD', 'ETH/USD', 'SOL/USD']).join(', ')}
                  onChange={e => handleChange('crypto_symbols', e.target.value.split(',').map(s => s.trim()))}
                  disabled={!localConfig.crypto_enabled}
                  placeholder="BTC/USD, ETH/USD, SOL/USD, DOGE/USD, AVAX/USD..."
                />
              </div>
              <ConfigInput label="Momentum Threshold (%)" value={localConfig.crypto_momentum_threshold || 2.0} onChange={v => handleChange('crypto_momentum_threshold', v)} step="0.5" disabled={!localConfig.crypto_enabled} />
              <ConfigInput label="Max Position ($)" value={localConfig.crypto_max_position_value || 1000} onChange={v => handleChange('crypto_max_position_value', v)} disabled={!localConfig.crypto_enabled} />
              <ConfigInput label="Take Profit (%)" value={localConfig.crypto_take_profit_pct || 10} onChange={v => handleChange('crypto_take_profit_pct', v)} disabled={!localConfig.crypto_enabled} />
              <ConfigInput label="Stop Loss (%)" value={localConfig.crypto_stop_loss_pct || 5} onChange={v => handleChange('crypto_stop_loss_pct', v)} disabled={!localConfig.crypto_enabled} />
            </div>
          </div>

          {/* Stale Position Management */}
          <div>
            <h3 className="hud-label mb-3 text-hud-warning">Stale Position Management</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="hud-input w-4 h-4"
                    checked={localConfig.stale_position_enabled ?? true}
                    onChange={e => handleChange('stale_position_enabled', e.target.checked)}
                  />
                  <span className="hud-label">Enable Stale Position Detection</span>
                </label>
              </div>
              <ConfigInput label="Max Hold Days" value={localConfig.stale_max_hold_days || 3} onChange={v => handleChange('stale_max_hold_days', v)} disabled={!localConfig.stale_position_enabled} />
              <ConfigInput label="Min Gain % to Keep" value={localConfig.stale_min_gain_pct || 5} onChange={v => handleChange('stale_min_gain_pct', v)} step="0.5" disabled={!localConfig.stale_position_enabled} />
              <div>
                <ConfigInput label="Social Volume Decay" value={localConfig.stale_social_volume_decay || 0.3} onChange={v => handleChange('stale_social_volume_decay', v)} step="0.1" disabled={!localConfig.stale_position_enabled} />
                <p className="text-[9px] text-hud-text-dim mt-1">Exit if volume drops to this % of entry</p>
              </div>
              <div>
                <ConfigInput label="No Mentions Hours" value={localConfig.stale_no_mentions_hours || 8} onChange={v => handleChange('stale_no_mentions_hours', v)} disabled={!localConfig.stale_position_enabled} />
                <p className="text-[9px] text-hud-text-dim mt-1">Exit if no mentions for N hours</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 pt-4 border-t border-hud-line">
            <button className="hud-button" onClick={onClose}>
              Cancel
            </button>
            <button 
              className="hud-button" 
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </Panel>
    </div>
  )
}
