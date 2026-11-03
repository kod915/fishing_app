# Wdrożenie Fishing Manager w Azure – propozycja

Dokument opisuje, jak uruchomić aplikację w Azure w sposób bezpieczny i skalowalny, z użyciem
usług zarządzanych. Skrypt `deploy.sh` wykonuje kroki 4.0–4.10 automatycznie; poniżej uzasadnienie
każdego elementu, kroki ręczne (Redis, domena, pierwszy admin) i lista kontrolna bezpieczeństwa.

Pliki w tym katalogu:

| Plik | Rola |
|---|---|
| `deploy.sh` | jednorazowe postawienie środowiska (az CLI, bash/WSL/Cloud Shell) |
| `api.yaml` | sondy zdrowia i reguły skalowania aplikacji `api` |
| `../../.github/workflows/deploy.yml` | CI/CD: testy → obrazy → migracje → rollout (logowanie OIDC) |
| `../../backend/db/release.sh` | krok release uruchamiany jako Container Apps Job: rola DB, migracje, uprawnienia |
| `../../backend/db/createAdmin.js` | jednorazowe utworzenie pierwszego administratora |

## 1. Architektura docelowa

```
Internet
   | HTTPS (certyfikat zarządzany, własna domena)
   v
[ opcjonalnie: Azure Front Door + WAF ]
   v
+---------------------- VNet 10.20.0.0/16 ------------------------------+
|  Container Apps environment (snet-aca)                                |
|    web  (nginx-unprivileged, ingress ZEWNĘTRZNY, 2–4 repliki)         |
|      |  /api i /socket.io  -> http://api  (ruch wewnętrzny, szyfrowany)|
|    api  (Node, ingress WEWNĘTRZNY, 2–6 replik)                         |
|      |                 |                     |                         |
|   PostgreSQL        Managed Redis         Key Vault                    |
|   Flexible Server   (private endpoint,    (sekrety przez               |
|   (snet-pg, TLS)     rediss://, Enterprise) managed identity)          |
|    job-release (migracje, ręczny)     ACR (obrazy, bez admin usera)    |
+-----------------------------------------------------------------------+
Log Analytics + alerty Azure Monitor
```

| Potrzeba | Usługa Azure | Rozmiar startowy | Uwagi |
|---|---|---|---|
| Kontenery, load balancing, autoskalowanie | **Azure Container Apps** (workload profiles, w VNecie) | api 2–6 × 0.5 vCPU / 1 GiB; web 2–4 × 0.25 vCPU / 0.5 GiB | wbudowany ingress = load balancer, HTTPS only, WebSockety wspierane |
| Baza danych | **Azure Database for PostgreSQL Flexible Server**, dostęp prywatny | Burstable B1ms (demo); General Purpose + HA strefowe (realne zawody) | backupy automatyczne, retencja 14 dni |
| Rozgłaszanie Socket.IO między replikami | **Azure Managed Redis**, polityka klastrowania Enterprise | najmniejszy Balanced | Azure Cache for Redis jest wycofywany – od razu Managed Redis |
| Obrazy | **Azure Container Registry** Basic | – | pull przez managed identity, admin user wyłączony |
| Sekrety | **Key Vault** (tryb RBAC, purge protection) | Standard | referencje z Container Apps; zero sekretów w plikach i obrazach |
| Logi i alerty | **Log Analytics** + Azure Monitor | pay-as-you-go | sekcja 7 |
| WAF (opcjonalnie) | **Azure Front Door Premium** | – | sekcja 4.11 |

**Dlaczego tak:**

- **Jeden origin.** nginx (`web`) proxuje `/api` i `/socket.io` do `api` – dokładnie jak w `docker-compose.yml`. Brak CORS, brak tokenów cross-site, cookie `refresh_token` działa z `SameSite=Strict`.
- **`api` nie ma publicznego adresu.** Z internetu widać tylko `web`.
- **WebSockety przez ingress Container Apps.** Domyślny timeout bezczynności to 4 min; ping Socket.IO (25 s) utrzymuje połączenie.
- **Wdrożenie zrywa sockety.** Nowa rewizja restartuje repliki, klienci łączą się ponownie – frontend dociąga pominięte wiadomości przez `?after=<id>` i odświeża token przy reconnect.
- **`api` nigdy nie skaluje do zera.** Minimum 2 repliki – restart jednej nie wyłącza czatu.
- **Migracje poza startem aplikacji.** N replik nie może ścigać się o schemat; migracje uruchamia osobny job z uprawnieniami admina DB, aplikacja łączy się ograniczoną rolą `fishing_app` (tylko DML).

## 2. Co musi być w kodzie (zrobione w tym repozytorium)

| Wymaganie | Gdzie |
|---|---|
| Brak domyślnego `JWT_SECRET` w produkcji, min. 32 znaki; `DATABASE_URL` wymagane | `backend/src/config/env.js` |
| TLS do PostgreSQL (`rejectUnauthorized: true`), limity puli i `statement_timeout` | `backend/src/config/db.js` |
| CORS tylko z listy (`CORS_ORIGIN`), nigdy `*`; w Azure nieustawiane | `backend/server.js` |
| `helmet`, limit body 16 kB, rate limiting (`/api` 300/min, `/api/auth` 10/15 min) ze store w Redis | `backend/server.js` |
| JWT: algorytm przypięty do HS256, ważność 15 min; refresh token (hash SHA-256 w DB, rotacja, cookie HttpOnly/Secure/Strict) | `authController.js`, `services/refreshTokens.js`, `authMiddleware.js` |
| bcrypt cost 12, hasło 12–72 bajty, e-mail normalizowany (indeks na `lower(email)`) | `authController.js`, `utils/validation.js`, migracja 002 |
| Brak wycieku `err.message` w 500 | `utils/validation.js` → `handleError` |
| Socket.IO: rozłączenie po wygaśnięciu JWT, throttling 5 wiad./5 s, `maxHttpBufferSize` 10 kB | `sockets/chatSocket.js`, `server.js` |
| Migracje `node-pg-migrate` (SQL), krok release, rola DB o ograniczonych uprawnieniach | `backend/db/migrations/`, `db/release.sh`, `db/roles.js` |
| Kontenery bez roota (`node`, `nginx-unprivileged` na 8080), pinowane obrazy bazowe, healthchecki | `backend/Dockerfile`, `frontend/Dockerfile` |
| nginx: `server_tokens off`, CSP, HSTS (`HSTS_MAX_AGE`), X-Frame-Options DENY, nosniff, Referrer-Policy | `frontend/nginx.conf.template` |
| Seed demo zablokowany w produkcji; pierwszy admin przez job z sekretem z Key Vault | `db/seedUsers.js`, `db/createAdmin.js` |

## 3. Wymagania wstępne

- Subskrypcja Azure (Azure for Students wystarczy na demo; uwaga – niektóre subskrypcje blokują `az acr build`, wtedy `docker build` + `docker push` lokalnie).
- `az` CLI ≥ 2.60, rozszerzenie `containerapp`, `openssl`, `git`. Uruchamiać z bash (WSL, Linux, macOS lub Azure Cloud Shell).
- Region UE (RODO): `polandcentral`, `westeurope` lub `swedencentral`. Wszystko w jednym regionie.

## 4. Runbook (co robi `deploy.sh`)

```bash
az login
az account set --subscription "<id>"
export KV=kv-fishing-abc123 ACR=acrfishingabc123 PG=pg-fishing-abc123   # nazwy globalnie unikalne
bash infra/azure/deploy.sh
```

### 4.1 Grupa zasobów, sieć, prywatny DNS, logi
VNet `10.20.0.0/16` z trzema podsieciami: `snet-aca` (/23, delegacja `Microsoft.App/environments`), `snet-pg` (/28, delegacja dla Flexible Server), `snet-pe` (/27, private endpointy). Workspace Log Analytics `log-fishing`.

**Prywatna strefa DNS (wymagana przed PostgreSQL):** `az postgres flexible-server create` wymaga **istniejącej** strefy (`--private-dns-zone` to nazwa lub ID już utworzonego zasobu) i **nie tworzy** linku VNet. Skrypt najpierw:

```bash
az network private-dns zone create -g $RG -n fishing.private.postgres.database.azure.com
az network private-dns link vnet create -g $RG -n link-$VNET-pg \
  --zone-name fishing.private.postgres.database.azure.com \
  --virtual-network $VNET --registration-enabled false
```

Nazwa strefy musi kończyć się na `.postgres.database.azure.com` i **nie może być nazwą serwera** (`$PG`). Bez linku VNet Container Apps nie rozwiążą hosta bazy – job migracji i `api` nie wstają.

### 4.2 Tożsamość zarządzana i Key Vault
Jedna tożsamość user-assigned `id-fishing` ma rolę **AcrPull** (pobieranie obrazów) i **Key Vault Secrets User** (odczyt sekretów). Dzięki temu nigdzie nie istnieje hasło do rejestru ani klucz do Key Vault. Key Vault w trybie RBAC z purge protection. Sekrety (nazwy ≤ 20 znaków – wymaganie Container Apps): `jwt-secret`, `db-url`, `db-admin-url`, `app-db-pass`, `redis-url`, `admin-pass`. Generowane losowo (`openssl rand`), nigdy wpisywane do plików w repo.

### 4.3 PostgreSQL (prywatny)
`az postgres flexible-server create --subnet <ID snet-pg> --private-dns-zone <ID strefy>` – dostęp wyłącznie z VNetu; **wyboru prywatnego dostępu nie da się później cofnąć** (i o to chodzi). Przekazuj **resource ID** strefy i podsieci (nie samą nazwę strefy, której Azure nie znajdzie, jeśli nie została utworzona w kroku 4.1). TLS wymagany po stronie serwera; `db.js` weryfikuje certyfikat. Dwa konta: `pgadmin` (tylko job release) i `fishing_app` (aplikacja, tylko SELECT/INSERT/UPDATE/DELETE). Retencja backupów 14 dni. Dla realnych zawodów: `--tier GeneralPurpose --sku-name Standard_D2ds_v5 --high-availability ZoneRedundant`. Sprawdź `SHOW max_connections;` – `PG_POOL_MAX × max repliki api` musi być poniżej limitu (8 × 6 = 48 przy B1ms, limit 50 → przy skalowaniu powyżej 6 replik zwiększ SKU).

### 4.4 Azure Managed Redis (ręcznie, portal)
1. Utwórz zasób **Azure Managed Redis**, ten sam region i grupa, najmniejszy rozmiar Balanced.
2. **Networking:** private endpoint w `snet-pe` z integracją prywatnego DNS; dostęp publiczny wyłączony.
3. **Advanced:** clustering policy **Enterprise** – jeden endpoint, działa z `createClient({ url })` bez zmian w `redis.js` (polityka OSS wymagałaby klienta klastrowego). Polityki nie da się później zmienić.
4. Uwierzytelnianie kluczem dostępu (baseline). Skopiuj host i klucz, zapisz URL (TLS, port 10000):
   ```bash
   az keyvault secret set --vault-name $KV -n redis-url --value "rediss://:<PRIMARY_KEY>@<host>:10000"
   ```
Redis przenosi wyłącznie komunikaty pub/sub Socket.IO – bez persystencji; treść czatu jest w PostgreSQL.

### 4.5 Rejestr i obrazy
ACR Basic, `--admin-enabled false`. Obrazy budowane w chmurze: `az acr build -r $ACR -t fishing-api:$TAG ./backend` i `fishing-web`. Tag = skrót commita (rollback = poprzedni tag). `VITE_API_URL` zostaje puste – ten sam origin.

### 4.6 Środowisko Container Apps
`az containerapp env create --infrastructure-subnet-resource-id snet-aca --enable-workload-profiles true --logs-workspace-id ...`. Następnie **peer-to-peer encryption** (szyfrowanie ruchu `web → api` wewnątrz środowiska) – `az containerapp env update --enable-peer-to-peer-encryption true` lub w portalu (Networking).

### 4.7 Zadanie release: migracje, rola DB, pierwszy admin
Job `job-release` (trigger Manual) z obrazem `fishing-api`, komendą `sh db/release.sh`, sekretami `db-admin-url` i `app-db-pass` oraz `PGSSLMODE=require`. Działa w VNecie, więc dosięga prywatnej bazy. Kolejność: `roles.js create` → `node-pg-migrate up` → `roles.js grant`. Uruchamiany **przed każdym** rolloutem (pipeline czeka na `Succeeded`).

**Pierwszy administrator:**
```bash
az keyvault secret set --vault-name $KV -n admin-pass --value "$(openssl rand -base64 18)"
az containerapp job create -g $RG -n job-admin --environment $CAE \
  --trigger-type Manual --replica-timeout 120 --replica-retry-limit 0 \
  --image $ACR.azurecr.io/fishing-api:$TAG \
  --registry-server $ACR.azurecr.io --registry-identity $UAMI_ID --mi-user-assigned $UAMI_ID \
  --cpu 0.25 --memory 0.5Gi --command node --args db/createAdmin.js \
  --secrets db-url=keyvaultref:${KV_URI}secrets/db-url,identityref:$UAMI_ID \
            admin-pass=keyvaultref:${KV_URI}secrets/admin-pass,identityref:$UAMI_ID \
  --env-vars NODE_ENV=production DATABASE_URL=secretref:db-url \
             ADMIN_EMAIL=<twoj@email> ADMIN_PASSWORD=secretref:admin-pass
az containerapp job start -g $RG -n job-admin
```
Zaloguj się, zmień hasło, usuń job i sekret `admin-pass`. Seed demo (`npm run db:seed`) odmawia działania przy `NODE_ENV=production`.

### 4.8 Aplikacja `api` (wewnętrzna)
`--ingress internal --target-port 5000`, 2–6 replik, sekrety jako referencje Key Vault (`keyvaultref:...,identityref:...`), zmienne: `NODE_ENV=production`, `PG_POOL_MAX=8`, `TRUST_PROXY_HOPS=2` (ingress Container Apps → nginx → backend; z Front Door = 3). `--allow-insecure true` – nginx łączy się z api po HTTP wewnątrz środowiska; bezpieczne tylko dlatego, że `api` nie ma publicznego adresu, a ruch jest szyfrowany p2p. **`CORS_ORIGIN` nie ustawiamy** – jeden origin.

### 4.9 Aplikacja `web` (publiczna)
`--ingress external --target-port 8080`, 2–4 repliki, `BACKEND_URL=http://api` (nazwa aplikacji rozwiązywana przez DNS środowiska – `api` musi istnieć pierwsze), `HSTS_MAX_AGE=31536000`, `CSP_CONNECT_SRC='self'`. HTTP → HTTPS przekierowywane automatycznie. Adres: `az containerapp show -n web --query properties.configuration.ingress.fqdn`.

### 4.10 Sondy zdrowia i skalowanie
`api.yaml`: Startup/Liveness na `/health`, Readiness na `/ready` (sprawdza DB i Redis – replika bez gotowości nie dostaje ruchu), reguły HTTP (60 równoległych żądań) + CPU 70 %. Potwierdź realne zachowanie testem obciążeniowym (sekcja 8) – bezczynne WebSockety mogą nie liczyć się do reguły HTTP.

### 4.11 Własna domena, HTTPS, opcjonalny Front Door
```bash
FQDN=$(az containerapp show -g $RG -n web --query properties.configuration.ingress.fqdn -o tsv)
az containerapp env show -g $RG -n $CAE --query properties.customDomainConfiguration.customDomainVerificationId -o tsv
# DNS: CNAME app -> $FQDN,  TXT asuid.app -> <verification id>
az containerapp hostname add  -g $RG -n web --hostname app.example.com
az containerapp hostname bind -g $RG -n web --hostname app.example.com --environment $CAE --validation-method CNAME
```
Darmowy certyfikat zarządzany; użyj subdomeny. **Front Door Premium** dodaj, gdy wymagany jest WAF: origin przez Private Link lub odrzucanie w nginx żądań bez poprawnego `X-Azure-FDID`; wtedy `TRUST_PROXY_HOPS=3`.

## 5. CI/CD – GitHub Actions bez hasła do Azure (OIDC)

```bash
APP_ID=$(az ad app create --display-name gh-fishing-deploy --query appId -o tsv)
az ad sp create --id $APP_ID
az ad app federated-credential create --id $APP_ID --parameters '{"name":"gh-master","issuer":"https://token.actions.githubusercontent.com","subject":"repo:<owner>/fishing_app:ref:refs/heads/master","audiences":["api://AzureADTokenExchange"]}'
az role assignment create --assignee $APP_ID --role AcrPush --scope $ACR_ID
az role assignment create --assignee $APP_ID --role Contributor --scope $(az group show -n $RG --query id -o tsv)
```
W GitHub (Settings → Secrets and variables → Actions → **Variables**): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RG`, `AZURE_ACR`. To identyfikatory, nie sekrety. W environment `production` włącz *required reviewers* – ręczna bramka przed wdrożeniem.

Workflow `.github/workflows/deploy.yml`: `npm ci` + `npm audit` + `npm test` + build frontendu + skan obrazów Trivy (HIGH/CRITICAL blokuje) → `az acr build` → `job-release` (migracje, oczekiwanie na `Succeeded`) → `az containerapp update` api i web → smoke test. Job `deploy` pomija się, dopóki zmienne Azure nie są ustawione, więc CI działa także bez subskrypcji. Dodatkowo: Dependabot (npm, docker, github-actions), branch protection na `master`.

**Rollback:** `az containerapp update --image ...:<poprzedni tag>` albo aktywacja poprzedniej rewizji. Migracje pisać tak, by poprzednia wersja aplikacji działała z nowym schematem (najpierw dodaj kolumnę, usuń starą w kolejnym wydaniu).

## 6. Lista kontrolna bezpieczeństwa

| Obszar | Kontrola |
|---|---|
| Tożsamość | managed identity do ACR i Key Vault; ludzie przez Entra ID z MFA i RBAC o minimalnych uprawnieniach; CI przez OIDC |
| Sekrety | wszystko w Key Vault z purge protection; rotacja JWT/DB/Redis raz w roku i po podejrzeniu wycieku (dodaj nową wartość → nowa rewizja → wycofaj starą) |
| Sieć | publiczny tylko `web`; `api` internal; PostgreSQL w delegowanej podsieci; Redis przez private endpoint; p2p encryption |
| Transport | HTTPS-only ingress, certyfikat zarządzany, HSTS, TLS do Postgresa, `rediss://` |
| Dane | szyfrowanie at rest domyślne; PITR z retencją 14 dni; **przetestowany** restore |
| Aplikacja | walidacja, rate limiting, helmet, CSP, brak wycieku błędów, krótkie tokeny + refresh, ograniczona rola DB |
| Łańcuch dostaw | pinowane obrazy bazowe, `npm ci`, `npm audit`, skan Trivy, Dependabot, ACR admin off |
| Monitoring | logi w Log Analytics, alerty z sekcji 7, rekomendacje Defender for Cloud |
| Zarządzanie | blokady `CanNotDelete` na bazie i Key Vault, alert budżetowy, Azure Policy ograniczająca regiony do UE |
| RODO | region UE; tylko e-mail i imię/nazwisko; e-maile widoczne tylko dla organizatorów; procedura usunięcia konta i eksportu danych, krótka polityka prywatności |

**Poziom wyższy (jeśli wymagania tego żądają):** Front Door Premium z WAF i Private Link; private endpointy dla Key Vault i ACR (ACR Premium); uwierzytelnianie Entra ID do PostgreSQL i Redis przez managed identity (bez haseł; dla Redis pakiet `@redis/entraid`); plany Defender for Cloud; HA strefowe i backup geo-redundantny; kontrolowany ruch wychodzący (NAT Gateway / Azure Firewall).

## 7. Eksploatacja

- **Alerty:** odsetek 5xx na `web` i `api`; restarty `api`; liczba replik na maksimum; PostgreSQL CPU > 80 %, storage > 80 %, połączenia blisko limitu; pamięć i klienci Redis; miesięczny alert budżetowy.
- **Logi:** konsola kontenerów `api` w Log Analytics. Logować id żądań, nie e-maile ani tokeny.
- **Backupy:** PITR automatyczny. Przed pierwszymi realnymi zawodami wykonaj restore do nowego serwera i zmierz czas.
- **Koszty:** stałe = minimalne repliki dwóch aplikacji + baza + Managed Redis + ingest logów. Dla kopii nieprodukcyjnej: min. repliki 1 i `az postgres flexible-server stop` poza użyciem.
- **Dzień zawodów:** podnieś min. repliki `api`, zamroź wdrożenia, sprawdź alerty, przetestuj czat z dwóch telefonów na danych mobilnych.

## 8. Testy weryfikacyjne po pierwszym wdrożeniu

1. `curl -I https://app.example.com` – 200, nagłówki bezpieczeństwa, brak wersji nginx; `http://` przekierowuje na HTTPS.
2. `az containerapp show -n api --query properties.configuration.ingress.external` → `false`; PostgreSQL i Redis nieosiągalne z laptopa.
3. **Podrobiony token:** JWT podpisany starym sekretem deweloperskim na trasę admina → 401.
4. **Rate limiting i proxy hops:** 11 błędnych logowań w 15 min → 11. daje 429. Tymczasowo zaloguj `req.ip` – ma być adres klienta, nie proxy; inaczej popraw `TRUST_PROXY_HOPS`.
5. **Dwie repliki, jeden czat:** czat w dwóch przeglądarkach, logi pokazują różne repliki (`os.hostname()`), wiadomości docierają w obie strony → adapter Redis działa przez private endpoint.
6. WebSocket bezczynny 10 min pozostaje połączony.
7. Restart rewizji w trakcie czatu – klienci łączą się ponownie i dociągają pominięte wiadomości.
8. **Współbieżność:** 40 równoległych zapisów na zawody z 30 miejscami → dokładnie 30 sukcesów, brak duplikatów (sektor, stanowisko), czytelne błędy dla reszty.
9. **Test obciążeniowy** (k6/Artillery z WebSocketami): obserwuj autoskalowanie, połączenia PostgreSQL, pamięć Redis.
10. `npm audit` i skan obrazów bez HIGH/CRITICAL; wykonany restore drill.

## 9. Kolejność prac

1. Poprawki w aplikacji (sekcja 2) + testy – **zrobione**; lokalny `docker compose` działa z `JWT_SECRET`.
2. Infrastruktura raz ręcznie (`deploy.sh`, sekcje 4.0–4.9), żeby zrozumieć każdy element; potem zapis jako Bicep/Terraform.
3. Pipeline, domena, sondy, skalowanie, alerty (4.10, 4.11, 5, 7).
4. Weryfikacja (sekcja 8) i poprawki.
5. Druga fala: elementy „poziomu wyższego” z sekcji 6 wg wymagań.

## 10. Do ustalenia

- Oczekiwana skala: liczba równoczesnych użytkowników na zawody i równoległych zawodów (decyduje o rozmiarze bazy i liczbie replik).
- Czy WAF, dostęp do bazy bez haseł lub geo-redundancja są twardym wymaganiem.
- Domena i administrator subskrypcji Azure.
