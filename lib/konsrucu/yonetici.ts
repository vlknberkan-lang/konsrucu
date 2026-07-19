/**
 * KonsLaw — Superadmin (platform sahibi) yetkisi · lib/konsrucu/yonetici.ts (server)
 * /yonetim paneli ve plan/kredi mutasyonlarının TEK kapısı. Tenant ADMIN'i değil,
 * PLATFORM sahibi: e-posta allowlist'i env'den (SUPERADMIN_EPOSTA, virgüllü) gelir;
 * env yoksa kurucu hesabına düşer. Yetkisizler için sayfa 404 gibi davranır (redirect).
 */

const VARSAYILAN = 'vberkanbiyikli@gmail.com'

export function superadminMi(eposta: string | null | undefined): boolean {
  if (!eposta) return false
  const liste = (process.env.SUPERADMIN_EPOSTA ?? VARSAYILAN)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return liste.includes(eposta.trim().toLowerCase())
}
