import type { NextConfig } from "next";

// A Content-Security-Policy (com nonce por requisição) é definida em src/proxy.ts.
const nextConfig: NextConfig = {
  // Não anuncia "X-Powered-By: Next.js" (informação inútil para o visitante e útil para quem procura versões vulneráveis).
  poweredByHeader: false,
  // Subresource Integrity: cada script do site sai com `integrity="sha384-..."`, então o navegador se recusa a executar
  // qualquer arquivo alterado no caminho (CDN comprometida, proxy, cache adulterado). Recurso experimental do Next.
  experimental: {
    sri: { algorithm: 'sha384' },
  },
  async headers() {
    return [
      {
        // As respostas da API (JSON e eventos SSE) nunca devem ser interpretadas como página: CSP que nega tudo.
        // (As páginas recebem a CSP com nonce de src/proxy.ts; a API fica fora dele.)
        source: '/api/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" },
        ],
      },
      {
        // Dados que a busca lê (Receita em public/cnpj, EUA em public/us): são só dados, e buscador não deve indexar
        // telefone de empresa.
        source: '/:dir(cnpj|us)/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
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
