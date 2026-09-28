/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lint'i build'i bloke etmesin (dev'de ayrıca çalışır); tip kontrolü AÇIK kalır.
  eslint: { ignoreDuringBuilds: true },
  // pdfjs-dist SUNUCUDA da kullanılıyor (makbuz metin çıkarımı, lib/konsrucu/pdf-metin.ts).
  // Bundle DIŞI tut → worker/path çözümü normal Node modülü gibi çalışsın (serverless'ta bundle sorunu olmaz).
  experimental: {
    serverComponentsExternalPackages: ['pdfjs-dist'],
    // pdfjs Node'da "fake worker"ı pdf.worker.js'ten yükler; dosya dinamik çözüldüğü için izleyici onu paketlemiyordu →
    // canlıda her PDF sessizce boş dönüyordu (UYAP evrakı ve makbuz metni hiç çıkmadı, 28.09.2026). Açıkça ekle.
    outputFileTracingIncludes: { '/**': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.js'] },
  },
  webpack: (config) => {
    // pdfjs-dist 'canvas' (node-canvas) ister; metin çıkarımı için gerekmez → devre dışı bırak.
    config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false }
    return config
  },
}

export default nextConfig
