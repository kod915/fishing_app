import React, { useState } from 'react';
import { apiRequest } from '../../api/client';

const DEMO_PASSWORD = 'haslo123';

export default function LoginPanel({ onLogin }) {
    const [mode, setMode] = useState('login'); // 'login' | 'register'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const doLogin = async (mail, pass) => {
        setError('');
        setLoading(true);
        try {
            const data = await apiRequest('/auth/login', 'POST', { email: mail, password: pass });
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            onLogin(data.user);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (mode === 'login') return doLogin(email, password);
        try {
            setError('');
            await apiRequest('/auth/register', 'POST', { email, password, full_name: fullName });
            await doLogin(email, password);
        } catch (e) {
            setError(e.message);
        }
    };

    const input = { width: '100%', padding: '8px', boxSizing: 'border-box' };
    const quickBtn = (bg) => ({
        flex: 1, backgroundColor: bg, color: '#fff', border: 'none',
        padding: '10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
    });

    return (
        <div style={{ maxWidth: '420px', margin: '40px auto', backgroundColor: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ marginTop: 0 }}>🎣 {mode === 'login' ? 'Logowanie' : 'Rejestracja'}</h2>

            <form onSubmit={handleSubmit}>
                {mode === 'register' && (
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', marginBottom: '4px' }}>Imię i nazwisko:</label>
                        <input style={input} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                    </div>
                )}
                <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px' }}>E-mail:</label>
                    <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px' }}>Hasło:</label>
                    <input style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>

                {error && <p style={{ color: '#dc2626' }}>{error}</p>}

                <button type="submit" disabled={loading}
                        style={{ ...quickBtn('#2563eb'), width: '100%' }}>
                    {mode === 'login' ? 'Zaloguj się' : 'Zarejestruj się'}
                </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: '14px' }}>
                {mode === 'login' ? 'Nie masz konta? ' : 'Masz już konto? '}
                <a href="#" onClick={(e) => { e.preventDefault(); setError(''); setMode(mode === 'login' ? 'register' : 'login'); }}>
                    {mode === 'login' ? 'Zarejestruj się' : 'Zaloguj się'}
                </a>
            </p>

            <hr style={{ margin: '16px 0' }} />
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 8px' }}>Szybkie logowanie (konta demo):</p>
            <div style={{ display: 'flex', gap: '8px' }}>
                <button style={quickBtn('#10b981')} disabled={loading}
                        onClick={() => doLogin('jan.kowalski@gmail.com', DEMO_PASSWORD)}>
                    👤 Jan Kowalski (wędkarz)
                </button>
                <button style={quickBtn('#7c3aed')} disabled={loading}
                        onClick={() => doLogin('admin@wedkowanie.pl', DEMO_PASSWORD)}>
                    ⚙️ Admin
                </button>
            </div>
        </div>
    );
}