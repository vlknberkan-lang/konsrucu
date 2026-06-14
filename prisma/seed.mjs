// İlk müşteri (sigortacı) + boş Ayarlar satırı. Hassas değer YOK —
// MERSİS/footer/IBAN gibi alanlar "Şirket Bilgileri" ekranından girilecek.
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const ray = await prisma.musteri.upsert({
    where: { ad: 'Ray Sigorta A.Ş.' },
    update: {},
    create: { ad: 'Ray Sigorta A.Ş.', ayarlar: { create: {} } },
    include: { ayarlar: true },
  })
  console.log('Müşteri hazır:', ray.ad, '· id:', ray.id)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
