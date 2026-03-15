export const UI_SHELL_CLIENT = `
(() => {
  const flatNav = JSON.parse(document.body.dataset.shellNav || "[]");
  const toastWrap = document.getElementById("toast-wrap");
  const live = document.getElementById("global-live");
  const shortcut = document.getElementById("shortcut-help");
  const shortcutCard = shortcut instanceof HTMLElement ? shortcut.querySelector(".shortcut-card") : null;
  const openShortcut = document.getElementById("shortcut-open");
  const closeShortcut = document.getElementById("shortcut-close");
  const shellCurrentObject = document.getElementById("shell-current-object");
  const shellCurrentState = document.getElementById("shell-current-state");
  const shellLiveClock = document.getElementById("shell-live-clock");
  const shellPageGroup = document.getElementById("shell-page-group");
  const shellPagePath = document.getElementById("shell-page-path");
  const shellPageObject = document.getElementById("shell-page-object");
  const shellPageSummary = document.getElementById("shell-page-summary");
  const shellFilterState = document.getElementById("shell-filter-state");
  const shellAlertState = document.getElementById("shell-alert-state");
  const shellRecoveryState = document.getElementById("shell-recovery-state");
  const shellPrimaryAction = document.getElementById("shell-primary-action");
  const shellPrimaryLabel = document.getElementById("shell-primary-label");
  const shellFilterAction = document.getElementById("shell-filter-action");
  const shellCopyLink = document.getElementById("shell-copy-link");
  const shellFilterChip = document.getElementById("shell-filter-chip");
  const shellAlertChip = document.getElementById("shell-alert-chip");
  const filterBindings = [];
  const focusableSelector = "a[href],button:not([disabled]),textarea:not([disabled]),input:not([type='hidden']):not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])";
  let lastShortcutFocus = null;
  let liveTimer = null;
  let pendingGo = "";
  const cleanText = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const shorten = (value, max = 40) => {
    const text = cleanText(value);
    return text.length > max ? text.slice(0, Math.max(0, max - 3)).trimEnd() + "..." : text;
  };
  const setText = (node, text) => {
    if (node instanceof HTMLElement) node.textContent = text;
  };
  const speak = (text) => {
    if (!(live instanceof HTMLElement)) return;
    if (liveTimer !== null) window.clearTimeout(liveTimer);
    live.textContent = "";
    liveTimer = window.setTimeout(() => {
      live.textContent = text;
    }, 20);
  };
  const toast = (title, message, tone = "ok", timeoutMs = 5000) => {
    if (!(toastWrap instanceof HTMLElement)) return;
    const node = document.createElement("div");
    const titleNode = document.createElement("div");
    const messageNode = document.createElement("div");
    node.className = "toast " + tone;
    titleNode.className = "title";
    titleNode.textContent = title;
    messageNode.textContent = message;
    node.append(titleNode, messageNode);
    toastWrap.appendChild(node);
    while (toastWrap.children.length > 4) toastWrap.firstElementChild?.remove();
    speak(title + ". " + message);
    window.setTimeout(() => node.remove(), timeoutMs);
  };
  window.__ecsToast = toast;
  window.__ecsSpeak = speak;
  const classifyError = (msg) => {
    const text = String(msg || "").toLowerCase();
    if (text.includes("503") || text.includes("unavailable") || text.includes("redis") || text.includes("queue")) {
      return { label: "Service unavailable", tone: "bad", recovery: "Inspect Health, queue state, and recent jobs before rerunning." };
    }
    if (text.includes("404") || text.includes("not found") || text.includes("missing")) {
      return { label: "Object missing", tone: "warn", recovery: "Check the current object id and linked artifacts before rerunning." };
    }
    if (text.includes("400") || text.includes("required") || text.includes("validation") || text.includes("invalid")) {
      return { label: "Invalid input", tone: "warn", recovery: "Correct the required fields, then rerun the action." };
    }
    return { label: "Action failed", tone: "bad", recovery: "Use Jobs and Health to trace the failing dependency or payload." };
  };
  const getFocusable = (scope) => Array.from(scope.querySelectorAll(focusableSelector)).filter((node) => node instanceof HTMLElement && !node.hidden && window.getComputedStyle(node).display !== "none");
  const openDialog = () => {
    if (!(shortcut instanceof HTMLElement)) return;
    lastShortcutFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    shortcut.classList.add("open");
    shortcut.style.display = "flex";
    shortcut.setAttribute("aria-hidden", "false");
    if (openShortcut instanceof HTMLButtonElement) openShortcut.setAttribute("aria-expanded", "true");
    document.body.dataset.dialogOpen = "1";
    const focusTarget = shortcutCard instanceof HTMLElement ? getFocusable(shortcutCard)[0] : null;
    if (focusTarget instanceof HTMLElement) focusTarget.focus();
    else if (shortcutCard instanceof HTMLElement) shortcutCard.focus();
  };
  const closeDialog = () => {
    if (!(shortcut instanceof HTMLElement)) return;
    shortcut.classList.remove("open");
    shortcut.style.display = "";
    shortcut.setAttribute("aria-hidden", "true");
    if (openShortcut instanceof HTMLButtonElement) openShortcut.setAttribute("aria-expanded", "false");
    delete document.body.dataset.dialogOpen;
    if (lastShortcutFocus instanceof HTMLElement) lastShortcutFocus.focus();
  };
  if (openShortcut instanceof HTMLButtonElement) {
    openShortcut.addEventListener("click", () => {
      if (shortcut instanceof HTMLElement && shortcut.classList.contains("open")) closeDialog();
      else openDialog();
    });
  }
  if (closeShortcut instanceof HTMLButtonElement) closeShortcut.addEventListener("click", closeDialog);
  if (shortcut instanceof HTMLElement) shortcut.addEventListener("click", (event) => {
    if (event.target === shortcut) closeDialog();
  });
  if (shortcutCard instanceof HTMLElement) {
    shortcutCard.setAttribute("tabindex", "-1");
    shortcutCard.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable(shortcutCard);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }
  const activeNav = (pathname) => flatNav
    .slice()
    .sort((a, b) => String(b.href || "").length - String(a.href || "").length)
    .find((item) => String(item.href || "") === "/ui" ? pathname === "/ui" : pathname === item.href || pathname.startsWith(String(item.href || "") + "/")) || null;
  const describeObject = (url) => {
    const queryPairs = [["episodeId", "Episode"], ["assetId", "Asset"], ["jobId", "Job"], ["characterPackId", "Pack"], ["path", "Artifact"]];
    for (const [key, label] of queryPairs) {
      const value = cleanText(url.searchParams.get(key));
      if (value) return label + " " + shorten(value, 48);
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] !== "ui") return "No scoped object";
    if (segments[1] === "jobs" && segments[2]) return "Job " + shorten(segments[2], 48);
    if (segments[1] === "episodes" && segments[2]) {
      const suffix = segments[3] === "editor" ? " / editor" : segments[3] === "ab-compare" ? " / compare" : "";
      return "Episode " + shorten(segments[2], 48) + suffix;
    }
    if (segments[1] === "characters" && segments[2]) return "Character scope " + shorten(segments.slice(2).join("/"), 48);
    if (segments[1] === "rollouts" && segments[2]) return "Artifact evidence";
    if (segments[1] === "benchmarks" && segments[2]) return "Benchmark evidence";
    return "No scoped object";
  };
  const hasInlineFlash = (selector, message) => Array.from(document.querySelectorAll(selector)).some((node) => cleanText(node.textContent).includes(message));
  const persistQueryState = (key, value) => {
    const nextUrl = new URL(window.location.href);
    if (value) nextUrl.searchParams.set(key, value);
    else nextUrl.searchParams.delete(key);
    window.history.replaceState({}, "", nextUrl.pathname + (nextUrl.searchParams.toString() ? "?" + nextUrl.searchParams.toString() : "") + nextUrl.hash);
  };
  const summarizeFilters = () => {
    const active = filterBindings
      .map((binding) => ({ key: binding.key, value: cleanText(binding.node.value) }))
      .filter((binding) => binding.value.length > 0);
    if (!active.length) return { label: "URL state idle", chip: "URL state idle" };
    return { label: active.length + " active filter" + (active.length > 1 ? "s" : ""), chip: active.map((binding) => binding.key + "=" + shorten(binding.value, 18)).join(" | ") };
  };
  const primaryActionNode = () => document.querySelector("button[data-primary-action='1']:not([disabled]), form button[type='submit']:not([disabled])");
  const searchFieldNode = () => document.querySelector("input[type='search']:not([disabled]), input[data-table-filter]:not([disabled])");
  const syncPrimaryAction = () => {
    const primary = primaryActionNode();
    if (shellPrimaryAction instanceof HTMLButtonElement) shellPrimaryAction.disabled = !(primary instanceof HTMLElement);
    if (shellFilterAction instanceof HTMLButtonElement) shellFilterAction.disabled = !(searchFieldNode() instanceof HTMLElement);
    setText(shellPrimaryLabel, primary instanceof HTMLElement ? shorten(primary.getAttribute("aria-label") || primary.textContent || "Run primary action", 34) : "Run primary action");
  };
  const syncShellState = () => {
    const url = new URL(window.location.href);
    const pathname = url.pathname;
    const nav = activeNav(pathname);
    document.querySelectorAll("header nav a[href]").forEach((node) => {
      if (!(node instanceof HTMLAnchorElement)) return;
      const href = node.getAttribute("href");
      if (!href) return;
      const isActive = href === "/ui" ? pathname === "/ui" : pathname === href || pathname.startsWith(href + "/");
      node.classList.toggle("active", isActive);
      if (isActive) node.setAttribute("aria-current", "page");
      else node.removeAttribute("aria-current");
    });
    const filterSummary = summarizeFilters();
    const message = cleanText(url.searchParams.get("message"));
    const error = cleanText(url.searchParams.get("error"));
    const errorState = error ? classifyError(error) : null;
    const alertLabel = errorState ? errorState.label : message ? "Success" : "Nominal";
    const recovery = errorState ? errorState.recovery : nav ? nav.description : "Jobs / Health / Compare";
    const objectText = describeObject(url);
    setText(shellCurrentObject, objectText);
    setText(shellCurrentState, alertLabel);
    setText(shellPageGroup, nav ? nav.groupLabel : "Control Plane");
    setText(shellPagePath, pathname);
    setText(shellPageObject, objectText);
    setText(shellPageSummary, nav ? nav.description : "Object-centered control plane for fast routing, detail work, compare-heavy review, and recovery-aware operations.");
    setText(shellFilterState, filterSummary.label);
    setText(shellAlertState, alertLabel);
    setText(shellRecoveryState, recovery);
    setText(shellFilterChip, filterSummary.chip);
    setText(shellAlertChip, alertLabel);
    syncPrimaryAction();
  };
  document.querySelectorAll("[data-copy]").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.addEventListener("click", async () => {
      const text = cleanText(node.dataset.copy);
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        toast("Copied", text, "ok", 2000);
      } catch (error) {
        toast("Copy failed", String(error), "bad", 5000);
      }
    });
  });
  document.querySelectorAll("input[data-table-filter]").forEach((node, index, nodes) => {
    if (!(node instanceof HTMLInputElement)) return;
    const targetId = cleanText(node.dataset.tableFilter);
    const table = targetId ? document.getElementById(targetId) : null;
    if (!(table instanceof HTMLTableElement)) return;
    const queryKey = cleanText(node.dataset.urlParam || node.name || node.id || (nodes.length === 1 ? "filter" : "filter-" + (targetId || index + 1))).replace(/[^a-zA-Z0-9_-]+/g, "-");
    const initialUrl = new URL(window.location.href);
    const initialValue = initialUrl.searchParams.get(queryKey);
    if (initialValue && !node.value) node.value = initialValue;
    const rows = () => Array.from(table.querySelectorAll("tbody tr"));
    const applyFilter = () => {
      const query = node.value.trim().toLowerCase();
      rows().forEach((row) => {
        const text = String(row.textContent || "").toLowerCase();
        row.style.display = !query || text.includes(query) ? "" : "none";
      });
      persistQueryState(queryKey, node.value.trim());
      syncShellState();
    };
    node.addEventListener("input", applyFilter);
    filterBindings.push({ node, key: queryKey });
    applyFilter();
  });
  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      const failedShotIds = form.querySelector("input[name='failedShotIds']");
      if (failedShotIds instanceof HTMLInputElement) {
        const value = failedShotIds.value.trim();
        if (value.length > 0 && !/^shot_[\\w-]+(\\s*,\\s*shot_[\\w-]+)*$/.test(value)) {
          event.preventDefault();
          const next = failedShotIds.nextElementSibling;
          if (!next || !(next instanceof HTMLElement) || !next.classList.contains("field-error")) {
            const message = document.createElement("div");
            message.className = "field-error";
            message.textContent = "Format: shot_1,shot_2";
            failedShotIds.insertAdjacentElement("afterend", message);
          }
          toast("Validation", "failedShotIds format is invalid.", "warn", 3200);
          failedShotIds.focus();
          return;
        }
      }
      const submit = form.querySelector("button[type='submit']");
      if (submit instanceof HTMLButtonElement) {
        if (submit.dataset.busy === "1") {
          event.preventDefault();
          return;
        }
        submit.dataset.busy = "1";
        submit.classList.add("submit-loading");
        submit.disabled = true;
        form.setAttribute("aria-busy", "true");
      }
      const runGroup = form.dataset.runGroup;
      if (runGroup) {
        document.querySelectorAll("form[data-run-group='" + runGroup + "'] button[type='submit']").forEach((button) => {
          if (!(button instanceof HTMLButtonElement)) return;
          button.dataset.busy = "1";
          button.classList.add("submit-loading");
          button.disabled = true;
        });
      }
      syncPrimaryAction();
    });
  });
  document.querySelectorAll("[data-tooltip]").forEach((node) => {
    if (!(node instanceof HTMLElement) || node.title) return;
    const text = cleanText(node.dataset.tooltip);
    if (!text) return;
    node.title = text;
    if (!node.hasAttribute("aria-label")) node.setAttribute("aria-label", text);
  });
  document.querySelectorAll("[role='button']").forEach((node) => {
    if (!(node instanceof HTMLElement) || node.dataset.shellKeyboardBound === "1") return;
    node.dataset.shellKeyboardBound = "1";
    node.addEventListener("keydown", (event) => {
      const target = event.target;
      if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      node.click();
    });
  });
  const initialUrl = new URL(window.location.href);
  const message = cleanText(initialUrl.searchParams.get("message"));
  const error = cleanText(initialUrl.searchParams.get("error"));
  if (message && !hasInlineFlash(".notice,.success-state", message)) toast("Success", message, "ok");
  if (error && !hasInlineFlash(".error,.error-state", error)) {
    const classification = classifyError(error);
    toast(classification.label, error, classification.tone, 7000);
  }
  const runLive = document.getElementById("run-profile-live");
  if (runLive instanceof HTMLElement) {
    const episodeId = cleanText(runLive.dataset.episodeId);
    const hintForError = (msg) => {
      const text = String(msg || "").toLowerCase();
      if (text.includes("shots.json")) return "Hint: run COMPILE_SHOTS first.";
      if (text.includes("redis") || text.includes("queue") || text.includes("503") || text.includes("unavailable")) return "Hint: inspect /ui/health.";
      return "Hint: inspect the last failed job in /ui/jobs.";
    };
    const renderLive = (item) => {
      runLive.textContent = "";
      if (!item) {
        runLive.textContent = "No recent run history.";
        return;
      }
      const status = String(item.status || "UNKNOWN");
      const type = String(item.type || "-");
      const progress = Number.isFinite(Number(item.progress)) ? Number(item.progress) : 0;
      const jobId = cleanText(item.id);
      const base = "Recent job: " + type + " / " + status + " / " + progress + "%";
      if (status === "FAILED") {
        const lastError = String(item.lastError || "(none)");
        runLive.classList.remove("notice");
        runLive.classList.add("error");
        runLive.textContent = base + " | " + lastError + " | " + hintForError(lastError);
        return;
      }
      runLive.classList.remove("error");
      runLive.classList.add("notice");
      runLive.append(document.createTextNode(base));
      if (jobId) {
        const link = document.createElement("a");
        link.href = "/ui/jobs/" + encodeURIComponent(jobId);
        link.textContent = " (job)";
        runLive.append(link);
      }
    };
    const poll = async () => {
      if (!episodeId) return;
      try {
        const response = await fetch("/api/jobs?episodeId=" + encodeURIComponent(episodeId) + "&limit=10", { headers: { accept: "application/json" } });
        if (!response.ok) throw new Error("poll failed: " + response.status);
        const json = await response.json();
        const list = Array.isArray(json && json.data) ? json.data : [];
        renderLive(list.length > 0 ? list[0] : null);
      } catch (err) {
        runLive.classList.remove("notice");
        runLive.classList.add("error");
        runLive.textContent = "Status refresh failed: " + String(err);
      }
    };
    let timer = null;
    const startPolling = () => {
      if (timer !== null) return;
      timer = window.setInterval(() => { void poll(); }, 5000);
    };
    const stopPolling = () => {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stopPolling();
        return;
      }
      void poll();
      startPolling();
    };
    void poll();
    startPolling();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
    });
  }
  if (shellPrimaryAction instanceof HTMLButtonElement) {
    shellPrimaryAction.addEventListener("click", () => {
      const primary = primaryActionNode();
      if (!(primary instanceof HTMLElement)) return;
      primary.focus();
      primary.click();
    });
  }
  if (shellFilterAction instanceof HTMLButtonElement) {
    shellFilterAction.addEventListener("click", () => {
      const search = searchFieldNode();
      if (!(search instanceof HTMLElement)) return;
      search.focus();
      if (search instanceof HTMLInputElement) search.select();
      speak("Filter focused.");
    });
  }
  if (shellCopyLink instanceof HTMLButtonElement) {
    shellCopyLink.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast("Link copied", window.location.pathname, "ok", 2000);
      } catch (err) {
        toast("Copy failed", String(err), "bad", 4000);
      }
    });
  }
  const updateClock = () => {
    if (!(shellLiveClock instanceof HTMLElement)) return;
    const formatter = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    shellLiveClock.textContent = formatter.format(new Date());
  };
  updateClock();
  window.setInterval(updateClock, 1000);
  syncShellState();
  window.addEventListener("keydown", (event) => {
    const target = event.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
    if (shortcut instanceof HTMLElement && shortcut.classList.contains("open") && event.key !== "Escape" && event.key !== "Tab" && event.key !== "?") return;
    if (editing) return;
    if (event.key === "?") {
      event.preventDefault();
      if (shortcut instanceof HTMLElement && shortcut.classList.contains("open")) closeDialog();
      else openDialog();
      return;
    }
    if (event.key === "Escape") {
      if (shortcut instanceof HTMLElement && shortcut.classList.contains("open")) {
        event.preventDefault();
        closeDialog();
      }
      pendingGo = "";
      return;
    }
    if (event.key.toLowerCase() === "g") {
      pendingGo = "g";
      window.setTimeout(() => { pendingGo = ""; }, 1500);
      speak("Go to mode. Press d dashboard, s studio, e episodes, j jobs, h health, a assets, c characters, n generator, p publish.");
      return;
    }
    if (pendingGo === "g") {
      const chord = "g " + event.key.toLowerCase();
      pendingGo = "";
      const match = flatNav.find((item) => String(item.hotkey || "").toLowerCase() === chord);
      if (match) {
        event.preventDefault();
        window.location.href = match.href;
      }
      return;
    }
    if (event.key.toLowerCase() === "r") {
      const primary = primaryActionNode();
      if (primary instanceof HTMLElement) {
        event.preventDefault();
        primary.click();
      }
      return;
    }
    if (event.key === "/") {
      const search = searchFieldNode();
      if (search instanceof HTMLElement) {
        event.preventDefault();
        search.focus();
        if (search instanceof HTMLInputElement) search.select();
      }
    }
  });
})();
`;
