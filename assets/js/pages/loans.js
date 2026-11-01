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

  function summaryFor(db, loan) {
    return D.loanLedger(loan, db.payments || [], U.today());
  }

  function openForm(id) {
    const db = store.get();
    const settings = db.settings;
    const loan = id ? db.loans.find(function (l) { return l.id === id; }) : null;
    if (id && !loan) {
      UI.toast("Loan not found.", "danger");
      return;
    }
    const borrowerType = loan ? loan.borrowerType : "member";
    const members = D.memberOptions(db, true);
    const paymentCount = loan ? (db.payments || []).filter(function (p) { return p.loanId === loan.id && !p.voided; }).length : 0;
    if (loan && paymentCount > 0) {
      UI.toast("This loan already has payments and cannot be edited.", "danger");
      return;
    }
    const principal = loan ? U.toNumber(loan.principal) : 0;

    const modal = UI.modal({
      title: loan ? "Edit loan " + loan.loanNo : "Create a loan",
      subtitle: "Members: 5% monthly interest · Non-members: 8% monthly interest. No fixed term; aim to settle the balance before December.",
      size: "lg",
      body:
        errorBox() +
        '<form id="loan-form" autocomplete="off">' +
          '<div class="form-grid">' +
            '<div class="field full"><label>Borrower type</label><div class="type-toggle">' +
              '<label class="type-option"><input type="radio" name="borrowerType" value="member"' + (borrowerType === "member" ? " checked" : "") + "> Member</label>" +
              '<label class="type-option"><input type="radio" name="borrowerType" value="non_member"' + (borrowerType === "non_member" ? " checked" : "") + "> Non-member</label>" +
            "</div></div>" +
            '<div class="field full" data-borrower="member"><label for="l-member">Member borrower<span class="req">*</span></label>' +
              '<select class="select" id="l-member" name="memberId">' + UI.options(members.map(function (m) { return { value: m.id, label: D.memberLabel(m) }; }), loan ? loan.memberId : "", "Select a member") + "</select></div>" +
            '<div class="field full" data-borrower="non_member"><label for="l-name">Borrower name<span class="req">*</span></label>' +
              '<input class="input" id="l-name" name="borrowerName" value="' + U.esc(loan ? loan.borrowerName : "") + '" placeholder="Full name of the non-member borrower"></div>' +
            '<div class="field full" data-borrower="non_member"><label for="l-care">Caring member<span class="req">*</span></label>' +
              '<select class="select" id="l-care" name="careOfMemberId">' + UI.options(members.map(function (m) { return { value: m.id, label: D.memberLabel(m) }; }), loan ? loan.careOfMemberId : "", "Select the member accountable for this borrower") + "</select>" +
              '<div class="help">A member stands accountable for non-member borrowers.</div></div>' +
            '<div class="field"><label for="l-principal">Principal<span class="req">*</span></label>' +
              '<input class="input" id="l-principal" name="principal" type="number" min="0.01" step="0.01" value="' + U.esc(principal || "") + '" required placeholder="0.00"></div>' +
            '<div class="field"><label for="l-rate">Monthly interest rate<span class="req">*</span></label>' +
              '<div class="inline"><input class="input" id="l-rate" name="interestRate" type="number" min="0" max="100" step="0.01" value="' + U.esc(loan ? loan.interestRate : settings.interestRate) + '" required><span class="muted">%</span></div></div>' +
            '<div class="field"><label for="l-start">Release date<span class="req">*</span></label><input class="input" id="l-start" name="startDate" type="date" value="' + U.esc(loan ? loan.startDate : U.today()) + '" required></div>' +
            '<div class="field full"><div class="loan-limit-box" id="loan-limit"></div></div>' +
            '<details class="form-advanced"><summary>More details</summary>' +
              '<div class="form-grid">' +
                '<div class="field full"><label for="l-purpose">Purpose</label><input class="input" id="l-purpose" name="purpose" value="' + U.esc(loan ? loan.purpose : "") + '" placeholder="e.g. Working capital, tuition, emergency"></div>' +
                '<div class="field full"><label for="l-collateral">Collateral or security</label><input class="input" id="l-collateral" name="collateral" value="' + U.esc(loan ? loan.collateral : "") + '" placeholder="Optional"></div>' +
                '<div class="field full"><label for="l-notes">Notes</label><textarea class="textarea" id="l-notes" name="notes" rows="2">' + U.esc(loan ? loan.notes : "") + "</textarea></div>" +
              "</div>" +
            "</details>" +
          "</div>" +
        "</form>",
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn primary" type="submit" form="loan-form">' + U.icon("save", "icon-sm") + (loan ? " Save changes" : " Create loan") + "</button>",
      onMount: function (modalEl) {
        const form = modalEl.querySelector("#loan-form");
        const submit = modalEl.querySelector("[form=loan-form]");
        const principalInput = form.querySelector("#l-principal");
        const rateInput = form.querySelector("#l-rate");
        const limitBox = form.querySelector("#loan-limit");
        modalEl.querySelector("[data-cancel]").addEventListener("click", modal.close);

        function defaultRateFor(type) {
          return type === "member" ? 5 : 8;
        }
        function applyDefaultRate() {
          const type = form.querySelector("input[name=borrowerType]:checked").value;
          if (!loan) {
            rateInput.value = defaultRateFor(type);
          }
        }
        function updateBorrowerFields() {
          const type = form.querySelector("input[name=borrowerType]:checked").value;
          form.querySelectorAll("[data-borrower]").forEach(function (field) {
            field.style.display = field.getAttribute("data-borrower") === type ? "" : "none";
          });
          applyDefaultRate();
        }
        function updateLimit() {
          const amount = U.toNumber(principalInput.value);
          const info = D.loanLimit(db, amount);
          const approval = info.overLimit && db.settings.requireOverLimitApproval !== false;
          limitBox.className = "loan-limit-box" + (info.overLimit ? " over" : "");
          limitBox.innerHTML =
            '<div class="limit-row"><span>Available loan funds</span><strong>' + U.money(info.cash) + "</strong></div>" +
            (info.policyMax > 0 ? '<div class="limit-row"><span>Policy ceiling</span><strong>' + U.money(info.policyMax) + "</strong></div>" : "") +
            (amount > 0 ? '<div class="limit-row"><span>Requested</span><strong>' + U.money(amount) + "</strong></div>" : "") +
            (info.overLimit
              ? '<div style="margin-top:4px;font-weight:700">' + (approval ? "Over-limit request: this will be submitted for approval before release." : "This request exceeds the current limit.") + "</div>" +
                (info.reason ? '<div>' + U.esc(info.reason) + "</div>" : "")
              : '<div class="muted" style="margin-top:3px">Within the current loan limit.</div>');
        }

        form.querySelectorAll("input[name=borrowerType]").forEach(function (radio) {
          radio.addEventListener("change", updateBorrowerFields);
        });
        rateInput.addEventListener("input", function () {
          if (!rateInput.value) rateInput.value = defaultRateFor(form.querySelector("input[name=borrowerType]:checked").value);
        });
        principalInput.addEventListener("input", updateLimit);
        updateBorrowerFields();
        applyDefaultRate();
        updateLimit();

        form.addEventListener("submit", function (event) {
          event.preventDefault();
          const box = form.querySelector("[data-form-error]");
          if (box) box.classList.add("hidden");
          const type = form.querySelector("input[name=borrowerType]:checked").value;
          if (type === "member" && !form.querySelector("#l-member").value) {
            showFormError(form, "Select the member borrower.");
            return;
          }
          if (type === "non_member" && (!form.querySelector("#l-name").value.trim() || !form.querySelector("#l-care").value)) {
            showFormError(form, "Enter the non-member borrower and the caring member.");
            return;
          }
          UI.setBusy(submit, true, "Saving…");
          try {
            const result = COOP.actions.saveLoan(UI.formData(form), loan ? loan.id : null);
            if (result && result.approval) {
              refresh("Loan submitted for approval.");
            } else {
              refresh(loan ? "Loan updated." : "Loan created.");
            }
          } catch (err) {
            showFormError(form, err.message);
            UI.setBusy(submit, false);
          }
        });
      }
    });
    return modal;
  }

  function loanApprovalRecommended(db, loan) {
    return !!(db.approvals || []).find(function (a) {
      return a.loanId === loan.id && a.type === "over_limit_loan" && a.status === "pending" && a.recommendedBy;
    });
  }

  function loanRequestRows(db) {
    const requests = (db.loanRequests || []).filter(function (r) { return r.status === "pending"; });
    if (!requests.length) {
      return '<tr><td colspan="5" class="empty-row">No loan requests from members right now.</td></tr>';
    }
    return requests.sort(function (a, b) { return String(b.requestedAt).localeCompare(String(a.requestedAt)); }).map(function (r) {
      const linked = r.linkedMemberId ? db.members.find(function (m) { return m.id === r.linkedMemberId; }) : null;
      const sub = r.borrowerType === "non_member"
        ? "Non-member: " + U.esc(r.borrowerName || "-")
        : "@" + U.esc(r.requestedByUsername || "") + (linked ? " · " + U.esc(D.memberLabel(linked)) : "");
      const canRelease = store.can("loans.manage");
      const isPresident = store.currentUser().role === "president";
      let decisionCell = "";
      if (isPresident && !r.recommendedBy) {
        decisionCell = '<span class="muted">Awaiting treasurer</span>';
      } else if (canRelease) {
        decisionCell =
          (r.recommendedBy ? '<span class="badge success">Forwarded</span>' : "") +
          '<button class="btn sm ghost" type="button" data-request-forward="' + U.esc(r.id) + '">Forward</button>' +
          '<button class="btn sm danger-soft" type="button" data-request-reject="' + U.esc(r.id) + '">Reject</button>' +
          '<button class="btn sm primary" type="button" data-request-approve="' + U.esc(r.id) + '">Approve &amp; release</button>';
      } else if (store.can("approvals.manage")) {
        decisionCell =
          '<button class="btn sm danger-soft" type="button" data-request-reject="' + U.esc(r.id) + '">Reject</button>' +
          '<button class="btn sm primary" type="button" data-request-approve="' + U.esc(r.id) + '">Approve &amp; release</button>';
      }
      return '<tr><td><div class="cell-person">' + UI.avatar(r.borrowerType === "non_member" ? (r.borrowerName || "User") : (r.requestedByName || "User")) +
        '<div class="meta"><div class="name">' + U.esc(r.borrowerType === "non_member" ? (r.borrowerName || "Non-member borrower") : (r.requestedByName || "User")) +
        '</div><div class="sub">' + sub + (r.recommendedBy ? ' · Forwarded by ' + U.esc(r.recommendedByName || "") : "") + "</div></div></div></td>" +
        '<td class="num strong">' + U.money(r.principal) + "</td>" +
        '<td>' + U.esc(r.purpose || "-") + disburseLabel(r) + (r.recommendedBy && r.recommendedNotes ? '<div class="sub">Note: ' + U.esc(r.recommendedNotes) + "</div>" : "") + "</td>" +
        "<td>" + U.formatDate(r.requestedAt) + "</td>" +
        '<td class="actions">' + decisionCell + "</td></tr>";
    }).join("");
  }

  const DISBURSE_LABELS = { cash: "Cash", gcash: "GCash", bank: "Bank transfer" };

  function disburseLabel(r) {
    if (!r.disburseMethod) return "";
    const label = DISBURSE_LABELS[r.disburseMethod] || r.disburseMethod;
    const detail = r.disburseMethod === "cash"
      ? "Claim in cash" + (r.disburseDetail ? " — " + r.disburseDetail : "")
      : (r.disburseDetail || "");
    return '<div class="sub">Disburse via ' + label + (detail ? ": " + U.esc(detail) : "") + "</div>";
  }

  function openRequestForm(request) {
    const db = store.get();
    const members = D.memberOptions(db, true);
    const modal = UI.modal({
      title: "Approve loan request",
      subtitle: U.money(request.principal) + " requested by " + (request.requestedByName || "a member") + ". Confirm the borrower and terms to release this loan." + (request.disburseMethod ? " Borrower prefers " + ((DISBURSE_LABELS[request.disburseMethod] || request.disburseMethod) + (request.disburseDetail ? ": " + request.disburseDetail : "")).toLowerCase() + "." : ""),
      size: "md",
      body:
        errorBox() +
        '<form id="request-loan-form" autocomplete="off"><div class="form-grid">' +
          '<div class="field full"><label>Borrower type</label><div class="type-toggle">' +
            '<label class="type-option"><input type="radio" name="borrowerType" value="member"' + (request.borrowerType !== "non_member" ? " checked" : "") + "> Member</label>" +
            '<label class="type-option"><input type="radio" name="borrowerType" value="non_member"' + (request.borrowerType === "non_member" ? " checked" : "") + "> Non-member</label>" +
          "</div></div>" +
          '<div class="field full" data-borrower="member"><label for="rl-member">Member borrower<span class="req">*</span></label>' +
            '<select class="select" id="rl-member" name="memberId">' + UI.options(members.map(function (m) { return { value: m.id, label: D.memberLabel(m) }; }), request.linkedMemberId, "Select a member") + "</select></div>" +
          '<div class="field full" data-borrower="non_member"><label for="rl-name">Borrower name<span class="req">*</span></label>' +
            '<input class="input" id="rl-name" name="borrowerName" value="' + U.esc(request.borrowerName || request.requestedByName || "") + '" placeholder="Full name of the non-member borrower"></div>' +
          '<div class="field full" data-borrower="non_member"><label for="rl-care">Caring member<span class="req">*</span></label>' +
            '<select class="select" id="rl-care" name="careOfMemberId">' + UI.options(members.map(function (m) { return { value: m.id, label: D.memberLabel(m) }; }), "", "Select the member accountable for this borrower") + "</select></div>" +
          '<div class="field"><label for="rl-rate">Monthly interest rate<span class="req">*</span></label>' +
            '<div class="inline"><input class="input" id="rl-rate" name="interestRate" type="number" min="0" max="100" step="0.01" value="' + U.esc(db.settings.interestRate || (request.borrowerType === "non_member" ? 8 : 5)) + '" required><span class="muted">%</span></div></div>' +
          '<div class="field"><label for="rl-start">Release date<span class="req">*</span></label><input class="input" id="rl-start" name="startDate" type="date" value="' + U.today() + '" required></div>' +
          '<div class="field full" data-borrower="member"></div><div class="field full" data-borrower="non_member"></div>' +
          (request.notes ? '<div class="field full"><label>Requester notes</label><div class="note">' + U.esc(request.notes) + "</div></div>" : "") +
          '<div class="field full"><label for="rl-notes">Decision / release notes</label><textarea class="textarea" id="rl-notes" name="notes" rows="2" placeholder="Optional notes recorded on the loan"></textarea></div>' +
        "</div></form>",
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn primary" type="submit" form="request-loan-form">' + U.icon("check", "icon-sm") + " Approve and release</button>",
      onMount: function (modalEl) {
        const form = modalEl.querySelector("#request-loan-form");
        const submit = modalEl.querySelector("[form=request-loan-form]");
        modalEl.querySelector("[data-cancel]").addEventListener("click", modal.close);
        function updateBorrowerFields() {
          const type = form.querySelector("input[name=borrowerType]:checked").value;
          form.querySelectorAll("[data-borrower]").forEach(function (field) {
            field.style.display = field.getAttribute("data-borrower") === type ? "" : "none";
          });
        }
        form.querySelectorAll("input[name=borrowerType]").forEach(function (radio) {
          radio.addEventListener("change", updateBorrowerFields);
        });
        updateBorrowerFields();
        form.addEventListener("submit", async function (event) {
          event.preventDefault();
          const box = form.querySelector("[data-form-error]");
          if (box) box.classList.add("hidden");
          const type = form.querySelector("input[name=borrowerType]:checked").value;
          if (type === "member" && !form.querySelector("#rl-member").value) {
            showFormError(form, "Select the member borrower.");
            return;
          }
          if (type === "non_member" && (!form.querySelector("#rl-name").value.trim() || !form.querySelector("#rl-care").value)) {
            showFormError(form, "Enter the non-member borrower and the caring member.");
            return;
          }
          UI.setBusy(submit, true, "Approving…");
          try {
            await COOP.actions.decideLoanRequest(request.id, "approve", UI.formData(form));
            modal.close();
            refresh("Loan request approved and released.");
          } catch (err) {
            showFormError(form, err.message);
            UI.setBusy(submit, false);
          }
        });
      }
    });
    return modal;
  }

  function recommendRequest(request) {
    UI.askReason({
      title: "Recommend loan request",
      message: "Endorse " + (request.requestedByName || "this member") + "'s " + U.money(request.principal) +
        " loan request to the president for final approval? Add an optional note with your recommendation.",
      label: "Recommendation note (optional)",
      confirmLabel: "Recommend to president",
      optional: true,
      tone: "primary"
    }).then(async function (note) {
      if (note === null) return;
      try {
        await COOP.actions.recommendLoanRequest(request.id, note || "");
        refresh("Request recommended to the president.");
      } catch (err) {
        UI.toast(err.message, "danger");
      }
    });
  }

  function rejectRequest(request) {
    UI.askReason({
      title: "Reject loan request",
      message: "Reject this " + U.money(request.principal) + " loan request from " + (request.requestedByName || "a member") + "? The requester will see the reason.",
      label: "Rejection reason",
      confirmLabel: "Reject request",
      tone: "danger"
    }).then(async function (reason) {
      if (!reason) return;
      try {
        await COOP.actions.decideLoanRequest(request.id, "reject", { notes: reason });
        refresh("Loan request rejected.");
      } catch (err) {
        UI.toast(err.message, "danger");
      }
    });
  }

  function approve(id) {
    const db = store.get();
    const loan = db.loans.find(function (l) { return l.id === id; });
    if (!loan) return;
    UI.confirm({
      title: "Approve loan?",
      message: "Approve " + loan.loanNo + " for " + D.borrowerName(loan, db) + " in the amount of " + U.money(loan.principal) + "? The loan will become active and increase outstanding loans.",
      confirmLabel: "Approve and release",
      tone: "primary"
    }).then(function (ok) {
      if (!ok) return;
      try {
        COOP.actions.approveLoan(id);
        refresh("Loan approved and released.");
      } catch (err) {
        UI.toast(err.message, "danger");
      }
    });
  }

  function reject(id) {
    UI.askReason({
      title: "Reject loan request",
      message: "Reject this over-limit loan request? The requester will see the reason in the approval history.",
      label: "Rejection reason",
      confirmLabel: "Reject request",
      tone: "danger"
    }).then(function (reason) {
      if (!reason) return;
      try {
        COOP.actions.rejectLoan(id, reason);
        refresh("Loan request rejected.");
      } catch (err) {
        UI.toast(err.message, "danger");
      }
    });
  }

  function cancel(id) {
    UI.askReason({
      title: "Cancel loan",
      message: "Cancel this loan? This is only allowed when no payments have been posted.",
      label: "Cancellation reason",
      confirmLabel: "Cancel loan",
      tone: "danger"
    }).then(function (reason) {
      if (!reason) return;
      try {
        COOP.actions.cancelLoan(id, reason);
        refresh("Loan cancelled.");
      } catch (err) {
        UI.toast(err.message, "danger");
      }
    });
  }

  function remove(id) {
    const db = store.get();
    const loan = db.loans.find(function (l) { return l.id === id; });
    if (!loan) return;
    UI.confirm({
      title: "Delete loan?",
      message: "Permanently delete " + loan.loanNo + "? This cannot be undone.",
      confirmLabel: "Delete loan",
      tone: "danger"
    }).then(function (ok) {
      if (!ok) return;
      try {
        COOP.actions.deleteLoan(id);
        refresh("Loan deleted.");
      } catch (err) {
        UI.toast(err.message, "danger");
      }
    });
  }

  function ledgerRows(summary) {
    if (!summary.rows.length) {
      return '<tr><td colspan="5" class="empty-row">No interest or payment entries yet.</td></tr>';
    }
    return summary.rows.map(function (row) {
      if (row.type === "interest") {
        return '<tr><td>' + U.formatDate(row.date) + '</td><td><span class="badge warning">Interest</span><div class="sub">' + U.number(row.days, 0) + " days</div></td>" +
          '<td class="num">' + U.money(row.interest) + '</td><td class="num">' + U.money(row.principalBalance) + '</td><td class="num">' + U.money(row.balance) + "</td></tr>";
      }
      return '<tr><td>' + U.formatDate(row.date) + '</td><td><span class="badge success">Payment</span></td>' +
        '<td class="num">' + U.money(row.amount) + '</td><td class="num">' + U.money(row.principalPortion) + '</td><td class="num">' + U.money(row.balance) + "</td></tr>";
    }).join("");
  }

  function openDetail(id, readOnly) {
    const db = store.get();
    const loan = db.loans.find(function (l) { return l.id === id; });
    if (!loan) {
      UI.toast("Loan not found.", "danger");
      return;
    }
    const summary = summaryFor(db, loan);
    const member = loan.borrowerType === "member" ? db.members.find(function (m) { return m.id === loan.memberId; }) : null;
    const careOf = loan.careOfMemberId ? db.members.find(function (m) { return m.id === loan.careOfMemberId; }) : null;
    const payments = (db.payments || []).filter(function (p) { return p.loanId === loan.id && !p.voided; })
      .slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    const approval = loan.approvalId ? (db.approvals || []).find(function (a) { return a.id === loan.approvalId; }) : null;
    const approvalRecommended = loanApprovalRecommended(db, loan);
    const canRelease = loan.status === "pending" && (store.can("loans.manage") || (store.can("approvals.manage") && approvalRecommended));
    const canRecommend = !readOnly && loan.status === "pending" && store.can("loans.manage") && !store.can("approvals.manage") && !approvalRecommended;
    const canPay = !readOnly && loan.status === "active" && summary.balance > 0.005 && store.can("payments.manage");
    const canEdit = !readOnly && ["pending", "active"].includes(loan.status) && payments.length === 0 && store.can("loans.manage");
    const canCancel = !readOnly && ["pending", "active"].includes(loan.status) && payments.length === 0 && store.can("loans.manage");
    const canDelete = !readOnly && ["pending", "rejected", "cancelled"].includes(loan.status) && payments.length === 0 && store.can("loans.manage");

    const paymentRows = payments.length ? payments.map(function (payment) {
      return '<tr><td><span class="strong">' + U.esc(payment.receiptNo) + '</span><div class="sub">' + U.esc(payment.method) + "</div></td>" +
        "<td>" + U.formatDate(payment.date) + "</td>" +
        '<td class="num">' + U.money(payment.amount) + "</td>" +
        '<td class="num">' + U.money(payment.interestPortion) + "</td>" +
        '<td class="num">' + U.money(payment.principalPortion) + "</td>" +
        '<td class="num">' + U.money(payment.credit) + "</td>" +
        '<td class="actions">' + (readOnly ? "" : '<button class="btn sm ghost" type="button" data-receipt="' + U.esc(payment.id) + '">Receipt</button>') + "</td></tr>";
    }).join("") : '<tr><td colspan="7" class="empty-row">No payments recorded.</td></tr>';

    const statusText = summary.displayStatus;
    const lenderLabel = loan.borrowerType === "non_member" ? "Non-member" : "Member";

    const actionsFooter = readOnly
      ? '<button class="btn" type="button" data-close>Close</button><button class="btn primary" type="button" data-print>' + U.icon("printer", "icon-sm") + " Print statement</button>"
      : '<button class="btn" type="button" data-close>Close</button>' +
        (canDelete ? '<button class="btn danger-soft" type="button" data-delete>' + U.icon("trash", "icon-sm") + " Delete</button>" : "") +
        (canCancel ? '<button class="btn danger-soft" type="button" data-cancel-loan>Cancel loan</button>' : "") +
        (canEdit ? '<button class="btn" type="button" data-edit>' + U.icon("edit", "icon-sm") + " Edit</button>" : "") +
        (canRelease ? '<button class="btn danger-soft" type="button" data-reject>Reject</button><button class="btn primary" type="button" data-approve>Approve &amp; release</button>' : "") +
        (canRecommend ? '<button class="btn primary" type="button" data-recommend-loan>Recommend</button>' : "") +
        (canPay ? '<button class="btn primary" type="button" data-pay>' + U.icon("credit-card", "icon-sm") + " Record payment</button>" : '<button class="btn" type="button" data-print>' + U.icon("printer", "icon-sm") + " Print</button>");

    const modal = UI.modal({
      title: "Loan " + loan.loanNo,
      subtitle: (member ? D.memberName(member) : loan.borrowerName) + " · Released " + U.formatDate(loan.startDate),
      size: "xl",
      body:
        '<div class="member-hero mb-3">' + UI.avatar(member ? D.memberName(member) : loan.borrowerName, "lg") +
          '<div class="meta"><h2>' + U.esc(member ? D.memberName(member) : loan.borrowerName) + "</h2>" +
            '<div class="sub">' + (loan.borrowerType === "non_member" && careOf ? "Care of " + U.esc(D.memberName(careOf)) : "") + "</div>" +
            '<div class="pill-list mt-2">' + UI.statusBadge(statusText) + UI.badge(lenderLabel, loan.borrowerType === "non_member" ? "purple" : "info") +
            UI.badge(U.number(loan.interestRate, 2) + "% monthly", "outline") + UI.badge("No fixed term", "outline") + "</div></div>" +
          '<div class="hero-stat"><div class="label">Outstanding balance</div><div class="value">' + U.money(summary.balance) + "</div>" +
            '<div class="mt-1">' + UI.badge(U.percent(summary.progress, 1) + " principal paid", "success") + "</div></div>" +
        "</div>" +
        '<div class="grid-4 mb-3">' +
          '<div class="summary-box"><div class="label">Principal</div><div class="value">' + U.money(loan.principal) + '</div><div class="sub">Released ' + U.formatDate(loan.startDate) + "</div></div>" +
          '<div class="summary-box"><div class="label">Total payments</div><div class="value">' + U.money(summary.totalReceived) + '</div><div class="sub">' + summary.paymentCount + " " + U.plural(summary.paymentCount, "payment") + "</div></div>" +
          '<div class="summary-box"><div class="label">Interest</div><div class="value">' + U.money(summary.totalInterestAccrued) + '</div><div class="sub">' + U.money(summary.interestBalance) + " unpaid</div></div>" +
          '<div class="summary-box"><div class="label">Settlement reminder</div><div class="value" style="font-size:.95rem">Before December</div><div class="sub">No fixed term or monthly due date</div></div>' +
        "</div>" +
        (readOnly && loan.status === "active" && summary.balance > 0.005
          ? '<div class="alert info mb-3">' + U.icon("cash", "icon-sm") + "<div><strong>Paying via cash?</strong> Please contact the treasurer to arrange in-person cash payment. For online transfers (bank, GCash, Maya, Check), use the Pay button on your My Loans page and attach proof of payment.</div></div>"
          : "") +
        (loan.status === "pending" || loan.status === "rejected" ? '<div class="alert ' + (loan.status === "rejected" ? "danger" : "warning") + ' mb-3">' + U.icon("alert-triangle", "icon-sm") +
          "<div><strong>" + (loan.status === "rejected" ? "Rejected request" : "Pending approval") + ".</strong> " +
          U.esc(approval && approval.reason ? approval.reason : "This loan is waiting for an approval decision.") +
          (approvalRecommended && !canRelease ? " Recommended by " + U.esc(approval && approval.recommendedByName || "") + " — awaiting the president's final decision." : "") +
          (approval && approval.decisionNotes ? " Decision note: " + U.esc(approval.decisionNotes) : "") + "</div></div>" : "") +
          '<div class="card mb-3"><div class="card-head"><div><h3>Payment history</h3><div class="sub">Interest is added between payments.</div></div></div>' +
          '<div class="card-body flush"><div class="table-wrap table-scroll-sm"><table class="data"><thead><tr><th>Date</th><th>Entry</th><th class="num">Amount</th><th class="num">Principal balance</th><th class="num">Total balance</th></tr></thead><tbody>' + ledgerRows(summary) + "</tbody></table></div></div></div>" +
        '<div class="grid-2">' +
          '<div class="card"><div class="card-head"><div><h3>Loan details</h3><div class="sub">Loan and borrower information</div></div></div><div class="card-body"><div class="info-list">' +
            '<div class="info-item"><div class="label">Principal</div><div class="value">' + U.money(loan.principal) + "</div></div>" +
            '<div class="info-item"><div class="label">Interest</div><div class="value">' + U.number(loan.interestRate, 2) + "% per month, added daily between payments</div></div>" +
            '<div class="info-item"><div class="label">Settlement</div><div class="value">No fixed term; settle before December each year</div></div>' +
            '<div class="info-item"><div class="label">Purpose</div><div class="value ' + (loan.purpose ? "" : "muted") + '">' + U.esc(loan.purpose || "Not provided") + "</div></div>" +
            (loan.disburseMethod
              ? '<div class="info-item"><div class="label">Disbursed via</div><div class="value">' + U.esc((DISBURSE_LABELS[loan.disburseMethod] || loan.disburseMethod) + (loan.disburseDetail ? " — " + loan.disburseDetail : "")) + "</div></div>"
              : "") +
            '<div class="info-item"><div class="label">Collateral</div><div class="value ' + (loan.collateral ? "" : "muted") + '">' + U.esc(loan.collateral || "None recorded") + "</div></div>" +
            (loan.notes ? '<div class="info-item"><div class="label">Notes</div><div class="value">' + U.esc(loan.notes) + "</div></div>" : "") +
          "</div></div></div>" +
          '<div class="card"><div class="card-head"><div><h3>Payments</h3><div class="sub">' + payments.length + " posted " + U.plural(payments.length, "payment") + "</div></div></div>" +
            '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>OR no.</th><th>Date</th><th class="num">Amount</th><th class="num">Interest</th><th class="num">Principal</th><th class="num">Credit</th><th></th></tr></thead><tbody>' + paymentRows + "</tbody></table></div></div></div>" +
        "</div>",
      footer: actionsFooter,
      onMount: function (modalEl) {
        modalEl.querySelector("[data-close]").addEventListener("click", modal.close);
        const print = modalEl.querySelector("[data-print]");
        if (print) print.addEventListener("click", function () { UI.print(); });
        const pay = modalEl.querySelector("[data-pay]");
        if (pay) pay.addEventListener("click", function () {
          modal.close();
          pages.payments.openForm(loan.id);
        });
        const edit = modalEl.querySelector("[data-edit]");
        if (edit) edit.addEventListener("click", function () { modal.close(); openForm(loan.id); });
        const approveButton = modalEl.querySelector("[data-approve]");
        if (approveButton) approveButton.addEventListener("click", function () { modal.close(); approve(loan.id); });
        const recommendLoanButton = modalEl.querySelector("[data-recommend-loan]");
        if (recommendLoanButton) recommendLoanButton.addEventListener("click", function () {
          modal.close();
          UI.askReason({
            title: "Recommend loan",
            message: "Endorse " + loan.loanNo + " (" + U.money(loan.principal) + ") to the president for final approval? Add an optional note.",
            label: "Recommendation note (optional)",
            confirmLabel: "Recommend to president",
            optional: true,
            tone: "primary"
          }).then(async function (note) {
            if (note === null) return;
            try {
              await COOP.actions.recommendLoan(loan.id, note || "");
              refresh("Loan recommended to the president.");
            } catch (err) {
              UI.toast(err.message, "danger");
            }
          });
        });
        const rejectButton = modalEl.querySelector("[data-reject]");
        if (rejectButton) rejectButton.addEventListener("click", function () { modal.close(); reject(loan.id); });
        const cancelButton = modalEl.querySelector("[data-cancel-loan]");
        if (cancelButton) cancelButton.addEventListener("click", function () { modal.close(); cancel(loan.id); });
        const deleteButton = modalEl.querySelector("[data-delete]");
        if (deleteButton) deleteButton.addEventListener("click", function () { modal.close(); remove(loan.id); });
        modalEl.querySelectorAll("[data-receipt]").forEach(function (button) {
          button.addEventListener("click", function () {
            modal.close();
            pages.payments.openReceipt(button.getAttribute("data-receipt"));
          });
        });
      }
    });
    return modal;
  }

  pages.loans = {
    openForm: openForm,
    openDetail: openDetail,
    render: function (root) {
      const db = store.get();
      const funds = D.funds(db);
      const state = U.tableState("loans");
      let loans = (db.loans || []).map(function (loan) {
        const summary = summaryFor(db, loan);
        return {
          loan: loan,
          summary: summary,
          _loanNo: loan.loanNo,
          _borrower: D.borrowerName(loan, db),
          _principal: loan.principal,
          _balance: summary.balance,
          _interestRate: loan.interestRate,
          _status: summary.displayStatus
        };
      });
      if (state.sortKey) {
        loans = U.sortByKey(loans, "_" + state.sortKey.replace(/^_/, ""), state.sortDir);
      } else {
        loans.sort(function (a, b) {
          return b.summary.balance - a.summary.balance;
        });
      }
      const pending = loans.filter(function (x) { return x.loan.status === "pending"; });
      const outstanding = funds.outstanding;
      let totalInterestAccrued = 0;
      loans.forEach(function (item) {
        totalInterestAccrued = U.round2(totalInterestAccrued + item.summary.totalInterestAccrued);
      });

      const rows = loans.length ? loans.map(function (item) {
        const loan = item.loan;
        const summary = item.summary;
        const borrower = item._borrower;
        const careOf = loan.borrowerType === "non_member" ? D.careOfName(loan, db) : "";
        return '<tr class="row-click" data-loan-row="' + U.esc(loan.id) + '" data-search="' + U.esc((loan.loanNo + " " + borrower + " " + careOf).toLowerCase()) + '" data-status="' + U.esc(summary.displayStatus) + '">' +
          '<td><span class="strong">' + U.esc(loan.loanNo) + '</span><div class="sub">' + U.formatDate(loan.startDate) + "</div></td>" +
          '<td><div class="cell-person">' + UI.avatar(borrower) +
            '<div class="meta"><div class="name">' + U.esc(borrower) + "</div><div class=\"sub\">" +
            (careOf ? "Care of " + U.esc(careOf) : "Member") + "</div></div></div></td>" +
          '<td class="num">' + U.money(loan.principal) + "</td>" +
          '<td class="num">' + U.money(summary.balance) + "</td>" +
          '<td class="num">' + U.number(loan.interestRate, 2) + "%</td>" +
          "<td>" + UI.statusBadge(summary.displayStatus) + "</td>" +
          '<td class="actions">' +
            (loan.status === "active" && summary.balance > 0.005 ? '<button class="btn sm ghost" type="button" data-pay="' + U.esc(loan.id) + '">Pay</button>' : "") +
            (loan.status === "pending" ? (store.can("loans.manage")
                ? '<button class="btn sm ghost" type="button" data-approve="' + U.esc(loan.id) + '">Approve &amp; release</button>' +
                  (!store.can("approvals.manage") && !loanApprovalRecommended(db, loan)
                    ? '<button class="btn sm ghost" type="button" data-recommend="' + U.esc(loan.id) + '">Forward</button>'
                    : "")
                : (store.can("approvals.manage") && loanApprovalRecommended(db, loan)
                  ? '<button class="btn sm primary" type="button" data-approve="' + U.esc(loan.id) + '">Approve &amp; release</button>'
                  : '<span class="muted">Awaiting treasurer</span>')) : "") +
            '<button class="btn sm ghost" type="button" data-view="' + U.esc(loan.id) + '">View</button>' +
          "</td></tr>";
      }).join("") : '<tr><td colspan="7" class="empty-row">No loans yet. Create the first loan to get started.</td></tr>';

      root.innerHTML =
        '<div class="page-head"><div><span class="eyebrow">' + U.icon("hand-coins", "icon-sm") + " Lending</span>" +
          "<h1>Loans</h1><div class=\"sub\">Simple loans with daily interest and no fixed term.</div></div>" +
          '<div class="page-actions"><button class="btn" data-action="export">' + U.icon("download", "icon-sm") + " Export CSV</button>" +
          '<button class="btn primary" data-action="add">' + U.icon("plus", "icon-sm") + " New loan</button></div></div>" +
        '<div class="section"><div class="section-head">' +
          U.icon("hand-coins", "section-icon") +
          "<h3>Overview</h3>" +
        "</div>" +
        '<div class="stat-grid">' +
          stat("hand-coins", "Outstanding loans", U.money(outstanding), funds.activeLoanCount + " active " + U.plural(funds.activeLoanCount, "loan"), "tone-info") +
          stat("credit-card", "Interest collected", U.money(funds.interestCollected), "Across all posted payments", "tone-success") +
          stat("percent", "Projected interest earned", U.money(totalInterestAccrued), "Accrued across all loans as of " + U.today(), "tone-info") +
          stat("clock", "Pending approval", U.number(pending.length, 0), pending.length ? "Awaiting a decision" : "No pending requests", pending.length ? "tone-warning" : "") +
        "</div></div>" +
        (store.can("loans.manage")
          ? '<div class="section"><div class="section-head">' +
            U.icon("user-plus", "section-icon") +
            "<h3>Loan requests</h3>" +
            '<div class="section-sub">' + (db.loanRequests || []).filter(function (r) { return r.status === "pending"; }).length + " awaiting review</div>" +
          "</div>" +
          '<div class="card"><div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Requested by</th><th class="num">Amount</th><th>Purpose</th><th>Requested on</th><th class="actions">Decision</th></tr></thead><tbody>' +
          loanRequestRows(db) +
          "</tbody></table></div></div></div></div>"
          : "") +
        '<div class="section"><div class="section-head">' +
          U.icon("credit-card", "section-icon") +
          "<h3>All loans</h3>" +
          '<div class="section-sub">' + loans.length + " " + U.plural(loans.length, "loan") + " in total</div>" +
        "</div>" +
        '<div class="card"><div class="card-body flush"><div class="table-filter mb-0"><div class="search">' + U.icon("search") + '<input class="input" id="loan-search" placeholder="Search loan or borrower…"></div>' +
        '<select class="select" id="loan-status-filter"><option value="">All statuses</option><option value="active">Active</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select></div></div>' +
        '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr>' +
          '<th class="sortable" data-sort="loanNo">Loan' + (state.sortKey === "loanNo" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="borrower">Borrower' + (state.sortKey === "borrower" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable num" data-sort="principal">Principal' + (state.sortKey === "principal" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable num" data-sort="balance">Balance' + (state.sortKey === "balance" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable num" data-sort="interestRate">Rate' + (state.sortKey === "interestRate" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="status">Status' + (state.sortKey === "status" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th></th>' +
        '</tr></thead><tbody>' + rows + "</tbody></table></div>" +
        (loans.length ? "" : '<div class="empty" style="border-top:1px solid var(--border)">' +
          '<div class="empty-icon">' + U.icon("hand-coins") + "</div><h3>No loans yet</h3>" +
          "<p>Create a loan for a member or a non-member with a caring member. Over-limit requests will be routed for approval.</p>" +
          '<div class="empty-actions"><button class="btn primary" data-action="add">' + U.icon("plus", "icon-sm") + " New loan</button></div></div>") +
        "</div></div></div>";

      const search = root.querySelector("#loan-search");
      const status = root.querySelector("#loan-status-filter");
      function filterRows() {
        const q = search.value.toLowerCase().trim();
        const s = status.value;
        root.querySelectorAll("tbody tr[data-loan-row]").forEach(function (row) {
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
          const s2 = U.tableState("loans");
          if (s2.sortKey === key) {
            s2.sortDir = s2.sortDir === "asc" ? "desc" : "asc";
          } else {
            s2.sortKey = key;
            s2.sortDir = "asc";
          }
          U.tableSave("loans", s2);
          pages.loans.render(root);
        });
      });

      root.querySelectorAll("tbody tr[data-loan-row]").forEach(function (row) {
        row.addEventListener("click", function (event) {
          if (event.target.closest("button")) return;
          openDetail(row.getAttribute("data-loan-row"));
        });
      });
      root.querySelectorAll("[data-view]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          openDetail(button.getAttribute("data-view"));
        });
      });
      root.querySelectorAll("[data-pay]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          pages.payments.openForm(button.getAttribute("data-pay"));
        });
      });
      root.querySelectorAll("[data-approve]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          approve(button.getAttribute("data-approve"));
        });
      });
      root.querySelectorAll("[data-recommend]").forEach(function (button) {
        button.addEventListener("click", function () {
          const loan = db.loans.find(function (l) { return l.id === button.getAttribute("data-recommend"); });
          if (!loan) return;
          UI.askReason({
            title: "Recommend loan",
            message: "Endorse " + loan.loanNo + " (" + U.money(loan.principal) + ") to the president for final approval? Add an optional note.",
            label: "Recommendation note (optional)",
            confirmLabel: "Recommend to president",
            optional: true,
            tone: "primary"
          }).then(async function (note) {
            if (note === null) return;
            try {
              await COOP.actions.recommendLoan(loan.id, note || "");
              refresh("Loan recommended to the president.");
            } catch (err) {
              UI.toast(err.message, "danger");
            }
          });
        });
      });
      root.querySelectorAll("[data-action=add]").forEach(function (button) {
        button.addEventListener("click", function () { openForm(); });
      });
      root.querySelectorAll("[data-request-approve]").forEach(function (button) {
        button.addEventListener("click", function () {
          const request = (db.loanRequests || []).find(function (r) { return r.id === button.getAttribute("data-request-approve"); });
          if (request) openRequestForm(request);
        });
      });
      root.querySelectorAll("[data-request-reject]").forEach(function (button) {
        button.addEventListener("click", function () {
          const request = (db.loanRequests || []).find(function (r) { return r.id === button.getAttribute("data-request-reject"); });
          if (request) rejectRequest(request);
        });
      });
      root.querySelectorAll("[data-request-forward]").forEach(function (button) {
        button.addEventListener("click", function () {
          const request = (db.loanRequests || []).find(function (r) { return r.id === button.getAttribute("data-request-forward"); });
          if (request) recommendRequest(request);
        });
      });
      root.querySelectorAll("[data-request-recommend]").forEach(function (button) {
        button.addEventListener("click", function () {
          const request = (db.loanRequests || []).find(function (r) { return r.id === button.getAttribute("data-request-recommend"); });
          if (request) recommendRequest(request);
        });
      });
      const exportButton = root.querySelector("[data-action=export]");
      if (exportButton) exportButton.addEventListener("click", function () {
        const csv = [["Loan No", "Borrower", "Type", "Care of", "Principal", "Rate", "Released", "Balance", "Interest", "Status"]];
        loans.forEach(function (item) {
          csv.push([
            item.loan.loanNo, D.borrowerName(item.loan, db), item.loan.borrowerType,
            item.loan.borrowerType === "non_member" ? D.careOfName(item.loan, db) : "",
            item.loan.principal, item.loan.interestRate, item.loan.startDate,
            item.summary.balance, item.summary.totalInterestAccrued, item.summary.displayStatus
          ]);
        });
        UI.downloadCSV("coop-loans-" + U.today() + ".csv", csv);
        UI.toast("Loans exported.");
      });
    }
  };
})();
