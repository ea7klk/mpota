# MPOTA architecture diagrams

These diagrams describe the MPOTA (Municipal Parks on the Air) platform and its current runnable MVP foundation.

Files:

- `mpota-flow.puml` — primary user, proposal, approval, map, and ADIF workflows.
- `mpota-components.puml` — runtime components and Docker/Kubernetes/GitOps deployment boundaries.
- `mpota-data-model.puml` — logical relational data model, including approval scopes, translated park content, awards, and administration.
- `mpota-award-lifecycle.puml` — award creation, publication, evaluation, and retirement.
- `mpota-rbac.puml` — role, scope, and high-impact administration permissions.
- `mpota-tile-update.puml` — tile artifact bootstrap and refresh lifecycle for Docker and Kubernetes.

The files are standalone PlantUML sources and do not depend on external includes. Render them with any PlantUML-compatible renderer, for example:

```text
plantuml docs/architecture/mpota-flow.puml
plantuml docs/architecture/mpota-components.puml
plantuml docs/architecture/mpota-data-model.puml
plantuml docs/architecture/mpota-award-lifecycle.puml
plantuml docs/architecture/mpota-rbac.puml
plantuml docs/architecture/mpota-tile-update.puml
```

## Decisions captured

- Public map queries return only approved parks.
- Park references are generated transactionally as `MP` + uppercase ISO-3166 alpha-2 country code + `-` + five zero-padded digits, for example `MPCS-00001`.
- An approver can be scoped to selected countries, selected continents, or all countries. Multiple countries and continents are first-class selections.
- A country or continent scope is evaluated against the park's ISO country and continent; `ALL` is an explicit global scope.
- Award Admins create and maintain award drafts; Global Admins publish, retire, and override awards.
- Global Admins may approve/remove entities and deactivate/delete users. Destructive actions are audited and user deletion defaults to deactivation/anonymization when historical logs require retention.
- Registered users may submit proposals from the map. Submissions remain pending until an authorized approver approves them.
- ADIF files are uploaded to object storage, scanned, parsed, validated, and processed asynchronously. The audit trail keeps the original file metadata and processing result.
- English, Spanish, French, and German are modeled as locale-aware UI and park-content translations.
- Leaflet uses a self-hosted OSM-compatible tile service; the browser does not call the public OSM community tile endpoint directly.
- Tile data is bootstrapped by a one-shot Docker service into the named volume `mpota-tile-data` and by a Kubernetes init container into the `mpota-tiles` PVC. A configured MBTiles URL, optional SHA-256 checksum, atomic replacement, and explicit force-refresh flag keep tile updates operationally separate from application releases.
- Container images are built for `linux/arm64` for Apple Silicon development and `linux/amd64` for production Linux; Alpine is used for Node/Nginx/Redis/NATS components where dependencies support it. Compose uses targeted `linux/amd64` emulation for MinIO, Keycloak, and TileServer GL when a Docker Desktop ARM64 resolver cannot select their published ARM manifest.
- The API is the system contract. Swagger/OpenAPI is generated or published from the backend.
