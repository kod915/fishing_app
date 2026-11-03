#!/usr/bin/env bash
# Jednorazowe postawienie środowiska produkcyjnego w Azure (Container Apps).
# Uruchamiaj z bash (WSL / Azure Cloud Shell), krok po kroku lub w całości.
# Szczegóły i uzasadnienia: infra/azure/README.md
#
# Przed startem ustaw unikalne nazwy (KV, ACR, PG muszą być globalnie unikalne).
set -euo pipefail

export RG=${RG:-rg-fishing-prod}
export LOC=${LOC:-polandcentral}        # region UE (RODO); alternatywnie westeurope / swedencentral
export VNET=${VNET:-vnet-fishing}
export KV=${KV:?np. kv-fishing-abc123 (3-24 znaki, globalnie unikalne)}
export ACR=${ACR:?np. acrfishingabc123 (małe litery i cyfry)}
export PG=${PG:?np. pg-fishing-abc123}
export CAE=${CAE:-cae-fishing}
export UAMI=${UAMI:-id-fishing}
export TAG=${TAG:-$(git rev-parse --short HEAD)}
# Strefa DNS nie może nazywać się tak jak serwer PG. Formę [a].[b].postgres.database.azure.com wymaga Azure.
export PG_DNS_ZONE="${PG_DNS_ZONE:-fishing.private.postgres.database.azure.com}"

step() { echo; echo "=== $*"; }
exists() { "$@" >/dev/null 2>&1; }

step "0. Providery i rozszerzenie CLI"
az extension add --name containerapp --upgrade --yes >/dev/null 2>&1 || true
for p in Microsoft.App Microsoft.OperationalInsights Microsoft.DBforPostgreSQL Microsoft.Cache \
         Microsoft.KeyVault Microsoft.ContainerRegistry Microsoft.ManagedIdentity Microsoft.Network; do
  az provider register --namespace "$p" --wait >/dev/null
done

step "1. Grupa zasobów, sieć, prywatny DNS, logi"
az group create -n "$RG" -l "$LOC" >/dev/null
exists az network vnet show -g "$RG" -n "$VNET" || \
  az network vnet create -g "$RG" -n "$VNET" --address-prefixes 10.20.0.0/16 >/dev/null
exists az network vnet subnet show -g "$RG" --vnet-name "$VNET" -n snet-aca || \
  az network vnet subnet create -g "$RG" --vnet-name "$VNET" -n snet-aca --address-prefixes 10.20.0.0/23 \
    --delegations Microsoft.App/environments >/dev/null
exists az network vnet subnet show -g "$RG" --vnet-name "$VNET" -n snet-pg || \
  az network vnet subnet create -g "$RG" --vnet-name "$VNET" -n snet-pg --address-prefixes 10.20.2.0/28 \
    --delegations Microsoft.DBforPostgreSQL/flexibleServers >/dev/null
exists az network vnet subnet show -g "$RG" --vnet-name "$VNET" -n snet-pe || \
  az network vnet subnet create -g "$RG" --vnet-name "$VNET" -n snet-pe --address-prefixes 10.20.3.0/27 >/dev/null
exists az monitor log-analytics workspace show -g "$RG" -n log-fishing || \
  az monitor log-analytics workspace create -g "$RG" -n log-fishing >/dev/null

# CLI nie tworzy już strefy ani linku VNet przy `postgres flexible-server create` – bez tego serwer
# nie wstaje, a Container Apps nie rozwiążą hosta bazy.
exists az network private-dns zone show -g "$RG" -n "$PG_DNS_ZONE" || \
  az network private-dns zone create -g "$RG" -n "$PG_DNS_ZONE" >/dev/null
exists az network private-dns link vnet show -g "$RG" -z "$PG_DNS_ZONE" -n "link-${VNET}-pg" || \
  az network private-dns link vnet create -g "$RG" -n "link-${VNET}-pg" \
    --zone-name "$PG_DNS_ZONE" --virtual-network "$VNET" --registration-enabled false >/dev/null

step "2. Tożsamość zarządzana i Key Vault"
exists az identity show -g "$RG" -n "$UAMI" || az identity create -g "$RG" -n "$UAMI" >/dev/null
UAMI_ID=$(az identity show -g "$RG" -n "$UAMI" --query id -o tsv)
UAMI_PRINCIPAL=$(az identity show -g "$RG" -n "$UAMI" --query principalId -o tsv)

exists az keyvault show -n "$KV" -g "$RG" || \
  az keyvault create -g "$RG" -n "$KV" -l "$LOC" --enable-rbac-authorization true --enable-purge-protection true >/dev/null
KV_ID=$(az keyvault show -n "$KV" --query id -o tsv)
KV_URI=$(az keyvault show -n "$KV" --query properties.vaultUri -o tsv)
ME=$(az ad signed-in-user show --query id -o tsv)
az role assignment create --assignee "$ME" --role "Key Vault Secrets Officer" --scope "$KV_ID" >/dev/null 2>&1 || true
az role assignment create --assignee-object-id "$UAMI_PRINCIPAL" --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" --scope "$KV_ID" >/dev/null 2>&1 || true
echo "Czekam 60 s na propagację ról RBAC..."; sleep 60

az keyvault secret set --vault-name "$KV" -n jwt-secret --value "$(openssl rand -base64 48 | tr -d '\n')" >/dev/null

step "3. PostgreSQL Flexible Server (prywatny, TLS)"
PG_SUBNET_ID=$(az network vnet subnet show -g "$RG" --vnet-name "$VNET" -n snet-pg --query id -o tsv)
PG_DNS_ID=$(az network private-dns zone show -g "$RG" -n "$PG_DNS_ZONE" --query id -o tsv)
PG_STATE=$(az postgres flexible-server show -g "$RG" -n "$PG" --query state -o tsv 2>/dev/null || true)
if [ -n "$PG_STATE" ] && [ "$PG_STATE" != "Ready" ]; then
  echo "Usuwam serwer PostgreSQL w stanie $PG_STATE (zostawiony po nieudanym create)..."
  az postgres flexible-server delete -g "$RG" -n "$PG" --yes >/dev/null
  PG_STATE=
fi
if [ "$PG_STATE" = "Ready" ]; then
  echo "PostgreSQL $PG już istnieje – pomijam create (sekrety DB w Key Vault mogą być nieaktualne)."
else
  PG_ADMIN_PASS=$(openssl rand -hex 24)
  az postgres flexible-server create -g "$RG" -n "$PG" -l "$LOC" \
    --version 16 --tier Burstable --sku-name Standard_B1ms --storage-size 32 \
    --subnet "$PG_SUBNET_ID" --private-dns-zone "$PG_DNS_ID" \
    --admin-user pgadmin --admin-password "$PG_ADMIN_PASS" \
    --backup-retention 14 --yes
  PG_HOST=$(az postgres flexible-server show -g "$RG" -n "$PG" --query fullyQualifiedDomainName -o tsv)
  APP_DB_PASS=$(openssl rand -hex 24)
  az keyvault secret set --vault-name "$KV" -n db-admin-url --value "postgres://pgadmin:${PG_ADMIN_PASS}@${PG_HOST}:5432/fishing_db" >/dev/null
  az keyvault secret set --vault-name "$KV" -n app-db-pass  --value "$APP_DB_PASS" >/dev/null
  az keyvault secret set --vault-name "$KV" -n db-url       --value "postgres://fishing_app:${APP_DB_PASS}@${PG_HOST}:5432/fishing_db" >/dev/null
  unset PG_ADMIN_PASS APP_DB_PASS
fi
exists az postgres flexible-server db show -g "$RG" -s "$PG" -n fishing_db || \
  az postgres flexible-server db create -g "$RG" -s "$PG" -d fishing_db >/dev/null
PG_HOST=$(az postgres flexible-server show -g "$RG" -n "$PG" --query fullyQualifiedDomainName -o tsv)

step "4. Azure Managed Redis – krok RĘCZNY w portalu (patrz README 4.4)"
echo "Utwórz Azure Managed Redis (Balanced B0/B1, private endpoint w snet-pe, clustering policy: Enterprise),"
echo "następnie zapisz URL:  az keyvault secret set --vault-name $KV -n redis-url --value 'rediss://:<KEY>@<host>:10000'"
read -r -p "Naciśnij Enter, gdy sekret redis-url jest w Key Vault..." _

step "5. Container Registry i obrazy"
exists az acr show -n "$ACR" || az acr create -g "$RG" -n "$ACR" --sku Basic --admin-enabled false >/dev/null
ACR_ID=$(az acr show -n "$ACR" --query id -o tsv)
az role assignment create --assignee-object-id "$UAMI_PRINCIPAL" --assignee-principal-type ServicePrincipal \
  --role AcrPull --scope "$ACR_ID" >/dev/null 2>&1 || true
az acr build -r "$ACR" -t "fishing-api:$TAG" ./backend
az acr build -r "$ACR" -t "fishing-web:$TAG" ./frontend

step "6. Środowisko Container Apps (w VNecie, z logami)"
LAW_ID=$(az monitor log-analytics workspace show -g "$RG" -n log-fishing --query customerId -o tsv)
LAW_KEY=$(az monitor log-analytics workspace get-shared-keys -g "$RG" -n log-fishing --query primarySharedKey -o tsv)
ACA_SUBNET=$(az network vnet subnet show -g "$RG" --vnet-name "$VNET" -n snet-aca --query id -o tsv)
exists az containerapp env show -g "$RG" -n "$CAE" || \
  az containerapp env create -g "$RG" -n "$CAE" -l "$LOC" \
    --infrastructure-subnet-resource-id "$ACA_SUBNET" \
    --enable-workload-profiles true \
    --logs-workspace-id "$LAW_ID" --logs-workspace-key "$LAW_KEY" >/dev/null
# szyfrowanie ruchu web -> api wewnątrz środowiska (jeśli flaga nieznana: portal -> Networking)
az containerapp env update -g "$RG" -n "$CAE" --enable-peer-to-peer-encryption true >/dev/null || \
  echo "UWAGA: włącz peer-to-peer encryption ręcznie w portalu."

step "7. Zadanie release: rola DB + migracje (uruchamiane przed każdym wdrożeniem)"
az containerapp job create -g "$RG" -n job-release --environment "$CAE" \
  --trigger-type Manual --replica-timeout 600 --replica-retry-limit 0 \
  --image "$ACR.azurecr.io/fishing-api:$TAG" \
  --registry-server "$ACR.azurecr.io" --registry-identity "$UAMI_ID" \
  --mi-user-assigned "$UAMI_ID" \
  --cpu 0.25 --memory 0.5Gi \
  --command "sh" --args "db/release.sh" \
  --secrets "db-admin-url=keyvaultref:${KV_URI}secrets/db-admin-url,identityref:$UAMI_ID" \
            "app-db-pass=keyvaultref:${KV_URI}secrets/app-db-pass,identityref:$UAMI_ID" \
  --env-vars NODE_ENV=production PGSSLMODE=require \
             DATABASE_URL=secretref:db-admin-url APP_DB_PASSWORD=secretref:app-db-pass >/dev/null
az containerapp job start -g "$RG" -n job-release >/dev/null
echo "Czekam na zakończenie migracji..."
for _ in $(seq 1 60); do
  STATUS=$(az containerapp job execution list -g "$RG" -n job-release --query "[0].properties.status" -o tsv)
  [ "$STATUS" = "Succeeded" ] && break
  [ "$STATUS" = "Failed" ] && { echo "Migracje NIE powiodły się"; exit 1; }
  sleep 10
done
echo "Migracje: $STATUS"

step "8. Aplikacja api (ingress WEWNĘTRZNY – brak publicznego adresu)"
az containerapp create -g "$RG" -n api --environment "$CAE" \
  --image "$ACR.azurecr.io/fishing-api:$TAG" \
  --registry-server "$ACR.azurecr.io" --registry-identity "$UAMI_ID" \
  --user-assigned "$UAMI_ID" \
  --ingress internal --target-port 5000 \
  --cpu 0.5 --memory 1Gi --min-replicas 2 --max-replicas 6 \
  --scale-rule-name http-load --scale-rule-type http --scale-rule-http-concurrency 60 \
  --secrets "jwt-secret=keyvaultref:${KV_URI}secrets/jwt-secret,identityref:$UAMI_ID" \
            "db-url=keyvaultref:${KV_URI}secrets/db-url,identityref:$UAMI_ID" \
            "redis-url=keyvaultref:${KV_URI}secrets/redis-url,identityref:$UAMI_ID" \
  --env-vars NODE_ENV=production PORT=5000 PG_POOL_MAX=8 TRUST_PROXY_HOPS=2 \
             JWT_SECRET=secretref:jwt-secret DATABASE_URL=secretref:db-url REDIS_URL=secretref:redis-url >/dev/null
# nginx łączy się z api zwykłym HTTP wewnątrz środowiska – bezpieczne tylko dlatego, że api jest internal
az containerapp ingress update -g "$RG" -n api --allow-insecure true >/dev/null
az containerapp update -g "$RG" -n api --yaml <(sed "s#<ACR>.azurecr.io/fishing-api:<TAG>#$ACR.azurecr.io/fishing-api:$TAG#" infra/azure/api.yaml) >/dev/null

step "9. Aplikacja web (nginx, ingress PUBLICZNY, HTTPS)"
az containerapp create -g "$RG" -n web --environment "$CAE" \
  --image "$ACR.azurecr.io/fishing-web:$TAG" \
  --registry-server "$ACR.azurecr.io" --registry-identity "$UAMI_ID" \
  --user-assigned "$UAMI_ID" \
  --ingress external --target-port 8080 \
  --cpu 0.25 --memory 0.5Gi --min-replicas 2 --max-replicas 4 \
  --env-vars BACKEND_URL=http://api "CSP_CONNECT_SRC='self'" HSTS_MAX_AGE=31536000 >/dev/null

FQDN=$(az containerapp show -g "$RG" -n web --query properties.configuration.ingress.fqdn -o tsv)

step "10. Blokady przed usunięciem"
az lock create --name nodelete --lock-type CanNotDelete -g "$RG" --resource-name "$PG" \
  --resource-type Microsoft.DBforPostgreSQL/flexibleServers >/dev/null
az lock create --name nodelete --lock-type CanNotDelete -g "$RG" --resource-name "$KV" \
  --resource-type Microsoft.KeyVault/vaults >/dev/null

cat <<EOF

GOTOWE.  Aplikacja: https://$FQDN
Następne kroki (README):
  - pierwszy administrator: sekcja 4.7 (job-admin z db/createAdmin.js)
  - własna domena + certyfikat: sekcja 4.11
  - CI/CD (OIDC): sekcja 5 i .github/workflows/deploy.yml
  - testy weryfikacyjne: sekcja 8
EOF
