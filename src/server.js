import { createApp } from './app.js';
import { env } from './config.js';
import { openDb, migrate } from './db/db.js';

// Run migrations at boot (idempotent).
const bootDb = openDb();
migrate(bootDb);
bootDb.close();

const app = createApp();
app.listen(env.port, '0.0.0.0', () => {
  console.log(`RedX Gamerz platform listening on :${env.port}`);
});