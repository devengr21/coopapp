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
    const user = id ? db.users.find(function (u) { return u.id === id; }) : null;
    if (id && !user) {
      UI.toast("User not found.", "danger");
      return;
    }
    const members = D.memberOptions(db, true);
    const selectedRole = user ? user.role : "treasurer";

    const modal = UI.modal({
      title: user ? "Edit user" : "Add user",
      subtitle: "Administrators manage the system, treasurers manage finances, and members see their own portal.",
      size: "md",
      body:
        '<div class="alert danger hidden" data-form-error role="alert">' + U.icon("alert-triangle", "icon-sm") + "<div data-form-error-text></div></div>" +
        '<form id="user-form" autocomplete="off"><div class="form-grid">' +
          '<div class="field full"><label for="u-name">Full name<span class="req">*</span></label><input class="input" id="u-name" name="name" value="' + U.esc(user ? user.name : "") + '" required maxlength="80"></div>' +
          '<div class="field full"><label for="u-username">Username<span class="req">*</span></label><input class="input" id="u-username" name="username" value="' + U.esc(user ? user.username : "") + '" required maxlength="32" autocomplete="off"></div>' +
          '<div class="field full"><label for="u-email">Email address<span class="req">*</span></label><input class="input" id="u-email" name="email" type="email" value="' + U.esc(user ? user.email : "") + '" required maxlength="120" autocomplete="email"></div>' +
          '<div class="field full"><label for="u-role">Role<span class="req">*</span></label><select class="select" id="u-role" name="role">' +
            UI.options([
              { value: "admin", label: "Administrator" },
              { value: "president", label: "President" },
              { value: "treasurer", label: "Treasurer" },
              { value: "member", label: "Member (portal only)" }
            ], selectedRole) + "</select></div>" +
          '<div class="field full" id="u-member-field"><label for="u-member">Linked member<span class="req" data-member-required>' + (selectedRole === "member" ? "*" : "") + "</span></label>" +
            '<select class="select" id="u-member" name="memberId">' + UI.options(members.map(function (m) { return { value: m.id, label: D.memberLabel(m) }; }), user ? user.memberId : "", "Not linked") + "</select>" +
            '<div class="help">Required for member accounts. Optional for staff accounts.</div></div>' +
          '<div class="field full"><label for="u-password">' + (user ? "New password" : "Password") + (user ? "" : '<span class="req">*</span>') + "</label>" +
            '<input class="input" id="u-password" name="password" type="password" minlength="6" autocomplete="new-password" placeholder="' + (user ? "Leave blank to keep current password" : "At least 6 characters") + '">' +
            '<div class="help">Passwords are hashed before being stored in this browser.</div></div>' +
          '<div class="field full"><label class="check" style="padding:0"><input type="checkbox" id="u-active" name="active"' + (!user || user.active !== false ? " checked" : "") + '>' +
            '<span><span class="check-text">Active account</span><span class="help">Disabled accounts cannot sign in.</span></span></label></div>' +
        "</div></form>",
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn primary" type="submit" form="user-form">' + U.icon("save", "icon-sm") + (user ? " Save changes" : " Create user") + "</button>",
      onMount: function (modalEl) {
        const form = modalEl.querySelector("#user-form");
        const submit = modalEl.querySelector("[form=user-form]");
        const role = form.querySelector("#u-role");
        const memberField = form.querySelector("#u-member-field");
        const memberRequired = form.querySelector("[data-member-required]");
        const memberSelect = form.querySelector("#u-member");
        const nameInput = form.querySelector("#u-name");
        modalEl.querySelector("[data-cancel]").addEventListener("click", modal.close);

        function updateRole() {
          const isMember = role.value === "member";
          memberRequired.textContent = isMember ? "*" : "";
          memberSelect.required = isMember;
          memberField.style.display = "";
        }
        role.addEventListener("change", updateRole);
        memberSelect.addEventListener("change", function () {
          if (role.value === "member" && !nameInput.value.trim()) {
            const member = db.members.find(function (m) { return m.id === memberSelect.value; });
            if (member) nameInput.value = D.memberName(member);
          }
        });
        updateRole();

        form.addEventListener("submit", async function (event) {
          event.preventDefault();
          const box = form.querySelector("[data-form-error]");
          const text = form.querySelector("[data-form-error-text]");
          if (box) box.classList.add("hidden");
          UI.setBusy(submit, true, "Saving…");
          try {
            await COOP.actions.saveUser(UI.formData(form), user ? user.id : null);
            UI.closeModal();
            UI.toast(user ? "User updated." : "User created.");
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

  function resetPassword(user) {
    const modal = UI.modal({
      title: "Reset password",
      subtitle: "Set a new password for " + user.name + " (" + user.username + ").",
      size: "sm",
      body:
        '<div class="alert danger hidden" data-form-error role="alert">' + U.icon("alert-triangle", "icon-sm") + "<div data-form-error-text></div></div>" +
        '<form id="password-form"><div class="form-grid">' +
          '<div class="field full"><label for="rp-password">New password<span class="req">*</span></label><input class="input" id="rp-password" name="password" type="password" minlength="6" required autocomplete="new-password"></div>' +
          '<div class="field full"><label for="rp-confirm">Confirm new password<span class="req">*</span></label><input class="input" id="rp-confirm" name="confirm" type="password" minlength="6" required autocomplete="new-password"></div>' +
        "</div></form>",
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn primary" type="submit" form="password-form">' + U.icon("key", "icon-sm") + " Reset password</button>",
      onMount: function (modalEl) {
        const form = modalEl.querySelector("#password-form");
        const submit = modalEl.querySelector("[form=password-form]");
        modalEl.querySelector("[data-cancel]").addEventListener("click", modal.close);
        form.addEventListener("submit", async function (event) {
          event.preventDefault();
          const box = form.querySelector("[data-form-error]");
          const text = form.querySelector("[data-form-error-text]");
          if (box) box.classList.add("hidden");
          const data = UI.formData(form);
          if (data.password !== data.confirm) {
            if (box && text) { text.textContent = "Passwords do not match."; box.classList.remove("hidden"); }
            return;
          }
          UI.setBusy(submit, true, "Resetting…");
          try {
            await COOP.actions.resetUserPassword(user.id, data.password);
            UI.closeModal();
            UI.toast("Password reset.");
          } catch (err) {
            if (box && text) { text.textContent = err.message; box.classList.remove("hidden"); }
            UI.setBusy(submit, false);
          }
        });
      }
    });
    return modal;
  }

  function deleteUser(user) {
    UI.confirm({
      title: "Delete user?",
      message: "Delete the account " + user.username + "? Their historical audit entries will remain.",
      confirmLabel: "Delete user",
      tone: "danger"
    }).then(async function (ok) {
      if (!ok) return;
      try {
        await COOP.actions.deleteUser(user.id);
        UI.toast("User deleted.");
        if (COOP.app) COOP.app.refresh();
      } catch (err) {
        UI.toast(err.message, "danger");
      }
    });
  }

  function approvePending(pending) {
    const db = store.get();
    const members = D.memberOptions(db, true);
    const modal = UI.modal({
      title: "Approve account request",
      subtitle: "Approve " + pending.name + " (" + pending.username + "), choose the account level, and optionally link to a member record.",
      size: "md",
      body:
        '<div class="alert danger hidden" data-form-error role="alert">' + U.icon("alert-triangle", "icon-sm") + "<div data-form-error-text></div></div>" +
        '<form id="approve-form" autocomplete="off"><div class="form-grid">' +
        '<div class="field full"><label for="ap-name">Name</label><input class="input" id="ap-name" name="name" value="' + U.esc(pending.name) + '" readonly></div>' +
        '<div class="field full"><label for="ap-email">Email</label><input class="input" id="ap-email" name="email" value="' + U.esc(pending.email) + '" readonly></div>' +
        '<div class="field"><label for="ap-role">Account type<span class="req">*</span></label>' +
          '<select class="select" id="ap-role" name="role">' +
          D.ROLES.map(function (r) {
            return '<option value="' + r + '">' + U.esc(D.ROLE_LABELS[r]) + "</option>";
          }).join("") +
          '</select><div class="help">Administrator gets full access; Treasurer manages finances; Member sees only their portal.</div></div>' +
        '<div class="field"><label for="ap-member">Link member (optional)</label>' +
          '<select class="select" id="ap-member" name="memberId"><option value="">Do not link to a member</option>' +
          members.map(function (m) {
            const alreadyLinked = db.users.find(function (u) { return u.memberId === m.id && u.active !== false; });
            if (alreadyLinked) return '<option value="' + U.esc(m.id) + '" disabled>' + U.esc(D.memberLabel(m)) + " (already linked)</option>";
            return '<option value="' + U.esc(m.id) + '">' + U.esc(D.memberLabel(m)) + "</option>";
          }).join("") +
              '</select><div class="help">Optional — gives the account access to this member\'s portal page and collections.</div></div>' +
        "</div></form>",
      footer:
        '<button class="btn" type="button" data-cancel>Cancel</button>' +
        '<button class="btn primary" type="submit" form="approve-form">' + U.icon("check", "icon-sm") + " Approve account</button>",
      onMount: function (modalEl) {
        const form = modalEl.querySelector("#approve-form");
        const submit = modalEl.querySelector("[form=approve-form]");
        modalEl.querySelector("[data-cancel]").addEventListener("click", modal.close);
        form.addEventListener("submit", async function (event) {
          event.preventDefault();
          const box = form.querySelector("[data-form-error]");
          const text = form.querySelector("[data-form-error-text]");
          if (box) box.classList.add("hidden");
          UI.setBusy(submit, true, "Approving…");
          try {
            await COOP.actions.approveUser(pending.id, form.querySelector("#ap-member").value || "", form.querySelector("#ap-role").value);
            UI.closeModal();
            UI.toast("Account approved.");
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

  function rejectPending(pending) {
    UI.confirm({
      title: "Reject account request?",
      message: "Reject the account request from " + pending.name + " (" + pending.username + ")? This cannot be undone.",
      confirmLabel: "Reject",
      tone: "danger"
    }).then(async function (ok) {
      if (!ok) return;
      try {
        await COOP.actions.rejectUser(pending.id);
        UI.toast("Account request rejected.");
        if (COOP.app) COOP.app.refresh();
      } catch (err) {
        UI.toast(err.message, "danger");
      }
    });
  }

  pages.users = {
    render: function (root) {
      const db = store.get();
      const current = store.currentUser();
      const state = U.tableState("users");
      let users = (db.users || []).slice();
      users.forEach(function (u) {
        const m = db.members.find(function (x) { return x.id === u.memberId; });
        u._memberName = m ? D.memberName(m) : "";
      });
      if (state.sortKey) {
        users = U.sortByKey(users, state.sortKey === "memberName" ? "_memberName" : state.sortKey, state.sortDir);
      } else {
        users.sort(function (a, b) {
          const order = { admin: 0, treasurer: 1, member: 2 };
          const aRole = order[a.role] || 9;
          const bRole = order[b.role] || 9;
          if (aRole !== bRole) return aRole - bRole;
          const aActive = a.active !== false ? 1 : 0;
          const bActive = b.active !== false ? 1 : 0;
          if (aActive !== bActive) return bActive - aActive;
          return String(a.name).localeCompare(String(b.name));
        });
      }
      const admins = users.filter(function (u) { return u.role === "admin" && u.active !== false; }).length;
      const treasurers = users.filter(function (u) { return u.role === "treasurer" && u.active !== false; }).length;
      const memberUsers = users.filter(function (u) { return u.role === "member" && u.active !== false; }).length;
      const rows = users.length ? users.map(function (user) {
        const member = user.memberId ? db.members.find(function (m) { return m.id === user.memberId; }) : null;
        return "<tr>" +
          '<td><div class="cell-person">' + UI.avatar(user.name) + '<div class="meta"><div class="name">' + U.esc(user.name) +
            (current && current.id === user.id ? ' <span class="badge info">You</span>' : "") + "</div>" +
            '<div class="sub">@' + U.esc(user.username) + "</div></div></div></td>" +
          "<td>" + UI.statusBadge(user.role) + "</td>" +
          "<td>" + (member ? U.esc(D.memberName(member)) : '<span class="muted">—</span>') + "</td>" +
          "<td>" + (user.active === false ? UI.statusBadge("inactive", "Disabled") : UI.statusBadge("active", "Active")) + "</td>" +
          '<td class="sub">' + (user.lastLoginAt ? U.formatRelative(user.lastLoginAt) : "Never") + "</td>" +
          '<td class="actions"><div class="row-actions">' +
            '<button class="btn sm ghost" type="button" data-edit="' + U.esc(user.id) + '">Edit</button>' +
            '<button class="btn sm ghost" type="button" data-reset="' + U.esc(user.id) + '">Password</button>' +
            (current && current.id === user.id ? "" : '<button class="btn sm ghost" type="button" data-delete="' + U.esc(user.id) + '">' + U.icon("trash", "icon-sm") + "</button>") +
          "</div></td></tr>";
      }).join("") : '<tr><td colspan="6" class="empty-row">No users found.</td></tr>';

      root.innerHTML =
        '<div class="page-head"><div><span class="eyebrow">' + U.icon("shield", "icon-sm") + " Access</span>" +
          "<h1>Users</h1><div class=\"sub\">Administrator, treasurer, and member portal accounts for this workspace.</div></div>" +
          '<div class="page-actions"><button class="btn primary" data-action="add">' + U.icon("user-plus", "icon-sm") + " Add user</button></div></div>" +
        '<div class="alert info mb-3">' + U.icon("info", "icon-sm") +
          "<div><strong>Local authentication.</strong> Accounts are stored in this browser only. Use the backup feature before changing devices, and replace local auth with a secure server before production.</div></div>" +
        '<div class="section"><div class="section-head">' +
          U.icon("users", "section-icon") +
          "<h3>Overview</h3>" +
        "</div>" +
        '<div class="stat-grid">' +
          stat("users", "Active accounts", U.number(users.filter(function (u) { return u.active !== false; }).length, 0), users.length + " total") +
          stat("shield", "Administrators", U.number(admins, 0), "Full system access", "tone-purple") +
          stat("wallet", "Treasurers", U.number(treasurers, 0), "Finance operations", "tone-info") +
          stat("user", "Member portals", U.number(memberUsers, 0), "Read-only member access", "tone-success") +
        "</div></div>" +
        '<div class="section"><div class="section-head">' +
          U.icon("user", "section-icon") +
          "<h3>User accounts</h3>" +
          '<div class="section-sub">Role-based access to the workspace</div>' +
        "</div>" +
        '<div class="card"><div class="card-body flush"><div class="table-wrap"><div class="table-filter mb-0"><div class="search">' + U.icon("search") + '<input class="input" id="user-search" placeholder="Search users…"></div></div><table class="data"><thead><tr>' +
          '<th class="sortable" data-sort="name">User' + (state.sortKey === "name" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="role">Role' + (state.sortKey === "role" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="memberName">Linked member' + (state.sortKey === "memberName" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="active">Status' + (state.sortKey === "active" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th class="sortable" data-sort="lastLoginAt">Last sign-in' + (state.sortKey === "lastLoginAt" ? (state.sortDir === "asc" ? " ↑" : " ↓") : "") + '</th>' +
          '<th></th>' +
          '</tr></thead><tbody>' +
          rows + "</tbody></table></div></div></div>" +
        '<div class="section"><div class="section-head">' +
          U.icon("shield", "section-icon") +
          "<h3>Role permissions</h3>" +
          '<div class="section-sub">What each account can access</div>' +
        "</div>" +
        '<div class="card mt-3"><div class="card-body">' +
          '<div class="grid-3">' +
            '<div class="summary-box"><div class="label">Administrator</div><div class="value" style="font-size:.9rem">Full access</div><div class="sub">Members, finance, approvals, users, settings, backups, audit.</div></div>' +
            '<div class="summary-box"><div class="label">Treasurer</div><div class="value" style="font-size:.9rem">Finance operations</div><div class="sub">Members, contributions, loans, payments, approvals, reports, cash, audit. No user administration.</div></div>' +
            '<div class="summary-box"><div class="label">Member</div><div class="value" style="font-size:.9rem">Own portal only</div><div class="sub">Own contributions, loans, payment history, and profile. No editing.</div></div>' +
          "</div></div></div>";

      const search = root.querySelector("#user-search");
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
          const s2 = U.tableState("users");
          if (s2.sortKey === key) {
            s2.sortDir = s2.sortDir === "asc" ? "desc" : "asc";
          } else {
            s2.sortKey = key;
            s2.sortDir = "asc";
          }
          U.tableSave("users", s2);
          pages.users.render(root);
        });
      });

      root.querySelectorAll("[data-edit]").forEach(function (button) {
        button.addEventListener("click", function () { openForm(button.getAttribute("data-edit")); });
      });
      root.querySelectorAll("[data-reset]").forEach(function (button) {
        button.addEventListener("click", function () {
          const user = users.find(function (u) { return u.id === button.getAttribute("data-reset"); });
          if (user) resetPassword(user);
        });
      });
      root.querySelectorAll("[data-delete]").forEach(function (button) {
        button.addEventListener("click", function () {
          const user = users.find(function (u) { return u.id === button.getAttribute("data-delete"); });
          if (user) deleteUser(user);
        });
      });
      root.querySelector("[data-action=add]").addEventListener("click", function () { openForm(); });

      const pending = (db.pendingUsers || []).slice();
      if (pending.length) {
        const pendingRows = pending.map(function (p) {
          return "<tr>" +
            "<td>" + U.formatDate(p.requestedAt) + "</td>" +
            "<td><div class='cell-person'><div class='avatar' style='width:28px;height:28px;font-size:.64rem'>" +
            U.esc(U.initials(p.name || "U")) + "</div><div class='meta'><div class='name' style='font-size:.78rem'>" +
            U.esc(p.name) + "</div><div class='sub'>@ " + U.esc(p.username || String(p.email || "").split("@")[0]) + "</div></div></div></td>" +
            "<td>" + U.esc(p.email) + "</td>" +
            "<td><span class='badge warning'>Pending</span></td>" +
            '<td class="actions"><div class="row-actions">' +
            '<button class="btn sm" type="button" data-approve-pending="' + U.esc(p.id) + '">Approve</button>' +
            '<button class="btn sm danger-soft" type="button" data-reject-pending="' + U.esc(p.id) + '">Reject</button>' +
            "</div></td></tr>";
        }).join("");

        root.innerHTML +=
          '<div class="card mt-3"><div class="card-head"><div><h2>Pending account requests</h2><div class="sub">' +
          pending.length + " account(s) awaiting administrator approval</div></div></div>" +
          '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr>' +
          '<th>Requested</th><th>Name</th><th>Email</th><th>Status</th><th></th></tr></thead>' +
          "<tbody>" + pendingRows + "</tbody></table></div></div></div>";

        root.querySelectorAll("[data-approve-pending]").forEach(function (button) {
          button.addEventListener("click", function () {
            const p = pending.find(function (u) { return u.id === button.getAttribute("data-approve-pending"); });
            if (p) approvePending(p);
          });
        });
        root.querySelectorAll("[data-reject-pending]").forEach(function (button) {
          button.addEventListener("click", function () {
            const p = pending.find(function (u) { return u.id === button.getAttribute("data-reject-pending"); });
            if (p) rejectPending(p);
          });
        });
      }
    }
  };
})();
