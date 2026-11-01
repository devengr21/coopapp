(async function () {
  "use strict";
  const COOP = (window.COOP = window.COOP || {});
  const U = COOP.utils;
  const D = COOP.domain;

  const SCHEMA_VERSION = 1;
  const SESSION_HOURS = 12;
  const APP_NAME = "COOP Manager";
  const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
  const MAX_RECORDS = 20000;
  const SESSION_KEY = "coop_manager_session_v1";

  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCKOUT_MS = 15 * 60 * 1000;
  const LOGIN_ATTEMPT_KEY = "coop_login_attempts_v1";

  let firebaseApp = null;
  let firebaseAuth = null;
  let firebaseReady = false;

  let firestoreDb = null;
  let firestoreReady = false;

  const FIRESTORE_COLLECTION = "coops";
  const FIRESTORE_DOC_ID = "default";

  function initFirebase() {
    if (firebaseReady) return firebaseAuth;
    if (!window.firebase || !COOP.firebaseConfig) return null;
    try {
      firebaseApp = window.firebase.initializeApp(COOP.firebaseConfig);
      firebaseAuth = window.firebase.auth();
      firebaseReady = true;
    } catch (e) {
      try {
        firebaseApp = window.firebase.app();
        firebaseAuth = window.firebase.auth();
        firebaseReady = true;
      } catch (e2) {
        console.error("Firebase init failed:", e);
        return null;
      }
    }
    return firebaseAuth;
  }

  function initFirestore() {
    if (firestoreReady) return firestoreDb;
    if (!window.firebase || !COOP.firebaseConfig) {
      console.warn("Firestore not initialized: firebase=", !!window.firebase, "config=", !!COOP.firebaseConfig);
      return null;
    }
    try {
      let app;
      try {
        app = window.firebase.app();
      } catch (e) {
        app = window.firebase.initializeApp(COOP.firebaseConfig);
      }
      firebaseApp = app;
      if (!firebaseReady) {
        firebaseAuth = window.firebase.auth();
        firebaseReady = true;
      }
      if (typeof window.firebase.firestore !== "function") {
        console.warn("Firestore SDK is not loaded; running in local-only mode.");
        return null;
      }
      firestoreDb = window.firebase.firestore(app);
      firestoreReady = true;
      console.log("Firestore initialized");
    } catch (e) {
      console.error("Firestore init failed:", e);
      return null;
    }
    return firestoreDb;
  }

  const PERMISSIONS = {
    admin: ["*"],
    treasurer: [
      "dashboard.view",
      "members.view", "members.manage",
      "contributions.view", "contributions.manage",
      "loans.view", "loans.manage",
      "payments.view", "payments.manage",
      "approvals.view",
      "reports.view",
      "cash.view",
      "audit.view"
    ],
    president: [
      "dashboard.view",
      "members.view",
      "contributions.view",
      "loans.view",
      "payments.view",
      "approvals.view", "approvals.manage",
      "reports.view",
      "audit.view"
    ],
    member: ["portal.view"]
  };

  const DATA_LISTS = [
    "users", "members", "contributions", "loans", "payments",
    "approvals", "cashAdjustments", "audit", "pendingUsers", "loanRequests"
  ];

let db = null;
let memorySession = null;
let initialized = false;
let isLoading = true;
const listeners = [];

  function nowISO() {
    return new Date().toISOString();
  }

  function readLoginAttempts() {
    try {
      const raw = window.localStorage.getItem(LOGIN_ATTEMPT_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (e) { return {}; }
  }

  function writeLoginAttempts(map) {
    try { window.localStorage.setItem(LOGIN_ATTEMPT_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
  }

  function recordFailedLogin(clean) {
    const attempts = readLoginAttempts();
    const rec = attempts[clean] || { count: 0, lockedUntil: 0 };
    rec.count += 1;
    if (rec.count >= MAX_LOGIN_ATTEMPTS) rec.lockedUntil = Date.now() + LOCKOUT_MS;
    attempts[clean] = rec;
    writeLoginAttempts(attempts);
    return rec;
  }

  function clearLoginAttempts(clean) {
    const attempts = readLoginAttempts();
    delete attempts[clean];
    writeLoginAttempts(attempts);
  }

  function defaultDB() {
    const now = nowISO();
    return {
      meta: {
        version: SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now
      },
      setupRequired: false,
      settings: D.defaultSettings(),
      users: [
        {
          id: "usr_admin",
          name: "Administrator",
          username: "admin",
          email: "admin@coop.local",
          firebaseUid: "",
          role: "admin",
          memberId: "",
          passwordHash: "",
          salt: "",
          active: true,
          createdAt: now,
          lastLoginAt: "",
          passwordChangedAt: ""
        }
      ],
      members: [],
      contributions: [],
      loans: [],
      payments: [],
      approvals: [],
      cashAdjustments: [],
      audit: [],
      pendingUsers: [],
      loanRequests: [],
      paymentRequests: [],
      contributionRequests: []
};
  }

  function cleanText(value, max) {
    if (value === null || value === undefined) return "";
    return String(value).slice(0, max || 1000);
  }

  function cleanId(value) {
    return cleanText(value, 120).trim();
  }

  function cleanNumber(value, fallback) {
    if (value === null || value === undefined || value === "") return fallback;
    const n = U.toNumber(value);
    return isFinite(n) ? n : fallback;
  }

  function cleanNonNegative(value, fallback) {
    return U.round2(Math.max(0, cleanNumber(value, fallback || 0)));
  }

  function cleanDate(value) {
    return U.isoDate(cleanText(value, 40));
  }

  function cleanBoolean(value) {
    return value === true;
  }

  function cleanList(raw, mapper) {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, MAX_RECORDS).map(mapper).filter(Boolean);
  }

  function normalizeSettings(raw) {
    const base = D.defaultSettings();
    const data = raw && typeof raw === "object" ? raw : {};
    const currency = cleanText(data.currency, 3).toUpperCase();
    const locale = cleanText(data.locale, 20);
    return {
      orgName: cleanText(data.orgName, 80).trim() || base.orgName,
      orgAddress: cleanText(data.orgAddress, 500),
      orgContact: cleanText(data.orgContact, 300),
      currency: /^[A-Z]{3}$/.test(currency) ? currency : base.currency,
      locale: /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale) ? locale : base.locale,
      fiscalYear: U.clamp(Math.round(cleanNumber(data.fiscalYear, base.fiscalYear)) || base.fiscalYear, 1900, 2200),
      monthlyContribution: cleanNonNegative(data.monthlyContribution, base.monthlyContribution),
      latePenalty: cleanNonNegative(data.latePenalty, base.latePenalty),
      latePenaltyGraceDays: U.clamp(Math.round(cleanNumber(data.latePenaltyGraceDays, base.latePenaltyGraceDays)), 0, 60),
      interestRate: U.clamp(cleanNumber(data.interestRate, base.interestRate), 0, 100),
      maxLoanAmount: cleanNonNegative(data.maxLoanAmount, base.maxLoanAmount),
      openingCash: U.round2(cleanNumber(data.openingCash, base.openingCash)),
      profitShareBasis: data.profitShareBasis === "contributions" ? "contributions" : "shares",
      requireOverLimitApproval: data.requireOverLimitApproval !== false,
      theme: data.theme === "dark" ? "dark" : "light"
    };
  }

  function normalizeUser(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = cleanId(raw.id);
    if (!id) return null;
    return {
      id: id,
      name: cleanText(raw.name, 120),
      username: cleanText(raw.username, 64).trim().toLowerCase(),
      email: cleanText(raw.email, 120).trim().toLowerCase(),
      firebaseUid: cleanText(raw.firebaseUid, 128),
      role: D.ROLES.indexOf(raw.role) >= 0 ? raw.role : "member",
      memberId: cleanId(raw.memberId),
      passwordHash: cleanText(raw.passwordHash, 256),
      salt: cleanText(raw.salt, 128),
      active: raw.active !== false,
      status: ["pending", "inactive", "active"].indexOf(raw.status) >= 0 ? raw.status : (raw.active === false ? "inactive" : "active"),
      createdAt: cleanText(raw.createdAt, 60),
      lastLoginAt: cleanText(raw.lastLoginAt, 60),
      passwordChangedAt: cleanText(raw.passwordChangedAt, 60),
      requestedAt: cleanText(raw.requestedAt, 60)
    };
  }

  function normalizePendingUser(raw) {
    const pending = normalizeUser(raw);
    if (!pending) return null;
    if (!pending.username) {
      const local = pending.email.split("@")[0].replace(/[^a-z0-9._-]/gi, "").toLowerCase();
      pending.username = local || "user" + U.fnv1a(pending.id);
    }
    pending.status = pending.status === "approved" || pending.status === "rejected" ? pending.status : "pending";
    return pending;
  }

  function normalizeMember(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = cleanId(raw.id);
    if (!id) return null;
    const monthly = raw.monthlyContribution === null || raw.monthlyContribution === undefined || raw.monthlyContribution === ""
      ? null : cleanNonNegative(raw.monthlyContribution);
    return {
      id: id,
      memberNo: cleanText(raw.memberNo, 40),
      firstName: cleanText(raw.firstName, 80),
      middleName: cleanText(raw.middleName, 80),
      lastName: cleanText(raw.lastName, 80),
      address: cleanText(raw.address, 500),
      contact: cleanText(raw.contact, 200),
      email: cleanText(raw.email, 200),
      joinDate: cleanDate(raw.joinDate) || U.today(),
      shares: cleanNonNegative(raw.shares),
      monthlyContribution: monthly,
      status: raw.status === "inactive" ? "inactive" : "active",
      notes: cleanText(raw.notes, 5000),
      createdAt: cleanText(raw.createdAt, 60),
      updatedAt: cleanText(raw.updatedAt, 60)
    };
  }

  function normalizeContribution(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = cleanId(raw.id);
    if (!id) return null;
    const period = cleanText(raw.period, 7);
    return {
      id: id,
      memberId: cleanId(raw.memberId),
      period: /^\d{4}-\d{2}$/.test(period) ? period : "",
      expected: raw.expected === null || raw.expected === undefined || raw.expected === ""
        ? null : cleanNonNegative(raw.expected),
      amount: cleanNonNegative(raw.amount),
      datePaid: cleanDate(raw.datePaid),
      status: raw.status === "waived" ? "waived" : "posted",
      method: cleanText(raw.method, 80) || "Cash",
      reference: cleanText(raw.reference, 200),
      notes: cleanText(raw.notes, 5000),
      voided: cleanBoolean(raw.voided),
      voidedAt: cleanText(raw.voidedAt, 60),
      voidedBy: cleanId(raw.voidedBy),
      voidReason: cleanText(raw.voidReason, 1000),
      createdAt: cleanText(raw.createdAt, 60),
      updatedAt: cleanText(raw.updatedAt, 60)
    };
  }

  function normalizeLoan(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = cleanId(raw.id);
    if (!id) return null;
    const status = ["pending", "active", "paid", "rejected", "cancelled"].indexOf(raw.status) >= 0
      ? raw.status : "active";
    return {
      id: id,
      loanNo: cleanText(raw.loanNo, 40),
      borrowerType: raw.borrowerType === "non_member" ? "non_member" : "member",
      memberId: cleanId(raw.memberId),
      borrowerName: cleanText(raw.borrowerName, 120),
      careOfMemberId: cleanId(raw.careOfMemberId),
      principal: cleanNonNegative(raw.principal),
      interestRate: U.clamp(cleanNumber(raw.interestRate, D.defaultSettings().interestRate), 0, 100),
      startDate: cleanDate(raw.startDate) || U.today(),
      purpose: cleanText(raw.purpose, 500),
      collateral: cleanText(raw.collateral, 500),
      notes: cleanText(raw.notes, 5000),
      disburseMethod: cleanText(raw.disburseMethod, 40),
      disburseDetail: cleanText(raw.disburseDetail, 300),
      status: status,
      approvalId: cleanId(raw.approvalId),
      requestedBy: cleanId(raw.requestedBy),
      approvedBy: cleanId(raw.approvedBy),
      approvedAt: cleanText(raw.approvedAt, 60),
      releasedAt: cleanDate(raw.releasedAt),
      paidAt: cleanDate(raw.paidAt),
      rejectedAt: cleanText(raw.rejectedAt, 60),
      rejectionReason: cleanText(raw.rejectionReason, 1000),
      cancelledAt: cleanText(raw.cancelledAt, 60),
      cancelReason: cleanText(raw.cancelReason, 1000),
      createdAt: cleanText(raw.createdAt, 60),
      updatedAt: cleanText(raw.updatedAt, 60)
    };
  }

  function normalizePayment(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = cleanId(raw.id);
    if (!id) return null;
    return {
      id: id,
      receiptNo: cleanText(raw.receiptNo, 40),
      loanId: cleanId(raw.loanId),
      borrowerName: cleanText(raw.borrowerName, 120),
      date: cleanDate(raw.date),
      amount: cleanNonNegative(raw.amount),
      interestPortion: cleanNonNegative(raw.interestPortion),
      principalPortion: cleanNonNegative(raw.principalPortion),
      credit: cleanNonNegative(raw.credit),
      method: cleanText(raw.method, 80) || "Cash",
      reference: cleanText(raw.reference, 200),
      notes: cleanText(raw.notes, 5000),
      voided: cleanBoolean(raw.voided),
      voidedAt: cleanText(raw.voidedAt, 60),
      voidedBy: cleanId(raw.voidedBy),
      voidReason: cleanText(raw.voidReason, 1000),
      checkedAt: cleanDate(raw.checkedAt),
      createdBy: cleanId(raw.createdBy),
      createdByName: cleanText(raw.createdByName, 120),
      createdAt: cleanText(raw.createdAt, 60),
      updatedAt: cleanText(raw.updatedAt, 60)
    };
  }

  function normalizeApproval(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = cleanId(raw.id);
    if (!id) return null;
    const status = ["pending", "approved", "rejected", "cancelled"].indexOf(raw.status) >= 0
      ? raw.status : "pending";
    return {
      id: id,
      type: cleanText(raw.type, 80) || "over_limit_loan",
      status: status,
      loanId: cleanId(raw.loanId),
      amount: cleanNonNegative(raw.amount),
      reason: cleanText(raw.reason, 1000),
      requestedBy: cleanId(raw.requestedBy),
      requestedByName: cleanText(raw.requestedByName, 120),
      requestedAt: cleanText(raw.requestedAt, 60),
      recommendedBy: cleanId(raw.recommendedBy),
      recommendedByName: cleanText(raw.recommendedByName, 120),
      recommendedAt: cleanText(raw.recommendedAt, 60),
      recommendedNotes: cleanText(raw.recommendedNotes, 1000),
      decidedBy: cleanId(raw.decidedBy),
      decidedByName: cleanText(raw.decidedByName, 120),
      decidedAt: cleanText(raw.decidedAt, 60),
      decisionNotes: cleanText(raw.decisionNotes, 1000),
      createdAt: cleanText(raw.createdAt, 60),
      updatedAt: cleanText(raw.updatedAt, 60)
    };
  }

  function normalizeCash(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = cleanId(raw.id);
    if (!id) return null;
    return {
      id: id,
      direction: raw.direction === "out" ? "out" : "in",
      category: cleanText(raw.category, 80) || "Adjustment",
      amount: cleanNonNegative(raw.amount),
      date: cleanDate(raw.date),
      description: cleanText(raw.description, 1000),
      reference: cleanText(raw.reference, 200),
      voided: cleanBoolean(raw.voided),
      voidedAt: cleanText(raw.voidedAt, 60),
      voidedBy: cleanId(raw.voidedBy),
      voidReason: cleanText(raw.voidReason, 1000),
      createdBy: cleanId(raw.createdBy),
      createdAt: cleanText(raw.createdAt, 60),
      updatedAt: cleanText(raw.updatedAt, 60)
    };
  }

  function normalizeAudit(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: cleanId(raw.id) || U.uid("aud"),
      at: cleanText(raw.at, 60),
      userId: cleanId(raw.userId),
      userName: cleanText(raw.userName, 120),
      userRole: cleanText(raw.userRole, 40),
      action: cleanText(raw.action, 80) || "update",
      entity: cleanText(raw.entity, 80),
      entityId: cleanId(raw.entityId),
      details: cleanText(raw.details, 2000)
    };
  }

  function normalizeLoanRequest(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = cleanId(raw.id);
    if (!id) return null;
    return {
      id: id,
      requestedById: cleanId(raw.requestedById),
      requestedByName: cleanText(raw.requestedByName, 120),
      requestedByUsername: cleanText(raw.requestedByUsername, 80),
      linkedMemberId: cleanId(raw.linkedMemberId),
      borrowerType: raw.borrowerType === "non_member" ? "non_member" : "member",
      borrowerName: cleanText(raw.borrowerName, 120),
      principal: cleanNonNegative(raw.principal),
      purpose: cleanText(raw.purpose, 1000),
      notes: cleanText(raw.notes, 500),
      disburseMethod: cleanText(raw.disburseMethod, 40),
      disburseDetail: cleanText(raw.disburseDetail, 300),
      status: raw.status === "approved" || raw.status === "rejected" ? raw.status : "pending",
      decidedBy: cleanId(raw.decidedBy),
      decidedByName: cleanText(raw.decidedByName, 120),
      decidedAt: cleanText(raw.decidedAt, 60),
      decisionNotes: cleanText(raw.decisionNotes, 1000),
      loanId: cleanId(raw.loanId),
      recommendedBy: cleanId(raw.recommendedBy),
      recommendedByName: cleanText(raw.recommendedByName, 120),
      recommendedAt: cleanText(raw.recommendedAt, 60),
      recommendedNotes: cleanText(raw.recommendedNotes, 1000),
      createdAt: cleanText(raw.createdAt, 60),
      updatedAt: cleanText(raw.updatedAt, 60)
    };
  }

  function normalizePaymentRequest(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = cleanId(raw.id);
    if (!id) return null;
    return {
      id: id,
      loanId: cleanId(raw.loanId),
      borrowerName: cleanText(raw.borrowerName, 120),
      amount: cleanNonNegative(raw.amount),
      method: cleanText(raw.method, 80) || "Cash",
      reference: cleanText(raw.reference, 200),
      notes: cleanText(raw.notes, 1000),
      proofFile: cleanText(raw.proofFile, 200),
      proofFileName: cleanText(raw.proofFileName, 120),
      status: raw.status === "approved" || raw.status === "rejected" ? raw.status : "pending",
      reviewedBy: cleanId(raw.reviewedBy),
      reviewedByName: cleanText(raw.reviewedByName, 120),
      reviewedAt: cleanText(raw.reviewedAt, 60),
      reviewNotes: cleanText(raw.reviewNotes, 500),
      createdBy: cleanId(raw.createdBy),
      createdByName: cleanText(raw.createdByName, 120),
      createdAt: cleanText(raw.createdAt, 60),
      updatedAt: cleanText(raw.updatedAt, 60)
    };
  }

  function normalizeContributionRequest(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = cleanId(raw.id);
    if (!id) return null;
    return {
      id: id,
      memberId: cleanId(raw.memberId),
      period: cleanText(raw.period, 20),
      amount: cleanNonNegative(raw.amount),
      method: cleanText(raw.method, 80) || "Cash",
      reference: cleanText(raw.reference, 200),
      notes: cleanText(raw.notes, 1000),
      proofFile: cleanText(raw.proofFile, 200),
      proofFileName: cleanText(raw.proofFileName, 120),
      status: raw.status === "approved" || raw.status === "rejected" ? raw.status : "pending",
      reviewedBy: cleanId(raw.reviewedBy),
      reviewedByName: cleanText(raw.reviewedByName, 120),
      reviewedAt: cleanText(raw.reviewedAt, 60),
      reviewNotes: cleanText(raw.reviewNotes, 500),
      createdBy: cleanId(raw.createdBy),
      createdByName: cleanText(raw.createdByName, 120),
      createdAt: cleanText(raw.createdAt, 60),
      updatedAt: cleanText(raw.updatedAt, 60)
    };
  }

  function normalize(raw) {
    const base = defaultDB();
    const data = raw && typeof raw === "object" ? raw : {};
    const meta = data.meta && typeof data.meta === "object" ? data.meta : {};
    const users = cleanList(data.users, normalizeUser);
    if (!users.length) {
      users.push(U.clone(base.users[0]));
    }
    return {
      meta: {
        version: SCHEMA_VERSION,
        createdAt: cleanText(meta.createdAt, 60) || base.meta.createdAt,
        updatedAt: cleanText(meta.updatedAt, 60) || base.meta.updatedAt
      },
      setupRequired: false,
      settings: normalizeSettings(data.settings),
      users: users,
      members: cleanList(data.members, normalizeMember),
      contributions: cleanList(data.contributions, normalizeContribution),
      loans: cleanList(data.loans, normalizeLoan),
      payments: cleanList(data.payments, normalizePayment),
      approvals: cleanList(data.approvals, normalizeApproval),
      cashAdjustments: cleanList(data.cashAdjustments, normalizeCash),
      pendingUsers: cleanList(data.pendingUsers, normalizePendingUser),
      loanRequests: cleanList(data.loanRequests, normalizeLoanRequest),
      paymentRequests: cleanList(data.paymentRequests, normalizePaymentRequest),
      contributionRequests: cleanList(data.contributionRequests, normalizeContributionRequest),
      audit: cleanList(data.audit, normalizeAudit).slice(0, 2000)
    };
  }

  function cleanList(raw, mapper) {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, MAX_RECORDS).map(mapper).filter(Boolean);
  }

  function safeReviver(key, value) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") return undefined;
    return value;
  }

  function parseJSON(text, message) {
    try {
      return JSON.parse(text, safeReviver);
    } catch (e) {
      throw new Error(message || "The selected file is not valid JSON.");
    }
  }

  function validateBackupSource(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error("This does not look like a COOP backup file.");
    }
    if (!Array.isArray(source.users) || !Array.isArray(source.members)) {
      throw new Error("This does not look like a COOP backup file.");
    }
    DATA_LISTS.forEach(function (key) {
      if (source[key] === undefined || source[key] === null) return;
      if (!Array.isArray(source[key])) throw new Error("The backup has an invalid " + key + " section.");
      if (source[key].length > MAX_RECORDS) throw new Error("The backup contains too many " + key + " records.");
    });
    const seenIds = Object.create(null);
    DATA_LISTS.forEach(function (key) {
      (source[key] || []).forEach(function (row) {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          throw new Error("The backup has an invalid " + key + " record.");
        }
        const id = cleanId(row.id);
        if (!id) throw new Error("A " + key + " record is missing its identifier.");
        if (seenIds[id]) throw new Error("The backup contains duplicate record identifiers.");
        seenIds[id] = true;
      });
    });
    const usernames = Object.create(null);
    source.users.forEach(function (row) {
      const username = cleanText(row.username, 64).trim().toLowerCase();
      if (!username) return;
      if (usernames[username]) throw new Error("The backup contains duplicate usernames.");
      usernames[username] = true;
    });
  }

   function load() {
      if (db) return db;
      if (!initialized) {
        initialized = true;
      }
      initFirestore();
      db = defaultDB();
      return db;
   }

  let firestoreListener = null;

  async function syncWithFirestore() {
    const dbx = initFirestore();
    if (!dbx) return;
     try {
       const doc = await dbx.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID).get();
       console.log("syncWithFirestore doc.exists=", doc.exists);
        if (doc.exists) {
          const remote = doc.data();
          if (remote && remote.data) {
            db = normalize(remote.data);
            console.log("syncWithFirestore loaded remote data");
          }
        }
        emit("saved");
        setupFirestoreListener();
     } catch (e) {
       console.error("Firestore sync failed:", e.code, e.message);
     }
  }

  function setupFirestoreListener() {
    if (firestoreListener) return;
    const dbx = initFirestore();
    if (!dbx) return;
    try {
      firestoreListener = dbx.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID).onSnapshot(function (doc) {
        if (!doc.exists) return;
        const remote = doc.data();
        if (!remote || !remote.data) return;
        const remoteData = normalize(remote.data);
        const remoteUpdatedAt = remote.data.meta && remote.data.meta.updatedAt ? remote.data.meta.updatedAt : "";
        const localUpdatedAt = db && db.meta && db.meta.updatedAt ? db.meta.updatedAt : "";
        if (remoteUpdatedAt && remoteUpdatedAt > localUpdatedAt) {
          db = remoteData;
          emit("saved");
        }
      });
    } catch (e) {
      console.error("Firestore listener failed:", e.code, e.message);
    }
  }

  async function persist() {
    if (!db) return;
    db.meta.updatedAt = nowISO();
    const fs = initFirestore();
    if (fs) {
      try {
        await fs.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID).set({ data: db, updatedAt: db.meta.updatedAt });
      } catch (e) {
        console.warn("Firestore persist failed (continuing locally):", e);
      }
    }
  }

  function emit(reason) {
    listeners.slice().forEach(function (fn) {
      try { fn({ reason: reason, db: db }); } catch (err) { console.error(err); }
    });
  }

  function get() {
    return load();
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      const index = listeners.indexOf(fn);
      if (index >= 0) listeners.splice(index, 1);
    };
  }

  function readSession() {
    // First check sessionStorage (persists across page refreshes)
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw);
        if (session && session.userId) {
          const expiresAt = Date.parse(session.expiresAt);
          if (isFinite(expiresAt) && expiresAt > Date.now()) {
            return session;
          }
        }
      }
    } catch (e) { /* ignore */ }
    // Then check memory session
    if (memorySession) {
      const expiresAt = Date.parse(memorySession.expiresAt);
      if (isFinite(expiresAt) && expiresAt > Date.now()) {
        return memorySession;
      }
      memorySession = null;
    }
    // Then check Firebase Auth (for Firebase auth)
    const user = firebaseAuth && firebaseAuth.currentUser;
    if (user) {
      const data = get();
      const userInStore = data.users.find(function (u) { return u.email && u.email.toLowerCase() === String(user.email).toLowerCase(); });
      if (userInStore && userInStore.active !== false) {
        return {
          userId: userInStore.id,
          expiresAt: new Date(Date.now() + SESSION_HOURS * 3600000).toISOString()
        };
      }
    }
    return null;
  }

  function writeSession(session) {
    // Store session in memory and sessionStorage (persists across page refreshes)
    memorySession = session;
    try {
      if (session) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else window.sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
  }

  function currentUser() {
    const data = get();
    const session = readSession();
    if (!session || !session.userId) return null;
    const user = data.users.find(function (u) { return u.id === session.userId; });
    if (!user || user.active === false) {
      writeSession(null);
      return null;
    }
    return user;
  }

  function currentMember() {
    const user = currentUser();
    if (!user || !user.memberId) return null;
    return get().members.find(function (m) { return m.id === user.memberId; }) || null;
  }

  function can(permission) {
    const user = currentUser();
    if (!user) return false;
    if (user.role === "admin") return true;
    const list = PERMISSIONS[user.role] || [];
    return list.indexOf(permission) >= 0;
  }

  function auditEntry(action, entity, entityId, details) {
    const user = currentUser();
    return {
      id: U.uid("aud"),
      at: nowISO(),
      userId: user ? user.id : "",
      userName: user ? user.name : "System",
      userRole: user ? user.role : "system",
      action: action || "update",
      entity: entity || "",
      entityId: entityId || "",
      details: details || ""
    };
  }

  function addAudit(action, entity, entityId, details) {
    const data = get();
    data.audit.unshift(auditEntry(action, entity, entityId, details));
    if (data.audit.length > 2000) data.audit.length = 2000;
  }

  async function mutate(fn, meta) {
    const data = get();
    const result = fn(data);
    if (meta) data.audit.unshift(auditEntry(meta.action, meta.entity, meta.entityId, meta.details));
    if (data.audit.length > 2000) data.audit.length = 2000;
    await persist();
    D.clearFundsCache();
    return result;
  }

  async function setup(payload) {
    const data = get();
    const hasUsableAdmin = data.users.some(function (u) {
      return u.role === "admin" && u.active !== false && u.passwordHash && u.salt;
    });
    if (hasUsableAdmin) throw new Error("Setup has already been completed.");
    const name = String(payload.name || "").trim();
    const username = String(payload.username || "").trim().toLowerCase();
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");
    if (!name) throw new Error("Enter the administrator's full name.");
    if (name.length > 120) throw new Error("The administrator's name is too long.");
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      throw new Error("Username must be 3-32 characters using letters, numbers, dots, dashes, or underscores.");
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid email address.");
    }
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    if (password.length > 128) throw new Error("Password must be 128 characters or fewer.");
    if (password !== String(payload.confirmPassword || "")) throw new Error("Passwords do not match.");

    const auth = initFirebase();
    let firebaseUid = "";
    let passwordHash = "";
    let salt = "";

    if (auth) {
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        firebaseUid = cred.user.uid;
      } catch (e) {
        throw new Error("Unable to create Firebase account: " + (e.message || e.code));
      }
    } else {
      salt = U.uid("salt");
      passwordHash = await U.hashPassword(password, salt);
    }

    const admin = {
      id: U.uid("usr"),
      name: name,
      username: username,
      email: email,
      firebaseUid: firebaseUid,
      role: "admin",
      memberId: "",
      passwordHash: passwordHash,
      salt: salt,
      active: true,
      createdAt: nowISO(),
      lastLoginAt: ""
    };
    return finishSetup(data, admin, payload, undefined);
  }

  function finishSetup(data, admin, payload, previousOrgName) {
    const auditId = U.uid("aud");
    data.users = data.users.filter(function (u) { return u.passwordHash || u.firebaseUid; });
    data.users.push(admin);
    data.setupRequired = false;
    if (payload.orgName) data.settings.orgName = String(payload.orgName).trim().slice(0, 80) || data.settings.orgName;
    data.audit.unshift({
      id: auditId,
      at: nowISO(),
      userId: admin.id,
      userName: admin.name,
      userRole: "admin",
      action: "setup",
      entity: "system",
      entityId: "",
      details: "Initial administrator account created."
    });
    writeSession({
      userId: admin.id,
      at: nowISO(),
      expiresAt: new Date(Date.now() + SESSION_HOURS * 3600000).toISOString()
    });
    try {
      persist();
    } catch (e) {
      data.users = data.users.filter(function (u) { return u.id !== admin.id; });
      data.setupRequired = true;
      if (previousOrgName !== undefined) data.settings.orgName = previousOrgName;
      data.audit = data.audit.filter(function (a) { return a.id !== auditId; });
      writeSession(null);
      throw e;
    }
    return admin;
  }

  async function login(email, password) {
    const clean = String(email || "").trim().toLowerCase();
    const provided = String(password || "");

    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      throw new Error("Enter a valid email address.");
    }

    const attempts = readLoginAttempts();
    const attempt = attempts[clean] || { count: 0, lockedUntil: 0 };
    if (attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
      const mins = Math.ceil((attempt.lockedUntil - Date.now()) / 60000);
      throw new Error("Too many failed sign-in attempts. Try again in " + mins + " minute" + (mins !== 1 ? "s" : "") + ".");
    }

    const data = get();
    const user = data.users.find(function (u) { return u.email && String(u.email).toLowerCase() === clean; });
    if (!user) { recordFailedLogin(clean); throw new Error("Invalid email or password."); }
    if (user.active === false) { recordFailedLogin(clean); throw new Error("This account is disabled."); }

    const auth = initFirebase();
    if (auth) {
      let firebaseOk = true;
      try {
        await auth.signInWithEmailAndPassword(clean, provided);
      } catch (e) {
        firebaseOk = false;
      }
      if (!firebaseOk) {
        if (user.passwordHash && user.salt) {
          const localValid = await U.verifyPassword(provided, user.salt, user.passwordHash);
          if (!localValid) { recordFailedLogin(clean); throw new Error("Invalid email or password."); }
        } else {
          recordFailedLogin(clean);
          throw new Error("Invalid email or password.");
        }
      }
      if (auth.currentUser && auth.currentUser.uid) {
        user.firebaseUid = auth.currentUser.uid;
      }
    } else {
      if (provided.length > 128) throw new Error("Invalid email or password.");
      const valid = await U.verifyPassword(provided, user.salt, user.passwordHash);
      if (!valid) { recordFailedLogin(clean); throw new Error("Invalid email or password."); }
      if (U.passwordNeedsRehash(user.passwordHash)) {
        const salt = U.uid("salt");
        user.salt = salt;
        user.passwordHash = await U.hashPassword(provided, salt);
        user.passwordChangedAt = nowISO();
      }
    }

    writeSession({
      userId: user.id,
      at: nowISO(),
      expiresAt: new Date(Date.now() + SESSION_HOURS * 3600000).toISOString()
    });
    user.lastLoginAt = nowISO();
    data.audit.unshift(auditEntry("login", "user", user.id, "Signed in."));
    clearLoginAttempts(clean);
    persist();
    return user;
  }

  async function register(payload) {
    const data = get();
    const name = String(payload.name || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const confirmPassword = String(payload.confirmPassword || "");
    if (!name) throw new Error("Enter your full name.");
    if (name.length > 120) throw new Error("The full name is too long.");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid email address.");
    }
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    if (password.length > 128) throw new Error("Password must be 128 characters or fewer.");
    if (password !== confirmPassword) throw new Error("Passwords do not match.");

    const duplicateUser = data.users.find(function (u) {
      return (u.email && u.email.toLowerCase() === email);
    });
    if (duplicateUser) throw new Error("That email is already in use.");

    const duplicatePending = data.pendingUsers.find(function (u) {
      return (u.email && u.email.toLowerCase() === email);
    });
    if (duplicatePending) throw new Error("A request with that email is already pending approval.");

    let username = email.split("@")[0].replace(/[^a-z0-9._-]/g, "").toLowerCase();
    if (username.length < 3) username = "user" + U.fnv1a(email + name);
    let suffix = 1;
    const baseUsername = username;
    while (data.users.some(function (u) { return u.username === username; }) ||
           data.pendingUsers.some(function (u) { return u.username === username; })) {
      suffix += 1;
      username = baseUsername + suffix;
    }

    const auth = initFirebase();
    let firebaseUid = "";
    let passwordHash = "";
    let salt = "";

    if (auth) {
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        firebaseUid = cred.user.uid;
        try { await cred.user.sendEmailVerification(); } catch (e) { /* verification email optional */ }
      } catch (e) {
        throw new Error("Unable to create Firebase account: " + (e.message || e.code));
      }
    } else {
      salt = U.uid("salt");
      passwordHash = await U.hashPassword(password, salt);
    }

    const pending = {
      id: U.uid("usr"),
      name: name,
      username: username,
      email: email,
      firebaseUid: firebaseUid,
      passwordHash: passwordHash,
      salt: salt,
      role: "member",
      memberId: "",
      active: false,
      status: "pending",
      createdAt: nowISO(),
      requestedAt: nowISO(),
      lastLoginAt: "",
      passwordChangedAt: ""
    };
    data.pendingUsers.unshift(pending);
    data.audit.unshift(auditEntry("register", "user", pending.id, "Requested new account: " + email));
    await persist();
    return pending;
  }

  async function approveUser(pendingId, memberId) {
    requirePermission("users.manage");
    return COOP.actions.approveUser(pendingId, memberId);
  }

  async function rejectUser(pendingId) {
    requirePermission("users.manage");
    return COOP.actions.rejectUser(pendingId);
  }

  function logout() {
    const user = currentUser();
    if (user) {
      const data = get();
      data.audit.unshift(auditEntry("logout", "user", user.id, "Signed out."));
      persist();
    }
    writeSession(null);
    if (firebaseAuth) {
      try { firebaseAuth.signOut(); } catch (e) { /* ignore */ }
    }
    emit("logout");
  }

  function exportData() {
    return {
      app: APP_NAME,
      exportedAt: nowISO(),
      schemaVersion: SCHEMA_VERSION,
      data: U.clone(get())
    };
  }

  function importData(payload) {
    let parsed;
    if (typeof payload === "string") {
      if (payload.length > MAX_BACKUP_BYTES) throw new Error("The backup file is too large.");
      parsed = parseJSON(payload, "The selected file is not valid JSON.");
    } else {
      try {
        const text = JSON.stringify(payload);
        if (!text) throw new Error("empty");
        if (text.length > MAX_BACKUP_BYTES) throw new Error("too large");
        parsed = parseJSON(text, "The selected backup is not valid.");
      } catch (e) {
        if (String(e && e.message) === "too large") throw new Error("The backup file is too large.");
        throw new Error("The selected backup is not valid.");
      }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("This does not look like a COOP backup file.");
    }
    if (parsed.app !== undefined && parsed.app !== APP_NAME) {
      throw new Error("This backup was not created by COOP Manager.");
    }
    if (parsed.schemaVersion !== undefined) {
      const version = Number(parsed.schemaVersion);
      if (!isFinite(version) || version < 0) throw new Error("The backup has an invalid schema version.");
      if (version > SCHEMA_VERSION) throw new Error("This backup was created by a newer version of COOP Manager.");
    }
    const source = parsed.data !== undefined ? parsed.data : parsed;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error("This does not look like a COOP backup file.");
    }
    validateBackupSource(source);

    const previousUser = currentUser();
    const previous = db;
    const next = normalize(source);
    next.pendingUsers = [];
    const activeAdmins = next.users.filter(function (u) {
      return u.role === "admin" && u.active !== false;
    });
    if (!activeAdmins.length) {
      throw new Error("The backup must contain at least one active administrator account.");
    }
    if (!activeAdmins.some(function (u) { return u.username && u.passwordHash && u.salt; })) {
      throw new Error("The backup does not contain a usable administrator sign-in.");
    }
    if (previousUser) {
      next.audit.unshift({
        id: U.uid("aud"),
        at: nowISO(),
        userId: previousUser.id,
        userName: previousUser.name,
        userRole: previousUser.role,
        action: "import",
        entity: "system",
        entityId: "",
        details: "Imported a backup file."
      });
      next.audit = next.audit.slice(0, 2000);
    }
    db = next;
    if (previousUser) {
      const restored = next.users.find(function (u) {
        return u.username === previousUser.username && u.active !== false;
      });
      if (restored) {
        writeSession({
          userId: restored.id,
          at: nowISO(),
          expiresAt: new Date(Date.now() + SESSION_HOURS * 3600000).toISOString()
        });
      } else {
        writeSession(null);
      }
    } else {
      writeSession(null);
    }
    try {
      persist();
    } catch (e) {
      db = previous;
      throw e;
    }
    return db;
  }

  async function resetAll() {
    db = defaultDB();
    writeSession(null);
    try {
      // No localStorage to clear - using Firebase
    } catch (e) { /* ignore */ }
    await persist();
    emit("reset");
  }

  function setTheme(theme) {
    const value = theme === "dark" ? "dark" : "light";
    const data = get();
    data.settings.theme = value;
    persist();
    return value;
  }

  function storageMode() {
    return "firebase";
  }

  COOP.store = {
    MAX_BACKUP_BYTES: MAX_BACKUP_BYTES,
    MAX_RECORDS: MAX_RECORDS,
    PERMISSIONS: PERMISSIONS,
    defaultDB: defaultDB,
    get: get,
    subscribe: subscribe,
    mutate: mutate,
    addAudit: addAudit,
    currentUser: currentUser,
    currentMember: currentMember,
    can: can,
    setup: setup,
    login: login,
    register: register,
    approveUser: approveUser,
    rejectUser: rejectUser,
    logout: logout,
    initFirebase: initFirebase,
    firebaseAuth: function () { return firebaseAuth; },
    exportData: exportData,
    importData: importData,
    resetAll: resetAll,
    setTheme: setTheme,
    storageMode: storageMode,
    isLoading: function () { return isLoading; },
    roleLabel: function (role) {
      return D.ROLE_LABELS[role] || U.titleCase(role || "");
    }
  };

  try {
      load();
    } catch (e) { /* ignore load errors */ }
    if (window.firebase && COOP.firebaseConfig) {
      try {
        initFirebase();
        firebaseAuth.onAuthStateChanged(function (firebaseUser) {
          if (firebaseUser) {
            const data = get();
            const user = data.users.find(function (u) { return u.email && u.email.toLowerCase() === String(firebaseUser.email).toLowerCase(); });
            if (user && user.active !== false) {
              if (!user.firebaseUid) user.firebaseUid = firebaseUser.uid;
              writeSession({
                userId: user.id,
                at: nowISO(),
                expiresAt: new Date(Date.now() + SESSION_HOURS * 3600000).toISOString()
              });
            }
          } else {
            const session = readSession();
            if (session) {
              const data = get();
              const user = data.users.find(function (u) { return u.id === session.userId; });
              if (user && user.firebaseUid) {
                writeSession(null);
                emit("logout");
              }
            }
          }
        });
      } catch (e) { /* ignore init errors */ }
      try {
        await syncWithFirestore();
      } catch (e) { /* ignore firestore sync errors */ }
    }
    isLoading = false;
    emit("ready");
})();
