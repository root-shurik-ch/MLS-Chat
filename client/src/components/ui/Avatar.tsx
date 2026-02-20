import React from 'react'

interface AvatarProps {
  size?: number
  children?: React.ReactNode
  alt?: string
}

export const Avatar: React.FC<AvatarProps> = ({ size = 40, children, alt }) => {
  const style: React.CSSProperties = {
    width: size,
    height: size,
  }
  return (
    <div
      aria-label={alt}
      style={style}
      className="rounded-full border border-white/20 bg-white/5 flex items-center justify-center text-xs"
    >
      {children ?? ''}
    </div>
  )
}

export default Avatar
