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
      '<div class="value">' + value + "</div>" +
      (hint ? '<div class="hint">' + hint + "</div>" : "") +
    "</div>";
  }

  function setupBanner(db) {
    const membersDone = (db.members || []).length > 0;
    const contributionsDone = (db.contributions || []).some(function (c) { return !c.voided && c.amount > 0; });
    const loansDone = (db.loans || []).length > 0;
    if (membersDone && contributionsDone && loansDone) return "";
    return '<div class="setup-banner">' +
      '<div class="split"><div><h2>Finish setting up</h2>' +
      '<p>Add your members and record the first contributions and loan.</p></div>' +
      '<span class="badge warning">' + U.icon("clock", "icon-sm") + " Setup</span></div>" +
      '<div class="setup-steps">' +
        '<a class="setup-step done" href="#/settings"><span class="num">' + U.icon("check", "icon-sm") + "</span>Settings</a>" +
        '<a class="setup-step ' + (membersDone ? "done" : "") + '" href="#/members"><span class="num">' + (membersDone ? U.icon("check", "icon-sm") : "2") + "</span>Members</a>" +
        '<a class="setup-step ' + (contributionsDone ? "done" : "") + '" href="#/contributions"><span class="num">' + (contributionsDone ? U.icon("check", "icon-sm") : "3") + "</span>Contributions</a>" +
        '<a class="setup-step ' + (loansDone ? "done" : "") + '" href="#/loans"><span class="num">' + (loansDone ? U.icon("check", "icon-sm") : "4") + "</span>First loan</a>" +
      "</div>" +
    "</div>";
  }

  function openLoanList(data) {
    if (!data.dueLoans.length) {
      return UI.empty({ icon: "check-circle", title: "No open loans", message: "All recorded loans are settled.", small: true });
    }
    return '<div class="activity">' + data.dueLoans.map(function (item) {
      const summary = item.summary;
      return '<div class="activity-item" style="cursor:pointer" data-loan-id="' + U.esc(item.loan.id) + '">' +
        '<div class="activity-icon" style="color:var(--info)">' + U.icon("hand-coins", "icon-sm") + "</div>" +
        '<div class="copy"><div class="title">' + U.esc(D.borrowerName(item.loan, store.get())) + "</div>" +
        '<div class="meta">' + U.esc(item.loan.loanNo) + " - " + U.money(summary.balance) + " balance " +
        '<span class="badge info">Before December</span></div></div></div>';
    }).join("") + "</div>";
  }

  function renderTreasurer(root, db, data, user, firstName) {
    const funds = data.funds;
    const requests = (db.loanRequests || []).filter(function (r) { return r.status === "pending"; });
    const toRecommend = requests.filter(function (r) { return !r.recommendedBy; });
    const recommended = requests.filter(function (r) { return r.recommendedBy; });
    const overLimit = (db.approvals || []).filter(function (a) { return a.type === "over_limit_loan" && a.status === "pending" && !a.recommendedBy; }).length;

    root.innerHTML =
      '<div class="page-head"><div><span class="eyebrow">' + U.icon("shield", "icon-sm") + " Treasurer</span>" +
        "<h1>Treasurer Dashboard</h1>" +
        '<div class="sub">Welcome back, ' + U.esc(firstName) + ". Manage collections, loans, and payments — then endorse the requests you believe should be approved.</div></div>" +
        '<div class="page-actions">' +
          '<button class="btn" data-action="record-contribution">' + U.icon("wallet", "icon-sm") + " Record contribution</button>" +
          '<button class="btn" data-action="new-loan">' + U.icon("hand-coins", "icon-sm") + " New loan</button>" +
          '<button class="btn primary" data-action="record-payment">' + U.icon("credit-card", "icon-sm") + " Record payment</button>" +
        "</div></div>" +
      setupBanner(db) +
      '<div class="section"><div class="section-head">' + U.icon("banknote", "section-icon") + "<h3>Cash monitoring</h3></div></div>" +
      '<div class="stat-grid">' +
        stat("banknote", "Cash on hand", U.money(funds.cashOnHand), "Available for new loans", funds.cashOnHand < 0 ? "tone-danger" : "tone-success") +
        stat("hand-coins", "Loans outstanding", U.money(funds.outstanding), funds.activeLoanCount + " active " + U.plural(funds.activeLoanCount, "loan"), "tone-info") +
        stat("wallet", "Collected this month", U.money(funds.contributionsThisMonth), data.contributions.paidCount + " of " + data.contributions.rows.length + " members paid") +
        stat("coins", "Interest collected", U.money(funds.interestCollected), "Across all posted payments", "tone-success") +
      "</div>" +
      '<div class="detail-grid">' +
        '<div class="stack">' +
          '<div class="card"><div class="card-head"><div><h2>Quick actions</h2><div class="sub">Your core duties</div></div></div>' +
            '<div class="card-body"><div class="quick-grid">' +
              '<button class="quick-action" data-action="new-member">' + U.icon("user-plus") + " Add member</button>" +
              '<button class="quick-action" data-action="new-loan">' + U.icon("hand-coins") + " New loan</button>" +
              '<button class="quick-action" data-action="record-payment">' + U.icon("credit-card") + " Record payment</button>" +
              '<button class="quick-action" data-action="record-contribution">' + U.icon("wallet") + " Record contribution</button>" +
              '<a class="quick-action" href="#/cash">' + U.icon("banknote") + " Cash status</a>" +
              '<a class="quick-action" href="#/contributions">' + U.icon("wallet") + " Monthly sheet</a>" +
            "</div></div></div>" +
        "</div>" +
        '<div class="stack">' +
          '<div class="card"><div class="card-head"><div><h2>Loan & payment requests</h2><div class="sub">Review, then recommend to the president</div></div></div>' +
            '<div class="card-body"><div class="activity">' +
              '<div class="activity-item"><div class="activity-icon" style="color:var(--warning)">' + U.icon("hand-coins", "icon-sm") + "</div>" +
                '<div class="copy"><div class="title">' + toRecommend.length + " " + U.plural(toRecommend.length, "request") + " to review & recommend</div>" +
                '<div class="meta">Member avail-requests waiting for your endorsement</div></div></div>' +
              '<div class="activity-item"><div class="activity-icon" style="color:var(--info)">' + U.icon("scale", "icon-sm") + "</div>" +
                '<div class="copy"><div class="title">' + overLimit + " " + U.plural(overLimit, "over-limit loan") + " to recommend</div>" +
                '<div class="meta">Over-limit requests needing your endorsement</div></div></div>' +
              '<div class="activity-item"><div class="activity-icon" style="color:var(--success)">' + U.icon("check-circle", "icon-sm") + "</div>" +
                '<div class="copy"><div class="title">' + recommended.length + " recommended</div>" +
                '<div class="meta">Endorsed — awaiting the president\'s decision</div></div></div>' +
            "</div>" +
            '<a class="btn soft mt-3" style="width:100%" href="#/loans">Open loan requests' + U.icon("arrow-right", "icon-sm") + "</a></div></div>" +
          '<div class="card"><div class="card-head"><div><h2>This month\'s collections</h2><div class="sub">Contribution sheet snapshot</div></div>' +
            '<a class="btn sm ghost" href="#/contributions">Open sheet' + U.icon("arrow-right", "icon-sm") + "</a></div>" +
            '<div class="card-body">' +
              '<div class="progress-row"><div class="progress-label"><span>Collected</span><span>' + U.money(data.contributions.paid) + " of " + U.money(data.contributions.expected) + "</span></div></div>" +
              '<div class="summary-strip mt-3">' +
                '<div class="summary-box"><div class="label">Paid</div><div class="value">' + U.number(data.contributions.paidCount, 0) + '</div><div class="sub">members</div></div>' +
                '<div class="summary-box"><div class="label">Partial</div><div class="value">' + U.number(data.contributions.partialCount, 0) + '</div><div class="sub">members</div></div>' +
                '<div class="summary-box"><div class="label">Unpaid</div><div class="value">' + U.number(data.contributions.unpaidCount, 0) + '</div><div class="sub">members</div></div>' +
              "</div></div></div>" +
        "</div>" +
      "</div>";

    bindDashboardActions(root);
  }

  function renderPresident(root, db, data, user, firstName) {
    const funds = data.funds;
    const recommendedRequests = (db.loanRequests || []).filter(function (r) { return r.status === "pending" && r.recommendedBy; });
    const newRequests = (db.loanRequests || []).filter(function (r) { return r.status === "pending" && !r.recommendedBy; });
    const overLimitPending = (db.approvals || []).filter(function (a) { return a.type === "over_limit_loan" && a.status === "pending"; });
    const overLimitRecommended = overLimitPending.filter(function (a) { return a.recommendedBy; }).length;

    root.innerHTML =
      '<div class="page-head"><div><span class="eyebrow">' + U.icon("shield", "icon-sm") + " President</span>" +
        "<h1>President Dashboard</h1>" +
        '<div class="sub">Welcome back, ' + U.esc(firstName) + ". Final approvals recommended by the treasurer land here for your decision.</div></div></div>" +
      '<div class="stat-grid">' +
        stat("check-circle", "Your final decisions", U.number(recommendedRequests.length + overLimitRecommended, 0), "Recommended approvals waiting", recommendedRequests.length + overLimitRecommended ? "tone-warning" : "tone-success") +
        stat("hand-coins", "Unendorsed requests", U.number(newRequests.length + overLimitPending.length - overLimitRecommended, 0), "Awaiting the treasurer's recommendation") +
        stat("banknote", "Cash on hand", U.money(funds.cashOnHand), "Cooperative funds", funds.cashOnHand < 0 ? "tone-danger" : "tone-success") +
        stat("hand-coins", "Loans outstanding", U.money(funds.outstanding), funds.activeLoanCount + " active " + U.plural(funds.activeLoanCount, "loan"), "tone-info") +
      "</div>" +
      '<div class="card"><div class="card-head"><div><h2>Approval queue</h2><div class="sub">Recommended by the treasurer — approve or decline the release of funds</div></div>' +
        '<a class="btn sm ghost" href="#/loans">Open queue' + U.icon("arrow-right", "icon-sm") + "</a></div>" +
        '<div class="card-body"><div class="activity">' +
          '<div class="activity-item"><div class="activity-icon" style="color:var(--warning)">' + U.icon("user-plus", "icon-sm") + "</div>" +
            '<div class="copy"><div class="title">' + recommendedRequests.length + " " + U.plural(recommendedRequests.length, "member request") + " endorsed</div>" +
            '<div class="meta">Member loan-avail requests with treasurer recommendation</div></div></div>' +
          '<div class="activity-item"><div class="activity-icon" style="color:var(--info)">' + U.icon("scale", "icon-sm") + "</div>" +
            '<div class="copy"><div class="title">' + overLimitRecommended + " " + U.plural(overLimitRecommended, "over-limit loan") + " endorsed</div>" +
            '<div class="meta">Over-limit loans beyond the ceiling</div></div></div>' +
          '<div class="activity-item"><div class="activity-icon" style="color:var(--muted-2)">' + U.icon("clock", "icon-sm") + "</div>" +
            '<div class="copy"><div class="title">' + overLimitPending.length - overLimitRecommended + " " + U.plural(overLimitPending.length - overLimitRecommended, "over-limit loan") + " not yet endorsed</div>" +
            '<div class="meta">The treasurer has not yet reviewed these</div></div></div>' +
        "</div></div></div>";

    bindDashboardActions(root);
  }

  function bindDashboardActions(root) {
    root.querySelectorAll("[data-loan-id]").forEach(function (row) {
      row.addEventListener("click", function () {
        pages.loans.openDetail(row.getAttribute("data-loan-id"));
      });
    });
    root.querySelectorAll("[data-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        const action = button.getAttribute("data-action");
        if (action === "new-member") pages.members.openForm();
        if (action === "record-contribution") pages.contributions.openForm(null, { period: U.monthKey() });
        if (action === "new-loan") pages.loans.openForm();
        if (action === "record-payment") pages.payments.openForm();
      });
    });
  }

  pages.dashboard = {
    render: function (root) {
      const db = store.get();
      const data = D.dashboard(db);
      const user = store.currentUser();
      const firstName = String(user && user.name || "there").split(/\s+/)[0];
      if (user.role === "treasurer") return renderTreasurer(root, db, data, user, firstName);
      if (user.role === "president") return renderPresident(root, db, data, user, firstName);

      const funds = data.funds;
      const contributionPct = data.contributions.expected > 0 ? data.contributions.paid / data.contributions.expected : 0;
      const pending = data.pendingApprovals;

      root.innerHTML =
                '<div class="page-head">' +
          '<div><h1>Dashboard</h1>' +
            '<div class="sub">Welcome back, ' + U.esc(firstName) + ". Here is what needs attention today.</div></div>" +
          '<div class="page-actions">' +
            '<button class="btn" data-action="record-contribution">' + U.icon("wallet", "icon-sm") + " Record contribution</button>" +
            '<button class="btn primary" data-action="new-loan">' + U.icon("plus", "icon-sm") + " New loan</button>" +
          "</div>" +
        "</div>" +
        setupBanner(db) +
        '<div class="section"><div class="section-head">' +
          U.icon("banknote", "section-icon") +
          "<h3>Overview</h3>" +
        "</div>" +
        '<div class="stat-grid">' +
          stat("banknote", "Available cash", U.money(funds.cashOnHand), "Available for new loans", funds.cashOnHand < 0 ? "tone-danger" : "") +
          stat("hand-coins", "Loans outstanding", U.money(funds.outstanding), funds.activeLoanCount + " active " + U.plural(funds.activeLoanCount, "loan"), "tone-info") +
          stat("wallet", "Collected this month", U.money(funds.contributionsThisMonth), data.contributions.paidCount + " of " + data.contributions.rows.length + " members paid", contributionPct >= .8 ? "tone-success" : "tone-warning") +
          stat("users", "Active members", U.number(funds.activeMembers, 0), U.number(funds.totalShares, 0) + " total shares", "tone-success") +
        "</div></div>" +
        '<div class="section"><div class="section-head">' +
          U.icon("wallet", "section-icon") +
          "<h3>This month's contributions</h3>" +
        "</div>" +
        '<div class="detail-grid">' +
          '<div class="stack">' +
            '<div class="card"><div class="card-head"><div><h2>' + U.esc(U.formatMonth(data.contributions.period)) + ' contributions</h2>' +
              '<div class="sub">' + U.money(data.contributions.paid) + " of " + U.money(data.contributions.expected) + " expected</div></div>" +
              '<a class="btn sm ghost" href="#/contributions">Open contributions' + U.icon("arrow-right", "icon-sm") + "</a></div>" +
              '<div class="card-body">' +
                '<div class="progress-row"><div class="progress-label"><span>Collected</span><span>' + U.percent(contributionPct, 0) + "</span></div>" +
                '<div class="progress ' + (contributionPct >= .8 ? "success" : contributionPct >= .4 ? "" : "warning") + '"><span style="width:' + Math.round(contributionPct * 100) + '%"></span></div></div>' +
                '<div class="summary-strip mt-3">' +
                  '<div class="summary-box"><div class="label">Paid</div><div class="value">' + U.number(data.contributions.paidCount, 0) + '</div><div class="sub">members</div></div>' +
                  '<div class="summary-box"><div class="label">Partial</div><div class="value">' + U.number(data.contributions.partialCount, 0) + '</div><div class="sub">members</div></div>' +
                  '<div class="summary-box"><div class="label">Unpaid</div><div class="value">' + U.number(data.contributions.unpaidCount, 0) + '</div><div class="sub">members</div></div>' +
                "</div>" +
                '<button class="btn soft mt-3" style="width:100%" data-action="record-contribution">' + U.icon("plus", "icon-sm") + " Record a contribution</button>" +
              "</div></div>" +
            '<div class="card"><div class="card-head"><div><h2>Open loans</h2><div class="sub">' + data.dueSoon + " " + U.plural(data.dueSoon, "loan") + " with a balance. Aim to settle by December.</div></div>" +
              '<a class="btn sm ghost" href="#/loans">All loans' + U.icon("arrow-right", "icon-sm") + "</a></div>" +
              '<div class="card-body">' + openLoanList(data) + "</div></div>" +
          "</div>" +
          '<div class="stack">' +
            '<div class="card"><div class="card-head"><div><h2>Quick actions</h2></div></div>' +
              '<div class="card-body"><div class="quick-grid">' +
                '<button class="quick-action" data-action="record-payment">' + U.icon("credit-card") + " Record payment</button>" +
                '<button class="quick-action" data-action="new-member">' + U.icon("user-plus") + " Add member</button>" +
                '<a class="quick-action" href="#/reports">' + U.icon("chart") + " View reports</a>" +
                '<a class="quick-action" href="#/loans">' + U.icon("hand-coins") + " Open loans</a>" +
              "</div></div></div>" +
            (pending ? '<div class="card"><div class="card-head"><div><h2>Approvals</h2><div class="sub">Loans waiting for a decision</div></div></div>' +
              '<div class="card-body"><div class="alert warning">' + U.icon("alert-triangle", "icon-sm") +
              "<div><strong>" + pending + " " + U.plural(pending, "request") + "</strong> waiting for approval.</div></div>" +
              '<a class="btn soft mt-3" style="width:100%" href="#/approvals">Review approvals' + U.icon("arrow-right", "icon-sm") + "</a></div></div>" : "") +
          "</div>" +
        "</div></div>";

      root.querySelectorAll("[data-loan-id]").forEach(function (row) {
        row.addEventListener("click", function () {
          pages.loans.openDetail(row.getAttribute("data-loan-id"));
        });
      });
      root.querySelectorAll("[data-action]").forEach(function (button) {
        button.addEventListener("click", function () {
          const action = button.getAttribute("data-action");
          if (action === "new-member") pages.members.openForm();
          if (action === "record-contribution") pages.contributions.openForm(null, { period: U.monthKey() });
          if (action === "new-loan") pages.loans.openForm();
          if (action === "record-payment") pages.payments.openForm();
        });
      });
    }
  };
})();
