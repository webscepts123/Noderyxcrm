import { ai, loadEnvironment, loadPackages, noderyx } from "noderyx-framework";
import { fileURLToPath } from "node:url";
import { CmsStore } from "./app/Services/CmsStore.js";
import { ThemeManager } from "./app/Services/ThemeManager.js";
import { PluginManager } from "./app/Services/PluginManager.js";
import { ArchiveInstaller } from "./app/Services/ArchiveInstaller.js";
import { registerCmsRoutes, requireCmsAuthentication } from "./routes/cms.js";
import { registerWebRoutes } from "./routes/web.js";

loadEnvironment();
const { default: config } = await import("./noderyx.config.js");

const app = noderyx({
  requireAppKey: true,
  name: config.app.name,
  environment: config.app.environment,
  debug: config.app.debug,
  cache: config.cache,
  views: fileURLToPath(new URL("./resources/views", import.meta.url)),
  public: fileURLToPath(new URL("./public", import.meta.url)),
  security: {
    ...config.security,
    cors: config.security.cors.length
      ? { origins: config.security.cors, credentials: true }
      : null
  }
});

app.provide("ai", ai(config.ai));
app.provide("cms", await new CmsStore().initialize());
app.provide("themes", new ThemeManager());
app.provide("plugins", new PluginManager(config.packages));
app.provide("archives", new ArchiveInstaller());

app.use(requireCmsAuthentication);
registerWebRoutes(app);
registerCmsRoutes(app);
await loadPackages(app, config.packages, { config });

// Phusion Passenger (cPanel) may hand the application a unix socket path in
// PORT instead of a number, so only treat a numeric value as a TCP port.
const requestedPort = String(process.env.PORT ?? 3000);
const socketPath = /^\d+$/.test(requestedPort) ? null : requestedPort;
const host = process.env.HOST ?? "0.0.0.0";

if (socketPath) app.listen(socketPath, () => console.log(`Listening on ${socketPath}`));
else app.listen(Number(requestedPort), host, () => console.log(`Running at http://localhost:${requestedPort}`));
