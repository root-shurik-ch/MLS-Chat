import React from 'react'

interface SystemMessageProps {
  text: string
}

export const SystemMessage: React.FC<SystemMessageProps> = ({ text }) => {
  return (
    <div className="flex justify-center my-8">
      <span className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-medium">{text}</span>
    </div>
  )
}

export default SystemMessage
