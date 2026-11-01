(function () {
  "use strict";
  const COOP = (window.COOP = window.COOP || {});
  const U = COOP.utils;
  const UI = COOP.ui;
  const store = COOP.store;
  const pages = (COOP.pages = COOP.pages || {});

  const MARK_SVG =
    '<svg width="36" height="36" viewBox="0 0 64 64" aria-hidden="true" focusable="true" tabindex="0">' +
      '<path d="M45 21.1A17 17 0 1 0 45 42.9" fill="none" stroke="#F3F7F4" stroke-width="7" stroke-linecap="round"/>' +
      '<circle cx="32" cy="32" r="5.5" fill="#E8B84A"/>' +
      '<circle cx="47.5" cy="32" r="2.2" fill="#8FD0B0"/>' +
    '</svg>';

  const RING_SVG =
    '<svg class="ring" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
      '<path class="arc" d="M45 21.1A17 17 0 1 0 45 42.9" fill="none" stroke="#17504B" stroke-width="7" stroke-linecap="round"/>' +
      '<circle class="core" cx="32" cy="32" r="5.5" fill="#E8B84A"/>' +
      '<circle class="mint" cx="47.5" cy="32" r="2.2" fill="#8FD0B0"/>' +
    '</svg>';

  function themeButton() {
    const theme = document.documentElement.getAttribute("data-theme") || store.get().settings.theme || "light";
    return '<button class="icon-btn" type="button" data-auth-theme aria-label="Toggle theme" title="Toggle theme">' +
      U.icon(theme === "dark" ? "sun" : "moon") + "</button>";
  }

  function revealBtn(inputId) {
    return '<button class="reveal" type="button" data-for="' + U.esc(inputId) + '" aria-label="Show password">Show</button>';
  }

  function authShell(bodyHtml, footerHtml) {
    const settings = store.get().settings;
    const orgName = settings.orgName || "PHSC Coop";
    return '<div class="auth-login root" id="auth-root">' +
      '<div class="brand">' +
        '<div class="lockup">' + MARK_SVG + '<span>' + U.esc(orgName) + '</span></div>' +
        RING_SVG +
        '<div class="tagline">' +
          '<h2><span>Save together.</span><span>Borrow with care.</span></h2>' +
          '<p>A cooperative built for Contract of Service workers and colleagues, so no one has to face hard times alone.</p>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        bodyHtml +
        footerHtml +
      '</div>' +
    '</div>';
  }

  function errorBox(formId) {
    return '<p class="err" id="auth-err-' + U.esc(formId) + '" role="alert" hidden></p>';
  }

  pages.auth = {
    render: function (root, mode) {
      const settings = store.get().settings;
      const orgName = settings.orgName || "PHSC Coop";
      const theme = document.documentElement.getAttribute("data-theme") || settings.theme || "light";
      document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");

      if (mode === "forgot-password") {
        root.innerHTML = authShell(
          '<form class="view" id="auth-forgot-form" novalidate>' +
            '<h1>Forgot password?</h1>' +
            '<p class="sub">Contact your cooperative administrator to reset your password.</p>' +
            errorBox("forgot") +
            '<p class="note">PHSC Coop does not offer password self-reset. Please reach out to your administrator to have your password reset.</p>' +
            '<p class="help"><a href="#/login" class="link">&larr; Return to sign in</a></p>' +
          "</form>",
          themeButton()
        );
        bindTheme(root);
        bindNavLinks(root);
        return;
      }

      if (mode === "create-account") {
        root.innerHTML = authShell(
          '<form class="view create-view" id="auth-create-form" novalidate>' +
            '<h1>Create account</h1>' +
            '<p class="sub">Set up your ' + U.esc(orgName) + ' account.</p>' +
            errorBox("create") +
            '<div class="group"><label class="lbl" for="auth-c-name">Full name</label>' +
              '<input class="field" id="auth-c-name" name="name" type="text" autocomplete="name" autofocus required></div>' +
            '<div class="group"><label class="lbl" for="auth-c-email">Email</label>' +
              '<input class="field" id="auth-c-email" name="email" type="email" autocomplete="email" required></div>' +
            '<div class="group"><label class="lbl" for="auth-c-pw">Password</label>' +
              '<div class="pwrap"><input class="field" id="auth-c-pw" name="password" type="password" autocomplete="new-password" minlength="6" required>' +
              revealBtn("auth-c-pw") + '</div></div>' +
            '<div class="group"><label class="lbl" for="auth-c-confirm">Confirm password</label>' +
              '<input class="field" id="auth-c-confirm" name="confirmPassword" type="password" autocomplete="new-password" minlength="6" required></div>' +
            '<button class="cta" type="submit">Create account</button>' +
            '<p class="help">Already have an account? <a href="#/login" class="link" data-go="login">Sign in</a></p>' +
          "</form>",
          themeButton()
        );
        bindTheme(root);
        bindNavLinks(root);
        wireCreateForm(root);
        playEnterAnimation(root.querySelector("#auth-create-form"));
        return;
      }

      // Login
      root.innerHTML = authShell(
          '<form class="view login-view" id="auth-login-form" novalidate>' +
            '<h1>Sign in</h1>' +
            '<p class="sub">Use your ' + U.esc(orgName) + ' account.</p>' +
            errorBox("login") +
            '<div class="group"><label class="lbl" for="auth-l-email">Email</label>' +
              '<input class="field" id="auth-l-email" name="email" type="email" autocomplete="off" autofocus required></div>' +
            '<div class="group"><label class="lbl" for="auth-l-pw">Password</label>' +
              '<div class="pwrap"><input class="field" id="auth-l-pw" name="pw" type="password" autocomplete="off" required>' +
              revealBtn("auth-l-pw") + '</div></div>' +
            '<div class="row"><label class="keep"><input type="checkbox" name="remember"> Keep me signed in</label>' +
              '<a class="link" href="#/forgot-password">Forgot password?</a></div>' +
            '<button class="cta" type="submit">Sign in</button>' +
            '<p class="help">New to ' + U.esc(orgName) + '? <a href="#/create-account" class="link" data-go="create-account">Create an account</a></p>' +
          "</form>",
          themeButton()
        );
      bindTheme(root);
      bindNavLinks(root);
      wireLoginForm(root);
      playEnterAnimation(root.querySelector("#auth-login-form"));
    }
  };

  function bindTheme(root) {
    const button = root.querySelector("[data-auth-theme]");
    if (!button) return;
    button.addEventListener("click", function () {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      store.setTheme(next);
      button.innerHTML = U.icon(next === "dark" ? "sun" : "moon");
    });
  }

  function bindNavLinks(root) {
    root.addEventListener("click", function (e) {
      const go = e.target.closest("[data-go]");
      if (go) {
        e.preventDefault();
        const target = go.getAttribute("data-go");
        if (COOP.app) COOP.app.navigate("/" + target);
        return;
      }
      const rev = e.target.closest(".reveal");
      if (rev) {
        e.preventDefault();
        const input = document.getElementById(rev.getAttribute("data-for"));
        if (!input) return;
        const hide = input.type === "password";
        input.type = hide ? "text" : "password";
        rev.textContent = hide ? "Hide" : "Show";
        rev.setAttribute("aria-label", hide ? "Hide password" : "Show password");
      }
    });
  }

  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function playEnterAnimation(form) {
    if (!form) return;
    replay(form, "enter");
    const root = document.getElementById("auth-root");
    if (root) replay(root, "turn");
    var i = 0;
    [].forEach.call(form.children, function (el) { el.style.setProperty("--i", i++); });
  }

  function showErr(formId, msg, focusEl) {
    const err = document.getElementById("auth-err-" + U.esc(formId));
    if (err) { err.textContent = msg; err.hidden = false; }
    const cta = document.querySelector("#auth-" + U.esc(formId) + "-form .cta");
    if (cta) replay(cta, "shake");
    if (focusEl) focusEl.focus();
  }

  function wireLoginForm(root) {
    const form = root.querySelector("#auth-login-form");
    if (!form) return;
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      const err = document.getElementById("auth-err-login");
      if (err) err.hidden = true;
      const fields = [].slice.call(form.querySelectorAll(".field"));
      fields.forEach(function (f) { f.removeAttribute("aria-invalid"); });
      const empty = fields.filter(function (f) { return !f.value.trim(); });
      if (empty.length) {
        empty.forEach(function (f) { f.setAttribute("aria-invalid", "true"); });
        return showErr("login", "Fill in every field.", empty[0]);
      }
      const email = form.querySelector("#auth-l-email").value.trim();
      const pw = form.querySelector("#auth-l-pw").value;
      const btn = form.querySelector(".cta");
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Signing in";
      document.getElementById("auth-root").classList.add("loading");
      try {
        const user = await store.login(email, pw);
        UI.toast("Signed in as " + user.name + ".");
        if (COOP.app) COOP.app.navigate(user.role === "member" ? "/portal" : "/dashboard");
      } catch (errObj) {
        showErr("login", errObj.message || "Sign in failed.");
        btn.disabled = false;
        btn.textContent = label;
        document.getElementById("auth-root").classList.remove("loading");
      }
    });
  }

  function wireCreateForm(root) {
    const form = root.querySelector("#auth-create-form");
    if (!form) return;
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      const err = document.getElementById("auth-err-create");
      if (err) err.hidden = true;
      const fields = [].slice.call(form.querySelectorAll(".field"));
      fields.forEach(function (f) { f.removeAttribute("aria-invalid"); });
      const empty = fields.filter(function (f) { return !f.value.trim(); });
      if (empty.length) {
        empty.forEach(function (f) { f.setAttribute("aria-invalid", "true"); });
        return showErr("create", "Fill in every field.", empty[0]);
      }
      const pw = form.querySelector("#auth-c-pw").value;
      const confirm = form.querySelector("#auth-c-confirm").value;
      if (pw !== confirm) {
        form.querySelector("#auth-c-confirm").setAttribute("aria-invalid", "true");
        return showErr("create", "Passwords don't match.", form.querySelector("#auth-c-confirm"));
      }
      const data = UI.formData(form);
      const btn = form.querySelector(".cta");
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Creating account";
      document.getElementById("auth-root").classList.add("loading");
      try {
         await store.register(data);
         UI.toast("Account request sent. Check your email to verify your account; an administrator will review it.", "success");
        if (COOP.app) COOP.app.navigate("/login");
      } catch (errObj) {
        showErr("create", errObj.message || "Could not create account.");
        btn.disabled = false;
        btn.textContent = label;
        document.getElementById("auth-root").classList.remove("loading");
      }
    });
  }
})();
