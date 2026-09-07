import AdmZip from "adm-zip";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join, posix } from "node:path";

const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 150;
const ALLOWED_PLUGIN_EXTENSIONS = new Set([".js", ".json", ".md", ".txt", ".css", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".noderframe"]);

function slug(value) {
  const result = String(value ?? "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  if (!result) throw new Error("Package manifest requires a valid id or name");
  return result;
}

function archiveBuffer(dataUrl) {
  const match = String(dataUrl ?? "").match(/^data:(?:application\/(?:zip|x-zip-compressed|octet-stream)|multipart\/x-zip);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Upload a valid ZIP archive");
  const buffer = Buffer.from(match[1], "base64");
  if (!buffer.length || buffer.length > MAX_ARCHIVE_BYTES) throw new Error("ZIP archive must be smaller than 8 MB");
  return buffer;
}

function safeEntries(buffer) {
  const entries = new AdmZip(buffer).getEntries().filter((entry) => !entry.isDirectory);
  if (!entries.length || entries.length > MAX_FILES) throw new Error("ZIP archive has an invalid number of files");
  const roots = new Set(entries.map((entry) => entry.entryName.replace(/\\/g, "/").split("/")[0]));
  const stripRoot = roots.size === 1 && entries.every((entry) => entry.entryName.replace(/\\/g, "/").includes("/"));
  let total = 0;
  return entries.map((entry) => {
    let name = entry.entryName.replace(/\\/g, "/");
    if (stripRoot) name = name.split("/").slice(1).join("/");
    const normalized = posix.normalize(name);
    if (!normalized || normalized.startsWith("../") || normalized.startsWith("/") || normalized.includes("\0")) throw new Error("ZIP contains an unsafe file path");
    total += Number(entry.header?.size ?? 0);
    if (total > MAX_ARCHIVE_BYTES) throw new Error("Uncompressed ZIP content is too large");
    return { name: normalized, data: entry.getData() };
  });
}

function manifest(entries, filename) {
  const entry = entries.find((item) => item.name === filename);
  if (!entry) throw new Error(`ZIP must contain ${filename}`);
  try { return JSON.parse(entry.data.toString("utf8")); } catch { throw new Error(`${filename} is not valid JSON`); }
}

async function writeEntries(entries, directory, allowed) {
  for (const entry of entries) {
    if (allowed && !allowed.has(extname(entry.name).toLowerCase())) throw new Error(`File type is not allowed: ${entry.name}`);
    const target = join(directory, ...entry.name.split("/"));
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, entry.data);
  }
}

export class ArchiveInstaller {
  constructor(root = process.cwd()) { this.root = root; }

  async installTheme(dataUrl) {
    const entries = safeEntries(archiveBuffer(dataUrl));
    const metadata = manifest(entries, "theme.json");
    const id = slug(metadata.id ?? metadata.name);
    if (!entries.some((entry) => entry.name === "style.css")) throw new Error("Theme ZIP must contain style.css");
    const target = join(this.root, "public", "themes", id);
    if (existsSync(target)) throw new Error(`Theme already exists: ${id}`);
    await writeEntries(entries.filter((entry) => ["theme.json", "style.css", "preview.png", "preview.jpg", "preview.webp"].includes(entry.name)), target);
    const theme = { id, name: String(metadata.name ?? id), description: String(metadata.description ?? "Uploaded CMS theme."), views: { home: "site/home", post: "site/post", page: "site/post" }, stylesheet: `/public/themes/${id}/style.css`, uploaded: true };
    const registry = join(this.root, "storage", "themes");
    await mkdir(registry, { recursive: true });
    await writeFile(join(registry, `${id}.json`), JSON.stringify(theme, null, 2));
    return theme;
  }

  async installPlugin(dataUrl) {
    const entries = safeEntries(archiveBuffer(dataUrl));
    const metadata = manifest(entries, "package.json");
    const id = slug(metadata.name);
    const target = join(this.root, "packages", id);
    if (existsSync(target)) throw new Error(`Plugin already exists: ${id}`);
    await writeEntries(entries, target, ALLOWED_PLUGIN_EXTENSIONS);
    return { id, name: metadata.displayName ?? metadata.name, description: metadata.description ?? "Uploaded CMS plugin." };
  }
}
