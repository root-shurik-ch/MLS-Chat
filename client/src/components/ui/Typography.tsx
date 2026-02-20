import React from 'react'

export const Heading: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ children, ...rest }) => {
  return (
    <h2 className="text-xl font-bold tracking-tight" {...rest}>
      {children}
    </h2>
  )
}

export const Body: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ children, className, ...rest }) => {
  return (
    <p className={["text-[15px] leading-relaxed text-white/80", className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </p>
  )
}

export const Mono: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({ children, ...rest }) => {
  return (
    <span className="font-mono text-[13px] text-white/40" {...rest}>
      {children}
    </span>
  )
}

export default { Heading, Body, Mono }
