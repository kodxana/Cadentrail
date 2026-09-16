# Security

Cadentrail is a single-user workstation, not a multi-tenant hosted service. Open access is the default and includes the API. Configure DAW_PASSWORD to require sign-in before exposing a private workstation; use HTTPS for remote access. See [access behavior](docs/ACCESS.md) and [agent token scopes](docs/API.md).

Security fixes target the current release. Older versions are not maintained as separate security branches.

## Reporting

When the public repository enables GitHub private vulnerability reporting, use Security → Report a vulnerability. If that option is unavailable, open an issue asking the maintainer for a private reporting channel without including exploit details or sensitive data. Do not post tokens, passwords, project archives or private Pod addresses publicly.

A useful private report includes the affected version, minimal reproduction, impact and whether authentication is required. Use synthetic project data. There is no promised response time or bug bounty.

## Maintainer publication setup

Enable private vulnerability reporting and GitHub secret scanning when the public repository is created. Store deployment credentials only in private environment variables or repository secrets. The source CI runs tests without Runpod credentials and never provisions GPU resources or publishes containers.
