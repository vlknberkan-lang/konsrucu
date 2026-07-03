/**
 * KonsRücü — Sistem olay günlüğü · lib/konsrucu/sistem-olay.ts (server-only)
 * Hafif hata izleme (Sentry'siz): cron başarısızlığı, mail gönderim hatası, senkron uyarısı gibi
 * "sessizce ölmemesi gereken" olaylar SistemOlay tablosuna düşer; Şirket Bilgileri'ndeki
 * "Sistem Olayları" kartından okunur. Kayıt hatası ASLA çağıranı bozmaz (best-effort).
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type SistemOlayTip = 'CRON_HATA' | 'MAIL_HATA' | 'SENKRON_UYARI' | 'HATA'

export async function sistemOlayKaydet(tip: SistemOlayTip, kaynak: string, mesaj: string, detay?: unknown): Promise<void> {
  try {
    await prisma.sistemOlay.create({
      data: {
        tip,
        kaynak: kaynak.slice(0, 120),
        mesaj: mesaj.slice(0, 4000),
        detayJson: detay === undefined ? undefined : (detay as Prisma.InputJsonValue),
      },
    })
  } catch (e) {
    console.error('sistemOlay yazılamadı:', (e as Error).message)
  }
}
