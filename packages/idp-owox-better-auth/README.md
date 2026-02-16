# @owox/idp-owox-better-auth

Better Auth IDP provider for OWOX Data Marts authentication.

## Setup

### 1. Environment Configuration

```env
# OWOX IDP
IDP_PROVIDER=owox-better-auth

IDP_OWOX_DB_TYPE=sqlite

## MySQL Config
# IDP_OWOX_DB_TYPE=mysql
# IDP_OWOX_MYSQL_HOST=localhost
# IDP_OWOX_MYSQL_USER=root
# IDP_OWOX_MYSQL_PASSWORD=your-password
# IDP_OWOX_MYSQL_DB=idp_owox
# IDP_OWOX_MYSQL_PORT=3306
# IDP_OWOX_MYSQL_SSL=true

IDP_OWOX_CLIENT_BASE_URL=https://idp.example.com
IDP_OWOX_CLIENT_BACKCHANNEL_PREFIX=/your-custom-prefix
IDP_OWOX_C2C_SERVICE_ACCOUNT=service-account@example.com
IDP_OWOX_C2C_TARGET_AUDIENCE=audience-string
IDP_OWOX_CLIENT_ID=your-client-id
IDP_OWOX_PLATFORM_SIGN_IN_URL=https://platform.example.com/auth/sign-in
IDP_OWOX_PLATFORM_SIGN_UP_URL=https://platform.example.com/auth/sign-up
IDP_OWOX_SIGN_OUT_REDIRECT_URL=https://platform.example.com/auth/signed-out
IDP_OWOX_JWT_ISSUER=https://idp.example.com

# Better Auth IDP
IDP_BETTER_AUTH_SECRET=your-super-secret-key-at-least-32-characters-long
IDP_BETTER_AUTH_MAGIC_LINK_TTL=3600

# Magic-link email delivery (SendGrid)
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_VERIFIED_SENDER_EMAIL=verified-sender@example.com
SENDGRID_VERIFIED_SENDER_NAME=OWOX Data Marts

# Social login (Google)
# IDP_BETTER_AUTH_GOOGLE_CLIENT_ID=xx
# IDP_BETTER_AUTH_GOOGLE_CLIENT_SECRET=xx
# IDP_BETTER_AUTH_MICROSOFT_CLIENT_ID=xx
# IDP_BETTER_AUTH_MICROSOFT_CLIENT_SECRET=xx
# IDP_BETTER_AUTH_MICROSOFT_TENANT_ID=common
# IDP_BETTER_AUTH_MICROSOFT_AUTHORITY=https://login.microsoftonline.com
```

## Configuration Reference

| Variable                               | Required |                   Default                   | Description                                           |
| -------------------------------------- | :------: | :-----------------------------------------: | ----------------------------------------------------- |
| `IDP_PROVIDER`                         | **Yes**  |                      –                      | Set to `owox-better-auth`                             |
| `IDP_OWOX_DB_TYPE`                     |    No    |                  `sqlite`                   | Database type: `sqlite` or `mysql`                    |
| `IDP_OWOX_SQLITE_DB_PATH`              |    No    | `<app data>/sqlite/idp/owox-better-auth.db` | SQLite database file path                             |
| `IDP_OWOX_MYSQL_HOST`                  |    No    |                      –                      | MySQL host                                            |
| `IDP_OWOX_MYSQL_USER`                  |    No    |                      –                      | MySQL user                                            |
| `IDP_OWOX_MYSQL_PASSWORD`              |    No    |                      –                      | MySQL password                                        |
| `IDP_OWOX_MYSQL_DB`                    |    No    |                      –                      | MySQL database                                        |
| `IDP_OWOX_MYSQL_PORT`                  |    No    |                   `3306`                    | MySQL port                                            |
| `IDP_OWOX_MYSQL_SSL`                   |    No    |                   `false`                   | Enable SSL: `true`, JSON, or string                   |
| `IDP_OWOX_CLIENT_BASE_URL`             | **Yes**  |                      –                      | Identity client base URL                              |
| `IDP_OWOX_CLIENT_BACKCHANNEL_PREFIX`   | **Yes**  |                      –                      | Identity client path prefix for backchannel endpoints |
| `IDP_OWOX_C2C_SERVICE_ACCOUNT`         | **Yes**  |                      –                      | Service account email for C2C impersonation           |
| `IDP_OWOX_C2C_TARGET_AUDIENCE`         | **Yes**  |                      –                      | Target audience for C2C impersonation                 |
| `IDP_OWOX_CLIENT_ID`                   | **Yes**  |                      –                      | Client id for PKCE                                    |
| `IDP_OWOX_PLATFORM_SIGN_IN_URL`        | **Yes**  |                      –                      | Platform sign-in URL (redirect target)                |
| `IDP_OWOX_PLATFORM_SIGN_UP_URL`        | **Yes**  |                      –                      | Platform sign-up URL (redirect target)                |
| `IDP_OWOX_SIGN_OUT_REDIRECT_URL`       |    No    |               `/auth/sign-in`               | Custom redirect after sign-out                        |
| `IDP_OWOX_ALLOWED_REDIRECT_ORIGINS`    |    No    |    origins from platform sign-in/up URLs    | Allowlist for redirect-to/app-redirect-to             |
| `IDP_OWOX_JWT_ISSUER`                  | **Yes**  |                      –                      | Expected JWT issuer                                   |
| `IDP_OWOX_JWT_CACHE_TTL`               |    No    |                    `1h`                     | JWKS cache TTL                                        |
| `IDP_OWOX_JWT_CLOCK_TOLERANCE`         |    No    |                    `5s`                     | Clock skew tolerance                                  |
| `IDP_BETTER_AUTH_SECRET`               | **Yes**  |                      –                      | Secret key for signing (min. 32 characters)           |
| `PUBLIC_ORIGIN`                        |    No    |           `http://localhost:3000`           | Base URL for callbacks                                |
| `IDP_BETTER_AUTH_SESSION_MAX_AGE`      |    No    |              `1800` (30 mins)               | Session duration (seconds)                            |
| `IDP_BETTER_AUTH_TRUSTED_ORIGINS`      |    No    |               `PUBLIC_ORIGIN`               | Trusted origins for auth service                      |
| `IDP_BETTER_AUTH_MAGIC_LINK_TTL`       |    No    |                  `3600`                     | Magic-link token TTL (seconds)                        |
| `IDP_BETTER_AUTH_GOOGLE_CLIENT_ID`     |    No    |                      –                      | Google OAuth client id (enables Google)               |
| `IDP_BETTER_AUTH_GOOGLE_CLIENT_SECRET` |    No    |                      –                      | Google OAuth client secret                            |
| `IDP_BETTER_AUTH_MICROSOFT_CLIENT_ID`  |    No    |                      –                      | Microsoft OAuth client id (enables Microsoft)         |
| `IDP_BETTER_AUTH_MICROSOFT_CLIENT_SECRET` |    No    |                      –                      | Microsoft OAuth client secret                         |
| `IDP_BETTER_AUTH_MICROSOFT_TENANT_ID`  |    No    |                 `common`                    | Microsoft tenant id (e.g. common, consumers, or GUID) |
| `IDP_BETTER_AUTH_MICROSOFT_AUTHORITY`  |    No    | `https://login.microsoftonline.com`         | Microsoft authority URL                               |
| `SENDGRID_API_KEY`                     | **Yes**  |                      –                      | SendGrid API key for magic-link emails                |
| `SENDGRID_VERIFIED_SENDER_EMAIL`       | **Yes**  |                      –                      | Verified sender email in SendGrid                     |
| `SENDGRID_VERIFIED_SENDER_NAME`        |    No    |                      –                      | Sender display name for auth emails                   |

## Troubleshooting

### "IDP_BETTER_AUTH_SECRET is not set" Error

Make sure your `.env` file contains a valid `IDP_BETTER_AUTH_SECRET` with at least 32 characters.

### Database Connection Issues

For MySQL, verify your connection settings and ensure the database exists.

### Permission Denied

Ensure the user has permission for the action they're trying to perform.

## Email/password & magic-link flow

- Sign-in page shows Email + Password (Google remains available); it posts to Better Auth email sign-in and completes PKCE when `state` is present.
- Sign-up page shows only Email. A magic link is sent; after clicking it, the user lands on `/auth/password/setup` to set a password, then sees a success screen with a sign-in link.
- Forgot password lives at `/auth/forgot-password` and reuses the same magic-link + password setup flow.
- Magic-link confirm page: `/auth/magic-link?token=...&callbackURL=...` renders a confirm button before calling Better Auth verify.
- Password setup and success pages: `/auth/password/setup` (POST to save) and `/auth/password/success`.
- Email delivery uses `@owox/internal-helpers` SendGrid integration and one shared EJS template (`resources/templates/email/magic-link-email.ejs`) with intent-specific wording.

## Customizing the auth UI

### How it works

- Rendering goes through `TemplateService`, which stitches layout + page: `renderSignIn()` and `renderSignUp()` inject `pageTitle` and `heading` and place the page body into `layouts/auth.ejs`.
- The service first looks for templates in `dist/resources/templates`, and if missing, falls back to `src/resources/templates`. After changing files in `src`, run `npm run build` to refresh `dist`.
- Templates are EJS and styled with Tailwind via CDN (`partials/head.ejs` contains the Tailwind config with OWOX brand colors).

### Where the files live

- Layout: `src/resources/templates/layouts/auth.ejs` — splits the screen into brand panel + content and pulls in header/footer.
- Pages: `pages/sign-in.ejs` (email+password + Google), `pages/sign-up.ejs` (email only → magic link), `pages/forgot-password.ejs`, `pages/magic-link-confirm.ejs`, `pages/password-setup.ejs`, `pages/password-success.ejs`.
- Partials:
  - `head.ejs` — `<head>`, Tailwind include, color palette.
  - `header.ejs` — page heading (receives `heading`).
  - `brand-panel.ejs` — left panel with background and logo.
  - `footer.ejs` — terms and privacy links.
- Email template: `resources/templates/email/magic-link-email.ejs`.

### What and how to change

- Text/links: edit the relevant `pages/*.ejs` or `partials/footer.ejs`.
- Page heading: adjust `heading` in `TemplateService.renderSignIn|renderSignUp`, or edit `partials/header.ejs` if you need a different look.
- Buttons and social-login logic: in `pages/sign-in.ejs` and `pages/sign-up.ejs` (the `fetch` handlers).
- Magic-link / password reset UI and copy: in `pages/forgot-password.ejs`, `pages/magic-link-confirm.ejs`, `pages/password-setup.ejs`, `pages/password-success.ejs`.
- Styles/colors: tweak the Tailwind config in `partials/head.ejs` or utility classes in each section.
- Branding (background, logo, tagline): in `partials/brand-panel.ejs`.

### Quick steps

1. Edit the needed `.ejs` in `src/resources/templates/**`.
2. Check rendering locally (via the app that consumes this package).
3. Run `npm run build` to update `dist/resources/templates`.
4. Commit changes in `src` (and `dist` if you ship built artifacts).
