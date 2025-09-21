import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import OnboardingLayout from '../OnboardingLayout'
import { useAuthStore } from '../../../stores/auth'

describe('OnboardingLayout', () => {
  afterEach(() => {
    cleanup()
    act(() => {
      useAuthStore.setState({
        email: null,
        profile: null,
        mustChangePassword: false,
        initialized: false,
      })
    })
  })

  it('renders fallback support id when spId is missing', () => {
    const { getByTestId } = render(
      <OnboardingLayout title="欢迎" description="引导设置">
        <p>内容</p>
      </OnboardingLayout>
    )

    expect(getByTestId('onboarding-support-id')).toHaveTextContent('ID：未分配')
  })

  it('renders provided spId when available on profile', () => {
    act(() => {
      useAuthStore.setState({
        email: 'alice@example.com',
        profile: {
          email: 'alice@example.com',
          displayName: 'Alice',
          avatar: null,
          spId: 'SP-12345',
        } as unknown as ReturnType<typeof useAuthStore.getState>['profile'],
      })
    })

    const { getByTestId } = render(
      <OnboardingLayout title="欢迎" description="引导设置">
        <p>内容</p>
      </OnboardingLayout>
    )

    expect(getByTestId('onboarding-support-id')).toHaveTextContent('ID：SP-12345')
  })
})
