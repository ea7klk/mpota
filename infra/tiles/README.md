# Self-hosted map tiles

The Compose stack exposes TileServer GL at `http://localhost:8080` and stores the tile set in the named volume `mpota-tile-data`. The one-shot `tile-bootstrap` service installs `curl`, downloads the configured MBTiles artifact with 5% progress logging, verifies an optional SHA-256 checksum, and atomically places it in the volume before TileServer GL starts.

The repository configuration is pinned to the current completed OpenFreeMap worldwide planet extract (`20260906_080001_pt`) and its published SHA-256 checksum. Set or override these values in a local `.env` file:

```text
MPOTA_TILESET_URL=https://btrfs.openfreemap.com/areas/planet/20260906_080001_pt/tiles.mbtiles
MPOTA_TILESET_FILE=mpota.mbtiles
MPOTA_TILESET_SHA256=ca0b8f9a510563a1ccef9caeb55269285f112fb7b7cca4b371c8826bf722ea14
MPOTA_TILESET_REQUIRED=true
```

The URL is configuration-driven so deployments can use an internal mirror or a different regional extract. OpenFreeMap provides weekly full-planet MBTiles downloads based on OpenStreetMap/OpenMapTiles data; the selected artifact is documented at [OpenFreeMap](https://openfreemap.org/) and should be mirrored internally for production. Do not commit a large binary tile set to Git.

By default, an existing file is retained. Set `MPOTA_TILESET_FORCE_REFRESH=true` for an intentional replacement; the old file remains in place if the download or checksum validation fails. The manifest beside the file records the source URL, checksum, and download time.

The selected planet artifact is large and the first `docker compose up` may take considerable time and disk space. For local development without a tile artifact, set `MPOTA_TILESET_REQUIRED=false` and clear `MPOTA_TILESET_URL`; the bootstrap service will finish with an explanatory message, but the map will not have tiles. In production, keep it `true` so a missing or misconfigured tile set prevents a blank map deployment.

The web application uses the self-hosted endpoint and does not call the public OpenStreetMap community tile server. Keep OpenStreetMap attribution visible and comply with the ODbL and the data provider's terms when importing extracts.
