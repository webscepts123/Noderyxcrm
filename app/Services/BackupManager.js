import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

// Backup file names are always machine-generated from a timestamp. Anything
// that does not match is rejected before it reaches the filesystem, so a
// crafted ":name" route parameter cannot escape the backups directory.
const SAFE_NAME = /^[\w-]+\.json$/;

function humanSize(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes) || 0;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${unit && value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/**
 * Off-site destinations a backup can be copied to after it is written locally.
 * Each destination reads its own slice of the resolved integration config and
 * throws on any non-success so the caller can report it.
 */
export const DESTINATIONS = [
  {
    id: "local",
    label: "Local storage",
    hint: "storage/backups on this server. Always kept.",
    always: true,
    configured: () => true
  },
  {
    id: "googleDrive",
    label: "Google Drive",
    hint: "OAuth access token with the drive.file scope. Optional folder ID.",
    configured: (config) => Boolean(config.googleDrive?.accessToken),
    async push({ name, contents, config }) {
      const boundary = `noderyx-${Math.random().toString(16).slice(2)}`;
      const metadata = { name, mimeType: "application/json" };
      if (config.folderId) metadata.parents = [config.folderId];
      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        "Content-Type: application/json",
        "",
        contents,
        `--${boundary}--`,
        ""
      ].join("\r\n");
      const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.googleDrive.accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`
          },
          body
        }
      );
      if (!response.ok) throw new Error(`Google Drive responded ${response.status}`);
      const json = await response.json().catch(() => ({}));
      return { id: json.id ?? name, location: json.id ? `https://drive.google.com/file/d/${json.id}/view` : null };
    }
  },
  {
    id: "mediacloudhub",
    label: "MediaCloudHub",
    hint: "API key from mediacloudhub.com. Optional bucket.",
    configured: (config) => Boolean(config.mediacloudhub?.apiKey),
    async push({ name, contents, config }) {
      const base = (config.mediacloudhub.apiUrl || "https://mediacloudhub.com/api/v1").replace(/\/+$/, "");
      const response = await fetch(`${base}/backups`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.mediacloudhub.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          bucket: config.mediacloudhub.bucket || undefined,
          contentType: "application/json",
          data: Buffer.from(contents).toString("base64")
        })
      });
      if (!response.ok) throw new Error(`MediaCloudHub responded ${response.status}`);
      const json = await response.json().catch(() => ({}));
      return { id: json.id ?? json.key ?? name, location: json.url ?? null };
    }
  },
  {
    id: "webhook",
    label: "Custom webhook",
    hint: "Any HTTPS endpoint. Each backup is POSTed as JSON.",
    configured: (config) => Boolean(config.webhook?.url),
    async push({ name, contents, config }) {
      const response = await fetch(config.webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.webhook.secret ? { "X-Webhook-Secret": config.webhook.secret } : {})
        },
        body: JSON.stringify({ name, createdAt: new Date().toISOString(), snapshot: JSON.parse(contents) })
      });
      if (!response.ok) throw new Error(`Webhook responded ${response.status}`);
      return { id: name, location: config.webhook.url };
    }
  }
];

export class BackupManager {
  constructor(directory) {
    this.directory = directory;
  }

  async ensure() { await mkdir(this.directory, { recursive: true }); return this.directory; }

  path(name) {
    const raw = String(name ?? "");
    if (raw !== basename(raw) || !SAFE_NAME.test(raw)) throw new Error("Invalid backup name");
    return join(this.directory, raw);
  }

  filename(prefix = "cms") {
    return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  }

  async list() {
    await this.ensure();
    const names = (await readdir(this.directory)).filter((name) => name.endsWith(".json")).sort().reverse();
    return Promise.all(names.map(async (name) => {
      const info = await stat(join(this.directory, name));
      return {
        name,
        size: info.size,
        sizeLabel: humanSize(info.size),
        createdAt: info.mtime.toISOString(),
        createdLabel: new Date(info.mtime).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })
      };
    }));
  }

  async write(name, contents) { await this.ensure(); await writeFile(this.path(name), contents); }
  async read(name) { return readFile(this.path(name), "utf8"); }
  async remove(name) { await rm(this.path(name), { force: true }); }

  destination(id) { return DESTINATIONS.find((item) => item.id === id) ?? null; }
  describe(config) {
    return DESTINATIONS.map((item) => ({
      id: item.id,
      label: item.label,
      hint: item.hint,
      always: Boolean(item.always),
      configured: Boolean(item.configured(config))
    }));
  }

  async push(id, { name, contents, config }) {
    const destination = this.destination(id);
    if (!destination || destination.always) return null;
    if (!destination.configured(config)) return { ok: false, label: destination.label, error: `${destination.label} is not configured` };
    try {
      const info = await destination.push({ name, contents, config });
      return { ok: true, label: destination.label, ...info };
    } catch (error) {
      return { ok: false, label: destination.label, error: error.message };
    }
  }
}
