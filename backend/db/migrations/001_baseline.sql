-- Up Migration
-- Baseline: pełny schemat aplikacji w aktualnym kształcie.
-- Idempotentny (IF NOT EXISTS / DO-bloki), dzięki czemu można go uruchomić także
-- na bazie utworzonej ze starszego schema.sql – wtedy nic nie zmienia, a kolejne
-- migracje nakładają już tylko różnice.

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('ADMIN', 'JUDGE', 'ANGLER');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tournament_status') THEN
        CREATE TYPE tournament_status AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'FINISHED');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'ANGLER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournaments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    event_date DATE NOT NULL,
    max_participants INT NOT NULL DEFAULT 30 CHECK (max_participants > 0),
    spots_per_sector INT NOT NULL DEFAULT 10 CHECK (spots_per_sector > 0),
    status tournament_status NOT NULL DEFAULT 'DRAFT',
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS registrations (
    id SERIAL PRIMARY KEY,
    tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sector VARCHAR(10),
    spot_number INT,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_tournament UNIQUE (tournament_id, user_id),
    CONSTRAINT unique_tournament_spot UNIQUE (tournament_id, sector, spot_number)
);

CREATE TABLE IF NOT EXISTS catches (
    id SERIAL PRIMARY KEY,
    tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    species VARCHAR(100) NOT NULL,
    weight_grams INT NOT NULL CHECK (weight_grams > 0),
    registered_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_tournament_created ON chat_messages (tournament_id, created_at);

-- Uzupełnienia dla baz ze starszego schematu (na świeżej bazie są no-op)
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS spots_per_sector INT NOT NULL DEFAULT 10;
ALTER TABLE tournaments
    ALTER COLUMN status SET DEFAULT 'DRAFT',
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN max_participants SET DEFAULT 30,
    ALTER COLUMN max_participants SET NOT NULL;
ALTER TABLE users ALTER COLUMN role SET NOT NULL;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_max_participants_check') THEN
        ALTER TABLE tournaments ADD CONSTRAINT tournaments_max_participants_check CHECK (max_participants > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_spots_per_sector_check') THEN
        ALTER TABLE tournaments ADD CONSTRAINT tournaments_spots_per_sector_check CHECK (spots_per_sector > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_tournament_spot') THEN
        ALTER TABLE registrations ADD CONSTRAINT unique_tournament_spot UNIQUE (tournament_id, sector, spot_number);
    END IF;
END $$;

-- Down Migration
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS catches;
DROP TABLE IF EXISTS registrations;
DROP TABLE IF EXISTS tournaments;
DROP TABLE IF EXISTS users;
DROP TYPE IF EXISTS tournament_status;
DROP TYPE IF EXISTS user_role;
