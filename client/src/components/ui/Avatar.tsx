import React from 'react'

interface AvatarProps {
  size?: number
  children?: React.ReactNode
  alt?: string
}

export const Avatar: React.FC<AvatarProps> = ({ size = 40, children, alt }) => {
  return (
    <div
      aria-label={alt}
      style={{ width: size, height: size }}
      className="rounded-full border border-white/15 bg-white/5 flex items-center justify-center font-mono text-[11px] text-white/40 shrink-0"
    >
      {children ?? ''}
    </div>
  )
}

export default Avatar
