import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tree-shake heavy icon / animation libs so server components only pull in
  // the symbols they actually use. Big cold-start win on Vercel.
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "date-fns"],
  },
};

export default nextConfig;
