# MPOTA translation maintenance

The web client keeps one maintainable catalog per supported language:

- `apps/web/src/i18n/en.ts` — English source catalog
- `apps/web/src/i18n/es.ts` — Spanish catalog
- `apps/web/src/i18n/fr.ts` — French catalog
- `apps/web/src/i18n/de.ts` — German catalog

Each catalog contains shared interface text, the home-page content, and the Rules and Code of Conduct pages. `apps/web/src/i18n/types.ts` defines the shared shape, while `index.ts` assembles the catalogs for the application.

## Global Admin workflow

Users with `GLOBAL_ADMIN` or `SYSTEM_BOOTSTRAP_ADMIN` see **Translations** in the top menu. The page provides:

- a locale selector;
- searchable translation keys and values;
- an editable browser-local draft for the selected locale;
- JSON copy and download actions.

The page intentionally does not write source files or the production database. Export the draft JSON, review it, and apply approved changes to the corresponding TypeScript catalog in the Git repository. Commit the catalog update through the normal review and GitOps deployment process.

Drafts are stored in the browser under `mpota-translation-drafts-<locale>` and are therefore local to the administrator’s browser until exported.
