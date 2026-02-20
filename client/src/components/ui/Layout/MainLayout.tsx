import React from 'react'
import { Button } from '../Button'
import { Avatar } from '../Avatar'

interface MainLayoutProps {
  sidebar?: React.ReactNode
  main?: React.ReactNode
}

export const MainLayout: React.FC<MainLayoutProps> = ({ sidebar, main }) => {
  return (
    <div className="flex h-screen bg-black text-white">
      <aside className="w-[320px] border-r border-white/10 h-screen flex flex-col p-4">
        {sidebar ?? (
          <div className="flex items-center gap-2">
            <Avatar>
              {/* placeholder initials */}
            </Avatar>
            <div>
              <div className="text-sm font-semibold">Chats</div>
              <div className="text-xs text-white/60">0 unread</div>
            </div>
          </div>
        )}
      </aside>
      <main className="flex-1 p-4 overflow-auto">{main ?? <div className="text-sm text-white/60">Chat content area</div>}</main>
    </div>
  )
}

export default MainLayout
