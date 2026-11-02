const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');

// Algorytm przypięty na sztywno – zapobiega atakom typu "alg: none" / podmiana algorytmu.
const VERIFY_OPTIONS = { algorithms: ['HS256'] };

const extractToken = (req) => {
  const authHeader = req.headers['authorization'];
  return authHeader && authHeader.split(' ')[1];
};

const authenticateToken = (req, res, next) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ message: 'Brak tokena autoryzacyjnego' });

  jwt.verify(token, jwtSecret, VERIFY_OPTIONS, (err, user) => {
    if (err) return res.status(401).json({ message: 'Nieprawidłowy lub wygasły token' });
    req.user = user;
    next();
  });
};

// Jak authenticateToken, ale BRAK tokena nie blokuje żądania – req.user jest wtedy
// undefined. Dla endpointów publicznych, które zwracają więcej danych zalogowanym
// (np. lista turniejów z wersjami roboczymi dla organizatorów).
// Token podany, ale nieprawidłowy/wygasły => 401, żeby klient odświeżył sesję,
// zamiast po cichu dostać okrojoną odpowiedź "anonimową".
const optionalAuth = (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  jwt.verify(token, jwtSecret, VERIFY_OPTIONS, (err, user) => {
    if (err) return res.status(401).json({ message: 'Nieprawidłowy lub wygasły token' });
    req.user = user;
    next();
  });
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Brak uprawnień do wykonania tej operacji' });
    }
    next();
  };
};

module.exports = { authenticateToken, optionalAuth, requireRole, VERIFY_OPTIONS };
