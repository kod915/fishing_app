# Bezpieczeństwo serwerów i aplikacji Web – Laboratorium

## Sprawozdanie grupowe: aplikacja „Fishing Manager”

| | |
|---|---|
| **Prowadzący** | mgr inż. Jakub Tomaszewski |
| **Skład grupy** | *[imiona i nazwiska członków grupy]* |
| **Repozytorium** | https://github.com/kod915/fishing_app |
| **Data** | 27.10.2026 |
| **Zakres** | L1 – wybór aplikacji, L2 – implementacja w środowisku DEV |

---

## L1. Wybór aplikacji do implementacji

### 1.1. Opis aplikacji

**Fishing Manager** to aplikacja webowa do obsługi zawodów wędkarskich. Organizator (administrator) tworzy zawody i otwiera zapisy, wędkarze zapisują się i automatycznie otrzymują sektor oraz numer stanowiska, sędziowie w trakcie zawodów rejestrują złowione ryby (gatunek, waga), a system na bieżąco wylicza ranking. Każde zawody mają własny czat działający w czasie rzeczywistym dla uczestników i organizatorów.

### 1.2. Spełnienie wymagań funkcjonalnych

| Wymaganie | Realizacja |
|---|---|
| Prosta strona web z logowaniem (sesją) | Rejestracja i logowanie e-mail + hasło. Hasła przechowywane jako hash **bcrypt** (cost 10). Sesja realizowana tokenem **JWT** (ważność 24 h) przesyłanym w nagłówku `Authorization: Bearer`. Trzy role: `ADMIN`, `JUDGE`, `ANGLER`. |
| Interakcja z użytkownikiem – forum, chat, komentarze | **Czat zawodów w czasie rzeczywistym** (Socket.IO / WebSocket). Dostęp mają zapisani uczestnicy i organizatorzy; historia wiadomości zapisywana w bazie; po zerwaniu połączenia klient dociąga pominięte wiadomości. |
| Baza danych – dowolna | **PostgreSQL 16** – 5 tabel relacyjnych z kluczami obcymi, ograniczeniami CHECK/UNIQUE i typami ENUM. |
| Technologia – znana grupie | **JavaScript na całym stosie**: Node.js 22 + Express (backend), React 18 + Vite (frontend). |

### 1.3. Stos technologiczny

| Warstwa | Technologia |
|---|---|
| Frontend | React 18, Vite 5, socket.io-client |
| Backend | Node.js 22, Express 4, Socket.IO 4, jsonwebtoken, bcrypt, pg |
| Baza danych | PostgreSQL 16 |
| Cache / pub-sub | Redis 7 (adapter Socket.IO dla wielu instancji) |
| Konteneryzacja | Docker, Docker Compose, nginx (reverse proxy) |

---

## L2. Implementacja podstawowej funkcjonalności (środowisko DEV)

### 2.1. Architektura aplikacji

```
┌──────────────────────┐     HTTP /api/*      ┌─────────────────────────┐
│  Przeglądarka        │ ───────────────────▶ │  Backend (Express)      │
│  React SPA (Vite)    │   WebSocket          │  REST API + Socket.IO   │
│                      │ ◀──────────────────▶ │                         │
└──────────────────────┘   /socket.io         └───────────┬─────────────┘
                                                          │ SQL (pg)
                                                          ▼
                                              ┌─────────────────────────┐
                                              │  PostgreSQL             │
                                              │  users, tournaments,    │
                                              │  registrations, catches,│
                                              │  chat_messages          │
                                              └─────────────────────────┘
```

Frontend używa wyłącznie ścieżek względnych (`/api`, `/socket.io`). W środowisku DEV serwer Vite proxuje je do backendu; w produkcji robi to nginx / load balancer. Dzięki temu ten sam build działa pod dowolną domeną bez zmian w kodzie.

### 2.2. Model danych

| Tabela | Kluczowe pola i ograniczenia |
|---|---|
| `users` | `email` UNIQUE, `password_hash`, `role` ENUM(ADMIN, JUDGE, ANGLER) |
| `tournaments` | `name`, `location`, `event_date`, `max_participants` CHECK > 0, `spots_per_sector` CHECK > 0, `status` ENUM(DRAFT, OPEN, IN_PROGRESS, FINISHED), `created_by` FK |
| `registrations` | FK `tournament_id`, FK `user_id`, `sector`, `spot_number`; UNIQUE(tournament, user), UNIQUE(tournament, sector, spot) |
| `catches` | FK `tournament_id`, FK `user_id`, `species`, `weight_grams` CHECK > 0, `registered_by` FK (sędzia) |
| `chat_messages` | FK `tournament_id`, FK `user_id`, `content` CHECK 1–1000 znaków, indeks (tournament, created_at) |

Cykl życia zawodów (maszyna stanów egzekwowana w backendzie):
`DRAFT → OPEN → IN_PROGRESS → FINISHED` (dodatkowo `OPEN → DRAFT` – wycofanie publikacji). Zapisy są możliwe tylko w stanie `OPEN`, rejestracja połowów tylko w `IN_PROGRESS`.

### 2.3. Interfejs API

| Metoda i ścieżka | Dostęp | Opis |
|---|---|---|
| `POST /api/auth/register` | publiczny | Rejestracja konta (rola ANGLER) |
| `POST /api/auth/login` | publiczny | Logowanie, zwraca JWT |
| `GET /api/tournaments` | publiczny (+opcjonalny JWT) | Lista zawodów; wersje robocze widzą tylko organizatorzy; dla zalogowanego pole `is_registered` |
| `POST /api/tournaments` | ADMIN | Utworzenie zawodów (walidacja nazwy, daty, limitów) |
| `PATCH /api/tournaments/:id/status` | ADMIN, JUDGE | Zmiana statusu zgodnie z maszyną stanów |
| `POST /api/registrations` | zalogowany | Zapis na zawody; transakcja z blokadą `FOR UPDATE` – przydział pierwszego wolnego stanowiska, egzekwowanie limitu |
| `GET /api/registrations/tournament/:id` | zalogowany | Lista uczestników (e-maile tylko dla organizatorów) |
| `POST /api/catches` | ADMIN, JUDGE | Rejestracja połowu (tylko zapisany zawodnik, tylko zawody w trakcie) |
| `GET /api/catches/leaderboard/:id` | publiczny | Ranking: `RANK()` po łącznej wadze, największej rybie, liczbie ryb |
| `GET /api/chat/:id?after=<id>` | zalogowany z dostępem | Historia czatu (ostatnie 100 lub nowsze niż `after`) |
| `GET /health`, `GET /ready` | publiczny | Health-checki (liveness / readiness z `SELECT 1`) |
| Socket.IO `chat:join`, `chat:send`, `chat:message` | JWT w handshake | Czat w czasie rzeczywistym, pokoje per zawody |

### 2.4. Elementy bezpieczeństwa zaimplementowane w aplikacji

- **Hasła**: bcrypt z solą, nigdy nie są zwracane przez API.
- **Uwierzytelnianie**: JWT podpisany HS256, weryfikowany w middleware REST i w handshake Socket.IO (ten sam token dla obu kanałów).
- **Autoryzacja**: middleware `requireRole(...)` na trasach modyfikujących dane; dostęp do czatu i listy uczestników sprawdzany po stronie serwera, nie tylko w UI.
- **SQL Injection**: wszystkie zapytania parametryzowane (`$1, $2…`), brak konkatenacji danych użytkownika do SQL.
- **Walidacja wejścia**: identyfikatory, wagi, daty i teksty walidowane w warstwie aplikacji (kody 400/404/409 zamiast 500); druga linia obrony w ograniczeniach bazy (CHECK, UNIQUE, FK).
- **Race conditions**: zapisy na zawody w transakcji z blokadą wiersza; zmiana statusu z warunkiem optymistycznym.
- **Minimalizacja danych**: adresy e-mail uczestników widoczne tylko dla organizatorów.
- **CORS**: lista dozwolonych originów z konfiguracji, wspólna dla REST i WebSocket.
- **Kontenery**: backend uruchamiany jako użytkownik nieuprzywilejowany, obrazy wieloetapowe bez zależności deweloperskich.

### 2.5. Uruchomienie w środowisku DEV

```bash
# baza danych (Docker)
docker run -d --name fishing_db_pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fishing_db -p 5432:5432 postgres:16-alpine
psql ... -f backend/db/schema.sql -f backend/db/seed.sql
cd backend && cp .env.example .env && npm install && node db/seedUsers.js && npm run dev   # :5000
cd frontend && npm install && npm run dev                                                   # :5173
```

Alternatywnie cały stos jedną komendą: `docker compose up --build -d` → aplikacja pod `http://localhost:8080`.

Konta demo (hasło `haslo123`): `admin@wedkowanie.pl` (ADMIN), `sedzia@wedkowanie.pl` (JUDGE), `jan.kowalski@gmail.com`, `piotr.nowak@gmail.com` (ANGLER).

### 2.6. Scenariusz prezentacji

1. Logowanie jako **Admin** → Panel Admina → utworzenie zawodów z otwartymi zapisami.
2. Logowanie jako **Jan Kowalski** (wędkarz) → „Zapisz się” → system przydziela sektor i stanowisko, przycisk znika, pojawia się dostęp do czatu.
3. Czat w dwóch oknach (wędkarz + admin) – wiadomości w czasie rzeczywistym, oznaczenie „Organizator”.
4. Admin → „Rozpocznij zawody”. **Sędzia** → zakładka Waga → wybór zawodów i zawodnika z listy → wpisanie wagi.
5. Zakładka Wyniki – ranking na żywo z pozycjami (remisy ex aequo).
6. Próby obejścia: zapis na zawody w stanie DRAFT (409), połów dla niezapisanego (409), nieprawidłowe ID (400), czat bez zapisu (403).

### 2.7. Weryfikacja

Przygotowano skrypty testowe wywołujące API (ok. 55 przypadków): walidacja wejścia, maszyna stanów, równoległe zapisy 6 użytkowników na 3 miejsca (dokładnie 3 sukcesy, unikalne stanowiska), ponowne wykorzystanie zwolnionego stanowiska, uprawnienia do e-maili, remisy w rankingu, dociąganie historii czatu. Wszystkie przeszły.

