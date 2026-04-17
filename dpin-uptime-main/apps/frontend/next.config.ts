import dotenv from "dotenv";
import path from "node:path";
import type { NextConfig } from "next";

// Load env from monorepo root so NEXT_PUBLIC_* vars are available
dotenv.config({ path: "../../.env" });

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
