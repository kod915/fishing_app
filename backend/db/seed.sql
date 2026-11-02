-- Dane przykładowe do środowiska deweloperskiego (idempotentne).
-- Hasła ustawia db/seedUsers.js – tutaj tylko placeholder.
INSERT INTO users (email, password_hash, full_name, role) VALUES
('admin@wedkowanie.pl', 'placeholder', 'Marek Admin', 'ADMIN'),
('sedzia@wedkowanie.pl', 'placeholder', 'Jan Sędzia', 'JUDGE'),
('jan.kowalski@gmail.com', 'placeholder', 'Jan Kowalski', 'ANGLER'),
('piotr.nowak@gmail.com', 'placeholder', 'Piotr Nowak', 'ANGLER')
ON CONFLICT (email) DO NOTHING;

INSERT INTO tournaments (name, location, event_date, max_participants, status, created_by)
SELECT 'Puchar Wisły 2026', 'Tczew, Sektor A-C', '2026-06-15', 30, 'OPEN', u.id
FROM users u WHERE u.email = 'admin@wedkowanie.pl'
  AND NOT EXISTS (SELECT 1 FROM tournaments WHERE name = 'Puchar Wisły 2026');

INSERT INTO tournaments (name, location, event_date, max_participants, status, created_by)
SELECT 'Mistrzostwa Wielkopolski', 'Jezioro Kierskie', '2026-07-20', 20, 'DRAFT', u.id
FROM users u WHERE u.email = 'admin@wedkowanie.pl'
  AND NOT EXISTS (SELECT 1 FROM tournaments WHERE name = 'Mistrzostwa Wielkopolski');

INSERT INTO registrations (tournament_id, user_id, sector, spot_number)
SELECT t.id, u.id, 'Sektor A', 4 FROM tournaments t, users u
WHERE t.name = 'Puchar Wisły 2026' AND u.email = 'jan.kowalski@gmail.com'
ON CONFLICT DO NOTHING;

INSERT INTO registrations (tournament_id, user_id, sector, spot_number)
SELECT t.id, u.id, 'Sektor A', 5 FROM tournaments t, users u
WHERE t.name = 'Puchar Wisły 2026' AND u.email = 'piotr.nowak@gmail.com'
ON CONFLICT DO NOTHING;
