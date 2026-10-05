# CLAUDE.md

Project: AI DevFest 2026 Vibe Coding contest (solo, mock test: Smart Escape).
Source of truth: `AI_DevFest_Vibe_Coding_Rulebook.pdf` and `Smart_Escape_Problem_Statement.pdf` in this folder.
Remote: https://github.com/darklight9911/devfest-mock-test.git (real contest repo must be named `devfest-<registration-number>`).

## Git: Claude must NOT commit or push

- Never run `git commit`, `git push`, `git add`, or any command that changes Git history or the remote.
- The user does all commits and pushes themselves.
- Never use force push, rebase, amend on pushed commits, or delete the repo/branches (Rulebook 8.5).
- After finishing a chunk of work, give the user a ready-to-paste commit command (see format below).

## Commit reminders (always do this)

Remind the user to commit and push, with a ready-to-paste command, whenever:

- a feature or meaningful change is finished (import, map, routing, hazards, language switch, README, etc.);
- roughly 20 to 25 minutes of work have passed since the last commit, because the contest requires one every 30 minutes and at least 3 in total;
- the user is about to switch to a new task, deploy, or stop for a break;
- it is near T+80 to T+90, so the final commit is pushed before the deadline. Warn that nothing may be committed, pushed, or deployed after T+90;
- files changed since the last commit are visible (check `git status`, read-only).
  Put the reminder at the end of the reply, in one short line plus the command. Remind about `git push` too, not only `git commit`.

## Commit message format (Rulebook 8.4)

Every commit needs a short summary of what changed, plus the prompt used, or `Manual edit` if no AI was used.

```bash
git commit -m "<short summary of what changed>" -m 'Prompt: "<the prompt the user gave the AI>"'
```

```bash
git commit -m "<short summary of what changed>" -m "Manual edit"
```

- Summary line: imperative, professional, under ~70 characters (e.g. "Add Bangla/English language switch").
- Use single quotes around the Prompt line so inner double quotes don't break the shell.
- Prompts may be Bangla or English.
- Suggest a commit after each meaningful change. Contest minimum: one commit every 30 minutes and at least 3 in total.

## Contest rules to respect

- Frontend only. No backend, serverless functions, or persistent remote database/storage (Firebase, Supabase, Appwrite are not allowed). localStorage, sessionStorage, IndexedDB and static hosting are fine.
- Start from zero: all code written during the contest. No old projects, personal templates, or other people's code. Official starter tools (e.g. create-vite) and open-source libraries are allowed.
- No project code before T+0. During setup the repo may only have README and MIT LICENSE.
- Never put API keys, passwords, tokens, or secrets in code, the repo, or the live site, not even in old commits. In-app AI features, if any, must use a key the user types in.
- App must work in both Bangla and English (all main labels, buttons, messages, errors, instructions).
- Routing must work without any external API.
- Deploy to a public HTTPS site (GitHub Pages, Vercel, Netlify, or Cloudflare Pages). It must open in the latest Chrome with no login or install, and match the final commit.
- Use only the sample data supplied. No real personal or private data.

## Deadlines

- Build window: T+0 to T+90. The final commit must be created and pushed by T+90.
- After T+90: no code, commits, pushes, or deployment changes. The T+90 to T+95 window is for submitting the form only, with a 10-mark penalty.

## Required repo contents at submission

- All source code.
- `README.md` with: name and registration number, live HTTPS link, how to run, main features, bonus features, known problems, AI tools used, most useful prompt.
- `LICENSE` containing the MIT License.
- `screenshots/` showing the baseline route and the rerouting after C2 is blocked.

## Smart Escape technical requirements

- Input: `building.json` with `building`, `nodes[]` (id, label, type room|junction|exit, x, y), `edges[]` (id, from, to, positive integer cost), `initial_state` (blocked_nodes, blocked_edges, closed_exits).
- Limits: 2 to 60 nodes, 1 to 150 undirected edges. No self-loops or repeated node pairs. Reject malformed or inconsistent files with a clear error.
- Display all nodes and edges at the supplied coordinates, with labels, distinct node types, and visible edge costs.
- User picks an unblocked room or junction as the start. Highlight the lowest-cost route to an open exit and show the node sequence, the exit, and the total cost.
- Users can block/unblock rooms, junctions, and corridors, and close/reopen exits, with distinct visual states. Recalculate immediately after every change, without reimporting.
- Reset restores the file's original `initial_state`.
- Show "No route available" when no exit is reachable and "Starting location blocked" when the selected start is blocked.
- Route cost is the sum of edge costs. Never use coordinates or corridor count as cost.
- Blocked nodes and their incident edges, blocked edges, and closed exits (even as intermediate nodes) are excluded.
- Tie-breaking: lowest cost, then lexicographically smallest exit ID, then lexicographically smallest node ID sequence.
- No hard-coded sample routes. Judges use unseen graphs, ties, disconnected areas, and invalid input.
- Subtle, brief animations for selecting locations, toggling hazards, and updating routes. No flashing.

## Sample checks (from the problem statement)

| Scenario         | Action                     | Expected                  |
| ---------------- | -------------------------- | ------------------------- |
| Baseline         | Select R1                  | R1-C1-C2-E1, cost 7       |
| Blocked junction | Select R1, block C2        | R1-C1-C3-C4-E2, cost 11   |
| Exits closed     | Select R1, close E1 and E2 | No route available        |
| Different start  | Select R2                  | R2-C3-C4-E2, cost 7       |
| Blocked start    | Select R1, then block R1   | Starting location blocked |

## Working style

- Contest time is limited, so build the must-do tasks first and bonus features after.
- The user must be able to explain how the app works, so keep code simple and readable.

## Validate after every prompt (mandatory)

After finishing each prompt that changes anything, end the reply with a short **Validation** block. Check the work against the requirements above, run it where possible (tests, build, or opening the app), and never mark an item done unless it was actually verified.

```
Validation
- Requirements touched: <list the items from this file that this change affects>
- Verified: <what was run/checked and the result, e.g. sample check 2 -> cost 11 PASS>
- Not verified / gaps: <anything untested or still missing; say so plainly>
- Rule check: <OK, or the rule at risk>
- Next: <the next required step, and whether a commit is due>
```

- Re-run the five sample checks whenever routing, validation, or hazard logic changes.
- Also check the edge cases: ties (the sample has one: blocking C2 gives two cost-11 paths, and only the node-sequence tie-break picks the C1 one), disconnected graphs, a closed exit as an intermediate node, and invalid files.
- If a change breaks an earlier requirement, report it as a regression.

## Warnings and manual steps

- If the user asks for, or Claude is about to do, something that breaks or risks a rule above (backend or serverless code, old code, a secret in the repo, rewriting Git history, post-T+90 changes, asking anyone but the organizers questions, using the phone for coding), warn first: `RULE WARNING: <what> breaks <rule>. Safe alternative: <...>`. Do not silently comply.
- Rule reminders worth repeating: organizer questions are only allowed T+0 to T+15; the contest is solo (no chat apps, email, or talking to others); a phone is for authentication and hotspot only; log out of all accounts at the end.
- Steps only the user can do (create the `devfest-<registration-number>` repo, log in to GitHub, push, enable GitHub Pages or other hosting, take the two screenshots, open the live URL in incognito Chrome, submit the official form by T+90): give a short numbered guide marked `YOU MUST DO THIS YOURSELF`. Never claim these are done, and never ask for passwords, tokens, or login codes.
