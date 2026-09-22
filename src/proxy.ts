import { NextRequest, NextResponse } from 'next/server';

/**
 * Content-Security-Policy estrita, com um nonce novo a cada requisição.
 * - script-src: só scripts do próprio site ou com o nonce ('strict-dynamic' propaga a confiança aos chunks
 *   que eles carregam). Sem 'unsafe-inline' e sem 'unsafe-eval' em produção.
 * - object-src 'none': bloqueia plugins (Flash/Java/<embed>).
 * - connect-src 'self': o app só conversa com a própria API (/api/search-leads e /api/cities).
 * Em desenvolvimento o React precisa de 'unsafe-eval' e de estilos inline (só nesse modo).
 */
// sha256 de: clip-path:inset(50%);overflow:hidden;white-space:nowrap;border:0;padding:0;width:1px;height:1px;margin:-1px;position:fixed;top:0;left:0
const VISUALLY_HIDDEN_STYLE_HASH = 'sha256-A00EQjUsWzyVOsK+NV2wGoWqwrAPYUwrA2yXGUl/eQo=';

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV === 'development';

  const csp = [
    // Nega tudo por padrão e libera só o que o app usa (cada tipo de recurso abaixo é declarado de forma explícita).
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    // Os campos escondidos dos componentes (base-ui: Select/Checkbox) vêm do servidor com este style="..." fixo.
    // Liberamos só esse estilo exato, por hash, em vez de abrir 'unsafe-inline' para todos os atributos style.
    // (Se uma atualização da biblioteca mudar o estilo, o CSS de segurança em globals.css mantém a tela correta.)
    `style-src-attr 'unsafe-hashes' '${VISUALLY_HIDDEN_STYLE_HASH}'`,
    // Só imagens do próprio site (o app não usa data:/blob: em imagens; o CSV usa blob: em download, que não passa por aqui).
    // Em desenvolvimento o overlay de erros do Next usa data:.
    `img-src 'self'${isDev ? ' data: blob:' : ''}`,
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    // O app não usa iframes, workers, mídia, manifest, <base> nem formulários: tudo negado explicitamente.
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    "media-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    // Violações reais (em navegadores de verdade) chegam em /api/csp-report e ficam nos logs da Vercel.
    'report-uri /api/csp-report',
    'report-to csp-endpoint',
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Reporting-Endpoints', 'csp-endpoint="/api/csp-report"');
  return response;
}

export const config = {
  matcher: [
    {
      // Páginas apenas: a API e os arquivos estáticos (inclusive os dados da Receita em /cnpj) não precisam de CSP com nonce.
      source: '/((?!api|_next/static|_next/image|favicon.ico|cnpj/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
