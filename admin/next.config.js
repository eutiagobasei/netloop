/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['react-force-graph-2d', 'force-graph'],
}

module.exports = nextConfig
