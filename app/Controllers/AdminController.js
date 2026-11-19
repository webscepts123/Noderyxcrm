import { Controller } from "noderyx-framework";
import { buildAdminThemeCss } from "../Services/AdminTheme.js";
import { DEFAULT_LOGIN_PATH } from "../Services/CmsStore.js";

export class AdminController extends Controller {
  store() { return this.service("cms"); }
  get user() { return this.context.session.user; }
  get loginPath() { return this.store().loginPath(); }
  guard() { if (!this.user) { if (this.loginPath === DEFAULT_LOGIN_PATH) this.redirect(this.loginPath); else this.context.abort(404); return false; } return true; }
  adminGuard() { if (!this.guard()) return false; if (this.user.role !== "Administrator") { this.context.abort(403, "Administrator access is required"); return false; } return true; }
  async permissionGuard(permission) {
    if (!this.guard()) return false;
    if (!(await this.store().can(this.user.role, permission))) { this.context.abort(403, "You don't have permission to do that."); return false; }
    return true;
  }
  redirect(location) {
    this.context.response.baseHeaders.location = location;
    return this.context.text("", 303);
  }
  /** Every admin view gets the branding (logo, name, stylesheet version) and the current login path. */
  async render(view, data = {}, status = 200) {
    const appearance = await this.store().adminAppearance();
    const admin = {
      brandName: appearance.brandName,
      logoUrl: appearance.logoUrl,
      showBrandName: appearance.showBrandName,
      version: encodeURIComponent(appearance.updatedAt ?? "1")
    };
    return super.render(view, { admin, loginPath: this.loginPath, ...data }, status);
  }
  async login() { if (this.user) return this.redirect("/nodecms"); return this.render("admin/login", { error: this.query.error === "1" }); }
  async authenticate() { const user = await this.store().authenticate(this.body.email, this.body.password); if (!user) return this.redirect(`${this.loginPath}?error=1`); this.context.session.user = user; return this.redirect("/nodecms"); }
  async logout() { delete this.context.session.user; return this.redirect(this.loginPath); }
  isCustomLoginRequest() { return this.loginPath !== DEFAULT_LOGIN_PATH && `/${String(this.params.loginSlug ?? "").toLowerCase()}` === this.loginPath; }
  async customLogin() { if (!this.isCustomLoginRequest()) return this.abort(404); return this.login(); }
  async customAuthenticate() { if (!this.isCustomLoginRequest()) return this.abort(404); return this.authenticate(); }
  // Public (the login screen needs it); the URL carries a version so browsers refetch after a change.
  async adminThemeCss() { return this.text(buildAdminThemeCss(await this.store().adminAppearance()), 200, "text/css; charset=utf-8"); }
  async adminSettings() {
    if (!this.adminGuard()) return;
    const store = this.store();
    const appearance = await store.adminAppearance();
    const { loginSlug } = await store.adminSecurity();
    const origin = `${this.request.headers["x-forwarded-proto"] === "https" ? "https" : "http"}://${this.request.headers.host ?? "localhost"}`;
    const notices = { appearance: "Admin appearance saved.", reset: "Admin appearance reset to the default colours.", login: "Login URL saved. Bookmark the new address — the old one now returns 404." };
    const field = (key, label) => ({ key, label, value: appearance[key] });
    const colorGroups = [
      { id: "menus", title: "Sidebar menu & toolbar", hint: "The left navigation menu and the top admin bar.", fields: [field("sidebarBg", "Menu background"), field("sidebarText", "Menu text"), field("sidebarActive", "Active item & icon"), field("toolbarBg", "Toolbar background"), field("toolbarText", "Toolbar text"), field("accentColor", "Buttons & links")] },
      { id: "login", title: "Login screen", hint: "The sign-in page background is a two-colour gradient.", fields: [field("loginBg", "Background (start)"), field("loginBgEnd", "Background (end)"), field("loginCardBg", "Card background"), field("loginText", "Card text")] },
      { id: "widgets", title: "Dashboard widgets", hint: "Stat cards, panels, and the welcome banner on the dashboard.", fields: [field("widgetBg", "Widget background"), field("widgetText", "Widget text"), field("widgetAccent", "Numbers & links"), field("welcomeBg", "Welcome banner background"), field("welcomeText", "Welcome banner text")] }
    ];
    const { data } = await store.dashboard();
    const mediaImages = data.media.filter((item) => /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(item.url)).map((item) => ({ url: item.url, title: item.title }));
    return this.render("admin/admin-settings", {
      user: this.user, appearance, loginSlug, origin, colorGroups, mediaImages, hasMedia: mediaImages.length > 0,
      loginUrl: `${origin}${this.loginPath}`,
      customLogin: Boolean(loginSlug),
      notice: notices[this.query.saved] ?? "",
      error: this.query.error ? String(this.query.error).slice(0, 200) : ""
    });
  }
  async saveAdminAppearance() {
    if (!this.adminGuard()) return;
    try { await this.store().saveAdminAppearance(this.body); }
    catch (error) { return this.redirect(`/nodecms/admin-settings?error=${encodeURIComponent(error.message)}`); }
    return this.redirect(`/nodecms/admin-settings?saved=${this.body.reset === "1" ? "reset" : "appearance"}`);
  }
  async saveLoginUrl() {
    if (!this.adminGuard()) return;
    try { await this.store().saveLoginSlug(this.body.reset === "1" ? "" : this.body.loginSlug); }
    catch (error) { return this.redirect(`/nodecms/admin-settings?error=${encodeURIComponent(error.message)}#login-url`); }
    return this.redirect("/nodecms/admin-settings?saved=login#login-url");
  }
  async dashboard() { if (!this.guard()) return; const { data, counts } = await this.store().dashboard(); return this.render("admin/dashboard", { user: this.user, counts, posts: data.posts.slice().reverse().slice(0, 6) }); }
  async posts() {
    if (!(await this.permissionGuard("content"))) return;
    const { data } = await this.store().dashboard();
    const type = this.query.type === "page" ? "page" : "post";
    const status = ["draft", "published"].includes(this.query.status) ? this.query.status : null;
    const label = type === "page" ? "Pages" : "Posts";
    const heading = status ? `${status === "draft" ? "Draft" : "Published"} ${label.toLowerCase()}` : label;
    const posts = data.posts.filter(post => post.type === type && (!status || post.status === status)).reverse();
    return this.render("admin/posts", { user: this.user, type, heading, posts });
  }

  async editor() { if (!(await this.permissionGuard("content"))) return; const { data } = await this.store().dashboard(); const post = data.posts.find((p) => p.id === Number(this.params.id)) ?? {}; const type = post.type ?? (this.query.type === "page" ? "page" : "post"); return this.render("admin/editor", { user: this.user, post, builderData: JSON.stringify(post.blocks ?? []), builderMedia: JSON.stringify(data.media.map(item => ({ url: item.url, title: item.title, alt: item.alt }))), categories: data.categories.map(category => ({ ...category, selected: category.id === post.categoryId })), type, heading: post.id ? `Edit ${type}` : `Add ${type}` }); }
  async savePost() { if (!(await this.permissionGuard("content"))) return; await this.store().savePost(this.body, this.user.id); return this.redirect(`/nodecms/posts?type=${this.body.type}`); }
  async deletePost() { if (!(await this.permissionGuard("content"))) return; await this.store().deletePost(this.params.id); return this.redirect("/nodecms/posts"); }
  async workspace() {
    if (!(await this.permissionGuard("workspace"))) return;
    const kind = this.params.kind;
    if (!["tasks", "notes"].includes(kind)) return this.abort(404);
    const data = await this.store().read();
    const items = (data[kind] ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const item = items.find(entry => entry.id === Number(this.query.edit)) ?? {};
    return this.render("admin/workspace", {
      user: this.user, kind, isTasks: kind === "tasks", item,
      heading: kind === "tasks" ? "Editorial tasks" : "Team notes",
      description: kind === "tasks" ? "Plan upcoming work, set priorities, and track your publishing checklist." : "Keep editorial ideas, handover notes, and team knowledge together.",
      items: items.map(entry => ({ ...entry, author: data.users.find(user => user.id === entry.authorId)?.name ?? "Former team member", statusLabel: { todo: "To do", progress: "In progress", done: "Done" }[entry.status] ?? "Note" })),
      saved: this.query.saved === "1", deleted: this.query.deleted === "1", error: this.query.error === "1"
    });
  }
  async saveWorkspace() {
    if (!(await this.permissionGuard("workspace"))) return;
    const kind = this.params.kind;
    if (!["tasks", "notes"].includes(kind)) return this.abort(404);
    try { await this.store().saveWorkspaceItem(kind, this.body, this.user.id); }
    catch { return this.redirect(`/nodecms/workspace/${kind}?error=1`); }
    return this.redirect(`/nodecms/workspace/${kind}?saved=1`);
  }
  async deleteWorkspace() {
    if (!(await this.permissionGuard("workspace"))) return;
    const kind = this.params.kind;
    if (!["tasks", "notes"].includes(kind)) return this.abort(404);
    await this.store().deleteWorkspaceItem(kind, this.params.id);
    return this.redirect(`/nodecms/workspace/${kind}?deleted=1`);
  }
  async categories() { if (!(await this.permissionGuard("categories"))) return; const { data } = await this.store().dashboard(); return this.render("admin/categories", { user: this.user, categories: data.categories }); }
  async addCategory() { if (!(await this.permissionGuard("categories"))) return; if (this.body.name) await this.store().addCategory(this.body); return this.redirect("/nodecms/categories"); }
  async media() { if (!(await this.permissionGuard("media"))) return; const { data } = await this.store().dashboard(); return this.render("admin/media", { user: this.user, media: data.media }); }
  async addMedia() { if (!(await this.permissionGuard("media"))) return; await this.store().addMedia(this.body); return this.redirect("/nodecms/media"); }
  async deleteMedia() { if (!(await this.permissionGuard("media"))) return; await this.store().deleteMedia(this.params.id); return this.redirect("/nodecms/media"); }
  async settings() { if (!(await this.permissionGuard("settings"))) return; const { data } = await this.store().dashboard(); const theme = this.service("themes").get(data.settings.theme); return this.render("admin/settings", { user: this.user, settings: { ...data.settings, theme: theme.id }, theme }); }
  async saveSettings() { if (!(await this.permissionGuard("settings"))) return; await this.store().saveSettings(this.body); return this.redirect("/nodecms/settings?saved=1"); }
  async themes() { if (!(await this.permissionGuard("themes"))) return; const { data } = await this.store().dashboard(); return this.render("admin/themes", { user: this.user, themes: this.service("themes").all(), activeTheme: data.settings.theme, uploadError: this.query.error === "1" }); }
  async activateTheme() { if (!(await this.permissionGuard("themes"))) return; if (this.service("themes").has(this.body.theme)) await this.store().activateTheme(this.body.theme); return this.redirect("/nodecms/themes?activated=1"); }
  async uploadTheme() { if (!(await this.permissionGuard("themes"))) return; try { const theme = await this.service("archives").installTheme(this.body.dataUrl); this.service("themes").register(theme); return this.json({ ok: true, theme }); } catch (error) { return this.json({ ok: false, error: error.message }, 400); } }
  async users() { if (!this.adminGuard()) return; const { data } = await this.store().dashboard(); return this.render("admin/users", { user: this.user, users: data.users, error: this.query.error === "1" }); }
  async addUser() { if (!this.adminGuard()) return; try { await this.store().addUser(this.body); } catch { return this.redirect("/nodecms/users?error=1"); } return this.redirect("/nodecms/users"); }
  async deleteUser() { if (!this.adminGuard()) return; await this.store().deleteUser(this.params.id, this.user.id); return this.redirect("/nodecms/users"); }
  async roles() { if (!this.adminGuard()) return; const catalog = this.store().permissionCatalog(); const permissions = await this.store().rolePermissions(); const roles = ["Editor", "Author"].map((role) => ({ name: role, permissions: catalog.map((permission) => ({ ...permission, checked: Boolean(permissions[role]?.[permission.id]) })) })); return this.render("admin/roles", { user: this.user, roles, saved: this.query.saved === "1" }); }
  async saveRoles() { if (!this.adminGuard()) return; await this.store().saveRolePermissions(this.body); return this.redirect("/nodecms/roles?saved=1"); }
  async menus() { if (!(await this.permissionGuard("menus"))) return; const { data } = await this.store().dashboard(); const menu = data.menus.find((item) => item.location === "primary") ?? { items: [] }; return this.render("admin/menus", { user: this.user, menu, pages: data.posts.filter((post) => post.type === "page"), categories: data.categories }); }
  async saveMenu() { if (!(await this.permissionGuard("menus"))) return; let rows; try { rows = JSON.parse(String(this.body.items ?? "[]")); } catch { rows = String(this.body.items ?? "").split(/\r?\n/).map((row) => { const [label, url] = row.split("|"); return { label, url }; }); } await this.store().saveMenu({ label: rows.map((row) => row.label), url: rows.map((row) => row.url) }); return this.redirect("/nodecms/menus?saved=1"); }
  commentsBack() { const back = this.body?.redirect; return typeof back === "string" && back.startsWith("/nodecms/comments") ? back : "/nodecms/comments"; }
  async comments() {
    if (!(await this.permissionGuard("comments"))) return;
    const { data } = await this.store().dashboard();
    const filter = ["pending", "approved", "spam"].includes(this.query.filter) ? this.query.filter : "all";
    const postById = new Map(data.posts.map((post) => [post.id, post]));
    const when = (iso) => { const date = new Date(iso); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }); };

    const decorated = data.comments.map((comment) => ({
      ...comment,
      postTitle: postById.get(comment.postId)?.title ?? "Deleted post",
      postSlug: postById.get(comment.postId)?.slug ?? "",
      when: when(comment.createdAt)
    }));
    const roots = decorated.filter((comment) => !comment.parentId);
    const counts = {
      all: roots.length,
      pending: roots.filter((comment) => comment.status === "pending").length,
      approved: roots.filter((comment) => comment.status === "approved").length,
      spam: roots.filter((comment) => comment.status === "spam").length
    };
    const repliesByParent = new Map();
    for (const comment of decorated) {
      if (!comment.parentId) continue;
      if (!repliesByParent.has(comment.parentId)) repliesByParent.set(comment.parentId, []);
      repliesByParent.get(comment.parentId).push(comment);
    }
    for (const list of repliesByParent.values()) list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

    const threads = roots
      .filter((comment) => filter === "all" || comment.status === filter)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((comment) => ({ ...comment, replies: repliesByParent.get(comment.id) ?? [] }));

    const tab = (key, label) => ({ key, label: `${label} (${counts[key]})`, href: key === "all" ? "/nodecms/comments" : `/nodecms/comments?filter=${key}`, active: filter === key });
    const emptyState = threads.length === 0;

    return this.render("admin/comments", {
      user: this.user,
      threads,
      filter,
      tabs: [tab("all", "All"), tab("pending", "Pending"), tab("approved", "Approved"), tab("spam", "Spam")],
      emptyState,
      emptyTitle: counts.all === 0 ? "No comments yet" : "Nothing to moderate here",
      emptyHint: counts.all === 0
        ? "When readers comment on your published posts, they land here for moderation."
        : "No comments match this filter."
    });
  }
  async moderateComment() { if (!(await this.permissionGuard("comments"))) return; await this.store().moderateComment(this.params.id, this.body.status); return this.redirect(this.commentsBack()); }
  async replyComment() { if (!(await this.permissionGuard("comments"))) return; await this.store().replyToComment(this.params.id, this.body, this.user); return this.redirect(this.commentsBack()); }
  async deleteComment() { if (!(await this.permissionGuard("comments"))) return; await this.store().deleteComment(this.params.id); return this.redirect(this.commentsBack()); }
  async revisions() { if (!(await this.permissionGuard("content"))) return; const { data } = await this.store().dashboard(); const revisions = data.revisions.filter((revision) => revision.postId === Number(this.params.id)).reverse(); const post = data.posts.find((item) => item.id === Number(this.params.id)); return this.render("admin/revisions", { user: this.user, revisions, post }); }
  async restoreRevision() { if (!(await this.permissionGuard("content"))) return; await this.store().restoreRevision(this.params.id); return this.redirect(`/nodecms/posts/${this.body.postId}/edit`); }
  async backups() { if (!(await this.permissionGuard("backups"))) return; return this.render("admin/backups", { user: this.user, backups: await this.store().backups(), destinations: await this.store().backupDestinations(), created: this.query.created === "1", restored: this.query.restored === "1", deleted: this.query.deleted === "1", pushed: this.query.pushed ?? "", error: this.query.error ?? "" }); }
  async createBackup() { if (!(await this.permissionGuard("backups"))) return; const { remote } = await this.store().createBackup(this.body.destination || "local"); const params = new URLSearchParams({ created: "1" }); if (remote?.ok) params.set("pushed", remote.label); else if (remote && !remote.ok) params.set("error", `${remote.label}: ${remote.error}`); return this.redirect(`/nodecms/backups?${params}`); }
  async downloadBackup() { if (!(await this.permissionGuard("backups"))) return; let contents; try { contents = await this.store().readBackup(this.params.name); } catch { return this.context.abort(404, "Backup not found"); } this.context.response.baseHeaders["content-disposition"] = `attachment; filename="${this.params.name}"`; return this.context.text(contents, 200, "application/json; charset=utf-8"); }
  async restoreBackup() { if (!(await this.permissionGuard("backups"))) return; try { await this.store().restoreBackup(this.params.name); } catch (error) { return this.redirect(`/nodecms/backups?error=${encodeURIComponent(error.message)}`); } return this.redirect("/nodecms/backups?restored=1"); }
  async deleteBackup() { if (!(await this.permissionGuard("backups"))) return; await this.store().deleteBackup(this.params.name); return this.redirect("/nodecms/backups?deleted=1"); }
  async integrations() {
    if (!(await this.permissionGuard("integrations"))) return;
    const store = this.store();
    const config = await store.integrations();
    const mask = (value) => (value ? "•••••••• saved" : "");
    const categories = store.integrationCatalog().map((category) => {
      const providers = category.providers.map((provider) => {
        const values = config[provider.id] ?? {};
        const required = provider.required ?? provider.fields.map((field) => field.key);
        return {
          id: provider.id,
          name: provider.name,
          description: provider.description,
          configured: required.every((key) => Boolean(values[key])),
          fields: provider.fields.map((field) => ({
            name: `${provider.id}__${field.key}`,
            label: field.label,
            secret: Boolean(field.secret),
            value: field.secret ? "" : (values[field.key] ?? ""),
            placeholder: field.secret ? (mask(values[field.key]) || "Paste to set") : (field.placeholder ?? "")
          }))
        };
      });
      return { name: category.name, blurb: category.blurb, providers, ready: providers.filter((provider) => provider.configured).length, total: providers.length };
    });
    return this.render("admin/integrations", { user: this.user, saved: this.query.saved === "1", categories });
  }
  async saveIntegrations() { if (!(await this.permissionGuard("integrations"))) return; await this.store().saveIntegrations(this.body); return this.redirect("/nodecms/integrations?saved=1"); }
  async plugins() {
    if (!(await this.permissionGuard("plugins"))) return;
    const all = await this.service("plugins").all();
    const filters = {
      all: { label: "All", match: () => true },
      active: { label: "Active", match: (plugin) => plugin.active },
      inactive: { label: "Inactive", match: (plugin) => !plugin.active },
      core: { label: "Core", match: (plugin) => plugin.isCore },
      installed: { label: "Installed", match: (plugin) => !plugin.isCore }
    };
    const filter = filters[this.query.filter] ? this.query.filter : "all";
    const tabs = Object.entries(filters).map(([id, item]) => ({ id, label: item.label, count: all.filter(item.match).length, href: id === "all" ? "/nodecms/plugins" : `/nodecms/plugins?filter=${id}`, active: id === filter }));
    const plugins = all.filter(filters[filter].match);
    const notices = { installed: "Plugin installed. Restart the app to load it.", activated: "Plugin activated. Restart the app to load it.", deactivated: "Plugin deactivated. Restart the app to unload it.", deleted: "Plugin deleted." };
    const notice = notices[this.query.done] ?? "";
    const error = this.query.error ? String(this.query.error).slice(0, 200) : "";
    const restartCount = all.filter((plugin) => plugin.restartRequired).length;
    return this.render("admin/plugins", { user: this.user, plugins, tabs, filter, notice, error, restartCount, restartPending: restartCount > 0, empty: plugins.length === 0, total: all.length, activeCount: all.filter((plugin) => plugin.active).length });
  }
  async togglePlugin() {
    if (!(await this.permissionGuard("plugins"))) return;
    const active = this.body.action === "activate";
    try { await this.service("plugins").setActive(String(this.body.id ?? ""), active); return this.redirect(`/nodecms/plugins?done=${active ? "activated" : "deactivated"}`); }
    catch (error) { return this.redirect(`/nodecms/plugins?error=${encodeURIComponent(error.message)}`); }
  }
  async deletePlugin() {
    if (!(await this.permissionGuard("plugins"))) return;
    try { await this.service("plugins").remove(String(this.body.id ?? "")); return this.redirect("/nodecms/plugins?done=deleted"); }
    catch (error) { return this.redirect(`/nodecms/plugins?error=${encodeURIComponent(error.message)}`); }
  }
  async uploadPlugin() { if (!(await this.permissionGuard("plugins"))) return; try { const plugin = await this.service("archives").installPlugin(this.body.dataUrl); return this.json({ ok: true, plugin, restartRequired: true }); } catch (error) { return this.json({ ok: false, error: error.message }, 400); } }
}
