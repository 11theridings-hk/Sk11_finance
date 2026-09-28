import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist'],
};

export default nextConfig;
