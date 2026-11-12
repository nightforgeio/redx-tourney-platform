import { openDb, migrate } from './db.js';

const db = openDb();
migrate(db);
console.log('Migrations applied. Tables ready.');
db.close();