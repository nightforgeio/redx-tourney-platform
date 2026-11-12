import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config.js';

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const src = path.join(env.dataDir, 'redx.db');
const srcWAL = path.join(env.dataDir, 'redx.db-wal');
const destDir = path.join(env.dataDir, 'backups');
fs.mkdirSync(destDir, { recursive: true });

if (!fs.existsSync(src)) {
  console.error('No database found at', src);
  process.exit(1);
}

const dest = path.join(destDir, `redx-${stamp}.db`);
fs.copyFileSync(src, dest);
if (fs.existsSync(srcWAL)) fs.copyFileSync(srcWAL, dest + '-wal');
console.log('Backup written:', dest);