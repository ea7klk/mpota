# MPOTA translation maintenance

The web client keeps one maintainable catalog per supported language:

- `apps/web/src/i18n/en.ts` — English source catalog
- `apps/web/src/i18n/es.ts` — Spanish catalog
- `apps/web/src/i18n/fr.ts` — French catalog
- `apps/web/src/i18n/de.ts` — German catalog

Each catalog contains shared interface text, the home-page content, and the Rules and Code of Conduct pages. `apps/web/src/i18n/types.ts` defines the shared shape, while `index.ts` assembles the catalogs for the application. These files are the safe fallback shipped with the web client.

## Global Admin workflow

Users with `GLOBAL_ADMIN`, `SYSTEM_ADMIN`, or `SYSTEM_BOOTSTRAP_ADMIN` see the common **Admin** menu. The **System settings** page provides:

- a locale selector;
- searchable translation keys and values;
- editable database-backed values for the selected locale;
- editable database-backed park types, labels, activation state, and sort order;
- one save operation for the park types and all locale catalogs.

Saved values are stored in the `system_settings` table under `translations` and `park_types`. The web client merges the database values over the shipped catalogs, so a missing database value safely falls back to the versioned locale files. Direct database changes therefore take effect without rebuilding the frontend.

The API exposes `GET /api/v1/settings/public` for public configuration and `GET/PATCH /api/v1/admin/settings` for authorized maintenance. `GLOBAL_ADMIN` and `SYSTEM_ADMIN` may maintain these settings; `SYSTEM_ADMIN` cannot approve or edit parks.
