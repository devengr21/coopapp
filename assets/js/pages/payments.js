(function () {
  "use strict";
  const COOP = (window.COOP = window.COOP || {});
  const U = COOP.utils;
  const D = COOP.domain;
  const UI = COOP.ui;
  const store = COOP.store;
  const pages = (COOP.pages = COOP.pages || {});

  let showStatus = "posted";

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

  function openForm(loanId) {
    const db = store.get();
    const activeLoans = (db.loans || []).filter(function (loan) {
      return loan.status === "active" && D.loanLedger(loan, db.payments, U.today()).balance > 0.005;
    }).sort(function (a, b) { return String(b.startDate).localeCompare(String(a.startDate)); });
    if (!activeLoans.length) {
      UI.toast("There are no active loans with an outstanding balance.", "warning");
      return;
    }
    const selectedId = loanId && activeLoans.some(function (l) { return l.id === loanId; }) ? loanId : (activeLoans.length === 1 ? activeLoans[0].id : "");
    const modal = UI.modal({
      title: "Record loan payment",
      subtitle: "Interest is added up to the payment date. Cash pays interest first, then principal.",
      size: "md",
      body:
        errorBox() +
        '<form id="payment-form" autocomplete="off"><div class="form-grid">' +
          '<div class="field full"><label for="p-loan">Loan<span class="req">*</span></label>' +
            '<select class="select" id="p-loan" name="loanId" required>' +
              UI.options(activeLoans.map(function (loan) {
                return {
                  value: loan.id,
                  label: loan.loanNo + " · " + D.borrowerName(loan, db) + " · " + U.money(D.loanLedger(loan, db.payments, U.today()).balance) + " balance"
                };
              }), selectedId, "Select an active loan") +
            "</select></div>" +
          '<div class="field"><label for="p-amount">Amount received<span class="req">*</span></label>' +
            '<input class="input" id="p-amount" name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required></div>' +
          '<div class="field"><label for="p-date">Payment date<span class="req">*</span></label><input class="input" id="p-date" name="date" type="date" value="' + U.today() + '" required></div>' +
          '<div class="field full"><div class="loan-limit-box" id="payment-preview">Select a loan and enter an amount to preview the payment.</div></div>' +
          '<details class="form-advanced"><summary>Payment details</summary>' +
            '<div class="form-grid">' +
              '<div class="field"><label for="p-method">Method</label><select class="select" id="p-method" name="method">' + UI.options(D.PAYMENT_METHODS, "Cash") + "</select></div>" +
              '<div class="field"><label for="p-reference">Reference</label><input class="input" id="p-reference" name="reference" placeholder="Optional"></div>' +
              '<div class="field full"><label for="p-notes">Notes</label><input class="input" id="p-notes" name="notes" placeholder="Optional"></div>' +
            "</div>" +
          "</details>" +
        "</div></form>",
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn primary" type="submit" form="payment-form">' + U.icon("credit-card", "icon-sm") + " Post payment</button>",
      onMount: function (modalEl) {
        const form = modalEl.querySelector("#payment-form");
        const loanSelect = form.querySelector("#p-loan");
        const amountInput = form.querySelector("#p-amount");
        const dateInput = form.querySelector("#p-date");
        const preview = form.querySelector("#payment-preview");
        const submit = modalEl.querySelector("[form=payment-form]");
        modalEl.querySelector("[data-cancel]").addEventListener("click", modal.close);

        function updatePreview() {
          const loan = db.loans.find(function (l) { return l.id === loanSelect.value; });
          if (!loan) {
            preview.className = "loan-limit-box";
            preview.textContent = "Select a loan and enter an amount to preview the payment.";
            return;
          }
          const date = U.isoDate(dateInput.value) || U.today();
          const summary = D.loanLedger(loan, db.payments, date);
          const amount = U.toNumber(amountInput.value);
          let html = '<div class="limit-row"><span>Outstanding balance</span><strong>' + U.money(summary.balance) + "</strong></div>" +
            '<div class="limit-row"><span>Interest due</span><strong>' + U.money(summary.interestBalance) + "</strong></div>" +
            '<div class="limit-row"><span>Principal</span><strong>' + U.money(summary.principalBalance) + "</strong></div>";
          if (amount > 0) {
            const allocation = D.paymentAllocationFor(db, loan, date, amount);
            html += '<div class="divider"></div>' +
              '<div class="limit-row"><span>To interest</span><strong>' + U.money(allocation.interestPortion) + "</strong></div>" +
              '<div class="limit-row"><span>To principal</span><strong>' + U.money(allocation.principalPortion) + "</strong></div>" +
              (allocation.credit > 0 ? '<div class="limit-row" style="color:var(--warning)"><span>Excess / credit</span><strong>' + U.money(allocation.credit) + "</strong></div>" : "") +
              '<div style="margin-top:5px;font-weight:700">Balance after payment: ' + U.money(Math.max(0, summary.balance - amount)) + "</div>";
            if (allocation.credit > 0) {
              html += '<div style="margin-top:4px">The excess of ' + U.money(allocation.credit) + " will be recorded as a member credit.</div>";
            }
          }
          preview.className = "loan-limit-box" + (amount > summary.balance + 0.005 ? " over" : "");
          preview.innerHTML = html;
        }

        loanSelect.addEventListener("change", updatePreview);
        amountInput.addEventListener("input", updatePreview);
        dateInput.addEventListener("change", updatePreview);
        updatePreview();

        form.addEventListener("submit", function (event) {
          event.preventDefault();
          const box = form.querySelector("[data-form-error]");
          if (box) box.classList.add("hidden");
          UI.setBusy(submit, true, "Posting…");
          try {
            const payment = COOP.actions.recordPayment(UI.formData(form));
            UI.closeModal();
            UI.toast("Payment posted.");
            if (COOP.app) COOP.app.refresh();
            setTimeout(function () { openReceipt(payment.id); }, 120);
          } catch (err) {
            showFormError(form, err.message);
            UI.setBusy(submit, false);
          }
        });
      }
    });
    return modal;
  }

  function openReceipt(paymentId, readOnly) {
    const db = store.get();
    const payment = db.payments.find(function (p) { return p.id === paymentId; });
    if (!payment) {
      UI.toast("Payment not found.", "danger");
      return;
    }
    const loan = db.loans.find(function (l) { return l.id === payment.loanId; });
    const member = loan && loan.borrowerType === "member" ? db.members.find(function (m) { return m.id === loan.memberId; }) : null;
    const summary = loan ? D.loanLedger(loan, db.payments, payment.date) : null;
    const row = summary ? summary.rows.find(function (r) { return r.paymentId === payment.id; }) : null;
    const balanceAfter = row ? row.balance : 0;
    const settings = db.settings;

    const modal = UI.modal({
      title: "Payment receipt " + payment.receiptNo,
      subtitle: U.formatDate(payment.date) + (payment.voided ? " · VOIDED" : ""),
      size: "md",
      body:
        '<div class="receipt-wrap"><div class="receipt">' +
          '<div class="receipt-head"><div><h2>' + U.esc(settings.orgName) + "</h2>" +
            '<div class="note">' + U.esc(settings.orgAddress || "COOP loan payment receipt") + "</div>" +
            (settings.orgContact ? '<div class="note">' + U.esc(settings.orgContact) + "</div>" : "") + "</div>" +
            '<div class="right"><div class="badge ' + (payment.voided ? "danger" : "success") + '">' + (payment.voided ? "VOIDED" : "PAID") + "</div>" +
            '<div class="note mt-1">OR No. <strong>' + U.esc(payment.receiptNo) + "</strong></div>" +
            '<div class="note">' + U.formatDate(payment.date) + "</div></div></div>" +
          '<div class="receipt-rows">' +
            '<div class="receipt-row"><span>Received from</span><strong>' + U.esc(member ? D.memberName(member) : (payment.borrowerName || "Borrower")) + "</strong></div>" +
            '<div class="receipt-row"><span>Loan</span><strong>' + U.esc(loan ? loan.loanNo : "-") + "</strong></div>" +
            '<div class="receipt-row"><span>Payment method</span><strong>' + U.esc(payment.method || "Cash") + "</strong></div>" +
            (payment.reference ? '<div class="receipt-row"><span>Reference</span><strong>' + U.esc(payment.reference) + "</strong></div>" : "") +
            (payment.notes ? '<div class="receipt-row"><span>Notes</span><strong>' + U.esc(payment.notes) + "</strong></div>" : "") +
          "</div>" +
          '<div class="divider"></div>' +
          '<div class="receipt-rows">' +
            '<div class="receipt-row"><span>Applied to interest</span><strong>' + U.money(payment.interestPortion) + "</strong></div>" +
            '<div class="receipt-row"><span>Applied to principal</span><strong>' + U.money(payment.principalPortion) + "</strong></div>" +
            (payment.credit > 0 ? '<div class="receipt-row"><span>Excess credit</span><strong>' + U.money(payment.credit) + "</strong></div>" : "") +
            '<div class="receipt-row"><span>Remaining loan balance</span><strong>' + U.money(balanceAfter) + "</strong></div>" +
          "</div>" +
          '<div class="receipt-total"><span>Amount received</span><span>' + U.money(payment.amount) + "</span></div>" +
          '<div class="signature-row"><div class="signature">Received by · ' + U.esc(payment.createdByName || "") + '</div><div class="signature">Member / borrower signature</div></div>' +
          '<div class="receipt-foot">This receipt was generated from the cooperative\'s local records. Keep it for your files.' +
            (payment.voided ? "<br><strong>This payment has been voided and is not included in balances.</strong>" : "") + "</div>" +
        "</div></div>",
      footer:
        '<button class="btn" type="button" data-close>Close</button>' +
        (payment.voided || readOnly ? "" : '<button class="btn danger-soft" type="button" data-void>' + U.icon("trash", "icon-sm") + " Void payment</button>") +
        '<button class="btn primary" type="button" data-print>' + U.icon("printer", "icon-sm") + " Print receipt</button>",
      onMount: function (modalEl) {
        modalEl.querySelector("[data-close]").addEventListener("click", modal.close);
        modalEl.querySelector("[data-print]").addEventListener("click", function () { UI.print(); });
        const voidButton = modalEl.querySelector("[data-void]");
        if (voidButton) voidButton.addEventListener("click", function () {
          modal.close();
          voidPayment(payment.id);
        });
      }
    });
    return modal;
  }

  function voidPayment(id) {
    const db = store.get();
    const payment = db.payments.find(function (p) { return p.id === id; });
    if (!payment) return;
    UI.askReason({
      title: "Void payment",
      message: "Void receipt " + payment.receiptNo + " for " + U.money(payment.amount) + "? The payment history will be recalculated.",
      label: "Reason for voiding",
      confirmLabel: "Void payment",
      tone: "danger"
    }).then(function (reason) {
      if (!reason) return;
      try {
        COOP.actions.voidPayment(id, reason);
        refresh("Payment voided and loan recalculated.");
      } catch (err) {
        UI.toast(err.message, "danger");
      }
    });
  }

  pages.payments = {
    openForm: openForm,
    openReceipt: openReceipt,
    render: function (root) {
      const db = store.get();
      const all = db.payments || [];
      const state = U.tableState("payments");
      let filtered = all.filter(function (p) {
        if (showStatus === "posted") return !p.voided;
        if (showStatus === "voided") return p.voided;
        return true;
      }).map(function (p) {
        const loan = db.loans.find(function (l) { return l.id === p.loanId; });
        const borrower = loan ? D.borrowerName(loan, db) : p.borrowerName;
        return {
          payment: p,
          _receiptNo: p.receiptNo,
          _borrower: borrower,
          _loanNo: loan ? loan.loanNo : "",
          _amount: p.amount,
          _interest: p.interestPortion,
          _principal: p.principalPortion,
          _credit: p.credit,
          _method: p.method || "Cash",
          _status: p.voided ? "voided" : "posted",
          _date: p.date,
          _createdAt: p.createdAt
        };
      });
      if (state.sortKey) {
        filtered = U.sortByKey(filtered, "_" + state.sortKey.replace(/^_/, ""), state.sortDir);
      } else {
        filtered.sort(function (a, b) {
          const aLoan = db.loans.find(function (l) { return l.id === a.payment.loanId; });
          const bLoan = db.loans.find(function (l) { return l.id === b.payment.loanId; });
          const aSummary = aLoan ? D.loanLedger(aLoan, db.payments, U.today()) : null;
          const bSummary = bLoan ? D.loanLedger(bLoan, db.payments, U.today()) : null;
          const aOutstanding = aSummary ? (aSummary.balance > 0.005 ? 1 : 0) : 0;
          const bOutstanding = bSummary ? (bSummary.balance > 0.005 ? 1 : 0) : 0;
          if (aOutstanding !== bOutstanding) return bOutstanding - aOutstanding;
          const aVoided = a.payment.voided ? 1 : 0;
          const bVoided = b.payment.voided ? 1 : 0;
          if (aVoided !== bVoided) return aVoided - bVoided;
          return String(b._date).localeCompare(String(a._date)) || String(b._createdAt).localeCompare(String(a._createdAt));
        });
      }
      const posted = filtered.filter(function (x) { return !x.payment.voided; });
      const total = U.sum(posted, function (x) { return x.payment.amount; });
      const interest = U.sum(posted, function (x) { return x.payment.interestPortion; });
      const principal = U.sum(posted, function (x) { return x.payment.principalPortion; });
      const credits = U.sum(posted, function (x) { return x.payment.credit; });

      const rows = filtered.length ? filtered.map(function (item) {
        const payment = item.payment;
        const loan = db.loans.find(function (l) { return l.id === payment.loanId; });
        const borrower = item._borrower;
        return '<tr class="row-click" data-payment-row="' + U.esc(payment.id) + '" data-search="' + U.esc((payment.receiptNo + " " + borrower + " " + item._loanNo + " " + (payment.reference || "")).toLowerCase()) + '">' +
          '<td><span class="strong">' + U.esc(payment.receiptNo) + '</span><div class="sub">' + U.formatDate(payment.date) + "</div></td>" +
          '<td><div class="cell-person">' + UI.avatar(borrower) + '<div class="meta"><div class="name">' + U.esc(borrower) + "</div>" +
          '<div class="sub">' + U.esc(item._loanNo || "Deleted loan") + "</div></div></div></td>" +
          '<td class="num strong">' + U.money(payment.amount) + "</td>" +
          '<td class="num">' + U.money(payment.interestPortion) + "</td>" +
          '<td class="num">' + U.money(payment.principalPortion) + "</td>" +
          '<td class="num">' + U.money(payment.credit) + "</td>" +
          "<td>" + U.esc(item._method) + "</td>" +
          "<td>" + (payment.voided ? UI.statusBadge("voided") : UI.statusBadge("posted")) + "</td>" +
          '<td class="actions"><button class="btn sm ghost" type="button" data-receipt="' + U.esc(payment.id) + '">Receipt</button></td></tr>';
      }).join("") : '<tr><td colspan="9" class="empty-row">No payments match this filter.</td></tr>';

      root.innerHTML =
        '<div class="page-head"><div><span class="eyebrow">' + U.icon("credit-card", "icon-sm") + " Repayments</span>" +
          "<h1>Payments</h1><div class=\"sub\">Record loan payments and print receipts.</div></div>" +
          '<div class="page-actions"><button class="btn" data-action="export">' + U.icon("download", "icon-sm") + " Export CSV</button>" +
          '<button class="btn primary" data-action="add">' + U.icon("plus", "icon-sm") + " Record payment</button></div></div>" +
        '<div class="section"><div class="section-head">' +
          U.icon("credit-card", "section-icon") +
          "<h3>Overview</h3>" +
        "</div>" +
        '<div class="stat-grid">' +
          stat("credit-card", "Total received", U.money(total), posted.length + " posted " + U.plural(posted.length, "payment"), "tone-success") +
          stat("percent", "Interest collected", U.money(interest), "Recognized income") +
          stat("coins", "Principal collected", U.money(principal), "Back into the fund") +
          stat("wallet", "Member credits", U.money(credits), "Excess payments held as credit", credits > 0 ? "tone-warning" : "") +
        "</div></div>" +
        (store.can("payments.manage") && (db.paymentRequests || []).length
          ? '<div class="section"><div class="section-head">' +
            U.icon("clock", "section-icon") +
            "<h3>Pending member payments</h3>" +
            '<div class="section-sub">' + (db.paymentRequests || []).filter(function (r) { return r.status === "pending"; }).length + " awaiting review</div>" +
            "</div>" +
            '<div class="card"><div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Borrower</th><th class="num">Amount</th><th>Method</th><th>Requested on</th><th>Proof</th><th class="actions">Action</th></tr></thead><tbody>' +
            (function () {
              const pending = (db.paymentRequests || []).filter(function (r) { return r.status === "pending"; });
              if (!pending.length) return '<tr><td colspan="6" class="empty-row">No pending payment requests.</td></tr>';
              return pending.map(function (req) {
                const loan = (db.loans || []).find(function (l) { return l.id === req.loanId; });
                return '<tr data-payreq-row="' + U.esc(req.id) + '">' +
                  '<td><div class="cell-person">' + UI.avatar(req.borrowerName) +
                    '<div class="meta"><div class="name">' + U.esc(req.borrowerName) + "</div>" +
                    '<div class="sub">' + (loan ? loan.loanNo : "Unknown loan") + "</div></div></div></td>" +
                  '<td class="num strong">' + U.money(req.amount) + "</td>" +
                  '<td>' + U.esc(req.method) + "</td>" +
                  '<td>' + U.formatDate(req.createdAt) + "</td>" +
                  '<td>' + (req.proofFile ? '<button class="btn sm ghost" type="button" data-view-proof="' + U.esc(req.id) + '">View proof</button>' : '<span class="muted">None</span>') + "</td>" +
                  '<td class="actions">' +
                    '<button class="btn sm primary" type="button" data-payreq-approve="' + U.esc(req.id) + '">Approve</button>' +
                    '<button class="btn sm danger-soft" type="button" data-payreq-reject="' + U.esc(req.id) + '">Reject</button>' +
                  "</td></tr>";
              }).join("");
            })() +
            "</tbody></table></div></div></div>"
          : "") +
        (store.can("contributions.manage") && (db.contributionRequests || []).length
          ? '<div class="section"><div class="section-head">' +
            U.icon("wallet", "section-icon") +
            "<h3>Pending member contributions</h3>" +
            '<div class="section-sub">' + (db.contributionRequests || []).filter(function (r) { return r.status === "pending"; }).length + " awaiting review</div>" +
            "</div>" +
            '<div class="card"><div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Member</th><th class="num">Amount</th><th>Month</th><th>Method</th><th>Requested on</th><th>Proof</th><th class="actions">Action</th></tr></thead><tbody>' +
            (function () {
              const pending = (db.contributionRequests || []).filter(function (r) { return r.status === "pending"; });
              if (!pending.length) return '<tr><td colspan="7" class="empty-row">No pending contribution requests.</td></tr>';
              return pending.map(function (req) {
                return '<tr data-contribreq-row="' + U.esc(req.id) + '">' +
                  '<td><div class="cell-person">' + UI.avatar(req.memberName) +
                    '<div class="meta"><div class="name">' + U.esc(req.memberName) + "</div>" +
                    '<div class="sub">' + U.esc(req.period) + "</div></div></div></td>" +
                  '<td class="num strong">' + U.money(req.amount) + "</td>" +
                  '<td>' + U.esc(req.period) + "</td>" +
                  '<td>' + U.esc(req.method) + "</td>" +
                  '<td>' + U.formatDate(req.createdAt) + "</td>" +
                  '<td>' + (req.proofFile ? '<button class="btn sm ghost" type="button" data-view-proof="' + U.esc(req.id) + '">View proof</button>' : '<span class="muted">None</span>') + "</td>" +
                  '<td class="actions">' +
                    '<button class="btn sm primary" type="button" data-contribreq-approve="' + U.esc(req.id) + '">Approve</button>' +
                    '<button class="btn sm danger-soft" type="button" data-contribreq-reject="' + U.esc(req.id) + '">Reject</button>' +
                  "</td></tr>";
              }).join("");
            })() +
            "</tbody></table></div></div></div>"
          : "") +
        '<div class="section"><div class="section-head">' +
          U.icon("receipt", "section-icon") +
          "<h3>Payment register</h3>" +
          '<div class="section-sub">' + all.length + " total records</div>" +
        "</div>" +
        '<div class="card"><div class="card-body flush"><div class="table-filter mb-0"><div class="search">' + U.icon("search") + '<input class="input" id="payment-search" placeholder="Search receipt or borrower"></div>' +
        '<select class="select" id="payment-status-filter">' +
          '<option value="posted"' + (showStatus === "posted" ? " selected" : "") + ">Posted</option>" +
          '<option value="all"' + (showStatus === "all" ? " selected" : "") + ">All records</option>" +
          '<option value="voided"' + (showStatus === "voided" ? " selected" : "") + ">Voided</option>" +
        '</select></div></div>' +
        '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr>' +
            '<th class="sortable" data-sort="receiptNo">Receipt' + (state.sortKey === "receiptNo" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
            '<th class="sortable" data-sort="borrower">Borrower' + (state.sortKey === "borrower" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
            '<th class="sortable num" data-sort="amount">Amount' + (state.sortKey === "amount" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
            '<th class="sortable num" data-sort="interest">Interest' + (state.sortKey === "interest" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
            '<th class="sortable num" data-sort="principal">Principal' + (state.sortKey === "principal" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
            '<th class="sortable num" data-sort="credit">Credit' + (state.sortKey === "credit" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
            '<th class="sortable" data-sort="method">Method' + (state.sortKey === "method" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
            '<th class="sortable" data-sort="status">Status' + (state.sortKey === "status" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
            '<th></th>' +
          '</tr></thead><tbody>' + rows + "</tbody></table></div>" +
          (all.length ? "" : '<div class="empty" style="border-top:1px solid var(--border)"><div class="empty-icon">' + U.icon("receipt") + "</div><h3>No payments yet</h3>" +
            "<p>Record a payment against an active loan. Cash pays interest first, then principal.</p>" +
            '<div class="empty-actions"><button class="btn primary" data-action="add">' + U.icon("plus", "icon-sm") + " Record payment</button></div></div>") +
          "</div></div></div>";

      const search = root.querySelector("#payment-search");
      if (search) search.addEventListener("input", function () {
        const q = search.value.toLowerCase().trim();
        root.querySelectorAll("tbody tr[data-payment-row]").forEach(function (row) {
          row.style.display = !q || row.getAttribute("data-search").indexOf(q) >= 0 ? "" : "none";
        });
      });
      const statusFilter = root.querySelector("#payment-status-filter");
      if (statusFilter) statusFilter.addEventListener("change", function () {
        showStatus = statusFilter.value;
        pages.payments.render(root);
      });

      root.querySelectorAll("thead th.sortable").forEach(function (th) {
        th.addEventListener("click", function () {
          const key = th.getAttribute("data-sort");
          if (!key) return;
          const s2 = U.tableState("payments");
          if (s2.sortKey === key) {
            s2.sortDir = s2.sortDir === "asc" ? "desc" : "asc";
          } else {
            s2.sortKey = key;
            s2.sortDir = "asc";
          }
          U.tableSave("payments", s2);
          pages.payments.render(root);
        });
      });

      root.querySelectorAll("tbody tr[data-payment-row]").forEach(function (row) {
        row.addEventListener("click", function (event) {
          if (event.target.closest("button")) return;
          openReceipt(row.getAttribute("data-payment-row"));
        });
      });
      root.querySelectorAll("[data-receipt]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          openReceipt(button.getAttribute("data-receipt"));
        });
      });
      root.querySelectorAll("[data-action=add]").forEach(function (button) {
        button.addEventListener("click", function () { openForm(); });
      });
      const exportButton = root.querySelector("[data-action=export]");
      if (exportButton) exportButton.addEventListener("click", function () {
        const csv = [["Receipt", "Date", "Borrower", "Loan", "Amount", "Interest", "Principal", "Credit", "Method", "Reference", "Status"]];
        all.forEach(function (payment) {
          const loan = db.loans.find(function (l) { return l.id === payment.loanId; });
          csv.push([
            payment.receiptNo, payment.date, loan ? D.borrowerName(loan, db) : payment.borrowerName,
            loan ? loan.loanNo : "", payment.amount, payment.interestPortion, payment.principalPortion,
            payment.credit, payment.method, payment.reference, payment.voided ? "voided" : "posted"
          ]);
        });
        UI.downloadCSV("coop-payments-" + U.today() + ".csv", csv);
        UI.toast("Payment register exported.");
      });

      root.querySelectorAll("[data-payreq-approve]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          const reqId = button.getAttribute("data-payreq-approve");
          UI.askReason({
            title: "Approve member payment",
            message: "Approve this member payment request and record it as a posted payment? Add an optional treasurer note.",
            label: "Treasurer note (optional)",
            confirmLabel: "Approve & post payment",
            optional: true,
            tone: "primary"
          }).then(async function (note) {
            if (note === null) return;
            try {
              const dateInput = prompt("Payment date (leave blank for today):", U.today());
              if (dateInput === null) return;
              await COOP.actions.approvePaymentRequest(reqId, { notes: note || "", date: dateInput || undefined });
              refresh("Member payment approved and posted.");
            } catch (err) {
              UI.toast(err.message, "danger");
            }
          });
        });
      });

      root.querySelectorAll("[data-payreq-reject]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          const reqId = button.getAttribute("data-payreq-reject");
          UI.askReason({
            title: "Reject member payment",
            message: "Reject this member payment request? The member will be notified.",
            label: "Rejection reason",
            confirmLabel: "Reject request",
            tone: "danger"
          }).then(async function (reason) {
            if (!reason) return;
            try {
              await COOP.actions.rejectPaymentRequest(reqId, { reason: reason });
              refresh("Member payment request rejected.");
            } catch (err) {
              UI.toast(err.message, "danger");
            }
          });
        });
      });

      root.querySelectorAll("[data-view-proof]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          const reqId = button.getAttribute("data-view-proof");
          const req = (db.paymentRequests || []).find(function (r) { return r.id === reqId; }) ||
            (db.contributionRequests || []).find(function (r) { return r.id === reqId; });
          if (!req || !req.proofFile) return;
          UI.modal({
            title: "Proof of payment",
            size: "md",
            body: '<div style="text-align:center">' +
               (req.proofFile.indexOf("data:image/") === 0
                 ? '<img src="' + U.esc(req.proofFile) + '" alt="Proof of payment" style="max-width:100%;max-height:400px;border:1px solid var(--border);border-radius:8px">'
                 : '<div class="note">PDF proof: ' + U.esc(req.proofFileName || "document") + "</div>") +
               '<div class="mt-3"><a href="' + U.esc(req.proofFile) + '" download="' + U.esc(req.proofFileName || "proof") + '" class="btn primary">Download file</a></div>' +
              '</div>',
            footer: '<button class="btn" type="button" data-close>Close</button>',
            onMount: function (modalEl) {
              modalEl.querySelector("[data-close]").addEventListener("click", modal.close);
            }
          });
        });
      });

      root.querySelectorAll("[data-contribreq-approve]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          const reqId = button.getAttribute("data-contribreq-approve");
          UI.askReason({
            title: "Approve member contribution",
            message: "Approve this member contribution request and record it as a posted contribution? Add an optional treasurer note.",
            label: "Treasurer note (optional)",
            confirmLabel: "Approve & post contribution",
            optional: true,
            tone: "primary"
          }).then(async function (note) {
            if (note === null) return;
            try {
              await COOP.actions.approveContributionPayment(reqId, { notes: note || "" });
              refresh("Member contribution approved and posted.");
            } catch (err) {
              UI.toast(err.message, "danger");
            }
          });
        });
      });

      root.querySelectorAll("[data-contribreq-reject]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          const reqId = button.getAttribute("data-contribreq-reject");
          UI.askReason({
            title: "Reject member contribution",
            message: "Reject this member contribution request? The member will be notified.",
            label: "Rejection reason",
            confirmLabel: "Reject request",
            tone: "danger"
          }).then(async function (reason) {
            if (!reason) return;
            try {
              await COOP.actions.rejectContributionPayment(reqId, { reason: reason });
              refresh("Member contribution request rejected.");
            } catch (err) {
              UI.toast(err.message, "danger");
            }
          });
        });
      });
    }
  };
})();
