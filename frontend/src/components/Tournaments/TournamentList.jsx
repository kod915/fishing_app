import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';

const STATUS = {
    DRAFT: { label: 'Wersja robocza', color: '#94a3b8' },
    OPEN: { label: 'Zapisy otwarte', color: '#10b981' },
    IN_PROGRESS: { label: 'W trakcie', color: '#f59e0b' },
    FINISHED: { label: 'Zakończone', color: '#64748b' },
};

// Następny krok w cyklu życia zawodów – przyciski dla organizatorów
const NEXT_ACTION = {
    DRAFT: { status: 'OPEN', label: 'Otwórz zapisy', color: '#10b981' },
    OPEN: { status: 'IN_PROGRESS', label: 'Rozpocznij zawody', color: '#f59e0b' },
    IN_PROGRESS: { status: 'FINISHED', label: 'Zakończ zawody', color: '#64748b' },
};

export default function TournamentList({ user, onSelectTournament, onOpenChat }) {
    const [tournaments, setTournaments] = useState([]);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [busyId, setBusyId] = useState(null);

    const isOrganizer = user.role === 'ADMIN' || user.role === 'JUDGE';

    const load = () =>
        apiRequest('/tournaments').then(setTournaments).catch((e) => setError(e.message));

    useEffect(() => { load(); }, []);

    const register = async (t) => {
        setError(''); setInfo(''); setBusyId(t.id);
        try {
            const reg = await apiRequest('/registrations', 'POST', { tournament_id: t.id });
            await load();
            setInfo(`Zapisano na „${t.name}”. Twoje stanowisko: ${reg.sector} / nr ${reg.spot_number}.`);
        } catch (e) {
            setError(e.message);
        } finally {
            setBusyId(null);
        }
    };

    const changeStatus = async (t, status) => {
        setError(''); setInfo(''); setBusyId(t.id);
        try {
            await apiRequest(`/tournaments/${t.id}/status`, 'PATCH', { status });
            await load();
            setInfo(`Status „${t.name}”: ${STATUS[status].label}.`);
        } catch (e) {
            setError(e.message);
        } finally {
            setBusyId(null);
        }
    };

    const btn = (bg, disabled = false) => ({
        backgroundColor: disabled ? '#cbd5e1' : bg, color: '#fff', border: 'none', padding: '8px 14px',
        borderRadius: '4px', cursor: disabled ? 'not-allowed' : 'pointer', marginRight: '8px', marginBottom: '6px',
    });

    const badge = (status) => {
        const s = STATUS[status] || { label: status, color: '#94a3b8' };
        return <span style={{ fontSize: '12px', color: '#fff', backgroundColor: s.color, borderRadius: '4px', padding: '2px 8px', marginLeft: '8px', verticalAlign: 'middle' }}>{s.label}</span>;
    };

    const isFull = (t) => t.registered_count >= t.max_participants;

    return (
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2>Dostępne Turnieje Wędkarskie</h2>
            {error && <p style={{ color: '#dc2626' }}>{error}</p>}
            {info && <p style={{ color: '#059669' }}>{info}</p>}
            {tournaments.length === 0 && !error && <p style={{ color: '#94a3b8' }}>Brak opublikowanych zawodów.</p>}
            <div style={{ display: 'grid', gap: '15px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {tournaments.map((t) => {
                    const busy = busyId === t.id;
                    const next = NEXT_ACTION[t.status];
                    return (
                        <div key={t.id} style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '15px' }}>
                            <h3 style={{ marginTop: 0 }}>{t.name}{badge(t.status)}</h3>
                            <p>📍 <strong>Lokalizacja:</strong> {t.location}</p>
                            <p>📅 <strong>Data:</strong> {new Date(t.event_date).toLocaleDateString('pl-PL')}</p>
                            <p>👥 <strong>Miejsca:</strong> {t.registered_count} / {t.max_participants}
                                <span style={{ color: '#64748b', fontSize: '13px' }}> ({t.spots_per_sector} stanowisk / sektor)</span>
                            </p>
                            {t.is_registered && (
                                <p style={{ color: '#059669', fontWeight: 'bold' }}>✓ Jesteś zapisany</p>
                            )}

                            <button style={btn('#10b981')} onClick={() => onSelectTournament(t)}>Wyniki</button>

                            {user.role === 'ANGLER' && t.status === 'OPEN' && !t.is_registered && (
                                <button style={btn('#2563eb', isFull(t) || busy)} disabled={isFull(t) || busy} onClick={() => register(t)}>
                                    {isFull(t) ? 'Brak miejsc' : busy ? 'Zapisywanie...' : 'Zapisz się'}
                                </button>
                            )}

                            {(t.is_registered || isOrganizer) && (
                                <button style={btn('#7c3aed')} onClick={() => onOpenChat(t)}>💬 Czat</button>
                            )}

                            {isOrganizer && next && (
                                <button style={btn(next.color, busy)} disabled={busy} onClick={() => changeStatus(t, next.status)}>
                                    {next.label}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
