import React from 'react'

type ButtonVariant = 'primary' | 'ghost' | 'icon'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  label?: string
}

const classNames = (...classes: Array<string | false | undefined>) =>
  classes.filter(Boolean).join(' ')

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', children, label, ...rest }) => {
  const base = ''
  let btnClass = ''

  if (variant === 'primary') {
    // Primary: black text on white background
    btnClass = 'bg-white text-black hover:bg-white/90 px-4 py-2 transition-all'
  } else if (variant === 'ghost') {
    // Ghost: transparent with a light border
    btnClass = 'bg-transparent text-white border border-white/10 hover:bg-white/5'
  } else {
    // Icon: compact icon button
    btnClass = 'p-2 text-white/60 hover:text-white transition-colors'
  }

  return (
    <button className={classNames(base, btnClass)} {...rest}>
      {children ?? label}
    </button>
  )
}

export default Button
