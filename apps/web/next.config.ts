import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@glasshouse/schema", "@glasshouse/translate"],
  eslint: { ignoreDuringBuilds: true },
  // The workspace packages import each other with ".js" suffixes (the Node ESM convention the
  // connector needs). Webpack must be told those may resolve to TypeScript sources.
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] };
    return config;
  },
};

export default nextConfig;
