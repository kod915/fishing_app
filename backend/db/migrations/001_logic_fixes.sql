-- Migracja dla baz utworzonych ze starszej wersji schema.sql.
-- Idempotentna: można uruchomić wielokrotnie (także na świeżej bazie).
--
--   psql "$DATABASE_URL" -f db/migrations/001_logic_fixes.sql
--   lub: Get-Content db/migrations/001_logic_fixes.sql -Raw | docker exec -i <kontener> psql -U postgres -d fishing_db

BEGIN;

ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS spots_per_sector INT NOT NULL DEFAULT 10;

ALTER TABLE tournaments
    ALTER COLUMN status SET DEFAULT 'DRAFT',
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN max_participants SET DEFAULT 30,
    ALTER COLUMN max_participants SET NOT NULL;

DO $$
BEGIN
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

COMMIT;
