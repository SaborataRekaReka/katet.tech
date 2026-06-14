import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  images: {
    dangerouslyAllowLocalIP: true,
    qualities: [75, 90, 95, 100],
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "8055",
        pathname: "/assets/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8055",
        pathname: "/assets/**",
      },
    ],
  },
};

export default nextConfig;
