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
    if (COOP.app) COOP.app.refresh();
  }

  function section(id, title, subtitle, body) {
    return '<section class="card settings-section" id="' + id + '"><div class="card-head"><div><h2>' + U.esc(title) + '</h2>' +
      (subtitle ? '<div class="sub">' + U.esc(subtitle) + "</div>" : "") + "</div></div>" +
      '<div class="card-body">' + body + "</div></section>";
  }

  function importBackup(fileInput) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (file.size > COOP.store.MAX_BACKUP_BYTES) {
      UI.toast("The backup file is too large.", "danger");
      fileInput.value = "";
      return;
    }
    U.readFileAsText(file).then(function (text) {
      let preview = null;
      try { preview = JSON.parse(text); } catch (e) { throw new Error("The selected file is not valid JSON."); }
      const data = preview && preview.data ? preview.data : preview;
      const counts = data && Array.isArray(data.members) ? (data.members.length + " members, " + (data.loans || []).length + " loans, " + (data.payments || []).length + " payments") : "an unknown dataset";
      return UI.confirm({
        title: "Import backup?",
        message: "This will replace all current records with the backup containing " + counts + ". Export a backup of the current data first if you need to keep it.",
        confirmLabel: "Import and replace",
        tone: "danger"
      }).then(function (ok) {
        if (!ok) return;
        COOP.actions.importBackup(text);
        UI.toast("Backup imported.");
        refresh();
      });
    }).catch(function (err) {
      UI.toast(err.message, "danger");
    }).then(function () {
      fileInput.value = "";
    });
  }

  function resetData() {
    const modal = UI.modal({
      title: "Reset all data",
      subtitle: "This removes every member, contribution, loan, payment, user, and setting.",
      size: "sm",
      body:
        '<div class="alert danger">' + U.icon("alert-triangle", "icon-sm") +
          "<div><strong>This cannot be undone.</strong> Export a backup before continuing. You will return to first-time setup.</div></div>" +
          '<div class="field mt-3"><label for="reset-confirm">Type <strong>RESET</strong> to confirm</label>' +
            '<input class="input" id="reset-confirm" autocomplete="off" placeholder="RESET"></div>' +
          '<div class="field mt-3"><label for="reset-password">Current password<span class="req">*</span></label>' +
            '<input class="input" id="reset-password" name="password" type="password" required autocomplete="current-password" placeholder="Enter your current password"></div>',
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn danger" type="button" data-reset disabled>Reset everything</button>',
      onMount: function (modalEl) {
        const input = modalEl.querySelector("#reset-confirm");
        const button = modalEl.querySelector("[data-reset]");
        modalEl.querySelector("[data-cancel]").addEventListener("click", modal.close);
        input.addEventListener("input", function () {
          button.disabled = input.value.trim().toUpperCase() !== "RESET";
        });
        button.addEventListener("click", async function () {
          const passwordInput = modalEl.querySelector("#reset-password");
          const password = passwordInput ? passwordInput.value : "";
          const user = store.currentUser();
          if (user && user.passwordHash && user.salt) {
            const valid = await U.verifyPassword(password, user.salt, user.passwordHash);
            if (!valid) {
              if (passwordInput) passwordInput.focus();
              return;
            }
          } else if (!password) {
            if (passwordInput) passwordInput.focus();
            return;
          }
          try {
            COOP.actions.resetSystem();
            modal.close();
            UI.toast("All data has been reset.");
            if (COOP.app) COOP.app.refresh();
          } catch (err) {
            UI.toast(err.message, "danger");
          }
        });
      }
    });
  }

  pages.settings = {
    render: function (root) {
      const db = store.get();
      const s = db.settings;
      const canManage = store.can("settings.manage");
      const theme = document.documentElement.getAttribute("data-theme") || s.theme || "light";
      const counts = {
        members: (db.members || []).length,
        contributions: (db.contributions || []).filter(function (c) { return !c.voided; }).length,
        loans: (db.loans || []).length,
        payments: (db.payments || []).filter(function (p) { return !p.voided; }).length,
        users: (db.users || []).length
      };
      const disabled = canManage ? "" : " disabled";

      root.innerHTML =
        '<div class="page-head"><div><span class="eyebrow">' + U.icon("settings", "icon-sm") + " Configuration</span>" +
          "<h1>Settings</h1><div class=\"sub\">Organization details, contribution rules, loan settings, and backups.</div></div>" +
          (canManage ? '<div class="page-actions"><button class="btn primary" type="submit" form="settings-form">' + U.icon("save", "icon-sm") + " Save settings</button></div>" : "") +
        "</div>" +
        (!canManage ? '<div class="alert info mb-3">' + U.icon("shield", "icon-sm") + "<div>You have view-only access to settings. Only an administrator can make changes.</div></div>" : "") +
        '<div class="settings-grid">' +
          '<nav class="settings-nav"><button type="button" data-scroll="settings-org">Organization</button><button type="button" data-scroll="settings-contributions">Contributions</button>' +
            '<button type="button" data-scroll="settings-loans">Loans</button><button type="button" data-scroll="settings-appearance">Appearance</button>' +
            (canManage ? '<button type="button" data-scroll="settings-data">Backup & data</button>' : "") + '<button type="button" data-scroll="settings-security">Account security</button></nav>' +
          '<div>' +
            '<div class="alert danger hidden mb-3" data-settings-error role="alert">' + U.icon("alert-triangle", "icon-sm") + "<div data-settings-error-text></div></div>" +
            '<form id="settings-form">' +
              section("settings-org", "Organization", "Shown on receipts, reports, and in the app header.",
                '<div class="form-grid">' +
                  '<div class="field full"><label for="s-org">Cooperative name<span class="req">*</span></label><input class="input" id="s-org" name="orgName" value="' + U.esc(s.orgName) + '" required maxlength="80"' + disabled + "></div>" +
                  '<div class="field full"><label for="s-address">Address</label><input class="input" id="s-address" name="orgAddress" value="' + U.esc(s.orgAddress) + '" maxlength="160"' + disabled + "></div>" +
                  '<div class="field"><label for="s-contact">Contact</label><input class="input" id="s-contact" name="orgContact" value="' + U.esc(s.orgContact) + '" maxlength="80"' + disabled + "></div>" +
                  '<details class="form-advanced"><summary>Regional settings</summary>' +
                    '<div class="form-grid">' +
                      '<div class="field"><label for="s-fiscal">Fiscal year</label><input class="input" id="s-fiscal" name="fiscalYear" type="number" min="2000" max="2200" step="1" value="' + U.esc(s.fiscalYear) + '"' + disabled + "></div>" +
                      '<div class="field"><label for="s-currency">Currency code</label><input class="input" id="s-currency" name="currency" value="' + U.esc(s.currency) + '" maxlength="3"' + disabled + "></div>" +
                      '<div class="field"><label for="s-locale">Locale</label><input class="input" id="s-locale" name="locale" value="' + U.esc(s.locale) + '" maxlength="12"' + disabled + "></div>" +
                    "</div>" +
                  "</details>" +
                "</div>") +
              section("settings-contributions", "Contributions", "Monthly dues, due dates, and the fixed late penalty. The penalty is configurable and not posted automatically.",
                '<div class="form-grid">' +
                  '<div class="field"><label for="s-monthly">Standard monthly contribution</label><div class="inline"><input class="input" id="s-monthly" name="monthlyContribution" type="number" min="0" step="0.01" value="' + U.esc(s.monthlyContribution) + '"' + disabled + '><span class="muted">' + U.esc(s.currency) + "</span></div></div>" +
                  '<div class="field"><label for="s-penalty">Fixed late penalty</label><input class="input" id="s-penalty" name="latePenalty" type="number" min="0" step="0.01" value="' + U.esc(s.latePenalty) + '"' + disabled + "></div>" +
                  '<div class="field"><label for="s-grace">Grace days after due date</label><input class="input" id="s-grace" name="latePenaltyGraceDays" type="number" min="0" step="1" value="' + U.esc(s.latePenaltyGraceDays) + '"' + disabled + "></div>" +
                "</div>" +
                '<div class="alert info mt-3">' + U.icon("info", "icon-sm") + "<div>Members can have a custom monthly amount on their profile. The late penalty is shown on the collection sheet as a suggested amount.</div></div>") +
              section("settings-loans", "Loans", "Daily interest, annual settlement reminders, and over-limit controls.",
                '<div class="form-grid">' +
                  '<div class="field"><label for="s-rate">Default monthly interest rate</label><div class="inline"><input class="input" id="s-rate" name="interestRate" type="number" min="0" max="100" step="0.01" value="' + U.esc(s.interestRate) + '"' + disabled + '><span class="muted">%</span></div>' +
                    '<div class="help">Interest is added each day between payments, based on a 30-day month. The first payment includes at least 30 days.</div></div>' +
                  '<div class="field"><label for="s-maxloan">Per-loan ceiling</label><input class="input" id="s-maxloan" name="maxLoanAmount" type="number" min="0" step="0.01" value="' + U.esc(s.maxLoanAmount) + '"' + disabled + '>' +
                    '<div class="help">0 means no fixed ceiling; available cash still limits loans.</div></div>' +
                  '<div class="field full"><div class="alert info">' + U.icon("info", "icon-sm") + "<div>Loans have no fixed term or monthly due date. Borrowers may pay anytime, but the full outstanding balance should be settled before December each year.</div></div></div>" +
                  '<div class="field"><label for="s-basis">Profit-sharing basis</label><select class="select" id="s-basis" name="profitShareBasis"' + disabled + ">" +
                    '<option value="shares"' + (s.profitShareBasis === "shares" ? " selected" : "") + ">Shares availed</option>" +
                    '<option value="contributions"' + (s.profitShareBasis === "contributions" ? " selected" : "") + ">Contributions paid</option></select></div>" +
                  '<div class="field"><label for="s-opening">Opening cash</label><input class="input" id="s-opening" name="openingCash" type="number" step="0.01" value="' + U.esc(s.openingCash) + '"' + disabled + '>' +
                    '<div class="help">Starting cash before any recorded transaction.</div></div>' +
                  '<div class="field full"><label class="check" style="padding:0"><input type="checkbox" id="s-approval" name="requireOverLimitApproval"' + (s.requireOverLimitApproval ? " checked" : "") + disabled + '>' +
                    '<span><span class="check-text">Require approval for over-limit loans</span><span class="help">Requests above available funds or the per-loan ceiling wait for an administrator or treasurer decision.</span></span></label></div>' +
                "</div>") +
            "</form>" +
            section("settings-appearance", "Appearance", "Choose how the workspace looks on this device.",
              '<div class="switch"><div class="switch-copy"><div class="switch-title">Dark mode</div><div class="switch-desc">Use a darker palette for low-light environments.</div></div>' +
                '<div class="toggle"><input type="checkbox" id="theme-toggle"' + (theme === "dark" ? " checked" : "") + '><span class="track"></span><span class="thumb"></span></div></div>') +
            (canManage ? section("settings-data", "Backup & data", "Everything is stored locally in this browser. Export backups regularly.",
              '<div class="grid-2">' +
                '<div class="summary-box"><div class="label">Storage mode</div><div class="value" style="font-size:.95rem">' + (store.storageMode() === "memory" ? "Memory only" : "Firebase (Firestore)") + '</div>' +
                  '<div class="sub">' + (store.storageMode() === "memory" ? "Data will not survive a refresh." : "Data stays on this device.") + "</div></div>" +
                '<div class="summary-box"><div class="label">Records</div><div class="value" style="font-size:.95rem">' + (counts.members + counts.contributions + counts.loans + counts.payments) + '</div>' +
                  '<div class="sub">' + counts.members + " members · " + counts.loans + " loans · " + counts.payments + " payments</div></div>" +
              "</div>" +
              '<div class="toolbar mt-3">' +
                '<button class="btn" type="button" data-export>' + U.icon("download", "icon-sm") + " Export backup</button>" +
                '<label class="btn" style="cursor:pointer">' + U.icon("upload", "icon-sm") + " Import backup" +
                  '<input type="file" id="backup-file" accept=".json,application/json" style="display:none"></label>' +
              "</div>" +
              '<div class="divider"></div>' +
              '<div class="danger-zone card"><div class="card-head"><div><h2>Danger zone</h2><div class="sub">Irreversible data actions</div></div></div>' +
                '<div class="card-body"><div class="split"><div><div class="strong" style="font-size:.84rem">Reset all data</div><div class="note mt-1">Erase the workspace and return to first-time setup.</div></div>' +
                '<button class="btn danger" type="button" data-reset-data>' + U.icon("trash", "icon-sm") + " Reset everything</button></div></div></div>") : "") +
            section("settings-security", "Account security", "Change the password for your signed-in account.",
              '<form id="password-form" autocomplete="off"><div class="form-grid">' +
                '<div class="field full"><label for="pw-current">Current password</label><input class="input" id="pw-current" name="current" type="password" required autocomplete="current-password"></div>' +
                '<div class="field"><label for="pw-new">New password</label><input class="input" id="pw-new" name="password" type="password" minlength="6" required autocomplete="new-password"></div>' +
                '<div class="field"><label for="pw-confirm">Confirm new password</label><input class="input" id="pw-confirm" name="confirm" type="password" minlength="6" required autocomplete="new-password"></div>' +
              "</div>" +
              '<div class="alert danger hidden mt-3" data-password-error role="alert">' + U.icon("alert-triangle", "icon-sm") + "<div data-password-error-text></div></div>" +
              '<button class="btn mt-3" type="submit">' + U.icon("key", "icon-sm") + " Update password</button></form>") +
            '<div class="note mt-3">PHSC Coop · Schema v' + (db.meta.version || 1) + " · Last updated " + U.formatDateTime(db.meta.updatedAt) + "</div>" +
          "</div>" +
        "</div>";

      const form = root.querySelector("#settings-form");
      if (form && canManage) {
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          const box = root.querySelector("[data-settings-error]");
          const text = root.querySelector("[data-settings-error-text]");
          if (box) box.classList.add("hidden");
          const submit = root.querySelector("[form=settings-form]");
          UI.setBusy(submit, true, "Saving…");
          try {
            COOP.actions.saveSettings(UI.formData(form));
            refresh("Settings saved.");
          } catch (err) {
            if (box && text) { text.textContent = err.message; box.classList.remove("hidden"); }
            UI.setBusy(submit, false);
          }
        });
      }

      root.querySelectorAll("[data-scroll]").forEach(function (button) {
        button.addEventListener("click", function () {
          const target = root.querySelector("#" + button.getAttribute("data-scroll"));
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

      const themeToggle = root.querySelector("#theme-toggle");
      if (themeToggle) themeToggle.addEventListener("change", function () {
        const next = themeToggle.checked ? "dark" : "light";
        store.setTheme(next);
        if (COOP.app && COOP.app.applyTheme) COOP.app.applyTheme(next);
        UI.toast(next === "dark" ? "Dark mode enabled." : "Light mode enabled.");
      });

      const exportButton = root.querySelector("[data-export]");
      if (exportButton) exportButton.addEventListener("click", function () {
        U.downloadJSON("coop-backup-" + U.today() + ".json", store.exportData());
        UI.toast("Backup exported.");
      });
      const fileInput = root.querySelector("#backup-file");
      if (fileInput) fileInput.addEventListener("change", function () {
        try { importBackup(fileInput); } catch (err) { UI.toast(err.message, "danger"); }
      });
      const resetButton = root.querySelector("[data-reset-data]");
      if (resetButton) resetButton.addEventListener("click", resetData);

      const passwordForm = root.querySelector("#password-form");
      passwordForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const box = root.querySelector("[data-password-error]");
        const text = root.querySelector("[data-password-error-text]");
        if (box) box.classList.add("hidden");
        const data = UI.formData(passwordForm);
        if (data.password !== data.confirm) {
          if (box && text) { text.textContent = "New passwords do not match."; box.classList.remove("hidden"); }
          return;
        }
        const button = passwordForm.querySelector("[type=submit]");
        UI.setBusy(button, true, "Updating…");
        try {
          await COOP.actions.changeOwnPassword(data.current, data.password);
          passwordForm.reset();
          UI.toast("Password updated.");
        } catch (err) {
          if (box && text) { text.textContent = err.message; box.classList.remove("hidden"); }
        } finally {
          UI.setBusy(button, false);
        }
      });
    }
  };
})();
