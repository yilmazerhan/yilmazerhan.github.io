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
COPY package.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install
COPY . .
RUN npm run build

# ─── Production stage ────────────────────────────────────────────────────────
FROM nginx:1.25-alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
