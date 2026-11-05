# Changelog

## Unreleased

- Updated Noderyx Framework from 0.7.2 to 0.9.0 and required 0.9.x for new installs.
- Raised the minimum Node.js version to 26 and aligned Docker, publishing, and deployment settings.
- Visual Builder: animated drag and drop with a floating drag preview, a labeled drop indicator, exact-position drops from the widget library, canvas, and navigator, smooth reorder (FLIP) animations, drop-in and removal effects, edge auto-scroll, and Esc to cancel.
- Visual Builder: hover toolbar on canvas widgets (drag, duplicate, delete), drag-to-reorder navigator, and keyboard shortcuts (Delete, Ctrl+D, Ctrl+C/V, Alt+↑/↓, Ctrl+Y, Esc).
- Visual Builder: advanced widget options — scroll-triggered entrance animations with duration and delay, hover effects, border, box shadow, max width, CSS ID anchors, custom CSS classes, and copy/paste style. Style controls now use live sliders and color pickers.
- Visual Builder: new Video, Gallery, Icon List, Star Rating, and Countdown widgets, plus a "Product launch" template. Published pages load `builder-runtime.js` for animations, counter count-up, progress fills, live countdowns, and video players; without it, content stays fully visible.

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
