/**
 * KonsRücü — "imzaya hazır" müvekkil onayı kapısı yükleyicisi (server-only) · lib/konsrucu/dava/imza-kapisi-veri.ts
 *
 * Dilekçe modülü (Bağla aşaması) "imzaya hazır" düğmesini sunucu tarafında bu çağrıyla kilitler:
 *   const k = await imzaKapisiYukle(dosyaId, musteriId, 'DAVA')
 *   if (!k || !k.acik) return { ok: false, error: k?.mesaj ?? 'Dosya bulunamadı.' }
 * Kapsam: dosya aktif müvekkilde (`musteriId`) aranır; başka müvekkilin dosyası `null` döner.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import type { OnayKaydiOzet } from '../arabuluculuk/onay'
import { enErkenIhtiyatli } from '../arabuluculuk/veri'
import { imzaKapisi, type ImzaKapisi } from './imza-kapisi'

export async function imzaKapisiYukle(dosyaId: string, musteriId: string, dilekceTuru: string, davaId?: string | null, simdi: Date = new Date()): Promise<ImzaKapisi | null> {
  const dosya = await prisma.rucuDosyasi.findFirst({ where: { id: dosyaId, musteriId }, select: { id: true } })
  if (!dosya) return null
  const [onaylar, sureler] = await Promise.all([
    prisma.onayKaydi.findMany({ where: { dosyaId, silindiAt: null } }),
    prisma.sure.findMany({ where: { dosyaId, tur: 'IIK67', silindiAt: null }, select: { onerilenIhtiyatli: true, durum: true, silindiAt: true } }),
  ])
  const ozet: OnayKaydiOzet[] = onaylar.map((o) => ({ id: o.id, tur: o.tur, sonuc: o.sonuc, alinmaAt: o.alinmaAt, istisnaGerekce: o.istisnaGerekce, silindiAt: o.silindiAt, davaId: o.davaId }))
  return imzaKapisi({ dilekceTuru, onaylar: ozet, ihtiyatliSonGun: enErkenIhtiyatli(sureler), davaId: davaId ?? null, simdi })
}
