export interface ContextMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

export interface ContextMenuProps {
  items: ContextMenuItem[]
  onClose: () => void
  x: number
  y: number
}

export default function ContextMenu(props: ContextMenuProps) {
  const { items, onClose, x, y } = props
  return (
    <div
      className="fixed z-50"
      style={{ left: x, top: y }}
      onClick={onClose}
      onContextMenu={e => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        className="min-w-[180px] bg-white rounded-lg shadow border overflow-hidden"
        role="menu"
        aria-label="Context menu"
        onClick={e => e.stopPropagation()}
      >
        {items.map((it, i) => (
          <button
            key={i}
            className={
              "w-full text-left px-3 py-2 text-sm hover:bg-gray-50 " +
              (it.danger ? "text-red-600" : "")
            }
            onClick={() => {
              it.onClick()
              onClose()
            }}
            role="menuitem"
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  )
}
