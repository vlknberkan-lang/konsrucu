/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lint'i build'i bloke etmesin (dev'de ayrıca çalışır); tip kontrolü AÇIK kalır.
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
