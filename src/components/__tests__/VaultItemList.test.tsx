import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { VaultItemList } from '../VaultItemList'

const UPDATED_AT = Date.UTC(2024, 0, 1, 12, 30)

describe('VaultItemList', () => {
  it('renders item information and triggers callbacks', async () => {
    const onOpen = vi.fn()
    const onAction = vi.fn()
    const user = userEvent.setup()

    render(
      <VaultItemList
        items={[
          {
            key: 'item-1',
            title: '示例条目',
            description: '描述信息',
            metadata: ['链接：https://example.com'],
            badges: [{ label: '在线链接', tone: 'info' }],
            updatedAt: UPDATED_AT,
            onOpen,
            actions: [
              {
                icon: <span aria-hidden>图</span>,
                label: '编辑',
                onClick: onAction,
              },
            ],
          },
        ]}
      />,
    )

    expect(screen.getByText('示例条目')).toBeInTheDocument()
    expect(screen.getByText('描述信息')).toBeInTheDocument()
    expect(screen.getByText('链接：https://example.com')).toBeInTheDocument()
    expect(screen.getByText('在线链接')).toBeInTheDocument()

    const listButton = screen.getByRole('button', { name: /^示例条目/ })
    await user.click(listButton)
    expect(onOpen).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '编辑' }))
    expect(onAction).toHaveBeenCalledTimes(1)

    listButton.focus()
    await user.keyboard('{Enter}')
    expect(onOpen).toHaveBeenCalledTimes(2)

    expect(screen.getAllByText(/2024/)).not.toHaveLength(0)
  })
})
