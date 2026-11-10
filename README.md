# Fishing Manager

Aplikacja webowa do obsługi zawodów wędkarskich. Organizator tworzy zawody i otwiera zapisy, wędkarze zapisują się i automatycznie dostają sektor oraz numer stanowiska, sędziowie w trakcie zawodów rejestrują połowy, a system na bieżąco liczy ranking. Każde zawody mają własny czat działający w czasie rzeczywistym.

Projekt powstał w ramach laboratorium **Bezpieczeństwo serwerów i aplikacji Web** (PWr).

## Stos technologiczny

| Warstwa | Technologia |
|---|---|
| Frontend | React 18, Vite 5, socket.io-client |
| Backend | Node.js 22, Express 4, Socket.IO 4 |
| Uwierzytelnianie | JWT 15 min (HS256) + refresh token w cookie HttpOnly, bcrypt (cost 12) |
| Zabezpieczenia HTTP | helmet, express-rate-limit (+ Redis store), CORS z listy, limit body 16 kB |
| Baza danych | PostgreSQL 16 (sterownik `pg`), migracje `node-pg-migrate` |
| Skalowanie czatu | Redis 7 + `@socket.io/redis-adapter` |
| Konteneryzacja | Docker (obrazy bez roota), Docker Compose, nginx-unprivileged |
| Testy | `node:test` (jednostkowe), skrypty e2e |
| Chmura (propozycja) | Azure Container Apps, PostgreSQL Flexible Server, Managed Redis, Key Vault – [`infra/azure/`](infra/azure/README.md) |

## Funkcjonalności

- Rejestracja i logowanie (hasła min. 12 znaków, bcrypt; token dostępu 15 min + odświeżanie sesji rotowanym refresh tokenem w cookie HttpOnly/SameSite=Strict; wylogowanie unieważnia token)
- Trzy role: `ADMIN` (tworzy zawody, zmienia status), `JUDGE` (zmienia status, rejestruje połowy), `ANGLER` (zapisuje się, czat, wyniki)
- Cykl życia zawodów `DRAFT → OPEN → IN_PROGRESS → FINISHED` egzekwowany po stronie serwera
- Zapisy na zawody w transakcji z blokadą wiersza – egzekwowanie limitu uczestników, automatyczny przydział pierwszego wolnego stanowiska (sektory A, B, C… po `spots_per_sector` miejsc)
- Wypisanie się z zawodów (tylko gdy `OPEN`) – zwalnia stanowisko; organizator może usunąć uczestnika
- Rejestracja połowów tylko dla zapisanych zawodników i tylko podczas trwania zawodów; korekta i usunięcie (soft delete) połowu przez organizatora
- Ranking liczony w SQL (`RANK()` po łącznej wadze → największej rybie → liczbie ryb); zawody `DRAFT` niewidoczne dla wędkarzy (404)
- Czat per zawody przez WebSocket; dostęp tylko dla uczestników i organizatorów; dociąganie pominiętych wiadomości po reconnect; rozłączenie po wygaśnięciu tokena i automatyczne ponowne połączenie z nowym; throttling 5 wiadomości / 5 s
- Rate limiting: 300 żądań/min na `/api`, 10 prób / 15 min na `/api/auth` (licznik w Redis przy wielu instancjach)
- Odpowiedzi błędów nie zdradzają szczegółów wewnętrznych; identyczna odpowiedź dla złego hasła i nieistniejącego konta
- Health-checki `GET /health` i `GET /ready`, graceful shutdown, konfiguracja przez zmienne środowiskowe; w produkcji brak `JWT_SECRET` (≥ 32 znaki) lub `DATABASE_URL` zatrzymuje start

## Struktura repozytorium

```
backend/            Express + Socket.IO
  server.js         punkt wejścia
  src/controllers   logika endpointów
  src/routes        definicje tras
  src/middleware    JWT, role
  src/services      refresh tokeny, dostęp do zawodów/czatu
  src/sockets       czat (Socket.IO)
  src/config        env (fail-fast), pg, redis
  src/utils         walidacja wejścia
  db/migrations/    migracje SQL (node-pg-migrate) – jedyne źródło schematu
  db/seed.sql       dane demo (idempotentne)
  db/seedUsers.js   seed + hasła kont demo (zablokowane w produkcji)
  db/release.sh     krok release: rola DB → migracje → uprawnienia
  db/roles.js       rola fishing_app o ograniczonych uprawnieniach
  db/createAdmin.js pierwszy administrator w produkcji
  test/             testy jednostkowe (node:test)
frontend/           React + Vite
  src/components    Auth, Tournaments, Judge, Chat, Admin
  src/api/client.js wrapper fetch: odświeżanie sesji, retry po 401
  nginx.conf.template  reverse proxy + nagłówki bezpieczeństwa (CSP, HSTS…)
infra/azure/        propozycja wdrożenia w Azure (README, deploy.sh, api.yaml)
infra/oci/          CI/CD + DAST na GitHubie i Oracle Cloud (ZAP, OCIR, DevOps)
.github/workflows/  CI/CD (testy, audyt, Trivy, DAST/ZAP, OIDC do Azure, OCIR)
docker-compose.yml  pełny stack: nginx → N × backend → PostgreSQL + Redis (+ job migracji)
```

## Uruchomienie – środowisko deweloperskie

Wymagania: Node.js ≥ 20, Docker (dla bazy) lub lokalny PostgreSQL.

```bash
# 1. Baza danych w kontenerze
docker run -d --name fishing_db_pg \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fishing_db \
  -p 5432:5432 postgres:16-alpine

# 2. Backend (port 5000)
cd backend
cp .env.example .env        # ustaw DATABASE_URL, jeśli inne hasło/port
npm install
npm run db:migrate          # schemat bazy (migracje są idempotentne)
npm run db:seed             # dane demo + hasło "haslo123" (tylko poza produkcją)
npm run dev

# 3. Frontend (port 5173) – w drugim terminalu
cd frontend
npm install
npm run dev
```

Aplikacja: http://localhost:5173. Vite proxuje `/api` i `/socket.io` do backendu na porcie 5000.

Testy jednostkowe backendu: `cd backend && npm test`.

### Konta demo

Hasło dla wszystkich: `haslo123`

| E-mail | Rola |
|---|---|
| `admin@wedkowanie.pl` | ADMIN |
| `sedzia@wedkowanie.pl` | JUDGE |
| `jan.kowalski@gmail.com` | ANGLER |
| `piotr.nowak@gmail.com` | ANGLER |

## Uruchomienie – Docker Compose (pełny stack)

Odwzorowanie architektury docelowej: nginx jako reverse proxy, kilka instancji backendu, Redis do rozgłaszania czatu między instancjami, PostgreSQL.

```bash
# JWT_SECRET jest wymagany (min. 32 znaki) – compose odmówi startu bez niego
export JWT_SECRET=$(openssl rand -base64 48)          # PowerShell: $env:JWT_SECRET = "<32+ znaki>"
docker compose up --build -d --scale backend=2
docker compose run --rm -e NODE_ENV=development backend npm run db:seed   # konta demo (opcjonalnie)
```

Aplikacja: http://localhost:8080. Usługa `migrate` uruchamia migracje przed startem backendu (tak jak krok release w chmurze); backend działa z `NODE_ENV=production`. Zatrzymanie: `docker compose down` (z `-v` usuwa też dane).

## Konfiguracja (zmienne środowiskowe backendu)

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `NODE_ENV` | `development` | w `production` wymagane są `JWT_SECRET` i `DATABASE_URL`, TLS do bazy, cookie `Secure` |
| `PORT` | `5000` | port HTTP |
| `DATABASE_URL` | wartość deweloperska (localhost) | połączenie z PostgreSQL; **wymagane w produkcji** |
| `PG_SSL_CA` | – | opcjonalny certyfikat CA dla TLS do bazy |
| `PG_SSL` | `require` w produkcji | `disable` tylko dla lokalnego compose (baza bez TLS w sieci Dockera) |
| `PG_POOL_MAX` | `8` | rozmiar puli połączeń (× liczba instancji < `max_connections`) |
| `JWT_SECRET` | wartość deweloperska | **wymagane w produkcji, min. 32 znaki** |
| `JWT_EXPIRES_IN` | `15m` | ważność tokena dostępu |
| `REFRESH_TOKEN_DAYS` | `30` | ważność refresh tokena (cookie) |
| `CORS_ORIGIN` | – (brak = tylko ten sam origin) | dozwolone originy (CSV); nigdy `*` |
| `REDIS_URL` | – | adapter Redis dla Socket.IO i store rate-limitera (wymagane przy >1 instancji) |
| `TRUST_PROXY_HOPS` | `1` | liczba reverse proxy przed aplikacją (poprawne IP dla rate limitingu) |

Frontend: `VITE_API_URL`, `VITE_SOCKET_URL` (opcjonalne; domyślnie ścieżki względne) – patrz `frontend/.env.example`.

## API

| Metoda i ścieżka | Dostęp | Opis |
|---|---|---|
| `POST /api/auth/register` | publiczny | rejestracja (rola ANGLER); hasło 12–72 znaki |
| `POST /api/auth/login` | publiczny | logowanie: JWT (15 min) + cookie `refresh_token` |
| `POST /api/auth/refresh` | cookie | nowy JWT, refresh token rotowany |
| `POST /api/auth/logout` | cookie | unieważnienie refresh tokena |
| `GET /api/tournaments` | publiczny (+ opcjonalny JWT) | lista zawodów; `DRAFT` tylko dla organizatorów; pole `is_registered` |
| `POST /api/tournaments` | ADMIN | utworzenie zawodów |
| `PATCH /api/tournaments/:id/status` | ADMIN, JUDGE | zmiana statusu wg maszyny stanów |
| `POST /api/registrations` | zalogowany | zapis na zawody |
| `GET /api/registrations/tournament/:id` | zalogowany | uczestnicy (e-maile tylko dla organizatorów) |
| `DELETE /api/registrations/tournament/:id` | zalogowany | wypisanie się (tylko `OPEN`) |
| `DELETE /api/registrations/tournament/:id/users/:userId` | ADMIN, JUDGE | usunięcie uczestnika |
| `POST /api/catches` | ADMIN, JUDGE | rejestracja połowu (`weight_grams`) |
| `GET /api/catches/tournament/:id` | ADMIN, JUDGE | lista połowów |
| `PATCH /api/catches/:id` | ADMIN, JUDGE | korekta gatunku/wagi |
| `DELETE /api/catches/:id` | ADMIN, JUDGE | usunięcie połowu (soft delete) |
| `GET /api/catches/leaderboard/:id` | publiczny (+ opcjonalny JWT) | ranking; `DRAFT` → 404 dla wędkarzy |
| `GET /api/chat/:id?after=<id>` | zalogowany z dostępem | historia czatu |
| `GET /health`, `GET /ready` | publiczny | liveness / readiness (DB + Redis) |

Socket.IO (token JWT w `auth.token`): `chat:join(tournamentId)`, `chat:send({tournamentId, content})`, zdarzenia `chat:message`, `auth:expired`.

## Migracje bazy

Schemat jest w całości opisany migracjami SQL w `backend/db/migrations/` (`node-pg-migrate`). `npm run db:migrate` jest idempotentne – działa zarówno na pustej bazie, jak i na bazie utworzonej ze starszego `schema.sql`. Migracje **nie** są uruchamiane przy starcie aplikacji; w środowisku z wieloma instancjami wykonuje je osobny krok release (`backend/db/release.sh`), który dodatkowo tworzy ograniczoną rolę `fishing_app` dla aplikacji.

## Wdrożenie w chmurze

Propozycja bezpiecznego wdrożenia w Azure (Container Apps z wewnętrznym `api` i publicznym `web`, prywatny PostgreSQL, Managed Redis, Key Vault z managed identity, CI/CD przez OIDC) wraz ze skryptem `deploy.sh` i listą kontrolną bezpieczeństwa: [`infra/azure/README.md`](infra/azure/README.md).

CI/CD z bramką DAST (OWASP ZAP), automatycznym deployem na VM Oracle (`git push` → testy → SSH → `docker compose up`) oraz opcjonalnie OCIR/DevOps: [`infra/oci/README.md`](infra/oci/README.md).

## Znane braki / dalsze kroki

- brak procedury usunięcia konta i eksportu danych użytkownika (RODO)
- brak testów integracyjnych w CI (wymagają bazy) – jest skrypt e2e uruchamiany ręcznie; DAST (ZAP baseline) stawia compose w pipeline
- token dostępu trzymany w pamięci/`localStorage` – ograniczony do 15 min, sesję chroni cookie HttpOnly
