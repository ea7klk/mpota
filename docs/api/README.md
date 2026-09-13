# MPOTA API

The running API publishes interactive Swagger UI at `/docs` and the OpenAPI JSON document at `/docs-json`. In the local Compose environment these are:

- <http://localhost:3000/docs>
- <http://localhost:3000/docs-json>

The API is versioned under `/api/v1` and uses bearer authentication for registered-user and administrator operations. The public map endpoint is `GET /api/v1/parks` and returns approved parks only.

The main domains are authentication, approved parks, proposals/moderation, awards, ADIF uploads, and global user administration. Role and scope requirements are represented in the OpenAPI security metadata and enforced by the backend.

## Local bootstrap administrator

The API can create one idempotent local bootstrap administrator at startup when all bootstrap environment values are configured. The account is created only when its email does not already exist; an existing account is never overwritten.

```text
BOOTSTRAP_ADMIN_EMAIL=operator@example.org
BOOTSTRAP_ADMIN_PASSWORD=use-a-secret
BOOTSTRAP_ADMIN_NAME=MPOTA Administrator
BOOTSTRAP_ADMIN_CALLSIGN=EA7XXX
BOOTSTRAP_ADMIN_LOCALE=en
```

The bootstrap account receives the `GLOBAL_ADMIN` role. Supply the password through an ignored local `.env` file or a deployment secret, never through a committed file.

The default Compose stack runs native containers on Apple Silicon where supported, with targeted `linux/amd64` emulation for PostgreSQL/PostGIS, MinIO, Keycloak, and TileServer GL for Docker Desktop compatibility. Use `docker compose -f compose.yaml -f compose.amd64-parity.yaml up --build` when you need to exercise the complete production `linux/amd64` image path locally under emulation.
