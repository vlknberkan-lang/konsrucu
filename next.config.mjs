/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lint'i build'i bloke etmesin (dev'de ayrıca çalışır); tip kontrolü AÇIK kalır.
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // pdfjs-dist tarayıcıda çalışır; Node 'canvas' bağımlılığını devre dışı bırak.
    config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false }
    return config
  },
}

export default nextConfig
