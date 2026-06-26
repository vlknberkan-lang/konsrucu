/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lint'i build'i bloke etmesin (dev'de ayrıca çalışır); tip kontrolü AÇIK kalır.
  eslint: { ignoreDuringBuilds: true },
  // pdfjs-dist SUNUCUDA da kullanılıyor (makbuz metin çıkarımı, lib/konsrucu/pdf-metin.ts).
  // Bundle DIŞI tut → worker/path çözümü normal Node modülü gibi çalışsın (serverless'ta bundle sorunu olmaz).
  experimental: { serverComponentsExternalPackages: ['pdfjs-dist'] },
  webpack: (config) => {
    // pdfjs-dist 'canvas' (node-canvas) ister; metin çıkarımı için gerekmez → devre dışı bırak.
    config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false }
    return config
  },
}

export default nextConfig
