/**
 * KonsRücü — Dilekçe metnini Word (.docx) belgesine çevirir · lib/konsrucu/dilekce-docx.ts (server-only)
 * Times New Roman 12; başlık (T.C. … MAHKEMESİNE) ortalı-bold; etiket/ALL-CAPS başlıklar bold; gövde iki yana yaslı.
 */
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx'

const ETIKETLER = ['DAVACI', 'VEKİLİ', 'DAVALI', 'KONU', 'DAVA ESAS DEĞERİ', 'HUKUKİ NEDENLER', 'HUKUKİ DELİLLER', 'SONUÇ ve İSTEM', 'SONUÇ VE İSTEM', 'AÇIKLAMALAR']

function baslikMi(t: string): boolean {
  if (t.length < 3) return false
  if (ETIKETLER.some((l) => t.startsWith(l))) return true
  // tamamı BÜYÜK harf (küçük harf yok) ve yeterince harf içeriyor → argüman başlığı
  const harf = t.replace(/[^A-Za-zÇĞİıÖŞÜçğıöşü]/g, '')
  return harf.length >= 6 && !/[a-zçğıöşü]/.test(t)
}

export async function dilekceDocx(metin: string, _baslik = 'Dava Dilekçesi'): Promise<Buffer> {
  const lines = String(metin).replace(/\r\n/g, '\n').split('\n')
  const paras = lines.map((raw, i) => {
    const line = raw.replace(/\s+$/, '')
    const t = line.trim()
    if (t === '') return new Paragraph({ children: [] })
    const baslik = i < 7 && (t === 'T.C.' || /MAHKEMES[İI]NE$/i.test(t) || t === 'İHTİYATİ HACİZ TALEPLİDİR')
    const bold = baslik || baslikMi(t)
    return new Paragraph({
      alignment: baslik ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
      spacing: { after: 120 },
      children: [new TextRun({ text: line, bold, font: 'Times New Roman', size: 24 })],
    })
  })
  const doc = new Document({ sections: [{ properties: {}, children: paras }] })
  return Packer.toBuffer(doc)
}
