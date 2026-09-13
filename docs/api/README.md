# MPOTA API

The running API publishes interactive Swagger UI at `/docs` and the OpenAPI JSON document at `/docs-json`. In the local Compose environment these are:

- <http://localhost:3000/docs>
- <http://localhost:3000/docs-json>

The API is versioned under `/api/v1` and uses bearer authentication for registered-user and administrator operations. The public map endpoint is `GET /api/v1/parks` and returns approved parks only.

The main domains are authentication, approved parks, proposals/moderation, awards, ADIF uploads, and global user administration. Role and scope requirements are represented in the OpenAPI security metadata and enforced by the backend.

The default Compose stack runs native containers on Apple Silicon. Use `docker compose -f compose.yaml -f compose.amd64-parity.yaml up --build` when you need to exercise the production `linux/amd64` image path locally under emulation.
