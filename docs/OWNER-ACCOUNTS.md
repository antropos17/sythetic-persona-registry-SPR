# Owner accounts

Owner accounts group private applications and reports under a username. They do not independently establish identity, ownership, consent rights, or a verified email address. Reviewer access remains separate and still uses the configured operator key.

## Access and recovery

Open `/#account` through **My cases**. A username contains 3 to 40 ASCII letters, digits, dots, underscores or hyphens, and is case-insensitive. Passwords contain 15 to 128 Unicode characters; spaces and pasted passwords are supported. Passwords are salted and derived asynchronously with scrypt (`N=131072`, `r=8`, `p=1`). At most two derivations run concurrently per Node process; overload returns 503 rather than creating an unbounded queue.

Registration returns a random 256-bit recovery code once. Save it outside the browser. The interface requires an acknowledgement before continuing and guards navigation while credentials are being created or changed. Neither passwords nor recovery codes are stored in local storage or session storage. There is no email delivery, email-based reset, or operator override. Losing both the password and recovery code leaves no supported self-service recovery path.

Recovery requires the username, current recovery code and a new password. It consumes the code, issues a replacement once, and invalidates every existing session. Sign in again after saving the replacement. Changing the password requires the current password, rotates the recovery code and current session, and signs out all other sessions. A lost response after a successful credential change cannot reveal the replacement code again; sign in with the new password and use the authenticated password-change flow to issue a new code. Do not automatically retry recovery after an ambiguous network failure.

## Sessions and deployment

Sessions use opaque random cookies with `HttpOnly`, `SameSite=Strict` and `Path=/`; only their hashes are stored in SQLite. Public HTTPS uses `__Host-spr_owner` with `Secure`. The development cookie requires actual local loopback operation and no configured public origin. Configure the exact HTTPS `PUBLIC_ORIGIN` for deployment, terminate TLS at a trusted proxy, and prevent public access to the raw Node HTTP listener. Forwarded client-IP and protocol headers are not trusted. These settings do not provide TLS termination themselves.

A session expires after seven days, or 24 hours without authenticated activity, whichever comes first. At most five sessions are retained per account. **Account security** lists sessions and allows revoking an individual other session or all other sessions after confirming the current password. Signing out revokes the current session.

Cookie-authenticated writes require `X-SPR-Owner: 1`, an allowed origin and allowed Fetch Metadata. Cross-site requests are rejected; `SameSite` is an additional protection. Private API responses use `Cache-Control: no-store`. Authentication attempts use persistent, bounded SQLite quotas based on the direct socket peer and normalized username. A reverse proxy can share the peer quota across visitors; public deployment needs an intentional trusted-proxy abuse-control design. Registration permits five attempts per hour per peer/username; other authentication operations permit ten per hour per operation and peer/username. No forwarded IP header bypasses those limits.

## Cases and publication

Anonymous submissions continue to issue a private case link. From that case, adding it to an account requires sign-in and possession of its valid private token. Claiming is atomic: the case is linked to one account and its former bearer token is invalidated. Matching a contact email never grants access. Claimed cases use `/#case/:id` and the session cookie; no replacement case token is exposed to the client. Signing in does not grant access to unclaimed cases.

Submissions made while signed in are linked automatically. They return `owned: true` and `accessToken: null`. The cabinet lists cases in pages of 50 and retains the existing private-link fallback. Status, evidence upload, exact-version publication consent, proposed updates and terminal passport revocation use the existing lifecycle rules. A credential revoked during asynchronous processing is checked again before a protected database write commits.

## API

All account writes require JSON and the owner header. Session cookies are set by the server, never returned as JSON tokens.

| Method | Path | Body or response |
| --- | --- | --- |
| GET | `/api/v1/account` | `{account}`; null if signed out. |
| POST | `/api/v1/account/register` | `{username,password}` -> `{account,recoveryCode}`. |
| POST | `/api/v1/account/login` | `{username,password}` -> `{account}`. |
| POST | `/api/v1/account/recover` | `{username,recoveryCode,newPassword}` -> replacement `{recoveryCode}`. |
| POST | `/api/v1/account/logout` | Revoke current cookie. |
| GET | `/api/v1/account/cases?offset=0` | `{cases,offset,hasMore}`; at most 50 items. |
| POST | `/api/v1/account/cases` | `{id,accessToken}` -> `{caseId}`. |
| GET | `/api/v1/account/sessions` | `{sessions}` with dates and a current-session marker. |
| POST | `/api/v1/account/sessions/revoke` | `{id,currentPassword}` -> `{sessions}`. |
| POST | `/api/v1/account/sessions/revoke-others` | `{currentPassword}` -> `{sessions}`. |
| POST | `/api/v1/account/password` | `{currentPassword,newPassword}` -> `{account,recoveryCode}` and a new cookie. |

## Storage and operations

Migration adds account, hashed-session and rate-limit tables, plus the case-owner relationship. It preserves existing submissions, evidence and publication history. Online SQLite backups include these tables. Protect snapshots as private authentication and case data; the backup command does not encrypt them.

Restoring an old snapshot also restores old credentials, recovery codes, sessions and publication state. Keep the newer database and reconcile subsequent credential changes and passport withdrawals before routing traffic. Invalidate restored sessions and arrange controlled recovery for affected accounts. There is no independent journal preventing an operator from rolling authentication state back with an old snapshot.

Both CI and container publication run `scripts/smoke-owner-accounts.mjs` against a disposable loopback container after the anonymous publication scenario. The synthetic test key is supplied only to the disposable container, never baked into the image. The script checks claim isolation, obsolete bearer rejection, cookie publication/update/revocation, session revocation, password/recovery rotation and automatic ownership. This is synthetic runtime acceptance; public-host, physical-device and screen-reader qualification remain separate.
