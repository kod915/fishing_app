# Fishing Manager

Aplikacja webowa do obsługi zawodów wędkarskich. Organizator tworzy zawody i otwiera zapisy, wędkarze zapisują się i automatycznie dostają sektor oraz numer stanowiska, sędziowie w trakcie zawodów rejestrują połowy, a system na bieżąco liczy ranking. Każde zawody mają własny czat działający w czasie rzeczywistym.

Projekt powstał w ramach laboratorium **Bezpieczeństwo serwerów i aplikacji Web** (PWr).

## Stos technologiczny

| Warstwa | Technologia |
|---|---|
| Frontend | React 18, Vite 5, socket.io-client |
| Backend | Node.js 22, Express 4, Socket.IO 4 |
| Uwierzytelnianie | JWT (jsonwebtoken) + bcrypt |
| Baza danych | PostgreSQL 16 (sterownik `pg`) |
| Skalowanie czatu | Redis 7 + `@socket.io/redis-adapter` |
| Konteneryzacja | Docker, Docker Compose, nginx |

## Funkcjonalności

- Rejestracja i logowanie (hasła hashowane bcrypt, sesja na JWT ważnym 24 h)
- Trzy role: `ADMIN` (tworzy zawody, zmienia status), `JUDGE` (zmienia status, rejestruje połowy), `ANGLER` (zapisuje się, czat, wyniki)
- Cykl życia zawodów `DRAFT → OPEN → IN_PROGRESS → FINISHED` egzekwowany po stronie serwera
- Zapisy na zawody w transakcji z blokadą wiersza – egzekwowanie limitu uczestników, automatyczny przydział pierwszego wolnego stanowiska (sektory A, B, C… po `spots_per_sector` miejsc)
- Rejestracja połowów tylko dla zapisanych zawodników i tylko podczas trwania zawodów
- Ranking liczony w SQL (`RANK()` po łącznej wadze → największej rybie → liczbie ryb)
- Czat per zawody przez WebSocket; dostęp tylko dla uczestników i organizatorów; dociąganie pominiętych wiadomości po reconnect
- Health-checki `GET /health` i `GET /ready`, graceful shutdown, konfiguracja przez zmienne środowiskowe

## Struktura repozytorium

```
backend/            Express + Socket.IO
  server.js         punkt wejścia
  src/controllers   logika endpointów
  src/routes        definicje tras
  src/middleware    JWT, role
  src/sockets       czat (Socket.IO)
  src/config        pg, redis
  src/utils         walidacja wejścia
  db/schema.sql     schemat bazy
  db/seed.sql       dane startowe
  db/seedUsers.js   ustawia hasła kont demo
  db/migrations/    migracje dla istniejących baz
frontend/           React + Vite
  src/components    Auth, Tournaments, Judge, Chat, Admin
  src/api/client.js wrapper fetch + adresy API
  nginx.conf.template  reverse proxy dla obrazu produkcyjnego
docker-compose.yml  pełny stack: nginx → N × backend → PostgreSQL + Redis
```

## Uruchomienie – środowisko deweloperskie

Wymagania: Node.js ≥ 20, Docker (dla bazy) lub lokalny PostgreSQL.

```bash
# 1. Baza danych w kontenerze
docker run -d --name fishing_db_pg \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fishing_db \
  -p 5432:5432 postgres:16-alpine

# 2. Schemat i dane startowe
docker exec -i fishing_db_pg psql -U postgres -d fishing_db < backend/db/schema.sql
docker exec -i fishing_db_pg psql -U postgres -d fishing_db < backend/db/seed.sql

# 3. Backend (port 5000)
cd backend
cp .env.example .env
npm install
node db/seedUsers.js        # ustawia hasło "haslo123" dla kont demo
npm run dev

# 4. Frontend (port 5173) – w drugim terminalu
cd frontend
npm install
npm run dev
```

W PowerShell zamiast `<` użyj: `Get-Content backend\db\schema.sql -Raw | docker exec -i fishing_db_pg psql -U postgres -d fishing_db`.

Aplikacja: http://localhost:5173. Vite proxuje `/api` i `/socket.io` do backendu na porcie 5000.

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
docker compose up --build -d --scale backend=2
docker compose exec backend node db/seedUsers.js
```

Aplikacja: http://localhost:8080. Schemat i seed są wgrywane automatycznie przy pierwszym starcie (pusty wolumen). Zatrzymanie: `docker compose down` (z `-v` usuwa też dane).

## Konfiguracja (zmienne środowiskowe backendu)

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PORT` | `5000` | port HTTP |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/fishing_db` | połączenie z PostgreSQL |
| `JWT_SECRET` | wartość deweloperska | **zmień w produkcji** |
| `CORS_ORIGIN` | `http://localhost:5173` | dozwolone originy (CSV) |
| `REDIS_URL` | – | włącza adapter Redis dla Socket.IO (wymagane przy >1 instancji) |
| `TRUST_PROXY_HOPS` | `1` | liczba reverse proxy przed aplikacją |

Frontend: `VITE_API_URL`, `VITE_SOCKET_URL` (opcjonalne; domyślnie ścieżki względne) – patrz `frontend/.env.example`.

## API

| Metoda i ścieżka | Dostęp | Opis |
|---|---|---|
| `POST /api/auth/register` | publiczny | rejestracja (rola ANGLER) |
| `POST /api/auth/login` | publiczny | logowanie, zwraca JWT |
| `GET /api/tournaments` | publiczny (+ opcjonalny JWT) | lista zawodów; `DRAFT` tylko dla organizatorów; pole `is_registered` |
| `POST /api/tournaments` | ADMIN | utworzenie zawodów |
| `PATCH /api/tournaments/:id/status` | ADMIN, JUDGE | zmiana statusu wg maszyny stanów |
| `POST /api/registrations` | zalogowany | zapis na zawody |
| `GET /api/registrations/tournament/:id` | zalogowany | uczestnicy (e-maile tylko dla organizatorów) |
| `POST /api/catches` | ADMIN, JUDGE | rejestracja połowu |
| `GET /api/catches/leaderboard/:id` | publiczny | ranking |
| `GET /api/chat/:id?after=<id>` | zalogowany z dostępem | historia czatu |
| `GET /health`, `GET /ready` | publiczny | liveness / readiness |

Socket.IO (token JWT w `auth.token`): `chat:join(tournamentId)`, `chat:send({tournamentId, content})`, zdarzenie `chat:message`.

## Migracja istniejącej bazy

Jeśli baza powstała ze starszej wersji `schema.sql`:

```bash
docker exec -i fishing_db_pg psql -U postgres -d fishing_db < backend/db/migrations/001_logic_fixes.sql
```

Skrypt jest idempotentny.

## Znane braki

- brak rate limitingu na logowaniu i nagłówków `helmet`
- `JWT_SECRET` ma wartość domyślną – aplikacja powinna odmawiać startu bez niego w produkcji
- JWT w `localStorage` (docelowo httpOnly cookie)
- odpowiedzi 500 zwracają `err.message`
- brak testów jednostkowych (są skrypty testujące API end-to-end)
