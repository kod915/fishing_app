// Proste walidatory wejścia – zwracają wartość znormalizowaną albo null.

/** Dodatnia liczba całkowita (id, waga, limit). Akceptuje liczbę lub string z cyframi. */
const parsePositiveInt = (value) => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return n > 0 && Number.isSafeInteger(n) ? n : null;
  }
  return null;
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

/** Wspólna obsługa błędów w kontrolerach: HttpError -> jego status, reszta -> 500. */
const handleError = (res, err, fallbackMessage) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(fallbackMessage, err);
  return res.status(500).json({ message: fallbackMessage, error: err.message });
};

module.exports = { parsePositiveInt, parseNonNegativeInt, parseText, parseDate, HttpError, handleError };
