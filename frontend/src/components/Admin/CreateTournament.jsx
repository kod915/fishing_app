import React, { useState } from 'react';
import { apiRequest } from '../../api/client';

export default function CreateTournament() {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(30);
  const [spotsPerSector, setSpotsPerSector] = useState(10);
  const [openNow, setOpenNow] = useState(true);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setCreated(null); setLoading(true);
    try {
      const t = await apiRequest('/tournaments', 'POST', {
        name,
        location,
        event_date: date,
        max_participants: Number(maxParticipants),
        spots_per_sector: Number(spotsPerSector),
        status: openNow ? 'OPEN' : 'DRAFT',
      });
      setCreated(t);
      setName(''); setLocation(''); setDate('');
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
      <h2>⚙️ Admin: Stwórz Nowy Turniej</h2>
      <form onSubmit={handleSubmit}>
        <div style={field}>
          <label style={label}>Nazwa Zawodów:</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required maxLength={255} style={input} />
        </div>
        <div style={field}>
          <label style={label}>Lokalizacja:</label>
          <input type="text" value={location} onChange={e => setLocation(e.target.value)} required maxLength={255} style={input} />
        </div>
        <div style={field}>
          <label style={label}>Data:</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={input} />
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ ...field, flex: 1 }}>
            <label style={label}>Limit uczestników:</label>
            <input type="number" min={1} value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)} required style={input} />
          </div>
          <div style={{ ...field, flex: 1 }}>
            <label style={label}>Stanowisk w sektorze:</label>
            <input type="number" min={1} value={spotsPerSector} onChange={e => setSpotsPerSector(e.target.value)} required style={input} />
          </div>
        </div>
        <div style={field}>
          <label style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={openNow} onChange={e => setOpenNow(e.target.checked)} style={{ marginRight: '8px' }} />
            Otwórz zapisy od razu (w przeciwnym razie zawody pozostaną wersją roboczą)
          </label>
        </div>

        {error && <p style={{ color: '#dc2626' }}>{error}</p>}
        {created && (
          <p style={{ color: '#059669' }}>
            Utworzono „{created.name}” (ID {created.id}), status: {created.status === 'OPEN' ? 'zapisy otwarte' : 'wersja robocza'}.
          </p>
        )}

        <button type="submit" disabled={loading}
                style={{ backgroundColor: '#059669', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer' }}>
          {loading ? 'Zapisywanie...' : openNow ? 'Opublikuj Zawody' : 'Zapisz jako wersję roboczą'}
        </button>
      </form>
    </div>
  );
}
