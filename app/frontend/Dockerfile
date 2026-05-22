# ─── Development stage ───────────────────────────────────────────────────────
FROM node:22-alpine AS development

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install --no-frozen-lockfile

ENV NODE_ENV=development
CMD ["pnpm", "dev", "--host", "0.0.0.0"]

# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm build

# ─── Production stage ────────────────────────────────────────────────────────
FROM nginx:1.25-alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
