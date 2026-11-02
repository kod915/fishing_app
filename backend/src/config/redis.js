const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const { redisUrl } = require('./env');

let clients = null;

/**
 * Łączy się z Redis, jeśli ustawiono REDIS_URL. Tworzy trzy połączenia:
 * pub/sub dla adaptera Socket.IO (wymagane przez protokół – klient w trybie
 * subscribe nie może wykonywać innych komend) i ogólne dla rate limitera.
 * Zwraca null, gdy Redis nie jest skonfigurowany (tryb pojedynczej instancji).
 */
async function connectRedis() {
  if (!redisUrl) return null;
  if (clients) return clients;

  const pub = createClient({ url: redisUrl });
  const sub = pub.duplicate();
  const client = pub.duplicate();

  for (const [name, c] of [['pub', pub], ['sub', sub], ['client', client]]) {
    c.on('error', (err) => console.error(`Redis (${name}):`, err.message));
  }

  await Promise.all([pub.connect(), sub.connect(), client.connect()]);
  console.log('Połączono z Redis');

  clients = { pub, sub, client };
  return clients;
}

/** Adapter Socket.IO rozgłaszający wiadomości między instancjami backendu. */
function createSocketAdapter() {
  return clients ? createAdapter(clients.pub, clients.sub) : null;
}

/** Ogólny klient Redis (rate limiting, health-check) lub null. */
function getRedisClient() {
  return clients ? clients.client : null;
}

async function closeRedis() {
  if (!clients) return;
  await Promise.allSettled([clients.pub.quit(), clients.sub.quit(), clients.client.quit()]);
  clients = null;
}

module.exports = { connectRedis, createSocketAdapter, getRedisClient, closeRedis };
