import type { NextConfig } from "next";

// Production builds are a static export served by FastAPI. Rewrites are not
// available in that mode, so only `next dev` proxies the API.
const nextConfig: NextConfig =
  process.env.NODE_ENV === "development"
    ? {
        rewrites: async () => [
          {
            source: "/api/:path*",
            destination: "http://127.0.0.1:8000/api/:path*",
          },
        ],
      }
    : { output: "export" };

export default nextConfig;
