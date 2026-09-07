import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import AdmZip from "adm-zip";
import { ArchiveInstaller } from "../app/Services/ArchiveInstaller.js";
import { ThemeManager } from "../app/Services/ThemeManager.js";

function dataUrl(files) {
  const zip = new AdmZip();
  for (const [name, contents] of Object.entries(files)) zip.addFile(name, Buffer.from(contents));
  return `data:application/zip;base64,${zip.toBuffer().toString("base64")}`;
}

test("theme and plugin ZIP archives install into project-owned directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "nodecms-archive-"));
  try {
    const installer = new ArchiveInstaller(root);
    const theme = await installer.installTheme(dataUrl({
      "theme.json": JSON.stringify({ id: "studio", name: "Studio", description: "Studio theme" }),
      "style.css": ":root{--accent:#000}"
    }));
    assert.equal(theme.id, "studio");
    assert.match(await readFile(join(root, "public/themes/studio/style.css"), "utf8"), /accent/);
    assert.equal(new ThemeManager(join(root, "storage/themes")).get("studio").name, "Studio");

    const plugin = await installer.installPlugin(dataUrl({
      "package.json": JSON.stringify({ name: "newsletter", description: "Newsletter plugin" }),
      "index.js": "export default {};"
    }));
    assert.equal(plugin.id, "newsletter");
    assert.match(await readFile(join(root, "packages/newsletter/package.json"), "utf8"), /newsletter/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
