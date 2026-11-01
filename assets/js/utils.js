(function () {
  "use strict";
  const COOP = (window.COOP = window.COOP || {});
  const U = (COOP.utils = {});

  U.uid = function (prefix) {
    const p = prefix ? String(prefix) + "_" : "id_";
    return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  U.esc = function (value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  U.icon = function (name, cls) {
    const iconName = name || "info";
    return '<svg class="icon ' + (cls || "") + '" aria-hidden="true"><use href="#i-' + iconName + '"></use></svg>';
  };

  U.toNumber = function (value) {
    if (typeof value === "number") return isFinite(value) ? value : 0;
    if (value === null || value === undefined) return 0;
    const cleaned = String(value).replace(/[^0-9.\-]/g, "");
    const n = parseFloat(cleaned);
    return isFinite(n) ? n : 0;
  };

  U.round2 = function (value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  };

  U.sum = function (arr, fn) {
    return (arr || []).reduce(function (total, item, index) {
      const value = fn ? fn(item, index) : item;
      return total + U.toNumber(value);
    }, 0);
  };

  U.money = function (value, options) {
    const opts = options || {};
    const settings = (COOP.store && COOP.store.get().settings) || {};
    const locale = opts.locale || settings.locale || "en-PH";
    const currency = opts.currency || settings.currency || "PHP";
    const n = U.toNumber(value);
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(n);
    } catch (e) {
      return currency + " " + n.toFixed(2);
    }
  };

  U.number = function (value, digits) {
    const n = U.toNumber(value);
    const d = typeof digits === "number" ? digits : 2;
    const settings = (COOP.store && COOP.store.get().settings) || {};
    return new Intl.NumberFormat(settings.locale || "en-PH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: d
    }).format(n);
  };

  U.percent = function (value, digits) {
    const n = U.toNumber(value);
    const settings = (COOP.store && COOP.store.get().settings) || {};
    return new Intl.NumberFormat(settings.locale || "en-PH", {
      style: "percent",
      minimumFractionDigits: 0,
      maximumFractionDigits: typeof digits === "number" ? digits : 2
    }).format(n);
  };

  U.isoDate = function (date) {
    if (!date) return "";
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  };

  U.today = function () {
    return U.isoDate(new Date());
  };

  U.parseDate = function (iso) {
    if (!iso) return null;
    if (iso instanceof Date) return new Date(iso.getTime());
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };

  U.utcDay = function (date) {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  };

  U.daysBetween = function (from, to) {
    const a = U.parseDate(from);
    const b = U.parseDate(to);
    if (!a || !b) return 0;
    return Math.round((U.utcDay(b) - U.utcDay(a)) / 86400000);
  };

  U.addDays = function (iso, days) {
    const d = U.parseDate(iso);
    if (!d) return "";
    d.setDate(d.getDate() + Number(days || 0));
    return U.isoDate(d);
  };

  U.monthKey = function (date) {
    const d = date ? (date instanceof Date ? date : U.parseDate(date)) : new Date();
    if (!d) return "";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  };

  U.monthOf = function (periodKey) {
    const m = String(periodKey || "").match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    return { year: Number(m[1]), month: Number(m[2]) - 1, key: m[0] };
  };

  U.endOfMonth = function (periodKey) {
    const m = U.monthOf(periodKey);
    if (!m) return "";
    const d = new Date(m.year, m.month + 1, 0);
    return U.isoDate(d);
  };

  U.formatDate = function (iso, fallback) {
    const d = U.parseDate(iso);
    if (!d) return fallback === undefined ? "—" : fallback;
    try {
      return new Intl.DateTimeFormat("en-PH", {
        year: "numeric", month: "short", day: "numeric"
      }).format(d);
    } catch (e) {
      return U.isoDate(d);
    }
  };

  U.formatMonth = function (periodKey) {
    const m = U.monthOf(periodKey);
    if (!m) return "—";
    const d = new Date(m.year, m.month, 1);
    return new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "long" }).format(d);
  };

  U.formatDateTime = function (iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    try {
      return new Intl.DateTimeFormat("en-PH", {
        year: "numeric", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit"
      }).format(d);
    } catch (e) {
      return d.toLocaleString();
    }
  };

  U.formatRelative = function (iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const diff = Date.now() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return minutes + "m ago";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + "h ago";
    const days = Math.floor(hours / 24);
    if (days < 7) return days + "d ago";
    return U.formatDate(U.isoDate(d));
  };

  U.initials = function (name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  U.clamp = function (n, min, max) {
    return Math.min(Math.max(n, min), max);
  };

  U.groupBy = function (arr, fn) {
    return (arr || []).reduce(function (groups, item) {
      const key = typeof fn === "function" ? fn(item) : item[fn];
      (groups[key] = groups[key] || []).push(item);
      return groups;
    }, {});
  };

  U.sortBy = function (arr, fn, direction) {
    const dir = direction === "desc" ? -1 : 1;
    return (arr || []).slice().sort(function (a, b) {
      const av = typeof fn === "function" ? fn(a) : a[fn];
      const bv = typeof fn === "function" ? fn(b) : b[fn];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * dir;
      }
      return (av > bv ? 1 : -1) * dir;
    });
  };

  U.unique = function (arr) {
    return Array.from(new Set(arr || []));
  };

  U.clone = function (value) {
    if (value === null || value === undefined) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
  };

  U.fnv1a = function (str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return ("00000000" + hash.toString(16)).slice(-8);
  };

  const PASSWORD_SCHEME = "pbkdf2-sha256";
  const PASSWORD_ITERATIONS = 150000;
  const FALLBACK_ITERATIONS = 50000;
  const LEGACY_FNV_ITERATIONS = 2000;

  function bytesToHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  function fallbackHash(password, salt, iterations) {
    const input = String(salt || "") + ":" + String(password || "");
    let out = U.fnv1a(input);
    for (let i = 0; i < iterations; i++) out = U.fnv1a(out + input);
    return out;
  }

  async function derivePbkdf2(password, salt, iterations) {
    const encoder = new TextEncoder();
    const key = await window.crypto.subtle.importKey(
      "raw", encoder.encode(String(password || "")), { name: "PBKDF2" }, false, ["deriveBits"]
    );
    const bits = await window.crypto.subtle.deriveBits({
      name: "PBKDF2",
      salt: encoder.encode(String(salt || "")),
      iterations: iterations,
      hash: "SHA-256"
    }, key, 256);
    return bytesToHex(bits);
  }

  async function deriveLegacySha256(password, salt) {
    try {
      const input = String(salt || "") + ":" + String(password || "");
      const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
      return bytesToHex(digest);
    } catch (e) {
      return "";
    }
  }

  function hashesEqual(a, b) {
    const left = String(a || "");
    const right = String(b || "");
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
    return diff === 0;
  }

  U.hashPassword = async function (password, salt) {
    try {
      if (window.crypto && window.crypto.subtle &&
          window.crypto.subtle.importKey && window.crypto.subtle.deriveBits) {
        const derived = await derivePbkdf2(password, salt, PASSWORD_ITERATIONS);
        return PASSWORD_SCHEME + "$" + PASSWORD_ITERATIONS + "$" + derived;
      }
    } catch (e) {
      /* fall through to the local fallback */
    }
    return "fnv1a$" + FALLBACK_ITERATIONS + "$" + fallbackHash(password, salt, FALLBACK_ITERATIONS);
  };

  U.verifyPassword = async function (password, salt, stored) {
    const text = String(stored || "");
    const parts = text.split("$");
    if (parts.length === 3 && parts[0] === PASSWORD_SCHEME) {
      const iterations = parseInt(parts[1], 10);
      if (!(iterations >= 10000 && iterations <= 1000000)) return false;
      try {
        return hashesEqual(await derivePbkdf2(password, salt, iterations), parts[2]);
      } catch (e) {
        return false;
      }
    }
    if (parts.length === 3 && parts[0] === "fnv1a") {
      const iterations = parseInt(parts[1], 10);
      if (!(iterations >= 1 && iterations <= 500000)) return false;
      return hashesEqual(fallbackHash(password, salt, iterations), parts[2]);
    }
    if (/^[0-9a-f]{64}$/.test(text)) {
      return hashesEqual(await deriveLegacySha256(password, salt), text);
    }
    if (/^[0-9a-f]{8}$/.test(text)) {
      return hashesEqual(fallbackHash(password, salt, LEGACY_FNV_ITERATIONS), text);
    }
    return false;
  };

  U.passwordNeedsRehash = function (stored) {
    const text = String(stored || "");
    return !/^(pbkdf2-sha256|fnv1a)\$\d+\$[0-9a-f]+$/.test(text);
  };

  U.toCSV = function (rows) {
    return rows.map(function (row) {
      return row.map(function (cell) {
        let value = cell === null || cell === undefined ? "" : String(cell);
        if (typeof cell === "string" && /^\s*[=+\-@]/.test(value)) value = "'" + value;
        if (/[",\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
        return value;
      }).join(",");
    }).join("\r\n");
  };

  U.downloadFile = function (filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  };

  U.downloadJSON = function (filename, data) {
    U.downloadFile(filename, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
  };

  U.readFileAsText = function (file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("Unable to read file.")); };
      reader.readAsText(file);
    });
  };

  U.plural = function (count, singular, plural) {
    return Number(count) === 1 ? singular : (plural || singular + "s");
  };

  U.titleCase = function (value) {
    return String(value || "").replace(/\w\S*/g, function (text) {
      return text.charAt(0).toUpperCase() + text.substr(1).toLowerCase();
    });
  };

  U.sortByKey = function (data, key, dir) {
    if (!Array.isArray(data)) return data;
    const d = dir === "desc" ? -1 : 1;
    const parts = String(key).split(".");
    function getVal(obj, p) {
      var cur = obj;
      for (var i = 0; i < p.length; i++) {
        if (cur == null || typeof cur !== "object") return null;
        cur = cur[p[i]];
      }
      return cur;
    }
    function numVal(v) {
      if (v == null || v === "") return null;
      var n = Number(v);
      return isNaN(n) ? null : n;
    }
    return data.slice().sort(function (a, b) {
      const av = getVal(a, parts);
      const bv = getVal(b, parts);
      if (av == null && bv == null) return 0;
      if (av == null) return d;
      if (bv == null) return -d;
      var na = numVal(av);
      var nb = numVal(bv);
      if (na != null && nb != null) {
        if (na < nb) return -d;
        if (na > nb) return d;
        return 0;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return -d;
      if (as > bs) return d;
      return 0;
    });
  };

  U.tableState = function (key) {
    var stored = window.sessionStorage.getItem("coop_table_" + key);
    if (stored) {
      try { return JSON.parse(stored); } catch (e) { /* ignore */ }
    }
    return { sortKey: null, sortDir: "asc", filter: "" };
  };

  U.tableSave = function (key, state) {
    try { window.sessionStorage.setItem("coop_table_" + key, JSON.stringify(state)); } catch (e) { /* ignore */ }
  };
})();
