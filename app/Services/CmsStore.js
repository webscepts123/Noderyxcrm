import { sanitizeBlocks, decorateBlocks } from "../../public/builder-model.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { BackupManager } from "./BackupManager.js";

const now = () => new Date().toISOString();

function slugify(value) {
  return String(value ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const ROLES = ["Administrator", "Editor", "Author"];
const PERMISSION_CATALOG = [
  { id: "content", label: "Posts & pages", description: "Create, edit, publish, and delete posts and pages." },
  { id: "media", label: "Media library", description: "Upload and manage images and files." },
  { id: "categories", label: "Categories", description: "Create and manage content categories." },
  { id: "comments", label: "Comments", description: "Moderate, reply to, and delete comments." },
  { id: "menus", label: "Menus", description: "Edit the site navigation menu." },
  { id: "workspace", label: "Editorial workspace", description: "Manage editorial tasks and team notes." },
  { id: "settings", label: "Settings & SEO", description: "Change site settings and SEO defaults." },
  { id: "themes", label: "Themes", description: "Activate and upload themes." },
  { id: "plugins", label: "Plugins", description: "Install and manage plugins." },
  { id: "backups", label: "Backups", description: "Create, download, restore, and delete backups." },
  { id: "integrations", label: "Integrations", description: "Connect third-party services." }
];
const ADMIN_ONLY_PERMISSIONS = ["settings", "themes", "plugins", "backups", "integrations"];

export class CmsStore {
  constructor(file = join(process.cwd(), "storage", "cms.json")) {
    this.file = file;
    this.queue = Promise.resolve();
    this.vault = new BackupManager(join(dirname(file), "backups"));
  }

  permissionCatalog() { return PERMISSION_CATALOG; }
  defaultPermissionsFor(role) {
    return Object.fromEntries(PERMISSION_CATALOG.map((permission) => [permission.id, role === "Administrator" || !ADMIN_ONLY_PERMISSIONS.includes(permission.id)]));
  }

  async initialize() {
    await mkdir(dirname(this.file), { recursive: true });
    try {
      const data = JSON.parse(await readFile(this.file, "utf8"));
      if (this.normalize(data)) await this.save(data);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const createdAt = now();
      await this.save({
        settings: { siteName: process.env.SITE_NAME ?? "Noderyx CMS", tagline: "Ideas, stories, and updates.", description: "A modern publishing site powered by Noderyx.", theme: "default", postsPerPage: 9 },
        users: [{ id: 1, name: "Administrator", email: process.env.CMS_ADMIN_EMAIL ?? "admin@example.com", password: hashPassword(process.env.CMS_ADMIN_PASSWORD ?? "changeme123"), role: "Administrator", createdAt }],
        categories: [{ id: 1, name: "General", slug: "general", description: "General updates" }],
        posts: [{ id: 1, type: "post", title: "Welcome to Noderyx CMS", slug: "welcome-to-noderyx-cms", excerpt: "Your new publishing platform is ready.", content: "This is your first post. Sign in to the dashboard to edit it, publish new stories, create pages, and customize your site.", status: "published", categoryId: 1, authorId: 1, featuredImage: "", createdAt, updatedAt: createdAt, publishedAt: createdAt }],
        media: [],
        comments: [],
        menus: [{ id: 1, name: "Primary", location: "primary", items: [{ id: 1, label: "Home", url: "/", order: 1 }] }],
        revisions: [],
        integrations: {},
        rolePermissions: Object.fromEntries(ROLES.map((role) => [role, this.defaultPermissionsFor(role)]))
      });
    }
    return this;
  }

  normalize(data) {
    let changed = false;
    for (const [key, fallback] of Object.entries({ users: [], posts: [], categories: [], media: [], comments: [], revisions: [] })) {
      if (!Array.isArray(data[key])) { data[key] = fallback; changed = true; }
    }
    if (!Array.isArray(data.menus)) { data.menus = [{ id: 1, name: "Primary", location: "primary", items: [{ id: 1, label: "Home", url: "/", order: 1 }] }]; changed = true; }
    data.settings ??= {};
    const settings = { metaTitle: "", metaDescription: data.settings.description ?? "", socialImage: "", indexSite: true };
    for (const [key, value] of Object.entries(settings)) if (data.settings[key] === undefined) { data.settings[key] = value; changed = true; }
    if (!data.integrations || typeof data.integrations !== "object") { data.integrations = {}; changed = true; }
    if (!data.rolePermissions || typeof data.rolePermissions !== "object") { data.rolePermissions = {}; changed = true; }
    for (const role of ROLES) {
      const defaults = this.defaultPermissionsFor(role);
      if (!data.rolePermissions[role] || typeof data.rolePermissions[role] !== "object") { data.rolePermissions[role] = { ...defaults }; changed = true; continue; }
      for (const permission of PERMISSION_CATALOG) {
        const forced = role === "Administrator";
        const value = forced ? true : Boolean(data.rolePermissions[role][permission.id] ?? defaults[permission.id]);
        if (data.rolePermissions[role][permission.id] !== value) { data.rolePermissions[role][permission.id] = value; changed = true; }
      }
    }
    return changed;
  }

  async read() { return JSON.parse(await readFile(this.file, "utf8")); }
  async save(data) {
    this.queue = this.queue.then(async () => {
      const temporary = `${this.file}.tmp`;
      await writeFile(temporary, JSON.stringify(data, null, 2));
      await rename(temporary, this.file);
    });
    return this.queue;
  }

  async mutate(callback) { const data = await this.read(); const result = await callback(data); await this.save(data); return result; }
  async saveWorkspaceItem(kind, input, authorId) {
    if (!["tasks", "notes"].includes(kind)) throw new Error("Unknown workspace collection");
    const title = String(input.title ?? "").trim();
    const content = String(input.content ?? "").trim();
    if (!title || title.length > 160 || content.length > 10000) throw new Error("Enter a title up to 160 characters and details up to 10,000 characters.");
    const dueDate = String(input.dueDate ?? "");
    if (kind === "tasks" && dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate)) throw new Error("Enter a valid due date.");
    if (kind === "tasks" && (!["todo", "progress", "done"].includes(input.status) || !["low", "normal", "high"].includes(input.priority))) throw new Error("Choose a valid task status and priority.");
    return this.mutate(data => {
      data[kind] ??= [];
      const existing = input.id ? data[kind].find(item => item.id === Number(input.id)) : null;
      if (input.id && !existing) throw new Error("This item no longer exists.");
      const item = {
        id: existing?.id ?? Math.max(0, ...data[kind].map(item => item.id)) + 1,
        title, content, authorId: existing?.authorId ?? authorId,
        createdAt: existing?.createdAt ?? now(), updatedAt: now(),
        ...(kind === "tasks" ? { status: input.status, priority: input.priority, dueDate } : {})
      };
      if (existing) data[kind][data[kind].indexOf(existing)] = item;
      else data[kind].push(item);
      return item;
    });
  }

  async deleteWorkspaceItem(kind, id) {
    if (!["tasks", "notes"].includes(kind)) throw new Error("Unknown workspace collection");
    return this.mutate(data => { data[kind] = (data[kind] ?? []).filter(item => item.id !== Number(id)); });
  }

  async publicPosts(type = "post") { const data = await this.read(); return data.posts.filter((post) => post.type === type && post.status === "published").sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).map((post) => this.decorate(post, data)); }
  async findPublished(slug, type) { const data = await this.read(); const post = data.posts.find((item) => item.slug === slug && item.status === "published" && (!type || item.type === type)); return post ? this.decorate(post, data) : null; }
  async dashboard() { const data = await this.read(); return { data, counts: { posts: data.posts.filter((p) => p.type === "post").length, pages: data.posts.filter((p) => p.type === "page").length, drafts: data.posts.filter((p) => p.status === "draft").length, media: data.media.length, comments: data.comments.length, users: data.users.length } }; }
  decorate(post, data) { const category = data.categories.find((c) => c.id === post.categoryId); return { ...post, blocks: post.blocks?.length ? decorateBlocks(post.blocks) : null, category: category?.name ?? "Uncategorized", categorySlug: category?.slug ?? "uncategorized", author: data.users.find((u) => u.id === post.authorId)?.name ?? "Editor", date: new Date(post.publishedAt ?? post.createdAt).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" }) }; }

  async authenticate(email, password) {
    const data = await this.read(); const user = data.users.find((item) => item.email.toLowerCase() === String(email).toLowerCase());
    if (!user) return null;
    const [salt, stored] = user.password.split(":"); const candidate = scryptSync(String(password), salt, 64); const expected = Buffer.from(stored, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected) ? { id: user.id, name: user.name, email: user.email, role: user.role } : null;
  }

  async seedAdmin({ name, email, password }) {
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail || !password) throw new Error("Admin email and password are required");

    return this.mutate((data) => {
      data.users ??= [];
      const existing = data.users.find((user) => user.email.toLowerCase() === normalizedEmail);
      const admin = {
        id: existing?.id ?? Math.max(0, ...data.users.map((user) => Number(user.id) || 0)) + 1,
        name: String(name || "Administrator").trim(),
        email: normalizedEmail,
        password: hashPassword(String(password)),
        role: "Administrator",
        createdAt: existing?.createdAt ?? now()
      };

      if (existing) Object.assign(existing, admin);
      else data.users.push(admin);
      return { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
    });
  }

  async savePost(input, authorId) {
    return this.mutate((data) => {
      const id = Number(input.id); const existing = data.posts.find((p) => p.id === id); const title = String(input.title ?? "").trim();
      const base = { layout: ["standard", "wide", "canvas"].includes(input.layout) ? input.layout : (existing?.layout ?? "standard"), type: input.type === "page" ? "page" : "post", title, slug: slugify(input.slug || title), excerpt: String(input.excerpt ?? "").trim(), content: String(input.content ?? "").trim(), blocks: input.blocks === undefined ? (existing?.blocks ?? []) : sanitizeBlocks(input.blocks), status: input.status === "published" ? "published" : "draft", categoryId: Number(input.categoryId) || 1, featuredImage: String(input.featuredImage ?? "").trim(), seoTitle: String(input.seoTitle ?? "").trim(), seoDescription: String(input.seoDescription ?? "").trim(), updatedAt: now() };
      if (existing) {
        data.revisions.push({ id: Math.max(0, ...data.revisions.map((r) => r.id)) + 1, postId: existing.id, title: existing.title, layout: existing.layout ?? "standard", content: existing.content, blocks: existing.blocks ?? [], excerpt: existing.excerpt, status: existing.status, authorId, createdAt: now() });
        Object.assign(existing, base); if (base.status === "published" && !existing.publishedAt) existing.publishedAt = now(); return existing;
      }
      const post = { id: Math.max(0, ...data.posts.map((p) => p.id)) + 1, ...base, authorId, createdAt: now(), publishedAt: base.status === "published" ? now() : null }; data.posts.push(post); return post;
    });
  }

  async deletePost(id) { return this.mutate((data) => { data.posts = data.posts.filter((p) => p.id !== Number(id)); }); }
  async addCategory(input) { return this.mutate((data) => data.categories.push({ id: Math.max(0, ...data.categories.map((c) => c.id)) + 1, name: String(input.name).trim(), slug: slugify(input.slug || input.name), description: String(input.description ?? "").trim() })); }
  async addMedia(input) {
    let url = String(input.url ?? "").trim();
    if (input.dataUrl) {
      const match = String(input.dataUrl).match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new Error("Unsupported image upload");
      const extension = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[match[1]];
      const directory = join(process.cwd(), "public", "uploads");
      await mkdir(directory, { recursive: true });
      const filename = `${Date.now()}-${slugify(input.title || input.filename || "image")}.${extension}`;
      await writeFile(join(directory, filename), Buffer.from(match[2], "base64"));
      url = `/public/uploads/${filename}`;
    }
    if (!url) throw new Error("Media URL or file is required");
    return this.mutate((data) => data.media.push({ id: Math.max(0, ...data.media.map((m) => m.id)) + 1, title: String(input.title || input.filename || "Image").trim(), url, alt: String(input.alt ?? "").trim(), createdAt: now() }));
  }
  async deleteMedia(id) { return this.mutate((data) => { data.media = data.media.filter((item) => item.id !== Number(id)); }); }

  async saveSettings(input) { return this.mutate((data) => { data.settings = { ...data.settings, siteName: String(input.siteName).trim(), tagline: String(input.tagline).trim(), description: String(input.description).trim(), theme: String(input.theme || data.settings.theme || "default"), metaTitle: String(input.metaTitle ?? "").trim(), metaDescription: String(input.metaDescription ?? "").trim(), socialImage: String(input.socialImage ?? "").trim(), indexSite: input.indexSite === "on" }; }); }
  async activateTheme(id) { return this.mutate((data) => { data.settings.theme = String(id); }); }

  async addUser(input) { return this.mutate((data) => { const email = String(input.email).trim().toLowerCase(); if (data.users.some((u) => u.email.toLowerCase() === email)) throw new Error("Email already exists"); data.users.push({ id: Math.max(0, ...data.users.map((u) => u.id)) + 1, name: String(input.name).trim(), email, password: hashPassword(String(input.password)), role: ["Administrator", "Editor", "Author"].includes(input.role) ? input.role : "Author", createdAt: now() }); }); }
  async deleteUser(id, currentUserId) { return this.mutate((data) => { const user = data.users.find((item) => item.id === Number(id)); if (!user || user.id === Number(currentUserId)) return; if (user.role === "Administrator" && data.users.filter((item) => item.role === "Administrator").length === 1) return; data.users = data.users.filter((item) => item.id !== user.id); }); }

  async rolePermissions() { const data = await this.read(); return data.rolePermissions ?? Object.fromEntries(ROLES.map((role) => [role, this.defaultPermissionsFor(role)])); }
  async can(role, permissionId) { const permissions = await this.rolePermissions(); return role === "Administrator" || Boolean(permissions[role]?.[permissionId]); }
  async saveRolePermissions(input) {
    return this.mutate((data) => {
      data.rolePermissions ??= {};
      for (const role of ROLES) {
        data.rolePermissions[role] = Object.fromEntries(PERMISSION_CATALOG.map((permission) => [
          permission.id,
          role === "Administrator" ? true : input[`${role}__${permission.id}`] === "on"
        ]));
      }
    });
  }

  async saveMenu(input) { return this.mutate((data) => { const menu = data.menus.find((m) => m.location === "primary") ?? { id: 1, name: "Primary", location: "primary", items: [] }; if (!data.menus.includes(menu)) data.menus.push(menu); const labels = Array.isArray(input.label) ? input.label : [input.label].filter(Boolean); const urls = Array.isArray(input.url) ? input.url : [input.url].filter(Boolean); menu.items = labels.map((label, index) => ({ id: index + 1, label: String(label).trim(), url: String(urls[index] ?? "/").trim(), order: index + 1 })).filter((item) => item.label); }); }

  async addComment(postId, input) { return this.mutate((data) => data.comments.push({ id: Math.max(0, ...data.comments.map((c) => c.id)) + 1, postId: Number(postId), name: String(input.name).trim(), email: String(input.email).trim().toLowerCase(), content: String(input.content).trim(), status: "pending", createdAt: now() })); }
  async moderateComment(id, status) {
    const next = ["approved", "pending", "spam"].includes(String(status)) ? String(status) : "pending";
    return this.mutate((data) => { const comment = data.comments.find((c) => c.id === Number(id)); if (comment) comment.status = next; });
  }
  async replyToComment(id, input, author = {}) {
    const content = String(input?.content ?? "").trim();
    if (!content) return null;
    return this.mutate((data) => {
      const parent = data.comments.find((c) => c.id === Number(id));
      if (!parent) return;
      data.comments.push({
        id: Math.max(0, ...data.comments.map((c) => c.id)) + 1,
        postId: parent.postId,
        parentId: parent.id,
        name: String(author.name || "Staff").trim(),
        email: String(author.email ?? "").trim().toLowerCase(),
        content,
        status: "approved",
        staff: true,
        createdAt: now()
      });
      if (parent.status === "pending") parent.status = "approved";
    });
  }
  async deleteComment(id) { const rid = Number(id); return this.mutate((data) => { data.comments = data.comments.filter((c) => c.id !== rid && c.parentId !== rid); }); }

  async restoreRevision(id) { return this.mutate((data) => { const revision = data.revisions.find((r) => r.id === Number(id)); const post = revision && data.posts.find((p) => p.id === revision.postId); if (post) Object.assign(post, { title: revision.title, layout: revision.layout ?? "standard", content: revision.content, blocks: revision.blocks ?? [], excerpt: revision.excerpt, status: revision.status, updatedAt: now() }); }); }

  async backups() { return this.vault.list(); }

  // The Integrations screen is driven by this catalogue. Each provider's `id`
  // is also its key in the saved integrations object and in `integrationDefaults`,
  // so the backup destinations (googleDrive / mediacloudhub / webhook) keep the
  // exact shape BackupManager expects. Field `key` is the key inside that object;
  // the form input name is `<providerId>__<fieldKey>`.
  integrationCatalog() {
    return [
      {
        id: "backup", name: "Backup", blurb: "Ship a copy of every backup to off-site storage.",
        providers: [
          { id: "googleDrive", name: "Google Drive", description: "Paste an OAuth access token with the drive.file scope. Backups upload as JSON files.", required: ["accessToken"], fields: [
            { key: "accessToken", label: "Access token", secret: true, env: "GOOGLE_DRIVE_TOKEN" },
            { key: "folderId", label: "Folder ID", env: "GOOGLE_DRIVE_FOLDER_ID" }
          ] },
          { id: "mediacloudhub", name: "MediaCloudHub", description: "API key from mediacloudhub.com. Each backup is sent to the MediaCloudHub backups API.", required: ["apiKey"], fields: [
            { key: "apiKey", label: "API key", secret: true, env: "MEDIACLOUDHUB_API_KEY" },
            { key: "apiUrl", label: "API base URL", placeholder: "https://mediacloudhub.com/api/v1", env: "MEDIACLOUDHUB_API_URL" },
            { key: "bucket", label: "Bucket", env: "MEDIACLOUDHUB_BUCKET" }
          ] },
          { id: "webhook", name: "Custom webhook", description: "Any HTTPS endpoint. Each backup is POSTed as JSON with an optional shared-secret header.", required: ["url"], fields: [
            { key: "url", label: "Webhook URL", placeholder: "https://example.com/hooks/backup", env: "BACKUP_WEBHOOK_URL" },
            { key: "secret", label: "Shared secret", secret: true, env: "BACKUP_WEBHOOK_SECRET" }
          ] }
        ]
      },
      {
        id: "sms", name: "SMS", blurb: "Send transactional text messages and delivery alerts.",
        providers: [
          { id: "twilio", name: "Twilio", description: "Account SID, auth token and a sender number or Messaging Service SID.", required: ["accountSid", "authToken"], fields: [
            { key: "accountSid", label: "Account SID", env: "TWILIO_ACCOUNT_SID" },
            { key: "authToken", label: "Auth token", secret: true, env: "TWILIO_AUTH_TOKEN" },
            { key: "fromNumber", label: "From number", placeholder: "+15551234567", env: "TWILIO_FROM_NUMBER" }
          ] },
          { id: "vonage", name: "Vonage", description: "API key and secret from the Vonage (Nexmo) dashboard.", required: ["apiKey", "apiSecret"], fields: [
            { key: "apiKey", label: "API key", env: "VONAGE_API_KEY" },
            { key: "apiSecret", label: "API secret", secret: true, env: "VONAGE_API_SECRET" },
            { key: "brand", label: "Sender name", placeholder: "Noderyx", env: "VONAGE_BRAND" }
          ] },
          { id: "messagebird", name: "MessageBird", description: "Live access key from MessageBird. Originator is the sender shown to recipients.", required: ["accessKey"], fields: [
            { key: "accessKey", label: "Access key", secret: true, env: "MESSAGEBIRD_ACCESS_KEY" },
            { key: "originator", label: "Originator", placeholder: "Noderyx", env: "MESSAGEBIRD_ORIGINATOR" }
          ] },
          { id: "paid2marketing", name: "Paid2Marketing", description: "SMS service at paid2marketing.com. API key plus the sender ID shown to recipients.", required: ["apiKey"], fields: [
            { key: "apiKey", label: "API key", secret: true, env: "PAID2MARKETING_API_KEY" },
            { key: "senderId", label: "Sender ID", placeholder: "Noderyx", env: "PAID2MARKETING_SENDER_ID" },
            { key: "apiUrl", label: "API base URL", placeholder: "https://paid2marketing.com/api", env: "PAID2MARKETING_API_URL" }
          ] }
        ]
      },
      {
        id: "marketing", name: "Paid marketing", blurb: "Sync audiences and report conversions to ad platforms.",
        providers: [
          { id: "googleAds", name: "Google Ads", description: "Developer token plus an OAuth refresh token for the manager account.", required: ["developerToken", "customerId"], fields: [
            { key: "developerToken", label: "Developer token", secret: true, env: "GOOGLE_ADS_DEVELOPER_TOKEN" },
            { key: "customerId", label: "Customer ID", placeholder: "123-456-7890", env: "GOOGLE_ADS_CUSTOMER_ID" },
            { key: "refreshToken", label: "Refresh token", secret: true, env: "GOOGLE_ADS_REFRESH_TOKEN" }
          ] },
          { id: "metaAds", name: "Meta Ads", description: "System-user access token and the ad account your pixel belongs to.", required: ["accessToken", "adAccountId"], fields: [
            { key: "accessToken", label: "Access token", secret: true, env: "META_ADS_ACCESS_TOKEN" },
            { key: "adAccountId", label: "Ad account ID", placeholder: "act_1234567890", env: "META_ADS_ACCOUNT_ID" },
            { key: "pixelId", label: "Pixel ID", env: "META_ADS_PIXEL_ID" }
          ] },
          { id: "linkedinAds", name: "LinkedIn Ads", description: "OAuth access token and the sponsored account ID.", required: ["accessToken", "accountId"], fields: [
            { key: "accessToken", label: "Access token", secret: true, env: "LINKEDIN_ADS_ACCESS_TOKEN" },
            { key: "accountId", label: "Account ID", env: "LINKEDIN_ADS_ACCOUNT_ID" }
          ] }
        ]
      },
      {
        id: "other", name: "Other", blurb: "Analytics, team chat notifications and email marketing.",
        providers: [
          { id: "slack", name: "Slack", description: "Incoming webhook URL. Publish and moderation events post to the channel.", required: ["webhookUrl"], fields: [
            { key: "webhookUrl", label: "Incoming webhook URL", secret: true, env: "SLACK_WEBHOOK_URL" },
            { key: "channel", label: "Channel override", placeholder: "#content", env: "SLACK_CHANNEL" }
          ] },
          { id: "mailchimp", name: "Mailchimp", description: "API key and audience (list) ID for syncing subscribers.", required: ["apiKey", "audienceId"], fields: [
            { key: "apiKey", label: "API key", secret: true, env: "MAILCHIMP_API_KEY" },
            { key: "audienceId", label: "Audience ID", env: "MAILCHIMP_AUDIENCE_ID" }
          ] },
          { id: "googleAnalytics", name: "Google Analytics 4", description: "Measurement ID and a Measurement Protocol API secret for server-side events.", required: ["measurementId"], fields: [
            { key: "measurementId", label: "Measurement ID", placeholder: "G-XXXXXXXXXX", env: "GA4_MEASUREMENT_ID" },
            { key: "apiSecret", label: "API secret", secret: true, env: "GA4_API_SECRET" }
          ] }
        ]
      }
    ];
  }

  integrationProviders() { return this.integrationCatalog().flatMap((category) => category.providers); }

  integrationDefaults() {
    const defaults = {};
    for (const provider of this.integrationProviders()) {
      defaults[provider.id] = {};
      for (const field of provider.fields) defaults[provider.id][field.key] = process.env[field.env] ?? "";
    }
    return defaults;
  }

  // Environment variables are the default; values saved from the Integrations
  // screen take precedence and are merged field by field.
  async integrations() {
    const stored = (await this.read()).integrations ?? {};
    const merged = {};
    for (const [group, fields] of Object.entries(this.integrationDefaults())) {
      merged[group] = {};
      for (const [field, fallback] of Object.entries(fields)) merged[group][field] = stored[group]?.[field] || fallback;
    }
    return merged;
  }

  async saveIntegrations(input) {
    const providers = this.integrationProviders();
    return this.mutate((data) => {
      const current = data.integrations ?? {};
      const next = {};
      for (const provider of providers) {
        next[provider.id] = {};
        for (const field of provider.fields) {
          const raw = String(input[`${provider.id}__${field.key}`] ?? "").trim();
          // A blank secret field keeps whatever is stored; plain fields are replaced.
          next[provider.id][field.key] = field.secret ? (raw || current[provider.id]?.[field.key] || "") : raw;
        }
      }
      data.integrations = next;
    });
  }

  async backupDestinations() { return this.vault.describe(await this.integrations()); }

  async createBackup(destinationId = "local") {
    const contents = JSON.stringify(await this.read(), null, 2);
    const name = this.vault.filename();
    await this.vault.write(name, contents);
    const remote = await this.vault.push(destinationId, { name, contents, config: await this.integrations() });
    return { name, destination: destinationId, remote };
  }

  async readBackup(name) { return this.vault.read(name); }
  async deleteBackup(name) { await this.vault.remove(name); return name; }

  async restoreBackup(name) {
    const snapshot = JSON.parse(await this.vault.read(name));
    if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.posts) || !Array.isArray(snapshot.users)) {
      throw new Error("That file is not a valid CMS snapshot");
    }
    await this.vault.write(this.vault.filename("cms-pre-restore"), JSON.stringify(await this.read(), null, 2));
    this.normalize(snapshot);
    await this.save(snapshot);
    return name;
  }
}
