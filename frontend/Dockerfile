# Frontend: build Vite -> statyczne pliki serwowane przez nginx (bez roota)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Zmienne VITE_* można podać w czasie builda; domyślnie puste = ten sam origin (zalecane)
ARG VITE_API_URL
ARG VITE_SOCKET_URL
RUN npm run build

# 1.29+ (Alpine 3.23): nowszy openssl/brotli niż 1.27. apk upgrade domyka HIGH/CRITICAL.
FROM nginxinc/nginx-unprivileged:1.29-alpine
USER root
RUN apk update && apk upgrade --no-cache
USER nginx
# Adres backendu, do którego nginx proxuje /api i /socket.io
ENV BACKEND_URL=http://backend:5000
# connect-src w CSP; 'self' wystarcza przy tym samym origin (także dla wss://)
ENV CSP_CONNECT_SRC="'self'"
# 0 = HSTS wyłączony; na domenie z HTTPS ustaw 31536000
ENV HSTS_MAX_AGE=0
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
