(() => {
  // ---- Media library: drag & drop, multi-upload queue, copy-to-clipboard ----
  const grid = document.querySelector(".media-grid");
  const dropzone = document.querySelector("#media-dropzone");

  const showToast = (() => {
    let el;
    let timer;
    return (message) => {
      if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
      el.textContent = message;
      requestAnimationFrame(() => el.classList.add("show"));
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove("show"), 1800);
    };
  })();

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      area.remove();
      return ok;
    }
  };

  const sendMedia = (payload, csrf, onProgress) => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/nodecms/media");
    request.withCredentials = true;
    request.setRequestHeader("Content-Type", "application/json");
    request.setRequestHeader("X-CSRF-Token", csrf);
    if (request.upload && onProgress) {
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      });
    }
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 400) resolve();
      else reject(new Error(`Upload failed (${request.status})`));
    });
    request.addEventListener("error", () => reject(new Error("Network error")));
    request.send(JSON.stringify(payload));
  });

  const refreshGrid = async () => {
    if (!grid) return;
    try {
      const markup = await fetch("/nodecms/media", { credentials: "same-origin" }).then((response) => response.text());
      const fresh = new DOMParser().parseFromString(markup, "text/html").querySelector(".media-grid");
      if (fresh) grid.innerHTML = fresh.innerHTML;
    } catch { /* keep the current grid if the refresh fails */ }
  };

  // Copy the URL of any media item (delegated, so it survives a grid refresh).
  if (grid) {
    grid.addEventListener("click", async (event) => {
      const button = event.target.closest(".copy-btn");
      const image = event.target.closest("img");
      if (!button && !image) return;
      const field = (button || image).closest(".media-item")?.querySelector(".media-url-row input");
      if (!field) return;
      const copied = await copyText(field.value);
      showToast(copied ? "URL copied to clipboard" : "Press Ctrl/Cmd+C to copy");
      if (button && copied) {
        const label = button.textContent;
        button.textContent = "Copied!";
        button.classList.add("copied");
        setTimeout(() => { button.textContent = label; button.classList.remove("copied"); }, 1400);
      }
    });
  }

  // "Add from URL" without a full-page reload.
  const urlForm = document.querySelector("#media-url-form");
  if (urlForm) {
    urlForm.addEventListener("submit", async (event) => {
      if (typeof urlForm.reportValidity === "function" && !urlForm.reportValidity()) return;
      event.preventDefault();
      const submit = urlForm.querySelector('button[type="submit"]');
      const payload = {
        title: urlForm.elements.title.value.trim(),
        url: urlForm.elements.url.value.trim(),
        alt: urlForm.elements.alt.value.trim()
      };
      submit.disabled = true;
      try {
        await sendMedia(payload, urlForm.elements._csrf.value);
        urlForm.reset();
        await refreshGrid();
        showToast("Added from URL");
      } catch (error) {
        showToast(error.message || "Could not add media");
      } finally {
        submit.disabled = false;
      }
    });
  }

  if (dropzone) {
    const fileInput = dropzone.querySelector("#media-files");
    const browse = dropzone.querySelector("#media-browse");
    const csrf = dropzone.querySelector('[name="_csrf"]').value;
    const panel = document.querySelector("#upload-queue");
    const list = document.querySelector("#upload-queue-list");
    const heading = document.querySelector("#upload-queue-title");
    const startButton = document.querySelector("#upload-start");
    const clearButton = document.querySelector("#upload-clear");
    const queue = [];
    let busy = false;

    const readDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsDataURL(file);
    });

    const syncHeading = () => {
      const waiting = queue.filter((entry) => entry.state === "waiting").length;
      if (busy) {
        const finished = queue.filter((entry) => entry.state === "done" || entry.state === "error").length;
        heading.textContent = `Uploading… ${finished}/${queue.length}`;
      } else if (waiting) {
        heading.textContent = `${waiting} image${waiting === 1 ? "" : "s"} ready to upload`;
      } else {
        heading.textContent = queue.length ? "Upload complete" : "Ready to upload";
      }
      startButton.disabled = busy || waiting === 0;
      clearButton.disabled = busy;
    };

    const removeEntry = (entry) => {
      if (entry.state === "uploading") return;
      const index = queue.indexOf(entry);
      if (index > -1) queue.splice(index, 1);
      entry.card.remove();
      if (!queue.length) panel.hidden = true;
      syncHeading();
    };

    const addFiles = (files) => {
      const images = [...files].filter((file) => /^image\//.test(file.type));
      if (!images.length) return;
      for (const file of images) {
        const card = document.createElement("div");
        card.className = "uq-item";

        const thumb = document.createElement("img");
        thumb.className = "uq-thumb";
        thumb.alt = "";
        thumb.src = URL.createObjectURL(file);
        thumb.addEventListener("load", () => URL.revokeObjectURL(thumb.src), { once: true });

        const meta = document.createElement("div");
        meta.className = "uq-meta";
        const name = document.createElement("div");
        name.className = "uq-name";
        name.textContent = file.name;
        const status = document.createElement("div");
        status.className = "uq-status";
        status.textContent = "Ready";
        const track = document.createElement("div");
        track.className = "uq-progress";
        const bar = document.createElement("div");
        bar.className = "uq-bar";
        track.appendChild(bar);
        meta.append(name, status, track);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "uq-remove";
        remove.setAttribute("aria-label", `Remove ${file.name}`);
        remove.textContent = "×";

        card.append(thumb, meta, remove);
        list.appendChild(card);

        const entry = { file, card, status, bar, state: "waiting" };
        remove.addEventListener("click", () => removeEntry(entry));
        queue.push(entry);
      }
      panel.hidden = false;
      syncHeading();
      panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };

    const uploadAll = async () => {
      if (busy) return;
      busy = true;
      syncHeading();
      for (const entry of queue) {
        if (entry.state !== "waiting") continue;
        entry.state = "uploading";
        entry.card.classList.add("uploading");
        entry.status.textContent = "Uploading…";
        try {
          const dataUrl = await readDataUrl(entry.file);
          await sendMedia(
            { filename: entry.file.name, title: entry.file.name.replace(/\.[^.]+$/, ""), alt: "", dataUrl },
            csrf,
            (ratio) => { entry.bar.style.width = `${Math.round(ratio * 100)}%`; }
          );
          entry.state = "done";
          entry.card.classList.replace("uploading", "done");
          entry.status.textContent = "Uploaded";
        } catch (error) {
          entry.state = "error";
          entry.card.classList.replace("uploading", "error");
          entry.status.textContent = error.message || "Failed";
        }
        syncHeading();
      }
      busy = false;
      await refreshGrid();
      const done = queue.filter((entry) => entry.state === "done").length;
      const failed = queue.filter((entry) => entry.state === "error").length;
      if (done) showToast(`${done} image${done === 1 ? "" : "s"} added${failed ? `, ${failed} failed` : ""}`);
      else if (failed) showToast(`${failed} upload${failed === 1 ? "" : "s"} failed`);
      setTimeout(() => {
        for (const entry of [...queue]) if (entry.state === "done") removeEntry(entry);
      }, 1200);
      syncHeading();
    };

    browse.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("click", (event) => {
      if (event.target.closest("button") || event.target === fileInput) return;
      fileInput.click();
    });
    fileInput.addEventListener("change", () => { addFiles(fileInput.files); fileInput.value = ""; });

    let dragDepth = 0;
    dropzone.addEventListener("dragenter", (event) => { event.preventDefault(); dragDepth += 1; dropzone.classList.add("is-dragover"); });
    dropzone.addEventListener("dragover", (event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"; });
    dropzone.addEventListener("dragleave", (event) => { event.preventDefault(); dragDepth -= 1; if (dragDepth <= 0) { dragDepth = 0; dropzone.classList.remove("is-dragover"); } });
    dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      dragDepth = 0;
      dropzone.classList.remove("is-dragover");
      if (event.dataTransfer && event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
    });

    // Don't let a file dropped outside the zone navigate the page away.
    window.addEventListener("dragover", (event) => { if (!dropzone.contains(event.target)) event.preventDefault(); });
    window.addEventListener("drop", (event) => { if (!dropzone.contains(event.target)) event.preventDefault(); });

    // Paste an image straight from the clipboard.
    document.addEventListener("paste", (event) => {
      const files = [...(event.clipboardData?.files ?? [])].filter((file) => /^image\//.test(file.type));
      if (files.length) { event.preventDefault(); addFiles(files); }
    });

    startButton.addEventListener("click", uploadAll);
    clearButton.addEventListener("click", () => { for (const entry of [...queue]) removeEntry(entry); });
  }

  for (const upload of document.querySelectorAll(".archive-upload-form")) {
    upload.addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = upload.elements.archive.files[0];
      const message = upload.querySelector(".upload-message");
      if (!file) return;
      message.textContent = "Uploading…";
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const response = await fetch(upload.action, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": upload.elements._csrf.value },
        body: JSON.stringify({ filename: file.name, dataUrl })
      });
      const result = await response.json().catch(() => ({ error: "Upload failed" }));
      if (!response.ok) { message.textContent = result.error || "Upload failed"; return; }
      location.assign(upload.dataset.redirect);
    });
  }

  const menuBuilder = document.querySelector("#menu-builder");
  if (menuBuilder) {
    const sortable = menuBuilder.querySelector("#menu-sortable");
    const empty = menuBuilder.querySelector("#menu-empty");
    const count = menuBuilder.querySelector("#menu-item-count");
    let dragging = null;

    const refresh = () => {
      const total = sortable.querySelectorAll(".menu-item").length;
      empty.hidden = total > 0;
      count.textContent = `${total} item${total === 1 ? "" : "s"}`;
    };
    const bind = (item) => {
      item.querySelector(".menu-remove").addEventListener("click", () => { item.remove(); refresh(); });
      item.addEventListener("dragstart", () => { dragging = item; item.classList.add("dragging"); });
      item.addEventListener("dragend", () => { dragging = null; item.classList.remove("dragging"); refresh(); });
    };
    const addItem = (label, url) => {
      const item = document.createElement("div");
      item.className = "menu-item";
      item.draggable = true;
      const handle = document.createElement("span");
      handle.className = "drag-handle";
      handle.textContent = "⋮⋮";
      const fields = document.createElement("div");
      fields.className = "menu-item-fields";
      const labelInput = document.createElement("input");
      labelInput.className = "menu-label";
      labelInput.value = label;
      labelInput.setAttribute("aria-label", "Menu label");
      const urlInput = document.createElement("input");
      urlInput.className = "menu-url";
      urlInput.value = url;
      urlInput.setAttribute("aria-label", "Menu URL");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger menu-remove";
      remove.textContent = "Remove";
      fields.append(labelInput, urlInput);
      item.append(handle, fields, remove);
      sortable.append(item);
      bind(item);
      refresh();
    };

    sortable.querySelectorAll(".menu-item").forEach(bind);
    sortable.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (!dragging) return;
      const siblings = [...sortable.querySelectorAll(".menu-item:not(.dragging)")];
      const after = siblings.find((item) => event.clientY <= item.getBoundingClientRect().top + item.offsetHeight / 2);
      sortable.insertBefore(dragging, after ?? null);
    });
    document.querySelectorAll(".menu-add-existing").forEach((button) => button.addEventListener("click", () => addItem(button.dataset.label, button.dataset.url)));
    menuBuilder.querySelector("#add-custom-menu-item").addEventListener("click", () => {
      const label = menuBuilder.querySelector("#custom-menu-label");
      const url = menuBuilder.querySelector("#custom-menu-url");
      if (!label.value.trim() || !url.value.trim()) return;
      addItem(label.value.trim(), url.value.trim());
      label.value = "";
      url.value = "";
    });
    menuBuilder.addEventListener("submit", () => {
      menuBuilder.elements.items.value = JSON.stringify([...sortable.querySelectorAll(".menu-item")].map((item) => ({ label: item.querySelector(".menu-label").value.trim(), url: item.querySelector(".menu-url").value.trim() })).filter((item) => item.label && item.url));
    });
    refresh();
  }

  const integrationsForm = document.querySelector("#integrations-form");
  if (integrationsForm) {
    const groups = [...integrationsForm.querySelectorAll(".integration-group")];
    const STORAGE_KEY = "nodecms:integrations:open";
    let remembered = [];
    try { remembered = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { remembered = []; }

    const persist = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(groups.filter((group) => group.classList.contains("open")).map((group) => group.dataset.key)));
      } catch { /* storage unavailable; open state is per-visit only */ }
    };
    const setOpen = (group, open) => {
      group.classList.toggle("open", open);
      group.querySelector(".integration-toggle").setAttribute("aria-expanded", String(open));
    };

    for (const group of groups) {
      const toggle = group.querySelector(".integration-toggle");
      const startOpen = remembered.includes(group.dataset.key);
      setOpen(group, startOpen);
      toggle.addEventListener("click", () => {
        setOpen(group, !group.classList.contains("open"));
        persist();
      });
    }

    // If nothing was remembered, open the first provider that still needs setup.
    if (!groups.some((group) => group.classList.contains("open"))) {
      const pending = groups.find((group) => group.querySelector(".tag.off")) || groups[0];
      if (pending) setOpen(pending, true);
    }

    integrationsForm.addEventListener("submit", persist);
  }
})();

/* ----------------------------------------------------------------------
   Sidebar: interactive navigation (icons are styled in cms.css).
   Progressive enhancement — the nav still works with this script absent.
   ---------------------------------------------------------------------- */
(() => {
  const sidebar = document.querySelector(".sidebar");
  const nav = document.querySelector(".admin-nav");
  if (!sidebar || !nav) return;

  const STORE = "nodecms:nav";
  const state = (() => {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
  })();
  const save = () => {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* per-visit only */ }
  };

  // 1. Make sure exactly one link reflects the current page. The server
  // already renders the correct link as active for every screen (it alone
  // knows things like editing a page vs. a post from a query string), so a
  // server-rendered choice whose path is still relevant here is kept as-is;
  // this only computes a guess when the server left nothing active.
  const links = [...nav.querySelectorAll("a")];
  let active;
  const updateActive = () => {
    const here = location.pathname + location.search + location.hash;
    const rendered = links.find(a => a.classList.contains("active"));
    const renderedPath = rendered ? new URL(rendered.getAttribute("href"), location.origin).pathname : null;
    const renderedStillRelevant = rendered && (location.pathname === renderedPath || location.pathname.startsWith(renderedPath + "/"));
    active = links.find(a => a.getAttribute("href") === here)
      || (renderedStillRelevant ? rendered : null)
      || links.filter(a => {
        const href = a.getAttribute("href");
        return href !== "/" && href !== "/nodecms" && (here.startsWith(href + "/") || here.startsWith(href + "?") || here.startsWith(href + "#"));
      }).sort((a, b) => b.getAttribute("href").length - a.getAttribute("href").length)[0];
    for (const link of links) {
      link.classList.toggle("active", link === active);
      if (link === active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  };
  updateActive();
  window.addEventListener("hashchange", updateActive);

  // 2. Turn each "Content / Appearance / System" heading into a collapsible group.
  const sections = [...nav.querySelectorAll(".nav-section")];
  sections.forEach((heading, i) => {
    const key = "sec:" + (heading.textContent || String(i)).trim().toLowerCase();
    const group = document.createElement("div");
    group.className = "nav-group";
    const inner = document.createElement("div");
    inner.className = "nav-group-inner";
    group.append(inner);

    let node = heading.nextElementSibling;
    while (node && !node.classList.contains("nav-section")) {
      const next = node.nextElementSibling;
      inner.append(node);
      node = next;
    }
    heading.after(group);

    const holdsActive = Boolean(inner.querySelector("a.active"));
    let collapsed = state[key] === true && !holdsActive;

    heading.setAttribute("role", "button");
    heading.setAttribute("tabindex", "0");
    const apply = () => {
      heading.classList.toggle("collapsed", collapsed);
      group.classList.toggle("collapsed", collapsed);
      heading.setAttribute("aria-expanded", String(!collapsed));
    };
    const toggle = () => { collapsed = !collapsed; state[key] = collapsed; save(); apply(); };
    apply();
    heading.addEventListener("click", toggle);
    heading.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); }
    });
  });

  // 3. Collapse the sidebar to an icon-only rail.
  const railButton = document.createElement("button");
  railButton.type = "button";
  railButton.className = "nrx-rail-toggle";
  sidebar.append(railButton);
  const applyRail = () => {
    const on = state.rail === true;
    document.body.classList.toggle("nrx-rail", on);
    railButton.setAttribute("aria-pressed", String(on));
    railButton.setAttribute("aria-label", on ? "Expand sidebar" : "Collapse sidebar");
    railButton.title = on ? "Expand sidebar" : "Collapse sidebar";
    for (const link of links) if (!link.title) link.title = link.textContent.trim();
  };
  applyRail();
  railButton.addEventListener("click", () => { state.rail = state.rail !== true; save(); applyRail(); });

  // 4. Off-canvas drawer for narrow screens.
  const navToggle = document.createElement("button");
  navToggle.type = "button";
  navToggle.className = "nrx-nav-toggle";
  navToggle.setAttribute("aria-label", "Open navigation");
  navToggle.setAttribute("aria-expanded", "false");
  const scrim = document.createElement("div");
  scrim.className = "nrx-scrim";
  document.body.append(navToggle, scrim);

  const setDrawer = (open) => {
    document.body.classList.toggle("nrx-nav-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  };
  navToggle.addEventListener("click", () => setDrawer(!document.body.classList.contains("nrx-nav-open")));
  scrim.addEventListener("click", () => setDrawer(false));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") setDrawer(false); });
  const narrow = window.matchMedia("(max-width: 900px)");
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a") && narrow.matches) setDrawer(false);
  });

  // 5. Roving arrow-key focus through the visible links.
  nav.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const visible = links.filter((a) => a.offsetParent !== null);
    const index = visible.indexOf(document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    visible[(index + step + visible.length) % visible.length].focus();
  });

  // 6. Keep the active item in view within a scrolled sidebar.
  if (active) active.scrollIntoView({ block: "nearest" });
})();

// Workspace preferences and content tools. All content actions keep their existing routes.
(() => {
  const main = document.querySelector('.admin-main');
  if (!main) return;
  const create = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };
  let preferences = {};
  try { preferences = JSON.parse(localStorage.getItem('nodecms:workspace')) || {}; } catch { /* Defaults work without storage. */ }
  const save = () => { try { localStorage.setItem('nodecms:workspace', JSON.stringify(preferences)); } catch { /* Session only. */ } };
  const options = create('details', 'screen-options');
  options.append(create('summary', '', 'Screen options'));
  const fields = create('div', 'screen-fields');
  const densityLabel = create('label', '', 'Table density');
  const density = create('select');
  for (const [value, label] of [['comfortable', 'Comfortable'], ['compact', 'Compact']]) {
    const option = create('option', '', label); option.value = value; density.append(option);
  }
  density.value = preferences.density === 'compact' ? 'compact' : 'comfortable';
  const applyDensity = () => document.body.classList.toggle('compact', density.value === 'compact');
  applyDensity();
  density.addEventListener('change', () => { preferences.density = density.value; save(); applyDensity(); });
  densityLabel.append(density); fields.append(densityLabel);
  for (const [selector, title, key] of [['.welcome-panel', 'Welcome panel', 'welcome'], ['.stats', 'Site overview', 'stats'], ['.dashboard-tools', 'Management shortcuts', 'tools']]) {
    const target = main.querySelector(selector);
    if (!target) continue;
    const label = create('label', '', title);
    const checkbox = create('input'); checkbox.type = 'checkbox'; checkbox.checked = preferences[key] !== false;
    target.hidden = !checkbox.checked;
    checkbox.addEventListener('change', () => { target.hidden = !checkbox.checked; preferences[key] = checkbox.checked; save(); });
    label.prepend(checkbox); fields.append(label);
  }
  options.append(fields); main.querySelector('.admin-top')?.after(options);
  document.querySelectorAll('.status').forEach(el => { el.dataset.status = el.textContent.trim().toLowerCase(); });
  main.querySelectorAll('.admin-table').forEach(table => {
    const body = table.querySelector('.table-body');
    if (!body) return;
    const rows = [...body.querySelectorAll(':scope > .table-row')];
    const controls = create('div', 'table-controls');
    const search = create('input'); search.type = 'search'; search.placeholder = 'Search this list…'; search.setAttribute('aria-label', 'Search this list');
    const status = create('select'); status.setAttribute('aria-label', 'Filter by status');
    const all = create('option', '', 'All statuses'); all.value = ''; status.append(all);
    const statuses = [...new Set(rows.map(row => row.querySelector('.status')?.textContent.trim()).filter(Boolean))];
    statuses.forEach(value => { const option = create('option', '', value); option.value = value; status.append(option); });
    const sort = create('select'); sort.setAttribute('aria-label', 'Sort content');
    for (const [value, label] of [['default', 'Default order'], ['az', 'Title: A–Z'], ['za', 'Title: Z–A']]) { const option = create('option', '', label); option.value = value; sort.append(option); }
    const count = create('span', 'table-count'); count.setAttribute('aria-live', 'polite');
    controls.append(search); if (statuses.length) controls.append(status); controls.append(sort, count);
    const wrapper = table.closest('.table-wrap') || table;
    wrapper.before(controls);
    const empty = create('p', 'table-empty', 'No content matches your search.'); empty.hidden = true; wrapper.after(empty);
    const pagination = create('div', 'table-pagination');
    const previous = create('button', 'ghost', '← Previous'); previous.type = 'button';
    const next = create('button', 'ghost', 'Next →'); next.type = 'button';
    const pageLabel = create('span', 'table-count');
    pagination.append(previous, pageLabel, next); empty.after(pagination);
    let page = 1;
    const render = () => {
      const query = search.value.trim().toLowerCase();
      const filtered = rows.filter(row => row.textContent.toLowerCase().includes(query) && (!status.value || row.querySelector('.status')?.textContent.trim() === status.value));
      if (sort.value !== 'default') filtered.sort((a, b) => (a.querySelector('.cell')?.textContent || '').localeCompare(b.querySelector('.cell')?.textContent || '') * (sort.value === 'za' ? -1 : 1));
      const pages = Math.max(1, Math.ceil(filtered.length / 10)); page = Math.min(page, pages);
      rows.forEach(row => { row.hidden = true; });
      filtered.slice((page - 1) * 10, page * 10).forEach(row => { row.hidden = false; body.append(row); });
      count.textContent = `${filtered.length} item${filtered.length === 1 ? '' : 's'}`;
      empty.hidden = filtered.length !== 0; pagination.hidden = filtered.length <= 10;
      pageLabel.textContent = `Page ${page} of ${pages}`; previous.disabled = page <= 1; next.disabled = page >= pages;
    };
    search.addEventListener('input', () => { page = 1; render(); });
    status.addEventListener('change', () => { page = 1; render(); });
    sort.addEventListener('change', () => { page = 1; render(); });
    previous.addEventListener('click', () => { page--; render(); }); next.addEventListener('click', () => { page++; render(); }); render();
  });
  const footer = create('footer', 'admin-footer');
  footer.append(create('span', '', 'Built for publishing. Powered by Noderyx.'), create('span', '', 'CMS workspace'));
  main.append(footer);
})();

// Confirm irreversible workspace deletions without affecting other CMS forms.
document.querySelectorAll('form[data-confirm]').forEach(form => {
  form.addEventListener('submit', event => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  });
});

// Plugins screen: instant search across installed plugins and delete confirmation.
(() => {
  const search = document.querySelector('#plugin-search');
  const rows = [...document.querySelectorAll('.plugin-row')];
  const noMatch = document.querySelector('.plugin-nomatch');
  if (search && rows.length) {
    search.addEventListener('input', () => {
      const terms = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const row of rows) {
        const match = terms.every((term) => (row.dataset.search || '').includes(term));
        row.hidden = !match;
        if (match) shown += 1;
      }
      if (noMatch) noMatch.hidden = shown > 0;
    });
  }
  for (const form of document.querySelectorAll('.plugin-delete')) {
    form.addEventListener('submit', (event) => {
      if (!confirm(`Delete "${form.dataset.name}" and all of its files? This cannot be undone.`)) event.preventDefault();
    });
  }
  const upload = document.querySelector('#add-plugin');
  const toggle = upload?.querySelector('.plugin-upload-toggle');
  if (upload && toggle) {
    const setOpen = (open) => {
      upload.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      if (open) upload.querySelector('input[type=file]')?.focus();
    };
    toggle.addEventListener('click', () => setOpen(!upload.classList.contains('is-open')));
    if (location.hash === '#add-plugin') setOpen(true);
  }
})();
