import { Controller } from "noderyx-framework";

export class HomeController extends Controller {
  async index() {
    return this.render("home", {
      siteName: process.env.SITE_NAME ?? "noderyxcrm",
      siteUrl: process.env.SITE_URL ?? "http://localhost:3000",
      description: process.env.SITE_DESCRIPTION ?? "Built with Noderyx Framework."
    });
  }

  async health() {
    return this.json({ status: "ok", runtime: "Node.js" });
  }
}
