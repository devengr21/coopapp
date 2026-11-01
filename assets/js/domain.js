(function () {
  "use strict";
  const COOP = (window.COOP = window.COOP || {});
  const U = COOP.utils;
  const D = (COOP.domain = {});

  D.ROLES = ["admin", "president", "treasurer", "member"];
  D.ROLE_LABELS = { admin: "Administrator", president: "President", treasurer: "Treasurer", member: "Member" };
  D.PAYMENT_METHODS = ["Cash", "Bank transfer", "GCash", "Maya", "Check", "Other"];

  D.defaultSettings = function () {
    const now = new Date();
    return {
      orgName: "PHSC Coop",
      orgAddress: "",
      orgContact: "",
      currency: "PHP",
      locale: "en-PH",
      fiscalYear: now.getFullYear(),
      monthlyContribution: 1000,
      latePenalty: 50,
      latePenaltyGraceDays: 5,
      interestRate: 5,
      maxLoanAmount: 0,
      openingCash: 0,
      profitShareBasis: "shares",
      requireOverLimitApproval: true,
      theme: "light"
    };
  };

  D.memberName = function (member) {
    if (!member) return "Unknown member";
    if (member.name) return member.name;
    return [member.firstName, member.middleName, member.lastName]
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || "Unnamed member";
  };

  D.memberLabel = function (member) {
    if (!member) return "Unknown member";
    return D.memberName(member) + (member.memberNo ? " (" + member.memberNo + ")" : "");
  };

  D.memberById = function (db, id) {
    return (db.members || []).find(function (m) { return m.id === id; }) || null;
  };

  D.borrowerName = function (loan, db) {
    if (!loan) return "Unknown borrower";
    if (loan.borrowerType === "member") {
      const member = D.memberById(db, loan.memberId);
      return member ? D.memberName(member) : (loan.borrowerName || "Unknown member");
    }
    return loan.borrowerName || "Non-member borrower";
  };

  D.careOfName = function (loan, db) {
    if (!loan || !loan.careOfMemberId) return "";
    const member = D.memberById(db, loan.careOfMemberId);
    return member ? D.memberName(member) : "";
  };

  D.monthlyContributionFor = function (member, settings) {
    if (!member) return 0;
    if (member.monthlyContribution !== null && member.monthlyContribution !== undefined && member.monthlyContribution !== "") {
      return U.toNumber(member.monthlyContribution);
    }
    return U.round2(U.toNumber(member.shares || 0) * (settings && settings.monthlyContribution || 0));
  };

  D.loanRate = function (loan, settings) {
    if (!loan) return 0;
    if (loan.interestRate !== null && loan.interestRate !== undefined && loan.interestRate !== "") {
      return U.toNumber(loan.interestRate);
    }
    return U.toNumber(settings && settings.interestRate);
  };

  D.loanLedger = function (loan, allPayments, asOf) {
    const principal = U.round2(U.toNumber(loan && loan.principal));
    const rate = U.toNumber(D.loanRate(loan, COOP.store ? COOP.store.get().settings : D.defaultSettings()));
    const startISO = loan && loan.startDate;
    const endISO = asOf || U.today();
    const start = U.parseDate(startISO);
    const end = U.parseDate(endISO) || new Date();
    const base = {
      loanId: loan && loan.id,
      principal: principal,
      interestRate: rate,
      startDate: startISO,
      asOf: endISO,
      rows: [],
      events: [],
      principalBalance: principal,
      interestBalance: 0,
      balance: principal,
      totalInterestAccrued: 0,
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
      totalApplied: 0,
      totalReceived: 0,
      creditGenerated: 0,
      lastPaymentDate: "",
      lastInterestDate: "",
      nextInterestDate: "",
      settlementReminder: "Settle before December each year",
      payoffDate: "",
      paymentCount: 0,
      interestPaid: 0,
      principalPaid: 0,
      progress: 0,
      overdue: false,
      overdueDays: 0,
      daysSinceLastPayment: 0,
      paid: principal <= 0.005,
      displayStatus: (loan && loan.status) || "active"
    };

    if (!loan) return base;
    if (!start || !["active", "paid"].includes(loan.status)) {
      base.displayStatus = loan.status === "pending" ? "pending" : (loan.status || "active");
      if (loan.status === "rejected") base.displayStatus = "rejected";
      if (loan.status === "cancelled") base.displayStatus = "cancelled";
      if (loan.status === "paid") base.paid = true;
      return base;
    }

    const payments = (allPayments || [])
      .filter(function (p) {
        return p.loanId === loan.id && !p.voided && p.date && U.daysBetween(startISO, p.date) >= 0;
      })
      .filter(function (p) { return U.daysBetween(p.date, endISO) >= 0; })
      .slice()
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
      });

    let pBal = principal;
    let iBal = 0;
    let totalAccrued = 0;
    let totalInterestPaid = 0;
    let totalPrincipalPaid = 0;
    let totalApplied = 0;
    let totalReceived = 0;
    let credit = 0;
    let lastPaymentDate = "";
    let lastInterestDate = "";
    let payoffDate = "";
    let paymentCount = 0;

    function interestDaysFor(dateISO) {
      if (!lastPaymentDate) return Math.max(30, U.daysBetween(startISO, dateISO));
      const firstMonthEnd = U.addDays(startISO, 30);
      const anchor = lastPaymentDate > firstMonthEnd ? lastPaymentDate : firstMonthEnd;
      return Math.max(0, U.daysBetween(anchor, dateISO));
    }

    function accrueInterest(dateISO) {
      // Simple interest: accrue on the principal balance only, never on
      // unpaid interest (no interest-on-interest / compounding).
      if (rate <= 0 || pBal <= 0.005) return;
      const days = interestDaysFor(dateISO);
      if (days <= 0) return;
      const interest = U.round2(pBal * (rate / 100) * (days / 30));
      if (interest <= 0) return;
      iBal = U.round2(iBal + interest);
      totalAccrued = U.round2(totalAccrued + interest);
      lastInterestDate = dateISO;
      const row = {
        type: "interest",
        date: dateISO,
        days: days,
        interest: interest,
        amount: interest,
        principalBalance: pBal,
        interestBalance: iBal,
        balance: U.round2(pBal + iBal)
      };
      base.events.push({
        type: "interest",
        date: dateISO,
        days: days,
        interest: interest,
        principalBalance: pBal,
        interestBalance: iBal
      });
      base.rows.push(row);
    }

    payments.forEach(function (payment) {
      accrueInterest(payment.date);
      const amount = U.round2(U.toNumber(payment.amount));
      if (amount <= 0) return;
      totalReceived = U.round2(totalReceived + amount);
      paymentCount += 1;
      lastPaymentDate = payment.date;

      const dueBefore = U.round2(pBal + iBal);
      const interestPortion = U.round2(Math.min(amount, iBal));
      iBal = U.round2(iBal - interestPortion);
      const principalPortion = U.round2(Math.min(amount - interestPortion, pBal));
      pBal = U.round2(pBal - principalPortion);
      const excess = U.round2(amount - interestPortion - principalPortion);
      credit = U.round2(credit + excess);
      totalApplied = U.round2(totalApplied + interestPortion + principalPortion);
      totalInterestPaid = U.round2(totalInterestPaid + interestPortion);
      totalPrincipalPaid = U.round2(totalPrincipalPaid + principalPortion);

      if (!payoffDate && U.round2(pBal + iBal) <= 0.005) {
        payoffDate = payment.date;
      }

      const event = {
        type: "payment",
        date: payment.date,
        paymentId: payment.id,
        amount: amount,
        dueBefore: dueBefore,
        interestPortion: interestPortion,
        principalPortion: principalPortion,
        excess: excess,
        principalBalance: pBal,
        interestBalance: iBal,
        balance: U.round2(pBal + iBal)
      };
      base.events.push(event);
      base.rows.push({
        type: "payment",
        date: payment.date,
        paymentId: payment.id,
        amount: amount,
        dueBefore: dueBefore,
        interestPortion: interestPortion,
        principalPortion: principalPortion,
        excess: excess,
        principalBalance: pBal,
        interestBalance: iBal,
        balance: U.round2(pBal + iBal)
      });
    });

    if (U.round2(pBal + iBal) > 0.005) {
      accrueInterest(endISO);
    }

    const daysSince = lastPaymentDate
      ? U.daysBetween(lastPaymentDate, endISO)
      : U.daysBetween(startISO, endISO);

    base.principalBalance = U.round2(pBal);
    base.interestBalance = U.round2(iBal);
    base.balance = U.round2(pBal + iBal);
    base.totalInterestAccrued = totalAccrued;
    base.totalInterestPaid = totalInterestPaid;
    base.totalPrincipalPaid = totalPrincipalPaid;
    base.totalApplied = totalApplied;
    base.totalReceived = totalReceived;
    base.creditGenerated = credit;
    base.lastPaymentDate = lastPaymentDate;
    base.lastInterestDate = lastInterestDate;
    base.payoffDate = payoffDate;
    base.paymentCount = paymentCount;
    base.interestPaid = totalInterestPaid;
    base.principalPaid = totalPrincipalPaid;
    base.daysSinceLastPayment = Math.max(0, daysSince);
    base.progress = principal > 0 ? U.clamp(totalPrincipalPaid / principal, 0, 1) : 1;
    base.paid = base.balance <= 0.005;
    base.displayStatus = base.paid ? "paid" : "active";

    return base;
  };

  D.loanDisplayStatus = function (summary) {
    return summary && summary.displayStatus ? summary.displayStatus : "active";
  };

  let _fundsCacheKey = "";
  let _fundsCacheResult = null;

  D.funds = function (db, asOf) {
    const cacheKey = (db && db.meta && db.meta.updatedAt || "") + "|" + (asOf || "");
    if (_fundsCacheKey === cacheKey && _fundsCacheResult) {
      return _fundsCacheResult;
    }
    const settings = db.settings || D.defaultSettings();
    const date = asOf || U.today();
    const contributions = (db.contributions || []).filter(function (c) { return !c.voided; });
    const payments = (db.payments || []).filter(function (p) { return !p.voided; });
    const loans = (db.loans || []).filter(function (l) { return ["active", "paid"].includes(l.status); });
    const adjustments = (db.cashAdjustments || []).filter(function (a) { return !a.voided; });

    const totalContributions = U.round2(U.sum(contributions, function (c) { return c.amount; }));
    const totalRepayments = U.round2(U.sum(payments, function (p) { return p.amount; }));
    const totalReleased = U.round2(U.sum(loans, function (l) { return l.principal; }));
    const otherIn = U.round2(U.sum(adjustments.filter(function (a) { return a.direction === "in"; }), function (a) { return a.amount; }));
    const otherOut = U.round2(U.sum(adjustments.filter(function (a) { return a.direction === "out"; }), function (a) { return a.amount; }));
    const openingCash = U.round2(U.toNumber(settings.openingCash));
    const cashOnHand = U.round2(openingCash + totalContributions + totalRepayments + otherIn - totalReleased - otherOut);

    let outstanding = 0;
    let interestCollected = 0;
    let principalCollected = 0;
    let overdueBalance = 0;
    let overdueCount = 0;
    let activeCount = 0;
    loans.forEach(function (loan) {
      const summary = D.loanLedger(loan, db.payments || [], date);
      outstanding = U.round2(outstanding + summary.balance);
      interestCollected = U.round2(interestCollected + summary.totalInterestPaid);
      principalCollected = U.round2(principalCollected + summary.totalPrincipalPaid);
      if (loan.status === "active" && summary.balance > 0.005) activeCount += 1;
      if (summary.overdue) {
        overdueCount += 1;
        overdueBalance = U.round2(overdueBalance + summary.balance);
      }
    });

    const activeMembers = (db.members || []).filter(function (m) { return m.status !== "inactive"; });
    const totalShares = U.round2(U.sum(activeMembers, function (m) { return m.shares; }));
    const currentPeriod = U.monthKey(date);
    const contributionsThisMonth = U.round2(U.sum(contributions.filter(function (c) {
      return c.period === currentPeriod;
    }), function (c) { return c.amount; }));

    const result = {
      asOf: date,
      cashOnHand: cashOnHand,
      availableFunds: Math.max(0, cashOnHand),
      totalContributions: totalContributions,
      totalRepayments: totalRepayments,
      totalReleased: totalReleased,
      otherIn: otherIn,
      otherOut: otherOut,
      openingCash: openingCash,
      grossInflow: U.round2(openingCash + totalContributions + totalRepayments + otherIn),
      outstanding: outstanding,
      principalOutstanding: outstanding,
      interestCollected: interestCollected,
      principalCollected: principalCollected,
      overdueBalance: overdueBalance,
      overdueCount: overdueCount,
      activeLoanCount: activeCount,
      activeMembers: activeMembers.length,
      totalMembers: (db.members || []).length,
      inactiveMembers: (db.members || []).filter(function (m) { return m.status === "inactive"; }).length,
      totalShares: totalShares,
      contributionsThisMonth: contributionsThisMonth,
      currentPeriod: currentPeriod
    };

    _fundsCacheKey = cacheKey;
    _fundsCacheResult = result;
    return result;
  };

  D.clearFundsCache = function () {
    _fundsCacheKey = "";
    _fundsCacheResult = null;
  };

  D.loanLimit = function (db, amount) {
    const settings = db.settings || D.defaultSettings();
    const funds = D.funds(db);
    const cash = U.round2(funds.availableFunds);
    const policyMax = U.round2(U.toNumber(settings.maxLoanAmount));
    const requested = U.round2(U.toNumber(amount));
    const overCash = requested > cash + 0.005;
    const overPolicy = policyMax > 0 && requested > policyMax + 0.005;
    const overLimit = overCash || overPolicy;
    const limit = policyMax > 0 ? policyMax : cash;
    return {
      amount: requested,
      cash: cash,
      policyMax: policyMax,
      limit: Math.max(0, limit),
      overLimit: overLimit,
      overCash: overCash,
      overPolicy: overPolicy,
      shortfall: overCash ? U.round2(requested - cash) : 0,
      reason: overCash ? "Requested amount exceeds available loan funds." : (overPolicy ? "Requested amount exceeds the configured loan ceiling." : "")
    };
  };

  D.contributionExpected = function (member, settings) {
    return U.round2(D.monthlyContributionFor(member, settings));
  };

  D.contributionExpectedFor = function (member, settings, record) {
    if (record) {
      if (record.status === "waived") return 0;
      if (record.expected !== null && record.expected !== undefined && record.expected !== "" && isFinite(Number(record.expected))) {
        return U.round2(Number(record.expected));
      }
    }
    return D.contributionExpected(member, settings);
  };

  D.contributionStatus = function (record, expected) {
    if (!record) return "unpaid";
    if (record.voided) return "voided";
    if (record.status === "waived") return "waived";
    const paid = U.toNumber(record.amount);
    if (expected <= 0) return "paid";
    if (paid >= expected - 0.005) return "paid";
    if (paid > 0) return "partial";
    return "unpaid";
  };

  D.contributionRows = function (db, period) {
    const settings = db.settings || D.defaultSettings();
    const key = period || U.monthKey();
    const dueDate = U.endOfMonth(key);
    const graceDate = U.addDays(dueDate, U.toNumber(settings.latePenaltyGraceDays));
    const today = U.today();
    const rows = (db.members || [])
      .filter(function (m) { return m.status !== "inactive"; })
      .map(function (member) {
        const record = (db.contributions || []).find(function (c) {
          return c.memberId === member.id && c.period === key && !c.voided;
        });
        const expected = D.contributionExpectedFor(member, settings, record);
        const paid = record ? U.round2(U.toNumber(record.amount)) : 0;
        const status = D.contributionStatus(record, expected);
        const late = !!record && record.datePaid && U.daysBetween(dueDate, record.datePaid) > U.toNumber(settings.latePenaltyGraceDays);
        const penalty = (status === "unpaid" || status === "partial") && U.daysBetween(graceDate, today) > 0
          ? U.round2(U.toNumber(settings.latePenalty))
          : 0;
        return {
          member: member,
          record: record || null,
          expected: expected,
          paid: paid,
          balance: status === "waived" ? 0 : U.round2(Math.max(0, expected - paid)),
          status: status,
          dueDate: dueDate,
          paidDate: record ? record.datePaid : "",
          late: late,
          penalty: penalty,
          notes: record ? record.notes : ""
        };
      });

    return {
      period: key,
      dueDate: dueDate,
      rows: rows,
      expected: U.round2(U.sum(rows, function (r) { return r.expected; })),
      paid: U.round2(U.sum(rows, function (r) { return r.paid; })),
      balance: U.round2(U.sum(rows, function (r) { return r.balance; })),
      penalty: U.round2(U.sum(rows, function (r) { return r.penalty; })),
      paidCount: rows.filter(function (r) { return r.status === "paid"; }).length,
      partialCount: rows.filter(function (r) { return r.status === "partial"; }).length,
      unpaidCount: rows.filter(function (r) { return r.status === "unpaid"; }).length
    };
  };

  D.memberMetrics = function (db, member, asOf) {
    const settings = db.settings || D.defaultSettings();
    const date = asOf || U.today();
    const contributions = (db.contributions || []).filter(function (c) {
      return c.memberId === member.id && !c.voided;
    });
    const totalContributions = U.round2(U.sum(contributions, function (c) { return c.amount; }));
    const lastContribution = U.sortBy(contributions.filter(function (c) { return c.datePaid; }), "datePaid", "desc")[0] || null;
    const ownLoans = (db.loans || []).filter(function (l) {
      return l.borrowerType === "member" && l.memberId === member.id;
    });
    const careLoans = (db.loans || []).filter(function (l) {
      return l.borrowerType === "non_member" && l.careOfMemberId === member.id;
    });
    let outstanding = 0;
    let activeCount = 0;
    ownLoans.forEach(function (loan) {
      if (!["active", "paid"].includes(loan.status)) return;
      const summary = D.loanLedger(loan, db.payments || [], date);
      outstanding = U.round2(outstanding + summary.balance);
      if (loan.status === "active" && summary.balance > 0.005) activeCount += 1;
    });
    const shares = U.round2(U.toNumber(member.shares));
    const totalShares = U.round2(U.sum((db.members || []).filter(function (m) { return m.status !== "inactive"; }), function (m) { return m.shares; }));
    return {
      member: member,
      contributions: totalContributions,
      contributionCount: contributions.filter(function (c) { return c.amount > 0; }).length,
      lastContribution: lastContribution,
      shares: shares,
      sharePercent: totalShares > 0 ? shares / totalShares : 0,
      outstanding: outstanding,
      activeLoans: activeCount,
      loanCount: ownLoans.length,
      careLoanCount: careLoans.length,
      settlementReminder: "Settle before December each year",
      expectedMonthly: D.monthlyContributionFor(member, settings)
    };
  };

  D.dashboard = function (db, asOf) {
    const date = asOf || U.today();
    const funds = D.funds(db, date);
    const contributions = D.contributionRows(db, U.monthKey(date));
    const pendingApprovals = (db.approvals || []).filter(function (a) { return a.status === "pending"; });
    const loans = (db.loans || []).filter(function (l) { return ["active", "paid"].includes(l.status); });
    const loanSummaries = loans.map(function (loan) {
      return D.loanLedger(loan, db.payments || [], date);
    });
    const dueSoon = loanSummaries.filter(function (s) { return s.balance > 0.005; }).length;
    const audit = (db.audit || []).slice().sort(function (a, b) {
      return String(b.at || "").localeCompare(String(a.at || ""));
    });
    const recentPayments = (db.payments || []).filter(function (p) { return !p.voided; })
      .slice().sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); }).slice(0, 5);
    const recentContributions = (db.contributions || []).filter(function (c) { return !c.voided && c.amount > 0; })
      .slice().sort(function (a, b) { return String(b.datePaid || "").localeCompare(String(a.datePaid || "")); }).slice(0, 5);
    const dueLoans = loans.map(function (loan) {
      const s = D.loanLedger(loan, db.payments || [], date);
      return { loan: loan, summary: s };
    }).filter(function (x) { return x.summary.balance > 0.005; })
      .sort(function (a, b) { return b.summary.balance - a.summary.balance; }).slice(0, 5);

    const series = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = U.monthKey(d);
      const contrib = U.round2(U.sum((db.contributions || []).filter(function (c) {
        return !c.voided && c.period === key;
      }), function (c) { return c.amount; }));
      const paid = U.round2(U.sum((db.payments || []).filter(function (p) {
        return !p.voided && p.date && U.monthKey(p.date) === key;
      }), function (p) { return p.amount; }));
      series.push({ key: key, label: D.monthShort(key), contributions: contrib, repayments: paid, total: U.round2(contrib + paid) });
    }

    return {
      funds: funds,
      contributions: contributions,
      pendingApprovals: pendingApprovals.length,
      dueSoon: dueSoon,
      dueLoans: dueLoans,
      recentAudit: audit.slice(0, 8),
      recentPayments: recentPayments,
      recentContributions: recentContributions,
      series: series,
      activeLoans: funds.activeLoanCount,
      overdueLoans: funds.overdueCount,
      totalLoanBalance: funds.outstanding,
      netContributions: funds.totalContributions,
      memberCount: funds.activeMembers,
      totalShares: funds.totalShares
    };
  };

  D.monthShort = function (key) {
    const m = U.monthOf(key);
    if (!m) return key;
    return new Intl.DateTimeFormat("en-PH", { month: "short", year: "2-digit" }).format(new Date(m.year, m.month, 1));
  };

  D.profitDistribution = function (db, profit, basis) {
    const totalProfit = U.round2(U.toNumber(profit));
    const mode = basis || (db.settings && db.settings.profitShareBasis) || "shares";
    const members = (db.members || []).filter(function (m) { return m.status !== "inactive"; });
    const activeIds = Object.create(null);
    members.forEach(function (m) { activeIds[m.id] = true; });
    const activeContributions = (db.contributions || []).filter(function (c) {
      return !c.voided && activeIds[c.memberId];
    });
    const totalShares = U.round2(U.sum(members, function (m) { return m.shares; }));
    const totalContributions = U.round2(U.sum(activeContributions, function (c) { return c.amount; }));
    const totalUnits = mode === "contributions" ? totalContributions : totalShares;
    const perUnit = totalUnits > 0 ? totalProfit / totalUnits : 0;
    const rows = members.map(function (member) {
      const units = mode === "contributions"
        ? U.round2(U.sum(activeContributions.filter(function (c) { return c.memberId === member.id; }), function (c) { return c.amount; }))
        : U.round2(U.toNumber(member.shares));
      return {
        member: member,
        units: units,
        amount: U.round2(units * perUnit)
      };
    });
    let distributed = U.round2(U.sum(rows, function (r) { return r.amount; }));
    const remainder = U.round2(totalProfit - distributed);
    if (totalUnits > 0 && rows.length && Math.abs(remainder) >= 0.01) {
      const largest = U.sortBy(rows, "units", "desc")[0];
      largest.amount = U.round2(largest.amount + remainder);
      distributed = U.round2(distributed + remainder);
    }
    return {
      totalProfit: totalProfit,
      basis: mode,
      totalUnits: totalUnits,
      perUnit: perUnit,
      rows: rows,
      distributed: distributed,
      remainder: remainder
    };
  };

  D.memberOptions = function (db, includeInactive) {
    return (db.members || [])
      .filter(function (m) { return includeInactive || m.status !== "inactive"; })
      .slice()
      .sort(function (a, b) { return D.memberName(a).localeCompare(D.memberName(b)); });
  };

  D.nextMemberNo = function (db) {
    let max = 0;
    (db.members || []).forEach(function (m) {
      const n = parseInt(String(m.memberNo || "").replace(/\D/g, ""), 10);
      if (isFinite(n) && n > max) max = n;
    });
    return String(max + 1).padStart(4, "0");
  };

  D.nextLoanNo = function (db) {
    let max = 0;
    (db.loans || []).forEach(function (l) {
      const n = parseInt(String(l.loanNo || "").replace(/\D/g, ""), 10);
      if (isFinite(n) && n > max) max = n;
    });
    return "LN-" + String(max + 1).padStart(4, "0");
  };

  D.paymentAllocationFor = function (db, loan, asOf, amount) {
    const summary = D.loanLedger(loan, db.payments || [], asOf);
    const requested = U.round2(U.toNumber(amount));
    const interestPortion = U.round2(Math.min(requested, summary.interestBalance));
    const principalPortion = U.round2(Math.min(requested - interestPortion, summary.principalBalance));
    return {
      interestPortion: interestPortion,
      principalPortion: principalPortion,
      credit: U.round2(requested - interestPortion - principalPortion),
      balanceBefore: summary.balance
    };
  };
})();
