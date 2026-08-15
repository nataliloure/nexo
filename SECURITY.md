# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a suspected security vulnerability involving authentication, authorization, user data, credentials, or privacy.

Use GitHub's private vulnerability reporting / Security Advisory flow for this repository when available. Include:

- a concise description of the issue;
- affected route, component, or database object;
- steps to reproduce without including real user data;
- expected and observed behavior;
- potential impact.

Do not include passwords, access tokens, session tokens, database exports, or sensitive psychological records in reports.

## Security model

Nexo treats the browser as an untrusted client. Authorization for private records is enforced in PostgreSQL with Row Level Security (RLS). Frontend route protection is an additional usability control, not the primary authorization boundary.

The browser uses a Supabase publishable key only. Secret/service-role keys must never be committed to this repository or bundled into the client.
