import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

const CORE_VERSION = await readFile(new URL("../../package.json", import.meta.url), "utf8")
  .then((text) => JSON.parse(text).version)
  .catch(() => "1.0.0");

const CORE_PLUGINS = [
  { id: "visual-builder", name: "Noderyx Visual Builder", category: "Editor", description: "Built-in full-screen visual editor for posts and pages. Widgets, styling, templates, responsive previews, and revision support.", actionUrl: "/nodecms/posts/new?type=page&builder=1", actionLabel: "Open builder" },
  { id: "content", name: "Content Publishing", category: "Content", description: "Posts, pages, categories, revisions, and publishing workflows.", actionUrl: "/nodecms/posts", actionLabel: "Manage content" },
  { id: "media", name: "Media Library", category: "Content", description: "Image uploads, remote media, metadata, and featured images.", actionUrl: "/nodecms/media", actionLabel: "Open library" },
  { id: "comments", name: "Comments", category: "Community", description: "Public discussion, moderation, approval, and spam controls.", actionUrl: "/nodecms/comments", actionLabel: "Moderate" },
  { id: "seo", name: "SEO Toolkit", category: "Marketing", description: "Metadata, search indexing, and social sharing controls.", actionUrl: "/nodecms/settings", actionLabel: "Settings" },
  { id: "backups", name: "CMS Backups", category: "System", description: "Timestamped JSON snapshots of site content and configuration.", actionUrl: "/nodecms/backups", actionLabel: "Backups" }
];

const ICON_COLORS = ["#237a52", "#2f5d9e", "#8a4fb8", "#b4632a", "#1f7f86", "#a23d5c", "#56702a", "#4a4f9e"];

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function authorName(author) {
  if (typeof author === "string") return author.replace(/\s*[<(].*$/, "").trim();
  return text(author?.name);
}

function humanize(name) {
  const bare = String(name).replace(/^@[^/]+\//, "").replace(/^noderyx-/, "");
  return bare.split(/[-_\s]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") || String(name);
}

function initials(name) {
  const words = String(name).replace(/^noderyx\s+/i, "").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "P") + (words[1]?.[0] ?? "")).toUpperCase();
}

function iconColor(id) {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ICON_COLORS[hash % ICON_COLORS.length];
}

function safeUrl(value) {
  const url = text(value);
  return /^(https?:\/\/|\/)/i.test(url) && !url.startsWith("//") ? url : "";
}

function decorate(plugin) {
  const active = plugin.active;
  return {
    ...plugin,
    initials: initials(plugin.name),
    color: iconColor(plugin.id),
    status: active ? "Active" : "Inactive",
    state: active ? "active" : "inactive",
    isCore: plugin.source === "Core",
    isLocal: plugin.source === "Local",
    canToggle: plugin.source === "Local",
    canDelete: plugin.source === "Local" && !active,
    search: [plugin.name, plugin.id, plugin.description, plugin.author, plugin.category, plugin.source].join(" ").toLowerCase()
  };
}

export class PluginManager {
  constructor(configured = [], directory = join(process.cwd(), "packages"), stateFile = join(process.cwd(), "storage", "plugins.json")) {
    this.configured = configured;
    this.directory = resolve(directory);
    this.stateFile = stateFile;
    /** Ids of local plugins that were active when the app booted. Set by enabledLocalPackages(). */
    this.booted = null;
  }

  async state() {
    const raw = await readFile(this.stateFile, "utf8").then(JSON.parse).catch(() => ({}));
    return { disabled: Array.isArray(raw.disabled) ? raw.disabled.map(String) : [] };
  }

  async saveState(state) {
    await mkdir(join(this.stateFile, ".."), { recursive: true });
    await writeFile(this.stateFile, `${JSON.stringify({ disabled: [...new Set(state.disabled)].sort() }, null, 2)}\n`);
  }

  /** Local plugins discovered under packages/, with their manifest and folder. */
  async local() {
    const entries = await readdir(this.directory, { withFileTypes: true }).catch(() => []);
    const found = [];
    for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const folder = join(this.directory, entry.name);
      const manifestFile = join(folder, "package.json");
      if (!existsSync(manifestFile)) continue;
      const manifest = await readFile(manifestFile, "utf8").then((value) => JSON.parse(value.replace(/^﻿/, ""))).catch(() => null);
      found.push({ folder, entry: entry.name, manifest, id: text(manifest?.name, entry.name) });
    }
    return found;
  }

  /**
   * Package declarations for every active local plugin, for loadPackages(..., { discover: false }).
   * Remembers what was loaded so the admin can flag plugins that need a restart.
   */
  async enabledLocalPackages() {
    const { disabled } = await this.state();
    const enabled = (await this.local()).filter((plugin) => plugin.manifest && !disabled.includes(plugin.id));
    this.booted = new Set(enabled.map((plugin) => plugin.id));
    return enabled.map((plugin) => ({ package: join(plugin.folder, plugin.manifest.main ?? "src/index.js"), options: {} }));
  }

  async all() {
    const { disabled } = await this.state();
    const plugins = CORE_PLUGINS.map((plugin) => ({ ...plugin, version: CORE_VERSION, author: "Noderyx", source: "Core", active: true }));

    for (const entry of this.configured) {
      const name = typeof entry === "string" ? entry : text(entry?.name ?? entry?.package, "package");
      plugins.push({ id: name, name: humanize(name), category: "Package", description: "Installed from npm and configured in noderyx.config.js.", version: "", author: "", source: "Package", active: entry?.enabled !== false });
    }

    for (const local of await this.local()) {
      if (plugins.some((plugin) => plugin.id === local.id)) continue;
      const manifest = local.manifest ?? {};
      const meta = typeof manifest.noderyx === "object" && manifest.noderyx ? manifest.noderyx : {};
      const active = !disabled.includes(local.id);
      plugins.push({
        id: local.id,
        name: text(manifest.displayName, humanize(local.id)),
        category: text(meta.category, "Extension"),
        description: text(manifest.description, "No description provided by this plugin."),
        version: text(manifest.version),
        author: authorName(manifest.author),
        homepage: safeUrl(manifest.homepage),
        actionUrl: active ? safeUrl(meta.settingsUrl ?? meta.adminUrl) : "",
        actionLabel: "Settings",
        source: "Local",
        active,
        broken: !local.manifest,
        restartRequired: this.booted ? this.booted.has(local.id) !== active : false
      });
    }

    return plugins.map(decorate);
  }

  async setActive(id, active) {
    const plugin = (await this.local()).find((item) => item.id === id);
    if (!plugin) throw new Error("Only installed local plugins can be activated or deactivated.");
    const state = await this.state();
    state.disabled = state.disabled.filter((item) => item !== id);
    if (!active) state.disabled.push(id);
    await this.saveState(state);
    return plugin.id;
  }

  async remove(id) {
    const plugin = (await this.local()).find((item) => item.id === id);
    if (!plugin) throw new Error("Plugin not found.");
    if (!(await this.state()).disabled.includes(id)) throw new Error("Deactivate the plugin before deleting it.");
    if (!plugin.folder.startsWith(this.directory + sep)) throw new Error("Refusing to delete outside the plugins directory.");
    await rm(plugin.folder, { recursive: true, force: true });
    const state = await this.state();
    state.disabled = state.disabled.filter((item) => item !== id);
    await this.saveState(state);
  }
}
