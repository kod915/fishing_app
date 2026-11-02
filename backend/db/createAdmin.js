// Tworzy pierwsze konto administratora w środowisku produkcyjnym.
// Uruchamiany jednorazowo jako zadanie (Container Apps Job) z sekretami z Key Vault:
//   ADMIN_EMAIL, ADMIN_PASSWORD (16-72 bajty), opcjonalnie ADMIN_NAME.
// Po pierwszym logowaniu zmień hasło i usuń sekret.
const bcrypt = require('bcrypt');
const db = require('../src/config/db');

(async () => {
    const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = 'Administrator' } = process.env;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 16 || Buffer.byteLength(ADMIN_PASSWORD) > 72) {
        throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD (16-72 bytes) are required');
    }
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const r = await db.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES (lower($1), $2, $3, 'ADMIN')
         ON CONFLICT (email) DO NOTHING RETURNING id`,
        [ADMIN_EMAIL, hash, ADMIN_NAME]
    );
    console.log(r.rows.length ? `Utworzono administratora ${ADMIN_EMAIL.toLowerCase()}` : 'Konto już istnieje – bez zmian');
    await db.pool.end();
    process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
