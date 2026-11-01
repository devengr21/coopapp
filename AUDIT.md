# PHSC Coop — Security & Code Audit

Audit date: 2026-11-01
Scope: full application (`index.html`, `serve.js`, `firestore.rules`, `assets/js/**`)

This document records the findings and the changes made in this commit. Items marked
**Fixed** are addressed in the current code; the rest are outstanding follow-ups.

---

## Critical

### 1. Firestore rules exposed and allowed overwriting the whole database — Fixed
`firestore.rules:5-9` previously allowed public reads (`allow read: if true`) and any
authenticated write to `coops/{doc}`. Anyone could read all member PII plus PBKDF2
`passwordHash`/`salt`, and any self-registered Firebase user could replace the dataset
and grant themselves `admin`.

What changed:
- Reads require a signed-in Firebase user. When the document contains
  `meta.accessUids`, only listed UIDs may read.
- Writes require a signed-in user and, once `meta.adminUids` exists, the writer must be
  a listed administrator.
- First-time creation is only possible while the document does not exist, and the
  creator must add their own UID to `meta.adminUids`.
- Deletes require a listed administrator.
- The client now maintains `meta.adminUids` / `meta.accessUids` from active users'
  `firebaseUid` values in `store.refreshAccessLists()` (`assets/js/store.js`).

Migration notes are at the bottom of this document — read them before deploying.

### 2. Client-side session forgery — Fixed
`store.readSession()` previously trusted `sessionStorage.coop_manager_session_v1.userId`
with only an expiry check, so editing session storage granted any account/role.

What changed (`assets/js/store.js`):
- In Firebase mode the identity is derived from `firebaseAuth.currentUser` (matched by
  `firebaseUid`, then email). A stored `userId` is never trusted for Firebase accounts.
- Only legacy accounts that have never been linked to Firebase (non-empty local hash,
  empty `firebaseUid`) may use a stored session.
- Firestore sync now runs only after Firebase restores the auth session, because reads
  require authentication.
- `onAuthStateChanged` re-renders the app when the restored session is ready.

### 3. Setup loophole kept a second admin possible forever — Fixed
`store.setup()` treated an admin as usable only when `passwordHash && salt` were set.
Firebase-mode admins have empty local hashes, so `hasUsableAdmin` was always false and
setup could be run again.

What changed (`assets/js/store.js`): a user with a `firebaseUid` now counts as a usable
admin.

### 4. Local-hash login bypassed Firebase password changes — Fixed
Login fell back to the local PBKDF2 hash whenever Firebase sign-in failed, so an old
local password still worked after an administrator "reset" it (which only sends a
Firebase reset email).

What changed (`assets/js/store.js`):
- Accounts with a `firebaseUid` never fall back to the local hash.
- Legacy accounts without a `firebaseUid` may still authenticate locally and are then
  migrated to a Firebase account on first successful login.

### 5. `resetData` accepted any password for Firebase accounts — Fixed
`pages/settings.js` only verified the local hash; when no local hash existed, any
non-empty password passed and wiped all data. It also called `resetSystem()` without
`await`, showing success even on failure.

What changed:
- Firebase accounts must pass `reauthenticateWithCredential` with their current password.
- Local/legacy accounts still verify the local hash.
- The reset is awaited, errors are shown, and the button is put into a busy state.
- `store.resetAll()` now deletes the Firestore document (instead of overwriting it) and
  signs out of Firebase.

---

## High (outstanding)

### 6. Single-document, last-write-wins persistence with silent failures
`assets/js/store.js:persist()` writes the whole database with `.set()` and only
`console.warn`s on failure. Two users editing concurrently overwrite each other, and
the UI reports success even when nothing was saved. The `onSnapshot` clock-skew guard
compares client-written ISO strings.
Recommended: Firestore transactions + `serverTimestamp()`, per-collection documents,
and surfacing persist failures in the UI.

### 7. Inline base64 proofs will exceed the 1 MB document limit
Payment/contribution proofs are stored as data URLs inside the single document
(`actions.js:797`, `mybooks.js:131`). A few photos reach the 1 MB cap enforced by
`firestore.rules`, after which saves fail silently.
Recommended: upload proofs to Firebase Storage and store only URLs.

### 8. Member self-service actions do not verify ownership
`actions.js:774-808` (`requestPayment`) and `actions.js:878+`
(`requestContributionPayment`) accept any `loanId`/member. `actions.js:784` also looks
up the member with `m.id === user.id` instead of `user.memberId`.
Recommended: require the loan's `memberId`/`careOfMemberId` to match `user.memberId`.

### 9. `approveLoan` records the wrong release date and skips the limit check
`actions.js:621` sets `releasedAt = U.today()` instead of the loan's `startDate`,
shifting interest accrual; no `D.loanLimit` re-check happens at approval.

### 10. Async actions called without `await`/`catch` across pages
Confirmed in `approvals.js:28,47`, `cash.js:57,85`, `contributions.js:152,178`,
`loans.js:157,348,366,384,404`, `members.js:97,234`, `payments.js:125,215`,
`settings.js:41,89,206`. `try/catch` never catches, rejections are unhandled, busy
buttons stick, and refreshes run before changes land.

### 11. Receipt opens with `undefined`
`payments.js:125-129`: `recordPayment` is async but assigned without `await`, so
`payment.id` is `undefined` and `openReceipt(undefined)` reports "Payment not found."

### 12. Stored XSS via disbursement fields
`loans.js:217-223` (and `:231`) interpolate `r.disburseMethod`/`r.disburseDetail`
without `U.esc`. A direct Firestore write can inject markup. Proof `download` anchors
could also receive a `javascript:` URL.
Recommended: escape the fallback and detail, and allowlist `proofFile` schemes.

### 13. Overdue detection is dead code
`domain.js:112` initializes `overdue: false` and no code path sets it, so
`D.funds().overdueCount` is always 0 (`domain.js:313-316`) and the overdue
badges/notifications in `app.js:157,201` never fire.

---

## Medium (outstanding)

- Interest floor: `domain.js:152-157` uses `Math.max(30, days)`, charging 30 days of
  interest on a brand-new loan and ignoring partial periods.
- Number inputs receive formatted strings: `members.js:88` (`"1,000"`) and
  `mybooks.js:117` (`"₱1,000.00"`) are invalid for `type="number"` and render blank.
- Weak RNG: `utils.js:6-8` uses `Date.now()` + `Math.random()` for IDs and salts.
  Use `crypto.getRandomValues`.
- False success toasts: `settings.js:41-44` (`importBackup`) and `:89-92`
  (`resetSystem`) previously showed success without awaiting; `:206` `saveSettings`
  is also un-awaited.
- Registration creates the Firebase account before approval (`store.js:1011-1041`),
  and pending users store `passwordHash`/`salt`.
- `approveUser` (`actions.js:1166-1197`) accepts any role, including `admin`.
- Contradictory UI copy: settings/users pages claim authentication/data stay "in this
  browser only" / "on this device" while the app uses Firebase.
- No first-time setup screen: `store.setup()` is not wired to any route. After
  `resetAll()`, the app returns to a sign-in screen with no way to create the initial
  administrator (the default `usr_admin` has no usable password). This is a recovery
  blocker and should be addressed next.

---

## Positive notes
- CSP and security headers in `index.html` / `serve.js`, including a path-traversal
  guard.
- Broad `U.esc` usage and a CSV formula-injection guard in `U.toCSV`.
- Login lockout (`MAX_LOGIN_ATTEMPTS`, `LOCKOUT_MS`).
- Last-active-admin protection in `saveUser` / `deleteUser`.

---

## Deployment / migration notes (important)

The new rules are self-enforcing without a backend by storing two UID lists in the
document:

- `meta.accessUids` — Firebase UIDs allowed to read.
- `meta.adminUids` — Firebase UIDs allowed to write.

Until a document contains `meta.adminUids`, it is treated as legacy and remains
writable by any authenticated user. The first administrator who signs in after this
deploy causes the next save to add `meta.adminUids`, which locks the document to the
UIDs currently listed in `users`.

Before deploying:
1. Deploy the updated client and `firestore.rules` together.
2. Make sure every administrator has signed in at least once so their `firebaseUid`
   is stored (the app backfills it on login). Admins without a Firebase account are
   not included in `adminUids` after the lock and should be migrated first.
3. Sign in as an administrator and make one save (for example, update a setting) to
   write the lists. Confirm the document now contains `meta.adminUids`.
4. Test with a non-admin account: reads should work only for active users, and writes
   should be rejected.
5. Because reads require authentication, the signed-out login screen no longer loads
   the remote organisation settings; it uses the packaged defaults.

Rollback: restore the previous rules file. Removing `meta.adminUids` from the document
returns it to the legacy (open-write) state, so only do that deliberately.

## Verification performed
- `node --check` passes for `store.js`, `app.js`, and `pages/settings.js`.
- Rules were reviewed manually; deploy to a staging Firebase project first because
  there is no local emulator setup in this repository.
