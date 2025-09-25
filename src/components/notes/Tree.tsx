import clsx from 'clsx'
import { Folder, FileText, PencilLine, Trash2 } from 'lucide-react'
import { useMemo } from 'react'

import type { NotesTreeNode } from '../../lib/notes-fs'

interface NotesTreeProps {
  nodes: NotesTreeNode[]
  selectedPath: string | null
  onSelect: (path: string) => void
  onRename: (path: string) => void
  onDelete: (path: string) => void
}

function TreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
  onRename,
  onDelete,
}: {
  node: NotesTreeNode
  depth: number
  selectedPath: string | null
  onSelect: (path: string) => void
  onRename: (path: string) => void
  onDelete: (path: string) => void
}) {
  const isSelected = selectedPath === node.path
  const paddingLeft = useMemo(() => ({ paddingLeft: `${depth * 0.75}rem` }), [depth])

  return (
    <div key={node.path} className="space-y-1" style={paddingLeft}>
      <div
        className={clsx(
          'flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm transition',
          isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-surface-hover',
        )}
      >
        <button
          type="button"
          onClick={() => onSelect(node.path)}
          className={clsx(
            'flex flex-1 items-center gap-2 text-left',
            isSelected ? 'font-medium' : 'font-normal text-text',
          )}
        >
          {node.kind === 'directory' ? (
            <Folder className="h-4 w-4 text-muted" />
          ) : (
            <FileText className="h-4 w-4 text-muted" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onRename(node.path)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-text"
            aria-label="重命名"
          >
            <PencilLine className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(node.path)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-red-500/10 hover:text-red-500"
            aria-label="删除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {node.children && node.children.length > 0 ? (
        <div className="space-y-1">
          {node.children.map(child => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function NotesTree({ nodes, selectedPath, onSelect, onRename, onDelete }: NotesTreeProps) {
  if (!nodes.length) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 bg-surface/60 p-6 text-center text-sm text-muted">
        当前目录下还没有笔记，点击右上角新建按钮开始创作。
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {nodes.map(node => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
