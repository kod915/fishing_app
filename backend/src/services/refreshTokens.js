const crypto = require('crypto');
const db = require('../config/db');
const { refreshTokenDays } = require('../config/env');

// W bazie trzymamy tylko skrót tokena – wyciek tabeli nie pozwala przejąć sesji.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => crypto.randomBytes(48).toString('base64url');
const expiryDate = () => new Date(Date.now() + refreshTokenDays * 24 * 60 * 60 * 1000);

/** Wystawia nowy refresh token dla użytkownika. */
async function issue(userId, client = db) {
  const token = newToken();
  await client.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hashToken(token), expiryDate()]
  );
  return token;
}

/**
 * Rotacja: unieważnia podany token i wystawia nowy. Zwraca { user, token } albo null,
 * gdy token jest nieznany, unieważniony lub wygasł. Blokada FOR UPDATE sprawia, że
 * dwa równoległe żądania z tym samym tokenem nie dostaną dwóch nowych.
 */
async function rotate(token) {
  if (typeof token !== 'string' || token.length < 32) return null;
  return db.withTransaction(async (client) => {
    const r = await client.query(
      `SELECT rt.id, rt.expires_at, rt.revoked_at,
              u.id AS user_id, u.email, u.full_name, u.role
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
       FOR UPDATE OF rt`,
      [hashToken(token)]
    );
    const row = r.rows[0];
    if (!row || row.revoked_at || new Date(row.expires_at) < new Date()) return null;

    await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [row.id]);
    const fresh = await issue(row.user_id, client);
    return {
      user: { id: row.user_id, email: row.email, full_name: row.full_name, role: row.role },
      token: fresh,
    };
  });
}

/** Unieważnia token (wylogowanie). Brak błędu, gdy token nieznany. */
async function revoke(token) {
  if (typeof token !== 'string') return;
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashToken(token)]
  );
}

/** Unieważnia wszystkie tokeny użytkownika (np. zmiana hasła, degradacja roli). */
async function revokeAllForUser(userId) {
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}

module.exports = { issue, rotate, revoke, revokeAllForUser };
