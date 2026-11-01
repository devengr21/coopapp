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

  function openForm(id) {
    const db = store.get();
    const entry = id ? db.cashAdjustments.find(function (a) { return a.id === id; }) : null;
    if (id && !entry) {
      UI.toast("Cash entry not found.", "danger");
      return;
    }
    if (entry && entry.voided) {
      UI.toast("Voided entries cannot be edited.", "danger");
      return;
    }
    const modal = UI.modal({
      title: entry ? "Edit cash entry" : "Add cash entry",
      subtitle: "Record income, expenses, deposits, withdrawals, or manual corrections outside contributions and loans.",
      size: "md",
      body:
        '<div class="alert danger hidden" data-form-error role="alert">' + U.icon("alert-triangle", "icon-sm") + "<div data-form-error-text></div></div>" +
        '<form id="cash-form" autocomplete="off"><div class="form-grid">' +
          '<div class="field"><label for="cash-direction">Direction<span class="req">*</span></label><select class="select" id="cash-direction" name="direction">' +
            '<option value="in"' + (!entry || entry.direction === "in" ? " selected" : "") + ">Cash in</option>" +
            '<option value="out"' + (entry && entry.direction === "out" ? " selected" : "") + ">Cash out</option></select></div>" +
          '<div class="field"><label for="cash-date">Date<span class="req">*</span></label><input class="input" id="cash-date" name="date" type="date" value="' + U.esc(entry ? entry.date : U.today()) + '" required></div>' +
          '<div class="field"><label for="cash-amount">Amount<span class="req">*</span></label><input class="input" id="cash-amount" name="amount" type="number" min="0.01" step="0.01" value="' + U.esc(entry ? entry.amount : "") + '" required></div>' +
          '<div class="field"><label for="cash-category">Category</label><select class="select" id="cash-category" name="category">' +
            UI.options(["Operating expense", "Supplies", "Transport", "Bank deposit", "Cash withdrawal", "Other income", "Adjustment"], entry ? entry.category : "Operating expense") + "</select></div>" +
          '<div class="field full"><label for="cash-description">Description<span class="req">*</span></label><input class="input" id="cash-description" name="description" value="' + U.esc(entry ? entry.description : "") + '" placeholder="What was this cash movement for?" required maxlength="160"></div>' +
          '<div class="field full"><label for="cash-reference">Reference</label><input class="input" id="cash-reference" name="reference" value="' + U.esc(entry ? entry.reference : "") + '" placeholder="Optional voucher or reference"></div>' +
        "</div></form>",
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn primary" type="submit" form="cash-form">' + U.icon("save", "icon-sm") + (entry ? " Save changes" : " Add entry") + "</button>",
      onMount: function (modalEl) {
        const form = modalEl.querySelector("#cash-form");
        const submit = modalEl.querySelector("[form=cash-form]");
        modalEl.querySelector("[data-cancel]").addEventListener("click", modal.close);
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          const box = form.querySelector("[data-form-error]");
          if (box) box.classList.add("hidden");
          UI.setBusy(submit, true, "Saving…");
          try {
            COOP.actions.saveCashAdjustment(UI.formData(form), entry ? entry.id : null);
            UI.closeModal();
            UI.toast(entry ? "Cash entry updated." : "Cash entry added.");
            if (COOP.app) COOP.app.refresh();
          } catch (err) {
            const text = form.querySelector("[data-form-error-text]");
            if (box && text) { text.textContent = err.message; box.classList.remove("hidden"); }
            UI.setBusy(submit, false);
          }
        });
      }
    });
    return modal;
  }

  function voidEntry(id) {
    const db = store.get();
    const entry = db.cashAdjustments.find(function (a) { return a.id === id; });
    if (!entry) return;
    UI.askReason({
      title: "Void cash entry",
      message: "Void this " + (entry.direction === "in" ? "cash in" : "cash out") + " entry of " + U.money(entry.amount) + "?",
      label: "Reason for voiding",
      confirmLabel: "Void entry",
      tone: "danger"
    }).then(function (reason) {
      if (!reason) return;
      try {
        COOP.actions.voidCashAdjustment(id, reason);
        UI.toast("Cash entry voided.");
        if (COOP.app) COOP.app.refresh();
      } catch (err) {
        UI.toast(err.message, "danger");
      }
    });
  }

  pages.cash = {
    render: function (root) {
      const db = store.get();
      const f = D.funds(db);
      const state = U.tableState("cash");
      let entries = (db.cashAdjustments || []).slice();
      if (state.sortKey) {
        entries = U.sortByKey(entries, state.sortKey, state.sortDir);
      } else {
        entries.sort(function (a, b) {
          return String(b.date).localeCompare(String(a.date)) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
        });
      }
      const manualIn = U.sum(entries.filter(function (e) { return !e.voided && e.direction === "in"; }), function (e) { return e.amount; });
      const manualOut = U.sum(entries.filter(function (e) { return !e.voided && e.direction === "out"; }), function (e) { return e.amount; });
      const rows = entries.length ? entries.map(function (entry) {
        return '<tr class="row-click" data-cash-row="' + U.esc(entry.id) + '" data-search="' + U.esc((entry.description + " " + entry.category + " " + (entry.reference || "")).toLowerCase()) + '">' +
          "<td>" + U.formatDate(entry.date) + "</td>" +
          "<td>" + (entry.direction === "in" ? '<span class="badge success">Cash in</span>' : '<span class="badge danger">Cash out</span>') + "</td>" +
          "<td>" + U.esc(entry.category) + "</td>" +
          '<td class="sub">' + U.esc(entry.description) + (entry.reference ? '<div class="sub">Ref: ' + U.esc(entry.reference) + "</div>" : "") + "</td>" +
          '<td class="num ' + (entry.direction === "in" ? "money-positive" : "money-negative") + '">' +
            (entry.direction === "in" ? "+" : "-") + U.money(entry.amount) + "</td>" +
          "<td>" + (entry.voided ? UI.statusBadge("voided") : UI.statusBadge("posted")) + "</td>" +
          '<td class="actions">' + (entry.voided ? "" :
            '<button class="btn sm ghost" type="button" data-edit="' + U.esc(entry.id) + '">Edit</button>' +
            '<button class="btn sm ghost" type="button" data-void="' + U.esc(entry.id) + '">Void</button>') + "</td></tr>";
      }).join("") : '<tr><td colspan="7" class="empty-row">No manual cash entries yet.</td></tr>';

      root.innerHTML =
        '<div class="page-head"><div><span class="eyebrow">' + U.icon("banknote", "icon-sm") + " Treasury</span>" +
          "<h1>Cash</h1><div class=\"sub\">Cash on hand and manual cash entries.</div></div>" +
          '<div class="page-actions"><button class="btn" data-action="export">' + U.icon("download", "icon-sm") + " Export CSV</button>" +
          '<button class="btn primary" data-action="add">' + U.icon("plus", "icon-sm") + " Add cash entry</button></div></div>" +
        '<div class="stat-grid">' +
          stat("banknote", "Cash on hand", U.money(f.cashOnHand), "Revolving loan fund", f.cashOnHand < 0 ? "tone-danger" : "tone-success") +
          stat("arrow-down", "Other cash in", U.money(manualIn), "Manual receipts and deposits", "tone-success") +
          stat("arrow-up", "Other cash out", U.money(manualOut), "Expenses and withdrawals", "tone-warning") +
          stat("wallet", "Contributions & repayments", U.money(f.totalContributions + f.totalRepayments), "Gross member cash inflow", "tone-info") +
        "</div>" +
        '<div class="grid-2 mb-3">' +
          '<div class="card"><div class="card-head"><div><h2>Fund reconciliation</h2><div class="sub">Derived from all posted records</div></div></div><div class="card-body">' +
            '<div class="kv">' +
              "<dt>Opening cash</dt><dd>" + U.money(f.openingCash) + "</dd>" +
              "<dt>Member contributions</dt><dd>" + U.money(f.totalContributions) + "</dd>" +
              "<dt>Loan repayments</dt><dd>" + U.money(f.totalRepayments) + "</dd>" +
              "<dt>Manual cash in</dt><dd>" + U.money(f.otherIn) + "</dd>" +
              "<dt>Loans released</dt><dd>-" + U.money(f.totalReleased) + "</dd>" +
              "<dt>Manual cash out</dt><dd>-" + U.money(f.otherOut) + "</dd>" +
              '<div style="grid-column:1/-1;height:1px;background:var(--border);margin:4px 0"></div>' +
              "<dt><strong>Cash on hand</strong></dt><dd><strong>" + U.money(f.cashOnHand) + "</strong></dd>" +
            "</div></div></div>" +
          '<div class="card"><div class="card-head"><div><h2>Fund position</h2><div class="sub">What the cooperative holds and is owed</div></div></div><div class="card-body">' +
            '<div class="grid-2">' +
              '<div class="summary-box"><div class="label">Cash available</div><div class="value">' + U.money(f.cashOnHand) + '</div><div class="sub">Ready to lend</div></div>' +
              '<div class="summary-box"><div class="label">Loans outstanding</div><div class="value">' + U.money(f.outstanding) + '</div><div class="sub">' + f.activeLoanCount + " active</div></div>" +
              '<div class="summary-box"><div class="label">Total contributions</div><div class="value">' + U.money(f.totalContributions) + '</div><div class="sub">Share capital collected</div></div>' +
              '<div class="summary-box"><div class="label">Interest collected</div><div class="value">' + U.money(f.interestCollected) + '</div><div class="sub">Loan income</div></div>' +
            "</div>" +
            '<div class="alert info mt-3">' + U.icon("info", "icon-sm") + "<div>Opening cash is configured in Settings. Manual entries do not create accounting journals; they adjust the fund position only.</div></div>" +
          "</div></div>" +
        "</div>" +
        '<div class="card"><div class="card-head"><div><h2>Manual cash entries</h2><div class="sub">Expenses, deposits, withdrawals, and adjustments</div></div>' +
          '<div class="table-filter mb-0"><div class="search">' + U.icon("search") + '<input class="input" id="cash-search" placeholder="Search entries…"></div></div></div>' +
          '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr>' +
          '<th class="sortable" data-sort="date">Date' + (state.sortKey === "date" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="direction">Direction' + (state.sortKey === "direction" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="category">Category' + (state.sortKey === "category" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="description">Description' + (state.sortKey === "description" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable num" data-sort="amount">Amount' + (state.sortKey === "amount" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="voided">Status' + (state.sortKey === "voided" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th></th>' +
          '</tr></thead><tbody>' + rows + "</tbody></table></div></div></div>";

      const search = root.querySelector("#cash-search");
      if (search) search.addEventListener("input", function () {
        const q = search.value.toLowerCase().trim();
        root.querySelectorAll("tbody tr[data-cash-row]").forEach(function (row) {
          row.style.display = !q || row.getAttribute("data-search").indexOf(q) >= 0 ? "" : "none";
        });
      });

      root.querySelectorAll("thead th.sortable").forEach(function (th) {
        th.addEventListener("click", function () {
          const key = th.getAttribute("data-sort");
          if (!key) return;
          const s2 = U.tableState("cash");
          if (s2.sortKey === key) {
            s2.sortDir = s2.sortDir === "asc" ? "desc" : "asc";
          } else {
            s2.sortKey = key;
            s2.sortDir = "asc";
          }
          U.tableSave("cash", s2);
          pages.cash.render(root);
        });
      });

      root.querySelectorAll("tbody tr[data-cash-row]").forEach(function (row) {
        row.addEventListener("click", function (event) {
          if (event.target.closest("button")) return;
          const entry = entries.find(function (e) { return e.id === row.getAttribute("data-cash-row"); });
          if (entry && !entry.voided) openForm(entry.id);
        });
      });
      root.querySelectorAll("[data-edit]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          openForm(button.getAttribute("data-edit"));
        });
      });
      root.querySelectorAll("[data-void]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          voidEntry(button.getAttribute("data-void"));
        });
      });
      root.querySelectorAll("[data-action=add]").forEach(function (button) {
        button.addEventListener("click", function () { openForm(); });
      });
      const exportButton = root.querySelector("[data-action=export]");
      if (exportButton) exportButton.addEventListener("click", function () {
        const csv = [["Date", "Direction", "Category", "Description", "Reference", "Amount", "Status"]];
        entries.forEach(function (e) {
          csv.push([e.date, e.direction, e.category, e.description, e.reference, e.amount, e.voided ? "voided" : "posted"]);
        });
        UI.downloadCSV("coop-cash-entries-" + U.today() + ".csv", csv);
        UI.toast("Cash entries exported.");
      });
    }
  };
})();
