# ─── Development stage ───────────────────────────────────────────────────────
FROM node:22-alpine AS development

WORKDIR /workspace
COPY package.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install

ENV NODE_ENV=development
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app
# Build with pnpm + the committed lockfile. `npm install` ignored pnpm-lock.yaml
# (non-deterministic versions on every build) and silently discarded the
# `pnpm.overrides` block in package.json — so the deliberate `dompurify >=3.4.0`
# transitive pin never applied to the image that actually shipped.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# ─── Production stage ────────────────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:1.25-alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
