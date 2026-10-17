INSERT INTO users (email, password_hash, full_name, role) VALUES
('admin@wedkowanie.pl', 'hash_pass_123', 'Marek Admin', 'ADMIN'),
('sedzia@wedkowanie.pl', 'hash_pass_123', 'Jan Sędzia', 'JUDGE'),
('jan.kowalski@gmail.com', 'hash_pass_123', 'Jan Kowalski', 'ANGLER');

INSERT INTO tournaments (name, location, event_date, max_participants, status, created_by) VALUES
('Puchar Wisły 2026', 'Tczew, Sektor A-C', '2026-06-15', 30, 'OPEN', 1);

INSERT INTO registrations (tournament_id, user_id, sector, spot_number) VALUES
(1, 3, 'Sektor A', 4);