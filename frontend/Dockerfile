# Frontend: build Vite -> statyczne pliki serwowane przez nginx
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Zmienne VITE_* można podać w czasie builda, np. --build-arg VITE_API_URL=https://api.domen.pl/api
ARG VITE_API_URL
ARG VITE_SOCKET_URL
RUN npm run build

FROM nginx:1.27-alpine
# Adres backendu, do którego nginx proxuje /api i /socket.io (nadpisywalny przez env)
ENV BACKEND_URL=http://backend:5000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://localhost/healthz || exit 1
