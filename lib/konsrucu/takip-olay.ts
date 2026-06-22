/**
 * KonsRücü — takip süreci olayı kaydı · lib/konsrucu/takip-olay.ts (server)
 * Hem manuel (server action) hem UYAP eklentisi (API route) buradan yazar.
 * Olay tipine göre dosya durumunu ilerletir (TEBLIG→TEBLIG_EDILDI vb.).
 */
import { Prisma, DosyaDurum } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const OLAY_TIPLERI = ['TEBLIG', 'ITIRAZ', 'KESINLESTI', 'TAHSILAT', 'HACIZ', 'KAPANDI', 'DURUM'] as const
export type OlayTip = (typeof OLAY_TIPLERI)[number]

export const OLAY_ETIKET: Record<string, string> = {
  TEBLIG: 'Tebliğ edildi', ITIRAZ: 'İtiraz', KESINLESTI: 'Kesinleşti', TAHSILAT: 'Tahsilat',
  HACIZ: 'Haciz', KAPANDI: 'Kapandı', DURUM: 'Durum / not',
}

const OLAY_DURUM: Record<string, DosyaDurum | undefined> = {
  TEBLIG: DosyaDurum.TEBLIG_EDILDI,
  ITIRAZ: DosyaDurum.ITIRAZ,
  KESINLESTI: DosyaDurum.KESINLESTI,
  TAHSILAT: DosyaDurum.TAHSIL,
  KAPANDI: DosyaDurum.KAPANDI,
}

export async function takipOlayKaydet(
  dosyaId: string,
  kullaniciId: string | null,
  o: { tip: string; tarih: Date | null; tutar: Prisma.Decimal | null; aciklama: string | null; hamJson?: Prisma.InputJsonValue },
) {
  const yeniDurum = OLAY_DURUM[o.tip]
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.takipOlayi.create({ data: { dosyaId, tip: o.tip, tarih: o.tarih, tutar: o.tutar, aciklama: o.aciklama, hamJson: o.hamJson } }),
    prisma.aktivite.create({ data: { dosyaId, kullaniciId, eylem: `Takip olayı: ${OLAY_ETIKET[o.tip] ?? o.tip}${o.tutar != null ? ` · ${o.tutar} TL` : ''}` } }),
  ]
  if (yeniDurum) ops.unshift(prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: { durum: yeniDurum } }))
  await prisma.$transaction(ops)
}
