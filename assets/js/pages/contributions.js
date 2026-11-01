(function () {
  "use strict";
  const COOP = (window.COOP = window.COOP || {});
  const U = COOP.utils;
  const D = COOP.domain;
  const UI = COOP.ui;
  const store = COOP.store;
  const pages = (COOP.pages = COOP.pages || {});

  let currentPeriod = U.monthKey();
  let currentTab = "sheet";

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

  function shiftPeriod(delta) {
    const m = U.monthOf(currentPeriod);
    if (!m) return;
    const d = new Date(m.year, m.month + delta, 1);
    currentPeriod = U.monthKey(d);
  }

  function openForm(id, defaults) {
    const db = store.get();
    const options = defaults || {};
    const record = id ? db.contributions.find(function (c) { return c.id === id; }) : null;
    if (id && !record) {
      UI.toast("Contribution not found.", "danger");
      return;
    }
    if (record && record.voided) {
      UI.toast("Voided contributions cannot be edited.", "danger");
      return;
    }
    const memberId = record ? record.memberId : (options.memberId || "");
    const period = record ? record.period : (options.period || currentPeriod);
    const selectedMember = db.members.find(function (m) { return m.id === memberId; });
    const expected = selectedMember ? (record ? D.contributionExpectedFor(selectedMember, db.settings, record) : D.contributionExpected(selectedMember, db.settings)) : 0;
    const members = D.memberOptions(db, true);

    const modal = UI.modal({
      title: record ? "Edit contribution" : "Record contribution",
      subtitle: "Record a member's monthly contribution.",
      size: "md",
      body:
        errorBox() +
        '<form id="contribution-form" autocomplete="off"><div class="form-grid">' +
          '<div class="field full"><label for="c-member">Member<span class="req">*</span></label>' +
            '<select class="select" id="c-member" name="memberId" required>' +
              UI.options(members.map(function (m) { return { value: m.id, label: D.memberLabel(m) }; }), memberId, "Select member") +
            "</select></div>" +
          '<div class="field full"><label for="c-period">Contribution month<span class="req">*</span></label>' +
            '<input class="input" id="c-period" name="period" type="month" value="' + U.esc(period) + '" required></div>' +
          '<div class="field full"><label for="c-amount">Amount paid<span class="req">*</span></label>' +
            '<input class="input" id="c-amount" name="amount" type="number" min="0" step="0.01" value="' + U.esc(record ? record.amount : expected) + '" required></div>' +
            '<div class="field full"><label for="c-expected">Expected amount</label>' +
            '<input class="input" id="c-expected" name="expected" type="number" min="0" step="0.01" readonly></div>' +
            '<div class="field full"><div id="c-expected-help" class="help"></div></div>' +
          '<div class="field full"><label for="c-date">Date paid</label><input class="input" id="c-date" name="datePaid" type="date" value="' + U.esc(record ? record.datePaid : U.today()) + '"></div>' +
          '<details class="form-advanced"><summary>More details</summary>' +
            '<div class="form-grid">' +
              '<div class="field full"><label for="c-method">Method</label><select class="select" id="c-method" name="method">' +
                UI.options(D.PAYMENT_METHODS, record ? record.method : "Cash") + "</select></div>" +
              '<div class="field full"><label for="c-reference">Reference</label><input class="input" id="c-reference" name="reference" value="' + U.esc(record ? record.reference : "") + '" placeholder="Optional"></div>' +
              '<div class="field full"><label class="check" style="padding:0"><input type="checkbox" id="c-waived" name="waived"' + (record && record.status === "waived" ? " checked" : "") + '>' +
                '<span><span class="check-text">Waive this month</span><span class="help">No cash is collected for a waived month.</span></span></label></div>' +
            "</div>" +
          "</details>" +
        "</div></form>",
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn primary" type="submit" form="contribution-form">' + U.icon("save", "icon-sm") + (record ? " Save changes" : " Post contribution") + "</button>",
      onMount: function (modalEl) {
        const form = modalEl.querySelector("#contribution-form");
        const memberSelect = form.querySelector("#c-member");
        const periodInput = form.querySelector("#c-period");
        const amount = form.querySelector("#c-amount");
        const expectedInput = form.querySelector("#c-expected");
        const dateInput = form.querySelector("#c-date");
        const waived = form.querySelector("#c-waived");
        const expectedHelp = form.querySelector("#c-expected-help");
        const submit = modalEl.querySelector("[form=contribution-form]");
        modalEl.querySelector("[data-cancel]").addEventListener("click", modal.close);

        function currentDue() {
          const member = db.members.find(function (m) { return m.id === memberSelect.value; });
          if (!member) return 0;
          if (waived.checked) return 0;
          if (record && record.status !== "waived" && record.memberId === member.id && record.period === periodInput.value) {
            return D.contributionExpectedFor(member, db.settings, record);
          }
          return D.contributionExpected(member, db.settings);
        }

        function updateExpected(keepValue) {
          const member = db.members.find(function (m) { return m.id === memberSelect.value; });
          const due = currentDue();
          expectedHelp.textContent = member
            ? (waived.checked ? "Waived this month." : "Expected: " + U.money(due))
            : "Select a member to see the expected amount.";
          if (expectedInput) expectedInput.value = due;
          if (!keepValue) amount.value = due;
          amount.max = due > 0 ? due : "";
        }
        memberSelect.addEventListener("change", function () { updateExpected(false); });
        periodInput.addEventListener("change", function () { updateExpected(false); });
        waived.addEventListener("change", function () {
          amount.disabled = waived.checked;
          dateInput.disabled = waived.checked;
          if (waived.checked) {
            amount.value = 0;
            updateExpected(true);
          } else {
            if (!dateInput.value) dateInput.value = U.today();
            updateExpected(false);
          }
        });
        if (record && record.status === "waived") {
          amount.value = 0;
          amount.disabled = true;
          dateInput.disabled = true;
        }
        updateExpected(true);

        form.addEventListener("submit", function (event) {
          event.preventDefault();
          const box = form.querySelector("[data-form-error]");
          if (box) box.classList.add("hidden");
          UI.setBusy(submit, true, "Saving…");
          try {
            COOP.actions.saveContribution(UI.formData(form), record ? record.id : null);
            refresh(record ? "Contribution updated." : "Contribution posted.");
          } catch (err) {
            showFormError(form, err.message);
            UI.setBusy(submit, false);
          }
        });
      }
    });
    return modal;
  }

  function voidRecord(id) {
    const db = store.get();
    const record = db.contributions.find(function (c) { return c.id === id; });
    if (!record) return;
    const member = db.members.find(function (m) { return m.id === record.memberId; });
    UI.askReason({
      title: "Void contribution",
      message: "Void " + (member ? D.memberName(member) : "this member") + "'s " + U.formatMonth(record.period) + " contribution of " + U.money(record.amount) + "?",
      label: "Reason for voiding",
      confirmLabel: "Void contribution",
      tone: "danger"
    }).then(function (reason) {
      if (!reason) return;
      try {
        COOP.actions.voidContribution(id, reason);
        UI.toast("Contribution voided.");
        if (COOP.app) COOP.app.refresh();
      } catch (err) {
        UI.toast(err.message, "danger");
      }
    });
  }

  function renderSheet(db, sheet) {
    const state = U.tableState("contributions-sheet");
    let rows = sheet.rows.length ? sheet.rows.slice() : [];
    rows.forEach(function (row) {
      row._memberName = row.member ? D.memberName(row.member) : "";
    });
    if (state.sortKey) {
      rows = U.sortByKey(rows, state.sortKey === "memberName" ? "_memberName" : state.sortKey, state.sortDir);
    } else {
      rows.sort(function (a, b) {
        const aUnpaid = a.status !== "paid" ? 1 : 0;
        const bUnpaid = b.status !== "paid" ? 1 : 0;
        if (aUnpaid !== bUnpaid) return bUnpaid - aUnpaid;
        return String(a._memberName).localeCompare(String(b._memberName));
      });
    }
    const rowHtml = rows.length ? rows.map(function (row) {
      const m = row.member;
      return '<tr class="row-click" data-member-id="' + U.esc(m.id) + '" data-search="' + U.esc((D.memberName(m) + " " + m.memberNo + " " + row.status).toLowerCase()) + '">' +
        '<td><div class="cell-person">' + UI.avatar(D.memberName(m)) +
          '<div class="meta"><div class="name">' + U.esc(D.memberName(m)) + '</div><div class="sub"></div></div></div></td>' +
        '<td class="num">' + U.money(row.expected) + "</td>" +
        '<td class="num">' + U.money(row.paid) + "</td>" +
        '<td class="num">' + U.money(row.balance) + "</td>" +
        "<td>" + UI.statusBadge(row.status) + "</td>" +
        "<td>" + (row.paidDate ? U.formatDate(row.paidDate) : "—") + "</td>" +
        '<td class="num">' + (row.penalty ? '<span class="badge warning">' + U.money(row.penalty) + "</span>" : "—") + "</td>" +
        '<td class="actions"><button class="btn sm ghost" type="button" data-record-for="' + U.esc(m.id) + '">' +
          (row.record ? "Edit" : "Record") + "</button></td></tr>";
    }).join("") : '<tr><td colspan="8" class="empty-row">No active members. Add members first.</td></tr>';

    return '<div class="card"><div class="card-head"><div><h2>' + U.esc(U.formatMonth(sheet.period)) + " collection sheet</h2>" +
      '<div class="sub">Due ' + U.formatDate(sheet.dueDate) + " · " + rows.length + " active members</div></div>" +
      '<div class="table-filter mb-0"><div class="search">' + U.icon("search") + '<input class="input" id="contribution-sheet-search" placeholder="Search member…"></div></div></div>' +
      '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr>' +
        '<th class="sortable" data-sort="memberName">Member' + (state.sortKey === "memberName" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
        '<th class="sortable num" data-sort="expected">Expected' + (state.sortKey === "expected" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
        '<th class="sortable num" data-sort="paid">Paid' + (state.sortKey === "paid" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
        '<th class="sortable num" data-sort="balance">Balance' + (state.sortKey === "balance" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
        '<th class="sortable" data-sort="status">Status' + (state.sortKey === "status" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
        '<th class="sortable" data-sort="paidDate">Paid on' + (state.sortKey === "paidDate" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
        '<th class="sortable num" data-sort="penalty">Penalty' + (state.sortKey === "penalty" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
        '<th></th>' +
        '</tr></thead><tbody>' +
        rowHtml + "</tbody></table></div></div></div>";
  }

  function renderHistory(db) {
    const state = U.tableState("contributions-history");
    let contributions = (db.contributions || []).slice();
    contributions.forEach(function (c) {
      const m = db.members.find(function (x) { return x.id === c.memberId; });
      c._memberName = m ? D.memberName(m) : "";
    });
    if (state.sortKey) {
      contributions = U.sortByKey(contributions, state.sortKey === "memberName" ? "_memberName" : state.sortKey, state.sortDir);
    } else {
      contributions.sort(function (a, b) {
        const aMember = db.members.find(function (m) { return m.id === a.memberId; });
        const bMember = db.members.find(function (m) { return m.id === b.memberId; });
        const aStatus = a.voided ? "voided" : D.contributionStatus(a, aMember ? D.contributionExpectedFor(aMember, db.settings, a) : 0);
        const bStatus = b.voided ? "voided" : D.contributionStatus(b, bMember ? D.contributionExpectedFor(bMember, db.settings, b) : 0);
        const aPaid = aStatus === "paid" ? 1 : 0;
        const bPaid = bStatus === "paid" ? 1 : 0;
        if (aPaid !== bPaid) return bPaid - aPaid;
        return String(b.period + (b.datePaid || "")).localeCompare(String(a.period + (a.datePaid || "")));
      });
    }
    const rows = contributions.length ? contributions.map(function (record) {
      const member = db.members.find(function (m) { return m.id === record.memberId; });
      const expected = member ? D.contributionExpectedFor(member, db.settings, record) : 0;
      const state2 = record.voided ? "voided" : D.contributionStatus(record, expected);
      return '<tr data-search="' + U.esc(((member ? D.memberName(member) : "") + " " + record.period + " " + (record.reference || "") + " " + state2).toLowerCase()) + '">' +
        "<td>" + U.esc(U.formatMonth(record.period)) + "</td>" +
        '<td><div class="cell-person">' + UI.avatar(member ? D.memberName(member) : "?") +
          '<div class="meta"><div class="name">' + U.esc(member ? D.memberName(member) : "Unknown member") + "</div>" +
          '<div class="sub"></div></div></div></td>' +
        '<td class="num">' + U.money(record.amount) + "</td>" +
        "<td>" + U.formatDate(record.datePaid) + "</td>" +
        "<td>" + U.esc(record.method || "—") + "</td>" +
        "<td>" + UI.statusBadge(state2) + "</td>" +
        '<td class="actions">' + (record.voided ? "" :
          '<button class="btn sm ghost" type="button" data-edit="' + U.esc(record.id) + '">Edit</button>' +
          '<button class="btn sm ghost" type="button" data-void="' + U.esc(record.id) + '">Void</button>') + "</td></tr>";
    }).join("") : '<tr><td colspan="7" class="empty-row">No contribution records yet.</td></tr>';

      return '<div class="card"><div class="card-head"><div><h2>Contribution records</h2><div class="sub">' + contributions.length + " " + U.plural(contributions.length, "record") + "</div></div>" +
      '<div class="table-filter mb-0"><div class="search">' + U.icon("search") + '<input class="input" id="contribution-history-search" placeholder="Search records…"></div></div></div>' +
      '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr>' +
        '<th class="sortable" data-sort="period">Month' + (state.sortKey === "period" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
        '<th class="sortable" data-sort="memberName">Member' + (state.sortKey === "memberName" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
        '<th class="sortable num" data-sort="amount">Amount' + (state.sortKey === "amount" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
        '<th class="sortable" data-sort="datePaid">Paid on' + (state.sortKey === "datePaid" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
        '<th class="sortable" data-sort="method">Method' + (state.sortKey === "method" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
        '<th class="sortable" data-sort="status">Status' + (state.sortKey === "status" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
        '<th></th>' +
      '</tr></thead><tbody>' +
      rows + "</tbody></table></div></div></div>";
  }

  pages.contributions = {
    openForm: openForm,
    render: function (root) {
      const db = store.get();
      const sheet = D.contributionRows(db, currentPeriod);
      const pct = sheet.expected > 0 ? sheet.paid / sheet.expected : 0;
      const allContributions = (db.contributions || []).filter(function (c) { return !c.voided; });
      const collected = U.sum(allContributions, function (c) { return c.amount; });

      root.innerHTML =
        '<div class="page-head"><div><span class="eyebrow">' + U.icon("wallet", "icon-sm") + " Collections</span>" +
          "<h1>Contributions</h1><div class=\"sub\">Monthly dues and collection status.</div></div>" +
          '<div class="page-actions"><button class="btn" data-action="export">' + U.icon("download", "icon-sm") + " Export</button>" +
          '<button class="btn primary" data-action="add">' + U.icon("plus", "icon-sm") + " Record contribution</button></div></div>" +
        '<div class="card mb-3"><div class="card-body"><div class="split">' +
          '<div class="inline"><button class="btn icon-only" data-action="prev" title="Previous month">' + U.icon("chevron-right", "icon-sm rotate-180") + "</button>" +
          '<input class="input" type="month" id="contribution-period" value="' + U.esc(currentPeriod) + '" style="width:170px">' +
          '<button class="btn icon-only" data-action="next" title="Next month">' + U.icon("chevron-right", "icon-sm") + "</button>" +
          '<button class="btn sm ghost" data-action="this-month">This month</button></div>' +
          '<div class="chart-legend"><span><span class="swatch"></span>' + U.percent(pct, 0) + " collected</span><span>Due " + U.formatDate(sheet.dueDate) + "</span></div>" +
        "</div></div></div>" +
        '<div class="stat-grid">' +
          stat("clipboard-list", "Expected", U.money(sheet.expected), sheet.rows.length + " active members") +
          stat("wallet", "Collected", U.money(sheet.paid), U.percent(pct, 1) + " of expected", pct >= .8 ? "tone-success" : "tone-warning") +
          stat("clock", "Outstanding", U.money(sheet.balance), sheet.unpaidCount + " unpaid · " + sheet.partialCount + " partial", sheet.balance > 0 ? "tone-danger" : "") +
          stat("coins", "All-time collections", U.money(collected), allContributions.length + " posted records", "tone-info") +
        "</div>" +
        '<div class="tabs"><button class="tab ' + (currentTab === "sheet" ? "active" : "") + '" data-tab="sheet">Monthly sheet</button>' +
          '<button class="tab ' + (currentTab === "history" ? "active" : "") + '" data-tab="history">Posted records <span class="count">' + allContributions.length + "</span></button></div>" +
        '<div id="contribution-content">' + (currentTab === "sheet" ? renderSheet(db, sheet) : renderHistory(db)) + "</div>";

      root.querySelectorAll("[data-tab]").forEach(function (button) {
        button.addEventListener("click", function () {
          currentTab = button.getAttribute("data-tab");
          pages.contributions.render(root);
        });
      });
      root.querySelectorAll("[data-action=prev]").forEach(function (button) {
        button.addEventListener("click", function () { shiftPeriod(-1); pages.contributions.render(root); });
      });
      root.querySelectorAll("[data-action=next]").forEach(function (button) {
        button.addEventListener("click", function () { shiftPeriod(1); pages.contributions.render(root); });
      });
      root.querySelectorAll("[data-action=this-month]").forEach(function (button) {
        button.addEventListener("click", function () { currentPeriod = U.monthKey(); pages.contributions.render(root); });
      });
      const periodInput = root.querySelector("#contribution-period");
      if (periodInput) periodInput.addEventListener("change", function () {
        if (/^\d{4}-\d{2}$/.test(periodInput.value)) {
          currentPeriod = periodInput.value;
          pages.contributions.render(root);
        }
      });
      const searchId = currentTab === "sheet" ? "#contribution-sheet-search" : "#contribution-history-search";
      const search = root.querySelector(searchId);
      if (search) search.addEventListener("input", function () {
        const q = search.value.toLowerCase().trim();
        root.querySelectorAll("tbody tr[data-search]").forEach(function (row) {
          row.style.display = !q || row.getAttribute("data-search").indexOf(q) >= 0 ? "" : "none";
        });
      });
      root.querySelectorAll("thead th.sortable").forEach(function (th) {
        th.addEventListener("click", function () {
          const key = th.getAttribute("data-sort");
          if (!key) return;
          const stateKey = currentTab === "sheet" ? "contributions-sheet" : "contributions-history";
          const state = U.tableState(stateKey);
          if (state.sortKey === key) {
            state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
          } else {
            state.sortKey = key;
            state.sortDir = "asc";
          }
          U.tableSave(stateKey, state);
          pages.contributions.render(root);
        });
      });
      root.querySelectorAll("[data-row-click], tbody tr[data-member-id]").forEach(function (row) {
        row.addEventListener("click", function (event) {
          if (event.target.closest("button")) return;
          const memberId = row.getAttribute("data-member-id");
          const memberRow = sheet.rows.find(function (r) { return r.member.id === memberId; });
          openForm(memberRow && memberRow.record ? memberRow.record.id : null, { memberId: memberId, period: currentPeriod });
        });
      });
      root.querySelectorAll("[data-record-for]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          const memberId = button.getAttribute("data-record-for");
          const memberRow = sheet.rows.find(function (r) { return r.member.id === memberId; });
          openForm(memberRow && memberRow.record ? memberRow.record.id : null, { memberId: memberId, period: currentPeriod });
        });
      });
      root.querySelectorAll("[data-edit]").forEach(function (button) {
        button.addEventListener("click", function () { openForm(button.getAttribute("data-edit")); });
      });
      root.querySelectorAll("[data-void]").forEach(function (button) {
        button.addEventListener("click", function () { voidRecord(button.getAttribute("data-void")); });
      });
      root.querySelectorAll("[data-action=add]").forEach(function (button) {
        button.addEventListener("click", function () { openForm(null, { period: currentPeriod }); });
      });
      const exportButton = root.querySelector("[data-action=export]");
      if (exportButton) exportButton.addEventListener("click", function () {
        if (currentTab === "sheet") {
          const csv = [["Member No", "Member", "Month", "Expected", "Paid", "Balance", "Status", "Paid on", "Penalty"]];
          sheet.rows.forEach(function (r) {
            csv.push([r.member.memberNo, D.memberName(r.member), sheet.period, r.expected, r.paid, r.balance, r.status, r.paidDate, r.penalty]);
          });
          UI.downloadCSV("coop-contributions-" + sheet.period + ".csv", csv);
        } else {
          const csv = [["Month", "Member", "Amount", "Date paid", "Method", "Reference", "Status"]];
          (db.contributions || []).forEach(function (record) {
            const member = db.members.find(function (m) { return m.id === record.memberId; });
            csv.push([record.period, member ? D.memberName(member) : "", record.amount, record.datePaid, record.method, record.reference, record.voided ? "voided" : D.contributionStatus(record, member ? D.contributionExpectedFor(member, db.settings, record) : 0)]);
          });
          UI.downloadCSV("coop-contribution-records.csv", csv);
        }
        UI.toast("Contribution data exported.");
      });
    }
  };
})();
