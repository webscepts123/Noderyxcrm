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

  const pageBuilder = document.querySelector("#page-builder");
  if (pageBuilder) {
    const canvas = pageBuilder.querySelector("#builder-canvas");
    const empty = pageBuilder.querySelector("#builder-empty");
    let dragging = null;
    let newType = null;
    const refresh = () => { empty.hidden = canvas.querySelectorAll(".builder-block").length > 0; };
    const field = (className, placeholder, multiline = false) => {
      const element = document.createElement(multiline ? "textarea" : "input");
      element.className = className;
      element.placeholder = placeholder;
      if (multiline) element.rows = 5;
      return element;
    };
    const bind = (block) => {
      block.querySelector(".builder-remove").addEventListener("click", () => { block.remove(); refresh(); });
      block.querySelector(".builder-duplicate").addEventListener("click", () => addBlock(block.dataset.type, { text: block.querySelector(".block-text")?.value ?? "", url: block.querySelector(".block-url")?.value ?? "", alt: block.querySelector(".block-alt")?.value ?? "" }, block));
      block.addEventListener("dragstart", () => { dragging = block; block.classList.add("dragging"); });
      block.addEventListener("dragend", () => { dragging = null; block.classList.remove("dragging"); });
    };
    const addBlock = (type, values = {}, after = null) => {
      const block = document.createElement("article");
      block.className = "builder-block";
      block.draggable = true;
      block.dataset.id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      block.dataset.type = type;
      const head = document.createElement("div");
      head.className = "builder-block-head";
      const handle = document.createElement("span");
      handle.className = "drag-handle";
      handle.textContent = "⋮⋮";
      const title = document.createElement("strong");
      title.textContent = type;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger builder-remove";
      remove.textContent = "Remove";
      const actions = document.createElement("div");
      const duplicate = document.createElement("button");
      duplicate.type = "button";
      duplicate.className = "builder-duplicate";
      duplicate.textContent = "Duplicate";
      actions.append(duplicate, remove);
      head.append(handle, title, actions);
      block.append(head);
      const appendField = (className, placeholder, value, multiline = false) => { const element = field(className, placeholder, multiline); element.value = value ?? ""; block.append(element); };
      if (type === "hero") { appendField("block-text", "Hero headline", values.text); appendField("block-alt", "Hero supporting text", values.alt); appendField("block-url", "Background image URL (optional)", values.url); }
      if (type === "heading") appendField("block-text", "Section heading", values.text);
      if (type === "text") appendField("block-text", "Write your content", values.text, true);
      if (type === "image") { appendField("block-url", "Image URL", values.url); appendField("block-alt", "Alternative text", values.alt); }
      if (type === "button") { appendField("block-text", "Button label", values.text); appendField("block-url", "Button URL", values.url); }
      if (type === "columns") { appendField("block-text", "Left column content", values.text, true); appendField("block-alt", "Right column content", values.alt, true); }
      if (type === "quote") { appendField("block-text", "Quotation", values.text, true); appendField("block-alt", "Author", values.alt); }
      if (type === "divider") { const divider = document.createElement("div"); divider.className = "builder-divider"; block.append(divider); }
      if (type === "spacer") { const spacer = document.createElement("div"); spacer.className = "builder-spacer"; spacer.textContent = "Spacing"; block.append(spacer); }
      if (after?.nextSibling) canvas.insertBefore(block, after.nextSibling); else canvas.append(block);
      bind(block);
      refresh();
    };
    canvas.querySelectorAll(".builder-block").forEach(bind);
    canvas.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (!dragging) return;
      const siblings = [...canvas.querySelectorAll(".builder-block:not(.dragging)")];
      const after = siblings.find((block) => event.clientY <= block.getBoundingClientRect().top + block.offsetHeight / 2);
      canvas.insertBefore(dragging, after ?? null);
    });
    canvas.addEventListener("drop", (event) => { event.preventDefault(); if (newType) { addBlock(newType); newType = null; } });
    pageBuilder.querySelectorAll(".builder-add").forEach((button) => {
      button.addEventListener("click", () => addBlock(button.dataset.type));
      button.addEventListener("dragstart", () => { newType = button.dataset.type; });
      button.addEventListener("dragend", () => { newType = null; });
    });
    pageBuilder.querySelectorAll(".builder-device").forEach((button) => button.addEventListener("click", () => {
      pageBuilder.querySelectorAll(".builder-device").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      pageBuilder.querySelector(".builder-stage").dataset.width = button.dataset.width;
    }));
    pageBuilder.closest("form").addEventListener("submit", () => {
      const blocks = [...canvas.querySelectorAll(".builder-block")].map((block) => ({
        id: block.dataset.id,
        type: block.dataset.type,
        text: block.querySelector(".block-text")?.value.trim() ?? "",
        url: block.querySelector(".block-url")?.value.trim() ?? "",
        alt: block.querySelector(".block-alt")?.value.trim() ?? ""
      }));
      document.querySelector("#page-blocks-value").value = JSON.stringify(blocks);
      document.querySelector("#page-content-value").value = blocks.filter((block) => block.type === "heading" || block.type === "text").map((block) => block.text).join("\n\n");
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

  // 1. Make sure exactly one link reflects the current page.
  const here = location.pathname + location.search;
  const links = [...nav.querySelectorAll("a")];
  let active = nav.querySelector("a.active");
  if (!active) {
    active = links.find((a) => a.getAttribute("href") === here)
      || links
        .filter((a) => a.getAttribute("href") !== "/nodecms" && here.startsWith(a.getAttribute("href")))
        .sort((a, b) => b.getAttribute("href").length - a.getAttribute("href").length)[0]
      || (location.pathname === "/nodecms" ? links.find((a) => a.getAttribute("href") === "/nodecms") : null);
    if (active) active.classList.add("active");
  }
  if (active) active.setAttribute("aria-current", "page");

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
