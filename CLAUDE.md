# Project Conventions

## PR workflow (standing instruction)

Whenever you create a PR in this repo:

1. Subscribe to GitHub activity on the PR via `mcp__github__subscribe_pr_activity` immediately after creation.
2. Watch for review comments and CI events that arrive as `<github-webhook-activity>` messages.
3. Address actionable feedback — push fixes when the change is clear and not architecturally significant; use `AskUserQuestion` if anything is ambiguous.
4. On every review comment where you made a fix, attach a reply to that specific comment confirming the fix (use `mcp__github__add_reply_to_pull_request_comment`). Do not just push the fix silently.
5. Stop following up the moment the user says so — call `unsubscribe_pr_activity`.
