import { CmsController } from "../app/Controllers/CmsController.js";
import { HomeController } from "../app/Controllers/HomeController.js";

export function registerWebRoutes(app) {
  app.get("/builder-style/:type/:slug", CmsController.handle("builderStyles"));
  app.get("/", CmsController.handle("home"));
  app.get("/post/:slug", CmsController.handle("post"));
  app.post("/post/:slug/comments", CmsController.handle("addComment"));
  app.get("/page/:slug", CmsController.handle("page"));
  app.get("/category/:slug", CmsController.handle("category"));
  app.get("/health", HomeController.handle("health"));
}
