import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CmsStore, DEFAULT_LOGIN_PATH, validateLoginSlug } from "../app/Services/CmsStore.js";
import { buildAdminThemeCss } from "../app/Services/AdminTheme.js";
import { requireCmsAuthentication } from "../routes/cms.js";

function run(url, store, user = null) {
  const result = { status: null, location: null, nextCalled: false };
  const context = {
    request: { url },
    response: { baseHeaders: {} },
    session: user ? { user } : {},
    service: () => store,
    abort(status) { result.status = status; return result; },
    text(_body, status) { result.status = status; result.location = this.response.baseHeaders.location; return result; }
  };
  requireCmsAuthentication(context, () => { result.nextCalled = true; return result; });
  return result;
}

async function withStore(callback) {
  const directory = await mkdtemp(join(tmpdir(), "nodecms-admin-settings-"));
  try { await callback(await new CmsStore(join(directory, "cms.json")).initialize()); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test("login slugs are validated and cannot shadow site routes", () => {
  assert.equal(validateLoginSlug(""), "");
  assert.equal(validateLoginSlug(" /Team-Door/ "), "team-door");
  for (const bad of ["ab", "has space", "../x", "nodecms", "post", "health", "-lead", "a".repeat(65)]) {
    assert.throws(() => validateLoginSlug(bad), undefined, bad);
  }
});

test("a custom login URL hides the default login and the dashboard redirect", async () => {
  await withStore(async (store) => {
    assert.equal(store.loginPath(), DEFAULT_LOGIN_PATH);
    assert.equal(run("/nodecms", store).location, DEFAULT_LOGIN_PATH);

    await store.saveLoginSlug("team-door");
    assert.equal(store.loginPath(), "/team-door");
    assert.equal(run("/nodecms/login", store).status, 404);
    assert.equal(run("/nodecms/posts", store).status, 404);
    assert.equal(run("/team-door", store).nextCalled, true);
    assert.equal(run("/nodecms", store, { id: 1, role: "Administrator" }).nextCalled, true);

    // The slug survives a restart.
    const reopened = await new CmsStore(store.file).initialize();
    assert.equal(reopened.loginPath(), "/team-door");

    await store.saveLoginSlug("");
    assert.equal(store.loginPath(), DEFAULT_LOGIN_PATH);
    assert.equal(run("/nodecms/login", store).nextCalled, true);
  });
});

test("admin appearance saves valid colours, rejects bad ones, and resets", async () => {
  await withStore(async (store) => {
    await store.saveAdminAppearance({ brandName: "Acme Admin", sidebarBg: "#112233", loginBg: "red;}body{x", widgetAccent: "#ABCDEF", logoUrl: "/public/uploads/logo.png", showBrandName: "on" });
    let appearance = await store.adminAppearance();
    assert.equal(appearance.brandName, "Acme Admin");
    assert.equal(appearance.sidebarBg, "#112233");
    assert.equal(appearance.loginBg, "#10291d");
    assert.equal(appearance.widgetAccent, "#abcdef");
    assert.equal(appearance.logoUrl, "/public/uploads/logo.png");

    await assert.rejects(store.saveAdminAppearance({ logoUrl: "javascript:alert(1)" }));
    await assert.rejects(store.saveAdminAppearance({ logoUrl: "//evil.example/logo.png" }));
    await assert.rejects(store.saveAdminAppearance({ logoUrl: "https://cdn.example/logo.png" }));

    await store.saveAdminAppearance({ ...appearance, removeLogo: "on" });
    assert.equal((await store.adminAppearance()).logoUrl, "");

    await store.saveAdminAppearance({ reset: "1" });
    appearance = await store.adminAppearance();
    assert.equal(appearance.sidebarBg, "#12271d");
    assert.equal(appearance.brandName, "Noderyx CMS");
  });
});

test("the admin theme stylesheet only ever emits hex colours", () => {
  const css = buildAdminThemeCss({ sidebarBg: "#010203", loginBg: "red}body{background:url(x)", widgetBg: "#fefefe" });
  assert.match(css, /\.sidebar\{background:#010203/);
  assert.match(css, /\.dashboard-page \.stat\{background:#fefefe/);
  assert.doesNotMatch(css, /url\(x\)/);
  assert.match(css, /linear-gradient\(135deg,#10291d,/);
});
