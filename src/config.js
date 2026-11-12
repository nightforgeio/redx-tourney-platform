import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
  dataDir: process.env.DATA_DIR || './data',
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@redxgamerz.example',
    password: process.env.ADMIN_PASSWORD || 'change-me',
  },
  isProd: process.env.NODE_ENV === 'production',
};