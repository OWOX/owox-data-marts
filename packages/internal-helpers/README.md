# @owox/internal-helpers

These are internal helpers used by core OWOX packages. This package should not be used externally.

## Security headers

`SECURITY_HEADERS`, `applySecurityHeaders(res)`, `isSecurityHeadersEnabled(env?)`, and
`sendSecureHtml(res, html)` provide a framework-agnostic way to attach the five baseline HTTP
security headers required by the OWOX security DoD:

- `Strict-Transport-Security: max-age=31536000`
- `Content-Security-Policy: frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: no-referrer-when-downgrade`

`isSecurityHeadersEnabled` reads the `SECURITY_HEADERS_ENABLED` env variable (truthy values:
`'true'`, `'1'`, case-insensitive). It defaults to `false` so existing self-hosted deployments
keep their current behavior; opt in explicitly for public HTTPS deployments.

`sendSecureHtml(res, html)` is the recommended helper for IDP / SSR callsites that render HTML
directly (e.g. `res.send(Template.render*(...))`). It checks `isSecurityHeadersEnabled()` per
call and — when enabled — attaches the five headers before writing the body. Use it instead of
a blanket `/auth/*` middleware so adjacent JSON endpoints stay untouched.
