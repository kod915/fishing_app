import React from 'react';

export default function Scoreboard({ tournament }) {
  const demoScores = [
    { rank: 1, full_name: 'Jan Kowalski', sector: 'Sektor A', spot_number: 4, total_weight: 12450, fish_count: 8, biggest_fish: 3200 },
    { rank: 2, full_name: 'Piotr Nowak', sector: 'Sektor A', spot_number: 5, total_weight: 8900, fish_count: 5, biggest_fish: 2100 }
  ];

  return (
    <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px' }}>
      <h2>🏆 Wyniki na Żywo {tournament ? `- ${tournament.name}` : ''}</h2>
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
          {demoScores.map(s => (
            <tr key={s.rank} style={{ borderBottom: '1px solid #e2e8f0' }}>
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
