import React from 'react'

interface SystemMessageProps {
  text: string
}

export const SystemMessage: React.FC<SystemMessageProps> = ({ text }) => {
  return (
    <div className="flex justify-center items-center my-8 px-6">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/5 w-12" />
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/25">{text}</span>
        <div className="h-px flex-1 bg-white/5 w-12" />
      </div>
    </div>
  )
}

export default SystemMessage
