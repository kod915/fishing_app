# Szkic sekcji L3 (na kolejne zajęcia)

## L3. Projekt architektury infrastruktury – środowisko cloud

### 3.1. Wymagania

| Wymaganie | Sposób realizacji |
|---|---|
| Load balancer ze skalowaniem | Zarządzany L7 load balancer + autoskalowanie liczby instancji backendu na podstawie obciążenia |
| Baza danych gotowa do skalowania | Zarządzany PostgreSQL z replikacją (Multi-AZ), replikami odczytu i możliwością skalowania pionowego bez zmian w aplikacji |
| Domena publiczna | `fishing.<domena>.pl` – rekord DNS (ALIAS/CNAME) wskazujący na load balancer |
| Certyfikat SSL/TLS poza serwerem aplikacyjnym | Certyfikat wystawiony i odnawiany przez menedżera certyfikatów chmury, terminacja TLS na load balancerze; ruch LB → backend po HTTP w sieci prywatnej |

### 3.2. Architektura docelowa

Projekt opisano na przykładzie **AWS**; w tabeli 3.4 podano odpowiedniki w Azure i GCP.

```
                       Internet
                          │
                 ┌────────▼────────┐
                 │  Route 53 (DNS) │  fishing.domena.pl → ALIAS do ALB
                 └────────┬────────┘
                          │  HTTPS :443
     ┌────────────────────▼─────────────────────┐
     │  Application Load Balancer (ALB)         │  certyfikat z AWS Certificate Manager (ACM)
     │  • terminacja TLS, HTTP→HTTPS redirect   │  health-check: GET /health
     │  • reguły: /api/*, /socket.io/* → backend│  WebSocket: natywne wsparcie, idle timeout ↑
     │             /*                → frontend │
     └───────┬──────────────────────────┬───────┘
             │ HTTP (sieć prywatna)     │
   ┌─────────▼──────────┐    ┌──────────▼─────────┐
   │ ECS Fargate        │    │ ECS Fargate        │        ┌──────────────────────┐
   │ Service: backend   │    │ Service: frontend  │        │ Secrets Manager      │
   │ 2…10 tasków        │    │ nginx + build React│        │ JWT_SECRET,          │
   │ Auto Scaling:      │    │ 2 taski            │        │ DATABASE_URL         │
   │ CPU > 60% → +1     │    └────────────────────┘        └──────────────────────┘
   └───┬─────────────┬──┘
       │             │
┌──────▼──────┐ ┌────▼──────────────────────────────┐
│ ElastiCache │ │ Amazon RDS for PostgreSQL          │
│ Redis       │ │ • Multi-AZ (replika synchroniczna, │
│ (adapter    │ │   automatyczny failover)           │
│  Socket.IO) │ │ • 1…n Read Replica                 │
└─────────────┘ │ • automatyczne backupy, PITR, TLS  │
                └────────────────────────────────────┘

VPC: podsieci publiczne (ALB, NAT) + prywatne (ECS, RDS, Redis). Baza i Redis bez publicznego IP.
```

### 3.3. Opis komponentów

**DNS i domena.** Strefa hostowana w Route 53 dla domeny grupy. Rekord `A ALIAS fishing.domena.pl → ALB`. Opcjonalnie subdomena `api.` dla osobnego hosta API – w projekcie przyjęto jedną domenę i routing po ścieżce (`/api/*`), co upraszcza CORS i ciasteczka.

**Certyfikat TLS.** Wystawiany bezpłatnie przez **AWS Certificate Manager** (walidacja DNS), przypięty do listenera 443 na ALB i **odnawiany automatycznie**. Aplikacja nie przechowuje klucza prywatnego ani nie obsługuje TLS – spełnia to wymaganie „certyfikat nie na serwerze aplikacyjnym”. Listener 80 wykonuje wyłącznie przekierowanie 301 na HTTPS. Polityka TLS: `ELBSecurityPolicy-TLS13-1-2-2021-06` (TLS 1.2+).

**Load balancer.** **Application Load Balancer** (warstwa 7) z dwiema grupami docelowymi: `backend` (ścieżki `/api/*`, `/socket.io/*`, `/health`) i `frontend` (pozostałe). ALB obsługuje WebSocket natywnie; idle timeout podniesiony do 3600 s dla połączeń czatu. Health-check: `GET /health` co 15 s, próg 3 niepowodzeń → instancja wyłączana z ruchu; `GET /ready` dodatkowo sprawdza połączenie z bazą. Dzięki użyciu samego transportu WebSocket po stronie klienta **nie są wymagane sticky sessions**.

**Warstwa aplikacji i skalowanie.** Backend i frontend jako kontenery w **ECS Fargate** (serverless – brak zarządzania maszynami). Backend: min 2 taski (w dwóch strefach dostępności), max 10; **Target Tracking Auto Scaling** – utrzymanie średniego CPU 60 % (alternatywnie: liczba żądań na cel z ALB). Scale-in z cooldownem 300 s i graceful shutdown (aplikacja obsługuje `SIGTERM`). Frontend: 2 taski nginx serwujące statyczny build (alternatywa: S3 + CloudFront).

**Warunek poprawnego skalowania – bezstanowość.** Backend nie trzyma stanu w pamięci: sesja to JWT, dane w PostgreSQL, a komunikaty Socket.IO są rozgłaszane między instancjami przez **ElastiCache Redis** (adapter `@socket.io/redis-adapter`, pub/sub). Bez tego wiadomość wysłana do instancji A nie dotarłaby do użytkowników podłączonych do instancji B. Zweryfikowano lokalnie przy 2 replikach backendu.

**Baza danych.** **Amazon RDS for PostgreSQL 16** w trybie **Multi-AZ** (synchroniczna replika w drugiej strefie, automatyczny failover < 60 s). Skalowanie: pionowe (zmiana klasy instancji bez zmian w aplikacji), poziome dla odczytów przez **Read Replicas** (ranking i lista zawodów mogą być czytane z repliki), storage autoscaling. Backupy automatyczne (retencja 7 dni) + Point-in-Time Recovery. Wymuszone połączenia TLS (`rds.force_ssl`). Alternatywa przy dużej zmienności obciążenia: **Aurora Serverless v2** (skalowanie ACU w sekundach). Baza i Redis znajdują się w podsieciach prywatnych; dostęp wyłącznie z security group ECS.

**Sekrety i konfiguracja.** `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL` w **AWS Secrets Manager**, wstrzykiwane do tasków ECS jako zmienne środowiskowe; brak sekretów w obrazach i repozytorium. Rotacja hasła bazy przez Secrets Manager.

**Obserwowalność.** Logi kontenerów → CloudWatch Logs; metryki ALB (5xx, latencja, liczba połączeń), ECS (CPU/RAM), RDS (połączenia, IOPS, replikacja). Alarmy: 5xx > 1 %, CPU RDS > 80 %, niezdrowe cele w grupie docelowej.

**Sieć i bezpieczeństwo.** VPC z podsieciami publicznymi (ALB, NAT Gateway) i prywatnymi (ECS, RDS, Redis) w 2 AZ. Security groups: ALB ← 0.0.0.0/0:443; ECS ← tylko ALB; RDS/Redis ← tylko ECS. Opcjonalnie **AWS WAF** na ALB (rate limiting na `/api/auth/*`, reguły OWASP).

### 3.4. Odpowiedniki w innych chmurach

| Funkcja | AWS | Azure | GCP |
|---|---|---|---|
| DNS | Route 53 | Azure DNS | Cloud DNS |
| Certyfikat TLS | Certificate Manager | App Service Managed Cert / Key Vault | Google-managed SSL certificate |
| Load balancer L7 | Application Load Balancer | Application Gateway | Global External HTTP(S) LB |
| Kontenery + autoskalowanie | ECS Fargate | Container Apps / App Service | Cloud Run |
| PostgreSQL zarządzany | RDS / Aurora | Database for PostgreSQL Flexible Server | Cloud SQL / AlloyDB |
| Redis | ElastiCache | Azure Cache for Redis | Memorystore |
| Sekrety | Secrets Manager | Key Vault | Secret Manager |

### 3.5. Przygotowanie aplikacji do wdrożenia (zrealizowane)

| Element | Stan |
|---|---|
| Konfiguracja przez zmienne środowiskowe (`PORT`, `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN`, `JWT_SECRET`) | ✔ |
| Frontend niezależny od adresu backendu (ścieżki względne, proxy) | ✔ |
| Adapter Redis dla Socket.IO (wiele instancji) | ✔ |
| Transport WebSocket bez wymogu sticky sessions | ✔ |
| Endpointy `/health` i `/ready` | ✔ |
| Graceful shutdown (`SIGTERM`) | ✔ |
| `trust proxy` (poprawne `X-Forwarded-*` zza LB) | ✔ |
| Obrazy Docker (backend: node:22-slim, non-root; frontend: nginx) | ✔ |
| `docker-compose.yml` odwzorowujący architekturę (nginx → N×backend → PostgreSQL + Redis) | ✔ |
| Schemat bazy + idempotentna migracja | ✔ |

**Lokalna symulacja architektury:** `docker compose up -d --scale backend=3` – nginx pełni rolę load balancera, trzy instancje backendu współdzielą Redis i PostgreSQL. Przetestowano, że wiadomość czatu wysłana przez klienta podłączonego do jednej instancji dociera do klientów podłączonych do pozostałych.

### 3.6. Pozostałe kroki

1. Definicja infrastruktury jako kod (Terraform): VPC, ALB + ACM, ECS, RDS, ElastiCache, Route 53.
2. Pipeline CI/CD (GitHub Actions): build obrazów → ECR → `ecs update-service`; migracje bazy jako jednorazowe zadanie ECS przed wdrożeniem.
3. Utwardzenie aplikacji: `helmet`, rate limiting na logowaniu, brak domyślnego `JWT_SECRET` w produkcji, ukrycie szczegółów błędów 500.
4. Test obciążeniowy (k6) potwierdzający działanie autoskalowania.
