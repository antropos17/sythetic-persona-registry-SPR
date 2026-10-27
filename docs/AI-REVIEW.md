# Advisory AI pull request review

`.github/workflows/ai_review.yml` adds an optional review alongside the existing CI. It publishes comments only. It does not approve a PR, request changes, merge code, or change repository rules.

## Activation

After the workflow is committed and pushed, configure **Settings → Secrets and variables → Actions**:

| Setting | Kind | Value |
| --- | --- | --- |
| `OPENAI_API_KEY` | Repository secret | An API key authorized to use the selected OpenAI model. Never put it in a repository variable or tracked file. |
| `AI_REVIEW_MODEL` | Repository variable | The exact API model identifier selected by the maintainer. There is no automatic model fallback. |

The pinned action uses Chat Completions with JSON-object output and a `max_tokens` limit. Select a model that supports those request options and is available to the API project. ChatGPT subscriptions and Codex model selections do not configure this workflow.

Missing or blank settings produce a successful skip with an explanation in the Actions summary. Configure them before opening a PR. If its first review was skipped or failed, review the full PR manually; a later push alone does not guarantee a full review. Rerun the original opened-event workflow only if its recorded head still matches the current PR head. A repository or organization policy can still prohibit the action or write-capable workflow tokens.

Keep **AI review comments (advisory)** out of required status checks and rulesets. Keep the existing CI requirements in place. The workflow handles reviewer failures with `continue-on-error` and reports failure or incomplete coverage in its summary; a green job is not evidence of a clean review. The workflow does not change branch protection settings.

## When it runs

- Runs on `pull_request` events `opened` and `synchronize` for branches in the same repository, including draft PRs.
- Skips forks and Dependabot runs, which have restricted credentials.
- Does not use `pull_request_target`, check out PR code, install PR dependencies, or run PR scripts.
- Reopening a PR or marking it ready alone does not trigger a review: the pinned action handles only opening and new commits. Push a commit or rerun an eligible workflow run when needed.
- A new run for the same PR cancels an older run. Comments already published by an older run may remain.

## Review behavior and boundaries

The workflow pins [anc95/ChatGPT-CodeReview](https://github.com/anc95/ChatGPT-CodeReview) to commit [`8bd66227f057f21e847a8c27c9b356c25271d292`](https://github.com/anc95/ChatGPT-CodeReview/commit/8bd66227f057f21e847a8c27c9b356c25271d292). Its source and bundled action submit GitHub reviews with `event: COMMENT`. The prompt lives in the supported `PROMPT` environment variable, asks for concrete defects and minimal fixes, and treats instructions in diffs as untrusted. Comments are written in English.

The job grants only `contents: read` and `pull-requests: write`; all other token permissions are unset. The action receives the API key and selected model and sends eligible diffs to `https://api.openai.com/v1`. Do not commit secrets or private case evidence. File exclusions reduce unnecessary transmission; they cannot detect sensitive text embedded in otherwise eligible source files. The prompt is not a security boundary.

Limits:

- The action processes added and modified text-file patches. Deleted files, renamed files, binary files and unavailable patches are not reviewed by this revision.
- Individual patches exceeding 60,000 characters are skipped, not split or summarized. This matters for large edits to `site/index.html`.
- Assets, screenshots, runtime data, local research, environment files, databases, logs, dependencies and common lockfiles are excluded. Relevant configuration and test changes remain eligible.
- The action has five minutes within a ten-minute job. Each model response is capped at 4,000 tokens; there is no guaranteed monetary cap. Configure the API project's usage controls separately.
- The action sees per-file patches, not the complete repository or runtime behavior. On subsequent commits it selects changed files using prior review history when available. It can miss cross-file defects or repeat findings.
- On a `synchronize` event, the workflow checks for a previous bot review. If none exists, it skips the action and requests a full manual review. Rerunning an old opened-event run can target an outdated head; check its revision first. This prevents an incremental review from being presented as a full first review; full automatic recovery would require an upstream action change.
- The upstream action may write `LGTM` when no comments are generated, including when patches were skipped. This is a comment, not an approval or a coverage guarantee. Consult the run summary and skipped-file logs.
- Model or GitHub API failures can leave no review or an incomplete review. They are reported as incomplete rather than a clean result.

Existing tests, syntax checks, container checks, human review and merge rules remain independent. Dependabot already checks GitHub Actions references; review behavior, permissions and the bundled code before accepting a reviewer update.

## Validation

Run a current [actionlint](https://github.com/rhysd/actionlint) against the workflow:

```bash
actionlint .github/workflows/ai_review.yml
```

Local linting and configuration tests do not verify GitHub permissions, API billing/model access, or actual PR comment delivery. Verify those on a small internal PR after activation. No real API request or PR comment is needed for local validation.
