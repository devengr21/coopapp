(function () {
  "use strict";
  const COOP = (window.COOP = window.COOP || {});
  const U = COOP.utils;
  const UI = COOP.ui;
  const D = COOP.domain;
  const store = COOP.store;
  const pages = (COOP.pages = COOP.pages || {});

  const TONES = {
    create: "success", update: "info", delete: "danger", void: "danger",
    payment: "success", approve: "success", reject: "danger", cancel: "danger",
    login: "info", logout: "outline", setup: "purple", import: "warning",
    password: "warning", settings: "warning", recalculate: "outline"
  };

  function stat(icon, label, value, hint, tone) {
    return '<div class="stat ' + (tone || "") + '">' +
      '<div class="stat-head"><span class="label">' + U.esc(label) + '</span><span class="stat-icon-wrap"><span class="stat-icon">' + U.icon(icon) + '</span><span class="stat-glow" aria-hidden="true"></span></span></div>' +
      '<div class="value">' + value + "</div>" + (hint ? '<div class="hint">' + hint + "</div>" : "") + "</div>";
  }

  pages.audit = {
    render: function (root) {
      const db = store.get();
      const state = U.tableState("audit");
      let logs = (db.audit || []).slice();
      if (state.sortKey) {
        logs = U.sortByKey(logs, state.sortKey, state.sortDir);
      } else {
        logs.sort(function (a, b) {
          return String(b.at || "").localeCompare(String(a.at || ""));
        });
      }
      const today = U.today();
      const todayCount = logs.filter(function (l) { return l.at && l.at.slice(0, 10) === today; }).length;
      const financeCount = logs.filter(function (l) { return ["payment", "create", "void", "approve", "update"].includes(l.action); }).length;
      const users = U.unique(logs.map(function (l) { return l.userName; }).filter(Boolean)).length;
      const actionOptions = U.unique(logs.map(function (l) { return l.action; }).filter(Boolean)).sort();

      const rows = logs.length ? logs.map(function (log) {
        const tone = TONES[log.action] || "";
        return '<tr data-search="' + U.esc(((log.userName || "") + " " + (log.action || "") + " " + (log.entity || "") + " " + (log.details || "")).toLowerCase()) + '" data-action="' + U.esc(log.action || "") + '">' +
          "<td>" + U.formatDateTime(log.at) + "</td>" +
          '<td><div class="cell-person"><div class="avatar" style="width:28px;height:28px;font-size:.64rem">' + U.esc(U.initials(log.userName || "System")) + "</div>" +
            '<div class="meta"><div class="name" style="font-size:.78rem">' + U.esc(log.userName || "System") + '</div><div class="sub">' + U.esc(D.ROLE_LABELS[log.userRole] || log.userRole || "") + "</div></div></div></td>" +
          '<td><span class="badge ' + tone + '">' + U.esc(U.titleCase(log.action || "activity")) + "</span></td>" +
          "<td>" + U.esc(U.titleCase(log.entity || "system")) + "</td>" +
          '<td class="sub">' + U.esc(log.details || "—") + "</td></tr>";
      }).join("") : '<tr><td colspan="5" class="empty-row">No audit entries yet.</td></tr>';

      root.innerHTML =
'<div class="page-head"><div><span class="eyebrow">' + U.icon("clipboard-list", "icon-sm") + " Trail</span>" +
  "<h1>Audit log</h1><div class=\"sub\">Chronological record of sign-ins, data changes, payments, and approvals.</div></div>" +
          '<div class="page-actions"><button class="btn" data-action="export">' + U.icon("download", "icon-sm") + " Export CSV</button>" +
          '<button class="btn" data-action="reset">Reset</button></div></div>' +
        '<div class="section"><div class="section-head">' +
          U.icon("clipboard-list", "section-icon") +
          "<h3>Overview</h3>" +
        "</div>" +
        '<div class="stat-grid">' +
          stat("clipboard-list", "Total entries", U.number(logs.length, 0), "Most recent 2,000 retained") +
          stat("clock", "Today", U.number(todayCount, 0), "Actions logged today", "tone-info") +
          stat("shield", "Users involved", U.number(users, 0), "Distinct account names") +
          stat("wallet", "Finance actions", U.number(financeCount, 0), "Creates, payments, voids, approvals", "tone-success") +
        "</div></div>" +
        '<div class="section"><div class="section-head">' +
          U.icon("file-text", "section-icon") +
          "<h3>Activity trail</h3>" +
          '<div class="section-sub">Newest entries first</div>' +
        "</div>" +
        '<div class="card"><div class="card-body flush"><div class="table-filter mb-0"><div class="search">' + U.icon("search") + '<input class="input" id="audit-search" placeholder="Search audit log…"></div>' +
          '<select class="select" id="audit-action-filter"><option value="">All actions</option>' +
          actionOptions.map(function (action) { return '<option value="' + U.esc(action) + '">' + U.esc(U.titleCase(action)) + "</option>"; }).join("") +
          "</select></div></div>" +
          '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr>' +
          '<th class="sortable" data-sort="at">When' + (state.sortKey === "at" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="userName">User' + (state.sortKey === "userName" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="action">Action' + (state.sortKey === "action" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="entity">Entity' + (state.sortKey === "entity" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="details">Details' + (state.sortKey === "details" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '</tr></thead><tbody>' +
          rows + "</tbody></table></div></div></div>";

      const search = root.querySelector("#audit-search");
      const actionFilter = root.querySelector("#audit-action-filter");
      function filterRows() {
        const q = search.value.toLowerCase().trim();
        const action = actionFilter.value;
        root.querySelectorAll("tbody tr[data-action]").forEach(function (row) {
          const textMatch = !q || row.getAttribute("data-search").indexOf(q) >= 0;
          const actionMatch = !action || row.getAttribute("data-action") === action;
          row.style.display = textMatch && actionMatch ? "" : "none";
        });
      }
      if (search) search.addEventListener("input", filterRows);
      if (actionFilter) actionFilter.addEventListener("change", filterRows);
      const resetButton = root.querySelector(".btn[data-action=reset]");
      if (resetButton) {
        resetButton.addEventListener("click", function () {
          search.value = "";
          actionFilter.value = "";
          filterRows();
        });
      }

      root.querySelectorAll("thead th.sortable").forEach(function (th) {
        th.addEventListener("click", function () {
          const key = th.getAttribute("data-sort");
          if (!key) return;
          const s2 = U.tableState("audit");
          if (s2.sortKey === key) {
            s2.sortDir = s2.sortDir === "asc" ? "desc" : "asc";
          } else {
            s2.sortKey = key;
            s2.sortDir = "asc";
          }
          U.tableSave("audit", s2);
          pages.audit.render(root);
        });
      });

      const exportButton = root.querySelector("[data-action=export]");
      if (exportButton) exportButton.addEventListener("click", function () {
        const csv = [["Timestamp", "User", "Role", "Action", "Entity", "Entity ID", "Details"]];
        logs.forEach(function (log) {
          csv.push([log.at, log.userName, log.userRole, log.action, log.entity, log.entityId, log.details]);
        });
        UI.downloadCSV("coop-audit-log-" + U.today() + ".csv", csv);
        UI.toast("Audit log exported.");
      });
    }
  };
})();
