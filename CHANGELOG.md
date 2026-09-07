# Changelog

## 1.1.0 — 2026-09-07

- Redesigned the admin workspace around a responsive, green CMS navigation system with a fixed brand and scrollable menus.
- Added searchable content tables, status filters, sorting, pagination, and saved screen preferences.
- Added shared editorial tasks with priorities and due dates, plus persistent team notes.
- Included Noderyx Visual Builder as an active core plugin for posts and pages, with direct full-screen entry from the editor, content list, and Plugins screen.
- Added 12 widgets, drag handles, media selection, styling, responsive previews and visibility, layer navigation, starter templates, local reusable layouts, JSON import/export, undo/redo, and revision support.
- Added standard, full-width, and blank-canvas page layouts.
- Applied validated builder styles through external stylesheets compatible with the CMS content security policy.
- Added validation, persistence, rendering, and revision tests; added release checks before publishing.

### Updating an existing project

The npm package is a project generator. Installing a newer generator does not overwrite the application files in an existing CMS.

For an existing checkout of this repository, back up its data and commit or stash local customizations, then pull the release, install dependencies with `npm ci`, run `npm run build`, and restart the application. For cPanel installations using the included deployment script, use `bash deployment/deploy.sh`; its preservation rules retain `.env`, `storage/`, and uploaded media.

Existing posts and pages remain readable. Legacy visual blocks receive default styling when opened. Tasks and notes are created on first use; no database migration is required.

## 1.0.2

- Previous package version with GitHub Actions publishing and deployment support.
