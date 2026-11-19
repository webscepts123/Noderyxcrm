import { AdminController } from "../app/Controllers/AdminController.js";
import { DEFAULT_LOGIN_PATH } from "../app/Services/CmsStore.js";

export const CMS_PATH = "/nodecms";

/** The current sign-in path, which administrators can rename under Admin settings. */
export function currentLoginPath(context) {
  return context.service?.("cms")?.loginPath?.() ?? DEFAULT_LOGIN_PATH;
}

/**
 * Protect the complete CMS namespace before requests reach a controller.
 * Controller guards remain as defence in depth, but this prevents a newly
 * added CMS action from accidentally being published without authentication.
 */
export function requireCmsAuthentication(context, next) {
  const pathname = new URL(context.request.url, "http://localhost").pathname;
  const isCmsRequest = pathname === CMS_PATH || pathname.startsWith(`${CMS_PATH}/`);
  const loginPath = currentLoginPath(context);
  const customLogin = loginPath !== DEFAULT_LOGIN_PATH;
  const isDefaultLogin = pathname.replace(/\/$/, "") === DEFAULT_LOGIN_PATH;

  // With a custom login URL, the old one disappears entirely.
  if (isDefaultLogin && customLogin) return context.abort(404);
  if (!isCmsRequest || isDefaultLogin || context.session?.user) return next();

  // A redirect would reveal the hidden login URL, so signed-out visitors get a 404.
  if (customLogin) return context.abort(404);
  context.response.baseHeaders.location = loginPath;
  return context.text("", 303);
}

/**
 * Serve the custom login URL. These single-segment catch-alls must be
 * registered after every other route (including plugin routes) so they only
 * see paths nothing else claimed; the controller 404s anything that is not the
 * configured slug.
 */
export function registerLoginRoutes(app) {
  app.get("/:loginSlug", AdminController.handle("customLogin"));
  app.post("/:loginSlug", AdminController.handle("customAuthenticate"));
}

export function registerCmsRoutes(app) {
  app.get(`${CMS_PATH}/login`, AdminController.handle("login"));
  app.post(`${CMS_PATH}/login`, AdminController.handle("authenticate"));
  app.post(`${CMS_PATH}/logout`, AdminController.handle("logout"));

  app.get(`${CMS_PATH}/workspace/:kind`, AdminController.handle("workspace"));
  app.post(`${CMS_PATH}/workspace/:kind`, AdminController.handle("saveWorkspace"));
  app.post(`${CMS_PATH}/workspace/:kind/:id/delete`, AdminController.handle("deleteWorkspace"));
  app.get(CMS_PATH, AdminController.handle("dashboard"));
  app.get(`${CMS_PATH}/posts`, AdminController.handle("posts"));
  app.get(`${CMS_PATH}/posts/new`, AdminController.handle("editor"));
  app.get(`${CMS_PATH}/posts/:id/edit`, AdminController.handle("editor"));
  app.post(`${CMS_PATH}/posts/save`, AdminController.handle("savePost"));
  app.post(`${CMS_PATH}/posts/:id/delete`, AdminController.handle("deletePost"));
  app.get(`${CMS_PATH}/categories`, AdminController.handle("categories"));
  app.post(`${CMS_PATH}/categories`, AdminController.handle("addCategory"));
  app.get(`${CMS_PATH}/media`, AdminController.handle("media"));
  app.post(`${CMS_PATH}/media`, AdminController.handle("addMedia"));
  app.post(`${CMS_PATH}/media/:id/delete`, AdminController.handle("deleteMedia"));
  app.get("/admin-theme.css", AdminController.handle("adminThemeCss"));
  app.get(`${CMS_PATH}/admin-settings`, AdminController.handle("adminSettings"));
  app.post(`${CMS_PATH}/admin-settings/appearance`, AdminController.handle("saveAdminAppearance"));
  app.post(`${CMS_PATH}/admin-settings/login-url`, AdminController.handle("saveLoginUrl"));
  app.get(`${CMS_PATH}/settings`, AdminController.handle("settings"));
  app.post(`${CMS_PATH}/settings`, AdminController.handle("saveSettings"));
  app.get(`${CMS_PATH}/themes`, AdminController.handle("themes"));
  app.post(`${CMS_PATH}/themes/activate`, AdminController.handle("activateTheme"));
  app.post(`${CMS_PATH}/themes/upload`, AdminController.handle("uploadTheme"));
  app.get(`${CMS_PATH}/users`, AdminController.handle("users"));
  app.post(`${CMS_PATH}/users`, AdminController.handle("addUser"));
  app.post(`${CMS_PATH}/users/:id/delete`, AdminController.handle("deleteUser"));
  app.get(`${CMS_PATH}/roles`, AdminController.handle("roles"));
  app.post(`${CMS_PATH}/roles`, AdminController.handle("saveRoles"));
  app.get(`${CMS_PATH}/menus`, AdminController.handle("menus"));
  app.post(`${CMS_PATH}/menus`, AdminController.handle("saveMenu"));
  app.get(`${CMS_PATH}/comments`, AdminController.handle("comments"));
  app.post(`${CMS_PATH}/comments/:id/moderate`, AdminController.handle("moderateComment"));
  app.post(`${CMS_PATH}/comments/:id/reply`, AdminController.handle("replyComment"));
  app.post(`${CMS_PATH}/comments/:id/delete`, AdminController.handle("deleteComment"));
  app.get(`${CMS_PATH}/posts/:id/revisions`, AdminController.handle("revisions"));
  app.post(`${CMS_PATH}/revisions/:id/restore`, AdminController.handle("restoreRevision"));
  app.get(`${CMS_PATH}/backups`, AdminController.handle("backups"));
  app.post(`${CMS_PATH}/backups`, AdminController.handle("createBackup"));
  app.get(`${CMS_PATH}/backups/:name/download`, AdminController.handle("downloadBackup"));
  app.post(`${CMS_PATH}/backups/:name/restore`, AdminController.handle("restoreBackup"));
  app.post(`${CMS_PATH}/backups/:name/delete`, AdminController.handle("deleteBackup"));
  app.get(`${CMS_PATH}/integrations`, AdminController.handle("integrations"));
  app.post(`${CMS_PATH}/integrations`, AdminController.handle("saveIntegrations"));
  app.get(`${CMS_PATH}/plugins`, AdminController.handle("plugins"));
  app.post(`${CMS_PATH}/plugins/upload`, AdminController.handle("uploadPlugin"));
  app.post(`${CMS_PATH}/plugins/toggle`, AdminController.handle("togglePlugin"));
  app.post(`${CMS_PATH}/plugins/delete`, AdminController.handle("deletePlugin"));
}
