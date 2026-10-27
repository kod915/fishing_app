# Scenariusz do zrzutów ekranu (L1 + L2)

Aplikacja: http://localhost:5173 (backend działa na :5000, nodemon + Vite są uruchomione).
Hasło do wszystkich kont demo: `haslo123`.

Potrzebne dwa okna przeglądarki: **zwykłe** (admin / sędzia) i **incognito** (wędkarz Jan) – inaczej będą się nadpisywać sesje w localStorage.

Numeracja zrzutów = kolejność wklejania do sprawozdania. Przy każdym podano, do której sekcji trafia.

---

## Przygotowanie (bez zrzutów)

- [ ] Stan bazy: „Puchar Wisły 2026” ma status *Zapisy otwarte*, zapisani Jan Kowalski i Piotr Nowak; „Mistrzostwa Wielkopolski” to *Wersja robocza*. Jeśli coś jest inaczej – daj znać, zresetuję.
- [ ] Otwórz okno zwykłe i okno incognito, oba na http://localhost:5173.
- [ ] Szerokość okna ~1200 px, żeby karty turniejów ustawiały się w 2 kolumny.

---

## Część A – logowanie i role (sekcja 2.3 / 2.4)

**01_logowanie.png** – okno incognito, strona logowania.
Pokaż formularz + sekcję „Szybkie logowanie (konta demo)”. Nic nie klikaj.

**02_rejestracja_walidacja.png** – kliknij „Zarejestruj się”, wpisz e-mail `jan.kowalski@gmail.com`, dowolne hasło i nazwisko → komunikat *„Użytkownik o podanym e-mailu już istnieje.”*
(pokazuje walidację po stronie serwera)

**03_zle_haslo.png** – wróć do „Zaloguj się”, e-mail `admin@wedkowanie.pl`, hasło `zle` → *„Nieprawidłowy email lub hasło”*.
(ten sam komunikat dla złego maila i złego hasła – brak wycieku informacji)

Teraz zaloguj:
- okno zwykłe → przycisk **⚙️ Admin**
- okno incognito → przycisk **👤 Jan Kowalski (wędkarz)**

**04_admin_lista.png** – okno zwykłe (admin), zakładka Turnieje.
Widać obie karty: „Puchar Wisły” (zielony badge *Zapisy otwarte*, 2/30) i „Mistrzostwa Wielkopolski” (szary badge *Wersja robocza*) oraz przyciski organizatora „Rozpocznij zawody” / „Otwórz zapisy”.

**05_wedkarz_lista.png** – okno incognito (Jan), zakładka Turnieje.
Widać **tylko** „Puchar Wisły” z napisem *✓ Jesteś zapisany* i przyciskiem Czat – wersja robocza jest ukryta, brak przycisków organizatora.
→ zestaw 04 + 05 obok siebie pokazuje autoryzację po rolach.

---

## Część B – tworzenie zawodów i zapisy (sekcja 2.3, tabela API: POST /tournaments, POST /registrations)

**06_admin_nowe_zawody.png** – okno zwykłe → **⚙️ Panel Admina**. Wypełnij:
- Nazwa: `Zawody Testowe – Laboratorium`
- Lokalizacja: `Zalew Sulejowski`
- Data: dowolna przyszła
- Limit uczestników: `4`, Stanowisk w sektorze: `2`
- checkbox „Otwórz zapisy od razu” zaznaczony
Kliknij „Opublikuj Zawody” → zielony komunikat *Utworzono „…” (ID …), status: zapisy otwarte.* Zrzut z widocznym komunikatem.

**07_wedkarz_zapis.png** – okno incognito → odśwież zakładkę Turnieje (kliknij „📅 Turnieje”). Pojawiła się nowa karta (0/4) z przyciskiem „Zapisz się”. Kliknij go.
Zrzut **po** kliknięciu: komunikat *Zapisano na „…”. Twoje stanowisko: Sektor A / nr 1.*, licznik 1/4, przycisk „Zapisz się” zniknął, jest *✓ Jesteś zapisany*.

**08_limit_miejsc.png** (opcjonalnie, jeśli jest czas) – w oknie zwykłym wyloguj admina, zaloguj ręcznie jako `piotr.nowak@gmail.com` → zapisz go na nowe zawody (dostanie Sektor A / nr 2). Potem zarejestruj dwa nowe konta (np. `test1@test.pl`, `test2@test.pl`) i zapisz je – trzecie konto dostanie **Sektor B / nr 1** (pokazuje podział na sektory po 2 stanowiska), a przy 4/4 przycisk zmienia się w *Brak miejsc*. Zrzut karty 4/4.
Na koniec zaloguj z powrotem Admina w oknie zwykłym.

---

## Część C – czat w czasie rzeczywistym (sekcja 1.2 „Interakcja z użytkownikiem”, 2.3 Socket.IO)

Ustaw okna **obok siebie** (pół ekranu każde) – jeden zrzut całego ekranu.

- okno incognito (Jan) → karta „Puchar Wisły” → **💬 Czat**
- okno zwykłe (Admin) → karta „Puchar Wisły” → **💬 Czat**

Napisz 2–3 wiadomości naprzemiennie, np.:
- Jan: `Dzień dobry, o której odprawa?`
- Admin: `Odprawa o 6:30 przy sektorze A.`
- Jan: `Dzięki!`

**09_chat_dwa_okna.png** – zrzut całego ekranu: obie strony widzą te same wiadomości, wskaźnik *● połączono*, wiadomość admina ma pomarańczową etykietę **Organizator**, własne wiadomości po prawej (niebieskie).

**10_chat_brak_dostepu.png** – w oknie zwykłym (admin) zapisany jest tylko Jan na nowe zawody, więc: wyloguj admina, zaloguj `piotr.nowak@gmail.com` (jeśli nie robiłeś kroku 08 – Piotr nie jest zapisany na „Zawody Testowe”). Na karcie „Zawody Testowe” **nie ma** przycisku Czat. Dla pewności wejdź w zakładkę „💬 Czat” bez wybranego turnieju → komunikat „Wybierz turniej…”. Alternatywnie zrzut odpowiedzi API z DevTools (zakładka Network) dla `GET /api/chat/<id>` → **403**.
Jeśli robiłeś krok 08, pomiń ten zrzut.

---

## Część D – sędzia, ważenie, ranking (sekcja 2.2 maszyna stanów, 2.3 POST /catches, leaderboard)

Okno zwykłe – zaloguj **Admina**.

**11_status_rozpocznij.png** – zakładka Turnieje, karta „Puchar Wisły 2026” → kliknij **„Rozpocznij zawody”**. Zrzut po: badge zmienia się na pomarańczowy *W trakcie*, komunikat *Status „Puchar Wisły 2026”: W trakcie.*, przycisk zmienił się na „Zakończ zawody”.

**12_waga_blokada.png** – wyloguj, zaloguj ręcznie jako `sedzia@wedkowanie.pl` → zakładka **⚖️ Sędzia (Waga)**. W polu „Zawody” wybierz **„Zawody Testowe – Laboratorium (zapisy otwarte)”** → pojawia się pomarańczowa podpowiedź *Połowy można rejestrować tylko podczas trwania zawodów…*, przycisk zapisu wyszarzony. Zrzut.

**13_waga_dodanie.png** – zmień zawody na **„Puchar Wisły 2026 (w trakcie)”**, zawodnik: *Jan Kowalski — Sektor A / st. 4*, gatunek Karp, waga `3200` → „Zapisz Połów w Bazie”. Zielony komunikat *Zapisano: Karp, 3200 g dla Jan Kowalski (Puchar Wisły 2026).* Zrzut.

Bez zrzutu dodaj jeszcze:
- Jan Kowalski, Leszcz, `1450`
- Piotr Nowak, Amur, `4650`  ← Piotr będzie miał tyle samo łącznie co Jan (4650) → remis

**14_waga_walidacja.png** – spróbuj dodać wagę `-5` lub `0` → przeglądarka zablokuje (min=1); wpisz `2500000` → po wysłaniu komunikat z backendu *Waga musi być liczbą całkowitą od 1 do 200000 gramów.* Zrzut z komunikatem.

**15_ranking.png** – zakładka Turnieje → karta „Puchar Wisły 2026” → **Wyniki**. Tabela:
- #1 Piotr Nowak – 1 szt., największa 4650 g, łącznie 4650 g
- #1 Jan Kowalski – 2 szt., największa 3200 g, łącznie 4650 g … **uwaga:** Piotr ma większą rybę, więc będzie #1, Jan #2 (remis łącznej wagi rozstrzygnięty największą rybą). Zrzut tabeli.
Jeśli chcesz pokazać prawdziwe ex aequo (#1, #1, #3): dodaj Janowi jeszcze Płoć `1450` → wtedy Jan 6100 g vs Piotr 4650 g – to już nie remis. Prościej zostawić jak wyżej i opisać w podpisie: *„remis łącznej wagi rozstrzygnięty największą rybą”*.

**16_zakonczenie.png** (opcjonalnie) – jako Admin „Zakończ zawody” → badge *Zakończone*, brak dalszych przycisków statusu; w zakładce Waga dla tych zawodów znów blokada.

---

## Część E – warstwa techniczna (sekcja 2.1 / 2.4 / 2.5) – zrzuty z DevTools i terminala

**17_devtools_jwt.png** – DevTools → Network → dowolne żądanie `/api/...` → nagłówki żądania: `Authorization: Bearer eyJ…`. Pokazuje sesję na JWT.

**18_devtools_websocket.png** – DevTools → Network → filtr **WS** → połączenie `socket.io/?EIO=4&transport=websocket` → zakładka *Messages* z ramkami `chat:message`.

**19_terminal_backend.png** – terminal z nodemonem: linie *Połączono z bazą danych PostgreSQL*, *Socket.IO: adapter in-memory*, *Serwer uruchomiony na porcie 5000*.

**20_health.png** – przeglądarka: http://localhost:5000/ready → `{"status":"ready","db":"ok"}`.

**21_baza.png** (opcjonalnie) – w terminalu:
```
docker exec -it fishing_db_pg psql -U postgres -d fishing_db -c "\dt" -c "SELECT id,name,status,max_participants,spots_per_sector FROM tournaments;" -c "SELECT email,role,left(password_hash,20)||'...' AS hash FROM users;"
```
Pokazuje tabele, statusy i że hasła są hashami bcrypt (`$2b$10$…`).

---

## Gdzie wkleić w sprawozdaniu

| Zrzuty | Sekcja |
|---|---|
| 01, 17 | 1.2 – „Prosta strona web z logowaniem (sesją)” |
| 09, 18 | 1.2 – „Interakcja z użytkownikiem – chat” |
| 21 | 1.2 – „Baza danych” / 2.2 Model danych |
| 19, 20 | 2.1 Architektura / 2.5 Uruchomienie |
| 11, 16 | 2.2 – maszyna stanów |
| 06, 07, 08, 13, 15 | 2.3 – tabela API (obok odpowiednich wierszy) |
| 02, 03, 04, 05, 10, 12, 14 | 2.4 – elementy bezpieczeństwa (walidacja, autoryzacja po rolach) |
| cały przebieg A→D | 2.6 – scenariusz prezentacji |

Minimum, jeśli brakuje czasu: **01, 04, 05, 07, 09, 13, 15, 17** (8 zrzutów).

---

## Po sesji – sprzątanie (opcjonalnie)

Żeby wrócić do stanu wyjściowego przed prezentacją na żywo:
```
docker exec fishing_db_pg psql -U postgres -d fishing_db -c "DELETE FROM tournaments WHERE name LIKE 'Zawody Testowe%'; DELETE FROM catches; DELETE FROM chat_messages; DELETE FROM users WHERE email LIKE 'test%@test.pl'; UPDATE tournaments SET status='OPEN' WHERE id=1;"
```
