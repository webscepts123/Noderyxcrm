import { Controller } from "noderyx-framework";

export class CmsController extends Controller {
  store() { return this.service("cms"); }
  themes() { return this.service("themes"); }
  redirect(location) { this.context.response.baseHeaders.location = location; return this.context.text("", 303); }
  async shared() { const data = await this.store().read(); const theme = this.themes().get(data.settings.theme); const fallback = [{ label: "Home", url: "/" }, ...data.posts.filter((p) => p.type === "page" && p.status === "published").map((page) => ({ label: page.title, url: `/page/${page.slug}` }))]; const settings = { ...data.settings, theme: theme.id, metaTitle: data.settings.metaTitle || `${data.settings.siteName} — ${data.settings.tagline}`, metaDescription: data.settings.metaDescription || data.settings.description, robots: data.settings.indexSite === false ? "noindex,nofollow" : "index,follow" }; return { settings, theme, user: this.context.session?.user ?? null, navigation: data.menus.find((menu) => menu.location === "primary")?.items?.length ? data.menus.find((menu) => menu.location === "primary").items : fallback }; }
  async home() { const shared = await this.shared(); return this.render(this.themes().view(shared.theme.id, "home"), { ...shared, posts: await this.store().publicPosts() }); }
  async post() { let post = await this.store().findPublished(this.params.slug, "post"); if (!post) return this.abort(404); const shared = await this.shared(); const data = await this.store().read(); post = { ...post, seoTitle: post.seoTitle || `${post.title} — ${shared.settings.siteName}`, seoDescription: post.seoDescription || post.excerpt }; return this.render(this.themes().view(shared.theme.id, "post"), { ...shared, post, comments: data.comments.filter((comment) => comment.postId === post.id && comment.status === "approved"), commentSent: this.query.comment === "pending", allowComments: true }); }
  async page() { let post = await this.store().findPublished(this.params.slug, "page"); if (!post) return this.abort(404); const shared = await this.shared(); post = { ...post, blocks: post.blocks?.length ? post.blocks : null, seoTitle: post.seoTitle || `${post.title} — ${shared.settings.siteName}`, seoDescription: post.seoDescription || post.excerpt }; return this.render(this.themes().view(shared.theme.id, "page"), { ...shared, post, comments: [], allowComments: false }); }
  async category() { const shared = await this.shared(); const all = await this.store().publicPosts(); const category = decodeURIComponent(this.params.slug); return this.render(this.themes().view(shared.theme.id, "home"), { ...shared, posts: all.filter((p) => p.categorySlug === category), categoryTitle: `Category: ${all.find((p) => p.categorySlug === category)?.category ?? category}` }); }
  async builderStyles() {
    if (!["post", "page"].includes(this.params.type)) return this.abort(404);
    const post = await this.store().findPublished(this.params.slug, this.params.type);
    if (!post) return this.abort(404);
    const css = (post.blocks ?? []).map(block => `.nvb-content[data-block-index="${block.index}"]{${block.css}}`).join("\n");
    return this.context.text(css, 200, "text/css; charset=utf-8");
  }
  async addComment() { const post = await this.store().findPublished(this.params.slug, "post"); if (!post) return this.abort(404); if (this.body.name && this.body.email && this.body.content) await this.store().addComment(post.id, this.body); return this.redirect(`/post/${post.slug}?comment=pending`); }
}
