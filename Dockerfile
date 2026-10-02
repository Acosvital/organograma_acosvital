# syntax=docker/dockerfile:1

# ---- Dependências ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- Runtime ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Limite de cabeçalho maior que o padrão do Node (16 KB): o domínio é
# compartilhado com outros sistemas da Aços Vital, cujos cookies também vêm
# em cada requisição. Com o padrão, cookies grandes davam HTTP 431 antes de
# o app conseguir responder (e, portanto, antes de poder renovar/encolher o
# cookie de sessão).
ENV NODE_OPTIONS=--max-http-header-size=65536

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
