import type { NextConfig } from "next";

// Origens extras liberadas para o dev server (ex.: acessar via IP da rede local
// durante testes em outro dispositivo). Configurável via env para não expor
// topologia de rede fixa no código-fonte; vazio por padrão.
const devOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const isDev = process.env.NODE_ENV !== 'production';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  {
    key: 'Content-Security-Policy',
    // 'unsafe-inline' em script-src é necessário pelo script inline de tema em
    // src/app/layout.tsx (evita flash de tema incorreto antes da 1ª pintura).
    // 'unsafe-eval' só em dev: o React/Turbopack usa eval() para reconstruir
    // stack traces e o Fast Refresh do HMR — nunca roda em build de produção
    // (ver aviso do próprio React), então liberar aqui não afeta o CSP real.
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      // viacep: busca de endereço por CEP (admin de unidades/clientes). nominatim:
      // geocodificação (lat/lon) do endereço pra pin no globo — ambas chamadas
      // direto do navegador, então precisam estar liberadas aqui.
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''} ${process.env.API_ACOSVITAL_URL ?? ''} https://viacep.com.br https://nominatim.openstreetmap.org`,
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  ...(devOrigins.length > 0 ? { allowedDevOrigins: devOrigins } : {}),
  turbopack: {
    root: process.cwd(),
    // konva (via react-filerobot-image-editor, usado só no navegador com
    // ssr:false) faz require('canvas') incondicional ao ser avaliado — canvas
    // é dependência nativa opcional que não instalamos. O Turbopack tenta
    // resolver esse require estaticamente mesmo no branch nunca executado no
    // servidor, quebrando a build inteira; redireciona para um stub vazio.
    resolveAlias: {
      canvas: './src/stubs/emptyModule.js',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
