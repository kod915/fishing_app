import React, { useEffect, useState } from 'react';
import Navbar from './components/Navbar';
import TournamentList from './components/Tournaments/TournamentList';
import Scoreboard from './components/Judge/Scoreboard';
import CreateTournament from './components/Admin/CreateTournament';
import AddCatchForm from './components/Judge/AddCatchForm';
import LoginPanel from './components/Auth/LoginPanel';
import TournamentChat from './components/Chat/TournamentChat';
import { hasValidToken, tryRefresh, logoutRequest } from './api/client';

// Użytkownik z localStorage, jeśli token jeszcze ważny
function loadSession() {
    try {
        const user = JSON.parse(localStorage.getItem('user'));
        return hasValidToken() && user ? user : null;
    } catch {
        return null;
    }
}

export default function App() {
    const [user, setUser] = useState(loadSession);
    // Gdy JWT wygasł, próbujemy przedłużyć sesję refresh tokenem (cookie) zanim pokażemy logowanie
    const [restoring, setRestoring] = useState(() => !loadSession());
    const [activeTab, setActiveTab] = useState('tournaments');
    const [selectedTournament, setSelectedTournament] = useState(null);

    useEffect(() => {
        if (!restoring) return;
        tryRefresh().then((u) => { setUser(u); setRestoring(false); });
    }, []);

    // Backend odrzucił sesję i odświeżenie się nie udało -> wyloguj w UI
    useEffect(() => {
        const onLogout = () => { setUser(null); setSelectedTournament(null); setActiveTab('tournaments'); };
        window.addEventListener('auth:logout', onLogout);
        return () => window.removeEventListener('auth:logout', onLogout);
    }, []);

    const logout = async () => {
        await logoutRequest();
        setUser(null);
        setSelectedTournament(null);
        setActiveTab('tournaments');
    };

    const shell = (children) => (
        <div style={{ fontFamily: 'sans-serif', backgroundColor: '#f4f6f8', minHeight: '100vh', padding: '20px' }}>
            {children}
        </div>
    );

    if (restoring) return shell(<p style={{ textAlign: 'center', color: '#64748b' }}>Przywracanie sesji...</p>);
    if (!user) return shell(<LoginPanel onLogin={setUser} />);

    const roleLabel = { ADMIN: 'Administrator', JUDGE: 'Sędzia', ANGLER: 'Wędkarz' }[user.role];

    return shell(
        <>
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
        </>
    );
}
