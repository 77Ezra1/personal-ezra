import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppLayout } from '../AppLayout'

const openCommandPaletteMock = vi.fn()

vi.mock('../../providers/CommandPaletteProvider', () => ({
  useCommandPalette: () => ({ open: openCommandPaletteMock }),
}))

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
  beforeEach(() => {
    cleanup()
    openCommandPaletteMock.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

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

  it('renders command palette shortcut button and triggers open when clicked', async () => {
    const user = userEvent.setup()

    const { getByPlaceholderText, getByRole } = render(
      <AppLayout title="搜索布局" searchValue="" onSearchChange={() => {}}>
        <div>内容</div>
      </AppLayout>,
    )

    const searchInput = getByPlaceholderText('搜索')
    expect(searchInput).toHaveClass('pr-28')

    const paletteButton = getByRole('button', { name: 'Ctrl / Cmd + K' })
    await user.click(paletteButton)

    expect(openCommandPaletteMock).toHaveBeenCalled()
  })
})
