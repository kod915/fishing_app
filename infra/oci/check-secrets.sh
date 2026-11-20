#!/usr/bin/env bash
# Sprawdza plik sekretów na VM. Wartości sekretów nie są wypisywane.
#   prepare <app_dir> <secrets_file>  – przenosi stary .env z klonu i odrzuca słaby JWT
#   audit                              – pliki sekretów nie mogą być w Git
#   self-test                          – lokalna kontrola powyższych reguł
set -euo pipefail

usage() {
  echo "Użycie: check-secrets.sh prepare <app_dir> <secrets_file>" >&2
  echo "       check-secrets.sh audit" >&2
  echo "       check-secrets.sh self-test" >&2
  exit 2
}

# Ścieżka absolutna także wtedy, gdy ostatnie katalogi jeszcze nie istnieją.
to_abs() {
  local path="$1" suffix=""
  while [ ! -d "$path" ]; do
    suffix="/$(basename "$path")$suffix"
    path=$(dirname "$path")
    if [ "$path" = "/" ] || [ "$path" = "." ]; then
      echo "Nie można ustalić ścieżki." >&2
      exit 1
    fi
  done
  printf '%s%s\n' "$(readlink -f "$path")" "$suffix"
}

audit_repo() {
  local fail=0 bad
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "audit: to nie jest repozytorium Gita" >&2
    exit 1
  fi
  # Jedno przejście po indeksie. Pętla po pliku w bashu przy node_modules w Git jest za wolna.
  bad=$(git ls-files | grep -E '(^|/)\.env$|(^|/)fishing\.env$|(^|/)id_(rsa|dsa|ecdsa|ed25519)$|\.(pem|p12|pfx)$|(^|/)credentials\.json$' || true)
  if [ -n "$bad" ]; then
    echo "W Git są pliki, których tam być nie może:" >&2
    echo "$bad" >&2
    fail=1
  fi
  if git grep -n -I -E 'BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY' -- . ':!**/node_modules/**' ':!docs/**' ':!*.md' >/dev/null 2>&1; then
    echo "W Git jest klucz prywatny." >&2
    git grep -n -I -E 'BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY' -- . ':!**/node_modules/**' ':!docs/**' ':!*.md' >&2 || true
    fail=1
  fi
  if [ "$fail" -ne 0 ]; then
    exit 1
  fi
  echo "audit OK"
}

jwt_value() {
  local file="$1" line value
  line=$(grep -E '^[[:space:]]*(export[[:space:]]+)?JWT_SECRET=' "$file" | head -n 1 || true)
  line=${line%$'\r'}
  value=${line#*=}
  value=${value#"${value%%[![:space:]]*}"}
  if [ "${value#\"}" != "$value" ] && [ "${value%\"}" != "$value" ]; then
    value=${value#\"}
    value=${value%\"}
  elif [ "${value#\'}" != "$value" ] && [ "${value%\'}" != "$value" ]; then
    value=${value#\'}
    value=${value%\'}
  fi
  printf '%s' "$value"
}

assert_jwt() {
  local file="$1" value
  value=$(jwt_value "$file")
  if [ "${#value}" -lt 32 ]; then
    echo "JWT_SECRET brak albo krótszy niż 32 znaki." >&2
    exit 1
  fi
  case "$value" in
    *change-me*|*replace-with*|*dev-only*|*dast-ci-secret*|*super_secret_key*)
      echo "JWT_SECRET ma wartość przykładową. Wygeneruj nowy: openssl rand -base64 48" >&2
      exit 1
      ;;
  esac
}

prepare() {
  local app_dir="$1" secrets_file="$2" app_real sec_real sec_dir legacy mode
  if [ -z "$app_dir" ] || [ -z "$secrets_file" ]; then
    usage
  fi
  app_real=$(to_abs "$app_dir")
  sec_real=$(to_abs "$secrets_file")
  sec_dir=$(dirname "$sec_real")
  case "$sec_real" in
    "$app_real"|"$app_real"/*)
      echo "Plik sekretów nie może leżeć w katalogu repozytorium ($app_real)." >&2
      echo "Użyj ścieżki poza klonem, np. /home/opc/secrets/fishing.env" >&2
      exit 1
      ;;
  esac

  legacy="$app_real/.env"
  if [ ! -e "$sec_real" ] && [ -f "$legacy" ]; then
    mkdir -p "$sec_dir"
    chmod 700 "$sec_dir" 2>/dev/null || sudo chmod 700 "$sec_dir"
    if ! mv "$legacy" "$sec_real" 2>/dev/null; then
      sudo mv "$legacy" "$sec_real"
      sudo chown "$(id -un):$(id -gn)" "$sec_real" "$sec_dir"
    fi
    echo "Przeniesiono $legacy -> $sec_real"
  fi
  if [ -f "$legacy" ]; then
    echo "Usuń $legacy. Obowiązuje wyłącznie $sec_real (poza Gitem)." >&2
    exit 1
  fi
  if [ ! -f "$sec_real" ]; then
    echo "Brak pliku sekretów: $sec_real" >&2
    echo "Utwórz go na VM (chmod 600). Wzór: infra/oci/fishing.env.example" >&2
    exit 1
  fi
  if [ -L "$sec_real" ]; then
    echo "Plik sekretów nie może być dowiązaniem symbolicznym." >&2
    exit 1
  fi
  chmod 700 "$sec_dir" 2>/dev/null || sudo chmod 700 "$sec_dir"
  chmod 600 "$sec_real" 2>/dev/null || sudo chmod 600 "$sec_real"
  # Na Linuxie (VM, CI) odrzucamy plik czytany przez grupę lub innych.
  # MSYS na Windows nie pokazuje chmod w stat — tam chroni tylko ścieżka i treść.
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) ;;
    *)
      mode=$(stat -c '%a' "$sec_real")
      case "$mode" in
        600|400) ;;
        *)
          echo "Uprawnienia $sec_real to $mode, wymagane 600." >&2
          exit 1
          ;;
      esac
      ;;
  esac
  assert_jwt "$sec_real"
  echo "secrets OK: $sec_real"
}

self_test() {
  local tmp app sec
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN
  app="$tmp/app"
  sec="$tmp/secrets/fishing.env"
  mkdir -p "$app"

  if (prepare "$app" "$sec") >/dev/null 2>&1; then
    echo "self-test: brak pliku powinien zostać odrzucony" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$sec")"
  printf 'JWT_SECRET=short\n' > "$sec"
  chmod 644 "$sec"
  if (prepare "$app" "$sec") >/dev/null 2>&1; then
    echo "self-test: krótki JWT_SECRET powinien zostać odrzucony" >&2
    exit 1
  fi
  case "$(uname -s)" in
    Linux)
      if [ "$(stat -c '%a' "$sec")" != "600" ]; then
        echo "self-test: prepare powinien ustawić chmod 600" >&2
        exit 1
      fi
      ;;
  esac

  if (prepare "$app" "$app/.env") >/dev/null 2>&1; then
    echo "self-test: sekret w katalogu repo powinien zostać odrzucony" >&2
    exit 1
  fi

  rm -f "$sec"
  printf 'JWT_SECRET=%s\n' "$(printf 'a%.0s' {1..40})" > "$app/.env"
  prepare "$app" "$sec" >/dev/null
  if [ -e "$app/.env" ] || [ ! -f "$sec" ]; then
    echo "self-test: stary .env powinien zostać przeniesiony poza repo" >&2
    exit 1
  fi

  printf 'JWT_SECRET=%s\n' "$(printf 'b%.0s' {1..40})" > "$app/.env"
  if (prepare "$app" "$sec") >/dev/null 2>&1; then
    echo "self-test: drugi .env w repo powinien zatrzymać deploy" >&2
    exit 1
  fi
  rm -f "$app/.env"

  printf 'JWT_SECRET=change-me-to-a-random-string-of-at-least-32-characters\n' > "$sec"
  chmod 600 "$sec"
  if (prepare "$app" "$sec") >/dev/null 2>&1; then
    echo "self-test: przykładowy JWT_SECRET powinien zostać odrzucony" >&2
    exit 1
  fi

  local audit_dir="$tmp/repo"
  mkdir -p "$audit_dir"
  git -C "$audit_dir" init -q
  printf 'x\n' > "$audit_dir/.env"
  git -C "$audit_dir" add -f .env
  GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com \
    GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com \
    git -C "$audit_dir" -c commit.gpgsign=false commit -q -m t
  if (cd "$audit_dir" && audit_repo) >/dev/null 2>&1; then
    echo "self-test: audit powinien wykryć .env" >&2
    exit 1
  fi

  echo "self-test OK"
}

cmd="${1:-}"
case "$cmd" in
  prepare) prepare "${2:-}" "${3:-}" ;;
  audit) audit_repo ;;
  self-test) self_test ;;
  *) usage ;;
esac
