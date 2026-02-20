import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  // Optional placeholder to be explicit for UI design system
  placeholder?: string
}

export const Input: React.FC<InputProps> = (props) => {
  const { className, ...rest } = props
  return (
    <input
      {...rest}
      className={[
        'bg-transparent border-b border-white/10 focus:border-white px-0 py-2 outline-none transition-all w-full',
        className ?? '',
      ].join(' ')}
    />
  )
}

export default Input
