/**
 * KonsRücü — UYAP eklenti API kimliği · lib/konsrucu/uyap-auth.ts (server-only)
 *
 * İki anahtar türü (S14; F17, B51):
 *  1) YENİ — kişiye bağlı EklentiAnahtar ("kr2_…"). Düz anahtar saklanmaz; gelen jeton sha256 ile özetlenip
 *     `ozet` kolonunda aranır. İptal edilmiş, süresi dolmuş, sahibi pasif / GÖRÜNTÜLEYEN / artık kiracı üyesi
 *     olmayan anahtar reddedilir. Kimlik `userId` taşır → Aktivite satırları kişi adıyla yazılır.
 *  2) ESKİ — kiracının tek anahtarı (Ayarlar.senkronToken). 1.9 eklentisi bununla çalışmaya DEVAM EDER, ama
 *     yalnız eski uçlarda ve geçiş süresince (kesme tarihi S42'de verilir). Yeni uçlar (iş kuyruğu, nabız)
 *     `yeniAnahtarKimligi()` ile yalnız yeni anahtarı kabul eder.
 *
 * CORS: eskiden `*` idi. Artık yalnız eklenti kökeni (chrome-extension://<32 harf kimlik>) ya da
 * EKLENTI_KOKENLERI ortam değişkenindeki kökenler yansıtılır. MV3 eklentisinin service worker'ı host izniyle
 * CORS'a takılmadan çağırır; bu sınır yalnız başka web sayfalarının tarayıcıdan çağırmasını keser.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { anahtarKarari, anahtarOzet, sonGorulmeYazilsinMi, yeniAnahtarMi } from '@/lib/konsrucu/senkron/anahtar'

export type UyapKimlik = {
  userId: string | null
  izinli: string[]
  /** Yeni anahtarda EklentiAnahtar.id; eski anahtarda null. */
  anahtarId?: string | null
  tur?: 'YENI' | 'ESKI'
}

function jetonOku(req: Request): string {
  return (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
}

async function yeniAnahtarCoz(jeton: string): Promise<UyapKimlik | null> {
  const a = await prisma.eklentiAnahtar.findUnique({
    where: { ozet: anahtarOzet(jeton) },
    select: {
      id: true, musteriId: true, kullaniciId: true, iptalAt: true, sonKullanma: true, sonGorulme: true,
      kullanici: { select: { aktif: true, rol: true, musteriler: { select: { musteriId: true } } } },
    },
  })
  if (!a) return null
  const karar = anahtarKarari(a)
  if (!karar.ok) return null
  if (sonGorulmeYazilsinMi(a.sonGorulme)) {
    // best-effort: damga yazılamasa da istek geçer
    await prisma.eklentiAnahtar.update({ where: { id: a.id }, data: { sonGorulme: new Date() } }).catch(() => null)
  }
  return { userId: a.kullaniciId, izinli: [a.musteriId], anahtarId: a.id, tur: 'YENI' }
}

/** Eski ve yeni anahtarı kabul eder (eski uçlar). Geçersizse null → 401. */
export async function uyapKimlik(req: Request): Promise<UyapKimlik | null> {
  const token = jetonOku(req)
  if (!token || token.length < 20) return null
  if (yeniAnahtarMi(token)) return yeniAnahtarCoz(token)
  const ay = await prisma.ayarlar.findFirst({ where: { senkronToken: token }, select: { musteriId: true } })
  if (!ay) return null
  return { userId: null, izinli: [ay.musteriId], anahtarId: null, tur: 'ESKI' }
}

export type YeniKimlikSonucu = { ok: true; kimlik: UyapKimlik & { userId: string; anahtarId: string; tur: 'YENI' } } | { ok: false; status: 401; error: string }

/**
 * Yalnız YENİ anahtarı kabul eder (iş kuyruğu, nabız ve sonraki yeni uçlar). Eski kiracı anahtarı
 * geçerli olsa bile reddedilir: "yeni uçların hiçbiri eski anahtarla açılmaz" (06 §4.4).
 */
export async function yeniAnahtarKimligi(req: Request): Promise<YeniKimlikSonucu> {
  const token = jetonOku(req)
  if (!token) return { ok: false, status: 401, error: 'unauthorized' }
  if (!yeniAnahtarMi(token)) return { ok: false, status: 401, error: 'yeni eklenti anahtarı gerekli (Ayarlar > Eklenti anahtarları)' }
  const k = await yeniAnahtarCoz(token)
  if (!k || !k.userId || !k.anahtarId) return { ok: false, status: 401, error: 'unauthorized' }
  return { ok: true, kimlik: { ...k, userId: k.userId, anahtarId: k.anahtarId, tur: 'YENI' } }
}

// ── CORS: yalnız eklenti kökeni ─────────────────────────────────────────────
const EKLENTI_KOKEN_RE = /^chrome-extension:\/\/[a-p]{32}$/

/** İstek kökeni izinliyse onu döndürür (yanıta yansıtılır); değilse null (ACAO başlığı yazılmaz). */
export function izinliKoken(origin: string | null | undefined, env: Record<string, string | undefined> = process.env): string | null {
  if (!origin) return null
  const liste = String(env.EKLENTI_KOKENLERI ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (liste.length) return liste.includes(origin) ? origin : null
  return EKLENTI_KOKEN_RE.test(origin) ? origin : null
}

export function cors<T>(res: NextResponse<T>, req?: Request): NextResponse<T> {
  const koken = izinliKoken(req?.headers.get('origin'))
  if (koken) res.headers.set('Access-Control-Allow-Origin', koken)
  res.headers.set('Vary', 'Origin')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'authorization, content-type, x-eklenti-surum, x-eklenti-cihaz')
  res.headers.set('Access-Control-Max-Age', '86400')
  return res
}
export function corsJson(body: unknown, status = 200, req?: Request): NextResponse {
  return cors(NextResponse.json(body, { status }), req)
}
export function preflight(req?: Request): NextResponse {
  return cors(new NextResponse(null, { status: 204 }), req)
}
