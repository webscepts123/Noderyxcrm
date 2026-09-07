import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadEnvironment } from "noderyx-framework";
import { CmsStore } from "../../app/Services/CmsStore.js";

export async function run() {
  loadEnvironment();
  const store = await new CmsStore().initialize();
  const admin = await store.seedAdmin({
    name: process.env.CMS_ADMIN_NAME ?? "Administrator",
    email: process.env.CMS_ADMIN_EMAIL ?? "admin@example.com",
    password: process.env.CMS_ADMIN_PASSWORD ?? "changeme123"
  });
  console.log(`Seeded CMS administrator: ${admin.email}`);
  return admin;
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entry === import.meta.url) await run();
