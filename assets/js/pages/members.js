(function () {
  "use strict";
  const COOP = (window.COOP = window.COOP || {});
  const U = COOP.utils;
  const D = COOP.domain;
  const UI = COOP.ui;
  const store = COOP.store;
  const pages = (COOP.pages = COOP.pages || {});

  function refresh(message) {
    if (message) UI.toast(message);
    UI.closeModal();
    if (COOP.app) COOP.app.refresh();
  }

  function errorBox() {
    return '<div class="alert danger hidden" data-form-error role="alert">' + U.icon("alert-triangle", "icon-sm") + "<div data-form-error-text></div></div>";
  }

  function showFormError(form, message) {
    const box = form.querySelector("[data-form-error]");
    const text = form.querySelector("[data-form-error-text]");
    if (!box || !text) return;
    text.textContent = message;
    box.classList.remove("hidden");
  }

  function stat(icon, label, value, hint, tone) {
    return '<div class="stat ' + (tone || "") + '">' +
      '<div class="stat-head"><span class="label">' + U.esc(label) + '</span><span class="stat-icon-wrap"><span class="stat-icon">' + U.icon(icon) + '</span><span class="stat-glow" aria-hidden="true"></span></span></div>' +
      '<div class="value">' + value + "</div>" + (hint ? '<div class="hint">' + hint + "</div>" : "") + "</div>";
  }

  function openForm(id) {
    const db = store.get();
    const member = id ? db.members.find(function (m) { return m.id === id; }) : null;
    if (id && !member) {
      UI.toast("Member not found.", "danger");
      return;
    }
    const settings = db.settings;

    const modal = UI.modal({
      title: member ? "Edit member" : "Add a member",
      subtitle: member ? "Update " + D.memberName(member) + "'s details." : "Add a member for shares, contributions, and loans.",
      size: "lg",
      body:
        errorBox() +
        '<form id="member-form" autocomplete="off">' +
          '<div class="form-grid">' +
            '<div class="field"><label for="m-first">First name<span class="req">*</span></label><input class="input" id="m-first" name="firstName" value="' + U.esc(member ? member.firstName : "") + '" required maxlength="60"></div>' +
            '<div class="field"><label for="m-last">Last name<span class="req">*</span></label><input class="input" id="m-last" name="lastName" value="' + U.esc(member ? member.lastName : "") + '" required maxlength="60"></div>' +
            '<div class="field"><label for="m-shares">Shares<span class="req">*</span></label><input class="input" id="m-shares" name="shares" type="number" min="0" step="any" value="' + U.esc(member ? member.shares : 0) + '" required></div>' +
            '<div class="field"><label for="m-monthly">Monthly contribution</label><input class="input" id="m-monthly" name="monthlyContribution" type="number" min="0" step="0.01" value="' + U.esc(member && member.monthlyContribution !== null && member.monthlyContribution !== undefined ? member.monthlyContribution : "") + '" placeholder="' + U.esc(U.number(settings.monthlyContribution, 2)) + '">' +
              '<div class="help">Blank uses the standard amount.</div></div>' +
            '<details class="form-advanced"><summary>More details</summary>' +
              '<div class="form-grid">' +
                '<div class="field"><label for="m-no">Member number</label><input class="input" id="m-no" name="memberNo" value="' + U.esc(member ? member.memberNo : D.nextMemberNo(db)) + '" maxlength="20">' +
                  '<div class="help">Keep the suggested number or enter your own.</div></div>' +
                '<div class="field"><label for="m-status">Status</label><select class="select" id="m-status" name="status">' +
                  '<option value="active"' + (!member || member.status !== "inactive" ? " selected" : "") + ">Active</option>" +
                  '<option value="inactive"' + (member && member.status === "inactive" ? " selected" : "") + ">Inactive</option></select></div>" +
                '<div class="field"><label for="m-middle">Middle name</label><input class="input" id="m-middle" name="middleName" value="' + U.esc(member ? member.middleName : "") + '" maxlength="60"></div>' +
                '<div class="field"><label for="m-join">Join date</label><input class="input" id="m-join" name="joinDate" type="date" value="' + U.esc(member ? member.joinDate : U.today()) + '"></div>' +
                '<div class="field"><label for="m-contact">Contact number</label><input class="input" id="m-contact" name="contact" value="' + U.esc(member ? member.contact : "") + '" maxlength="40"></div>' +
                '<div class="field"><label for="m-email">Email address</label><input class="input" id="m-email" name="email" type="email" value="' + U.esc(member ? member.email : "") + '" maxlength="120"></div>' +
                '<div class="field full"><label for="m-address">Address</label><input class="input" id="m-address" name="address" value="' + U.esc(member ? member.address : "") + '" maxlength="200"></div>' +
                '<div class="field full"><label for="m-notes">Notes</label><textarea class="textarea" id="m-notes" name="notes" rows="2" maxlength="500">' + U.esc(member ? member.notes : "") + "</textarea></div>" +
              "</div>" +
            "</details>" +
          "</div>" +
        "</form>",
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn primary" type="submit" form="member-form">' + U.icon("save", "icon-sm") + (member ? " Save changes" : " Add member") + "</button>",
      onMount: function (modalEl) {
        const form = modalEl.querySelector("#member-form");
        const submit = modalEl.querySelector("[form=member-form]");
        const sharesInput = form.querySelector("#m-shares");
        const monthlyInput = form.querySelector("#m-monthly");
        modalEl.querySelector("[data-cancel]").addEventListener("click", modal.close);

        sharesInput.addEventListener("input", function () {
          // Shares and monthly contribution are independent; no auto-calculation.
        });

        if (!member) {
          monthlyInput.value = U.esc(U.number(settings.monthlyContribution, 2));
        }

        form.addEventListener("submit", function (event) {
          event.preventDefault();
          const box = form.querySelector("[data-form-error]");
          if (box) box.classList.add("hidden");
          UI.setBusy(submit, true, "Saving…");
          try {
            COOP.actions.saveMember(UI.formData(form), member ? member.id : null);
            refresh(member ? "Member updated." : "Member added.");
          } catch (err) {
            showFormError(form, err.message);
            UI.setBusy(submit, false);
          }
        });
      }
    });
    return modal;
  }

  function openDetail(id) {
    const db = store.get();
    const member = db.members.find(function (m) { return m.id === id; });
    if (!member) {
      UI.toast("Member not found.", "danger");
      return;
    }
    const metrics = D.memberMetrics(db, member);
    const currentPeriod = U.monthKey();
    const currentRows = D.contributionRows(db, currentPeriod);
    const current = currentRows.rows.find(function (r) { return r.member.id === member.id; });
    const contributions = (db.contributions || [])
      .filter(function (c) { return c.memberId === member.id && !c.voided; })
      .slice().sort(function (a, b) { return String(b.period).localeCompare(String(a.period)); }).slice(0, 8);
    const loans = (db.loans || []).filter(function (loan) {
      return (loan.borrowerType === "member" && loan.memberId === member.id) ||
        (loan.borrowerType === "non_member" && loan.careOfMemberId === member.id);
    }).map(function (loan) {
      return { loan: loan, summary: D.loanLedger(loan, db.payments, U.today()) };
    }).sort(function (a, b) { return String(b.loan.startDate).localeCompare(String(a.loan.startDate)); });
    const linkedUser = (db.users || []).find(function (u) { return u.memberId === member.id; });
    const status = current ? D.contributionStatus(current.record, current.expected) : "unpaid";

    const loanRows = loans.length ? loans.map(function (item) {
      return '<tr><td><span class="strong">' + U.esc(item.loan.loanNo) + "</span>" +
        '<div class="sub">' + U.formatDate(item.loan.startDate) + "</div></td>" +
        '<td class="num">' + U.money(item.loan.principal) + "</td>" +
        '<td class="num">' + U.money(item.summary.balance) + "</td>" +
        '<td>' + UI.statusBadge(item.summary.displayStatus) + "</td>" +
        '<td class="actions"><button class="btn sm ghost" type="button" data-view-loan="' + U.esc(item.loan.id) + '">Open</button></td></tr>';
    }).join("") : '<tr><td colspan="5" class="empty-row">No loans recorded for this member.</td></tr>';

    const contributionRows = contributions.length ? contributions.map(function (c) {
      const expected = D.contributionExpectedFor(member, db.settings, c);
      const state = D.contributionStatus(c, expected);
      return "<tr><td>" + U.esc(U.formatMonth(c.period)) + "</td>" +
        '<td class="num">' + U.money(c.amount) + "</td>" +
        "<td>" + U.formatDate(c.datePaid) + "</td>" +
        "<td>" + UI.statusBadge(state) + "</td></tr>";
    }).join("") : '<tr><td colspan="4" class="empty-row">No contributions recorded yet.</td></tr>';

    const modal = UI.modal({
      title: "Member profile",
      subtitle: "Joined " + U.formatDate(member.joinDate),
      size: "lg",
      body:
        '<div class="member-hero mb-3">' + UI.avatar(D.memberName(member), "lg") +
          '<div class="meta"><h2>' + U.esc(D.memberName(member)) + "</h2>" +
            '<div class="sub">' + U.esc(member.contact || "No contact number") + (member.email ? " · " + U.esc(member.email) : "") + "</div>" +
            '<div class="pill-list mt-2">' + UI.statusBadge(member.status || "active") +
              (linkedUser ? UI.badge("Portal: " + linkedUser.username, "info") : "") +
              UI.badge(U.number(member.shares, 2) + " shares", "outline") + "</div></div>" +
          '<div class="hero-stat"><div class="label">Contribution this month</div><div class="value">' +
            (current ? U.money(current.paid) + " / " + U.money(current.expected) : U.money(0)) + "</div>" +
            '<div class="mt-1">' + UI.statusBadge(status) + "</div></div>" +
        "</div>" +
        '<div class="grid-4 mb-3">' +
          '<div class="summary-box"><div class="label">Total contributions</div><div class="value">' + U.money(metrics.contributions) + '</div><div class="sub">' + metrics.contributionCount + " posted</div></div>" +
          '<div class="summary-box"><div class="label">Shares</div><div class="value">' + U.number(metrics.shares, 2) + '</div><div class="sub">' + U.percent(metrics.sharePercent, 2) + " of total</div></div>" +
          '<div class="summary-box"><div class="label">Loan balance</div><div class="value">' + U.money(metrics.outstanding) + '</div><div class="sub">' + metrics.activeLoans + " active</div></div>" +
          '<div class="summary-box"><div class="label">Monthly due</div><div class="value">' + U.money(metrics.expectedMonthly) + '</div><div class="sub">' + (member.monthlyContribution !== null && member.monthlyContribution !== undefined ? "Custom amount" : "Shares × standard amount") + "</div></div>" +
        "</div>" +
        '<div class="grid-2">' +
          '<div class="card"><div class="card-head"><div><h3>Contact details</h3><div class="sub">Member information</div></div></div><div class="card-body">' +
            '<div class="info-list">' +
              '<div class="info-item"><div class="label">Address</div><div class="value ' + (member.address ? "" : "muted") + '">' + U.esc(member.address || "Not provided") + "</div></div>" +
              '<div class="info-item"><div class="label">Contact number</div><div class="value ' + (member.contact ? "" : "muted") + '">' + U.esc(member.contact || "Not provided") + "</div></div>" +
              '<div class="info-item"><div class="label">Email</div><div class="value ' + (member.email ? "" : "muted") + '">' + U.esc(member.email || "Not provided") + "</div></div>" +
              '<div class="info-item"><div class="label">Notes</div><div class="value ' + (member.notes ? "" : "muted") + '">' + U.esc(member.notes || "No notes") + "</div></div>" +
            "</div></div></div>" +
          '<div class="card"><div class="card-head"><div><h3>Current month</h3><div class="sub">' + U.esc(U.formatMonth(currentPeriod)) + "</div></div></div><div class=\"card-body\">" +
            (current ? '<div class="kv">' +
              "<dt>Expected</dt><dd>" + U.money(current.expected) + "</dd>" +
              "<dt>Paid</dt><dd>" + U.money(current.paid) + "</dd>" +
              "<dt>Balance</dt><dd>" + U.money(current.balance) + "</dd>" +
              "<dt>Due date</dt><dd>" + U.formatDate(current.dueDate) + "</dd>" +
              (current.penalty ? "<dt>Late penalty</dt><dd class=\"money-negative\">" + U.money(current.penalty) + "</dd>" : "") +
            "</div>" : '<div class="note">No current contribution record.</div>') +
            '<button class="btn soft mt-3" style="width:100%" type="button" data-record-contribution>' + U.icon("wallet", "icon-sm") +
            (current && current.paid > 0 ? " Edit contribution" : " Record contribution") + "</button>" +
          "</div></div>" +
        "</div>" +
        '<div class="card mt-3"><div class="card-head"><div><h3>Loans</h3><div class="sub">Loans as borrower or caring member</div></div></div>' +
          '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Loan</th><th class="num">Principal</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead><tbody>' + loanRows + "</tbody></table></div></div></div>" +
        '<div class="card mt-3"><div class="card-head"><div><h3>Contribution history</h3><div class="sub">Most recent posted contributions</div></div>' +
          '<a class="btn sm ghost" href="#/contributions">Open sheet' + U.icon("arrow-right", "icon-sm") + "</a></div>" +
          '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Month</th><th class="num">Amount</th><th>Paid on</th><th>Status</th></tr></thead><tbody>' + contributionRows + "</tbody></table></div></div></div>",
      footer:
        '<button class="btn" type="button" data-close>Close</button>' +
        '<button class="btn" type="button" data-edit>' + U.icon("edit", "icon-sm") + " Edit member</button>",
      onMount: function (modalEl) {
        modalEl.querySelector("[data-close]").addEventListener("click", modal.close);
        modalEl.querySelector("[data-edit]").addEventListener("click", function () {
          modal.close();
          openForm(member.id);
        });
        modalEl.querySelector("[data-record-contribution]").addEventListener("click", function () {
          modal.close();
          pages.contributions.openForm(current && current.record ? current.record.id : null, {
            memberId: member.id,
            period: currentPeriod
          });
        });
        modalEl.querySelectorAll("[data-view-loan]").forEach(function (button) {
          button.addEventListener("click", function () {
            modal.close();
            pages.loans.openDetail(button.getAttribute("data-view-loan"));
          });
        });
      }
    });
  }

  function confirmDelete(id) {
    const db = store.get();
    const member = db.members.find(function (m) { return m.id === id; });
    if (!member) return;
    UI.confirm({
      title: "Delete member?",
      message: "Delete " + D.memberName(member) + "? This is only allowed when the member has no linked contributions, loans, or portal account.",
      confirmLabel: "Delete member",
      tone: "danger"
    }).then(function (ok) {
      if (!ok) return;
      try {
        COOP.actions.deleteMember(id);
        refresh("Member deleted.");
      } catch (err) {
        UI.toast(err.message, "danger");
      }
    });
  }

  pages.members = {
    openForm: openForm,
    openDetail: openDetail,
    render: function (root) {
      const db = store.get();
      const funds = D.funds(db);
      const state = U.tableState("members");
      const currentRows = D.contributionRows(db, U.monthKey()).rows;
      const currentMap = {};
      currentRows.forEach(function (row) { currentMap[row.member.id] = row; });
      let members = (db.members || []).map(function (member) {
        const metrics = D.memberMetrics(db, member);
        return {
          member: member,
          metrics: metrics,
          _name: D.memberName(member),
          _shares: member.shares,
          _contributions: metrics.contributions,
          _outstanding: metrics.outstanding,
          _status: member.status || "active"
        };
      });
      if (state.sortKey) {
        members = U.sortByKey(members, "_" + state.sortKey.replace(/^_/, ""), state.sortDir);
      } else {
        members.sort(function (a, b) {
          const aCurrent = currentMap[a.member.id];
          const bCurrent = currentMap[b.member.id];
          const aUnpaid = aCurrent && aCurrent.status !== "paid" ? 1 : 0;
          const bUnpaid = bCurrent && bCurrent.status !== "paid" ? 1 : 0;
          if (aUnpaid !== bUnpaid) return bUnpaid - aUnpaid;
          const aActive = a.member.status !== "inactive" ? 1 : 0;
          const bActive = b.member.status !== "inactive" ? 1 : 0;
          if (aActive !== bActive) return bActive - aActive;
          const aBalance = a.metrics.outstanding > 0.005 ? 1 : 0;
          const bBalance = b.metrics.outstanding > 0.005 ? 1 : 0;
          if (aBalance !== bBalance) return bBalance - aBalance;
          return String(D.memberName(a.member)).localeCompare(String(D.memberName(b.member)));
        });
      }
      const linkedUsers = {};
      (db.users || []).forEach(function (u) { if (u.memberId) linkedUsers[u.memberId] = u; });

      const rows = members.length ? members.map(function (item) {
        const m = item.member;
        const metrics = item.metrics;
        const current = currentMap[m.id];
        const state2 = current ? D.contributionStatus(current.record, current.expected) : "unpaid";
        return '<tr class="row-click" data-row-id="' + U.esc(m.id) + '" data-search="' + U.esc((D.memberName(m) + " " + m.memberNo + " " + (m.contact || "")).toLowerCase()) + '" data-status="' + U.esc(m.status || "active") + '">' +
          '<td><div class="cell-person">' + UI.avatar(D.memberName(m)) +
            '<div class="meta"><div class="name">' + U.esc(D.memberName(m)) + "</div>" +
            '<div class="sub">' + (linkedUsers[m.id] ? "Portal linked" : "") + "</div></div></div></td>" +
          '<td class="num">' + U.number(metrics.shares, 2) + "</td>" +
          '<td class="num">' + U.money(metrics.contributions) + "</td>" +
          '<td class="num">' + U.money(metrics.outstanding) + "</td>" +
          "<td>" + UI.statusBadge(state2) + "</td>" +
          "<td>" + UI.statusBadge(m.status || "active") + "</td>" +
          '<td class="actions"><div class="row-actions">' +
            '<button class="btn sm ghost" type="button" data-view="' + U.esc(m.id) + '">View</button>' +
            '<button class="btn sm ghost" type="button" data-edit="' + U.esc(m.id) + '">Edit</button>' +
            '<button class="btn sm ghost" type="button" data-delete="' + U.esc(m.id) + '" title="Delete">' + U.icon("trash", "icon-sm") + "</button>" +
          "</div></td></tr>";
      }).join("") : "";

      root.innerHTML =
        '<div class="page-head"><div><span class="eyebrow">' + U.icon("users", "icon-sm") + " Membership</span>" +
          "<h1>Members</h1><div class=\"sub\">Members, shares, contributions, and loans.</div></div>" +
          '<div class="page-actions"><button class="btn" data-action="export">' + U.icon("download", "icon-sm") + " Export CSV</button>" +
          '<button class="btn primary" data-action="add">' + U.icon("user-plus", "icon-sm") + " Add member</button></div></div>" +
        '<div class="section"><div class="section-head">' +
          U.icon("users", "section-icon") +
          "<h3>Overview</h3>" +
        "</div>" +
        '<div class="stat-grid">' +
          stat("users", "Active members", U.number(funds.activeMembers, 0), funds.inactiveMembers + " inactive", "tone-success") +
          stat("layers", "Total shares", U.number(funds.totalShares, 2), "Basis for profit sharing") +
          stat("wallet", "Contributions", U.money(funds.totalContributions), "All posted contributions", "tone-info") +
          stat("hand-coins", "Member loan balance", U.money(funds.outstanding), funds.activeLoanCount + " active " + U.plural(funds.activeLoanCount, "loan")) +
        "</div></div>" +
        '<div class="section"><div class="section-head">' +
          U.icon("user", "section-icon") +
          "<h3>Member directory</h3>" +
          '<div class="section-sub">' + db.members.length + " " + U.plural(db.members.length, "record") + "</div>" +
        "</div>" +
        '<div class="card"><div class="card-body flush"><div class="table-filter mb-0"><div class="search">' + U.icon("search") + '<input class="input" id="member-search" placeholder="Search members…"></div>' +
        '<select class="select" id="member-status-filter"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div></div>' +
        '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr>' +
          '<th class="sortable" data-sort="name">Member' + (state.sortKey === "name" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable num" data-sort="shares">Shares' + (state.sortKey === "shares" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable num" data-sort="contributions">Contributions' + (state.sortKey === "contributions" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable num" data-sort="outstanding">Loan balance' + (state.sortKey === "outstanding" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th>This month</th>' +
          '<th>Status</th>' +
          '<th></th>' +
        '</tr></thead>' +
        "<tbody>" + (rows || '<tr><td colspan="7" class="empty-row">No members yet. Add the first member to begin.</td></tr>') + "</tbody></table></div>" +
        (members.length ? "" : '<div class="empty" style="border-top:1px solid var(--border)">' +
          '<div class="empty-icon">' + U.icon("users") + "</div><h3>Add your first member</h3>" +
          "<p>Member records hold share counts, monthly dues, contact details, and all linked financial history.</p>" +
          '<div class="empty-actions"><button class="btn primary" data-action="add">' + U.icon("user-plus", "icon-sm") + " Add member</button></div></div>") +
        "</div></div></div>";

      const search = root.querySelector("#member-search");
      const status = root.querySelector("#member-status-filter");
      function filterRows() {
        const q = search.value.toLowerCase().trim();
        const s = status.value;
        root.querySelectorAll("tbody tr[data-row-id]").forEach(function (row) {
          const matchesText = !q || row.getAttribute("data-search").indexOf(q) >= 0;
          const matchesStatus = !s || row.getAttribute("data-status") === s;
          row.style.display = matchesText && matchesStatus ? "" : "none";
        });
      }
      if (search) search.addEventListener("input", filterRows);
      if (status) status.addEventListener("change", filterRows);

      root.querySelectorAll("thead th.sortable").forEach(function (th) {
        th.addEventListener("click", function () {
          const key = th.getAttribute("data-sort");
          if (!key) return;
          if (state.sortKey === key) {
            state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
          } else {
            state.sortKey = key;
            state.sortDir = "asc";
          }
          U.tableSave("members", state);
          if (COOP.app) COOP.app.refresh();
        });
      });

      root.querySelectorAll("tbody tr[data-row-id]").forEach(function (row) {
        row.addEventListener("click", function (event) {
          if (event.target.closest("button")) return;
          openDetail(row.getAttribute("data-row-id"));
        });
      });

      root.querySelectorAll("[data-view]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          openDetail(button.getAttribute("data-view"));
        });
      });
      root.querySelectorAll("[data-edit]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          openForm(button.getAttribute("data-edit"));
        });
      });
      root.querySelectorAll("[data-delete]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          confirmDelete(button.getAttribute("data-delete"));
        });
      });
      root.querySelectorAll("[data-action=add]").forEach(function (button) {
        button.addEventListener("click", function () { openForm(); });
      });
      const exportButton = root.querySelector("[data-action=export]");
      if (exportButton) exportButton.addEventListener("click", function () {
        const rowsCSV = [["Member No", "Name", "Status", "Shares", "Monthly contribution", "Contributions", "Loan balance", "Contact", "Email", "Address", "Joined"]];
        members.forEach(function (item) {
          const m = item.member;
          rowsCSV.push([
            m.memberNo, D.memberName(m), m.status || "active", m.shares,
            D.monthlyContributionFor(m, db.settings), item.metrics.contributions,
            item.metrics.outstanding, m.contact, m.email, m.address, m.joinDate
          ]);
        });
        UI.downloadCSV("coop-members-" + U.today() + ".csv", rowsCSV);
        UI.toast("Member list exported.");
      });
    }
  };
})();
