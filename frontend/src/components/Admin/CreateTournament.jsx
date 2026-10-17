import React, { useState } from 'react';

export default function CreateTournament() {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    alert(`Utworzono turniej: ${name}`);
    setName(''); setLocation(''); setDate('');
  };

  return (
    <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', maxWidth: '500px' }}>
      <h2>⚙️ Admin: Stwórz Nowy Turniej</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>Nazwa Zawodów:</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required style={{ width: '100%', padding: '8px' }} />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>Lokalizacja:</label>
          <input type="text" value={location} onChange={e => setLocation(e.target.value)} required style={{ width: '100%', padding: '8px' }} />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>Data:</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={{ width: '100%', padding: '8px' }} />
        </div>
        <button type="submit" style={{ backgroundColor: '#059669', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer' }}>Opublikuj Zawody</button>
      </form>
    </div>
  );
}
