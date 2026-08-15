# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a suspected security vulnerability involving authentication, authorization, user data, credentials, or privacy.

Use GitHub's private vulnerability reporting / Security Advisory flow for this repository when available. Include:

- a concise description of the issue;
- affected route, component, or database object;
- steps to reproduce without including real user data;
- expected and observed behavior;
- potential impact.

Do not include passwords, access tokens, session tokens, database exports, TOTP secrets, or sensitive psychological records in reports.

## Security model

Nexo treats the browser as an untrusted client. Authorization for private records is enforced in PostgreSQL with Row Level Security (RLS). Frontend route protection is an additional usability control, not the primary authorization boundary.

The browser uses a Supabase publishable key only. Secret/service-role keys must never be committed to this repository or bundled into the client.

### Authentication

- The public application exposes sign-in only. New-account creation is not presented by the Nexo UI.
- TOTP multi-factor authentication is required by the application gate before authenticated content is mounted.
- Once a user has a verified MFA factor, a restrictive PostgreSQL policy requires an `aal2` session for access to `nexo_records`.
- A password-only session remains insufficient after MFA enrollment, even when the user ID is correct.
- The browser session is locally locked after 30 minutes without interaction.
- Authentication errors shown by the login UI are intentionally generic.

### Data authorization

Access to `public.nexo_records` is the intersection of restrictive and ownership policies:

1. the caller must be a permanent authenticated user;
2. the caller must satisfy the MFA assurance policy when a verified factor exists;
3. `auth.uid()` must equal the row `user_id`;
4. the authenticated role has only the table privileges used by the application.

MFA factor inspection used by RLS is performed by a non-exposed helper in the `private` schema. The client is not granted direct `SELECT` access to `auth.mfa_factors`.

### Software supply chain and deployment

- npm dependencies are version-pinned and installed from `package-lock.json` with `npm ci`.
- install lifecycle scripts are disabled in CI/deploy.
- production dependencies are audited before builds.
- GitHub Actions are pinned to immutable commit SHAs.
- CodeQL runs on `main`, pull requests to `main`, and on a weekly schedule.
- Pull requests have an independent build-and-audit workflow.
- CODEOWNERS identifies the repository owner for all code and sensitive paths.
- GitHub Pages deployment is restricted to runs whose actor and repository owner are `nataliloure`.

## Administrative controls outside repository code

Repository code cannot itself enforce security settings of the GitHub or Supabase administrator accounts. Those accounts should use phishing-resistant MFA/passkeys where supported. GitHub branch rules/rulesets should require pull requests and successful security checks before changes reach `main`. Supabase project-level controls such as leaked-password protection, server-side signup disablement, session limits, SSL enforcement, and network restrictions should be enabled in the platform dashboard when supported by the active plan and deployment model.
