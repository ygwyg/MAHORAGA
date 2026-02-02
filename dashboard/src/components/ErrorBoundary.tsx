import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { Panel } from './Panel'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-hud-bg flex items-center justify-center p-6">
          <Panel title="RENDER ERROR" className="max-w-md w-full">
            <div className="text-center py-8">
              <div className="text-hud-error text-2xl mb-4">CRASH</div>
              <p className="text-hud-text-dim text-sm mb-4">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              <button
                className="hud-button"
                onClick={() => window.location.reload()}
              >
                Reload Dashboard
              </button>
            </div>
          </Panel>
        </div>
      )
    }

    return this.props.children
  }
}
