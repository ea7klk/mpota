# Self-hosted map tiles

The normal Docker development stack uses the public OSM tile endpoint and does not start a local tile server, download an extract, or run tilemaker. The browser uses `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with a linked OpenStreetMap attribution.

The self-hosted pipeline remains available as an explicit Compose profile and is the production Kubernetes path. It exposes TileServer GL at `http://localhost:8080` and stores tile data in the named volume `mpota-tile-data`. The one-shot `tile-bootstrap` service downloads the configured source with 5% progress logging. The dependent `tile-build` service converts an OSM PBF to OpenMapTiles-compatible MBTiles with tilemaker and reports extraction progress in 5% increments before TileServer GL starts.

The optional local self-hosted profile uses the current Europe extract from [Geofabrik](https://download.geofabrik.de/europe-latest.osm.pbf):

```text
MPOTA_TILESET_URL=https://download.geofabrik.de/europe-latest.osm.pbf
MPOTA_TILESET_SOURCE_FILE=europe-latest.osm.pbf
MPOTA_TILESET_FILE=europe.mbtiles
MPOTA_TILESET_SHA256=
MPOTA_TILESET_REQUIRED=true
```

The URL is configuration-driven so the optional profile can use another Geofabrik region or an internal mirror. The PBF source is converted with [tilemaker](https://github.com/systemed/tilemaker), using its OpenMapTiles-compatible configuration. Do not commit source data or generated MBTiles to Git.

By default, an existing converted file is retained. After a successful conversion, the source PBF is deleted to reclaim disk space; a failed conversion leaves the PBF available for retry. Set `MPOTA_TILESET_FORCE_REFRESH=true` for an intentional replacement; the old converted file remains in place if the download or conversion fails. The manifest beside the converted file records the source URL and generation time.

The Europe PBF and generated MBTiles are still large. To opt into the local self-hosted profile, run:

```text
docker compose --profile self-hosted-tiles \
  -f compose.yaml -f compose.self-hosted-tiles.yaml up --build
```

Kubernetes production remains configured for a prebuilt worldwide MBTiles artifact in `deploy/k8s/base/tile-bootstrap-config.yaml`.

The public development endpoint is subject to the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/). Keep attribution visible, avoid bulk or abusive traffic, and do not use the public endpoint as the production basemap. Self-hosted deployments must comply with the ODbL and the data provider's terms when importing extracts.
