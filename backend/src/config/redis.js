const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

/**
 * Tworzy adapter Socket.IO oparty o Redis pub/sub, jeśli ustawiono REDIS_URL.
 * Dzięki niemu `io.to(room).emit()` dociera do klientów podłączonych do
 * dowolnej instancji backendu, a nie tylko do tej, która wysłała wiadomość.
 * Zwraca null, gdy REDIS_URL nie jest ustawione (tryb pojedynczej instancji).
 */
async function createSocketAdapter() {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const pubClient = createClient({ url });
  const subClient = pubClient.duplicate();

  pubClient.on('error', (err) => console.error('Redis (pub):', err.message));
  subClient.on('error', (err) => console.error('Redis (sub):', err.message));

  await Promise.all([pubClient.connect(), subClient.connect()]);
  console.log('Połączono z Redis');

  return createAdapter(pubClient, subClient);
}

module.exports = { createSocketAdapter };
