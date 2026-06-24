/**
 * KonsRücü — marka markı + kelime markası · components/brand/konsrucu-mark.tsx
 * "K" aperture markı; aproksiyon noktası KonsRücü teal'i (#2fcad4).
 * Ayrı bir logo dosyası yok — wordmark da burada.
 */

export function KonsRucuMark({ size = 32, dot = '#2fcad4', fill = '#fff' }: { size?: number; dot?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <rect x="6" y="10" width="14" height="80" rx="2" fill={fill} />
      <path d="M22 50 L62 12 L78 12 L36 50 L78 88 L62 88 Z" fill={fill} />
      <circle cx="50" cy="50" r="8" fill={dot} />
    </svg>
  )
}

/** Kelime markası — "Kons" + teal "Rücu". onDark=true ise koyu zemin için beyaz "Kons". */
export function KonsRucuWordmark({ size = 24, onDark = false }: { size?: number; onDark?: boolean }) {
  const teal = onDark ? '#46d6e0' : 'hsl(var(--kr))'
  return (
    <span
      className="font-wordmark inline-flex items-baseline font-extrabold tracking-brand"
      style={{ fontSize: size }}
    >
      <span style={{ color: onDark ? '#fff' : 'hsl(var(--foreground))' }}>Kons</span>
      <span style={{ color: teal }}>Rücu</span>
    </span>
  )
}
