import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';

export default function Scoreboard({ tournament }) {
  const [scores, setScores] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tournament) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    apiRequest(`/catches/leaderboard/${tournament.id}`)
      .then((rows) => { if (!cancelled) setScores(rows); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tournament?.id]);

  if (!tournament) {
    return (
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px' }}>
        <p>Wybierz turniej na liście, aby zobaczyć wyniki.</p>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px' }}>
      <h2>🏆 Wyniki na Żywo - {tournament.name}</h2>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      {loading && <p style={{ color: '#94a3b8' }}>Ładowanie...</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left' }}>
            <th style={{ padding: '10px' }}>Pozycja</th>
            <th style={{ padding: '10px' }}>Zawodnik</th>
            <th style={{ padding: '10px' }}>Sektor / Stanowisko</th>
            <th style={{ padding: '10px' }}>Ilość Ryb</th>
            <th style={{ padding: '10px' }}>Największa Ryba</th>
            <th style={{ padding: '10px' }}>Łączna Waga (g)</th>
          </tr>
        </thead>
        <tbody>
          {!loading && scores.length === 0 && (
            <tr><td colSpan={6} style={{ padding: '10px', color: '#94a3b8' }}>Brak zapisanych zawodników.</td></tr>
          )}
          {scores.map((s) => (
            <tr key={s.user_id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '10px', fontWeight: 'bold' }}>#{s.rank}</td>
              <td style={{ padding: '10px' }}>{s.full_name}</td>
              <td style={{ padding: '10px' }}>{s.sector} / St. {s.spot_number}</td>
              <td style={{ padding: '10px' }}>{s.fish_count} szt.</td>
              <td style={{ padding: '10px' }}>{s.biggest_fish} g</td>
              <td style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb' }}>{s.total_weight} g</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
