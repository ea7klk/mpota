# MPOTA API

The running API publishes interactive Swagger UI at `/docs` and the OpenAPI JSON document at `/docs-json`. In the local Compose environment these are:

- <http://localhost:3000/docs>
- <http://localhost:3000/docs-json>

The API is versioned under `/api/v1` and uses bearer authentication for registered-user and administrator operations. The public map endpoint is `GET /api/v1/parks` and returns approved and retired parks; retired parks remain visible for historical context and are marked as inactive. `GET /api/v1/parks/{reference}/detail` returns the complete public park profile, activity summary, activations, park leaders, and image metadata.

The main domains are authentication, parks and lifecycle administration, park image uploads, proposals/moderation, awards, QSO/ADIF processing, user profiles, and global user administration. Entity admins can use `POST /api/v1/admin/parks/{id}/retire` and `POST /api/v1/admin/parks/{id}/activate` within their approval scope; parks are never deleted. Role and scope requirements are represented in the OpenAPI security metadata and enforced by the backend.

## Hunter attribution and profiles

Hunter callsigns do not need to be registered for a QSO to be valid. When a user registers or adds a callsign to their profile, matching historical valid contacts that have not already been attributed are linked to that user and award progress is recalculated. New valid contacts are attributed automatically when the hunter callsign matches an active registered user. `GET /api/v1/profile` returns editable identity data, activations, hunter-park totals, and award progress; `PATCH /api/v1/profile` updates the identity and performs the historical attribution step.

## QSO logging and ADIF processing

QSO entry is park-scoped and uses the same validation service for manual and uploaded records:

- `POST /api/v1/parks/{reference}/qsos` adds one manually entered QSO, including optional frequency, band, and mode.
- `POST /api/v1/parks/{reference}/uploads/adif` uploads an ADIF file for the selected approved park.
- `GET /api/v1/uploads` lists the authenticated user’s ADIF files with park, upload date, size, status, and valid/invalid counts.
- `GET /api/v1/uploads/{id}/rejected-qsos` returns the rejected records and validation reasons for an owned ADIF upload.

The legacy `POST /api/v1/uploads/adif` route remains available, but it requires the `parkReference` multipart field. ADIF records do not select their own park: the park supplied by the request is applied to every record, which keeps the activation context explicit.

The processor rejects malformed callsigns, invalid dates, exact duplicate QSOs, and repeated hunter callsigns in the same ADIF file. A valid hunter contact can count only once per activator, park, and UTC calendar day. Frequency is retained from either the manual entry or the ADIF `FREQ` field. Uploads progress through `RECEIVED`, `PROCESSING`, `COMPLETED`, `PARTIAL`, or `FAILED`; invalid records are retained with a reason so the user can correct and resubmit them.

Registered users can upload JPEG, PNG, WebP, or GIF images with `POST /api/v1/parks/{reference}/images`. Binary files are kept in the dedicated `S3_PARK_IMAGES_BUCKET` under `CONTINENT/COUNTRY/{reference}-{serial}.{extension}`. `GET /api/v1/parks/{reference}/images` lists image metadata, and the returned image URLs serve approved- or retired-park images for thumbnails and full-size viewing.

## Local bootstrap administrator

The API can create one idempotent local bootstrap administrator at startup when all bootstrap environment values are configured. The account is created only when its email does not already exist; an existing account is never overwritten.

Local passwords must contain at least 8 characters.

```text
BOOTSTRAP_ADMIN_EMAIL=operator@example.org
BOOTSTRAP_ADMIN_PASSWORD=use-a-secret
BOOTSTRAP_ADMIN_NAME=MPOTA Administrator
BOOTSTRAP_ADMIN_CALLSIGN=EA7XXX
BOOTSTRAP_ADMIN_LOCALE=en
```

The bootstrap account receives the `GLOBAL_ADMIN` role. Supply the password through an ignored local `.env` file or a deployment secret, never through a committed file.

The default Compose stack runs native containers on Apple Silicon where supported, with targeted `linux/amd64` emulation for PostgreSQL/PostGIS, MinIO, Keycloak, and TileServer GL for Docker Desktop compatibility. Use `docker compose -f compose.yaml -f compose.amd64-parity.yaml up --build` when you need to exercise the complete production `linux/amd64` image path locally under emulation.
