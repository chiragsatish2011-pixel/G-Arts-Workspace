# Media

Media is not implemented in the foundation. Its future V1 import flow is deterministic:
manual upload, SHA-256 exact-duplicate check, metadata timestamp extraction, and event matching
by timestamp range. Near-duplicate analysis is explicitly deferred and is not SHA-256 deduplication.
