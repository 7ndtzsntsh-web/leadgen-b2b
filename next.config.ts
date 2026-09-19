import type { NextConfig } from "next";

// A Content-Security-Policy (com nonce por requisição) é definida em src/proxy.ts.
const nextConfig: NextConfig = {
  // Não anuncia "X-Powered-By: Next.js" (informação inútil para o visitante e útil para quem procura versões vulneráveis).
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
          {
            // O app não usa nenhum destes recursos: nega todos (antes a geolocalização estava liberada para o próprio site).
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), browsing-topics=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
