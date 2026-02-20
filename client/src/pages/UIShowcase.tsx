import React from 'react'
import MainLayout from '../components/ui/Layout/MainLayout'
import { MessageItem } from '../components/ui/Molecules/MessageItem'
import { SystemMessage } from '../components/ui/Molecules/SystemMessage'
import { FileCard } from '../components/ui/Molecules/FileCard'
import { Avatar } from '../components/ui/Avatar'
import { Body, Heading } from '../components/ui/Typography'

const UIShowcase: React.FC = () => {
  const messages = [
    { sender: 'Alice', ts: '10:01', text: 'Hello there. This is a test message.' },
    { sender: 'Bob', ts: '10:02', text: 'MLS messages render without bubbles.' },
  ]
  return (
    <MainLayout
      sidebar={
        <div className="flex flex-col gap-2">
          <div className="font-semibold">Chats</div>
          <div className="flex items-center justify-between p-2 hover:bg-white/5 rounded">
            <span>Demo Chat</span>
            <span className="inline-block w-2 h-2 bg-white/60 rounded-full" />
          </div>
        </div>
      }
      main={
        <div className="h-full flex flex-col">
          <Heading>UI Design System Showcase</Heading>
          <div className="flex-1 overflow-auto mt-2">
            {messages.map((m, idx) => (
              <MessageItem key={idx} sender={m.sender} timestamp={m.ts} text={m.text} />
            ))}
            <SystemMessage text="MLS Epoch: 42" />
            <FileCard fileName={`sample-encrypted-${0}.dat`} sizeBytes={50 * 1024 * 1024} progress={60} />
          </div>
          <div className="p-4 border-t border-white/5 flex items-center gap-2">
            <Avatar size={28}>
              {/* avatar placeholder */}
            </Avatar>
            <Body>Sample input area for UI demo. Type message here...</Body>
          </div>
        </div>
      }
    />
  )
}

export default UIShowcase
