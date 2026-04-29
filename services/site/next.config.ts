import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["next-mdx-remote"],
  output: "standalone",
  allowedDevOrigins: ["www.nidalheim.com", "www-staging.nidalheim.com"],
};

export default nextConfig;
