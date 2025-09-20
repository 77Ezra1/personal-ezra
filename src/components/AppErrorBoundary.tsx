import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Send } from 'lucide-react'

export interface AppErrorBoundaryProps {
  children: ReactNode
  title?: ReactNode
  description?: ReactNode
  onFeedback?: () => void
  feedbackHref?: string
  onReset?: () => void
}

interface AppErrorBoundaryState {
  hasError: boolean
  error?: Error | null
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    error: null,
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error', error, info)
  }

  handleRefresh = () => {
    if (this.props.onReset) {
      this.props.onReset()
      this.setState({ hasError: false, error: null })
      return
    }
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  handleFeedback = () => {
    const { onFeedback, feedbackHref } = this.props
    if (onFeedback) {
      onFeedback()
      return
    }
    if (feedbackHref && typeof window !== 'undefined') {
      window.open(feedbackHref, '_blank', 'noreferrer')
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-10 text-text">
        <div className="max-w-lg rounded-3xl border border-border bg-surface px-8 py-10 text-center shadow-lg">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <AlertTriangle className="h-8 w-8" aria-hidden />
          </div>
          <h1 className="mt-6 text-2xl font-semibold text-text">
            {this.props.title ?? '出现了一些问题'}
          </h1>
          <p className="mt-3 text-sm text-muted">
            {this.props.description ?? '页面加载失败，请刷新后再试。如果问题持续存在，欢迎反馈给我们。'}
          </p>
          {this.state.error ? (
            <pre className="mt-5 max-h-40 overflow-auto rounded-2xl bg-surface-hover px-4 py-3 text-left text-xs text-muted">
              {this.state.error.message}
            </pre>
          ) : null}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={this.handleRefresh}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary/90"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              <span>刷新页面</span>
            </button>
            <button
              type="button"
              onClick={this.handleFeedback}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-6 py-3 text-sm font-medium text-text transition hover:bg-surface-hover"
            >
              <Send className="h-4 w-4" aria-hidden />
              <span>反馈问题</span>
            </button>
          </div>
        </div>
      </div>
    )
  }
}
