import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  placeholder?: string
}

export const Input: React.FC<InputProps> = ({ className, ...rest }) => {
  return (
    <input
      {...rest}
      className={[
        'bg-transparent border-b border-white/10 focus:border-white/50 px-0 py-2.5',
        'outline-none transition-colors duration-150 w-full',
        'text-[15px] text-white placeholder:text-white/20',
        'font-sans',
        className ?? '',
      ].join(' ')}
    />
  )
}

export default Input
