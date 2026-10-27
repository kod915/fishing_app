const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Brak tokena autoryzacyjnego' });

  jwt.verify(token, process.env.JWT_SECRET || 'super_secret_key_change_me', (err, user) => {
    if (err) return res.status(403).json({ message: 'Nieprawidłowy lub wygasły token' });
    req.user = user;
    next();
  });
};

// Jak authenticateToken, ale brak/nieprawidłowy token nie blokuje żądania –
// req.user jest wtedy undefined. Dla endpointów publicznych, które zwracają
// więcej danych zalogowanym (np. lista turniejów z wersjami roboczymi dla organizatorów).
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();

  jwt.verify(token, process.env.JWT_SECRET || 'super_secret_key_change_me', (err, user) => {
    if (!err) req.user = user;
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

module.exports = { authenticateToken, optionalAuth, requireRole };
