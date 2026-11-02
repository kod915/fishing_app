const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { isProd, jwtSecret, jwtExpiresIn, refreshTokenDays } = require('../config/env');
const refreshTokens = require('../services/refreshTokens');
const {
  parseText, parseEmail, isValidPassword, PASSWORD_MIN, PASSWORD_MAX_BYTES, handleError,
} = require('../utils/validation');

const BCRYPT_ROUNDS = 12;
// Porównanie z tym hashem wykonujemy, gdy konto nie istnieje – czas odpowiedzi
// nie zdradza wtedy, czy adres e-mail jest zarejestrowany.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

const REFRESH_COOKIE = 'refresh_token';
const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: refreshTokenDays * 24 * 60 * 60 * 1000,
};

const publicUser = (u) => ({ id: u.id, email: u.email, full_name: u.full_name, role: u.role });

const signAccessToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    jwtSecret,
    { algorithm: 'HS256', expiresIn: jwtExpiresIn }
  );

/** Wystawia parę tokenów: krótki JWT w odpowiedzi, długi refresh token w cookie HttpOnly. */
const respondWithSession = async (res, user, status = 200) => {
  const refresh = await refreshTokens.issue(user.id);
  res.cookie(REFRESH_COOKIE, refresh, refreshCookieOptions);
  res.status(status).json({ token: signAccessToken(user), user: publicUser(user) });
};

exports.register = async (req, res) => {
  const email = parseEmail(req.body.email);
  const fullName = parseText(req.body.full_name, 100);
  const password = req.body.password;

  if (!email) return res.status(400).json({ message: 'Nieprawidłowy adres e-mail.' });
  if (!fullName) return res.status(400).json({ message: 'Podaj imię i nazwisko (maks. 100 znaków).' });
  if (!isValidPassword(password)) {
    return res.status(400).json({ message: `Hasło musi mieć od ${PASSWORD_MIN} do ${PASSWORD_MAX_BYTES} znaków.` });
  }

  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    // Pojedynczy INSERT – unikalność pilnuje baza (indeks na lower(email)),
    // więc dwa równoczesne zapisy nie kończą się błędem 500.
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'ANGLER') RETURNING id, email, full_name, role`,
      [email, hash, fullName]
    );
    res.status(201).json({ message: 'Zarejestrowano pomyślnie', user: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Konto z tym adresem e-mail już istnieje.' });
    }
    handleError(res, err, 'Błąd rejestracji');
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ message: 'Podaj adres e-mail i hasło.' });
  }

  try {
    const result = await db.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email.trim()]);
    const user = result.rows[0];
    // Zawsze jedno porównanie bcrypt – także gdy użytkownik nie istnieje.
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) {
      return res.status(401).json({ message: 'Nieprawidłowy email lub hasło' });
    }
    await respondWithSession(res, user);
  } catch (err) {
    handleError(res, err, 'Błąd logowania');
  }
};

/** Wymiana refresh tokena (cookie) na nowy JWT + nowy refresh token. */
exports.refresh = async (req, res) => {
  const token = req.cookies && req.cookies[REFRESH_COOKIE];
  if (!token) return res.status(401).json({ message: 'Brak sesji.' });

  try {
    const rotated = await refreshTokens.rotate(token);
    if (!rotated) {
      res.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions.path });
      return res.status(401).json({ message: 'Sesja wygasła. Zaloguj się ponownie.' });
    }
    res.cookie(REFRESH_COOKIE, rotated.token, refreshCookieOptions);
    res.json({ token: signAccessToken(rotated.user), user: rotated.user });
  } catch (err) {
    handleError(res, err, 'Błąd odświeżania sesji');
  }
};

exports.logout = async (req, res) => {
  const token = req.cookies && req.cookies[REFRESH_COOKIE];
  try {
    await refreshTokens.revoke(token);
    res.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions.path });
    res.status(204).end();
  } catch (err) {
    handleError(res, err, 'Błąd wylogowania');
  }
};
