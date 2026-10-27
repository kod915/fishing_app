import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { apiRequest } from '../../api/client';

const SOCKET_URL = 'http://localhost:5000';

// scala listy wiadomości bez duplikatów (po id)
const mergeById = (a, b) => {
    const map = new Map();
    [...a, ...b].forEach((m) => map.set(m.id, m));
    return [...map.values()].sort((x, y) => x.id - y.id);
};

export default function TournamentChat({ tournament, user }) {
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const [connected, setConnected] = useState(false);
    const socketRef = useRef(null);
    const bottomRef = useRef(null);

    useEffect(() => {
        if (!tournament) return;
        let cancelled = false;
        setMessages([]);
        setError('');

        // 1. historia z REST
        apiRequest(`/chat/${tournament.id}`)
            .then((history) => { if (!cancelled) setMessages((prev) => mergeById(history, prev)); })
            .catch((e) => { if (!cancelled) setError(e.message); });

        // 2. połączenie w czasie rzeczywistym
        const socket = io(SOCKET_URL, { auth: { token: localStorage.getItem('token') } });
        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('chat:join', tournament.id, (res) => {
                if (res && res.ok) setConnected(true);
                else setError((res && res.message) || 'Nie udało się dołączyć do czatu');
            });
        });
        socket.on('disconnect', () => setConnected(false));
        socket.on('connect_error', (e) => setError(e.message));
        socket.on('chat:message', (msg) => {
            if (msg.tournament_id === tournament.id) setMessages((prev) => mergeById(prev, [msg]));
        });

        return () => { cancelled = true; socket.disconnect(); };
    }, [tournament?.id]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const send = (e) => {
        e.preventDefault();
        const content = text.trim();
        if (!content || !socketRef.current) return;
        socketRef.current.emit('chat:send', { tournamentId: tournament.id, content }, (res) => {
            if (res && !res.ok) setError(res.message);
        });
        setText('');
    };

    const isOrganizer = (role) => role === 'ADMIN' || role === 'JUDGE';

    return (
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', maxWidth: '700px' }}>
            <h2 style={{ marginTop: 0 }}>
                💬 Czat: {tournament.name}{' '}
                <span style={{ fontSize: '12px', color: connected ? '#10b981' : '#94a3b8' }}>
          ● {connected ? 'połączono' : 'łączenie...'}
        </span>
            </h2>

            {error && <p style={{ color: '#dc2626' }}>{error}</p>}

            <div style={{ height: '350px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', backgroundColor: '#f8fafc' }}>
                {messages.length === 0 && !error && <p style={{ color: '#94a3b8' }}>Brak wiadomości. Napisz pierwszą!</p>}
                {messages.map((m) => {
                    const mine = m.user_id === user.id;
                    return (
                        <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: '8px' }}>
                            <div style={{ maxWidth: '75%', padding: '8px 12px', borderRadius: '8px', backgroundColor: mine ? '#2563eb' : '#e2e8f0', color: mine ? '#fff' : '#1e293b' }}>
                                <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '2px' }}>
                                    <strong>{m.full_name}</strong>
                                    {isOrganizer(m.role) && (
                                        <span style={{ marginLeft: '6px', backgroundColor: '#f59e0b', color: '#fff', borderRadius: '4px', padding: '0 5px' }}>Organizator</span>
                                    )}
                                    <span style={{ marginLeft: '8px' }}>
                    {new Date(m.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                                </div>
                                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</div>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            <form onSubmit={send} style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={1000}
                    placeholder="Napisz wiadomość..."
                    disabled={!connected}
                    style={{ flex: 1, padding: '10px' }}
                />
                <button type="submit" disabled={!connected}
                        style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer' }}>
                    Wyślij
                </button>
            </form>
        </div>
    );
}