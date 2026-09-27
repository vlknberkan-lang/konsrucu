/**
 * KonsRücü — Anlık senkron iş kuyruğu · GET /api/uyap/is/sira?cihaz=…&surum=…&oturum=1  (S22)
 * Eklenti UYAP sekmesi açıkken 10 sn'de bir sorar. Çağrı NABIZ da taşır (sürüm, cihaz, UYAP oturumu açık mı)
 * → EklentiNabiz; program sayfasındaki "UYAP bağlantısı" göstergesi bundan ölçülür (tahmin değil).
 * Yanıt: bekleyen iş sayısı, en eski birkaç işin kimliği ve türü (kişisel veri yok) ve sunucu bayrakları.
 * YALNIZ YENİ (kişiye bağlı) ANAHTAR: eski şirket anahtarı bu uca giremez (06 §4.4).
 */
import { corsJson, preflight, yeniAnahtarKimligi } from '@/lib/konsrucu/uyap-auth'
import { cihazGecerli, nabizYaz, siradakiIsler } from '@/lib/konsrucu/senkron/is-kuyrugu'
import { sunucuOzellikleri } from '@/lib/konsrucu/senkron/ozellikler'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) {
  return preflight(req)
}

export async function GET(req: Request) {
  const kr = await yeniAnahtarKimligi(req)
  if (!kr.ok) return corsJson({ ok: false, error: kr.error }, kr.status, req)
  const url = new URL(req.url)
  const cihaz = url.searchParams.get('cihaz') ?? req.headers.get('x-eklenti-cihaz') ?? ''
  if (!cihazGecerli(cihaz)) return corsJson({ ok: false, error: 'cihaz kimliği geçersiz' }, 400, req)
  const surum = url.searchParams.get('surum') ?? req.headers.get('x-eklenti-surum')
  const uyapOturum = url.searchParams.get('oturum') === '1'

  await nabizYaz(kr.kimlik, { cihaz, surum, uyapOturum })
  const ozellikler = sunucuOzellikleri()
  const isler = ozellikler.isKuyrugu ? await siradakiIsler(kr.kimlik.izinli) : []
  return corsJson({ ok: true, bekleyen: isler.length, isler, ozellikler, yoklamaMs: 10_000 }, 200, req)
}
