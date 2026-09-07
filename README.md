# Noderyx CMS

A lightweight WordPress-style CMS built natively on Noderyx Framework.

## Create a CMS project

From this starter repository, create and install a fresh CMS with:

```bash
npm run cms:new -- ../my-cms
```

After running `npm link` once in this starter, the command is available from
any directory:

```bash
nodecms create my-cms
```

The command copies only project files, generates a fresh `APP_KEY`, creates a
new `.env`, excludes existing content and credentials, and runs `npm install`.
Use `--no-install` when dependencies should be installed later.

After the starter is linked or published as a CLI package, the equivalent is:

```bash
nodecms create my-cms
```

Then seed the administrator and start the project:

```bash
cd ../my-cms
npm run seed
npm run dev
```

The CMS login is available at `/nodecms/login`.

Core CMS modules include content and revisions, categories, comments and
moderation, image uploads and remote media, navigation menus, multiple themes,
users and roles, SEO controls, and JSON backups.

Administrators can install themes and plugins from their management screens.
Theme ZIPs require `theme.json` and `style.css`; plugin ZIPs require a
`package.json`. Uploaded plugin code is loaded after restarting the app.

## Run this project

```powershell
npm install
npm run dev
```

Open `http://localhost:3000` for the public site. The CMS is namespaced under
`/nodecms`: use `/nodecms/login` to sign in and `/nodecms` for the dashboard.

The first run creates `storage/cms.json`. Default development credentials are:

- Email: `admin@example.com`
- Password: `changeme123`

Set `CMS_ADMIN_EMAIL` and `CMS_ADMIN_PASSWORD` before the first run in production.
Run `npm run seed` after changing them to create or update the administrator.

The public site loads the built-in `default` theme through `ThemeManager`. Theme
selection is stored in CMS settings and safely falls back to the default theme.

## Built-in visual builder

Noderyx Visual Builder is an active core CMS plugin; no installation or license key is needed. Open a post or page and choose **Open full builder**, or use **Build** in the content list. The Plugins screen also links directly to a new builder page.

- Add and reorder 12 widgets: hero, heading, text, image, button, two-column text, quote, divider, spacer, card, call to action, and list.
- Select a widget on the canvas or in Navigator to edit its content, colors, spacing, font size, alignment, corners, and responsive visibility. Image widgets can use the CMS media library.
- Use desktop, tablet, and mobile previews. Hidden widgets remain selectable in edit mode; **Preview** applies visibility rules.
- Insert starter layouts, undo/redo changes, duplicate widgets, and import/export layout JSON. **Save layout as template** stores one reusable layout in the current browser; JSON export lets you transfer it elsewhere.
- Choose Standard, Full width, or Blank canvas in the editor's publishing panel. Blank canvas removes the site's header/footer and article heading.
- **Back to editor** keeps changes in the form. **Save content** persists the current post/page with its selected draft/published status. Existing revisions include widget styles and the page layout.

Text from an existing article is imported as a text widget when opening an empty builder. Visual widgets take precedence over fallback text on the published site. The canvas previews content; the site's active theme can affect typography and surrounding layout. This is a native Noderyx builder, not an Elementor installation; it does not yet provide nested widget containers, popups, dynamic database fields, or a site-wide header/footer designer.
