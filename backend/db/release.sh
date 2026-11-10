#!/bin/sh
# Krok release uruchamiany PRZED wdrożeniem nowej wersji aplikacji, jako osobne
# zadanie (Container Apps Job / krok CI) z uprawnieniami administratora bazy.
# Wymaga: DATABASE_URL (admin), APP_DB_PASSWORD (hasło roli aplikacji), NODE_ENV=production.
# Migracje nigdy nie są uruchamiane ze startu aplikacji – N replik nie może się ścigać.
set -e

echo "[release] rola aplikacji"
node db/roles.js create

echo "[release] migracje"
# Obraz produkcyjny nie ma npm CLI (Trivy) – bin lokalny
node ./node_modules/node-pg-migrate/bin/node-pg-migrate.js up -m db/migrations --migration-file-language sql

echo "[release] uprawnienia"
node db/roles.js grant

echo "[release] OK"
