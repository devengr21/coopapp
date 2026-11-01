(function () {
  "use strict";
  const COOP = (window.COOP = window.COOP || {});
  const U = COOP.utils;
  const D = COOP.domain;
  const UI = COOP.ui;
  const store = COOP.store;
  const pages = COOP.pages;

  const ROUTES = {
    "/login": { page: "auth", mode: "login", public: true },
    "/forgot-password": { page: "auth", mode: "forgot-password", public: true },
    "/create-account": { page: "auth", mode: "create-account", public: true },
    "/dashboard": { page: "dashboard", title: "Dashboard", permission: "dashboard.view" },
    "/members": { page: "members", title: "Members", permission: "members.view" },
    "/contributions": { page: "contributions", title: "Contributions", permission: "contributions.view" },
    "/loans": { page: "loans", title: "Loans", permission: "loans.view" },
    "/payments": { page: "payments", title: "Payments", permission: "payments.view" },
    "/approvals": { page: "approvals", title: "Approvals", permission: "approvals.view" },
    "/reports": { page: "reports", title: "Reports", permission: "reports.view" },
    "/cash": { page: "cash", title: "Cash", permission: "cash.view" },
    "/users": { page: "users", title: "Users", permission: "users.manage" },
    "/settings": { page: "settings", title: "Settings", permission: "settings.view" },
    "/audit": { page: "audit", title: "Audit log", permission: "audit.view" },
    "/portal": { page: "portal", title: "My COOP", permission: "portal.view", memberOnly: true },
    "/my-loans": { page: "myloans", title: "My Loans", permission: "portal.view", memberOnly: true },
    "/my-contributions": { page: "mycontrib", title: "My Contributions", permission: "portal.view", memberOnly: true },
    "/care-loans": { page: "mycare", title: "Non-member Loans", permission: "portal.view", memberOnly: true }
  };

  const SCROLL_IDLE_MS = 900;
  const scrollTimers = new WeakMap();

  function markScrolling(target) {
    const el = target === document ? document.documentElement : target;
    if (!el || !el.classList || typeof el.scrollHeight !== "number") return;
    el.classList.add("is-scrolling");
    const timers = scrollTimers;
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(function () {
      el.classList.remove("is-scrolling");
    }, SCROLL_IDLE_MS));
  }

  document.addEventListener("scroll", function (event) {
    markScrolling(event.target);
  }, { capture: true, passive: true });

  document.addEventListener("pointerover", function (event) {
    if (event.target.closest && event.target.closest(".content")) {
      document.documentElement.classList.add("page-hover");
    }
  });
  document.addEventListener("pointerout", function (event) {
    const from = event.target && event.target.closest && event.target.closest(".content");
    const to = event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest(".content");
    if (from && !to) {
      document.documentElement.classList.remove("page-hover");
    }
  });

  function defaultRoute(user) {
    return user && user.role === "member" ? "/portal" : "/dashboard";
  }

  function currentPath() {
    const raw = String(window.location.hash || "").replace(/^#/, "") || "/";
    if (raw === "/" || raw === "") return "/";
    return raw.charAt(0) === "/" ? raw : "/" + raw;
  }

  function navigate(path) {
    const clean = String(path || "/").replace(/^#/, "");
    const target = "#" + (clean.charAt(0) === "/" ? clean : "/" + clean);
    if (window.location.hash === target) {
      render();
      return;
    }
    window.location.hash = target;
  }

  function applyTheme(theme) {
    const value = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", value);
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.innerHTML = U.icon(value === "dark" ? "sun" : "moon");
      button.setAttribute("title", value === "dark" ? "Switch to light mode" : "Switch to dark mode");
    });
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    store.setTheme(next);
    applyTheme(next);
    UI.toast(next === "dark" ? "Dark mode enabled." : "Light mode enabled.", "info", 1800);
  }

  function navItem(path, icon, label, active, badge) {
    return '<a class="nav-link' + (active ? " active" : "") + '" href="#' + path + '">' +
      U.icon(icon) + "<span>" + U.esc(label) + "</span>" +
      (badge ? '<span class="nav-badge">' + badge + "</span>" : "") + "</a>";
  }

  function sidebarNav(user, activePath) {
    const db = store.get();
    const pending = (db.approvals || []).filter(function (a) { return a.status === "pending"; }).length;
    if (user.role === "member") {
      return '<div class="nav-section"><span class="nav-section-head">Main</span>' +
        navItem("/portal", "home", "My COOP", activePath === "/portal") +
      "</div>" +
      '<div class="nav-section"><span class="nav-section-head">My lending</span>' +
        navItem("/my-loans", "hand-coins", "Loans", activePath === "/my-loans") +
        navItem("/care-loans", "user", "Non-member loans", activePath === "/care-loans") +
      "</div>" +
      '<div class="nav-section"><span class="nav-section-head">My savings</span>' +
        navItem("/my-contributions", "wallet", "Contributions", activePath === "/my-contributions") +
      "</div>";
    }

    let html = '<div class="nav-section nav-section-main"><span class="nav-section-head">Main</span>' +
      navItem("/dashboard", "dashboard", "Dashboard", activePath === "/dashboard") +
      navItem("/members", "users", "Members", activePath === "/members") +
      navItem("/contributions", "wallet", "Contributions", activePath === "/contributions") +
      navItem("/loans", "hand-coins", "Loans", activePath === "/loans") +
      navItem("/payments", "credit-card", "Payments", activePath === "/payments") +
      navItem("/reports", "chart", "Reports", activePath === "/reports") +
    "</div>";

    html += '<div class="nav-section"><span class="nav-section-head">More</span>' +
      navItem("/approvals", "shield", "Approvals", activePath === "/approvals", pending > 0 ? pending : "") +
      navItem("/cash", "banknote", "Cash", activePath === "/cash");
    if (store.can("users.manage")) html += navItem("/users", "user", "Users", activePath === "/users");
    if (store.can("settings.view")) html += navItem("/settings", "settings", "Settings", activePath === "/settings");
    if (store.can("audit.view")) html += navItem("/audit", "clipboard-list", "Audit log", activePath === "/audit");
    html += "</div>";

    return html;
  }

  function shell(user, path) {
    const db = store.get();
    const theme = document.documentElement.getAttribute("data-theme") || db.settings.theme || "light";
    const role = store.roleLabel(user.role);
    const notifs = [];
    if (user.role !== "member") {
      const pendingUsers = (db.pendingUsers || []).filter(function (p) {
        return p.status !== "approved" && p.status !== "rejected";
      }).length;
      if (pendingUsers && store.can("users.manage")) {
        notifs.push({ icon: "user-plus", tone: "info", label: "Pending sign-up requests need review", count: pendingUsers, href: "#/users" });
      }
      let pendingLoans = 0;
      let overdueLoans = 0;
      (db.loans || []).forEach(function (loan) {
        if (loan.status === "pending") pendingLoans += 1;
        else if (loan.status === "active" && D.loanLedger(loan, db.payments, U.today()).overdue) overdueLoans += 1;
      });
      if (pendingLoans && store.can("loans.view")) {
        notifs.push({ icon: "hand-coins", tone: "info", label: "Loan requests awaiting approval", count: pendingLoans });
      }
      const pendingRequests = (db.loanRequests || []).filter(function (r) {
        return r.status === "pending";
      }).length;
      if (pendingRequests && store.can("loans.manage")) {
        notifs.push({ icon: "bell", tone: "info", label: "Member loan requests to avail need review", count: pendingRequests, href: "#/loans" });
      }
      if (overdueLoans && store.can("loans.view")) {
        notifs.push({ icon: "alert-triangle", tone: "danger", label: "Loans overdue or past due", count: overdueLoans, href: "#/loans" });
      }
    } else {
      const userId = user.id;
      const member = store.currentMember();
      const memberId = member ? member.id : null;
      const pendingRequests = (db.loanRequests || []).filter(function (r) {
        return r.requestedById === userId && r.status === "pending";
      }).length;
      if (pendingRequests) {
        notifs.push({ icon: "clock", tone: "info", label: "Loan requests awaiting review", count: pendingRequests, href: "#/my-loans" });
      }
      const approvedRequests = (db.loanRequests || []).filter(function (r) {
        return r.requestedById === userId && r.status === "approved";
      }).length;
      if (approvedRequests) {
        notifs.push({ icon: "check-circle", tone: "success", label: "Loan requests approved and released", count: approvedRequests, href: "#/my-loans" });
      }
      const rejectedRequests = (db.loanRequests || []).filter(function (r) {
        return r.requestedById === userId && r.status === "rejected";
      }).length;
      if (rejectedRequests) {
        notifs.push({ icon: "alert-triangle", tone: "danger", label: "Loan requests rejected", count: rejectedRequests, href: "#/my-loans" });
      }
      let overdueLoans = 0;
      let loansWithNewPayments = 0;
      const myLoanIds = [];
      (db.loans || []).forEach(function (loan) {
        const isMine = (loan.borrowerType === "member" && loan.memberId === memberId) ||
          (loan.borrowerType === "non_member" && loan.careOfMemberId === memberId);
        if (isMine) {
          myLoanIds.push(loan.id);
          if (loan.status === "active" && D.loanLedger(loan, db.payments, U.today()).overdue) overdueLoans += 1;
        }
      });
      if (overdueLoans) {
        notifs.push({ icon: "alert-triangle", tone: "danger", label: "Loans overdue or past due", count: overdueLoans, href: "#/my-loans" });
      }
      const recentPayments = (db.payments || []).filter(function (p) {
        return !p.voided && myLoanIds.indexOf(p.loanId) >= 0;
      }).length;
      if (recentPayments) {
        notifs.push({ icon: "credit-card", tone: "success", label: "New payments posted on your loans", count: recentPayments, href: "#/my-loans" });
      }
      if (member) {
        const current = D.contributionRows(db, U.monthKey()).rows.find(function (r) { return r.member.id === member.id; });
        if (current && current.status !== "paid") {
          notifs.push({ icon: "calendar", tone: "warning", label: "Monthly contribution due", count: 1, href: "#/my-contributions" });
        }
      }
    }
    return '<div class="shell">' +
      '<div class="sidebar-overlay" data-sidebar-overlay></div>' +
        '<aside class="sidebar" id="app-sidebar">' +
          '<div class="sidebar-inner">' +
            '<div class="sidebar-brand"><span class="mark"></span>' +
            '<div><div class="name">PHSC Coop</div><div class="tag">' + U.esc(db.settings.orgName) + "</div></div></div>" +
            '<div class="sidebar-scroll">' +
              '<nav class="sidebar-nav" aria-label="Main navigation">' + sidebarNav(user, path) + "</nav>" +
            '</div>' +
          '</div>' +
        '</aside>' +
      '<div class="main">' +
        '<header class="topbar">' +
          '<button class="icon-btn mobile-only" type="button" data-menu aria-label="Open menu">' + U.icon("menu") + "</button>" +
          '<div class="topbar-datetime" id="topbar-datetime"></div>' +
          '<div class="topbar-spacer"></div>' +
          '<div class="topbar-user">' +
            '<div class="account-wrap">' +
              '<button class="user-card compact" type="button" data-account aria-haspopup="true" aria-expanded="false" title="Account options">' +
                '<div class="meta">' +
                  '<div class="name">' + U.esc(user.name) + '</div><div class="role">' + U.esc(role) + "</div>" +
                "</div>" +
                U.icon("chevron-down", "icon-sm") +
              "</button>" +
              '<div class="account-menu" data-account-menu>' +
                '<div class="account-menu-head">' +
                  '<div class="name">' + U.esc(user.name) + "</div>" +
                  '<div class="sub">' + U.esc(user.email || user.username) + "</div>" +
                "</div>" +
                '<button class="account-menu-item" type="button" data-account-item="info">' + U.icon("edit", "icon-sm") + " Update info</button>" +
                '<button class="account-menu-item" type="button" data-account-item="password">' + U.icon("key", "icon-sm") + " Change password</button>" +
              "</div>" +
            "</div>" +
            '<div class="notif-wrap">' +
              '<button class="icon-btn" type="button" data-notif aria-haspopup="true" aria-expanded="false" title="Notifications" aria-label="Notifications">' +
                U.icon("bell") +
                (notifs.length ? '<span class="notif-badge">' + U.number(notifs.length, 0) + "</span>" : "") +
              "</button>" +
              '<div class="notif-menu" data-notif-menu>' +
                '<div class="notif-menu-head">Notifications</div>' +
                (notifs.length
                  ?                   notifs.map(function (n) {
                      return '<button class="notif-item tone-' + n.tone + '" type="button" data-notif-item="' + n.href + '">' +
                        '<span class="notif-item-icon">' + U.icon(n.icon, "icon-sm") + "</span>" +
                        '<span class="notif-item-label">' + U.esc(n.label) + "</span>" +
                        '<span class="notif-item-count">' + U.number(n.count, 0) + "</span></button>";
                    }).join("")
                  : '<div class="notif-empty">' + U.icon("check-circle", "icon-sm") + " You're all caught up.</div>") +
              "</div>" +
            "</div>" +
            '<button class="icon-btn" type="button" data-theme-toggle title="' + (theme === "dark" ? "Switch to light mode" : "Switch to dark mode") + '" aria-label="Toggle theme">' +
              U.icon(theme === "dark" ? "sun" : "moon") + "</button>" +
            '<button class="icon-btn danger" type="button" data-logout title="Sign out" aria-label="Sign out">' + U.icon("log-out", "icon-sm") + "</button>" +
          '</div>' +
        "</header>" +
        '<main class="content" id="page-content"></main>' +
      "</div>" +
    "</div>";
  }

  function startClock() {
    const el = document.getElementById("topbar-datetime");
    if (!el) return;
    function tick() {
      const now = new Date();
      const opts = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
      const timeOpts = { hour: "2-digit", minute: "2-digit", second: "2-digit" };
      el.textContent = now.toLocaleDateString(undefined, opts) + " · " + now.toLocaleTimeString(undefined, timeOpts);
    }
    tick();
    setInterval(tick, 1000);
  }

  function renderAuth(mode) {
    UI.closeModal();
    const db = store.get();
    applyTheme(db.settings.theme || "light");
    const app = document.getElementById("app");
    if (!app) return;
    try {
      if (pages.auth && typeof pages.auth.render === "function") {
        pages.auth.render(app, mode);
      } else {
        app.innerHTML = '<div class="auth"><main class="auth-panel"><div class="auth-card">' +
          '<div class="alert danger">' + U.icon("alert-triangle", "icon-sm") +
          '<div><strong>Authentication Error</strong><br>The authentication module is unavailable. Please reload the page.</div></div>' +
          '</div></main></div>';
      }
    } catch (err) {
      console.error("Auth render error:", err);
      app.innerHTML = '<div class="auth"><main class="auth-panel"><div class="auth-card">' +
        '<div class="alert danger">' + U.icon("alert-triangle", "icon-sm") +
        '<div><strong>Unable to display authentication screen</strong><br>' + U.esc(err.message) + '</div></div>' +
        '</div></main></div>';
    }
  }

  function render() {
    const app = document.getElementById("app");
    if (!app) return;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    try {
      const scrollingEl = document.scrollingElement || document.documentElement;
      scrollingEl.scrollTop = 0;
      window.scrollTo(0, 0);
    } catch (err) { /* ignore */ }
    const db = store.get();
    let path = currentPath();
    let route = ROUTES[path];

    if (route && route.public) {
      if (path === "/forgot-password") {
        document.title = "Forgot password · PHSC Coop";
        renderAuth("forgot-password");
        return;
      }
      if (path === "/create-account") {
        document.title = "Create account · PHSC Coop";
        renderAuth("create-account");
        return;
      }
      document.title = "Sign in · PHSC Coop";
      renderAuth("login");
      return;
    }

const user = store.currentUser();
if (!user) {
  navigate("/login");
  return;
}

    const memberRoute = (route && route.memberOnly) || ["", "/portal"].indexOf(path) >= 0;
    if (user.role === "member" && !memberRoute) {
      navigate("/portal");
      return;
    }
    if (user.role !== "member" && route && route.memberOnly) {
      navigate(defaultRoute(user));
      return;
    }
    if (!route) {
      path = defaultRoute(user);
      route = ROUTES[path];
    }
    if (!store.can(route.permission)) {
      path = defaultRoute(user);
      route = ROUTES[path];
    }
    if (!pages[route.page] || typeof pages[route.page].render !== "function") {
      path = defaultRoute(user);
      route = ROUTES[path];
    }

    applyTheme(db.settings.theme || "light");
    document.title = route.title + " · " + db.settings.orgName + " · COOP Manager";
    app.innerHTML = shell(user, path);
    startClock();
    const content = app.querySelector("#page-content");
    try {
      pages[route.page].render(content);
    } catch (err) {
      console.error(err);
      content.innerHTML = '<div class="alert danger">' + U.icon("alert-triangle", "icon-sm") +
        "<div><strong>This page could not be displayed.</strong><br>" + U.esc(err.message) + "</div></div>";
      UI.toast("Unable to render page: " + err.message, "danger");
    }

    const menuButton = app.querySelector("[data-menu]");
    const sidebar = app.querySelector("#app-sidebar");
    const overlay = app.querySelector("[data-sidebar-overlay]");
    function closeSidebar() {
      if (sidebar) sidebar.classList.remove("open");
      if (overlay) overlay.classList.remove("open");
    }
    if (menuButton) menuButton.addEventListener("click", function () {
      if (sidebar) sidebar.classList.toggle("open");
      if (overlay) overlay.classList.toggle("open");
    });
    if (overlay) overlay.addEventListener("click", closeSidebar);
    if (sidebar) sidebar.querySelectorAll(".nav-link").forEach(function (link) {
      link.addEventListener("click", closeSidebar);
    });

    const logoutButton = app.querySelector("[data-logout]");
    if (logoutButton) logoutButton.addEventListener("click", function () {
      UI.confirm({
        title: "Sign out?",
        message: "Your local data will stay on this device. You can sign in again at any time.",
        confirmLabel: "Sign out",
        tone: "primary"
      }).then(function (ok) {
        if (!ok) return;
        store.logout().then(function () {
          UI.toast("Signed out.");
          navigate("/");
        });
      });
    });
    app.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.addEventListener("click", toggleTheme);
    });
    applyTheme(db.settings.theme || "light");
  }

  window.addEventListener("hashchange", function () {
    UI.closeModal();
    render();
  });

  function toggleAccountMenu(force) {
    const wrap = document.querySelector(".account-wrap");
    if (!wrap) return;
    const menu = wrap.querySelector("[data-account-menu]");
    const button = wrap.querySelector("[data-account]");
    const open = force !== undefined ? force : !wrap.classList.contains("open");
    wrap.classList.toggle("open", open);
    if (menu) menu.classList.toggle("open", open);
    if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function toggleNotifMenu(force) {
    const wrap = document.querySelector(".notif-wrap");
    if (!wrap) return;
    const menu = wrap.querySelector("[data-notif-menu]");
    const button = wrap.querySelector("[data-notif]");
    const open = force !== undefined ? force : !wrap.classList.contains("open");
    wrap.classList.toggle("open", open);
    if (menu) menu.classList.toggle("open", open);
    if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function openChangePassword() {
    const modal = UI.modal({
      title: "Change password",
      subtitle: "Confirm your current password, then set a new one.",
      size: "sm",
      body:
        '<div class="alert danger hidden" data-form-error role="alert">' + U.icon("alert-triangle", "icon-sm") + "<div data-form-error-text></div></div>" +
        '<form id="own-password-form"><div class="form-grid">' +
          '<div class="field full"><label for="op-current">Current password<span class="req">*</span></label><input class="input" id="op-current" name="current" type="password" required autocomplete="current-password"></div>' +
          '<div class="field full"><label for="op-new">New password<span class="req">*</span></label><input class="input" id="op-new" name="password" type="password" minlength="6" required autocomplete="new-password" placeholder="At least 6 characters"></div>' +
          '<div class="field full"><label for="op-confirm">Confirm new password<span class="req">*</span></label><input class="input" id="op-confirm" name="confirm" type="password" minlength="6" required autocomplete="new-password"></div>' +
        "</div></form>",
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn primary" type="submit" form="own-password-form">' + U.icon("key", "icon-sm") + " Change password</button>",
      onMount: function (modalEl) {
        const form = modalEl.querySelector("#own-password-form");
        const submit = modalEl.querySelector("[form=own-password-form]");
        modalEl.querySelector("[data-cancel]").addEventListener("click", modal.close);
        form.addEventListener("submit", async function (event) {
          event.preventDefault();
          const box = form.querySelector("[data-form-error]");
          const text = form.querySelector("[data-form-error-text]");
          if (box) box.classList.add("hidden");
          const data = UI.formData(form);
          if (data.password !== data.confirm) {
            if (box && text) { text.textContent = "New passwords do not match."; box.classList.remove("hidden"); }
            return;
          }
          UI.setBusy(submit, true, "Changing…");
          try {
            await COOP.actions.changeOwnPassword(data.current, data.password);
            UI.closeModal();
            UI.toast("Password changed.");
          } catch (err) {
            if (box && text) { text.textContent = err.message; box.classList.remove("hidden"); }
            UI.setBusy(submit, false);
          }
        });
      }
    });
    return modal;
  }

  function openUpdateInfo() {
    const user = store.currentUser();
    if (!user) return;
    const auth = store.initFirebase();
    const emailLocked = !!auth;
    const modal = UI.modal({
      title: "Update info",
      subtitle: "Update the details shown on your account.",
      size: "sm",
      body:
        '<div class="alert danger hidden" data-form-error role="alert">' + U.icon("alert-triangle", "icon-sm") + "<div data-form-error-text></div></div>" +
        '<form id="own-info-form" autocomplete="off"><div class="form-grid">' +
          '<div class="field full"><label for="oi-name">Full name<span class="req">*</span></label><input class="input" id="oi-name" name="name" value="' + U.esc(user.name) + '" required maxlength="120"></div>' +
          '<div class="field full"><label for="oi-email">Email address<span class="req">*</span></label><input class="input" id="oi-email" name="email" type="email" value="' + U.esc(user.email) + '"' + (emailLocked ? " disabled" : "") + ' required maxlength="120" autocomplete="email">' +
            (emailLocked ? '<div class="help">Your email is managed by the sign-in provider. Contact an administrator to change it.</div>' : '<div class="help">This is the address you sign in with.</div>') + "</div>" +
          '<div class="field full"><label>Username</label><input class="input" value="' + U.esc(user.username) + '" disabled>' +
            '<div class="help">Usernames cannot be changed.</div></div>' +
        "</div></form>",
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn primary" type="submit" form="own-info-form">' + U.icon("save", "icon-sm") + " Save changes</button>",
      onMount: function (modalEl) {
        const form = modalEl.querySelector("#own-info-form");
        const submit = modalEl.querySelector("[form=own-info-form]");
        modalEl.querySelector("[data-cancel]").addEventListener("click", modal.close);
        form.addEventListener("submit", async function (event) {
          event.preventDefault();
          const box = form.querySelector("[data-form-error]");
          const text = form.querySelector("[data-form-error-text]");
          if (box) box.classList.add("hidden");
          const data = UI.formData(form);
          UI.setBusy(submit, true, "Saving…");
          try {
            await COOP.actions.updateOwnProfile(data);
            UI.closeModal();
            UI.toast("Your info was updated.");
            if (COOP.app) COOP.app.refresh();
          } catch (err) {
            if (box && text) { text.textContent = err.message; box.classList.remove("hidden"); }
            UI.setBusy(submit, false);
          }
        });
      }
    });
    return modal;
  }

  document.addEventListener("click", function (event) {
    const inside = event.target.closest && (event.target.closest(".account-wrap"));
    const insideNotif = event.target.closest && (event.target.closest(".notif-wrap"));
    if (!inside) toggleAccountMenu(false);
    if (!insideNotif) toggleNotifMenu(false);
    if (!inside && !insideNotif) return;
    const notifItem = event.target.closest && event.target.closest("[data-notif-item]");
    if (notifItem) {
      toggleNotifMenu(false);
      const href = notifItem.getAttribute("data-notif-item");
      if (href) {
        if (window.location.hash === href) render();
        else window.location.hash = href;
      }
      return;
    }
    if (event.target.closest("[data-notif]")) {
      toggleAccountMenu(false);
      toggleNotifMenu();
      return;
    }
    const item = event.target.closest && event.target.closest("[data-account-item]");
    if (item) {
      toggleAccountMenu(false);
      if (item.getAttribute("data-account-item") === "info") openUpdateInfo();
      if (item.getAttribute("data-account-item") === "password") openChangePassword();
      return;
    }
    const button = event.target.closest && event.target.closest("[data-account]");
    if (button) {
      toggleNotifMenu(false);
      toggleAccountMenu();
    } else {
      toggleAccountMenu(false);
    }
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") { toggleAccountMenu(false); toggleNotifMenu(false); }
  });

  COOP.app = {
    render: render,
    refresh: render,
    navigate: navigate,
    applyTheme: applyTheme,
    routes: ROUTES
  };

  const initial = store.get() || { settings: { theme: "light" } };
  applyTheme((initial && initial.settings && initial.settings.theme) || "light");

  function mountApp() {
    const loading = document.getElementById("app-loading");
    if (loading) loading.setAttribute("data-ready", "true");
    store.subscribe(function (event) {
      if (!event || (event.reason !== "ready" && event.reason !== "saved" && event.reason !== "logout" && event.reason !== "reset")) return;
      render();
    });
    render();
  }

  if (store.isLoading()) {
    store.subscribe(function (event) {
      if (event && event.reason === "ready") {
        mountApp();
      }
    });
  } else {
    mountApp();
  }
})();
