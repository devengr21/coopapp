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

  function changePassword() {
    const modal = UI.modal({
      title: "Change password",
      subtitle: "Update the password for your member portal account.",
      size: "sm",
      body:
        '<div class="alert danger hidden" data-form-error role="alert">' + U.icon("alert-triangle", "icon-sm") + "<div data-form-error-text></div></div>" +
        '<form id="portal-password-form"><div class="form-grid">' +
          '<div class="field full"><label for="pp-current">Current password</label><input class="input" id="pp-current" name="current" type="password" required autocomplete="current-password"></div>' +
          '<div class="field"><label for="pp-new">New password</label><input class="input" id="pp-new" name="password" type="password" minlength="6" required autocomplete="new-password"></div>' +
          '<div class="field"><label for="pp-confirm">Confirm new password</label><input class="input" id="pp-confirm" name="confirm" type="password" minlength="6" required autocomplete="new-password"></div>' +
        "</div></form>",
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn primary" type="submit" form="portal-password-form">' + U.icon("key", "icon-sm") + " Update password</button>",
      onMount: function (modalEl) {
        const form = modalEl.querySelector("#portal-password-form");
        const submit = modalEl.querySelector("[form=portal-password-form]");
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
          UI.setBusy(submit, true, "Updating…");
          try {
            await COOP.actions.changeOwnPassword(data.current, data.password);
            modal.close();
            UI.toast("Password updated.");
          } catch (err) {
            if (box && text) { text.textContent = err.message; box.classList.remove("hidden"); }
            UI.setBusy(submit, false);
          }
        });
      }
    });
    return modal;
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

  function bindPortalCommon(root, db, user) {
    const passwordButton = root.querySelector("[data-action=password]");
    if (passwordButton) passwordButton.addEventListener("click", changePassword);
    root.querySelectorAll("[data-action=avail]").forEach(function (button) {
      button.addEventListener("click", availLoan);
    });
    root.querySelectorAll("[data-portal-loan]").forEach(function (row) {
      row.addEventListener("click", function () {
        pages.loans.openDetail(row.getAttribute("data-portal-loan"), true);
      });
    });
    root.querySelectorAll("[data-portal-receipt]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.stopPropagation();
        pages.payments.openReceipt(button.getAttribute("data-portal-receipt"), true);
      });
    });
    root.querySelectorAll("[data-action=pay-loan]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.stopPropagation();
        const db = store.get();
        const member = store.currentMember();
        const loans = (db.loans || []).filter(function (loan) {
          return loan.borrowerType === "member" && loan.memberId === member.id && loan.status === "active";
        }).map(function (loan) {
          return { loan: loan, summary: D.loanLedger(loan, db.payments, U.today()) };
        }).filter(function (x) { return x.summary.balance > 0.005; });
        if (!loans.length) {
          UI.toast("No active loan with outstanding balance.", "warning");
          return;
        }
        pages.myloans.openMemberPayment(loans[0].loan.id);
      });
    });
  }

  pages.portal = {
    render: function (root) {
      const db = store.get();
      const user = store.currentUser();
      const member = store.currentMember();
      if (!member) {
        root.innerHTML = '<div class="page-head"><div><h1>My COOP</h1></div></div>' +
          '<div class="card mb-3"><div class="card-body"><div class="detail-grid"><div class="card stack">' +
            '<div class="card-head"><div><h2>Avail a loan</h2><div class="sub">Request a loan and the treasurer will review it.</div></div></div>' +
            '<div class="card-body"><button class="btn primary" data-action="avail">' + U.icon("hand-coins", "icon-sm") + " Avail a loan</button>" +
            '<div class="note mt-2">Your account is not linked to a member record, so you can only view contributions or loans once an administrator links it. You may still request a loan as a non-member borrower.</div></div></div></div></div></div>' +
          '<div class="card"><div class="card-head"><div><h2>My loan requests</h2><div class="sub">Requests you have submitted for review</div></div></div>' +
            '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th class="num">Amount</th><th>Reason</th><th>Requested on</th><th>Status</th></tr></thead><tbody>' +
            (function () {
              const requests = (db.loanRequests || []).filter(function (r) { return r.requestedById === user.id; })
                .sort(function (a, b) { return String(b.requestedAt).localeCompare(String(a.requestedAt)); });
              return requests.length ? requests.map(function (r) {
                return '<tr><td class="num strong">' + U.money(r.principal) + "</td><td>" + U.esc(r.purpose || "-") + "</td>" +
                  "<td>" + U.formatDate(r.requestedAt) + "</td><td>" +
                  (r.status === "approved" ? UI.badge("Approved", "success") : UI.statusBadge(r.status)) + "</td></tr>";
              }).join("") : '<tr><td colspan="4" class="empty-row">You have not availed any loan yet.</td></tr>';
            })() + "</tbody></table></div></div></div>";
        bindPortalCommon(root, db, user);
        return;
      }
      const metrics = D.memberMetrics(db, member);
      const current = D.contributionRows(db, U.monthKey()).rows.find(function (r) { return r.member.id === member.id; });
      const loans = (db.loans || []).filter(function (loan) {
        return (loan.borrowerType === "member" && loan.memberId === member.id) ||
          (loan.borrowerType === "non_member" && loan.careOfMemberId === member.id);
      }).map(function (loan) {
        return { loan: loan, summary: D.loanLedger(loan, db.payments, U.today()) };
      }).sort(function (a, b) { return String(b.loan.startDate).localeCompare(String(a.loan.startDate)); });
      const loanIds = loans.map(function (x) { return x.loan.id; });
      const payments = (db.payments || []).filter(function (p) {
        return !p.voided && loanIds.indexOf(p.loanId) >= 0;
      }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 12);
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
        '<div class="page-head"><div><span class="eyebrow">' + U.icon("home", "icon-sm") + " Member dashboard</span>" +
          "<h1>My COOP</h1><div class='sub'>Your snapshot in " + U.esc(db.settings.orgName) + ". Manage your loans, contributions, and profile below.</div></div>" +
          '<div class="page-actions"><button class="btn primary" data-action="avail">' + U.icon("hand-coins", "icon-sm") + " Avail a loan</button></div></div>" +
        '<div class="member-hero mb-3">' + UI.avatar(D.memberName(member), "lg") +
          '<div class="meta"><h2>' + U.esc(D.memberName(member)) + "</h2>" +
            '<div class="sub">Member since ' + U.formatDate(member.joinDate) + "</div>" +
            '<div class="pill-list mt-2">' + UI.statusBadge(member.status || "active") +
              UI.badge("@" + (user ? user.username : ""), "outline") + "</div></div>" +
          '<div class="hero-stat"><div class="label">Share of cooperative</div><div class="value">' + U.percent(metrics.sharePercent, 2) + "</div>" +
            '<div class="sub">' + U.number(metrics.shares, 2) + " shares</div></div>" +
        "</div>" +
        '<div class="stat-grid">' +
          stat("wallet", "Total contributions", U.money(metrics.contributions), metrics.contributionCount + " posted contributions", "tone-success") +
          stat("layers", "Shares availed", U.number(metrics.shares, 2), U.percent(metrics.sharePercent, 2) + " of total shares") +
          stat("hand-coins", "Loan balance", U.money(metrics.outstanding), metrics.activeLoans + " active " + U.plural(metrics.activeLoans, "loan"), metrics.outstanding ? "tone-info" : "") +
          stat("calendar", "Monthly contribution", U.money(metrics.expectedMonthly), current ? "This month: " + (current.status === "paid" ? "Paid" : U.money(current.balance) + " remaining") : "No record yet") +
        "</div>" +
        '<div class="grid-3 mb-3">' +
          '<a class="quick-link" href="#/my-loans">' + U.icon("hand-coins") + "<div><div class=\"name\">My loans</div><div class=\"sub\">Balances, requests, and repayments</div></div>" + U.icon("chevron-right") + "</a>" +
          '<a class="quick-link" href="#/my-contributions">' + U.icon("wallet") + "<div><div class=\"name\">Contributions</div><div class=\"sub\">Monthly records and shares</div></div>" + U.icon("chevron-right") + "</a>" +
          '<a class="quick-link" href="#/care-loans">' + U.icon("users") + "<div><div class=\"name\">Non-member loans</div><div class=\"sub\">Borrowers under your care</div></div>" + U.icon("chevron-right") + "</a>" +
        "</div>" +
        '<div class="detail-grid">' +
          '<div class="stack">' +
            '<div class="card"><div class="card-head"><div><h2>' + U.esc(U.formatMonth(current ? current.period : U.monthKey())) + " contribution</h2>" +
              '<div class="sub">Monthly contribution status</div></div>' + (current ? UI.statusBadge(current.status) : UI.statusBadge("unpaid")) + "</div>" +
              '<div class="card-body">' +
                (current ? '<div class="grid-3">' +
                  '<div class="summary-box"><div class="label">Expected</div><div class="value">' + U.money(current.expected) + "</div></div>" +
                  '<div class="summary-box"><div class="label">Paid</div><div class="value">' + U.money(current.paid) + "</div></div>" +
                  '<div class="summary-box"><div class="label">Balance</div><div class="value">' + U.money(current.balance) + "</div></div>" +
                "</div>" : '<div class="note">No contribution record for this month yet.</div>') +
                '<div class="progress-row mt-3"><div class="progress-label"><span>Contribution progress</span><span>' +
                  (current && current.expected ? U.percent(current.paid / current.expected, 0) : "0%") + "</span></div>" +
                  '<div class="progress ' + (current && current.status === "paid" ? "success" : "warning") + '"><span style="width:' +
                  Math.round((current && current.expected ? Math.min(1, current.paid / current.expected) : 0) * 100) + '%"></span></div></div>' +
              "</div></div>" +
            '<div class="card"><div class="card-head"><div><h2>Recent activity</h2><div class="sub">Your latest loan movements</div></div></div>' +
              '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Receipt</th><th>Date</th><th class="num">Amount</th><th class="num">Interest</th><th></th></tr></thead><tbody>' +
              paymentRows + "</tbody></table></div></div></div>" +
          "</div>" +
          '<div class="stack">' +
            '<div class="card"><div class="card-head"><div><h2>My profile</h2><div class="sub">Contact information on record</div></div></div><div class="card-body">' +
              '<div class="info-list">' +
                '<div class="info-item"><div class="label">Contact number</div><div class="value ' + (member.contact ? "" : "muted") + '">' + U.esc(member.contact || "Not provided") + "</div></div>" +
                '<div class="info-item"><div class="label">Email</div><div class="value ' + (member.email ? "" : "muted") + '">' + U.esc(member.email || "Not provided") + "</div></div>" +
                '<div class="info-item"><div class="label">Address</div><div class="value ' + (member.address ? "" : "muted") + '">' + U.esc(member.address || "Not provided") + "</div></div>" +
                '<div class="info-item"><div class="label">Account</div><div class="value">@' + U.esc(user ? user.username : "") + "</div></div>" +
              "</div>" +
              '<div class="note mt-3">Update your info or password from the account menu in the top bar.</div>' +
            "</div></div>" +
            '<div class="card"><div class="card-head"><div><h2>Annual settlement</h2><div class="sub">Loan payment reminder</div></div></div><div class="card-body">' +
              (metrics.outstanding > 0.005 ? '<div class="big-amount">Before December</div><div class="note mt-1">Loans have no fixed monthly term. Pay anytime, but settle the full outstanding balance before December each year.</div>' +
                '<button class="btn primary mt-3" type="button" data-action="pay-loan">' + U.icon("credit-card", "icon-sm") + " Pay outstanding loan</button>" :
                '<div class="note">No active loan balance.</div>') +
            "</div></div>" +
          "</div>" +
        "</div>";

      bindPortalCommon(root, db, user);
    }
  };
})();
