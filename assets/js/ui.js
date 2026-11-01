(function () {
  "use strict";
  const COOP = (window.COOP = window.COOP || {});
  const U = COOP.utils;
  const UI = (COOP.ui = {});

  const STATUS = {
    active: ["success", "Active"],
    paid: ["success", "Paid"],
    approved: ["success", "Approved"],
    completed: ["success", "Completed"],
    complete: ["success", "Complete"],
    posted: ["success", "Posted"],
    pending: ["warning", "Pending"],
    partial: ["warning", "Partial"],
    unpaid: ["warning", "Unpaid"],
    due: ["warning", "Due"],
    due_soon: ["warning", "Due soon"],
    overdue: ["danger", "Overdue"],
    rejected: ["danger", "Rejected"],
    cancelled: ["danger", "Cancelled"],
    voided: ["outline", "Voided"],
    inactive: ["outline", "Inactive"],
    waived: ["info", "Waived"],
    member: ["info", "Member"],
    non_member: ["purple", "Non-member"],
    admin: ["purple", "Admin"],
    treasurer: ["info", "Treasurer"]
  };

  let activeModal = null;
  let modalSequence = 0;

  UI.statusBadge = function (status, label) {
    const key = String(status || "").toLowerCase();
    const conf = STATUS[key] || ["", label || U.titleCase(key)];
    const text = label || conf[1] || key;
    return '<span class="badge ' + conf[0] + '"><span class="dot"></span>' + U.esc(text) + "</span>";
  };

  UI.badge = function (text, tone) {
    return '<span class="badge ' + (tone || "") + '">' + U.esc(text) + "</span>";
  };

  UI.avatar = function (name, extraClass) {
    return '<div class="avatar ' + (extraClass || "") + '">' + U.esc(U.initials(name)) + "</div>";
  };

  UI.toast = function (message, type, timeout) {
    const root = document.getElementById("toast-root");
    if (!root) return;
    const tone = type || "success";
    const icons = { success: "check-circle", danger: "alert-triangle", warning: "alert-triangle", info: "info" };
    const el = document.createElement("div");
    el.className = "toast " + tone;
    el.setAttribute("role", "status");
    el.innerHTML = U.icon(icons[tone] || "info", "icon-sm") +
      '<div class="toast-message">' + U.esc(message) + "</div>" +
      '<button class="toast-close" type="button" aria-label="Dismiss">' + U.icon("x", "icon-sm") + "</button>";
    root.appendChild(el);
    let timer = null;
    function dismiss() {
      if (timer) clearTimeout(timer);
      el.classList.add("hide");
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }
    el.querySelector(".toast-close").addEventListener("click", dismiss);
    timer = setTimeout(dismiss, timeout || (tone === "danger" ? 6000 : 3800));
  };

  UI.modal = function (options) {
    const opts = options || {};
    const root = document.getElementById("modal-root");
    if (!root) return null;
    if (activeModal) activeModal.close();

    const titleId = "modal-title-" + (++modalSequence);
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.setAttribute("data-modal-overlay", "");
    const footer = opts.footer
      ? '<div class="modal-foot ' + (opts.footerClass || "") + '">' + opts.footer + "</div>"
      : "";
    overlay.innerHTML =
      '<div class="modal ' + (opts.size || "") + '" role="dialog" aria-modal="true" aria-labelledby="' + titleId + '">' +
        '<div class="modal-head">' +
          '<div class="modal-title-wrap">' +
            "<h2 id=\"" + titleId + "\">" + U.esc(opts.title || "Dialog") + "</h2>" +
            (opts.subtitle ? '<div class="sub">' + U.esc(opts.subtitle) + "</div>" : "") +
          "</div>" +
          '<button class="icon-btn modal-close" type="button" data-modal-close aria-label="Close">' + U.icon("x") + "</button>" +
        "</div>" +
        '<div class="modal-body">' + (opts.body || "") + "</div>" +
        footer +
      "</div>";
    root.appendChild(overlay);

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      if (opts.onClose) {
        try { opts.onClose(); } catch (e) { console.error(e); }
      }
      overlay.remove();
      if (activeModal && activeModal.el === overlay) activeModal = null;
      if (!document.querySelector(".modal-overlay")) document.body.style.overflow = "";
    }

    const handle = { el: overlay, close: close };
    activeModal = handle;

    overlay.querySelector("[data-modal-close]").addEventListener("click", close);
    if (opts.closeOnBackdrop !== false) {
      overlay.addEventListener("mousedown", function (event) {
        if (event.target === overlay) close();
      });
    }
    document.body.style.overflow = "hidden";

    if (opts.onMount) {
      Promise.resolve().then(function () {
        if (closed) return;
        try { opts.onMount(overlay.querySelector(".modal"), handle); } catch (e) { console.error(e); }
      });
    }
    setTimeout(function () {
      const focusable = overlay.querySelector("input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([data-modal-close]):not([disabled])") ||
        overlay.querySelector("[data-modal-close]");
      if (focusable) focusable.focus();
    }, 30);
    return handle;
  };

  UI.closeModal = function () {
    if (activeModal) activeModal.close();
  };

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && activeModal) activeModal.close();
  });

  UI.confirm = function (options) {
    const opts = options || {};
    return new Promise(function (resolve) {
      let settled = false;
      const confirmClass = opts.tone === "danger" ? "danger" : "primary";
      const modal = UI.modal({
        title: opts.title || "Please confirm",
        subtitle: opts.subtitle || "",
        size: "sm",
        body: '<p class="note" style="font-size:.86rem;line-height:1.65">' + U.esc(opts.message || "Are you sure?") + "</p>" +
          (opts.detail ? '<div class="alert warning mt-3">' + U.icon("alert-triangle", "icon-sm") + "<div>" + U.esc(opts.detail) + "</div></div>" : ""),
        footer: '<button class="btn" type="button" data-cancel>' + U.esc(opts.cancelLabel || "Cancel") + "</button>" +
          '<button class="btn ' + confirmClass + '" type="button" data-confirm>' + U.esc(opts.confirmLabel || "Confirm") + "</button>",
        onMount: function (modalEl) {
          modalEl.querySelector("[data-cancel]").addEventListener("click", function () {
            settled = true;
            modal.close();
            resolve(false);
          });
          modalEl.querySelector("[data-confirm]").addEventListener("click", function () {
            settled = true;
            modal.close();
            resolve(true);
          });
        },
        onClose: function () {
          if (!settled) resolve(false);
        }
      });
      if (!modal) resolve(false);
    });
  };

  UI.empty = function (options) {
    const opts = options || {};
    return '<div class="empty ' + (opts.small ? "small" : "") + '">' +
      '<div class="empty-icon">' + U.icon(opts.icon || "file-text") + "</div>" +
      "<h3>" + U.esc(opts.title || "Nothing here yet") + "</h3>" +
      (opts.message ? "<p>" + U.esc(opts.message) + "</p>" : "") +
      (opts.actions ? '<div class="empty-actions">' + opts.actions + "</div>" : "") +
      "</div>";
  };

  UI.options = function (items, selected, placeholder) {
    let html = "";
    if (placeholder !== undefined) {
      html += '<option value="">' + U.esc(placeholder) + "</option>";
    }
    (items || []).forEach(function (item) {
      const value = typeof item === "object" ? item.value : item;
      const label = typeof item === "object" ? item.label : item;
      html += '<option value="' + U.esc(value) + '"' + (String(selected) === String(value) ? " selected" : "") + ">" + U.esc(label) + "</option>";
    });
    return html;
  };

  UI.formData = function (form) {
    const data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === "checkbox") {
        data[el.name] = el.checked;
      } else if (el.type === "radio") {
        if (el.checked) data[el.name] = el.value;
      } else {
        data[el.name] = el.value;
      }
    });
    return data;
  };

  UI.setBusy = function (button, busy, label) {
    if (!button) return;
    if (busy) {
      if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = U.icon("refresh", "spin") + "<span>" + U.esc(label || "Saving…") + "</span>";
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
      }
    }
  };

  UI.spinner = function (label) {
    return '<div class="center" style="padding:32px"><span class="inline">' + U.icon("refresh", "spin") + "<span>" + U.esc(label || "Loading…") + "</span></span></div>";
  };

  UI.downloadCSV = function (filename, rows) {
    U.downloadFile(filename, "\uFEFF" + U.toCSV(rows), "text/csv;charset=utf-8");
  };

  UI.print = function () {
    window.print();
  };

  UI.askReason = function (options) {
    const opts = options || {};
    return new Promise(function (resolve) {
      let settled = false;
      const modal = UI.modal({
        title: opts.title || "Provide a reason",
        subtitle: opts.subtitle || "",
        size: "sm",
        body: (opts.message ? '<p class="note mb-3" style="font-size:.84rem;line-height:1.6">' + U.esc(opts.message) + "</p>" : "") +
          '<div class="field"><label for="reason-input">' + U.esc(opts.label || "Reason") + (opts.optional ? "" : '<span class="req">*</span>') + "</label>" +
          '<textarea class="textarea" id="reason-input" rows="3" placeholder="' + U.esc(opts.placeholder || "Type the reason here") + '"></textarea>' +
          '<div class="error-text" data-reason-error></div></div>',
        footer: '<button class="btn" type="button" data-reason-cancel>Cancel</button>' +
          '<button class="btn ' + (opts.tone === "danger" ? "danger" : "primary") + '" type="button" data-reason-confirm>' + U.esc(opts.confirmLabel || "Continue") + "</button>",
        onMount: function (modalEl) {
          const input = modalEl.querySelector("#reason-input");
          const error = modalEl.querySelector("[data-reason-error]");
          function submit() {
            const value = input.value.trim();
            if (!value && !opts.optional) {
              error.textContent = "Please enter a reason.";
              input.focus();
              return;
            }
            settled = true;
            modal.close();
            resolve(value || "");
          }
          modalEl.querySelector("[data-reason-cancel]").addEventListener("click", function () {
            settled = true;
            modal.close();
            resolve(null);
          });
          modalEl.querySelector("[data-reason-confirm]").addEventListener("click", submit);
          input.addEventListener("keydown", function (event) {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) submit();
          });
          setTimeout(function () { input.focus(); }, 40);
        },
        onClose: function () {
          if (!settled) resolve(null);
        }
      });
      if (!modal) resolve(null);
    });
  };
})();
