import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.KANZLEIFLOW_TEST_RUN === "isolated" ? ".next-e2e" : ".next",
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {},
};

export default nextConfig;
