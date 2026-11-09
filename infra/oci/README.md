# CI/CD + DAST na GitHubie i Oracle Cloud

Proces łączy **GitHub Actions** (CI, bramka DAST, budowa obrazów) z **OCI DevOps** (wdrożenie na staging/produkcję i drugi skan ZAP), zgodnie z architekturą Oracle: [GitHub Actions + OCI DevOps](https://docs.oracle.com/en/solutions/cicd-pipe-github-act-oci-devops/index.html) oraz [ZAP w OCI DevOps Build Pipeline](https://docs.oracle.com/en/learn/integrate-zap-oci-devops-build-pipeline/index.html).

Istniejący pipeline Azure (`.github/workflows/deploy.yml`) zostaje. Ta ścieżka jest równoległa – włącza się dopiero po ustawieniu zmiennych OCI.

## Przepływ

```
push / pull request
        │
        ▼
┌───────────────────────────────────┐
│ GitHub Actions                    │
│  1. test: npm test, audit, build  │
│  2. Trivy HIGH/CRITICAL           │
│  3. DAST: compose → ZAP baseline  │  ← bramka: WARN/FAIL ZAP = stop
└───────────────┬───────────────────┘
                │ tylko master + skonfigurowane OCI
                ▼
┌───────────────────────────────────┐
│ GitHub Actions → OCIR             │
│  docker build / push fishing-api  │
│  docker build / push fishing-web  │
│  oci devops deployment create     │
└───────────────┬───────────────────┘
                ▼
┌───────────────────────────────────┐
│ OCI DevOps                        │
│  staging (OKE / Compute)          │
│  ZAP baseline (zap_build_spec)    │  ← skan po HTTPS, jak produkcja
│  manual approval                  │
│  produkcja                        │
└───────────────────────────────────┘
```

DAST nigdy nie celuje w produkcję. Baseline (pasywny) jest bezpieczny na współdzielonym stagingu. Full scan (`zap-full-scan.py`) tylko na izolowanym środowisku – aktywne payloady mogą pisać do bazy.

## Co jest w repozytorium

| Plik | Rola |
|---|---|
| `.github/workflows/dast.yml` | ZAP przeciwko `docker compose` (każdy PR/push) oraz opcjonalnie przeciwko `OCI_STAGING_URL` |
| `.github/workflows/deploy.yml` | testy + Trivy + wywołanie DAST + deploy Azure |
| `.github/workflows/oci-deploy.yml` | push do OCIR i start pipeline DevOps (gdy `OCI_TENANCY_NAMESPACE` jest ustawione) |
| `.zap/rules.tsv` | świadomie zaakceptowane alerty ZAP (reszta blokuje) |
| `docker-compose.dast.yml` | HSTS max-age na czas skanu CI |
| `infra/oci/zap_build_spec.yaml` | etap ZAP w OCI DevOps (oficjalny wzorzec Oracle) |

## Bramka DAST w GitHub Actions (działa bez konta OCI)

Po `npm test` / Trivy runner stawia ten sam stos co lokalnie (`nginx → backend → postgres + redis`), czeka na `/healthz` i `/api/tournaments`, potem `zaproxy/action-baseline@v0.15.0` skanuje `http://127.0.0.1:8080`.

- `fail_action: true` – dowolny FAIL albo WARN, którego nie ma w `.zap/rules.tsv`, wywala job.
- Raporty lądują w artefaktach workflow (`zap-baseline-compose`).
- Na PR nie skanujemy stagingu OCI (żeby nie obciążać współdzielonego URL przy każdym commicie).

To jest właściwa bramka merge'a. Etap OCI jest drugim skanem już po HTTPS, na prawdziwym ingressie.

## Konfiguracja Oracle Cloud

### 1. Tenancy (jednorazowo)

1. Kompartment na aplikację (np. `fishing-app`).
2. VCN: publiczna podsieć (load balancer) + prywatna (OKE/Compute, Autonomous/PostgreSQL, Redis).
3. **OCIR** – prywatne repozytoria `fishing-api` i `fishing-web`.
4. **Artifact Registry** – na raporty ZAP.
5. Środowisko **staging** i **production** w OCI DevOps (OKE albo instance group).
6. Secrets w **OCI Vault**: `JWT_SECRET` (≥ 32 znaki), `DATABASE_URL`, hasło Redis. Nie trzymać ich w GitHubie poza danymi do OCIR/API.

### 2. Zmienne i sekrety GitHuba

**Settings → Secrets and variables → Actions**

| Secrets | Po co |
|---|---|
| `OCI_CLI_USER` | OCID użytkownika API |
| `OCI_CLI_TENANCY` | OCID tenancy |
| `OCI_CLI_FINGERPRINT` | odcisk klucza API |
| `OCI_CLI_KEY_CONTENT` | klucz prywatny PEM (albo federacja OIDC – patrz niżej) |
| `OCI_COMPARTMENT_OCID` | kompartment OCIR / DevOps |
| `OCI_AUTH_TOKEN` | token Auth do `docker login` OCIR |

| Variables | Po co |
|---|---|
| `OCI_TENANCY_NAMESPACE` | namespace OCIR; **włącza** `oci-deploy.yml` |
| `OCI_REGION` | np. `eu-frankfurt-1` |
| `OCI_DEPLOY_PIPELINE_OCID` | pipeline DevOps (staging) |
| `OCI_STAGING_URL` | `https://…` – skan ZAP z GitHuba po wdrożeniu |

Dopóki `OCI_TENANCY_NAMESPACE` jest puste, job OCI jest pomijany – Azure i DAST na compose działają dalej.

Klucz API w sekretach to baseline Oracle Actions. Bezpieczniejszy wariant (jak OIDC przy Azure): [Workload Identity Federation / token exchange GitHub → OCI](https://www.ateam-oracle.com/github-actions-oci-a-guide-to-secure-oidc-token-exchange).

### 3. Pipeline DevOps w konsoli OCI

1. Project DevOps + Artifact Registry na raport ZAP.
2. **Build pipeline** – stage ze specyfikacją `infra/oci/zap_build_spec.yaml`. Parametr `APP_URL` = URL stagingu.
3. Stage **Deliver Artifacts** – nazwa artefaktu `zap-report-html` / `zap-report-json` (zgodna ze specyfikacją).
4. **Deployment pipeline** staging: rolling na OKE/Compute z obrazem `fishing-web:$IMAGE_TAG` i `fishing-api:$IMAGE_TAG`.
5. Stage **Wait** albo **Manual Approval** po ZAP, potem deployment production.
6. GitHub po pushu do OCIR woła `oci devops deployment create` (job w `oci-deploy.yml`).

ZAP w OCI skanuje już HTTPS (certyfikat na load balancerze). HSTS i cookie `Secure` są wtedy prawdziwe, nie tylko syntetyczne jak w compose.

## Interpretacja wyników ZAP

| Ryzyko ZAP | Baseline | Pipeline |
|---|---|---|
| High | FAIL | blokuje |
| Medium | WARN | blokuje, chyba że IGNORE w `.zap/rules.tsv` |
| Low / Info | INFO | nie blokuje |

Świadomie ignorowane (`.zap/rules.tsv`): `style-src 'unsafe-inline'` (React `style={{}}`, przy `script-src 'self'`), komentarze/timestampy w bundle Vite, długi cache hashed `/assets/`. Nowe IGNORE tylko z uzasadnieniem w tej samej linijce.

## Uruchomienie lokalne (opcjonalnie)

```bash
export JWT_SECRET=$(openssl rand -base64 48)
docker compose -f docker-compose.yml -f docker-compose.dast.yml up -d --build
docker run --rm --network host -v "${PWD}:/zap/wrk/:rw" --user root \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://127.0.0.1:8080 -c .zap/rules.tsv -a -r zap-report.html
```

Na Windowsie zamiast `--network host` użyj `http://host.docker.internal:8080`.
