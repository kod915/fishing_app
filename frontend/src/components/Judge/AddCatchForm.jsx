import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';

const SPECIES = ['Karp', 'Leszcz', 'Płoć', 'Amur', 'Szczupak', 'Sandacz', 'Okoń', 'Lin', 'Inne'];

const STATUS_LABEL = { DRAFT: 'wersja robocza', OPEN: 'zapisy otwarte', IN_PROGRESS: 'w trakcie', FINISHED: 'zakończone' };

export default function AddCatchForm({ tournament }) {
  const [tournaments, setTournaments] = useState([]);
  const [tournamentId, setTournamentId] = useState(tournament ? String(tournament.id) : '');
  const [participants, setParticipants] = useState([]);
  const [userId, setUserId] = useState('');
  const [species, setSpecies] = useState('Karp');
  const [customSpecies, setCustomSpecies] = useState('');
  const [weight, setWeight] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  // Lista zawodów (sędzia/admin widzi też wersje robocze)
  useEffect(() => {
    apiRequest('/tournaments').then(setTournaments).catch((e) => setError(e.message));
  }, []);

  // Gdy zmieni się wybrany turniej w aplikacji – przełącz formularz
  useEffect(() => {
    if (tournament) setTournamentId(String(tournament.id));
  }, [tournament?.id]);

  // Uczestnicy wybranego turnieju
  useEffect(() => {
    setParticipants([]); setUserId('');
    if (!tournamentId) return;
    let cancelled = false;
    apiRequest(`/registrations/tournament/${tournamentId}`)
      .then((rows) => { if (!cancelled) setParticipants(rows); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [tournamentId]);

  const selected = tournaments.find((t) => String(t.id) === tournamentId);
  const canWeigh = selected && selected.status === 'IN_PROGRESS';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    try {
      const speciesName = species === 'Inne' ? customSpecies.trim() : species;
      const c = await apiRequest('/catches', 'POST', {
        tournament_id: Number(tournamentId),
        user_id: Number(userId),
        species: speciesName,
        weight_grams: Number(weight),
      });
      const who = participants.find((p) => p.user_id === c.user_id);
      setInfo(`Zapisano: ${c.species}, ${c.weight_grams} g dla ${who ? who.full_name : `zawodnika #${c.user_id}`} (${selected.name}).`);
      setWeight('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const field = { marginBottom: '12px' };
  const label = { display: 'block', marginBottom: '4px' };
  const input = { width: '100%', padding: '8px', boxSizing: 'border-box' };

  return (
    <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', maxWidth: '500px' }}>
      <h2>⚖️ Sędzia: Wprowadź Połów</h2>
      <form onSubmit={handleSubmit}>
        <div style={field}>
          <label style={label}>Zawody:</label>
          <select value={tournamentId} onChange={(e) => setTournamentId(e.target.value)} required style={input}>
            <option value="">— wybierz zawody —</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({STATUS_LABEL[t.status] || t.status})</option>
            ))}
          </select>
          {selected && !canWeigh && (
            <p style={{ color: '#b45309', fontSize: '13px', margin: '6px 0 0' }}>
              Połowy można rejestrować tylko podczas trwania zawodów (status „w trakcie”). Zmień status w zakładce Turnieje.
            </p>
          )}
        </div>

        <div style={field}>
          <label style={label}>Zawodnik:</label>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} required disabled={!tournamentId} style={input}>
            <option value="">{tournamentId ? (participants.length ? '— wybierz zawodnika —' : 'brak zapisanych zawodników') : '— najpierw wybierz zawody —'}</option>
            {participants.map((p) => (
              <option key={p.user_id} value={p.user_id}>{p.full_name} — {p.sector} / st. {p.spot_number}</option>
            ))}
          </select>
        </div>

        <div style={field}>
          <label style={label}>Gatunek Ryby:</label>
          <select value={species} onChange={(e) => setSpecies(e.target.value)} style={input}>
            {SPECIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {species === 'Inne' && (
            <input type="text" value={customSpecies} onChange={(e) => setCustomSpecies(e.target.value)}
                   placeholder="Podaj gatunek" required maxLength={100} style={{ ...input, marginTop: '6px' }} />
          )}
        </div>

        <div style={field}>
          <label style={label}>Waga (w gramach):</label>
          <input type="number" min={1} max={200000} step={1} value={weight} onChange={(e) => setWeight(e.target.value)}
                 placeholder="np. 2500" required style={input} />
        </div>

        {error && <p style={{ color: '#dc2626' }}>{error}</p>}
        {info && <p style={{ color: '#059669' }}>{info}</p>}

        <button type="submit" disabled={loading || !canWeigh || !userId}
                style={{ backgroundColor: loading || !canWeigh || !userId ? '#94a3b8' : '#2563eb', color: '#fff', border: 'none',
                         padding: '10px 16px', borderRadius: '4px', cursor: loading || !canWeigh || !userId ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Zapisywanie...' : 'Zapisz Połów w Bazie'}
        </button>
      </form>
    </div>
  );
}
