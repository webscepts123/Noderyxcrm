import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CmsStore } from "../app/Services/CmsStore.js";
import { requireCmsAuthentication } from "../routes/cms.js";

function middlewareContext(url, user = null) {
  const result = { status: null, location: null, nextCalled: false };
  const context = {
    request: { url },
    response: { baseHeaders: {} },
    session: user ? { user } : {},
    text(_body, status) {
      result.status = status;
      result.location = this.response.baseHeaders.location;
      return result;
    }
  };
  const next = () => { result.nextCalled = true; return result; };
  return { context, next, result };
}

test("CMS authentication middleware protects every dashboard route", () => {
  for (const path of ["/nodecms", "/nodecms/posts", "/nodecms/settings", "/nodecms/posts/1/delete"]) {
    const { context, next, result } = middlewareContext(path);
    requireCmsAuthentication(context, next);
    assert.equal(result.status, 303);
    assert.equal(result.location, "/nodecms/login");
    assert.equal(result.nextCalled, false);
  }

  for (const path of ["/", "/nodecms/login"]) {
    const { context, next, result } = middlewareContext(path);
    requireCmsAuthentication(context, next);
    assert.equal(result.nextCalled, true);
  }

  const authenticated = middlewareContext("/nodecms", { id: 1, role: "Administrator" });
  requireCmsAuthentication(authenticated.context, authenticated.next);
  assert.equal(authenticated.result.nextCalled, true);
});

test("core CMS workflows preserve and extend the file-backed store", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodecms-test-"));
  try {
    const store = await new CmsStore(join(directory, "cms.json")).initialize();
    let data = await store.read();
    assert.equal(data.users.length, 1);
    assert.ok(Array.isArray(data.comments));
    assert.ok(Array.isArray(data.menus));
    assert.ok(Array.isArray(data.revisions));

    await store.addUser({ name: "Editor", email: "editor@example.com", password: "password123", role: "Editor" });
    assert.equal((await store.authenticate("editor@example.com", "password123")).role, "Editor");

    await store.saveMenu({ label: ["Home", "Journal"], url: ["/", "/category/general"] });
    await store.addComment(1, { name: "Reader", email: "reader@example.com", content: "Useful article" });
    await store.moderateComment(1, "approved");
    await store.addMedia({ title: "Remote image", url: "https://example.com/image.jpg", alt: "Example" });
    await store.activateTheme("minimal");

    data = await store.read();
    const post = data.posts[0];
    await store.savePost({ ...post, title: "Updated article", content: "Updated content" }, 1);
    data = await store.read();
    assert.equal(data.menus[0].items.length, 2);
    assert.equal(data.comments[0].status, "approved");
    assert.equal(data.media.length, 1);
    assert.equal(data.settings.theme, "minimal");
    assert.equal(data.revisions.length, 1);

    const page = await store.savePost({ type: "page", title: "Builder page", content: "", blocks: JSON.stringify([{ id: "hero", type: "heading", text: "Build visually" }, { id: "copy", type: "text", text: "Drag and drop content" }]), status: "published" }, 1);
    assert.equal(page.blocks.length, 2);

    await store.restoreRevision(data.revisions[0].id);
    assert.equal((await store.read()).posts[0].title, post.title);
    await store.createBackup();
    assert.equal((await store.backups()).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("backups can be listed, downloaded, restored, and deleted safely", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodecms-backup-"));
  try {
    const store = await new CmsStore(join(directory, "cms.json")).initialize();
    const originalTitle = (await store.read()).posts[0].title;

    const { name, remote } = await store.createBackup();
    assert.match(name, /^cms-.*\.json$/);
    assert.equal(remote, null, "local destination does no remote push");

    const [listed] = await store.backups();
    assert.equal(listed.name, name);
    assert.ok(listed.sizeLabel && listed.createdLabel);

    // Download returns the raw snapshot.
    assert.equal(JSON.parse(await store.readBackup(name)).posts[0].title, originalTitle);

    // A crafted name cannot escape the backups directory.
    await assert.rejects(() => store.readBackup("../cms.json"), /Invalid backup name/);
    await assert.rejects(() => store.restoreBackup("../../etc/passwd"), /Invalid backup name/);
    await assert.rejects(() => store.restoreBackup("does-not-exist.json"));

    // Restore rewinds a later edit and keeps a pre-restore safety snapshot.
    await store.savePost({ ...(await store.read()).posts[0], title: "Temporary edit" }, 1);
    assert.equal((await store.read()).posts[0].title, "Temporary edit");
    await store.restoreBackup(name);
    assert.equal((await store.read()).posts[0].title, originalTitle);
    assert.ok((await store.backups()).some((item) => item.name.includes("pre-restore")));

    await store.deleteBackup(name);
    assert.equal((await store.backups()).some((item) => item.name === name), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("backup destinations and integration settings are configuration-driven", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodecms-integrations-"));
  try {
    const store = await new CmsStore(join(directory, "cms.json")).initialize();

    let destinations = await store.backupDestinations();
    assert.ok(destinations.find((item) => item.id === "local").configured);
    assert.equal(destinations.find((item) => item.id === "googleDrive").configured, false);
    assert.equal(destinations.find((item) => item.id === "mediacloudhub").configured, false);

    // An unconfigured destination reports (no network call) instead of throwing.
    const unconfigured = await store.createBackup("googleDrive");
    assert.match(unconfigured.name, /^cms-.*\.json$/);
    assert.equal(unconfigured.remote.ok, false);
    assert.match(unconfigured.remote.error, /not configured/);

    await store.saveIntegrations({
      googleDrive__accessToken: "ya29.test-token",
      googleDrive__folderId: "folder-123",
      mediacloudhub__apiKey: "mch_live_key",
      webhook__url: "https://example.com/hook"
    });

    const integrations = await store.integrations();
    assert.equal(integrations.googleDrive.accessToken, "ya29.test-token");
    assert.equal(integrations.googleDrive.folderId, "folder-123");
    assert.equal(integrations.mediacloudhub.apiKey, "mch_live_key");
    assert.equal(integrations.webhook.url, "https://example.com/hook");

    // A blank secret on a later save keeps the stored value.
    await store.saveIntegrations({ webhook__url: "https://example.com/hook2" });
    assert.equal((await store.integrations()).mediacloudhub.apiKey, "mch_live_key");

    destinations = await store.backupDestinations();
    assert.ok(destinations.find((item) => item.id === "googleDrive").configured);
    assert.ok(destinations.find((item) => item.id === "mediacloudhub").configured);
    assert.ok(destinations.find((item) => item.id === "webhook").configured);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("workspace tasks and notes persist edits and validate submitted values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodecms-workspace-"));
  try {
    const file = join(directory, "cms.json");
    const store = await new CmsStore(file).initialize();
    const task = await store.saveWorkspaceItem("tasks", { title: "Review launch", content: "Check copy", status: "todo", priority: "high", dueDate: "2026-10-20" }, 1);
    const note = await store.saveWorkspaceItem("notes", { title: "Style guide", content: "Use sentence case." }, 1);
    const reopened = await new CmsStore(file).initialize();
    assert.equal((await reopened.read()).tasks[0].dueDate, "2026-10-20");
    await reopened.saveWorkspaceItem("tasks", { ...task, status: "done" }, 2);
    const data = await reopened.read();
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].status, "done");
    assert.equal(data.tasks[0].authorId, 1);
    assert.equal(data.notes[0].content, "Use sentence case.");
    await assert.rejects(reopened.saveWorkspaceItem("users", { title: "Invalid" }, 1), /Unknown/);
    await assert.rejects(reopened.saveWorkspaceItem("notes", { title: " " }, 1), /title/);
    await assert.rejects(reopened.saveWorkspaceItem("tasks", { ...task, status: "invalid" }, 1), /status/);
    await assert.rejects(reopened.saveWorkspaceItem("tasks", { ...task, dueDate: "2026-02-30" }, 1), /date/);
    await assert.rejects(reopened.saveWorkspaceItem("notes", { id: 999, title: "Missing" }, 1), /no longer/);
    await reopened.deleteWorkspaceItem("tasks", task.id);
    assert.equal((await reopened.read()).tasks.length, 0);
    assert.equal((await reopened.read()).notes.length, 1);
    await reopened.deleteWorkspaceItem("notes", note.id);
    assert.equal((await reopened.read()).notes.length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
