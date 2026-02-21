import React from 'react'

type ButtonVariant = 'primary' | 'ghost' | 'icon'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  label?: string
}

const cx = (...classes: Array<string | false | undefined | null>) =>
  classes.filter(Boolean).join(' ')

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', children, label, className, ...rest }) => {
  let base = 'cursor-pointer text-sm font-medium transition-all duration-150 outline-none focus-visible:ring-1 focus-visible:ring-white/30 disabled:cursor-not-allowed'
  let variantClass = ''

  if (variant === 'primary') {
    variantClass = 'bg-white text-black hover:bg-white/90 active:bg-white/80 px-4 py-2 disabled:opacity-30'
  } else if (variant === 'ghost') {
    variantClass = 'bg-transparent text-white/70 border border-white/10 hover:bg-white/5 hover:text-white active:bg-white/10 px-4 py-2 disabled:opacity-30'
  } else {
    variantClass = 'p-2 text-white/40 hover:text-white active:text-white/60 transition-colors disabled:opacity-20'
  }

  return (
    <button className={cx(base, variantClass, className)} {...rest}>
      {children ?? label}
    </button>
  )
}

export default Button
