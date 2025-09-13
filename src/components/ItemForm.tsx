import React from 'react'
import Modal from './ui/Modal'
import Button from './ui/Button'

export function ItemField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <label className="text-xs text-muted">{label}</label>
      {children}
    </div>
  )
}

interface ItemFormProps {
  open: boolean
  title: string
  onClose: () => void
  onSave: () => void
  children: React.ReactNode
  extraButtons?: React.ReactNode
  cancelLabel: string
  saveLabel: string
}

export default function ItemForm({ open, title, onClose, onSave, children, extraButtons, cancelLabel, saveLabel }: ItemFormProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          {extraButtons}
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button onClick={onSave}>{saveLabel}</Button>
        </>
      }
    >
      <div className="grid gap-3">{children}</div>
    </Modal>
  )
}

