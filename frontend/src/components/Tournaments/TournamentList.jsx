import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';

export default function TournamentList({ user, onSelectTournament, onOpenChat }) {
    const [tournaments, setTournaments] = useState([]);
    const [error, setError] = useState('');

    const load = () =>
        apiRequest('/tournaments').then(setTournaments).catch((e) => setError(e.message));

    useEffect(() => { load(); }, []);

    const register = async (t) => {
        try {
            setError('');
            await apiRequest('/registrations', 'POST', { tournament_id: t.id });
            await load();
            onOpenChat(t); // po zapisie od razu wchodzimy do czatu
        } catch (e) {
            setError(e.message); // np. "Jesteś już zapisany na te zawody."
        }
    };

    const btn = (bg) => ({ backgroundColor: bg, color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', marginRight: '8px' });

    return (
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2>Dostępne Turnieje Wędkarskie</h2>
            {error && <p style={{ color: '#dc2626' }}>{error}</p>}
            <div style={{ display: 'grid', gap: '15px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {tournaments.map((t) => (
                    <div key={t.id} style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '15px' }}>
                        <h3 style={{ marginTop: 0 }}>{t.name}</h3>
                        <p>📍 <strong>Lokalizacja:</strong> {t.location}</p>
                        <p>📅 <strong>Data:</strong> {new Date(t.event_date).toLocaleDateString('pl-PL')}</p>
                        <p>👥 <strong>Miejsca:</strong> {t.registered_count} / {t.max_participants}</p>
                        <button style={btn('#10b981')} onClick={() => onSelectTournament(t)}>Wyniki</button>
                        {user.role === 'ANGLER' && t.status === 'OPEN' && (
                            <button style={btn('#2563eb')} onClick={() => register(t)}>Zapisz się</button>
                        )}
                        <button style={btn('#7c3aed')} onClick={() => onOpenChat(t)}>💬 Czat</button>
                    </div>
                ))}
            </div>
        </div>
    );
}