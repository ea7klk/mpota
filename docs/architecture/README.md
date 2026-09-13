# MPOTA architecture diagrams

These diagrams describe the proposed MPOTA (Municipal Parks on the Air) platform before application implementation begins.

Files:

- `mpota-flow.puml` — primary user, proposal, approval, map, and ADIF workflows.
- `mpota-components.puml` — runtime components and Docker/Kubernetes/GitOps deployment boundaries.
- `mpota-data-model.puml` — logical relational data model, including approval scopes and translated park content.

The files are standalone PlantUML sources and do not depend on external includes. Render them with any PlantUML-compatible renderer, for example:

```text
plantuml docs/architecture/mpota-flow.puml
plantuml docs/architecture/mpota-components.puml
plantuml docs/architecture/mpota-data-model.puml
```

## Decisions captured

- Public map queries return only approved parks.
- Park references are generated transactionally as `MP` + uppercase ISO-3166 alpha-2 country code + `-` + five zero-padded digits, for example `MPCS-00001`.
- An approver can be scoped to selected countries, selected continents, or all countries. Multiple countries and continents are first-class selections.
- A country or continent scope is evaluated against the park's ISO country and continent; `ALL` is an explicit global scope.
- Registered users may submit proposals from the map. Submissions remain pending until an authorized approver approves them.
- ADIF files are uploaded to object storage, scanned, parsed, validated, and processed asynchronously. The audit trail keeps the original file metadata and processing result.
- English, Spanish, French, and German are modeled as locale-aware UI and park-content translations.
- Leaflet uses a self-hosted OSM-compatible tile service; the browser does not call the public OSM community tile endpoint directly.
- The API is the system contract. Swagger/OpenAPI is generated or published from the backend.
