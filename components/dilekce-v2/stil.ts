/** KonsRücü — Dilekçe v2 bileşenlerinin ortak sınıfları (tasarım sistemi token'larıyla; yeni renk yok). */
export const odak = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
const dugme = `inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 ${odak}`
export const birincilDugme = `${dugme} bg-primary text-primary-foreground hover:bg-primary/90`
export const ikincilDugme = `${dugme} border border-border bg-surface text-foreground hover:bg-surface-muted`
export const sessizDugme = `${dugme} text-primary hover:bg-primary/10`
export const kucukDugme = `inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 ${odak}`
export const kart = 'rounded-2xl border border-border bg-card shadow-card'
export const alan = `w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60 ${odak}`
