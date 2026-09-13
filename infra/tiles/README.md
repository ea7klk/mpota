# Self-hosted map tiles

The Compose stack exposes TileServer GL at `http://localhost:8080` and stores the tile set in the named volume `mpota-tile-data`. The one-shot `tile-bootstrap` service installs `curl`, downloads the configured MBTiles artifact, verifies an optional SHA-256 checksum, and atomically places it in the volume before TileServer GL starts.

Set these values in a local `.env` file copied from `.env.example`:

```text
MPOTA_TILESET_URL=https://your-licensed-source.example/mpota.mbtiles
MPOTA_TILESET_FILE=mpota.mbtiles
MPOTA_TILESET_SHA256=optional-full-sha256-digest
MPOTA_TILESET_REQUIRED=true
```

The URL is deliberately configuration-driven because current OpenMapTiles downloads are region/extract-specific. Use a licensed current MBTiles release from [OpenMapTiles Downloads](https://openmaptiles.org/downloads/) or an internal mirror. Do not commit a large binary tile set to Git.

By default, an existing file is retained. Set `MPOTA_TILESET_FORCE_REFRESH=true` for an intentional replacement; the old file remains in place if the download or checksum validation fails. The manifest beside the file records the source URL, checksum, and download time.

For local development without a tile artifact, leave `MPOTA_TILESET_REQUIRED=false`. The bootstrap service will finish successfully with an explanatory message, but the map will not have tiles until a source is configured. In production, set it to `true` so a missing or misconfigured tile set prevents a blank map deployment.

The web application uses the self-hosted endpoint and does not call the public OpenStreetMap community tile server. Keep OpenStreetMap attribution visible and comply with the ODbL and the data provider's terms when importing extracts.
