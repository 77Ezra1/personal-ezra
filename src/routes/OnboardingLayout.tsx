import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'

export type AuthMode = 'login' | 'register'

type OnboardingContextValue = {
  authMode: AuthMode
  setAuthMode: (mode: AuthMode) => void
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined)

export function useOnboardingContext(): OnboardingContextValue {
  const context = useContext(OnboardingContext)
  if (!context) {
    throw new Error('useOnboardingContext must be used within OnboardingLayout')
  }
  return context
}

export default function OnboardingLayout() {
  const [authMode, setAuthMode] = useState<AuthMode>('login')

  const handleAuthModeChange = useCallback((mode: AuthMode) => {
    setAuthMode(mode)
  }, [])

  const contextValue = useMemo(
    () => ({ authMode, setAuthMode: handleAuthModeChange }),
    [authMode, handleAuthModeChange],
  )

  return (
    <OnboardingContext.Provider value={contextValue}>
      <div className="min-h-screen bg-background text-text transition-colors">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-12">
          <Outlet context={contextValue} />
        </div>
      </div>
    </OnboardingContext.Provider>
  )
}
