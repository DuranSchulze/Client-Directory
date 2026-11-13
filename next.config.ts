import type { NextConfig } from "next";

// Vercel uses its default serverless output. The Docker image builds with BUILD_STANDALONE=1 for a self-contained server.js.
const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  poweredByHeader: false,
};

export default nextConfig;
