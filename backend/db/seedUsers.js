// Uruchom raz: node db/seedUsers.js
require('dotenv').config();
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
    process.exit(0);
})();