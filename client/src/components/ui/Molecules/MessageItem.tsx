import React from 'react'

export interface MessageItemProps {
  sender: string
  timestamp: string
  text: string
  isSelf?: boolean
  isPending?: boolean
}

export const MessageItem: React.FC<MessageItemProps> = ({ sender, timestamp, text, isSelf, isPending }) => {
  return (
    <div className={`flex flex-col mb-5 px-6 group animate-fade-up ${isPending ? 'opacity-40' : ''}`}>
      <div className="flex items-baseline gap-2.5 mb-1">
        <span className={`text-[13px] font-semibold tracking-tight ${isSelf ? 'text-white' : 'text-white/80'}`}>
          {sender}
        </span>
        <span className="font-mono text-[10px] text-white/25 tabular-nums">{timestamp}</span>
        {isPending && (
          <span className="font-mono text-[10px] text-white/20">sending…</span>
        )}
      </div>
      <div className="text-[15px] text-white/85 whitespace-pre-wrap leading-relaxed">{text}</div>
    </div>
  )
}

export default MessageItem
