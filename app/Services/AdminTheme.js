import { ADMIN_APPEARANCE_DEFAULTS } from "./CmsStore.js";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Build the admin branding stylesheet served at /admin-theme.css.
 *
 * The CSP only allows same-origin stylesheets (no inline styles), so branding
 * is delivered as a real stylesheet loaded after cms.css / cms-workspace.css.
 * Every value is re-checked against a strict hex pattern so a hand-edited
 * storage file can never inject arbitrary CSS.
 */
export function buildAdminThemeCss(appearance = {}) {
  const c = {};
  for (const [key, fallback] of Object.entries(ADMIN_APPEARANCE_DEFAULTS)) {
    if (!HEX_COLOR.test(String(fallback))) continue;
    c[key] = HEX_COLOR.test(String(appearance[key] ?? "")) ? appearance[key] : fallback;
  }
  const soft = (color, amount) => `color-mix(in srgb, ${color} ${amount}%, transparent)`;

  return `/* Generated from Admin settings → Appearance. */
:root{--accent:${c.accentColor};--dark:${c.sidebarBg}}

/* Sidebar menu */
.sidebar{background:${c.sidebarBg};color:${c.sidebarText}}
.admin-brand{color:${c.sidebarText}}
.admin-brand::before,.admin-brand:hover::before{background-color:${c.sidebarActive}}
.admin-nav a{color:${soft(c.sidebarText, 88)}}
.admin-nav a:hover,.admin-nav .active{background:${soft(c.sidebarText, 10)};color:${c.sidebarText}}
.admin-nav a.active::after{background:${c.sidebarActive}}
.nav-section,.admin-nav .nav-section{color:${soft(c.sidebarText, 55)}}
.admin-nav .nav-section:hover{color:${soft(c.sidebarText, 85)}}
.logout button{color:${soft(c.sidebarText, 75)}}
.nrx-nav-toggle{background:${c.sidebarBg};color:${c.sidebarText}}
.admin-brand.has-logo::before{display:none}
.admin-logo{display:block;max-height:40px;max-width:180px;width:auto;object-fit:contain}
.nrx-rail .admin-logo{max-width:44px;max-height:32px}

/* Top toolbar */
.cms-toolbar{background:${c.toolbarBg};color:${c.toolbarText}}
.toolbar-label{color:${soft(c.toolbarText, 70)}}
.toolbar-user{border-left-color:${soft(c.toolbarText, 25)}}

/* Login screen */
.login-body{background:linear-gradient(135deg,${c.loginBg},${c.loginBgEnd})}
.login-card{background:${c.loginCardBg};color:${c.loginText}}
.login-card .muted,.login-card .back-link{color:${soft(c.loginText, 65)}}
.login-logo{display:flex;align-items:center;justify-content:center;gap:12px;color:${c.loginText}}
.login-logo img{max-height:64px;max-width:240px;width:auto;object-fit:contain}

/* Dashboard widgets */
.dashboard-page .stat{background:${c.widgetBg};color:${c.widgetText};border-color:${soft(c.widgetText, 12)}}
.dashboard-page .stat span{color:${soft(c.widgetText, 65)}}
.dashboard-page .stat strong{color:${c.widgetAccent}}
.dashboard-page .panel{background:${c.widgetBg};color:${c.widgetText};border-color:${soft(c.widgetText, 12)}}
.dashboard-page .panel .muted{color:${soft(c.widgetText, 65)}}
.dashboard-page .panel-head a,.dashboard-page .tool-link{color:${c.widgetAccent}}
.dashboard-page .welcome-panel{background:${c.welcomeBg};color:${c.welcomeText};border-left-color:${c.widgetAccent}}
.dashboard-page .welcome-panel .kicker,.dashboard-page .welcome-link{color:${c.widgetAccent}}
.dashboard-page .welcome-panel p:not(.kicker){color:${soft(c.welcomeText, 72)}}
`;
}
