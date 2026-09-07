#!/usr/bin/env node

import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const positional = args.filter((entry) => !entry.startsWith("-"));
// Support both `nodecms create <dir>` and `npm create noderyxcrm <dir>` (no subcommand).
const requestedDirectory = positional[0] === "create" ? positional[1] : positional[0];
const skipInstall = args.includes("--no-install");
const wantsHelp = args.includes("--help") || args.includes("-h");

function usage() {
  console.log(`Create a Noderyx CMS project

Usage:
  npm create noderyxcrm <directory> [--no-install]
  nodecms create <directory> [--no-install]
  npm run cms:new -- <directory> [--no-install]

Example:
  npm create noderyxcrm company-website`);
}

function projectName(directory) {
  return directory
    .split(/[\\/]/)
    .filter(Boolean)
    .at(-1)
    ?.toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "noderyx-cms";
}

async function createProject(directory) {
  const target = resolve(process.cwd(), directory);
  const insideTemplate = target === packageRoot || target.startsWith(`${packageRoot}${sep}`);
  if (insideTemplate) throw new Error("Create the CMS outside the starter directory, for example: ../my-cms");
  if (existsSync(target)) throw new Error(`Target already exists: ${target}`);

  const excluded = new Set([
    ".git",
    ".DS_Store",
    ".env",
    "node_modules",
    "package-lock.json",
    "public/generated",
    "public/uploads",
    "storage/backups",
    "storage/cms.json"
  ]);

  await mkdir(target, { recursive: true });
  await cp(packageRoot, target, {
    recursive: true,
    filter(source) {
      const path = relative(packageRoot, source).split(sep).join("/");
      return ![...excluded].some((entry) => path === entry || path.startsWith(`${entry}/`));
    }
  });

  const manifestPath = resolve(target, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.name = projectName(directory);
  manifest.version = "0.1.0";
  manifest.private = true;
  // Publishing metadata belongs to the generator, not the generated project.
  for (const field of ["bin", "files", "publishConfig", "repository", "keywords", "homepage", "bugs"]) {
    delete manifest[field];
  }
  delete manifest.scripts?.["cms:new"];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const environmentExample = await readFile(resolve(target, ".env.example"), "utf8");
  const applicationKey = randomBytes(32).toString("base64url");
  const environment = environmentExample.replace(/^APP_KEY=.*$/m, `APP_KEY=${applicationKey}`);
  await writeFile(resolve(target, ".env"), environment);
  await mkdir(resolve(target, "storage"), { recursive: true });

  console.log(`Created Noderyx CMS in ${target}`);

  if (!skipInstall) {
    console.log("Installing dependencies...");
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(npm, ["install"], { cwd: target, stdio: "inherit" });
    if (result.status !== 0) throw new Error("Dependency installation failed; run npm install in the new project.");
  }

  console.log(`\nNext steps:\n  cd ${directory}\n  npm run seed\n  npm run dev\n\nCMS login: /nodecms/login`);
}

if (!wantsHelp && requestedDirectory) {
  createProject(requestedDirectory).catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
} else {
  usage();
  process.exitCode = wantsHelp ? 0 : 1;
}
