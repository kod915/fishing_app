// Zarządza ograniczoną rolą bazodanową `fishing_app`, z której korzysta aplikacja
// (tylko DML – bez prawa do zmiany schematu). Uruchamiane jako administrator bazy
// w kroku release (db/release.sh), przed i po migracjach.
//
//   node db/roles.js create   # tworzy/aktualizuje rolę; wymaga APP_DB_PASSWORD (hex, >= 32 znaki)
//   node db/roles.js grant    # nadaje DML na wszystkich tabelach i sekwencjach schematu public
const { Client } = require('pg');

const mode = process.argv[2];
const APP_ROLE = 'fishing_app';

(async () => {
    const isProd = process.env.NODE_ENV === 'production';
    const c = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: isProd ? { rejectUnauthorized: true } : false,
    });
    await c.connect();

    if (mode === 'create') {
        const pass = process.env.APP_DB_PASSWORD || '';
        // hex: bezpieczne w URL połączenia i w literale SQL poniżej
        if (!/^[0-9a-f]{32,}$/.test(pass)) throw new Error('APP_DB_PASSWORD must be a long hex string');
        await c.query(`DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE}')
                THEN CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${pass}';
                ELSE ALTER ROLE ${APP_ROLE} PASSWORD '${pass}';
            END IF; END $$`);
        await c.query(`GRANT CONNECT ON DATABASE ${c.database} TO ${APP_ROLE}`);
        console.log(`Rola ${APP_ROLE} gotowa`);
    } else if (mode === 'grant') {
        await c.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
        await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
        await c.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);
        // tabela migracji ma pozostać tylko do odczytu dla aplikacji
        await c.query(`REVOKE INSERT, UPDATE, DELETE ON pgmigrations FROM ${APP_ROLE}`).catch(() => {});
        console.log(`Uprawnienia DML dla ${APP_ROLE} nadane`);
    } else {
        throw new Error('Usage: node db/roles.js <create|grant>');
    }
    await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
