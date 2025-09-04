import React from 'react'

export default function SplitPane({left, right, className=''}: {left: React.ReactNode; right: React.ReactNode; className?: string}) {
  return (
    <div className={"grid h-[calc(100dvh-48px)] " + className} style={{gridTemplateColumns: '340px 1fr'}}>
      <div className="border-r bg-white overflow-hidden">{left}</div>
      <div className="bg-white overflow-hidden">{right}</div>
    </div>
  )
}
