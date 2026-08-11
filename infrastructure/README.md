# Deployment infrastructure

No generic container deployment is checked in intentionally. The previous
Chat-only compose configuration referenced an incompatible earlier package
layout and would not have safely deployed this Workspace.

Use `PRODUCTION.md` to select the actual host, HTTPS domains, PostgreSQL,
Redis and secret store first. Once those are approved, infrastructure can be
written against the chosen platform and tested in a staging environment.
