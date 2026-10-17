import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import TournamentList from './components/Tournaments/TournamentList';
import Scoreboard from './components/Judge/Scoreboard';
import CreateTournament from './components/Admin/CreateTournament';
import AddCatchForm from './components/Judge/AddCatchForm';

export default function App() {
  const [user, setUser] = useState({ id: 1, full_name: 'Marek Admin', role: 'ADMIN' });
  const [activeTab, setActiveTab] = useState('tournaments');
  const [selectedTournament, setSelectedTournament] = useState(null);

  return (
    <div style={{ fontFamily: 'sans-serif', backgroundColor: '#f4f6f8', minHeight: '100vh', padding: '20px' }}>
      <header style={{ backgroundColor: '#1e293b', color: '#fff', padding: '15px 20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px' }}>🎣 Fishing Manager (PostgreSQL + React Architecture)</h1>
        <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '14px' }}>Aplikacja do obsługi i rezerwacji stanowisk na zawodach wędkarskich</p>
      </header>

      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} userRole={user.role} />

      <main style={{ marginTop: '20px' }}>
        {activeTab === 'tournaments' && (
          <TournamentList onSelectTournament={(t) => { setSelectedTournament(t); setActiveTab('scoreboard'); }} />
        )}

        {activeTab === 'scoreboard' && (
          <Scoreboard tournament={selectedTournament} />
        )}

        {activeTab === 'add-catch' && user.role !== 'ANGLER' && (
          <AddCatchForm tournament={selectedTournament} />
        )}

        {activeTab === 'admin' && user.role === 'ADMIN' && (
          <CreateTournament />
        )}
      </main>
    </div>
  );
}
