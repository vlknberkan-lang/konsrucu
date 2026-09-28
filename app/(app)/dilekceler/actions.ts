'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { ctx } from '@/lib/konsrucu/db'
import { AiDurdurulduHata, KrediYetersizHata } from '@/lib/konsrucu/ai-kredi'
import { aiOturumu, aiKapiHatasiMi, acilamayanUyarisi } from '@/lib/ai/cagri'
import { KVKK_KAPALI_MESAJI, yuzeyAcik } from '@/lib/ai/bayrak'
import {
  calismaBaglami, DILEKCE_CALISMA_SISTEM, DILEKCE_TUR_ADLARI,
  taslakKaydetGirdi, taslakUretGirdi,
  type CalismaDilekceTuru, type CalismaGecmisi,
} from '@/lib/konsrucu/dilekce-calisma'

type Hata = { ok: false; error: string }
const tarih = (v: Date | null | undefined) => v?.toISOString() ?? null

/** Dava geçmişinden yeni taslak üretir; önceki çıktıları veya dosya durumunu değiştirmez.
 *  S09: yüzey 'dilekce' lib/ai/cagri.ts sarmalayıcısından geçer. Tarafların TCKN/VKN'si ve adresi,
 *  vekil adresi ve UETS'i AI'a GİTMEZ (künyeyi kod/avukat basar); kalan bağlam maskeli, taslak sunucuda
 *  geri açılır. Açılamayan jeton kalırsa uyarı olarak gösterilir. */
export async function davaTaslagiUret(input: {
  dosyaId: string; tur: CalismaDilekceTuru; talimat: string; kaynakBelgeIds?: string[]
}): Promise<{ ok: true; ciktiId: string; metin: string; uyarilar: string[] } | Hata> {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!dbUser.aktif || dbUser.rol === 'GORUNTULEYEN') return { ok: false, error: 'Dilekçe hazırlama yetkiniz yok.' }
  if (!aktifMusteriId) return { ok: false, error: 'Aktif müşteri bulunamadı.' }
  const parsed = taslakUretGirdi.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Dosya, dilekçe türü veya talimat geçersiz. Talimat en fazla 8.000 karakter olabilir.' }
  const g = parsed.data
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, error: 'Dilekçe üretimi için sunucuda AI bağlantısı yapılandırılmamış. Mevcut taslakları düzenleyebilirsiniz.' }
  // KVKK kapısı: yüzey canlıda kapalıysa dosya verisi hiç okunmaz; mevcut taslaklar düzenlenebilir.
  if (!yuzeyAcik('dilekce')) return { ok: false, error: `${KVKK_KAPALI_MESAJI} Yeni dilekçeyi dosyanın Dava durağındaki "Dilekçe" bölümünden şablonla hazırlayın; buradaki mevcut taslakları düzenleyebilirsiniz.` }

  try {
    const musteri = await prisma.musteri.findFirst({ where: { id: aktifMusteriId, aktif: true }, select: { id: true } })
    if (!musteri) return { ok: false, error: 'Bu müşteri pasif olduğu için dilekçe hazırlanamaz.' }
    const dosya = await prisma.rucuDosyasi.findFirst({
      where: { id: g.dosyaId, musteriId: aktifMusteriId },
      include: {
        borclular: { select: { adUnvan: true, rol: true, tcVkn: true }, orderBy: { id: 'asc' } }, // tcVkn yalnız maskeleme için
        belgeler: {
          ...(g.kaynakBelgeIds ? { where: { id: { in: g.kaynakBelgeIds } } } : {}),
          select: { id: true, dosyaAdi: true, extractedText: true, kategori: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 150,
        },
        asamalar: { orderBy: { sira: 'asc' }, take: 50 },
        notlar: { orderBy: { createdAt: 'desc' }, take: 100, select: { metin: true, tip: true, createdAt: true } },
        olaylar: { orderBy: [{ tarih: 'desc' }, { createdAt: 'desc' }], take: 100, select: { tip: true, aciklama: true, tarih: true, createdAt: true } },
        ciktilar: { where: { tip: 'DILEKCE' }, orderBy: { createdAt: 'desc' }, take: 5, select: { icerik: true, durum: true, createdAt: true } },
        odemeler: { orderBy: { tarih: 'desc' }, take: 50, select: { tarih: true, tutar: true, aciklama: true, haricMi: true } },
      },
    })
    if (!dosya) return { ok: false, error: 'Dosya aktif müşteride bulunamadı veya erişiminiz yok.' }
    if (g.kaynakBelgeIds?.some((id) => !dosya.belgeler.some((b) => b.id === id))) {
      return { ok: false, error: 'Seçilen kaynaklardan biri bu dosyaya ait değil veya artık mevcut değil.' }
    }
    const ayarlar = await prisma.ayarlar.findUnique({
      where: { musteriId: aktifMusteriId },
      select: { alacakliUnvan: true, vekilAd: true, vekilAdres: true, vekilUets: true },
    })
    const gecmis: CalismaGecmisi[] = [
      ...dosya.asamalar.map((a) => ({ tur: `AŞAMA ${a.tur}`, tarih: tarih(a.baslangic ?? a.createdAt), metin: JSON.stringify({ durum: a.durum, sonuc: a.sonuc, esasNo: a.kimlikNo, birim: a.birim, bitis: tarih(a.bitis), ozet: a.ozet, detay: a.detayJson }) })),
      ...dosya.olaylar.map((o) => ({ tur: `OLAY ${o.tip}`, tarih: tarih(o.tarih ?? o.createdAt), metin: o.aciklama ?? o.tip })),
      ...dosya.notlar.map((n) => ({ tur: `BÜRO NOTU ${n.tip ?? ''}`, tarih: tarih(n.createdAt), metin: n.metin })),
      ...dosya.ciktilar.filter((c) => c.icerik).map((c) => ({ tur: `ÖNCEKİ DİLEKÇE (kayıt durumu: ${c.durum ?? 'TASLAK'}; içeriği doğrulanmış olgu değildir)`, tarih: tarih(c.createdAt), metin: c.icerik! })),
    ]
    const baglam = calismaBaglami({
      kunye: {
        hukukDosyaNo: dosya.hukukDosyaNo, hasarDosyaNo: dosya.hasarDosyaNo,
        // KVKK (S09): vekil adresi/UETS ve tarafların TCKN/VKN'si ile adresi AI'a gitmez → taslakta yer tutucu kalır.
        musteriUnvani: ayarlar?.alacakliUnvan, vekil: ayarlar?.vekilAd,
        kayitliTaraflar: dosya.borclular.map((b) => ({ adUnvan: b.adUnvan, rol: b.rol })),
        icraDairesi: dosya.icraDairesi, icraEsas: dosya.icraDosyaNo,
        sigortali: dosya.sigortaliUnvan, kazaTarihi: tarih(dosya.kazaTarihi), kazaYeri: dosya.kazaYeri,
        olusSekli: dosya.olusSekli, kusurDurumu: dosya.kusurDurumu, rucuSebebi: dosya.rucuSebebi,
        asilAlacak: dosya.asilAlacak?.toString(), rucuTutari: dosya.rucuTutari?.toString(),
        odemeler: dosya.odemeler.map((o) => ({ tarih: tarih(o.tarih), tutar: o.tutar?.toString(), aciklama: o.aciklama, hesapDisi: o.haricMi })),
      },
      belgeler: dosya.belgeler.map((b) => ({ id: b.id, ad: b.dosyaAdi, metin: b.extractedText })),
      gecmis,
    })
    if (!baglam.kaynakSayisi) return { ok: false, error: 'Taslak için okunabilir belge metni veya dosya geçmişi bulunamadı. Önce UYAP evrakını içe aktarın ya da dosyaya açıklama ekleyin.' }
    if (dosya.belgeler.length === 150 || dosya.notlar.length === 100 || dosya.olaylar.length === 100 || dosya.asamalar.length === 50 || dosya.ciktilar.length === 5 || dosya.odemeler.length === 50) {
      baglam.uyarilar.push('Yoğun dosya geçmişinde sınırlı sayıda kayıt kullanıldı; eski kayıtların tamamı taslağa dahil olmayabilir.')
    }
    // Bilinen kişisel veriler (DB sırasıyla → deterministik jetonlar). TCKN/VKN ve adres bağlamda yok;
    // belge metinlerinde geçerlerse jetonlansın diye maske kaynağına verilir.
    const oturum = aiOturumu({
      yuzey: 'dilekce',
      ai: { musteriId: aktifMusteriId, dosyaId: dosya.id },
      maske: {
        kisiler: [...dosya.borclular.map((b) => b.adUnvan), dosya.sigortaliUnvan],
        kimlikler: dosya.borclular.map((b) => b.tcVkn),
        plakalar: [dosya.sigortaliPlaka, dosya.karsiPlaka],
      },
    })
    const y = await oturum.iste({
      model: 'claude-sonnet-4-6', maxTokens: 6500,
      sistem: DILEKCE_CALISMA_SISTEM,
      icerik: [{ tur: 'json', veri: { istenenTur: DILEKCE_TUR_ADLARI[g.tur], avukatTalimati: g.talimat, kaynakVerisi: JSON.parse(baglam.metin) } }],
    })
    if (y.kesildi) return { ok: false, error: 'Taslak uzunluk sınırında yarım kaldı ve kaydedilmedi. Talimatı veya kaynak seçimini daraltıp yeniden deneyin.' }
    const metin = y.metin.trim()
    if (metin.length < 60 || metin.length > 100000) return { ok: false, error: 'AI geçerli bir dilekçe metni döndürmedi. Taslak kaydedilmedi.' }
    const jetonUyarisi = acilamayanUyarisi(y.acilamayanJetonlar)
    if (jetonUyarisi) baglam.uyarilar.push(jetonUyarisi)
    const cikti = await prisma.$transaction(async (tx) => {
      // AI yanıtı beklenirken dosya silinmiş/taşınmışsa yazma.
      const halaErisilir = await tx.rucuDosyasi.findFirst({ where: { id: dosya.id, musteriId: aktifMusteriId }, select: { id: true } })
      if (!halaErisilir) throw new Error('Dosya erişimi değişti')
      const yeni = await tx.uretilenCikti.create({
        data: {
          dosyaId: dosya.id, tip: 'DILEKCE', durum: 'TASLAK', icerik: metin,
          kaynaklar: { create: baglam.belgeIds.map((belgeId) => ({ belgeId })) },
        },
        select: { id: true },
      })
      await tx.aktivite.create({ data: { dosyaId: dosya.id, kullaniciId: dbUser.id, eylem: `${DILEKCE_TUR_ADLARI[g.tur]} taslağı dosya geçmişinden oluşturuldu` } })
      return yeni
    })
    revalidatePath('/dilekceler')
    revalidatePath(`/akilli-giris/${dosya.id}`)
    return { ok: true, ciktiId: cikti.id, metin, uyarilar: [...baglam.uyarilar, 'Taslak avukat incelemesi gerektirir. Kaynak işaretlerini, ⟨…⟩ alanlarını, tarafları ve talepleri kontrol edin.'] }
  } catch (e) {
    if (e instanceof KrediYetersizHata || e instanceof AiDurdurulduHata || aiKapiHatasiMi(e)) return { ok: false, error: e.message }
    // Belge metni veya üçüncü taraf hata gövdeleri loglanmaz.
    console.error('[dilekceler] taslak üretilemedi', e instanceof Error ? e.name : 'Bilinmeyen hata')
    return { ok: false, error: 'Taslak oluşturulamadı. Önceki dilekçeleriniz korunuyor; lütfen tekrar deneyin.' }
  }
}

/** Beklenen metni WHERE'e dahil ederek başka kullanıcının düzenlemesini ezmez. */
export async function davaTaslagiKaydet(input: {
  ciktiId: string; icerik: string; beklenenIcerik: string | null; durum: 'TASLAK' | 'IMZAYA_GIDEN'
}): Promise<{ ok: true } | Hata> {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!dbUser.aktif || dbUser.rol === 'GORUNTULEYEN') return { ok: false, error: 'Dilekçe düzenleme yetkiniz yok.' }
  if (!aktifMusteriId) return { ok: false, error: 'Aktif müşteri bulunamadı.' }
  const parsed = taslakKaydetGirdi.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Dilekçe metni veya durumu geçersiz. Metin 1–100.000 karakter olmalı.' }
  const g = parsed.data
  try {
    const musteri = await prisma.musteri.findFirst({ where: { id: aktifMusteriId, aktif: true }, select: { id: true } })
    if (!musteri) return { ok: false, error: 'Bu müşteri pasif olduğu için dilekçe değiştirilemez.' }
    const cikti = await prisma.uretilenCikti.findFirst({
      where: { id: g.ciktiId, tip: 'DILEKCE', dosya: { musteriId: aktifMusteriId } },
      select: { dosyaId: true, durum: true },
    })
    if (!cikti) return { ok: false, error: 'Dilekçe aktif müşteride bulunamadı veya erişiminiz yok.' }
    if (cikti.durum === 'GONDERILDI') return { ok: false, error: 'Gönderildi olarak kayıtlı dilekçe değiştirilemez. Yeni bir taslak oluşturun.' }
    const kaydedildi = await prisma.$transaction(async (tx) => {
      const sonuc = await tx.uretilenCikti.updateMany({
        where: {
          id: g.ciktiId, tip: 'DILEKCE', dosya: { musteriId: aktifMusteriId }, icerik: g.beklenenIcerik,
          OR: [{ durum: null }, { durum: { in: ['TASLAK', 'IMZAYA_GIDEN'] } }],
        },
        data: { icerik: g.icerik, durum: g.durum },
      })
      if (sonuc.count !== 1) return false
      await tx.aktivite.create({ data: { dosyaId: cikti.dosyaId, kullaniciId: dbUser.id, eylem: g.durum === 'IMZAYA_GIDEN' ? 'Dilekçe imzaya hazır olarak kaydedildi' : 'Dilekçe taslağı düzenlendi' } })
      return true
    })
    if (!kaydedildi) return { ok: false, error: 'Dilekçe başka bir oturumda değişti. Metninizi kopyalayıp saklayın ve güncel kaydı yeniden açın.' }
    revalidatePath('/dilekceler')
    revalidatePath(`/akilli-giris/${cikti.dosyaId}`)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Dilekçe kaydedilemedi. Düzenlediğiniz metni koruyup tekrar deneyin.' }
  }
}
