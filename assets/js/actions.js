(function () {
  "use strict";
  const COOP = (window.COOP = window.COOP || {});
  const U = COOP.utils;
  const D = COOP.domain;
  const store = COOP.store;
  const A = (COOP.actions = {});

  function requirePermission(permission) {
    if (!store.can(permission)) throw new Error("You do not have permission to do that.");
  }

  function requireUser() {
    const user = store.currentUser();
    if (!user) throw new Error("Your session has expired. Please sign in again.");
    return user;
  }

  function findOrThrow(list, id, label) {
    const row = (list || []).find(function (item) { return item.id === id; });
    if (!row) throw new Error((label || "Record") + " was not found.");
    return row;
  }

  function isoDateOrThrow(value, label) {
    const iso = U.isoDate(value);
    if (!iso) throw new Error("Enter a valid " + (label || "date") + ".");
    return iso;
  }

  function noFutureDate(value, label) {
    const iso = isoDateOrThrow(value, label);
    if (U.daysBetween(iso, U.today()) < 0) throw new Error((label || "Date") + " cannot be in the future.");
    return iso;
  }

  function required(value, label) {
    const clean = String(value === null || value === undefined ? "" : value).trim();
    if (!clean) throw new Error("Enter " + (label || "a value") + ".");
    return clean;
  }

  function positive(value, label) {
    const n = U.round2(U.toNumber(value));
    if (!isFinite(n) || n <= 0) throw new Error((label || "Amount") + " must be greater than zero.");
    return n;
  }

  function nonNegative(value, label) {
    const n = U.round2(U.toNumber(value));
    if (!isFinite(n) || n < 0) throw new Error((label || "Amount") + " cannot be negative.");
    return n;
  }

  function audit(action, entity, entityId, details) {
    return { action: action, entity: entity, entityId: entityId, details: details };
  }

  function syncCurrentContributionRecords(data, member) {
    const expected = D.contributionExpected(member, data.settings);
    const currentPeriod = U.monthKey();
    let updated = 0;
    data.contributions.forEach(function (record) {
      if (record.memberId !== member.id || record.voided || record.status === "waived") return;
      if (String(record.period) < currentPeriod) return;
      if (U.toNumber(record.amount) > expected + 0.005) return;
      if (Math.abs(U.round2(U.toNumber(record.expected)) - expected) < 0.005) return;
      record.expected = expected;
      record.updatedAt = new Date().toISOString();
      updated += 1;
    });
    return updated;
  }

  function recalcLoan(data, loanId) {
    const loan = data.loans.find(function (l) { return l.id === loanId; });
    if (!loan) return null;
    const summary = D.loanLedger(loan, data.payments, U.today());
    const paymentRows = summary.rows.filter(function (row) { return row.type === "payment"; });
    data.payments.forEach(function (payment) {
      if (payment.loanId !== loan.id || payment.voided) return;
      const row = paymentRows.find(function (r) { return r.paymentId === payment.id; });
      if (row) {
        payment.interestPortion = row.interestPortion;
        payment.principalPortion = row.principalPortion;
        payment.credit = row.excess;
        payment.checkedAt = U.today();
      } else {
        payment.interestPortion = 0;
        payment.principalPortion = 0;
        payment.credit = U.round2(U.toNumber(payment.amount));
      }
    });
    if (loan.status === "active" && summary.balance <= 0.005 && summary.totalReceived > 0) {
      loan.status = "paid";
      loan.paidAt = summary.payoffDate || U.today();
    } else if (loan.status === "paid" && summary.balance > 0.005) {
      loan.status = "active";
      loan.paidAt = "";
    }
    loan.updatedAt = new Date().toISOString();
    return summary;
  }

  A.recalcLoan = async function (loanId) {
    let result = null;
    await store.mutate(function (data) {
      result = recalcLoan(data, loanId);
    }, audit("recalculate", "loan", loanId, "Recalculated loan ledger."));
    return result;
  };

  A.saveMember = async function (input, id) {
    requirePermission("members.manage");
    const first = required(input.firstName, "a first name");
    const last = required(input.lastName, "a last name");
    const shares = nonNegative(input.shares, "Shares");
    const joinDate = isoDateOrThrow(input.joinDate || U.today(), "join date");
    const memberNo = String(input.memberNo || "").trim();
    let saved = null;

    await store.mutate(function (data) {
      const duplicateNo = memberNo && data.members.find(function (m) {
        return m.memberNo.toLowerCase() === memberNo.toLowerCase() && m.id !== id;
      });
      if (duplicateNo) throw new Error("That member number is already in use.");

      if (id) {
        const member = findOrThrow(data.members, id, "Member");
        const metrics = D.memberMetrics(data, member);
        const previousExpected = D.monthlyContributionFor(member, data.settings);
        if (input.status === "inactive" && metrics.outstanding > 0) {
          throw new Error("This member has an outstanding loan balance. Settle it before deactivating the member.");
        }
        Object.assign(member, {
          memberNo: memberNo || member.memberNo,
          firstName: first,
          middleName: String(input.middleName || "").trim(),
          lastName: last,
          address: String(input.address || "").trim(),
          contact: String(input.contact || "").trim(),
          email: String(input.email || "").trim(),
          joinDate: joinDate,
          shares: shares,
          monthlyContribution: input.monthlyContribution === "" || input.monthlyContribution === null || input.monthlyContribution === undefined
            ? null : nonNegative(input.monthlyContribution, "Monthly contribution"),
          status: input.status === "inactive" ? "inactive" : "active",
          notes: String(input.notes || "").trim(),
          updatedAt: new Date().toISOString()
        });
        if (U.round2(D.monthlyContributionFor(member, data.settings)) !== U.round2(previousExpected)) {
          syncCurrentContributionRecords(data, member);
        }
        saved = member;
      } else {
        const now = new Date().toISOString();
        saved = {
          id: U.uid("mem"),
          memberNo: memberNo || D.nextMemberNo(data),
          firstName: first,
          middleName: String(input.middleName || "").trim(),
          lastName: last,
          address: String(input.address || "").trim(),
          contact: String(input.contact || "").trim(),
          email: String(input.email || "").trim(),
          joinDate: joinDate,
          shares: shares,
          monthlyContribution: input.monthlyContribution === "" || input.monthlyContribution === null || input.monthlyContribution === undefined
            ? null : nonNegative(input.monthlyContribution, "Monthly contribution"),
          status: input.status === "inactive" ? "inactive" : "active",
          notes: String(input.notes || "").trim(),
          createdAt: now,
          updatedAt: now
        };
        data.members.push(saved);
      }
    }, audit(id ? "update" : "create", "member", saved ? saved.id : id, (id ? "Updated" : "Added") + " member " + first + " " + last + "."));

    return saved;
  };

  A.deleteMember = async function (id) {
    requirePermission("members.manage");
    await store.mutate(function (data) {
      const member = findOrThrow(data.members, id, "Member");
      const hasContributions = data.contributions.some(function (c) { return c.memberId === id && !c.voided; });
      const hasLoans = data.loans.some(function (l) {
        return (l.borrowerType === "member" && l.memberId === id) || (l.borrowerType === "non_member" && l.careOfMemberId === id);
      });
      const hasUser = data.users.some(function (u) { return u.memberId === id; });
      if (hasContributions || hasLoans || hasUser) {
        throw new Error("This member has linked records. Set the member to inactive instead of deleting.");
      }
      data.members = data.members.filter(function (m) { return m.id !== id; });
      data.audit.unshift({
        id: U.uid("aud"), at: new Date().toISOString(),
        userId: store.currentUser().id, userName: store.currentUser().name, userRole: store.currentUser().role,
        action: "delete", entity: "member", entityId: id,
        details: "Deleted member " + D.memberName(member) + "."
      });
    });
  };

  A.saveContribution = async function (input, id) {
    requirePermission("contributions.manage");
    const memberId = required(input.memberId, "a member");
    const period = required(input.period, "a contribution month");
    if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Select a valid contribution month.");
    const waived = input.waived === "on" || input.waived === true || input.status === "waived";
    const amount = waived ? 0 : nonNegative(input.amount, "Contribution amount");
    if (!waived && amount <= 0) throw new Error("Enter a contribution amount or mark the contribution as waived.");
    const datePaid = waived ? "" : noFutureDate(input.datePaid || U.today(), "payment date");
    let saved = null;

    await store.mutate(function (data) {
      const member = findOrThrow(data.members, memberId, "Member");
      const existing = data.contributions.find(function (c) {
        return c.memberId === memberId && c.period === period && !c.voided && c.id !== id;
      });
      if (existing) throw new Error("A contribution for this member and month already exists. Edit it instead.");
      const expected = D.contributionExpected(member, data.settings);
      if (id) {
        saved = findOrThrow(data.contributions, id, "Contribution");
        if (saved.voided) throw new Error("This contribution has already been voided.");
      }
      let recordExpected = waived ? 0 : expected;
      if (id && !waived && saved.memberId === memberId && saved.period === period && saved.status !== "waived" &&
          saved.expected !== null && saved.expected !== undefined && saved.expected !== "" && isFinite(Number(saved.expected))) {
        recordExpected = U.round2(Number(saved.expected));
      }
      if (amount > recordExpected + 0.005) {
        throw new Error("Amount exceeds the expected " + U.money(recordExpected) + " for this member. Adjust the member's monthly contribution or enter the correct amount.");
      }
      const now = new Date().toISOString();
      if (id) {
        Object.assign(saved, {
          memberId: memberId,
          period: period,
          expected: recordExpected,
          amount: amount,
          datePaid: datePaid,
          status: waived ? "waived" : "posted",
          method: String(input.method || "Cash"),
          reference: String(input.reference || "").trim(),
          notes: String(input.notes || "").trim(),
          updatedAt: now
        });
      } else {
        saved = {
          id: U.uid("con"),
          memberId: memberId,
          period: period,
          expected: recordExpected,
          amount: amount,
          datePaid: datePaid,
          status: waived ? "waived" : "posted",
          method: String(input.method || "Cash"),
          reference: String(input.reference || "").trim(),
          notes: String(input.notes || "").trim(),
          voided: false,
          createdAt: now,
          updatedAt: now
        };
        data.contributions.push(saved);
      }
    }, audit(id ? "update" : "create", "contribution", saved ? saved.id : id,
      (id ? "Updated" : "Recorded") + " contribution for " + period + " at " + U.money(amount) + "."));

    return saved;
  };

  A.voidContribution = async function (id, reason) {
    requirePermission("contributions.manage");
    const why = required(reason, "a reason");
    await store.mutate(function (data) {
      const contribution = findOrThrow(data.contributions, id, "Contribution");
      if (contribution.voided) throw new Error("This contribution is already voided.");
      contribution.voided = true;
      contribution.voidedAt = new Date().toISOString();
      contribution.voidedBy = store.currentUser().id;
      contribution.voidReason = why;
      contribution.updatedAt = new Date().toISOString();
    }, audit("void", "contribution", id, "Voided contribution. Reason: " + why));
  };

  A.saveLoan = async function (input, id) {
    requirePermission("loans.manage");
    const borrowerType = input.borrowerType === "non_member" ? "non_member" : "member";
    const principal = positive(input.principal, "Loan principal");
    const rate = nonNegative(input.interestRate, "Interest rate");
    if (rate > 100) throw new Error("Interest rate cannot exceed 100% per month.");
    const startDate = noFutureDate(input.startDate || U.today(), "release date");
    const memberId = borrowerType === "member" ? required(input.memberId, "a member borrower") : "";
    const borrowerName = borrowerType === "non_member" ? required(input.borrowerName, "the borrower's name") : "";
    const careOfMemberId = borrowerType === "non_member" ? required(input.careOfMemberId, "the caring member") : "";
    let saved = null;
    let approval = null;
    let limitInfo = null;

    await store.mutate(function (data) {
      if (borrowerType === "member") {
        findOrThrow(data.members, memberId, "Member");
      } else {
        findOrThrow(data.members, careOfMemberId, "Caring member");
      }

      if (id) {
        const loan = findOrThrow(data.loans, id, "Loan");
        if (loan.status === "paid" || loan.status === "cancelled" || loan.status === "rejected") {
          throw new Error("This loan can no longer be edited.");
        }
        const paymentCount = data.payments.filter(function (p) { return p.loanId === id && !p.voided; }).length;
        if (paymentCount > 0) throw new Error("This loan already has payments. Edit only its notes.");
        if (loan.status === "active") {
          limitInfo = D.loanLimit(data, principal);
          if (limitInfo.overLimit) {
            throw new Error("The updated amount exceeds the current loan limit. Settle collections or request a new approval.");
          }
        }
        Object.assign(loan, {
          borrowerType: borrowerType,
          memberId: memberId,
          borrowerName: borrowerName,
          careOfMemberId: careOfMemberId,
          principal: principal,
          interestRate: rate,
          startDate: startDate,
          purpose: String(input.purpose || "").trim(),
          collateral: String(input.collateral || "").trim(),
          notes: String(input.notes || "").trim(),
          updatedAt: new Date().toISOString()
        });
        if (loan.status === "pending" && loan.approvalId) {
          const approvalRow = data.approvals.find(function (a) { return a.id === loan.approvalId; });
          if (approvalRow) {
            approvalRow.amount = principal;
            approvalRow.reason = D.loanLimit(data, principal).reason || "Over-limit loan requiring approval.";
            approvalRow.updatedAt = new Date().toISOString();
          }
        }
        saved = loan;
      } else {
        limitInfo = D.loanLimit(data, principal);
        const requiresApproval = limitInfo.overLimit && data.settings.requireOverLimitApproval !== false;
        const now = new Date().toISOString();
        const loanStatus = requiresApproval ? "pending" : "active";
        saved = {
          id: U.uid("loan"),
          loanNo: D.nextLoanNo(data),
          borrowerType: borrowerType,
          memberId: memberId,
          borrowerName: borrowerName,
          careOfMemberId: careOfMemberId,
          principal: principal,
          interestRate: rate,
          startDate: startDate,
          purpose: String(input.purpose || "").trim(),
          collateral: String(input.collateral || "").trim(),
          notes: String(input.notes || "").trim(),
          status: loanStatus,
          approvalId: "",
          requestedBy: store.currentUser().id,
          approvedBy: requiresApproval ? "" : store.currentUser().id,
          approvedAt: requiresApproval ? "" : now,
          releasedAt: requiresApproval ? "" : startDate,
          paidAt: "",
          createdAt: now,
          updatedAt: now
        };
        data.loans.push(saved);
        if (requiresApproval) {
          approval = {
            id: U.uid("apr"),
            type: "over_limit_loan",
            status: "pending",
            loanId: saved.id,
            amount: principal,
            reason: limitInfo.reason || "Requested amount exceeds the current loan limit.",
            requestedBy: store.currentUser().id,
            requestedByName: store.currentUser().name,
            requestedAt: now,
            decidedBy: "",
            decidedAt: "",
            decisionNotes: "",
            createdAt: now,
            updatedAt: now
          };
          data.approvals.push(approval);
          saved.approvalId = approval.id;
        }
      }
    }, audit(id ? "update" : "create", "loan", saved ? saved.id : id,
      (id ? "Updated" : "Created") + " loan " + (saved ? saved.loanNo : "") + " for " + U.money(principal) +
      (approval ? " (pending approval)." : ".")));

    return { loan: saved, approval: approval, limit: limitInfo };
  };

  A.requestLoan = async function (input) {
    const user = requireUser();
    if (user.role === "admin" || user.role === "treasurer") {
      throw new Error("Only member accounts can avail loans through this channel. Use the Loans page instead.");
    }
    const principal = positive(input.principal, "Loan amount");
    const purpose = required(input.purpose, "the reason for the loan");
    const isNonMember = input.borrowerType === "non_member";
    const borrowerName = isNonMember ? required(input.borrowerName, "the non-member borrower's name") : "";
    const disburseMethod = ["cash", "gcash", "bank"].indexOf(input.disburseMethod) >= 0 ? input.disburseMethod : "cash";
    let disburseDetail = "";
    if (disburseMethod === "gcash") {
      const mobile = String(input.disburseMobile || "").replace(/[^\d+ ]/g, "").trim();
      if (mobile.replace(/\D/g, "").length < 7) throw new Error("Enter a valid GCash mobile number.");
      disburseDetail = mobile;
    } else if (disburseMethod === "bank") {
      const bank = required(input.disburseBank, "the bank name");
      const acct = String(input.disburseAccountNo || "").trim();
      if (!acct) throw new Error("Enter the bank account number.");
      const holder = required(input.disburseAccountName, "the account holder's name");
      disburseDetail = bank + " · " + acct + (holder && holder !== user.name ? " (" + holder + ")" : "");
    } else {
      disburseDetail = String(input.disburseNotes || "").trim().slice(0, 200);
    }
    const row = {
      id: U.uid("lreq"),
      requestedById: user.id,
      requestedByName: user.name,
      requestedByUsername: user.username,
      linkedMemberId: isNonMember ? "" : user.memberId || "",
      borrowerType: isNonMember ? "non_member" : "member",
      borrowerName: borrowerName,
      principal: principal,
      purpose: String(purpose).slice(0, 1000),
      disburseMethod: disburseMethod,
      disburseDetail: disburseDetail,
      notes: String(input.notes || "").trim().slice(0, 500),
      status: "pending",
      decidedBy: "",
      decidedByName: "",
      decidedAt: "",
      decisionNotes: "",
      loanId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await store.mutate(function (data) {
      data.loanRequests.push(row);
    }, audit("request", "loan", row.id,
      user.name + " requested to avail a loan of " + U.money(principal) +
      (isNonMember ? " for non-member borrower " + borrowerName : "") + ". Pending treasurer review."));
    return row;
  };

  A.recommendLoanRequest = async function (requestId, note) {
    requirePermission("loans.manage");
    const why = String(note || "").trim().slice(0, 1000);
    await store.mutate(function (data) {
      const request = data.loanRequests.find(function (r) { return r.id === requestId; });
      if (!request) throw new Error("Loan request not found.");
      if (request.status !== "pending") throw new Error("This loan request has already been decided.");
      if (request.recommendedBy) throw new Error("This request is already endorsed to the president.");
      const now = new Date().toISOString();
      request.recommendedBy = store.currentUser().id;
      request.recommendedByName = store.currentUser().name;
      request.recommendedAt = now;
      request.recommendedNotes = why;
      request.updatedAt = now;
      data.audit.unshift({
        id: U.uid("aud"), at: now,
        userId: store.currentUser().id, userName: store.currentUser().name, userRole: store.currentUser().role,
        action: "recommend", entity: "loan_request", entityId: request.id,
        details: "Recommended approval of " + request.requestedByName + "'s loan request (" + U.money(request.principal) + ") for the president's final decision."
      });
    });
  };

  A.recommendLoan = async function (loanId, note) {
    requirePermission("loans.manage");
    const why = String(note || "").trim().slice(0, 1000);
    await store.mutate(function (data) {
      const loan = findOrThrow(data.loans, loanId, "Loan");
      if (loan.status !== "pending") throw new Error("Only pending loans can be recommended.");
      const approvalRow = (data.approvals || []).find(function (a) {
        return a.loanId === loan.id && a.type === "over_limit_loan" && a.status === "pending";
      });
      if (approvalRow) {
        if (approvalRow.recommendedBy) throw new Error("This loan is already endorsed to the president.");
        const now = new Date().toISOString();
        approvalRow.recommendedBy = store.currentUser().id;
        approvalRow.recommendedByName = store.currentUser().name;
        approvalRow.recommendedAt = now;
        approvalRow.recommendedNotes = why;
        approvalRow.updatedAt = now;
        data.audit.unshift({
          id: U.uid("aud"), at: now,
          userId: store.currentUser().id, userName: store.currentUser().name, userRole: store.currentUser().role,
          action: "recommend", entity: "loan", entityId: loan.id,
          details: "Recommended approval of over-limit loan " + loan.loanNo + " for the president's final decision."
        });
      } else {
        throw new Error("This loan does not need a recommendation.");
      }
    });
  };

  function decideGate(request, required) {
    const user = store.currentUser();
    const forwarded = request && request.recommendedBy;
    if (user.role === "president" && !forwarded) {
      throw new Error("Presidents can only decide on requests forwarded by the treasurer.");
    }
    required();
  }

  A.decideLoanRequest = async function (requestId, decision, details) {
    if (!store.can("loans.manage") && !store.can("approvals.manage")) {
      throw new Error("You do not have permission to decide loan requests.");
    }
    requireUser();
    const approved = decision === "approve";
    const opts = details || {};
    let loanInfo = null;
    let decidedLoanRequest = null;
    await store.mutate(function (data) {
      const request = data.loanRequests.find(function (r) { return r.id === requestId; });
      if (!request) throw new Error("Loan request not found.");
      if (request.status !== "pending") throw new Error("This loan request has already been decided.");
      decideGate(request, function () {});
      const now = new Date().toISOString();
      decidedLoanRequest = request;
      let details = "";

      if (!approved) {
        const why = required(opts.notes, "a decision note");
        request.status = "rejected";
        request.decidedBy = store.currentUser().id;
        request.decidedByName = store.currentUser().name;
        request.decidedAt = now;
        request.decisionNotes = why;
        request.updatedAt = now;
        details = "Rejected loan request from " + request.requestedByName + " of " + U.money(request.principal) + ". Reason: " + why;
      } else {
        const borrowerType = opts.borrowerType && opts.borrowerType === "non_member" ? "non_member" : (request.borrowerType === "non_member" ? "non_member" : "member");
        const memberId = borrowerType === "member" ? required(opts.memberId || request.linkedMemberId, "a member borrower") : "";
        const borrowerName = borrowerType === "non_member" ? required(opts.borrowerName, "the borrower's name") : "";
        const careOfMemberId = borrowerType === "non_member" ? required(opts.careOfMemberId, "the caring member") : "";
        const rate = nonNegative(opts.interestRate, "Interest rate");
        if (rate > 100) throw new Error("Interest rate cannot exceed 100% per month.");
        const startDate = noFutureDate(opts.startDate || U.today(), "release date");
        if (borrowerType === "member") findOrThrow(data.members, memberId, "Member");
        else findOrThrow(data.members, careOfMemberId, "Caring member");

        const saved = {
          id: U.uid("loan"),
          loanNo: D.nextLoanNo(data),
          borrowerType: borrowerType,
          memberId: memberId,
          borrowerName: borrowerName,
          careOfMemberId: careOfMemberId,
          principal: request.principal,
          interestRate: rate,
          startDate: startDate,
        purpose: request.purpose,
        disburseMethod: request.disburseMethod || "",
        disburseDetail: request.disburseDetail || "",
        collateral: String(opts.collateral || "").trim(),
          notes: String(opts.notes || request.notes || "").trim(),
          status: "active",
          approvalId: "",
          requestedByLoanReqId: request.id,
          requestedBy: store.currentUser().id,
          approvedBy: store.currentUser().id,
          approvedAt: now,
          releasedAt: startDate,
          paidAt: "",
          createdAt: now,
          updatedAt: now
        };
        data.loans.push(saved);
        request.status = "approved";
        request.decidedBy = store.currentUser().id;
        request.decidedByName = store.currentUser().name;
        request.decidedAt = now;
        request.decisionNotes = String(opts.decisionNotes || "").trim().slice(0, 1000);
        request.loanId = saved.id;
        request.updatedAt = now;
        loanInfo = saved;
        details = "Approved loan request from " + request.requestedByName + ": released " + saved.loanNo +
          " for " + U.money(saved.principal) + " at " + saved.interestRate + "%/mo.";
      }

      data.audit.unshift({
        id: U.uid("aud"), at: now,
        userId: store.currentUser().id, userName: store.currentUser().name, userRole: store.currentUser().role,
        action: approved ? "approve" : "reject", entity: "loan_request", entityId: request.id,
        details: details
      });
    });
    return loanInfo;
  };

  A.approveLoan = async function (loanId) {
    if (!store.can("loans.manage") && !store.can("approvals.manage")) {
      throw new Error("You do not have permission to approve loans.");
    }
    requireUser();
    await store.mutate(function (data) {
      const loan = findOrThrow(data.loans, loanId, "Loan");
      if (loan.status !== "pending") throw new Error("Only pending loans can be approved.");
      if (store.currentUser().role === "president") {
        const approvalRow = (data.approvals || []).find(function (a) {
          return a.loanId === loan.id && a.status === "pending";
        });
        if (!approvalRow || !approvalRow.recommendedBy) {
          throw new Error("Presidents can only decide on requests forwarded by the treasurer.");
        }
      }
      const now = new Date().toISOString();
      loan.status = "active";
      loan.approvedBy = store.currentUser().id;
      loan.approvedAt = now;
      loan.releasedAt = U.today();
      loan.updatedAt = now;
      const approval = data.approvals.find(function (a) { return a.loanId === loan.id && a.status === "pending"; });
      if (approval) {
        approval.status = "approved";
        approval.decidedBy = store.currentUser().id;
        approval.decidedByName = store.currentUser().name;
        approval.decidedAt = now;
        approval.updatedAt = now;
      }
    }, audit("approve", "loan", loanId, "Approved over-limit loan request."));
  };

  A.rejectLoan = async function (loanId, reason) {
    if (!store.can("loans.manage") && !store.can("approvals.manage")) {
      throw new Error("You do not have permission to reject loans.");
    }
    requireUser();
    const why = required(reason, "a rejection reason");
    await store.mutate(function (data) {
      const loan = findOrThrow(data.loans, loanId, "Loan");
      if (loan.status !== "pending") throw new Error("Only pending loans can be rejected.");
      if (store.currentUser().role === "president") {
        const approvalRow = (data.approvals || []).find(function (a) {
          return a.loanId === loan.id && a.status === "pending";
        });
        if (!approvalRow || !approvalRow.recommendedBy) {
          throw new Error("Presidents can only decide on requests forwarded by the treasurer.");
        }
      }
      const now = new Date().toISOString();
      loan.status = "rejected";
      loan.rejectedAt = now;
      loan.rejectionReason = why;
      loan.updatedAt = now;
      const approval = data.approvals.find(function (a) { return a.loanId === loan.id && a.status === "pending"; });
      if (approval) {
        approval.status = "rejected";
        approval.decidedBy = store.currentUser().id;
        approval.decidedByName = store.currentUser().name;
        approval.decidedAt = now;
        approval.decisionNotes = why;
        approval.updatedAt = now;
      }
    }, audit("reject", "loan", loanId, "Rejected loan request. Reason: " + why));
  };

  A.cancelLoan = async function (loanId, reason) {
    requirePermission("loans.manage");
    const why = required(reason, "a cancellation reason");
    await store.mutate(function (data) {
      const loan = findOrThrow(data.loans, loanId, "Loan");
      if (!["pending", "active"].includes(loan.status)) throw new Error("This loan can no longer be cancelled.");
      const payments = data.payments.filter(function (p) { return p.loanId === loanId && !p.voided; });
      if (payments.length) throw new Error("This loan already has payments and cannot be cancelled.");
      const now = new Date().toISOString();
      loan.status = "cancelled";
      loan.cancelledAt = now;
      loan.cancelReason = why;
      loan.updatedAt = now;
      const approval = data.approvals.find(function (a) { return a.loanId === loan.id && a.status === "pending"; });
      if (approval) {
        approval.status = "cancelled";
        approval.decidedBy = store.currentUser().id;
        approval.decidedByName = store.currentUser().name;
        approval.decidedAt = now;
        approval.decisionNotes = why;
        approval.updatedAt = now;
      }
    }, audit("cancel", "loan", loanId, "Cancelled loan. Reason: " + why));
  };

  A.deleteLoan = async function (loanId) {
    requirePermission("loans.manage");
    await store.mutate(function (data) {
      const loan = findOrThrow(data.loans, loanId, "Loan");
      if (!["pending", "rejected", "cancelled"].includes(loan.status)) {
        throw new Error("Only pending, rejected, or cancelled loans can be deleted.");
      }
      const hasPayments = data.payments.some(function (p) { return p.loanId === loanId; });
      if (hasPayments) throw new Error("This loan has payment records and cannot be deleted.");
      data.loans = data.loans.filter(function (l) { return l.id !== loanId; });
      data.approvals = data.approvals.filter(function (a) { return a.loanId !== loanId; });
      data.audit.unshift({
        id: U.uid("aud"), at: new Date().toISOString(),
        userId: store.currentUser().id, userName: store.currentUser().name, userRole: store.currentUser().role,
        action: "delete", entity: "loan", entityId: loanId,
        details: "Deleted loan " + loan.loanNo + "."
      });
    });
  };

  A.recordPayment = async function (input) {
    requirePermission("payments.manage");
    const loanId = required(input.loanId, "a loan");
    const amount = positive(input.amount, "Payment amount");
    const date = noFutureDate(input.date || U.today(), "payment date");
    let saved = null;

    await store.mutate(function (data) {
      const loan = findOrThrow(data.loans, loanId, "Loan");
      if (loan.status !== "active" && loan.status !== "paid") throw new Error("Payments can only be posted to an active loan.");
      if (U.daysBetween(loan.startDate, date) < 0) throw new Error("Payment date cannot be before the loan release date.");
      const before = D.loanLedger(loan, data.payments, date);
      if (before.balance <= 0.005) throw new Error("This loan is already fully paid.");
      const allocation = D.paymentAllocationFor(data, loan, date, amount);
      const now = new Date().toISOString();
      let maxReceipt = 0;
      data.payments.forEach(function (p) {
        const n = parseInt(String(p.receiptNo || "").replace(/\D/g, ""), 10);
        if (isFinite(n) && n > maxReceipt) maxReceipt = n;
      });
      saved = {
        id: U.uid("pay"),
        receiptNo: "OR-" + String(maxReceipt + 1).padStart(4, "0"),
        loanId: loan.id,
        borrowerName: D.borrowerName(loan, data),
        date: date,
        amount: amount,
        interestPortion: allocation.interestPortion,
        principalPortion: allocation.principalPortion,
        credit: allocation.credit,
        method: String(input.method || "Cash"),
        reference: String(input.reference || "").trim(),
        notes: String(input.notes || "").trim(),
        voided: false,
        createdBy: store.currentUser().id,
        createdByName: store.currentUser().name,
        createdAt: now,
        updatedAt: now
      };
      data.payments.push(saved);
      recalcLoan(data, loan.id);
    }, audit("payment", "loan", loanId, "Posted payment " + U.money(amount) + " on " + date + "."));

    return saved;
  };

  A.voidPayment = async function (paymentId, reason) {
    requirePermission("payments.manage");
    const why = required(reason, "a reason");
    await store.mutate(function (data) {
      const payment = findOrThrow(data.payments, paymentId, "Payment");
      if (payment.voided) throw new Error("This payment is already voided.");
      payment.voided = true;
      payment.voidedAt = new Date().toISOString();
      payment.voidedBy = store.currentUser().id;
      payment.voidReason = why;
      payment.updatedAt = new Date().toISOString();
      recalcLoan(data, payment.loanId);
    }, audit("void", "payment", paymentId, "Voided payment. Reason: " + why));
  };

  A.requestPayment = async function (input) {
    const loanId = required(input.loanId, "a loan");
    const amount = positive(input.amount, "Payment amount");
    const method = String(input.method || "Cash");
    const date = noFutureDate(input.date || U.today(), "payment date");
    const now = new Date().toISOString();
    const user = store.currentUser();
    let saved = null;
    await store.mutate(function (data) {
      const loan = findOrThrow(data.loans, loanId, "Loan");
      const member = data.members.find(function (m) { return m.id === user.id; });
      const borrowerName = loan.borrowerType === "non_member" ? loan.borrowerName : (member ? D.memberName(member) : user.name);
      const before = D.loanLedger(loan, data.payments, date);
      if (before.balance <= 0.005) throw new Error("This loan is already fully paid.");
      if (amount > before.balance + 0.005) throw new Error("Amount exceeds the outstanding balance.");
      saved = {
        id: U.uid("payreq"),
        loanId: loan.id,
        borrowerName: borrowerName,
        amount: amount,
        method: method,
        reference: String(input.reference || "").trim(),
        notes: String(input.notes || "").trim(),
        proofFile: String(input.proofFile || "").trim(),
        proofFileName: String(input.proofFileName || "").trim(),
        status: "pending",
        createdBy: user.id,
        createdByName: user.name,
        createdAt: now,
        updatedAt: now
      };
      data.paymentRequests.push(saved);
    }, audit("request", "payment_request", loanId, "Member requested payment of " + U.money(amount) + " via " + method + "."));
    return saved;
  };

  A.approvePaymentRequest = async function (paymentRequestId, input) {
    requirePermission("payments.manage");
    const notes = String(input.notes || "").trim();
    const now = new Date().toISOString();
    let saved = null;
    await store.mutate(function (data) {
      const req = findOrThrow(data.paymentRequests, paymentRequestId, "Payment request");
      if (req.status !== "pending") throw new Error("This payment request has already been decided.");
      const loan = findOrThrow(data.loans, req.loanId, "Loan");
      const date = noFutureDate(input.date || U.today(), "payment date");
      const before = D.loanLedger(loan, data.payments, date);
      if (before.balance <= 0.005) throw new Error("This loan is already fully paid.");
      const amount = positive(input.amount || req.amount, "Payment amount");
      if (amount > before.balance + 0.005) throw new Error("Amount exceeds the outstanding balance.");
      const allocation = D.paymentAllocationFor(data, loan, date, amount);
      let maxReceipt = 0;
      data.payments.forEach(function (p) {
        const n = parseInt(String(p.receiptNo || "").replace(/\D/g, ""), 10);
        if (isFinite(n) && n > maxReceipt) maxReceipt = n;
      });
      const payment = {
        id: U.uid("pay"),
        receiptNo: "OR-" + String(maxReceipt + 1).padStart(4, "0"),
        loanId: loan.id,
        borrowerName: req.borrowerName,
        date: date,
        amount: amount,
        interestPortion: allocation.interestPortion,
        principalPortion: allocation.principalPortion,
        credit: allocation.credit,
        method: req.method,
        reference: req.reference,
        notes: (req.notes ? req.notes + " | " : "") + (notes ? "Approved by treasurer: " + notes : notes),
        voided: false,
        createdBy: store.currentUser().id,
        createdByName: store.currentUser().name,
        createdAt: now,
        updatedAt: now
      };
      data.payments.push(payment);
      req.status = "approved";
      req.reviewedBy = store.currentUser().id;
      req.reviewedByName = store.currentUser().name;
      req.reviewedAt = now;
      req.reviewNotes = notes;
      req.updatedAt = now;
      recalcLoan(data, loan.id);
      saved = { payment: payment, request: req };
    }, audit("approve", "payment_request", paymentRequestId, "Approved member payment request " + U.money(amount) + "."));
    return saved;
  };

  A.rejectPaymentRequest = async function (paymentRequestId, input) {
    requirePermission("payments.manage");
    const reason = required(input.reason, "a rejection reason");
    const now = new Date().toISOString();
    await store.mutate(function (data) {
      const req = findOrThrow(data.paymentRequests, paymentRequestId, "Payment request");
      if (req.status !== "pending") throw new Error("This payment request has already been decided.");
      req.status = "rejected";
      req.reviewedBy = store.currentUser().id;
      req.reviewedByName = store.currentUser().name;
      req.reviewedAt = now;
      req.reviewNotes = reason;
      req.updatedAt = now;
    }, audit("reject", "payment_request", paymentRequestId, "Rejected member payment request. Reason: " + reason));
  };

  A.requestContributionPayment = async function (input) {
    const memberId = required(input.memberId, "a member");
    const period = required(input.period, "a contribution month");
    const amount = positive(input.amount, "Contribution amount");
    const method = String(input.method || "Cash");
    const now = new Date().toISOString();
    const user = store.currentUser();
    let saved = null;
    await store.mutate(function (data) {
      const member = findOrThrow(data.members, memberId, "Member");
      const existingReq = (data.contributionRequests || []).find(function (r) {
        return r.memberId === memberId && r.period === period && r.status === "pending";
      });
      if (existingReq) throw new Error("A contribution payment request for " + period + " is already pending.");
      const existingContrib = data.contributions.find(function (c) {
        return c.memberId === memberId && c.period === period && !c.voided;
      });
      if (existingContrib) throw new Error("A contribution for " + period + " already exists.");
      const expected = D.contributionExpected(member, data.settings);
      if (amount > expected + 0.005) throw new Error("Amount exceeds the expected " + U.money(expected) + " for " + period + ".");
      saved = {
        id: U.uid("contribreq"),
        memberId: member.id,
        memberName: D.memberName(member),
        period: period,
        amount: amount,
        method: method,
        reference: String(input.reference || "").trim(),
        notes: String(input.notes || "").trim(),
        proofFile: String(input.proofFile || "").trim(),
        proofFileName: String(input.proofFileName || "").trim(),
        status: "pending",
        createdBy: user.id,
        createdByName: user.name,
        createdAt: now,
        updatedAt: now
      };
      data.contributionRequests.push(saved);
    }, audit("request", "contribution_request", period, "Member requested contribution payment of " + U.money(amount) + " for " + period + " via " + method + "."));
    return saved;
  };

  A.approveContributionPayment = async function (contributionRequestId, input) {
    requirePermission("contributions.manage");
    const notes = String(input.notes || "").trim();
    const now = new Date().toISOString();
    let saved = null;
    await store.mutate(function (data) {
      const req = findOrThrow(data.contributionRequests, contributionRequestId, "Contribution request");
      if (req.status !== "pending") throw new Error("This contribution request has already been decided.");
      const period = required(req.period, "a contribution month");
      const amount = positive(req.amount, "Contribution amount");
      const member = findOrThrow(data.members, req.memberId, "Member");
      const expected = D.contributionExpected(member, data.settings);
      if (amount > expected + 0.005) throw new Error("Amount exceeds the expected " + U.money(expected) + " for " + period + ".");
      const existing = data.contributions.find(function (c) {
        return c.memberId === member.id && c.period === period && !c.voided;
      });
      if (existing) throw new Error("A contribution for this member and month already exists.");
      const contribution = {
        id: U.uid("contrib"),
        memberId: member.id,
        period: period,
        amount: amount,
        date: input.date || U.today(),
        method: req.method,
        reference: req.reference,
        notes: (req.notes ? req.notes + " | " : "") + (notes ? "Approved by treasurer: " + notes : notes),
        voided: false,
        createdBy: store.currentUser().id,
        createdByName: store.currentUser().name,
        createdAt: now,
        updatedAt: now
      };
      data.contributions.push(contribution);
      req.status = "approved";
      req.reviewedBy = store.currentUser().id;
      req.reviewedByName = store.currentUser().name;
      req.reviewedAt = now;
      req.reviewNotes = notes;
      req.updatedAt = now;
      saved = { contribution: contribution, request: req };
    }, audit("approve", "contribution_request", contributionRequestId, "Approved member contribution payment of " + U.money(amount) + " for " + period + "."));
    return saved;
  };

  A.rejectContributionPayment = async function (contributionRequestId, input) {
    requirePermission("contributions.manage");
    const reason = required(input.reason, "a rejection reason");
    const now = new Date().toISOString();
    await store.mutate(function (data) {
      const req = findOrThrow(data.contributionRequests, contributionRequestId, "Contribution request");
      if (req.status !== "pending") throw new Error("This contribution request has already been decided.");
      req.status = "rejected";
      req.reviewedBy = store.currentUser().id;
      req.reviewedByName = store.currentUser().name;
      req.reviewedAt = now;
      req.reviewNotes = reason;
      req.updatedAt = now;
    }, audit("reject", "contribution_request", contributionRequestId, "Rejected member contribution payment request. Reason: " + reason));
  };

  A.saveCashAdjustment = async function (input, id) {
    requirePermission("cash.manage");
    const direction = input.direction === "out" ? "out" : "in";
    const amount = positive(input.amount, "Amount");
    const date = noFutureDate(input.date || U.today(), "date");
    const description = required(input.description, "a description");
    let saved = null;
    await store.mutate(function (data) {
      const now = new Date().toISOString();
      if (id) {
        saved = findOrThrow(data.cashAdjustments, id, "Cash entry");
        if (saved.voided) throw new Error("This cash entry is voided.");
        Object.assign(saved, {
          direction: direction,
          category: String(input.category || "Adjustment"),
          amount: amount,
          date: date,
          description: description,
          reference: String(input.reference || "").trim(),
          updatedAt: now
        });
      } else {
        saved = {
          id: U.uid("cash"),
          direction: direction,
          category: String(input.category || "Adjustment"),
          amount: amount,
          date: date,
          description: description,
          reference: String(input.reference || "").trim(),
          voided: false,
          createdBy: store.currentUser().id,
          createdAt: now,
          updatedAt: now
        };
        data.cashAdjustments.push(saved);
      }
    }, audit(id ? "update" : "create", "cash", saved ? saved.id : id,
      (id ? "Updated" : "Recorded") + " cash " + direction + " of " + U.money(amount) + "."));
    return saved;
  };

  A.voidCashAdjustment = async function (id, reason) {
    requirePermission("cash.manage");
    const why = required(reason, "a reason");
    await store.mutate(function (data) {
      const row = findOrThrow(data.cashAdjustments, id, "Cash entry");
      if (row.voided) throw new Error("This cash entry is already voided.");
      row.voided = true;
      row.voidedAt = new Date().toISOString();
      row.voidedBy = store.currentUser().id;
      row.voidReason = why;
      row.updatedAt = new Date().toISOString();
    }, audit("void", "cash", id, "Voided cash entry. Reason: " + why));
  };

  A.saveUser = async function (input, id) {
    requirePermission("users.manage");
    const name = required(input.name, "a full name");
    const username = String(input.username || "").trim().toLowerCase();
    if (username && !/^[a-z0-9._-]{3,32}$/.test(username)) {
      throw new Error("Username must be 3-32 characters using letters, numbers, dots, dashes, or underscores.");
    }
    const email = String(input.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid email address.");
    }
    const role = D.ROLES.indexOf(input.role) >= 0 ? input.role : "member";
    const memberId = role === "member" ? required(input.memberId, "a linked member") : String(input.memberId || "");
    const active = input.active !== false;
    const password = String(input.password || "");
    if (!id && password.length < 6) throw new Error("Password must be at least 6 characters.");
    if (password && password.length < 6) throw new Error("Password must be at least 6 characters.");
    if (password.length > 128) throw new Error("Password must be 128 characters or fewer.");

    const auth = store.initFirebase();
    let saved = null;
    let salt = "";
    let hash = "";
    let firebaseUid = "";

    if (password) {
      salt = U.uid("salt");
      hash = await U.hashPassword(password, salt);
    }

    if (!id && auth && password) {
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        firebaseUid = cred.user.uid;
      } catch (e) {
        throw new Error("Unable to create Firebase account: " + (e.message || e.code));
      }
    } else if (id && auth && password) {
      const existing = store.get().users.find(function (u) { return u.id === id; });
      if (existing && existing.firebaseUid && auth.currentUser && auth.currentUser.uid === existing.firebaseUid) {
        try { await auth.currentUser.updatePassword(password); } catch (e) { /* fall through to local hash */ }
      } else if (existing) {
        try { await auth.sendPasswordResetEmail(existing.email || email); } catch (e) { /* ignore */ }
      }
    }

    await store.mutate(function (data) {
      const current = store.currentUser();
      const duplicate = username && data.users.find(function (u) {
        return u.username.toLowerCase() === username && u.id !== id;
      });
      if (duplicate) throw new Error("That username is already in use.");
      const duplicateEmail = data.users.find(function (u) {
        return u.email && u.email.toLowerCase() === email && u.id !== id;
      });
      if (duplicateEmail) throw new Error("That email address is already in use.");
      if (memberId) {
        findOrThrow(data.members, memberId, "Linked member");
        const memberUser = data.users.find(function (u) {
          return u.memberId === memberId && u.id !== id && u.active !== false;
        });
        if (memberUser) throw new Error("That member is already linked to another active user.");
      }
      if (id) {
        saved = findOrThrow(data.users, id, "User");
        const losingAdmin = saved.role === "admin" && (role !== "admin" || !active);
        if (losingAdmin) {
          const otherAdmins = data.users.filter(function (u) {
            return u.id !== id && u.role === "admin" && u.active !== false;
          });
          if (!otherAdmins.length) throw new Error("At least one active administrator is required.");
        }
        if (current && current.id === id && !active) throw new Error("You cannot disable your own account.");
        Object.assign(saved, {
          name: name,
          username: username,
          email: email,
          role: role,
          memberId: role === "member" ? memberId : (memberId || ""),
          active: active,
          firebaseUid: firebaseUid || saved.firebaseUid
        });
        if (hash) {
          saved.passwordHash = hash;
          saved.salt = salt;
          saved.passwordChangedAt = new Date().toISOString();
        }
      } else {
        saved = {
          id: U.uid("usr"),
          name: name,
          username: username,
          email: email,
          firebaseUid: firebaseUid,
          role: role,
          memberId: role === "member" ? memberId : (memberId || ""),
          passwordHash: hash,
          salt: salt,
          active: active,
          createdAt: new Date().toISOString(),
          lastLoginAt: ""
        };
        data.users.push(saved);
      }
    }, audit(id ? "update" : "create", "user", saved ? saved.id : id,
      (id ? "Updated" : "Created") + " user " + username + " (" + D.ROLE_LABELS[role] + ")."));

    return saved;
  };

  A.deleteUser = async function (id) {
    requirePermission("users.manage");
    await store.mutate(function (data) {
      const user = findOrThrow(data.users, id, "User");
      const current = store.currentUser();
      if (current && current.id === id) throw new Error("You cannot delete your own account.");
      if (user.role === "admin") {
        const others = data.users.filter(function (u) { return u.id !== id && u.role === "admin" && u.active !== false; });
        if (!others.length) throw new Error("At least one active administrator is required.");
      }
      data.users = data.users.filter(function (u) { return u.id !== id; });
      data.audit.unshift({
        id: U.uid("aud"), at: new Date().toISOString(),
        userId: current.id, userName: current.name, userRole: current.role,
        action: "delete", entity: "user", entityId: id,
        details: "Deleted user " + user.username + "."
      });
    });
  };

  A.approveUser = async function (pendingId, memberId, role) {
    requirePermission("users.manage");
    const assignedRole = D.ROLES.indexOf(role) >= 0 ? role : "member";
    await store.mutate(function (data) {
      const pending = data.pendingUsers.find(function (u) { return u.id === pendingId; });
      if (!pending) throw new Error("Account request not found.");
      if (pending.status === "approved" || pending.status === "rejected") {
        throw new Error("This account request has already been processed.");
      }

      const pendingUsername = String(pending.username || "").trim().toLowerCase() ||
        String(pending.email || "").split("@")[0].replace(/[^a-z0-9._-]/g, "").toLowerCase();
      const existingUser = data.users.find(function (u) {
        return (pendingUsername && u.username.toLowerCase() === pendingUsername) ||
          (u.email && pending.email && u.email.toLowerCase() === pending.email.toLowerCase());
      });
      if (existingUser) throw new Error("That username or email already exists as a user.");

      if (memberId) {
        const member = data.members.find(function (m) { return m.id === memberId; });
        if (!member) throw new Error("Selected member not found.");
        const alreadyLinked = data.users.find(function (u) { return u.memberId === memberId && u.active !== false; });
        if (alreadyLinked) throw new Error("That member is already linked to another active user.");
      }

      const user = {
        id: pending.id,
        name: pending.name,
        username: pendingUsername,
        email: pending.email,
        firebaseUid: pending.firebaseUid || "",
        role: assignedRole,
        memberId: memberId || "",
        passwordHash: pending.passwordHash,
        salt: pending.salt,
        active: true,
        status: "active",
        createdAt: pending.createdAt,
        lastLoginAt: "",
        passwordChangedAt: new Date().toISOString()
      };
      data.users.push(user);
      data.pendingUsers = data.pendingUsers.filter(function (u) { return u.id !== pendingId; });
      data.audit.unshift({
        id: U.uid("aud"), at: new Date().toISOString(),
        userId: store.currentUser().id, userName: store.currentUser().name, userRole: store.currentUser().role,
        action: "approve", entity: "user", entityId: user.id,
        details: "Approved account: " + pendingUsername + " · Assigned role: " + assignedRole + (memberId ? " · Linked to member " + memberId : "")
      });
    });
  };

  A.rejectUser = async function (pendingId) {
    requirePermission("users.manage");
    await store.mutate(function (data) {
      const pending = data.pendingUsers.find(function (u) { return u.id === pendingId; });
      if (!pending) throw new Error("Account request not found.");
      if (pending.status === "approved" || pending.status === "rejected") {
        throw new Error("This account request has already been processed.");
      }
      data.pendingUsers = data.pendingUsers.filter(function (u) { return u.id !== pendingId; });
      data.audit.unshift({
        id: U.uid("aud"), at: new Date().toISOString(),
        userId: store.currentUser().id, userName: store.currentUser().name, userRole: store.currentUser().role,
        action: "reject", entity: "user", entityId: pending.id,
        details: "Rejected account request: " + (pending.username || pending.email)
      });
    });
  };

  A.resetUserPassword = async function (userId, password) {
    requirePermission("users.manage");
    if (String(password || "").length < 6) throw new Error("Password must be at least 6 characters.");
    if (String(password || "").length > 128) throw new Error("Password must be 128 characters or fewer.");
    const auth = store.initFirebase();
    let salt = "";
    let hash = "";
    if (password) {
      salt = U.uid("salt");
      hash = await U.hashPassword(password, salt);
    }

    const userData = store.get();
    const user = userData.users.find(function (u) { return u.id === userId; });
    if (!user) throw new Error("User not found.");
    const email = user.email || user.username + "@coop.local";

    if (auth) {
      if (!user.firebaseUid) {
        try {
          const cred = await auth.createUserWithEmailAndPassword(email, password);
          user.firebaseUid = cred.user.uid;
        } catch (e) {
          try {
            await auth.signInWithEmailAndPassword(email, password);
            user.firebaseUid = auth.currentUser.uid;
          } catch (e2) {
            // Fall through; local password hash will still be updated.
          }
        }
      }
      if (user.firebaseUid && auth.currentUser && auth.currentUser.uid === user.firebaseUid) {
        try {
          await auth.currentUser.updatePassword(password);
        } catch (e) {
          // Fall through; local password hash will still be updated.
        }
      } else {
        try { await auth.sendPasswordResetEmail(email); } catch (e) { /* ignore */ }
      }
    }

    store.mutate(function (data) {
      const u = findOrThrow(data.users, userId, "User");
      u.firebaseUid = user.firebaseUid;
      u.salt = salt;
      u.passwordHash = hash;
      u.passwordChangedAt = new Date().toISOString();
    }, audit("password", "user", userId, "Reset user password."));
  };

  A.updateOwnProfile = async function (input) {
    const user = requireUser();
    const name = required(input.name, "a full name");
    const auth = store.initFirebase();
    const emailLocked = !!auth;
    let email = user.email;
    const requestedEmail = String(input.email || "").trim().toLowerCase();
    if (emailLocked) {
      if (requestedEmail && requestedEmail !== user.email) {
        throw new Error("Your email is managed by the sign-in provider. Contact an administrator to change it.");
      }
    } else {
      email = requestedEmail;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Enter a valid email address.");
      }
    }
    await store.mutate(function (data) {
      const row = findOrThrow(data.users, user.id, "User");
      const duplicateEmail = email && data.users.find(function (u) {
        return u.id !== user.id && u.email && u.email.toLowerCase() === email.toLowerCase();
      });
      if (duplicateEmail) throw new Error("That email address is already in use.");
      row.name = name;
      row.email = email;
      row.updatedAt = new Date().toISOString();
    }, audit("update", "user", user.id, "Updated own profile."));
    return store.currentUser();
  };

  A.changeOwnPassword = async function (currentPassword, newPassword) {
    requireUser();
    const nextPassword = String(newPassword || "");
    if (nextPassword.length < 6) throw new Error("New password must be at least 6 characters.");
    if (nextPassword.length > 128) throw new Error("New password must be 128 characters or fewer.");
    const user = store.currentUser();
    const auth = store.initFirebase();
    const email = user.email || user.username + "@coop.local";
    if (auth) {
      if (!user.firebaseUid) {
        try {
          const cred = await auth.createUserWithEmailAndPassword(email, String(currentPassword || ""));
          user.firebaseUid = cred.user.uid;
        } catch (e) {
          // User may already exist in Firebase; try to sign in
          try {
            await auth.signInWithEmailAndPassword(email, String(currentPassword || ""));
            user.firebaseUid = auth.currentUser.uid;
          } catch (e2) {
            throw new Error("Current password is incorrect.");
          }
        }
      }
      try {
        await auth.currentUser.updatePassword(nextPassword);
      } catch (e) {
        if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") throw new Error("Current password is incorrect.");
        throw new Error("Password change failed: " + (e.message || e.code));
      }
      store.mutate(function (db) {
        const row = db.users.find(function (u) { return u.id === user.id; });
        if (!row.firebaseUid) row.firebaseUid = auth.currentUser.uid;
      }, audit("password", "user", user.id, "Changed own password."));
    } else {
      const valid = await U.verifyPassword(String(currentPassword || ""), user.salt, user.passwordHash);
      if (!valid) throw new Error("Current password is incorrect.");
      const salt = U.uid("salt");
      const newHash = await U.hashPassword(nextPassword, salt);
      store.mutate(function (db) {
        const row = db.users.find(function (u) { return u.id === user.id; });
        row.salt = salt;
        row.passwordHash = newHash;
        row.passwordChangedAt = new Date().toISOString();
      }, audit("password", "user", user.id, "Changed own password."));
    }
  };

  A.saveSettings = async function (input) {
    requirePermission("settings.manage");
    const settings = store.get().settings;
    const updated = {
      orgName: required(input.orgName, "an organization name"),
      orgAddress: String(input.orgAddress || "").trim(),
      orgContact: String(input.orgContact || "").trim(),
      currency: String(input.currency || "PHP").toUpperCase().slice(0, 3),
      locale: String(input.locale || "en-PH"),
      fiscalYear: Math.round(U.toNumber(input.fiscalYear)) || new Date().getFullYear(),
      monthlyContribution: nonNegative(input.monthlyContribution, "Monthly contribution"),
      latePenalty: nonNegative(input.latePenalty, "Late penalty"),
      latePenaltyGraceDays: Math.max(0, Math.round(U.toNumber(input.latePenaltyGraceDays))),
      interestRate: nonNegative(input.interestRate, "Interest rate"),
      maxLoanAmount: nonNegative(input.maxLoanAmount, "Loan ceiling"),
      openingCash: U.toNumber(input.openingCash),
      profitShareBasis: input.profitShareBasis === "contributions" ? "contributions" : "shares",
      requireOverLimitApproval: input.requireOverLimitApproval === "on" || input.requireOverLimitApproval === true,
      theme: settings.theme || "light"
    };
    if (updated.interestRate > 100) throw new Error("Interest rate cannot exceed 100% per month.");
    await store.mutate(function (data) {
      data.settings = Object.assign({}, data.settings, updated);
    }, audit("update", "settings", "", "Updated organization and finance settings."));
    return updated;
  };

  A.exportBackup = function () {
    requirePermission("users.manage");
    return store.exportData();
  };

  A.importBackup = function (payload) {
    requirePermission("users.manage");
    return store.importData(payload);
  };

  A.resetSystem = async function () {
    requirePermission("users.manage");
    await store.resetAll();
  };
})();
