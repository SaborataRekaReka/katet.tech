import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  images: {
    dangerouslyAllowLocalIP: true,
    qualities: [65, 75, 90, 95, 100],
    localPatterns: [
      {
        pathname: "/assets/**",
      },
      {
        pathname: "/assets/katet/services/generated/**",
        search: "?v=20260530-1516",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "katet.tech",
        pathname: "/directus/assets/**",
      },
      {
        protocol: "https",
        hostname: "www.katet.tech",
        pathname: "/directus/assets/**",
      },
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
