/*
 * Security headers - hand-rolled instead of helmet, to keep the dependency list
 * at 7 packages and to keep every directive visible in one file.
 *
 * Evidence this was written against (measured on the live service):
 *  - every page loads exactly ONE external module script, zero inline scripts
 *    -> script-src 'self' is enough, no 'unsafe-inline' needed for JS
 *  - admin.js and render.js build UI with inline style attributes
 *    -> style-src needs 'unsafe-inline' (documented tradeoff, see README)
 *  - the only cross-origin asset is a tournament banner image
 *    -> img-src allows https: and data:
 *
 * HSTS is only sent in production: on a local http://127.0.0.1 preview it would
 * pin the browser to https on localhost and break the loopback preview.
 */
import { env } from '../config.js';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

export function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  res.removeHeader('X-Powered-By');
  if (env.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}
