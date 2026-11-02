// Proste walidatory wejścia – zwracają wartość znormalizowaną albo null.

/** Dodatnia liczba całkowita (id, waga, limit). Akceptuje liczbę lub string z cyframi. */
// Zakres kolumn INT w PostgreSQL – większe wartości skończyłyby się błędem bazy (500)
const PG_INT_MAX = 2147483647;

const parsePositiveInt = (value) => {
  let n = null;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    n = Number(value.trim());
  }
  return n !== null && Number.isSafeInteger(n) && n > 0 && n <= PG_INT_MAX ? n : null;
};

/** Nieujemna liczba całkowita (np. kursor "after", gdzie 0 = od początku). */
const parseNonNegativeInt = (value) => {
  if (value === 0 || value === '0') return 0;
  return parsePositiveInt(value);
};

/** Niepusty string po przycięciu, o długości <= max. */
const parseText = (value, max = 255) => {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 && t.length <= max ? t : null;
};

/** Data w formacie YYYY-MM-DD, która faktycznie istnieje w kalendarzu. */
const parseDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
};

/**
 * Błąd biznesowy z kodem HTTP – pozwala kontrolerom rzucić np. 404/409
 * z wnętrza transakcji i obsłużyć to w jednym miejscu.
 */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Wspólna obsługa błędów w kontrolerach: HttpError -> jego status, reszta -> 500.
 * Szczegóły błędu trafiają tylko do logów serwera – klient dostaje ogólny komunikat.
 */
const handleError = (res, err, fallbackMessage) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(`${fallbackMessage}:`, err);
  return res.status(500).json({ message: fallbackMessage });
};

/** Prosty format adresu e-mail (pełną weryfikację i tak daje tylko wysłanie wiadomości). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const parseEmail = (value) => {
  const t = parseText(value, 255);
  if (!t) return null;
  const e = t.toLowerCase();
  return EMAIL_RE.test(e) ? e : null;
};

/** Hasło: 12–72 bajty (bcrypt ignoruje wszystko powyżej 72 bajtów). */
const PASSWORD_MIN = 12;
const PASSWORD_MAX_BYTES = 72;
const isValidPassword = (value) =>
  typeof value === 'string' && value.length >= PASSWORD_MIN && Buffer.byteLength(value) <= PASSWORD_MAX_BYTES;

module.exports = {
  parsePositiveInt, parseNonNegativeInt, parseText, parseDate, parseEmail,
  isValidPassword, PASSWORD_MIN, PASSWORD_MAX_BYTES, HttpError, handleError,
};
