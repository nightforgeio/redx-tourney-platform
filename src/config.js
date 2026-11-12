import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT || 3000),
  // Render (and most PaaS) require 0.0.0.0. Local previews should stay on the
  // loopback interface, so HOST can override it: HOST=127.0.0.1 npm run dev
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
  dataDir: process.env.DATA_DIR || './data',
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@redxgamerz.example',
    password: process.env.ADMIN_PASSWORD || 'change-me',
  },
  isProd: process.env.NODE_ENV === 'production',
};