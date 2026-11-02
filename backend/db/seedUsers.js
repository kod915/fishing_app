// Dane demo – WYŁĄCZNIE do środowiska deweloperskiego.
// Uruchom: npm run db:seed  (albo: node db/seedUsers.js)
if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed demo users in production');
    process.exit(1);
}

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('../src/config/db');

const PASSWORD = 'haslo123'; // hasło demo dla wszystkich kont

const users = [
    ['admin@wedkowanie.pl', 'Marek Admin', 'ADMIN'],
    ['sedzia@wedkowanie.pl', 'Jan Sędzia', 'JUDGE'],
    ['jan.kowalski@gmail.com', 'Jan Kowalski', 'ANGLER'],
    ['piotr.nowak@gmail.com', 'Piotr Nowak', 'ANGLER'],
];

(async () => {
    // seed.sql wstawia konta z placeholderem hasła oraz przykładowe zawody i zapisy
    const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    await db.query(seedSql);

    const hash = await bcrypt.hash(PASSWORD, 10);
    for (const [email, name, role] of users) {
        await db.query(
            `INSERT INTO users (email, password_hash, full_name, role)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
            [email, hash, name, role]
        );
    }
    console.log(`Gotowe. Hasło dla wszystkich kont demo: ${PASSWORD}`);
    await db.pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
