import React, { useState } from 'react';

export default function AddCatchForm({ tournament }) {
  const [userId, setUserId] = useState('');
  const [species, setSpecies] = useState('Karp');
  const [weight, setWeight] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    alert(`Dodano połów: ${species}, ${weight}g dla zawodnika ID ${userId}`);
    setWeight('');
  };

  return (
    <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', maxWidth: '500px' }}>
      <h2>⚖️ Sędzia: Wprowadź Połów</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>ID Zawodnika:</label>
          <input type="number" value={userId} onChange={e => setUserId(e.target.value)} required style={{ width: '100%', padding: '8px' }} />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>Gatunek Ryby:</label>
          <select value={species} onChange={e => setSpecies(e.target.value)} style={{ width: '100%', padding: '8px' }}>
            <option value="Karp">Karp</option>
            <option value="Leszcz">Leszcz</option>
            <option value="Płoć">Płoć</option>
            <option value="Amur">Amur</option>
            <option value="Inne">Inne</option>
          </select>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>Waga (w gramach):</label>
          <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="np. 2500" required style={{ width: '100%', padding: '8px' }} />
        </div>
        <button type="submit" style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer' }}>Zapisz Połów w Bazie</button>
      </form>
    </div>
  );
}
