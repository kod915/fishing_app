import React from 'react';

export default function TournamentList({ onSelectTournament }) {
  const demoTournaments = [
    { id: 1, name: 'Puchar Wisły 2026', location: 'Tczew, Sektor A-C', event_date: '2026-06-15', status: 'OPEN', registered_count: 14, max_participants: 30 },
    { id: 2, name: 'Mistrzostwa Wielkopolski', location: 'Jezioro Kierskie', event_date: '2026-07-20', status: 'DRAFT', registered_count: 0, max_participants: 20 }
  ];

  return (
    <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h2>Dostępne Turnieje Wędkarskie</h2>
      <div style={{ display: 'grid', gap: '15px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {demoTournaments.map(t => (
          <div key={t.id} style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '15px' }}>
            <h3 style={{ marginTop: 0 }}>{t.name}</h3>
            <p>📍 <strong>Lokalizacja:</strong> {t.location}</p>
            <p>📅 <strong>Data:</strong> {t.event_date}</p>
            <p>👥 <strong>Miejsca:</strong> {t.registered_count} / {t.max_participants}</p>
            <button 
              onClick={() => onSelectTournament(t)}
              style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer' }}
            >
              Zobacz Wyniki / Zapisz się
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
