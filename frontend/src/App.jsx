import React, { useState } from 'react';
import Navbar from './components/Navbar';
import TournamentList from './components/Tournaments/TournamentList';
import Scoreboard from './components/Judge/Scoreboard';
import CreateTournament from './components/Admin/CreateTournament';
import AddCatchForm from './components/Judge/AddCatchForm';
import LoginPanel from './components/Auth/LoginPanel';
import TournamentChat from './components/Chat/TournamentChat';

// Wczytaj sesję z localStorage (jeśli token nie wygasł)
function loadSession() {
    try {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user'));
        if (!token || !user) return null;
        const { exp } = JSON.parse(atob(token.split('.')[1]));
        if (exp * 1000 < Date.now()) return null;
        return user;
    } catch {
        return null;
    }
}

export default function App() {
    const [user, setUser] = useState(loadSession);
    const [activeTab, setActiveTab] = useState('tournaments');
    const [selectedTournament, setSelectedTournament] = useState(null);

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setSelectedTournament(null);
        setActiveTab('tournaments');
    };

    if (!user) {
        return (
            <div style={{ fontFamily: 'sans-serif', backgroundColor: '#f4f6f8', minHeight: '100vh', padding: '20px' }}>
                <LoginPanel onLogin={setUser} />
            </div>
        );
    }

    const roleLabel = { ADMIN: 'Administrator', JUDGE: 'Sędzia', ANGLER: 'Wędkarz' }[user.role];

    return (
        <div style={{ fontFamily: 'sans-serif', backgroundColor: '#f4f6f8', minHeight: '100vh', padding: '20px' }}>
            <header style={{ backgroundColor: '#1e293b', color: '#fff', padding: '15px 20px', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '22px' }}>🎣 Fishing Manager</h1>
                    <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '14px' }}>Aplikacja do obsługi i rezerwacji stanowisk na zawodach wędkarskich</p>
                </div>
                <div style={{ textAlign: 'right', fontSize: '14px' }}>
                    <div>👤 {user.full_name} <span style={{ color: '#94a3b8' }}>({roleLabel})</span></div>
                    <button onClick={logout} style={{ marginTop: '6px', background: '#ef4444', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                        Wyloguj
                    </button>
                </div>
            </header>

            <Navbar activeTab={activeTab} setActiveTab={setActiveTab} userRole={user.role} />

            <main style={{ marginTop: '20px' }}>
                {activeTab === 'tournaments' && (
                    <TournamentList
                        user={user}
                        onSelectTournament={(t) => { setSelectedTournament(t); setActiveTab('scoreboard'); }}
                        onOpenChat={(t) => { setSelectedTournament(t); setActiveTab('chat'); }}
                    />
                )}

                {activeTab === 'scoreboard' && <Scoreboard tournament={selectedTournament} />}

                {activeTab === 'chat' && (
                    selectedTournament
                        ? <TournamentChat tournament={selectedTournament} user={user} />
                        : <p>Wybierz turniej na liście, aby wejść do czatu.</p>
                )}

                {activeTab === 'add-catch' && user.role !== 'ANGLER' && <AddCatchForm tournament={selectedTournament} />}
                {activeTab === 'admin' && user.role === 'ADMIN' && <CreateTournament />}
            </main>
        </div>
    );
}