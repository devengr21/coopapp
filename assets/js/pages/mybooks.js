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

  function requestRows(db, user) {
    const requests = (db.loanRequests || []).filter(function (r) {
      return r.requestedById === user.id;
    }).sort(function (a, b) { return String(b.requestedAt).localeCompare(String(a.requestedAt)); });
    if (!requests.length) {
      return '<tr><td colspan="4" class="empty-row">You have not availed any loan yet.</td></tr>';
    }
    return requests.map(function (r) {
      const loan = r.loanId ? (db.loans || []).find(function (l) { return l.id === r.loanId; }) : null;
      return '<tr' + (loan ? ' class="row-click" data-portal-loan="' + U.esc(loan.id) + '"' : "") + ">" +
        '<td class="num strong">' + U.money(r.principal) + "</td>" +
        "<td>" + U.esc(r.purpose || "-") + "</td>" +
        "<td>" + U.formatDate(r.requestedAt) + "</td>" +
        "<td>" + (r.status === "approved" ? UI.badge("Approved", "success") : UI.statusBadge(r.status)) +
          (loan ? ' <span class="badge info">' + U.esc(loan.loanNo) + "</span>" : "") + "</td></tr>";
    }).join("");
  }

  function requestStats(db, user) {
    const requests = (db.loanRequests || []).filter(function (r) { return r.requestedById === user.id; });
    const pending = requests.filter(function (r) { return r.status === "pending"; }).length;
    const approved = requests.filter(function (r) { return r.status === "approved"; }).length;
    const rejected = requests.filter(function (r) { return r.status === "rejected"; }).length;
    return { total: requests.length, pending: pending, approved: approved, rejected: rejected };
  }

  function loanWizard(form, footer) {
    const step1 = form.querySelector("[data-wiz-step]");
    const step2 = form.querySelector("[data-wiz-detail]");
    const btnNext = footer.querySelector("[data-wiz-next]");
    const btnBack = footer.querySelector("[data-wiz-back]");
    const btnSubmit = footer.querySelector("[data-wiz-submit]");
    const methodSel = form.querySelector("[data-disburse-method]");
    let shown = false;
    function branch() {
      if (!methodSel) return "cash";
      const method = methodSel.value;
      step2.querySelectorAll("[data-disburse]").forEach(function (field) {
        const on = field.getAttribute("data-disburse") === method;
        field.hidden = !on;
        field.querySelectorAll("input,textarea").forEach(function (input) {
          input.required = on;
        });
      });
      return method;
    }
    if (methodSel) {
      methodSel.addEventListener("change", function () {
        if (shown) branch();
      });
    }
    if (btnNext) {
      btnNext.addEventListener("click", function (event) {
        event.preventDefault();
        if (shown) return;
        for (const el of Array.from(step1.querySelectorAll("input[required],select[required],textarea[required]"))) {
          if (!el.checkValidity()) { el.reportValidity(); return; }
        }
        shown = true;
        if (step1) step1.hidden = true;
        if (step2) step2.hidden = false;
        branch();
        if (btnNext) btnNext.hidden = true;
        if (btnBack) btnBack.hidden = false;
        if (btnSubmit) btnSubmit.hidden = false;
        const first = Array.from(step2.querySelectorAll("input,textarea")).filter(function (el) {
          return !el.closest("[data-disburse]").hidden;
        })[0];
        if (first) first.focus();
      });
    }
    if (btnBack) {
      btnBack.addEventListener("click", function (event) {
        event.preventDefault();
        if (!shown) return;
        shown = false;
        if (step1) step1.hidden = false;
        if (step2) step2.hidden = true;
        if (btnNext) btnNext.hidden = false;
        btnBack.hidden = true;
        if (btnSubmit) btnSubmit.hidden = true;
      });
    }
    return { method: function () { return methodSel ? methodSel.value : "cash"; } };
  }

  function openMemberPayment(loanId) {
    const db = store.get();
    const loan = db.loans.find(function (l) { return l.id === loanId; });
    if (!loan) return;
    const summary = D.loanLedger(loan, db.payments, U.today());
    const balance = summary.balance;
    const member = store.currentMember();
    const modal = UI.modal({
      title: "Make a payment",
      subtitle: "Pay loan " + loan.loanNo + " for " + U.money(balance) + " outstanding balance.",
      size: "md",
      body:
        '<div class="alert danger hidden" data-form-error role="alert">' + U.icon("alert-triangle", "icon-sm") + "<div data-form-error-text></div></div>" +
        '<form id="member-pay-form" autocomplete="off"><div class="form-grid">' +
          '<div class="field"><label for="mp-amount">Amount to pay<span class="req">*</span></label>' +
            '<div class="inline"><input class="input" id="mp-amount" name="amount" type="number" min="0.01" step="0.01" value="' + U.esc(U.money(balance)) + '" required placeholder="0.00"><span class="muted">max ' + U.money(balance) + "</span></div></div>" +
          '<div class="field"><label for="mp-method">Payment method<span class="req">*</span></label>' +
            '<select class="select" id="mp-method" name="method">' +
            '<option value="Bank transfer">Bank transfer</option>' +
            '<option value="GCash">GCash</option>' +
            '<option value="Maya">Maya</option>' +
            '<option value="Check">Check</option>' +
            '<option value="Other">Other</option>' +
            '<option value="Cash">Cash (in-person)</option>' +
            "</select>" +
            '<div class="help" id="mp-method-help" style="font-size:.8rem;color:var(--muted);margin-top:4px">Attach proof of transfer for online payments.</div></div>' +
          '<div class="field"><label for="mp-date">Payment date<span class="req">*</span></label><input class="input" id="mp-date" name="date" type="date" value="' + U.today() + '" required></div>' +
          '<div class="field"><label for="mp-reference">Reference / transaction no.</label><input class="input" id="mp-reference" name="reference" placeholder="e.g. GCash reference, bank transaction ID"></div>' +
          '<div class="field full"><label for="mp-notes">Notes</label><input class="input" id="mp-notes" name="notes" placeholder="Optional notes for the treasurer"></div>' +
          '<div class="field full" id="mp-proof-wrap"><label for="mp-proof">Proof of payment<span class="req">*</span></label>' +
            '<input class="input" id="mp-proof" name="proofFile" type="file" accept="image/*,application/pdf" required>' +
            '<div class="help">Upload a photo or PDF of your proof of payment (receipt, transfer confirmation, etc.).</div></div>' +
        "</div></form>",
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn primary" type="submit" form="member-pay-form">' + U.icon("credit-card", "icon-sm") + " Submit payment</button>",
      onMount: function (modalEl) {
        const form = modalEl.querySelector("#member-pay-form");
        const methodSel = form.querySelector("#mp-method");
        const help = modalEl.querySelector("#mp-method-help");
        const proofInput = form.querySelector("#mp-proof");
        const proofWrap = proofInput.closest(".field");
        function updateMethodHelp() {
          const isCash = methodSel.value === "Cash";
          if (isCash) {
            help.textContent = "Cash payments are made in person. Contact the treasurer to arrange payment.";
            proofInput.required = false;
            proofWrap.classList.add("hidden");
          } else {
            help.textContent = "Attach proof of transfer for online payments.";
            proofInput.required = true;
            proofWrap.classList.remove("hidden");
          }
        }
        methodSel.addEventListener("change", updateMethodHelp);
        updateMethodHelp();
        modalEl.querySelector("[data-cancel]").addEventListener("click", modal.close);
        form.addEventListener("submit", async function (event) {
          event.preventDefault();
          const box = form.querySelector("[data-form-error]");
          const text = form.querySelector("[data-form-error-text]");
          if (box) box.classList.add("hidden");
          const amount = U.toNumber(form.querySelector("#mp-amount").value);
          if (!amount || amount <= 0) {
            if (box && text) { text.textContent = "Enter a valid amount."; box.classList.remove("hidden"); }
            return;
          }
          if (amount > balance + 0.005) {
            if (box && text) { text.textContent = "Amount exceeds the outstanding balance of " + U.money(balance) + "."; box.classList.remove("hidden"); }
            return;
          }
          const method = methodSel.value;
          if (method !== "Cash") {
            const files = proofInput.files;
            if (!files || !files.length) {
              if (box && text) { text.textContent = "Please attach proof of payment."; box.classList.remove("hidden"); }
              return;
            }
          }
          UI.setBusy(form.querySelector("[type=submit]"), true, "Submitting…");
          try {
            const reader = new FileReader();
            reader.onload = async function () {
              try {
                await COOP.actions.requestPayment({
                  loanId: loanId,
                  amount: amount,
                  method: method,
                  date: form.querySelector("#mp-date").value,
                  reference: form.querySelector("#mp-reference").value,
                  notes: form.querySelector("#mp-notes").value,
                  proofFile: reader.result,
                  proofFileName: method === "Cash" ? "" : (proofInput.files[0] ? proofInput.files[0].name : "")
                });
                modal.close();
                UI.toast("Payment request submitted. The treasurer will review it.");
                if (COOP.app) COOP.app.refresh();
              } catch (err) {
                if (box && text) { text.textContent = err.message; box.classList.remove("hidden"); }
                UI.setBusy(form.querySelector("[type=submit]"), false);
              }
            };
            if (method !== "Cash" && proofInput.files[0]) {
              reader.readAsDataURL(proofInput.files[0]);
            } else {
              reader.onload();
            }
          } catch (err) {
            if (box && text) { text.textContent = err.message; box.classList.remove("hidden"); }
            UI.setBusy(form.querySelector("[type=submit]"), false);
          }
        });
      }
    });
    return modal;
  }

  function openMemberContributionPayment() {
    const db = store.get();
    const member = store.currentMember();
    const current = D.contributionRows(db, U.monthKey()).rows.find(function (r) { return r.member.id === member.id; });
    if (!current || current.status === "paid") {
      UI.toast("Your current month contribution is already settled.", "warning");
      return;
    }
    const expected = D.contributionExpected(member, db.settings);
    const balance = current.status === "waived" ? expected : (current.balance || expected);
    const modal = UI.modal({
      title: "Pay contribution",
      subtitle: "Pay your " + U.formatMonth(current.period) + " monthly contribution. Expected: " + U.money(expected) + ".",
      size: "md",
      body:
        '<div class="alert danger hidden" data-form-error role="alert">' + U.icon("alert-triangle", "icon-sm") + "<div data-form-error-text></div></div>" +
        '<form id="member-contrib-pay-form" autocomplete="off"><div class="form-grid">' +
          '<div class="field"><label for="mc-amount">Amount to pay<span class="req">*</span></label>' +
            '<div class="inline"><input class="input" id="mc-amount" name="amount" type="number" min="0.01" step="0.01" value="' + U.esc(U.money(balance)) + '" required placeholder="0.00"><span class="muted">balance ' + U.money(balance) + "</span></div></div>" +
          '<div class="field"><label for="mc-method">Payment method<span class="req">*</span></label>' +
            '<select class="select" id="mc-method" name="method">' +
            '<option value="Bank transfer">Bank transfer</option>' +
            '<option value="GCash">GCash</option>' +
            '<option value="Maya">Maya</option>' +
            '<option value="Check">Check</option>' +
            '<option value="Other">Other</option>' +
            '<option value="Cash">Cash (in-person)</option>' +
            "</select>" +
            '<div class="help" id="mc-method-help" style="font-size:.8rem;color:var(--muted);margin-top:4px">Attach proof of transfer for online payments.</div></div>' +
          '<div class="field"><label for="mc-date">Payment date<span class="req">*</span></label><input class="input" id="mc-date" name="date" type="date" value="' + U.today() + '" required></div>' +
          '<div class="field"><label for="mc-reference">Reference / transaction no.</label><input class="input" id="mc-reference" name="reference" placeholder="e.g. GCash reference, bank transaction ID"></div>' +
          '<div class="field full"><label for="mc-notes">Notes</label><input class="input" id="mc-notes" name="notes" placeholder="Optional notes for the treasurer"></div>' +
          '<div class="field full" id="mc-proof-wrap"><label for="mc-proof">Proof of payment<span class="req">*</span></label>' +
            '<input class="input" id="mc-proof" name="proofFile" type="file" accept="image/*,application/pdf" required>' +
            '<div class="help">Upload a photo or PDF of your proof of payment (receipt, transfer confirmation, etc.).</div></div>' +
        "</div></form>",
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn primary" type="submit" form="member-contrib-pay-form">' + U.icon("credit-card", "icon-sm") + " Submit payment</button>",
      onMount: function (modalEl) {
        const form = modalEl.querySelector("#member-contrib-pay-form");
        const methodSel = form.querySelector("#mc-method");
        const help = modalEl.querySelector("#mc-method-help");
        const proofInput = form.querySelector("#mc-proof");
        const proofWrap = proofInput.closest(".field");
        function updateMethodHelp() {
          const isCash = methodSel.value === "Cash";
          if (isCash) {
            help.textContent = "Cash payments are made in person. Contact the treasurer to arrange payment.";
            proofInput.required = false;
            proofWrap.classList.add("hidden");
          } else {
            help.textContent = "Attach proof of transfer for online payments.";
            proofInput.required = true;
            proofWrap.classList.remove("hidden");
          }
        }
        methodSel.addEventListener("change", updateMethodHelp);
        updateMethodHelp();
        modalEl.querySelector("[data-cancel]").addEventListener("click", modal.close);
        form.addEventListener("submit", async function (event) {
          event.preventDefault();
          const box = form.querySelector("[data-form-error]");
          const text = form.querySelector("[data-form-error-text]");
          if (box) box.classList.add("hidden");
          const amount = U.toNumber(form.querySelector("#mc-amount").value);
          if (!amount || amount <= 0) {
            if (box && text) { text.textContent = "Enter a valid amount."; box.classList.remove("hidden"); }
            return;
          }
          const current2 = D.contributionRows(db, U.monthKey()).rows.find(function (r) { return r.member.id === member.id; });
          const expected2 = D.contributionExpected(member, db.settings);
          if (amount > expected2 + 0.005) {
            if (box && text) { text.textContent = "Amount exceeds the expected " + U.money(expected2) + " for this month."; box.classList.remove("hidden"); }
            return;
          }
          const method = methodSel.value;
          if (method !== "Cash") {
            const files = proofInput.files;
            if (!files || !files.length) {
              if (box && text) { text.textContent = "Please attach proof of payment."; box.classList.remove("hidden"); }
              return;
            }
          }
          UI.setBusy(form.querySelector("[type=submit]"), true, "Submitting…");
          try {
            const reader = new FileReader();
            reader.onload = async function () {
              try {
                await COOP.actions.requestContributionPayment({
                  memberId: member.id,
                  period: current2.period,
                  amount: amount,
                  method: method,
                  date: form.querySelector("#mc-date").value,
                  reference: form.querySelector("#mc-reference").value,
                  notes: form.querySelector("#mc-notes").value,
                  proofFile: reader.result,
                  proofFileName: method === "Cash" ? "" : (proofInput.files[0] ? proofInput.files[0].name : "")
                });
                modal.close();
                UI.toast("Contribution payment request submitted. The treasurer will review it.");
                if (COOP.app) COOP.app.refresh();
              } catch (err) {
                if (box && text) { text.textContent = err.message; box.classList.remove("hidden"); }
                UI.setBusy(form.querySelector("[type=submit]"), false);
              }
            };
            if (method !== "Cash" && proofInput.files[0]) {
              reader.readAsDataURL(proofInput.files[0]);
            } else {
              reader.onload();
            }
          } catch (err) {
            if (box && text) { text.textContent = err.message; box.classList.remove("hidden"); }
            UI.setBusy(form.querySelector("[type=submit]"), false);
          }
        });
      }
    });
    return modal;
  }

  function availLoan() {
    const member = store.currentMember();
    const modal = UI.modal({
      title: "Avail a loan",
      subtitle: "Submit a loan request. The treasurer will review and decide on the amount, rate, and release date.",
      size: "sm",
      body:
        '<div class="alert danger hidden" data-form-error role="alert">' + U.icon("alert-triangle", "icon-sm") + "<div data-form-error-text></div></div>" +
        '<form id="avail-loan-form" autocomplete="off">' +
        '<div class="form-grid" data-wiz-step-borrower>' +
          '<div class="field full"><label>Who will avail this loan?</label>' +
          '<div class="type-toggle">' +
            '<button type="button" class="btn type-option" data-borrower="member">' + U.icon("user", "icon-sm") + " Me</button>" +
            '<button type="button" class="btn type-option" data-borrower="non_member">' + U.icon("users", "icon-sm") + " Non-member</button>" +
          '</div></div>' +
        "</div>" +
        '<div class="form-grid" data-wiz-step-member hidden>' +
          '<div class="field full"><label for="al-amount">Amount to avail<span class="req">*</span></label><input class="input" id="al-amount" name="principal" type="number" min="0.01" step="0.01" required placeholder="0.00"><div class="help">The final amount may be adjusted by the treasurer before release.</div></div>' +
          '<div class="field full"><label for="al-purpose">Reason for the loan<span class="req">*</span></label><textarea class="textarea" id="al-purpose" name="purpose" rows="3" required placeholder="e.g. Working capital, tuition, emergency"></textarea></div>' +
          '<div class="field full"><label for="al-notes">Additional notes</label><textarea class="textarea" id="al-notes" name="notes" rows="2" placeholder="Optional"></textarea></div>' +
          '<div class="field full"><label for="al-method">Method of disbursement<span class="req">*</span></label><select class="select" id="al-method" data-disburse-method required><option value="cash">Cash</option><option value="gcash">GCash</option><option value="bank">Bank transfer</option></select><div class="help">More questions about your chosen method come next.</div></div>' +
        "</div>" +
        '<div class="form-grid" data-wiz-step-nonmember hidden>' +
          '<div class="field full"><label for="anm-name">Name of non-member borrower<span class="req">*</span></label><input class="input" id="anm-name" name="borrowerName" required maxlength="120" placeholder="Full legal name of the borrower"></div>' +
          '<div class="field full"><label for="anm-amount">Amount to avail<span class="req">*</span></label><input class="input" id="anm-amount" name="principal" type="number" min="0.01" step="0.01" required placeholder="0.00"><div class="help">The loan will be recorded under your care — you remain accountable for its repayment.</div></div>' +
          '<div class="field full"><label for="anm-purpose">Reason for the loan<span class="req">*</span></label><textarea class="textarea" id="anm-purpose" name="purpose" rows="3" required placeholder="e.g. Working capital, tuition, emergency"></textarea></div>' +
          '<div class="field full"><label for="anm-notes">Additional notes</label><textarea class="textarea" id="anm-notes" name="notes" rows="2" placeholder="Optional"></textarea></div>' +
          '<div class="field full"><label for="anm-method">Method of disbursement<span class="req">*</span></label><select class="select" id="anm-method" data-disburse-method required><option value="cash">Cash</option><option value="gcash">GCash</option><option value="bank">Bank transfer</option></select><div class="help">More questions about your chosen method come next.</div></div>' +
        "</div>" +
        '<div class="form-grid" data-wiz-detail hidden>' +
          '<div class="field full"><div class="note"><strong>Where should this loan be disbursed?</strong> These details are shared only with the treasurer.</div></div>' +
          '<div class="field full" data-disburse="cash"><label for="al-cash-note">Pickup notes</label><textarea class="textarea" id="al-cash-note" name="disburseNotes" rows="2" placeholder="Optional — when and where you plan to claim the cash"></textarea></div>' +
          '<div class="field full" data-disburse="gcash" hidden><label for="al-gcash">GCash mobile number<span class="req">*</span></label><input class="input" id="al-gcash" name="disburseMobile" inputmode="tel" maxlength="16" placeholder="e.g. 0917 123 4567"></div>' +
          '<div class="field" data-disburse="bank" hidden><label for="al-bank">Bank name<span class="req">*</span></label><input class="input" id="al-bank" name="disburseBank" placeholder="e.g. BDO, BPI, Landbank"></div>' +
          '<div class="field" data-disburse="bank" hidden><label for="al-acct">Account number<span class="req">*</span></label><input class="input" id="al-acct" name="disburseAccountNo" placeholder="Savings account number"></div>' +
          '<div class="field" data-disburse="bank" hidden><label for="al-holder">Account holder<span class="req">*</span></label><input class="input" id="al-holder" name="disburseAccountName" maxlength="120" placeholder="Name printed on the account"></div>' +
        "</div>" +
        "</form>",
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn" type="button" data-wiz-back hidden>Back</button>' +
        '<button class="btn primary" type="button" data-wiz-next hidden>' + U.icon("arrow-right", "icon-sm") + " Continue</button>" +
        '<button class="btn primary" type="submit" data-wiz-submit form="avail-loan-form" hidden>' + U.icon("hand-coins", "icon-sm") + " Submit request</button>",
      onMount: function (modalEl) {
        const form = modalEl.querySelector("#avail-loan-form");
        const submit = modalEl.querySelector("[data-wiz-submit]");
        const btnNext = modalEl.querySelector("[data-wiz-next]");
        const btnBack = modalEl.querySelector("[data-wiz-back]");
        const stepBorrower = form.querySelector("[data-wiz-step-borrower]");
        const stepMember = form.querySelector("[data-wiz-step-member]");
        const stepNonMember = form.querySelector("[data-wiz-step-nonmember]");
        const stepDetail = form.querySelector("[data-wiz-detail]");
        let borrowerType = null;
        let shownDetail = false;
        let shownStep = false;
        modalEl.querySelector("[data-cancel]").addEventListener("click", modal.close);
        form.querySelectorAll("[data-borrower]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            borrowerType = btn.getAttribute("data-borrower");
            stepBorrower.hidden = true;
            if (borrowerType === "member") {
              stepMember.hidden = false;
            } else {
              stepNonMember.hidden = false;
            }
            btnNext.hidden = false;
            shownStep = true;
          });
        });
        function branch(activeStep) {
          const methodSel = activeStep.querySelector("[data-disburse-method]");
          if (!methodSel) return "cash";
          const method = methodSel.value;
          stepDetail.querySelectorAll("[data-disburse]").forEach(function (field) {
            const on = field.getAttribute("data-disburse") === method;
            field.hidden = !on;
            field.querySelectorAll("input,textarea").forEach(function (input) {
              input.required = on;
            });
          });
          return method;
        }
        if (btnNext) {
          btnNext.addEventListener("click", function (event) {
            event.preventDefault();
            if (!shownStep) return;
            const activeStep = borrowerType === "member" ? stepMember : stepNonMember;
            for (const el of Array.from(activeStep.querySelectorAll("input[required],select[required],textarea[required]"))) {
              if (!el.checkValidity()) { el.reportValidity(); return; }
            }
            shownDetail = true;
            activeStep.hidden = true;
            stepDetail.hidden = false;
            branch(activeStep);
            btnNext.hidden = true;
            btnBack.hidden = false;
            if (btnSubmit) btnSubmit.hidden = false;
            const first = Array.from(stepDetail.querySelectorAll("input,textarea")).filter(function (el) {
              return !el.closest("[data-disburse]").hidden;
            })[0];
            if (first) first.focus();
            const methodSel = activeStep.querySelector("[data-disburse-method]");
            if (methodSel) {
              methodSel.addEventListener("change", function () {
                branch(activeStep);
              });
            }
          });
        }
        if (btnBack) {
          btnBack.addEventListener("click", function (event) {
            event.preventDefault();
            if (!shownDetail) return;
            shownDetail = false;
            stepDetail.hidden = true;
            if (borrowerType === "member") stepMember.hidden = false;
            else stepNonMember.hidden = false;
            btnNext.hidden = false;
            btnBack.hidden = true;
            if (btnSubmit) btnSubmit.hidden = true;
          });
        }
        form.addEventListener("submit", async function (event) {
          event.preventDefault();
          const box = form.querySelector("[data-form-error]");
          const text = form.querySelector("[data-form-error-text]");
          if (box) box.classList.add("hidden");
          UI.setBusy(submit, true, "Submitting…");
          try {
            const payload = UI.formData(form);
            payload.borrowerType = borrowerType;
            const methodSel = form.querySelector("[data-disburse-method]");
            payload.disburseMethod = methodSel ? methodSel.value : "cash";
            if (borrowerType === "non_member") {
              const borrowerName = String(form.querySelector("#anm-name").value || "").trim();
              if (!borrowerName) {
                if (box && text) { text.textContent = "Enter the full name of the non-member borrower."; box.classList.remove("hidden"); }
                UI.setBusy(submit, false);
                return;
              }
              const member = store.currentMember();
              if (member) {
                payload.careOfMemberId = member.id;
              }
            }
            await COOP.actions.requestLoan(payload);
            modal.close();
            UI.toast("Loan request submitted. The treasurer will review it.");
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

  function bindCommon(root, db, user) {
    root.querySelectorAll("[data-action=avail]").forEach(function (button) {
      button.addEventListener("click", availLoan);
    });
    root.querySelectorAll("[data-action=avail-nonmember]").forEach(function (button) {
      button.addEventListener("click", availLoan);
    });
    root.querySelectorAll("[data-portal-loan]").forEach(function (row) {
      row.addEventListener("click", function () {
        pages.loans.openDetail(row.getAttribute("data-portal-loan"), true);
      });
    });
    root.querySelectorAll("[data-view]").forEach(function (row) {
      row.addEventListener("click", function (event) {
        event.stopPropagation();
        pages.loans.openDetail(row.getAttribute("data-view"), true);
      });
    });
    root.querySelectorAll("[data-portal-receipt]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.stopPropagation();
        pages.payments.openReceipt(button.getAttribute("data-portal-receipt"), true);
      });
    });
  }

  function loanTableRows(loans) {
    if (!loans.length) {
      return '<tr><td colspan="6" class="empty-row">No loans recorded yet.</td></tr>';
    }
    return loans.map(function (item) {
      const loan = item.loan;
      const summary = item.summary;
      const balance = U.toNumber(summary.balance);
      const canPay = loan.status === "active" && balance > 0.005 && loan.borrowerType === "member";
      const payCell = canPay
        ? '<td class="actions"><button class="btn sm primary" type="button" data-pay-loan="' + U.esc(loan.id) + '">Pay</button></td>'
        : '<td></td>';
      return '<tr class="row-click" data-portal-loan="' + U.esc(loan.id) + '">' +
        '<td><span class="strong">' + U.esc(loan.loanNo) + '</span><div class="sub">' + U.formatDate(loan.startDate) + "</div></td>" +
        '<td class="num">' + U.money(loan.principal) + "</td>" +
        '<td class="num">' + U.money(summary.balance) + "</td>" +
        "<td>" + UI.statusBadge(item.summary.displayStatus) + "</td>" +
        "<td>" + (item.loan.borrowerType === "non_member" ? UI.badge("Care of", "purple") : UI.badge("My loan", "info")) + "</td>" +
        payCell +
        "</tr>";
    }).join("");
  }

  function requireMember() {
    const db = store.get();
    const user = store.currentUser();
    const member = store.currentMember();
    if (!member) {
      return { db: db, user: user, member: null, html: '<div class="page-head"><div><h1>Not linked</h1></div></div>' +
        '<div class="card"><div class="card-body">' + UI.empty({
          icon: "user",
          title: "No member record linked",
          message: "Your account is not yet linked to a member profile. Please ask an administrator to link your account.",
        }) + "</div></div>" };
    }
    return { db: db, user: user, member: member };
  }

  function makeLoans(db, member) {
    const loans = (db.loans || []).filter(function (loan) {
      return (loan.borrowerType === "member" && loan.memberId === member.id) ||
        (loan.borrowerType === "non_member" && loan.careOfMemberId === member.id);
    }).map(function (loan) {
      return { loan: loan, summary: D.loanLedger(loan, db.payments, U.today()) };
    }).sort(function (a, b) { return String(b.loan.startDate).localeCompare(String(a.loan.startDate)); });
    return loans;
  }

  pages.myloans = {
    render: function (root) {
      const ctx = requireMember();
      if (!ctx.member) {
        root.innerHTML = ctx.html;
        return;
      }
      const db = ctx.db;
      const user = ctx.user;
      const loans = makeLoans(db, ctx.member);
      const active = loans.filter(function (x) { return ["active", "pending"].includes(x.summary.displayStatus) && x.loan.borrowerType === "member"; });
      const outstanding = U.sum(active.map(function (x) { return x.summary.balance; }));
      const interestPaid = U.sum(loans.filter(function (x) { return x.loan.borrowerType === "member"; }).map(function (x) { return x.summary.totalInterestPaid; }));
      const settled = loans.filter(function (x) { return x.summary.paid; }).length;
      const reqStats = requestStats(db, user);
      const loanIds = loans.map(function (x) { return x.loan.id; });
      const payments = (db.payments || []).filter(function (p) {
        return !p.voided && loanIds.indexOf(p.loanId) >= 0;
      }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 10);
      const linkedLoans = {};
      loans.forEach(function (x) { linkedLoans[x.loan.id] = x.loan; });

      const paymentRows = payments.length ? payments.map(function (payment) {
        const loan = linkedLoans[payment.loanId];
        return '<tr><td><span class="strong">' + U.esc(payment.receiptNo) + '</span><div class="sub">' + U.esc(loan ? loan.loanNo : "") + "</div></td>" +
          "<td>" + U.formatDate(payment.date) + "</td>" +
          '<td class="num">' + U.money(payment.amount) + "</td>" +
          '<td class="num">' + U.money(payment.interestPortion) + "</td>" +
          '<td class="actions"><button class="btn sm ghost" type="button" data-portal-receipt="' + U.esc(payment.id) + '">Receipt</button></td></tr>';
      }).join("") : '<tr><td colspan="5" class="empty-row">No payments recorded.</td></tr>';

      root.innerHTML =
        '<div class="page-head"><div><span class="eyebrow">' + U.icon("hand-coins", "icon-sm") + " My lending</span>" +
          "<h1>My Loans</h1><div class=\"sub\">Loans in your name, your requests, and your repayments.</div></div>" +
          '<div class="page-actions"><button class="btn primary" data-action="avail">' + U.icon("hand-coins", "icon-sm") + " Avail a loan</button></div></div></div>" +
        '<div class="stat-grid">' +
          stat("hand-coins", "Loan balance", U.money(outstanding), active.length + " open " + U.plural(active.length, "loan"), outstanding ? "tone-info" : "tone-success") +
          stat("coins", "Interest paid", U.money(interestPaid), "Across your loans") +
          stat("check-circle", "Loans settled", U.number(settled, 0), U.plural(loans.length, "loan") + " on record") +
          stat("clock", "Open requests", U.number(reqStats.pending, 0), reqStats.approved + " approved · " + reqStats.rejected + " declined", reqStats.pending ? "tone-warning" : "") +
        "</div>" +
        '<div class="detail-grid">' +
          '<div class="stack">' +
            '<div class="card"><div class="card-head"><div><h2>My loans</h2><div class="sub">Loans and repayment progress</div></div></div>' +
              '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Loan</th><th class="num">Principal</th><th class="num">Balance</th><th>Status</th><th>Type</th></tr></thead><tbody>' +
              loanTableRows(loans) + "</tbody></table></div></div></div>" +
            '<div class="card"><div class="card-head"><div><h2>My loan requests</h2><div class="sub">Requests submitted for treasurer review</div></div></div>' +
              '<div class="card-body flush"><div class="table-wrap table-scroll-sm"><table class="data"><thead><tr><th class="num">Amount</th><th>Reason</th><th>Requested on</th><th>Status</th></tr></thead><tbody>' +
              requestRows(db, user) + "</tbody></table></div></div></div>" +
          "</div>" +
          '<div class="stack">' +
            '<div class="card"><div class="card-head"><div><h2>Recent payments</h2><div class="sub">Your last payments across loans</div></div></div>' +
              '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Receipt</th><th>Date</th><th class="num">Amount</th><th class="num">Interest</th><th></th></tr></thead><tbody>' +
              paymentRows + "</tbody></table></div></div></div>" +
            '<div class="card"><div class="card-head"><div><h2>Settlement reminder</h2><div class="sub">Annual deadline</div></div></div><div class="card-body">' +
              (outstanding > 0.005 ? '<div class="big-amount">Before December</div><div class="note mt-1">Loans have no fixed monthly term. Pay anytime, but settle the full outstanding balance before December each year.</div>' :
                '<div class="note">No active loan balance. You are fully settled.</div>') +
            "</div></div>" +
          "</div>" +
        "</div>";

      root.querySelectorAll("[data-pay-loan]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          openMemberPayment(button.getAttribute("data-pay-loan"));
        });
      });

      bindCommon(root, db, user);
    }
  };

  pages.myloans.openMemberPayment = openMemberPayment;

  pages.mycontrib = {
    render: function (root) {
      const ctx = requireMember();
      if (!ctx.member) {
        root.innerHTML = ctx.html;
        return;
      }
      const db = ctx.db;
      const member = ctx.member;
      const current = D.contributionRows(db, U.monthKey()).rows.find(function (r) { return r.member.id === member.id; });
      const contributions = (db.contributions || []).filter(function (c) {
        return c.memberId === member.id && !c.voided;
      }).sort(function (a, b) { return String(b.period).localeCompare(String(a.period)); });
      const totalPaid = U.sum(contributions.map(function (c) {
        return Math.min(c.amount, D.contributionExpectedFor(member, db.settings, c));
      }));
      const paidMonths = contributions.filter(function (c) {
        return D.contributionStatus(c, D.contributionExpectedFor(member, db.settings, c)) === "paid";
      }).length;

      const contributionRows = contributions.length ? contributions.map(function (c) {
        const expected = D.contributionExpectedFor(member, db.settings, c);
        const isCurrent = current && c.period === current.period;
        return "<tr class='" + (isCurrent ? "current-month" : "") + "'><td>" + U.esc(U.formatMonth(c.period)) + '</td><td class="num">' + U.money(expected) + '</td><td class="num">' + U.money(c.amount) + "</td>" +
          "<td>" + U.formatDate(c.datePaid) + "</td><td>" + UI.statusBadge(D.contributionStatus(c, expected)) + "</td></tr>";
      }).join("") : '<tr><td colspan="5" class="empty-row">No contributions recorded yet.</td></tr>';

      root.innerHTML =
        '<div class="page-head"><div><span class="eyebrow">' + U.icon("wallet", "icon-sm") + " My savings</span>" +
          "<h1>My Contributions</h1><div class=\"sub\">Monthly contributions and shares pooled under your name.</div></div></div>" +
        '<div class="stat-grid">' +
          stat("wallet", "Total contributions", U.money(totalPaid), paidMonths + " of " + U.plural(contributions.length, "month") + " settled", "tone-success") +
          stat("layers", "Shares availed", U.number(D.memberMetrics(db, member).shares, 2), U.percent(D.memberMetrics(db, member).sharePercent, 2) + " of total shares") +
          stat("calendar", "Monthly target", U.money(D.contributionExpected(member, db.settings)), "Per share contri") +
          stat(current && current.status === "paid" ? "check-circle" : "clock", "This month", current ? (current.status === "paid" ? "Settled" : U.money(current.balance)) : "No record", current ? U.formatMonth(current.period) : "No " + U.formatMonth(U.monthKey()) + " record yet", current && current.status === "paid" ? "tone-success" : "tone-warning") +
        "</div>" +
        (current && current.status !== "paid"
          ? '<div class="page-actions"><button class="btn primary" data-action="pay-contribution">' + U.icon("credit-card", "icon-sm") + " Pay " + U.formatMonth(current.period) + " contribution</button></div>"
          : "") +
        '<div class="detail-grid">' +
          '<div class="stack">' +
            '<div class="card"><div class="card-head"><div><h2>Contribution history</h2><div class="sub">All posted months on record</div></div></div>' +
              '<div class="card-body flush"><div class="table-wrap table-scroll-sm"><table class="data"><thead><tr><th>Month</th><th class="num">Expected</th><th class="num">Amount</th><th>Paid on</th><th>Status</th></tr></thead><tbody>' +
              contributionRows + "</tbody></table></div></div></div>" +
          "</div>" +
        "</div>";

      root.querySelectorAll("[data-action=pay-contribution]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          openMemberContributionPayment();
        });
      });
    }
  };

  pages.mycare = {
    render: function (root) {
      const ctx = requireMember();
      if (!ctx.member) {
        root.innerHTML = ctx.html;
        return;
      }
      const db = ctx.db;
      const careLoans = makeLoans(db, ctx.member).filter(function (x) { return x.loan.borrowerType === "non_member"; });
      const open = careLoans.filter(function (x) { return !x.summary.paid; });
      const outstanding = U.sum(open.map(function (x) { return x.summary.balance; }));
      const withCare = U.sum(careLoans.map(function (x) { return x.summary.totalInterestAccrued; }));

      const rows = careLoans.length ? careLoans.map(function (x) {
        const careOf = x.loan.careOfMemberId ? db.members.find(function (m) { return m.id === x.loan.careOfMemberId; }) : null;
        return '<tr class="row-click" data-portal-loan="' + U.esc(x.loan.id) + '">' +
          '<td><span class="strong">' + U.esc(x.loan.loanNo) + '</span><div class="sub">' + U.formatDate(x.loan.startDate) + "</div></td>" +
          '<td><div class="cell-person">' + UI.avatar(x.loan.borrowerName) +
            '<div class="meta"><div class="name">' + U.esc(x.loan.borrowerName) +
            '</div><div class="sub">' + (careOf ? "Care of " + U.esc(D.memberName(careOf)) : "Non-member") + "</div></div></div></td>" +
          '<td class="num">' + U.money(x.loan.principal) + "</td>" +
          '<td class="num">' + U.money(x.summary.balance) + "</td>" +
          "<td>" + UI.statusBadge(x.summary.displayStatus) + "</td></tr>";
      }).join("") : '<tr><td colspan="5" class="empty-row">No non-member borrowings under your care.</td></tr>';

      root.innerHTML =
        '<div class="page-head"><div><span class="eyebrow">' + U.icon("users", "icon-sm") + " On your care</span>" +
          "<h1>Non-member Loans</h1><div class=\"sub\">Loans of non-member borrowers you stand accountable for.</div></div>" +
          '<div class="page-actions"><button class="btn primary" data-action="avail-nonmember">' + U.icon("hand-coins", "icon-sm") + " Avail a loan</button></div></div>" +
        '<div class="stat-grid">' +
          stat("hand-coins", "Outstanding balance", U.money(outstanding), open.length + " open " + U.plural(open.length, "loan"), outstanding ? "tone-warning" : "tone-success") +
          stat("users", "Borrowers under care", U.number(new Set(careLoans.map(function (x) { return x.loan.borrowerName; })).size, 0), U.plural(careLoans.length, "loan") + " on record") +
          stat("coins", "Interest earned (total)", U.money(withCare), "Across all loans under your care") +
          stat("credit-card", "Repayment status", open.length ? "Needs attention" : "All settled", open.length ? U.plural(open.length, "balance") + " outstanding" : "No balances remaining", open.length ? "tone-danger" : "tone-success") +
        "</div>" +
        '<div class="card"><div class="card-head"><div><h2>Loans under your care</h2><div class="sub">You are accountable for these non-member loans</div></div></div>' +
          '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Loan</th><th>Borrower</th><th class="num">Principal</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>' +
          rows + "</tbody></table></div></div></div>" +
        '<div class="alert info mt-3">' + U.icon("info", "icon-sm") + "<div>Repayments are recorded by the treasurer on the Loans page. Contact them with any questions about these loans.</div></div>";

      bindCommon(root, db, ctx.user);
    }
  };
})();
