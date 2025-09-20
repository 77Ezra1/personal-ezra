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
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 py-12 text-slate-200">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900/70 p-10 shadow-2xl shadow-slate-950/50">
          <h1 className="text-2xl font-semibold text-white">应用出现错误</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            很抱歉，应用在运行时遇到了问题。您可以尝试刷新页面重新载入，或返回继续使用。
          </p>
          <pre className="mt-6 max-h-52 overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-relaxed text-red-300">
            {error.message}
          </pre>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-slate-950/40 transition hover:bg-slate-200"
            >
              刷新页面
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-white/40 hover:bg-white/10"
            >
              返回应用
            </button>
          </div>
        </div>
      </div>
    )
  }
}
