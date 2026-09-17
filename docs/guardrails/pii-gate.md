# PII gate

Keeps personal data (client names, contact mailboxes and phones, private
workspace links) out of git, commit messages and GitHub issue text. Built after
the ops#27 incident. Umbrella: ops#35. Engine: `scripts/check-pii.mjs` →
`lib/pii/`.

## What it checks

| Severity  | Rule            | Matches                                                                                                                                                                                 |
| --------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **error** | `denylist`      | An entry in the out-of-repo denylist, in file content, commit messages, pull request titles/bodies/branch names or **file paths**. Encoded and reformatted forms count too (below).     |
| **error** | `private-url`   | Links (with `https://`) into Google Docs/Drive/Chat/Mail/Admin/Calendar, Outlook/M365 admin/Azure portal, SharePoint, the Wix editor. JSON-escaped and percent-encoded links count too. |
| **error** | `denylist-file` | The denylist or a copy of it being committed: any file named like `pii-denylist` (`.pii-denylist~`, `pii-denylist.txt`), or a line that is an entry's pattern text.                     |
| warn      | `email`         | An address outside the reviewed `EMAIL_ALLOWLIST` in `lib/pii/detect.mjs` (hirobius.com, example.com/.org/.net, reserved TLDs, system senders).                                         |
| warn      | `phone`         | US numbers in `(AAA) EEE-LLLL`, `AAA-EEE-LLLL`, `AAA.EEE.LLLL` and `+1` forms. 555 numbers and repeated digits are skipped.                                                             |

**Encoded and reformatted forms.** A name in code, a URL or JSON rarely looks
like the name in prose, so denylist entries also run on two normalized copies of
the text (`lib/pii/normalize.mjs`). Hits are still reported where the text was
written.

- **Decoded:** percent-encoding (`Jane%20Example`, `jane%40client`), JSON and JS
  escapes (`Jane\nExample`, `Jos\u00e9`, `https:\/\/`), HTML entities
  (`&nbsp;`, `&eacute;`), accents folded (`José` = `Jose`, including decomposed
  forms), fullwidth letters, zero-width characters and soft hyphens removed, and
  `//`, `*`, `#` and `>` prefixes removed where a name wraps across lines.
- **Loosened:** the decoded copy with `-`, `_`, `.`, `+` and camelCase boundaries
  turned into spaces, so `jane\s+example` also matches `jane-example`,
  `jane_example`, `JaneExample` and `Jane+Example`.

**Why email and phone only warn.** `run-gates` fails pre-commit on _any_
non-zero exit, whatever the registry severity (ops#304), so a blocking rule has
to be precise. The 2026-09-16 sweep found that only about 11% of non-allowlisted
emails were real PII, and most phone numbers were public business listings or
fixtures. Denylist terms and private links had about zero false positives. The
client mailboxes that matter are denylist entries (`@<client-domain>`), so they
block anyway.

**Output never contains a matched value**: only rule, location and length. All
three repos are public, so CI logs are public. If a file path matches the
denylist, the path is printed as a hash.

## Where it runs

| Where                                                                         | Scans                                                                                                                         | Fails on                  |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| pre-commit (`check-pii`, registry)                                            | Lines added by the staged change, plus staged paths.                                                                          | error                     |
| commit-msg (`.husky/commit-msg` → `scripts/pii-commit-msg.mjs`)               | The commit message, without git's `#` comment lines and the `git commit -v` diff.                                             | error                     |
| post-commit (re-runs the pre-commit channel, nothing staged)                  | The commit just made: what it adds against every parent, plus its message. Result goes to `docs/guardrails/firing-log.jsonl`. | logged, never blocks      |
| `.github/workflows/pii-scan.yml` (PR opened/updated/**edited**, push to main) | Lines the PR or push adds, added paths, commit messages, and the PR title, body and branch name.                              | error (warnings annotate) |
| `.github/workflows/pii-weekly.yml` (Mondays + manual)                         | ops issue/PR text updated in the last 8 days.                                                                                 | error **or** warn         |
|                                                                               | portal-kit and site-engine `main` tips, every tracked text file.                                                              | error                     |

The gate scans only what a change **adds**. ops main still has known hits until
the ops#27 history rewrite lands, and those must not block unrelated commits.

The PR title matters because ops merges with the PR title as the merge or squash
commit message, so a name in the title ends up in main's history. The check
re-runs whenever the title or body is edited; fix the title before merging.

Content git treats as binary is still scanned. Diffs run with `--text`, so a
`.gitattributes` `-diff` or `binary` attribute does not hide a text file. UTF-16
files (Excel "Unicode text" exports, PowerShell 5.1 `Out-File`) are decoded. A
changed file that is neither (xlsx, docx, pdf, zip, images, or over 5 MB) is
named in a notice as **not scanned**. Open it and check it yourself.

## Where the denylist lives

It is PII itself, so it is **never in any repo**:

- **CI:** the `PII_DENYLIST` Actions secret on hirobius/ops
  (https://github.com/hirobius/ops/settings/secrets/actions). If it is missing,
  the scans still run the generic patterns and print a warning naming the secret.
  Fork PRs never receive secrets.
- **Local:** `.pii-denylist` at the root of the main checkout (gitignored).
  Sessions in `.claude/worktrees/*` fall back to that file automatically. The
  `PII_DENYLIST` env var also works, and both sources are merged. Copies named
  like it (`.pii-denylist~`, `.pii-denylist.bak`, `pii-denylist.txt`) are
  gitignored too, and the gate blocks one that is force-added. A copy under an
  unrelated name is caught only line by line (a line that is an entry's pattern
  text), so keep backups in Bitwarden, not in the working tree.
- **Master copy:** a Bitwarden secure note in the Hirobius internal collection
  (`standards/secrets-management.md`). The other two are copies of it.

**Format:** one case-insensitive regular expression per line; `#` comment lines
and blank lines are ignored. Use the ECMAScript/RE2 common subset (no
lookaround, no backreferences, no inline flags). Entries are reported by line
number only. An invalid entry, or one that matches the empty string, is skipped
with a warning.

**Good entries** (from the sweep): full contact names written to allow any
separator (`jane[\W_]*example`), mailboxes at a client domain
(`@example-client\.com`), private document IDs, gitignored client-workspace
paths. `[\W_]*` also matches the name with no separator at all and across
punctuation the normalized copies do not rewrite. `jane\s+example` still works,
because the loosened copy turns slugs and identifiers into spaced words.
**Avoid:** bare short tokens (a client abbreviation, a first name). They match intentional labels and base64 in
lockfiles, and a blocking gate that fires on intended text gets bypassed. Also
avoid generic patterns (private-link hosts, webmail domains). The private-link
rules are already built in, and a denylist copy would also fire on the gate's own
synthetic fixtures, which are exempt only from the built-in rules.

## Updating the denylist

1. Edit the Bitwarden note, then copy it to `.pii-denylist` in the main checkout.
2. Check what the new entry fires on (output is masked):
   `node scripts/check-pii.mjs --tree . --label ops`. Do the same with
   `--tree <path>` for local portal-kit and site-engine checkouts.
3. Push it to CI:
   `gh secret set PII_DENYLIST --repo hirobius/ops < .pii-denylist`

## Handling a hit

- **Pre-commit error:** take the value out of the staged change. Replace people
  with obviously synthetic data (`Jane Example`, `jane@example.com`,
  `(206) 555-0100`). Describe a private link instead of pasting it (for example,
  "the brief in the client's Drive folder"). Never use `--no-verify`: the
  post-commit hook re-runs `check-pii` on the commit just made (content and
  message) and logs the failure to `docs/guardrails/firing-log.jsonl`. Amend the
  commit before it is pushed.
- **Commit-msg error:** reword the message (`git commit` again, or
  `git commit --amend` if the commit exists). Name the client by role ("the
  dental client") or by issue number.
- **Binary file not scanned (notice):** open the file and confirm it has no
  client data. If it does, keep it out of git; client material belongs in the
  gitignored `clients/*` workspace.
- **Warning:** decide. If it is a real person's data, remove it. If it is a
  system or public address that keeps recurring, propose adding it to
  `EMAIL_ALLOWLIST` in a reviewed PR. Never add a client domain.
- **PR title or body failure:** edit the title or body. The check re-runs on
  the edit. Then delete the old revision from the body's edit history, as for
  issue text below.
- **PR / push failure:** the commit is already on a public branch. Rewrite
  **that branch** so the value is gone from every commit, then force-push the
  branch (never `main`). If it reached `main`, follow the ops#27 history-rewrite
  runbook.
- **Weekly failure in issue text:** edit the issue or comment, **then delete the
  old revision** from its edit history ("edited" menu → delete revision).
  Editing alone leaves the value readable. The scan does not read edit history.
- **Weekly failure in portal-kit or site-engine:** fix it in a PR there. If it is
  in history, rewrite the history the same way as ops#27.
- **False positive on a private-link or denylist rule:** reword the text. If a
  denylist entry is too broad, narrow the entry. Do not weaken the gate.

Reproduce a CI result locally: `node scripts/check-pii.mjs --range origin/main..HEAD`.

## Known limits

The gate does not detect street addresses, names that are not in the denylist,
or non-US phone formats. It cannot read inside binary formats (xlsx, docx, pdf,
archives, images) or files over 5 MB: change scans name such files in a notice,
and the weekly tree scan skips them. The weekly scan does not read issue edit
history. With nothing staged (for example `git commit --amend` with no new
changes), pre-commit scans the last commit, so an earlier bypass blocks the
amend until the value is removed.
