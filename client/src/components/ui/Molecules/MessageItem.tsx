import React from 'react'

export interface MessageItemProps {
  sender: string
  timestamp: string
  text: string
}

export const MessageItem: React.FC<MessageItemProps> = ({ sender, timestamp, text }) => {
  return (
    <div className="flex flex-col mb-6 px-4 group">
      <div className="flex items-baseline space-x-2 mb-1">
        <span className="font-semibold text-sm">{sender}</span>
        <span className="text-[10px] text-white/30">{timestamp}</span>
      </div>
      <div className="text-sm text-white/90 whitespace-pre-wrap">{text}</div>
    </div>
  )
}

export default MessageItem
