import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@glasshouse/schema", "@glasshouse/translate"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
