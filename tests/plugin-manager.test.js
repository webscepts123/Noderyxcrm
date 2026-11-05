import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PluginManager } from "../app/Services/PluginManager.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "nodecms-plugins-"));
  const folder = join(root, "packages", "shop");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "package.json"), JSON.stringify({ name: "@acme/shop", displayName: "Shop", version: "2.3.0", description: "Storefront.", author: "Acme <dev@acme.test>", homepage: "javascript:alert(1)", noderyx: { category: "Store" } }));
  return { root, folder, manager: new PluginManager([], join(root, "packages"), join(root, "storage", "plugins.json")) };
}

test("lists core and local plugins with manifest metadata", async () => {
  const { root, manager } = await fixture();
  try {
    const plugins = await manager.all();
    assert.ok(plugins.some((plugin) => plugin.isCore && plugin.active));
    const shop = plugins.find((plugin) => plugin.id === "@acme/shop");
    assert.equal(shop.name, "Shop");
    assert.equal(shop.version, "2.3.0");
    assert.equal(shop.author, "Acme");
    assert.equal(shop.category, "Store");
    assert.equal(shop.homepage, "", "unsafe homepage URLs are dropped");
    assert.equal(shop.state, "active");
    assert.equal(shop.canDelete, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("deactivated plugins are skipped at boot and can then be deleted", async () => {
  const { root, folder, manager } = await fixture();
  try {
    assert.equal((await manager.enabledLocalPackages()).length, 1);
    await assert.rejects(manager.remove("@acme/shop"), /Deactivate/);
    await manager.setActive("@acme/shop", false);
    const shop = (await manager.all()).find((plugin) => plugin.id === "@acme/shop");
    assert.equal(shop.state, "inactive");
    assert.equal(shop.restartRequired, true);
    assert.equal((await new PluginManager([], join(root, "packages"), join(root, "storage", "plugins.json")).enabledLocalPackages()).length, 0);
    await assert.rejects(manager.setActive("content", false), /local plugins/);
    await manager.remove("@acme/shop");
    assert.equal(existsSync(folder), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
