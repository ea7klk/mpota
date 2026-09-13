# Self-hosted map tiles

The Compose stack exposes TileServer GL at `http://localhost:8080`. Place a licensed MBTiles extract and a compatible style configuration in this directory before using the map in an environment without a preloaded tile dataset.

The web application is configured to use the self-hosted endpoint and does not call the public OpenStreetMap community tile server. Keep OpenStreetMap attribution visible and comply with the ODbL and the data provider's terms when importing extracts.
