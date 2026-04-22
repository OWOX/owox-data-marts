# @owox/internal-helpers

These are internal helpers used by core OWOX packages. This package should not be used externally.

## Security headers

`SECURITY_HEADERS`, `applySecurityHeaders(res)`, and `sendSecureHtml(res, html)` provide a
framework-agnostic way to attach the five baseline HTTP security headers required by the OWOX
security DoD. They are always applied — there is no runtime toggle:

- `Strict-Transport-Security: max-age=31536000`
- `Content-Security-Policy: frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: no-referrer-when-downgrade`

`sendSecureHtml(res, html)` is the helper for IDP / SSR callsites that render HTML directly
(e.g. `res.send(Template.render*(...))`). It attaches the five headers before writing the body.
Use it instead of a blanket `/auth/*` middleware so adjacent JSON endpoints stay untouched.
