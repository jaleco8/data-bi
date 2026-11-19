/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@data-bi/shared'],
  webpack: (config) => {
    // el paquete compartido usa imports ESM con extensión .js que apuntan a .ts
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};
export default nextConfig;
