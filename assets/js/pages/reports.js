(function () {
  "use strict";
  const COOP = (window.COOP = window.COOP || {});
  const U = COOP.utils;
  const D = COOP.domain;
  const UI = COOP.ui;
  const store = COOP.store;
  const pages = (COOP.pages = COOP.pages || {});

let currentReport = "overview";
let profitInput = "";
const profitBasis = "shares";

  function stat(icon, label, value, hint, tone) {
    return '<div class="stat ' + (tone || "") + '">' +
      '<div class="stat-head"><span class="label">' + U.esc(label) + '</span><span class="stat-icon-wrap"><span class="stat-icon">' + U.icon(icon) + '</span><span class="stat-glow" aria-hidden="true"></span></span></div>' +
      '<div class="value">' + value + "</div>" + (hint ? '<div class="hint">' + hint + "</div>" : "") + "</div>";
  }

  function overview(db) {
    const f = D.funds(db);
    const contributionSheet = D.contributionRows(db, U.monthKey());
    const series = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = U.monthKey(d);
      const contributions = U.sum((db.contributions || []).filter(function (c) {
        return !c.voided && c.period === key;
      }), function (c) { return c.amount; });
      const repayments = U.sum((db.payments || []).filter(function (p) {
        return !p.voided && p.date && U.monthKey(p.date) === key;
      }), function (p) { return p.amount; });
      series.push({ key: key, label: D.monthShort(key), contributions: U.round2(contributions), repayments: U.round2(repayments) });
    }
    return '<div class="stat-grid">' +
        stat("banknote", "Cash on hand", U.money(f.cashOnHand), "Available to lend", f.cashOnHand < 0 ? "tone-danger" : "") +
        stat("wallet", "Total contributions", U.money(f.totalContributions), f.activeMembers + " active members") +
        stat("hand-coins", "Loans outstanding", U.money(f.outstanding), f.activeLoanCount + " active " + U.plural(f.activeLoanCount, "loan"), "tone-info") +
        stat("percent", "Interest collected", U.money(f.interestCollected), "From loan payments", "tone-success") +
      "</div>" +
      '<div class="grid-2">' +
        '<div class="card"><div class="card-head"><div><h2>Fund flow</h2><div class="sub">How cash moved through the cooperative</div></div></div><div class="card-body">' +
          '<div class="kv">' +
            "<dt>Opening cash</dt><dd>" + U.money(f.openingCash) + "</dd>" +
            "<dt>Member contributions</dt><dd>" + U.money(f.totalContributions) + "</dd>" +
            "<dt>Loan repayments received</dt><dd>" + U.money(f.totalRepayments) + "</dd>" +
            "<dt>Other cash in</dt><dd>" + U.money(f.otherIn) + "</dd>" +
            "<dt>Loans released</dt><dd>−" + U.money(f.totalReleased) + "</dd>" +
            "<dt>Other cash out</dt><dd>−" + U.money(f.otherOut) + "</dd>" +
            '<div style="grid-column:1/-1;height:1px;background:var(--border);margin:4px 0"></div>' +
            "<dt><strong>Cash on hand</strong></dt><dd><strong>" + U.money(f.cashOnHand) + "</strong></dd>" +
          "</div>" +
          '<div class="alert ' + (f.cashOnHand < 0 ? "danger" : "info") + ' mt-3">' + U.icon("info", "icon-sm") +
          "<div>Cash on hand is what can be loaned. Outstanding loans are tracked separately.</div></div>" +
        "</div></div>" +
        '<div class="card"><div class="card-head"><div><h2>Collection summary</h2><div class="sub">' + U.esc(U.formatMonth(contributionSheet.period)) + "</div></div></div><div class=\"card-body\">" +
          '<div class="summary-strip">' +
            '<div class="summary-box"><div class="label">Expected</div><div class="value">' + U.money(contributionSheet.expected) + '</div><div class="sub">' + contributionSheet.rows.length + " members</div></div>" +
            '<div class="summary-box"><div class="label">Collected</div><div class="value">' + U.money(contributionSheet.paid) + '</div><div class="sub">' + contributionSheet.paidCount + " paid</div></div>" +
            '<div class="summary-box"><div class="label">Outstanding</div><div class="value">' + U.money(contributionSheet.balance) + '</div><div class="sub">' + contributionSheet.unpaidCount + " unpaid</div></div>" +
          "</div>" +
          '<div class="progress-row mt-3"><div class="progress-label"><span>Collection rate</span><span>' + U.percent(contributionSheet.expected ? contributionSheet.paid / contributionSheet.expected : 0, 1) + "</span></div>" +
            '<div class="progress success"><span style="width:' + Math.round((contributionSheet.expected ? contributionSheet.paid / contributionSheet.expected : 0) * 100) + '%"></span></div></div>' +
          '<div class="divider"></div>' +
          '<div class="kv"><dt>Active members</dt><dd>' + f.activeMembers + "</dd>" +
            "<dt>Total shares</dt><dd>" + U.number(f.totalShares, 2) + "</dd>" +
            "<dt>Loan settlement</dt><dd>Before December each year</dd></div>" +
        "</div></div>" +
      "</div>" +
      '<div class="card mt-3"><div class="card-head"><div><h2>Six-month cash collections</h2><div class="sub">Contributions and loan repayments by month</div></div></div>' +
        '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Month</th><th class="num">Contributions</th><th class="num">Loan repayments</th><th class="num">Total</th></tr></thead><tbody>' +
        series.map(function (row) {
          return "<tr><td>" + U.esc(row.label) + '</td><td class="num">' + U.money(row.contributions) + '</td><td class="num">' + U.money(row.repayments) + '</td><td class="num strong">' + U.money(row.contributions + row.repayments) + "</td></tr>";
        }).join("") +
        "</tbody></table></div></div></div>";
  }

  function totalInterestAccrued(db) {
    let total = 0;
    (db.loans || []).forEach(function (loan) {
      const s = D.loanLedger(loan, db.payments, U.today());
      total = U.round2(total + s.totalInterestAccrued);
    });
    return total;
  }

  const ADMIN_FEE_RATE = 0.05;

  function profit(db) {
    const adminFee = U.round2(totalInterestAccrued(db) * ADMIN_FEE_RATE);
    profitInput = String(U.round2(totalInterestAccrued(db) - adminFee));
    const result = D.profitDistribution(db, profitInput || 0, profitBasis);
    const rows = result.rows.length ? result.rows.map(function (row) {
      return '<tr><td><div class="cell-person">' + UI.avatar(D.memberName(row.member)) +
        '<div class="meta"><div class="name">' + U.esc(D.memberName(row.member)) + '</div><div class="sub">' + U.esc(row.member.memberNo) + "</div></div></div></td>" +
        '<td class="num">' + U.number(row.units, 2) + '</td><td class="num">' + U.percent(result.totalUnits ? row.units / result.totalUnits : 0, 2) + '</td>' +
        '<td class="num strong">' + U.money(row.amount) + "</td></tr>";
    }).join("") : '<tr><td colspan="4" class="empty-row">Add active members to distribute profit.</td></tr>';

    const noUnitsWarning = result.totalUnits <= 0
      ? '<div class="alert warning mt-3">' + U.icon("info", "icon-sm") +
        "<div>There are no " + (profitBasis === "shares" ? "shares" : "contributions") +
        " on record for active members, so no profit can be distributed. Add member shares or contributions before computing a distribution.</div></div>"
      : "";
    return '<div class="card mb-3"><div class="card-body"><form id="profit-form"><div class="form-grid">' +
      '<div class="field"><label for="profit-total">Total profit to distribute</label><input class="input money-input" id="profit-total" name="profit" type="text" value="' + U.esc(U.money(profitInput || 0)) + '" placeholder="0.00" readonly></div>' +
      '<div class="field"><label for="admin-fee">Admin fee (auto)</label><input class="input money-input" id="admin-fee" name="adminFee" type="text" value="' + U.esc(U.money(adminFee)) + '" placeholder="0.00" readonly></div>' +
      '<div class="field full"><div class="help">The admin fee is calculated automatically as 5% of the cumulative total interest earned on all loans as of today (currently ' + U.money(totalInterestAccrued(db)) + ").</div></div>" +
      '<div class="field full"><span class="badge info">Distributed by shares availed</span></div>' +
    "</div></form></div></div>" +
    noUnitsWarning +
    '<div class="stat-grid">' +
      stat("coins", "Profit pool", U.money(result.totalProfit), "Total interest accrued as of " + U.today()) +
      stat("layers", "Total units", U.number(result.totalUnits, 2), "Member shares") +
      stat("scale", "Rate per unit", U.money(result.perUnit), "Per share", "tone-info") +
      stat("users", "Members included", U.number(result.rows.length, 0), "Active members", "tone-success") +
    "</div>" +
      '<div class="card"><div class="card-head"><div><h2>Profit allocation</h2><div class="sub">Total profit is divided by total shares</div></div>' +
      (Math.abs(result.remainder) >= 0.01 && result.totalUnits > 0 ? '<span class="badge warning">Rounding adjusted</span>' : "") + "</div>" +
      '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Member</th><th class="num">Shares</th><th class="num">Share</th><th class="num">Profit share</th></tr></thead><tbody>' + rows +
      '<tr class="table-total"><td>Total</td><td class="num">' + U.number(result.totalUnits, 2) + '</td><td class="num">100%</td><td class="num">' + U.money(result.distributed) + "</td></tr>" +
      "</tbody></table></div></div></div>" +
    '<div class="alert info mt-3">' + U.icon("info", "icon-sm") + "<div>This schedule is a computation, not a posted transaction. Review and approve the distribution before recording payments or credits.</div></div>";
  }

  function contributions(db) {
    const period = U.monthKey();
    const sheet = D.contributionRows(db, period);
    const sheetMap = {};
    sheet.rows.forEach(function (r) { sheetMap[r.member.id] = r; });
    const members = D.memberOptions(db, true);
    const rows = members.map(function (member) {
      const current = sheetMap[member.id];
      const total = U.sum((db.contributions || []).filter(function (c) { return c.memberId === member.id && !c.voided; }), function (c) { return c.amount; });
      const year = U.sum((db.contributions || []).filter(function (c) {
        return c.memberId === member.id && !c.voided && c.period && c.period.slice(0, 4) === String(new Date().getFullYear());
      }), function (c) { return c.amount; });
      return '<tr><td><div class="cell-person">' + UI.avatar(D.memberName(member)) +
        '<div class="meta"><div class="name">' + U.esc(D.memberName(member)) + '</div><div class="sub">' + U.esc(member.memberNo) + "</div></div></div></td>" +
        '<td class="num">' + U.money(current ? current.expected : 0) + "</td>" +
        '<td class="num">' + U.money(current ? current.paid : 0) + "</td>" +
        "<td>" + UI.statusBadge(current ? current.status : "unpaid") + "</td>" +
        '<td class="num">' + U.money(year) + "</td>" +
        '<td class="num strong">' + U.money(total) + "</td></tr>";
    }).join("");
    return '<div class="stat-grid">' +
        stat("clipboard-list", "Expected this month", U.money(sheet.expected), sheet.rows.length + " active members") +
        stat("wallet", "Collected this month", U.money(sheet.paid), U.percent(sheet.expected ? sheet.paid / sheet.expected : 0, 1), "tone-success") +
        stat("clock", "Outstanding this month", U.money(sheet.balance), sheet.unpaidCount + " unpaid", sheet.balance ? "tone-warning" : "") +
        stat("coins", "All-time contributions", U.money(D.funds(db).totalContributions), "Posted records", "tone-info") +
      "</div>" +
      '<div class="card"><div class="card-head"><div><h2>Contribution report</h2><div class="sub">Current month and lifetime member totals</div></div></div>' +
      '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Member</th><th class="num">Expected</th><th class="num">Paid this month</th><th>Status</th><th class="num">This year</th><th class="num">All time</th></tr></thead><tbody>' + rows + "</tbody></table></div></div></div>";
  }

  function loans(db) {
    const summaries = (db.loans || []).map(function (loan) {
      return { loan: loan, summary: D.loanLedger(loan, db.payments, U.today()) };
    }).sort(function (a, b) { return b.summary.balance - a.summary.balance; });
    const portfolio = summaries.filter(function (x) { return x.loan.status === "active" || x.loan.status === "paid" || x.summary.paid; });
    const outstanding = U.sum(portfolio, function (x) { return x.summary.balance; });
    const interest = U.sum(portfolio, function (x) { return x.summary.totalInterestAccrued; });
    const rows = summaries.length ? summaries.map(function (item) {
      const loan = item.loan;
      const summary = item.summary;
      return "<tr><td><span class=\"strong\">" + U.esc(loan.loanNo) + '</span><div class="sub">' + U.formatDate(loan.startDate) + "</div></td>" +
        "<td>" + U.esc(D.borrowerName(loan, db)) + (loan.borrowerType === "non_member" ? '<div class="sub">Care of ' + U.esc(D.careOfName(loan, db)) + "</div>" : "") + "</td>" +
        '<td class="num">' + U.money(loan.principal) + "</td>" +
        '<td class="num">' + U.money(summary.totalInterestAccrued) + "</td>" +
        '<td class="num">' + U.money(summary.totalReceived) + "</td>" +
        '<td class="num strong">' + U.money(summary.balance) + "</td>" +
        '<td class="num">' + U.number(loan.interestRate, 2) + "%</td>" +
        "<td>" + UI.statusBadge(summary.displayStatus) + "</td></tr>";
    }).join("") : '<tr><td colspan="8" class="empty-row">No loans recorded.</td></tr>';

    return '<div class="stat-grid">' +
        stat("hand-coins", "Outstanding balance", U.money(outstanding), summaries.length + " " + U.plural(summaries.length, "loan") + " in total", "tone-info") +
        stat("percent", "Interest earned", U.money(interest), "Added daily") +
        stat("calendar", "Annual settlement", U.number(portfolio.filter(function (x) { return x.summary.balance > 0.005; }).length, 0), "Settle by December", "tone-info") +
        stat("check-circle", "Fully paid", U.number(summaries.filter(function (x) { return x.summary.paid; }).length, 0), "Closed loans", "tone-success") +
      "</div>" +
          '<div class="card"><div class="card-head"><div><h2>Loan report</h2><div class="sub">Principal, interest, payments, and balances</div></div></div>' +
      '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Loan</th><th>Borrower</th><th class="num">Principal</th><th class="num">Interest</th><th class="num">Received</th><th class="num">Balance</th><th class="num">Rate</th><th>Status</th></tr></thead><tbody>' + rows +
      '<tr class="table-total"><td colspan="5">Total balance</td><td class="num">' + U.money(outstanding) + '</td><td colspan="2"></td></tr>' +
      "</tbody></table></div></div></div>";
  }

  function overpayments(db) {
    const payments = (db.payments || []).filter(function (p) {
      return !p.voided && U.toNumber(p.credit) > 0.005;
    }).sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date)) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    const totalAmount = U.round2(U.sum(payments, function (p) { return p.amount; }));
    const totalApplied = U.round2(U.sum(payments, function (p) { return U.toNumber(p.amount) - U.toNumber(p.credit); }));
    const totalCredit = U.round2(U.sum(payments, function (p) { return p.credit; }));
    const borrowers = {};
    payments.forEach(function (payment) {
      const loan = (db.loans || []).find(function (l) { return l.id === payment.loanId; });
      const name = loan ? D.borrowerName(loan, db) : (payment.borrowerName || "Unknown borrower");
      const key = loan && loan.borrowerType === "member" ? "member:" + loan.memberId : "borrower:" + name.toLowerCase();
      borrowers[key] = true;
    });
    const borrowerCount = Object.keys(borrowers).length;
    const latest = payments.length ? payments[0].date : "";
    const rows = payments.length ? payments.map(function (payment) {
      const loan = (db.loans || []).find(function (l) { return l.id === payment.loanId; });
      const member = loan && loan.borrowerType === "member" ? (db.members || []).find(function (m) { return m.id === loan.memberId; }) : null;
      const borrower = loan ? D.borrowerName(loan, db) : (payment.borrowerName || "Unknown borrower");
      return '<tr><td><span class="strong">' + U.esc(payment.receiptNo) + '</span><div class="sub">' + U.formatDate(payment.date) + "</div></td>" +
        '<td><div class="cell-person">' + UI.avatar(borrower) +
          '<div class="meta"><div class="name">' + U.esc(borrower) + '</div><div class="sub">' + U.esc(member ? member.memberNo : "Non-member") + "</div></div></div></td>" +
        "<td>" + U.esc(loan ? loan.loanNo : "—") + "</td>" +
        '<td class="num">' + U.money(payment.amount) + "</td>" +
        '<td class="num">' + U.money(U.toNumber(payment.amount) - U.toNumber(payment.credit)) + "</td>" +
        '<td class="num"><span class="badge warning">' + U.money(payment.credit) + "</span></td>" +
        "<td>" + U.esc(payment.method || "Cash") + "</td></tr>";
    }).join("") : '<tr><td colspan="7" class="empty-row">No overpayments recorded. All posted payments were within the loan payoff balance.</td></tr>';

    return '<div class="stat-grid">' +
        stat("wallet", "Total excess credit", U.money(totalCredit), payments.length + " posted " + U.plural(payments.length, "receipt"), totalCredit > 0 ? "tone-warning" : "") +
        stat("credit-card", "Payment amount", U.money(totalAmount), "Including excess amounts") +
        stat("users", "Borrowers affected", U.number(borrowerCount, 0), borrowerCount ? "Review the credits below" : "No affected accounts") +
        stat("calendar", "Latest overpayment", latest ? U.formatDate(latest) : "—", "Excess paid above the payoff") +
      "</div>" +
      '<div class="alert ' + (payments.length ? "warning" : "info") + ' mt-3">' + U.icon("info", "icon-sm") +
        "<div>Excess payments are held as credits on the payment record. They are not automatically applied to future loans or contributions.</div></div>" +
      '<div class="card mt-3"><div class="card-head"><div><h2>Overpayment register</h2><div class="sub">Payments received above the outstanding loan balance</div></div></div>' +
      '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Receipt</th><th>Borrower</th><th>Loan</th><th class="num">Payment</th><th class="num">Applied</th><th class="num">Excess</th><th>Method</th></tr></thead><tbody>' +
      rows +
      (payments.length ? '<tr class="table-total"><td colspan="3">Total overpayments</td><td class="num">' + U.money(totalAmount) + '</td><td class="num">' + U.money(totalApplied) + '</td><td class="num">' + U.money(totalCredit) + '</td><td></td></tr>' : "") +
      "</tbody></table></div></div></div>";
  }

  function members(db) {
    const funds = D.funds(db);
    const rows = D.memberOptions(db, true).map(function (member) {
      const metrics = D.memberMetrics(db, member);
      return '<tr><td><div class="cell-person">' + UI.avatar(D.memberName(member)) +
        '<div class="meta"><div class="name">' + U.esc(D.memberName(member)) + '</div><div class="sub">' + U.esc(member.memberNo) + "</div></div></div></td>" +
        "<td>" + UI.statusBadge(member.status || "active") + "</td>" +
        '<td class="num">' + U.number(metrics.shares, 2) + "</td>" +
        '<td class="num">' + U.percent(metrics.sharePercent, 2) + "</td>" +
        '<td class="num">' + U.money(metrics.contributions) + "</td>" +
        '<td class="num">' + U.money(metrics.outstanding) + "</td>" +
        '<td class="num">' + metrics.activeLoans + "</td></tr>";
    }).join("");
    return '<div class="stat-grid">' +
        stat("users", "Active members", U.number(funds.activeMembers, 0), funds.inactiveMembers + " inactive") +
        stat("layers", "Total shares", U.number(funds.totalShares, 2), "Profit-sharing units") +
        stat("wallet", "Total contributions", U.money(funds.totalContributions), "All posted") +
        stat("hand-coins", "Loans outstanding", U.money(funds.outstanding), funds.activeLoanCount + " active", "tone-info") +
      "</div>" +
          '<div class="card"><div class="card-head"><div><h2>Member report</h2><div class="sub">Shares, contributions, loans, and standing</div></div></div>' +
      '<div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Member</th><th>Status</th><th class="num">Shares</th><th class="num">Share %</th><th class="num">Contributions</th><th class="num">Loan balance</th><th class="num">Open loans</th></tr></thead><tbody>' + rows + "</tbody></table></div></div></div>";
  }

  function exportCurrent(db) {
    if (currentReport === "overview") {
      const f = D.funds(db);
      const rows = [["COOP overview report", U.today()], [], ["Metric", "Value"],
        ["Cash on hand", f.cashOnHand], ["Total contributions", f.totalContributions], ["Loan repayments", f.totalRepayments],
        ["Loans released", f.totalReleased], ["Outstanding balance", f.outstanding], ["Interest collected", f.interestCollected],
        ["Active members", f.activeMembers], ["Total shares", f.totalShares], ["Loan settlement", "Before December each year"]];
      UI.downloadCSV("coop-overview-" + U.today() + ".csv", rows);
    } else if (currentReport === "profit") {
      const result = D.profitDistribution(db, profitInput || 0, "shares");
      const rows = [["Profit distribution", "shares", "Total", result.totalProfit], ["Member", "Units", "Share", "Amount"]];
      result.rows.forEach(function (r) { rows.push([D.memberName(r.member), r.units, result.totalUnits ? r.units / result.totalUnits : 0, r.amount]); });
      UI.downloadCSV("coop-profit-distribution.csv", rows);
    } else if (currentReport === "contributions") {
      const sheet = D.contributionRows(db, U.monthKey());
      const rows = [["Member", "Expected", "Paid", "Status", "All time contributions"]];
      sheet.rows.forEach(function (r) {
        const total = U.sum((db.contributions || []).filter(function (c) { return c.memberId === r.member.id && !c.voided; }), function (c) { return c.amount; });
        rows.push([D.memberName(r.member), r.expected, r.paid, r.status, total]);
      });
      UI.downloadCSV("coop-contribution-report.csv", rows);
    } else if (currentReport === "loans") {
      const rows = [["Loan", "Borrower", "Principal", "Interest", "Received", "Balance", "Rate", "Status"]];
      (db.loans || []).forEach(function (loan) {
        const s = D.loanLedger(loan, db.payments, U.today());
        rows.push([loan.loanNo, D.borrowerName(loan, db), loan.principal, s.totalInterestAccrued, s.totalReceived, s.balance, loan.interestRate, s.displayStatus]);
      });
      UI.downloadCSV("coop-loan-report.csv", rows);
    } else if (currentReport === "overpayments") {
      const rows = [["Date", "Receipt", "Borrower", "Loan", "Payment amount", "Applied to loan", "Excess credit", "Method", "Reference"]];
      (db.payments || []).filter(function (p) { return !p.voided && U.toNumber(p.credit) > 0.005; })
        .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
        .forEach(function (payment) {
          const loan = (db.loans || []).find(function (l) { return l.id === payment.loanId; });
          rows.push([
            payment.date, payment.receiptNo, loan ? D.borrowerName(loan, db) : (payment.borrowerName || ""),
            loan ? loan.loanNo : "", payment.amount, U.round2(U.toNumber(payment.amount) - U.toNumber(payment.credit)),
            payment.credit, payment.method, payment.reference
          ]);
        });
      UI.downloadCSV("coop-overpayments-" + U.today() + ".csv", rows);
    } else if (currentReport === "members") {
      const rows = [["Member", "Status", "Shares", "Contributions", "Loan balance", "Open loans"]];
      D.memberOptions(db, true).forEach(function (member) {
        const metrics = D.memberMetrics(db, member);
        rows.push([D.memberName(member), member.status || "active", metrics.shares, metrics.contributions, metrics.outstanding, metrics.activeLoans]);
      });
      UI.downloadCSV("coop-member-report.csv", rows);
    }
    UI.toast("Report exported.");
  }

  const TABLES = {
    overview: overview,
    profit: profit,
    contributions: contributions,
    loans: loans,
    overpayments: overpayments,
    members: members
  };

  pages.reports = {
    render: function (root) {
      const db = store.get();
      root.innerHTML =
        '<div class="page-head"><div><span class="eyebrow">' + U.icon("chart", "icon-sm") + " Analysis</span>" +
          "<h1>Reports</h1><div class=\"sub\">Fund position, profit sharing, collections, loans, and overpayments.</div></div>" +
          '<div class="page-actions no-print"><button class="btn" data-action="export">' + U.icon("download", "icon-sm") + " Export CSV</button>" +
          '<button class="btn" data-action="print">' + U.icon("printer", "icon-sm") + " Print</button></div></div>" +
        '<div class="report-tabs no-print">' +
          '<button class="tab ' + (currentReport === "overview" ? "active" : "") + '" data-report="overview">Overview</button>' +
          '<button class="tab ' + (currentReport === "profit" ? "active" : "") + '" data-report="profit">Profit sharing</button>' +
          '<button class="tab ' + (currentReport === "contributions" ? "active" : "") + '" data-report="contributions">Contributions</button>' +
          '<button class="tab ' + (currentReport === "loans" ? "active" : "") + '" data-report="loans">Loans</button>' +
          '<button class="tab ' + (currentReport === "overpayments" ? "active" : "") + '" data-report="overpayments">Overpayments</button>' +
          '<button class="tab ' + (currentReport === "members" ? "active" : "") + '" data-report="members">Member balances</button>' +
        "</div>" +
        '<div id="report-content">' + TABLES[currentReport](db) + "</div>";

      root.querySelectorAll("[data-report]").forEach(function (button) {
        button.addEventListener("click", function () {
          currentReport = button.getAttribute("data-report");
          pages.reports.render(root);
        });
      });
      root.querySelector("[data-action=export]").addEventListener("click", function () { exportCurrent(db); });
      root.querySelector("[data-action=print]").addEventListener("click", function () { UI.print(); });

    }
  };
})();
