-- Up Migration
-- Utwardzenie: e-mail bez rozróżniania wielkości liter, strefy czasowe, NOT NULL na FK,
-- refresh tokeny, miękkie usuwanie i ślad korekt dla połowów.

-- Jeśli ten indeks nie powstaje, w bazie są duplikaty różniące się wielkością liter:
--   SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;
UPDATE users SET email = lower(email) WHERE email <> lower(email);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

ALTER TABLE users         ALTER COLUMN created_at    TYPE TIMESTAMPTZ, ALTER COLUMN created_at    SET NOT NULL, ALTER COLUMN created_at    SET DEFAULT now();
ALTER TABLE tournaments   ALTER COLUMN created_at    TYPE TIMESTAMPTZ, ALTER COLUMN created_at    SET NOT NULL, ALTER COLUMN created_at    SET DEFAULT now();
ALTER TABLE registrations ALTER COLUMN registered_at TYPE TIMESTAMPTZ, ALTER COLUMN registered_at SET NOT NULL, ALTER COLUMN registered_at SET DEFAULT now(),
                          ALTER COLUMN tournament_id SET NOT NULL, ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE catches       ALTER COLUMN created_at    TYPE TIMESTAMPTZ, ALTER COLUMN created_at    SET NOT NULL, ALTER COLUMN created_at    SET DEFAULT now(),
                          ALTER COLUMN tournament_id SET NOT NULL, ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE chat_messages ALTER COLUMN created_at    TYPE TIMESTAMPTZ, ALTER COLUMN created_at    SET NOT NULL, ALTER COLUMN created_at    SET DEFAULT now();

-- Refresh tokeny (przechowywane jako skrót SHA-256, rotowane przy każdym użyciu)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens (expires_at);

-- Korekty i miękkie usuwanie połowów
ALTER TABLE catches
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_by INT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by INT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_catches_tournament_active ON catches (tournament_id) WHERE deleted_at IS NULL;

-- Down Migration
DROP INDEX IF EXISTS idx_catches_tournament_active;
ALTER TABLE catches DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS deleted_at,
                    DROP COLUMN IF EXISTS updated_by, DROP COLUMN IF EXISTS updated_at;
DROP TABLE IF EXISTS refresh_tokens;
DROP INDEX IF EXISTS users_email_lower_idx;
