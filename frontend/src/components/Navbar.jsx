import React from 'react';

export default function Navbar({ activeTab, setActiveTab, userRole }) {
  const navBtnStyle = (tab) => ({
    padding: '10px 16px',
    marginRight: '8px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    backgroundColor: activeTab === tab ? '#2563eb' : '#e2e8f0',
    color: activeTab === tab ? '#ffffff' : '#334155'
  });

  return (
    <nav style={{ display: 'flex', gap: '8px' }}>
      <button style={navBtnStyle('tournaments')} onClick={() => setActiveTab('tournaments')}>📅 Turnieje</button>
      <button style={navBtnStyle('scoreboard')} onClick={() => setActiveTab('scoreboard')}>🏆 Tabela Wyników (Live)</button>
      {userRole !== 'ANGLER' && (
        <button style={navBtnStyle('add-catch')} onClick={() => setActiveTab('add-catch')}>⚖️ Sędzia (Waga)</button>
      )}
      {userRole === 'ADMIN' && (
        <button style={navBtnStyle('admin')} onClick={() => setActiveTab('admin')}>⚙️ Panel Admina</button>
      )}
    </nav>
  );
}
