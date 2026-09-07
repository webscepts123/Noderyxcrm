import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BUILT_IN_THEMES = Object.freeze({
  default: {
    id: "default",
    name: "Noderyx Journal",
    description: "The clean, responsive publishing theme included with Noderyx CMS.",
    views: { home: "site/home", post: "site/post", page: "site/post" },
    stylesheet: "/public/cms.css"
  },
  minimal: {
    id: "minimal",
    name: "Noderyx Minimal",
    description: "A crisp, typography-first theme for portfolios and publications.",
    views: { home: "site/home", post: "site/post", page: "site/post" },
    stylesheet: "/public/theme-minimal.css"
  }
});

export class ThemeManager {
  constructor(directory = join(process.cwd(), "storage", "themes")) {
    this.themes = { ...BUILT_IN_THEMES };
    try {
      for (const file of readdirSync(directory).filter((name) => name.endsWith(".json"))) this.register(JSON.parse(readFileSync(join(directory, file), "utf8")));
    } catch {}
  }

  register(theme) { if (theme?.id) this.themes[theme.id] = theme; return theme; }
  all() { return Object.values(this.themes); }

  has(id) { return Boolean(this.themes[id]); }

  get(id = "default") {
    return this.themes[id] ?? this.themes.default;
  }

  view(id, template) {
    const theme = this.get(id);
    return theme.views[template] ?? this.themes.default.views[template];
  }
}
