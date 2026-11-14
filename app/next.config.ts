import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  // A plataforma de colaboradores abre os anexos em /_blob/<assetId> (como no original).
  async rewrites() {
    return [{ source: "/_blob/:id", destination: "/colaboradores/anexo/:id" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
