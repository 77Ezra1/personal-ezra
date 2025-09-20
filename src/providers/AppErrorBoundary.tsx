import { Component, type ErrorInfo, type ReactNode } from 'react'

export type AppErrorBoundaryProps = {
  children: ReactNode
  fallback?: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unexpected runtime error', error, info)
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  private handleReset = () => {
    this.setState({ error: null })
  }

  override render() {
    const { children, fallback } = this.props
    const { error } = this.state

    if (!error) {
      return children
    }

    if (fallback) {
      return fallback
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12 text-text">
        <div className="w-full max-w-lg rounded-3xl border border-border bg-surface p-10 shadow-2xl shadow-black/30">
          <h1 className="text-2xl font-semibold text-text">应用出现错误</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            很抱歉，应用在运行时遇到了问题。您可以尝试刷新页面重新载入，或返回继续使用。
          </p>
          <pre className="mt-6 max-h-52 overflow-auto rounded-2xl border border-border bg-background/80 p-4 text-xs leading-relaxed text-rose-300">
            {error.message}
          </pre>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-background shadow-lg shadow-black/20 transition hover:bg-primary/90"
            >
              刷新页面
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center justify-center rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-text transition hover:bg-surface-hover"
            >
              返回应用
            </button>
          </div>
        </div>
      </div>
    )
  }
}
