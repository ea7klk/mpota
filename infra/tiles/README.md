# Self-hosted map tiles

The Compose stack exposes TileServer GL at `http://localhost:8080` and stores the tile data in the named volume `mpota-tile-data`. For local development, the one-shot `tile-bootstrap` service installs `curl` and downloads the Europe OSM PBF extract with 5% progress logging. The dependent `tile-build` service converts that PBF to OpenMapTiles-compatible MBTiles with tilemaker and reports extraction progress in 5% increments before TileServer GL starts.

The development configuration uses the current Europe extract from [Geofabrik](https://download.geofabrik.de/europe-latest.osm.pbf):

```text
MPOTA_TILESET_URL=https://download.geofabrik.de/europe-latest.osm.pbf
MPOTA_TILESET_SOURCE_FILE=europe-latest.osm.pbf
MPOTA_TILESET_FILE=europe.mbtiles
MPOTA_TILESET_SHA256=
MPOTA_TILESET_REQUIRED=true
```

The URL is configuration-driven so development can use another Geofabrik region or an internal mirror. The PBF source is converted with [tilemaker](https://github.com/systemed/tilemaker), using its OpenMapTiles-compatible configuration. Do not commit source data or generated MBTiles to Git.

By default, an existing converted file is retained. After a successful conversion, the source PBF is deleted to reclaim disk space; a failed conversion leaves the PBF available for retry. Set `MPOTA_TILESET_FORCE_REFRESH=true` for an intentional replacement; the old converted file remains in place if the download or conversion fails. The manifest beside the converted file records the source URL and generation time.

The Europe PBF and generated MBTiles are still large, and the first `docker compose up` may take considerable time and disk space. For local development without a tile artifact, set `MPOTA_TILESET_REQUIRED=false` and clear `MPOTA_TILESET_URL`; the bootstrap service will finish with an explanatory message, but the build service cannot create a map until a source is configured. Kubernetes production remains configured for a prebuilt worldwide MBTiles artifact in `deploy/k8s/base/tile-bootstrap-config.yaml`.

The web application uses the self-hosted endpoint and does not call the public OpenStreetMap community tile server. Keep OpenStreetMap attribution visible and comply with the ODbL and the data provider's terms when importing extracts.
