// design-sync render shim for next/link.
// Renders a plain anchor so DS components that use <Link> render statically in
// preview cards without a Next AppRouter mounted. Strips next-only props so they
// don't leak onto the DOM. NOT shipped to consumers.
import * as React from 'react'

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href?: string | { pathname?: string }
  prefetch?: boolean
  replace?: boolean
  scroll?: boolean
  shallow?: boolean
  passHref?: boolean
  legacyBehavior?: boolean
  children?: React.ReactNode
}

export default function Link({
  href,
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  shallow: _shallow,
  passHref: _passHref,
  legacyBehavior: _legacyBehavior,
  children,
  ...rest
}: LinkProps) {
  const resolved = typeof href === 'string' ? href : href?.pathname ?? '#'
  return (
    <a href={resolved} {...rest}>
      {children}
    </a>
  )
}
