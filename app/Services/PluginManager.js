import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const CORE_PLUGINS = [
  { id: "content", name: "Content Publishing", description: "Posts, pages, categories, revisions, and publishing workflows." },
  { id: "media", name: "Media Library", description: "Image uploads, remote media, metadata, and featured images." },
  { id: "comments", name: "Comments", description: "Public discussion, moderation, approval, and spam controls." },
  { id: "seo", name: "SEO Toolkit", description: "Metadata, search indexing, and social sharing controls." },
  { id: "backups", name: "CMS Backups", description: "Timestamped JSON snapshots of site content and configuration." }
];

export class PluginManager {
  constructor(configured = [], directory = join(process.cwd(), "packages")) {
    this.configured = configured;
    this.directory = directory;
  }

  async all() {
    const plugins = CORE_PLUGINS.map((plugin) => ({ ...plugin, source: "Core", status: "Active" }));
    for (const name of this.configured) plugins.push({ id: name, name, description: "Configured Noderyx package.", source: "Package", status: "Active" });

    const entries = await readdir(this.directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.filter((item) => item.isDirectory())) {
      const manifest = await readFile(join(this.directory, entry.name, "package.json"), "utf8").then(JSON.parse).catch(() => ({}));
      if (plugins.some((plugin) => plugin.id === entry.name || plugin.id === manifest.name)) continue;
      plugins.push({ id: manifest.name ?? entry.name, name: manifest.displayName ?? manifest.name ?? entry.name, description: manifest.description ?? "Local CMS plugin.", source: "Local", status: "Installed" });
    }
    return plugins;
  }
}
