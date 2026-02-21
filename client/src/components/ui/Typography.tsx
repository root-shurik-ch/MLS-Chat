import React from 'react'

export const Heading: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ children, className, ...rest }) => {
  return (
    <h2 className={['text-xl font-semibold tracking-tight leading-tight', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </h2>
  )
}

export const Body: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ children, className, ...rest }) => {
  return (
    <p className={['text-[15px] leading-relaxed text-white/70', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </p>
  )
}

export const Mono: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({ children, className, ...rest }) => {
  return (
    <span className={['font-mono text-[12px] text-white/35 tracking-wide', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </span>
  )
}

export default { Heading, Body, Mono }
