import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { AppLayout } from '../AppLayout'

function LayoutWithState() {
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
  return (
    <AppLayout
      title="测试布局"
      searchValue=""
      onSearchChange={() => {}}
      createLabel="新增"
      onCreate={() => {}}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
    >
      <div>内容</div>
    </AppLayout>
  )
}

describe('AppLayout', () => {
  it('does not render view switch when no handler provided', () => {
    render(
      <AppLayout title="无切换" searchValue="" onSearchChange={() => {}}>
        <div>内容</div>
      </AppLayout>,
    )

    expect(screen.queryByLabelText('切换到卡片视图')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('切换到列表视图')).not.toBeInTheDocument()
  })

  it('allows toggling view mode', async () => {
    const user = userEvent.setup()
    render(<LayoutWithState />)

    const cardButton = screen.getByRole('button', { name: '切换到卡片视图' })
    const listButton = screen.getByRole('button', { name: '切换到列表视图' })

    expect(cardButton).toHaveAttribute('aria-pressed', 'true')
    expect(listButton).toHaveAttribute('aria-pressed', 'false')

    await user.click(listButton)

    expect(cardButton).toHaveAttribute('aria-pressed', 'false')
    expect(listButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders filters when provided', () => {
    render(
      <AppLayout
        title="带筛选"
        searchValue=""
        onSearchChange={() => {}}
        filters={<div data-testid="filters">filters</div>}
      >
        <div>内容</div>
      </AppLayout>,
    )

    expect(screen.getByTestId('filters')).toBeInTheDocument()
  })
})
