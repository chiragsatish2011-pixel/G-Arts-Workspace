# Authentication

Phase 1 follows the established G Arts chat account pattern: invite-only username/password
login, a display name, and administrator-issued accounts. It does not use email accounts.
Passwords are stored as bcrypt hashes and protected API requests use signed JWT access tokens.

- Passwords are never stored or logged in plaintext.
- Tokens contain only the user ID, username, display name, and role needed for authorization/UI.
- Protected routes require a valid bearer token.
- User creation and role assignment are restricted to `SUPER_ADMIN` and require explicit authorization.
- Production secrets are supplied only through environment variables.

## One sign-in for every space

The workspace is the identity authority. It issues the access token; every other
space verifies that same token rather than holding its own login. Chat's password
login is closed off whenever the workspace link is configured, so there is one set
of credentials and they cannot drift apart.

Workspace roles map onto each space's own vocabulary — for chat:
`SUPER_ADMIN`/`ADMIN` become moderators, `TEAM_LEAD`/`MEMBER`/`TRAINEE` become
members, and `GUEST` is read-only.

Members edit their own name, title, colour, profile picture and password in
**Profile**. Nothing about identity is editable anywhere else.
