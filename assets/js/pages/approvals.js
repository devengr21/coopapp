(function () {
  "use strict";
  const COOP = (window.COOP = window.COOP || {});
  const U = COOP.utils;
  const D = COOP.domain;
  const UI = COOP.ui;
  const store = COOP.store;
  const pages = (COOP.pages = COOP.pages || {});

  function stat(icon, label, value, hint, tone) {
    return '<div class="stat ' + (tone || "") + '">' +
      '<div class="stat-head"><span class="label">' + U.esc(label) + '</span><span class="stat-icon-wrap"><span class="stat-icon">' + U.icon(icon) + '</span><span class="stat-glow" aria-hidden="true"></span></span></div>' +
      '<div class="value">' + value + "</div>" + (hint ? '<div class="hint">' + hint + "</div>" : "") + "</div>";
  }

  function approve(approval) {
    const db = store.get();
    const loan = db.loans.find(function (l) { return l.id === approval.loanId; });
    if (!loan) return;
    UI.confirm({
      title: "Approve loan request?",
      message: "Approve " + loan.loanNo + " for " + D.borrowerName(loan, db) + " in the amount of " + U.money(loan.principal) + "? This will activate and release the loan.",
      confirmLabel: "Approve request",
      tone: "primary"
    }).then(function (ok) {
      if (!ok) return;
      try {
        COOP.actions.approveLoan(loan.id);
        UI.toast("Loan approved and released.");
        if (COOP.app) COOP.app.refresh();
      } catch (err) {
        UI.toast(err.message, "danger");
      }
    });
  }

  function reject(approval) {
    UI.askReason({
      title: "Reject loan request",
      message: "Provide a reason for rejecting this over-limit request. The reason is preserved in the approval history.",
      label: "Rejection reason",
      confirmLabel: "Reject request",
      tone: "danger"
    }).then(function (reason) {
      if (!reason) return;
      try {
        COOP.actions.rejectLoan(approval.loanId, reason);
        UI.toast("Loan request rejected.");
        if (COOP.app) COOP.app.refresh();
      } catch (err) {
        UI.toast(err.message, "danger");
      }
    });
  }

  pages.approvals = {
    render: function (root) {
      const db = store.get();
      const state = U.tableState("approvals-history");
      let approvals = (db.approvals || []).slice();
      if (state.sortKey) {
        approvals = U.sortByKey(approvals, state.sortKey, state.sortDir);
      } else {
        approvals.sort(function (a, b) {
          return String(b.requestedAt || "").localeCompare(String(a.requestedAt || ""));
        });
      }
      const pending = approvals.filter(function (a) { return a.status === "pending"; });
      const approved = approvals.filter(function (a) { return a.status === "approved"; });
      const rejected = approvals.filter(function (a) { return a.status === "rejected"; });
      const canDecide = store.can("approvals.manage");
      const cashOnHand = D.funds(db).cashOnHand;

      const pendingCards = pending.length ? pending.map(function (approval) {
        const loan = db.loans.find(function (l) { return l.id === approval.loanId; });
        const borrower = loan ? D.borrowerName(loan, db) : "Unknown borrower";
        const careOf = loan && loan.borrowerType === "non_member" ? D.careOfName(loan, db) : "";
        return '<div class="card mb-3"><div class="card-head"><div><div class="inline">' + UI.statusBadge("pending") +
          '<span class="strong">' + U.esc(loan ? loan.loanNo : "Loan") + "</span></div>" +
          '<div class="sub">Requested by ' + U.esc(approval.requestedByName || "—") + " · " + U.formatDateTime(approval.requestedAt) + "</div></div>" +
          '<div class="page-actions">' +
            (loan ? '<button class="btn sm" type="button" data-view="' + U.esc(loan.id) + '">View loan</button>' : "") +
            (canDecide ? '<button class="btn sm danger-soft" type="button" data-reject="' + U.esc(approval.id) + '">Reject</button>' +
            '<button class="btn sm primary" type="button" data-approve="' + U.esc(approval.id) + '">Approve</button>' : "") +
          "</div></div>" +
          '<div class="card-body">' +
            '<div class="grid-4">' +
              '<div class="summary-box"><div class="label">Borrower</div><div class="value" style="font-size:.9rem">' + U.esc(borrower) + '</div><div class="sub">' + (careOf ? "Care of " + U.esc(careOf) : "Member") + "</div></div>" +
              '<div class="summary-box"><div class="label">Requested amount</div><div class="value">' + U.money(loan ? loan.principal : approval.amount) + '</div><div class="sub">Principal</div></div>' +
              '<div class="summary-box"><div class="label">Interest</div><div class="value">' + (loan ? U.number(loan.interestRate, 2) + "%" : "—") + '</div><div class="sub">Per month</div></div>' +
              '<div class="summary-box"><div class="label">Available cash</div><div class="value">' + U.money(cashOnHand) + '</div><div class="sub">Current fund</div></div>' +
            "</div>" +
            '<div class="alert warning mt-3">' + U.icon("alert-triangle", "icon-sm") +
            "<div><strong>Why approval is needed:</strong> " + U.esc(approval.reason || "Requested amount exceeds the configured loan limit.") + "</div></div>" +
          "</div></div>";
      }).join("") : '<div class="card"><div class="card-body">' + UI.empty({
        icon: "check-circle",
        title: "No approvals waiting",
        message: "Over-limit loan requests will appear here for review before they are released.",
        small: true
      }) + "</div></div>";

      const history = approvals.filter(function (a) { return a.status !== "pending"; });
      const historyRows = history.length ? history.map(function (approval) {
        const loan = db.loans.find(function (l) { return l.id === approval.loanId; });
        return "<tr>" +
          "<td>" + U.formatDate(approval.requestedAt) + "</td>" +
          "<td><span class=\"strong\">" + U.esc(loan ? loan.loanNo : "—") + "</span><div class=\"sub\">" + U.esc(loan ? D.borrowerName(loan, db) : "") + "</div></td>" +
          '<td class="num">' + U.money(approval.amount) + "</td>" +
          "<td>" + UI.statusBadge(approval.status) + "</td>" +
          "<td>" + U.formatDate(approval.decidedAt) + "</td>" +
          "<td>" + U.esc(approval.decidedByName || "—") + "</td>" +
          '<td class="sub">' + U.esc(approval.decisionNotes || approval.reason || "—") + "</td></tr>";
      }).join("") : '<tr><td colspan="7" class="empty-row">No approval history yet.</td></tr>';

      root.innerHTML =
        '<div class="page-head"><div><span class="eyebrow">' + U.icon("shield", "icon-sm") + " Controls</span>" +
          "<h1>Approvals</h1><div class=\"sub\">Review over-limit loan requests before funds are released.</div></div></div>" +
        '<div class="stat-grid">' +
          stat("clock", "Pending requests", U.number(pending.length, 0), pending.length ? "Needs a decision" : "All clear", pending.length ? "tone-warning" : "tone-success") +
          stat("check-circle", "Approved", U.number(approved.length, 0), "Over-limit requests released") +
          stat("x", "Rejected", U.number(rejected.length, 0), "Requests declined") +
          stat("banknote", "Available cash", U.money(cashOnHand), "Current loan fund") +
        "</div>" +
        '<div class="section-title"><div><h3>Pending review</h3><div class="sub">A decision is required before release</div></div></div>' +
        pendingCards +
        '<div class="card"><div class="card-head"><div><h2>Approval history</h2><div class="sub">Decisions recorded by administrators and treasurers</div></div>' +
          '<div class="table-filter mb-0"><div class="search">' + U.icon("search") + '<input class="input" id="approval-search" placeholder="Search history…"></div></div></div>' +
          '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr>' +
          '<th class="sortable" data-sort="requestedAt">Requested' + (state.sortKey === "requestedAt" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="loanNo">Loan' + (state.sortKey === "loanNo" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable num" data-sort="amount">Amount' + (state.sortKey === "amount" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="status">Status' + (state.sortKey === "status" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="decidedAt">Decided' + (state.sortKey === "decidedAt" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="decidedByName">Decided by' + (state.sortKey === "decidedByName" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th></th>' +
          '</tr></thead><tbody>' +
          historyRows + "</tbody></table></div></div></div>";

      const search = root.querySelector("#approval-search");
      if (search) search.addEventListener("input", function () {
        const q = search.value.toLowerCase().trim();
        root.querySelectorAll("tbody tr").forEach(function (row) {
          const text = row.textContent.toLowerCase();
          row.style.display = !q || text.indexOf(q) >= 0 ? "" : "none";
        });
      });

      root.querySelectorAll("thead th.sortable").forEach(function (th) {
        th.addEventListener("click", function () {
          const key = th.getAttribute("data-sort");
          if (!key) return;
          const s2 = U.tableState("approvals-history");
          if (s2.sortKey === key) {
            s2.sortDir = s2.sortDir === "asc" ? "desc" : "asc";
          } else {
            s2.sortKey = key;
            s2.sortDir = "asc";
          }
          U.tableSave("approvals-history", s2);
          pages.approvals.render(root);
        });
      });

      root.querySelectorAll("[data-view]").forEach(function (button) {
        button.addEventListener("click", function () { pages.loans.openDetail(button.getAttribute("data-view")); });
      });
      root.querySelectorAll("[data-approve]").forEach(function (button) {
        button.addEventListener("click", function () {
          const approval = approvals.find(function (a) { return a.id === button.getAttribute("data-approve"); });
          if (approval) approve(approval);
        });
      });
      root.querySelectorAll("[data-reject]").forEach(function (button) {
        button.addEventListener("click", function () {
          const approval = approvals.find(function (a) { return a.id === button.getAttribute("data-reject"); });
          if (approval) reject(approval);
        });
      });
    }
  };
})();
