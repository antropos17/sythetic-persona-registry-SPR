import { html, useEffect, useRef, useState } from '../runtime.mjs';
import { navigate } from '../domain/routing.mjs';
import { CaseAccess } from './cases.mjs';
import { copy } from '../ui/common.mjs';
import { CASE_LABELS } from '../domain/cases.mjs';
import { validateOwnerFields } from '../domain/owner.mjs';

let unsavedRecovery = false;
export const recoveryPending = () => unsavedRecovery;
window.addEventListener('beforeunload', (event) => {
  if (unsavedRecovery) {
    event.preventDefault();
    event.returnValue = '';
  }
});

async function accountRequest(path = '', body, signal) {
  const response = await fetch('/api/v1/account' + path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json', 'X-SPR-Owner': '1' },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function Account({ claim, toast }) {
  const [account, setAccount] = useState(null),
    [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('login'),
    [username, setUsername] = useState('');
  const [password, setPassword] = useState(''),
    [newPassword, setNewPassword] = useState('');
  const [recoveryInput, setRecoveryInput] = useState(''),
    [recovery, setRecovery] = useState('');
  const [saved, setSaved] = useState(false),
    [cases, setCases] = useState([]),
    [sessions, setSessions] = useState([]);
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({}),
    [hasMore, setHasMore] = useState(false);
  const controllers = useRef(new Set());
  const running = useRef(false);
  const request = async (path = '', body) => {
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      return await accountRequest(path, body, controller.signal);
    } finally {
      controllers.current.delete(controller);
    }
  };
  const validate = (values) => {
    const next = validateOwnerFields(values);
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) requestAnimationFrame(() => document.getElementById(first)?.focus());
    return !first;
  };
  const clearSecrets = () => {
    setPassword('');
    setNewPassword('');
    setRecoveryInput('');
  };
  const showRecovery = (code) => {
    unsavedRecovery = true;
    setRecovery(code);
    setSaved(false);
  };
  const reload = async () => {
    const result = await request();
    setAccount(result.account);
    if (result.account) {
      const [c, s] = await Promise.all([request('/cases?offset=0'), request('/sessions')]);
      setCases(c.cases);
      setHasMore(c.hasMore);
      setSessions(s.sessions);
    } else {
      setCases([]);
      setSessions([]);
    }
  };
  useEffect(() => {
    let active = true;
    reload()
      .catch((e) => {
        if (active && e.name !== 'AbortError') setMessage(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      for (const controller of controllers.current) controller.abort();
    };
  }, []);
  const run = async (action) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (e.status === 401 && account) {
        try {
          const state = await request();
          if (!state.account) {
            setAccount(null);
            setCases([]);
            setSessions([]);
            setMessage('Your session expired. Sign in and try again.');
          } else setMessage(e.message || 'The password is incorrect.');
        } catch (checkError) {
          if (checkError.name !== 'AbortError')
            setMessage('Could not check your session. Please try again.');
        }
      } else setMessage(e.message);
    } finally {
      clearSecrets();
      running.current = false;
      setBusy(false);
    }
  };
  const submit = (event) => {
    event.preventDefault();
    if (
      !validate({
        username,
        ...(mode === 'recover' ? { recoveryInput, newPassword } : { password }),
        enforceLength: mode !== 'login',
      })
    )
      return;
    run(async () => {
      unsavedRecovery = mode !== 'login';
      let result;
      try {
        result = await request(
          '/' + mode,
          mode === 'recover'
            ? { username, recoveryCode: recoveryInput, newPassword }
            : { username, password },
        );
      } catch (error) {
        unsavedRecovery = false;
        if (!error.status && error.name !== 'AbortError')
          throw new Error(
            'The response was lost. The account or password may have changed, but the new recovery code was not received. Try signing in; if you cannot, try your previously saved recovery code.',
          );
        throw error;
      }
      if (result.recoveryCode) showRecovery(result.recoveryCode);
      if (mode === 'recover') {
        setAccount(null);
        setMode('login');
        setMessage('Password reset. Save the new recovery code, then sign in.');
      } else {
        setAccount(result.account);
        await reload();
      }
    });
  };
  const claimCase = () =>
    run(async () => {
      const result = await request('/cases', { id: claim.id, accessToken: claim.token });
      history.replaceState(null, '', '#case/' + result.caseId);
      navigate('case/' + result.caseId);
    });
  const download = () => {
    const url = URL.createObjectURL(new Blob([recovery + '\n'], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spr-recovery-code.txt';
    a.click();
    URL.revokeObjectURL(url);
  };
  return html`<div className="wrap formwrap account-page">
    <ol className="crumbs" aria-label="Breadcrumb">
      <li><a href="#home">Registry</a></li>
      <li aria-current="page">My cases</li>
    </ol>
    <h1 className="fh1" id="h1" tabindex="-1">My cases</h1>
    ${message && html`<p role="alert" className="private-note">${message}</p>`}
    ${
      recovery
        ? html`<section className="case-panel" aria-labelledby="recovery-heading">
            <h2 id="recovery-heading">Save your recovery code</h2>
            <p>
              This single-use code is shown only now and is not emailed. Store it somewhere safe.
              You will need it if you forget your password.
            </p>
            <pre className="account-recovery">${recovery}</pre>
            <div className="rowbtns">
              <button
                type="button"
                className="btn line"
                onClick=${() => copy(recovery, 'Recovery code', toast)}
              >
                Copy code</button
              ><button type="button" className="btn line" onClick=${download}>Download code</button>
            </div>
            <label className="opt"
              ><input
                type="checkbox"
                checked=${saved}
                onChange=${(e) => setSaved(e.target.checked)}
              /><span>I saved this recovery code.</span></label
            >
            <button
              type="button"
              className="btn"
              disabled=${!saved}
              onClick=${() => {
                unsavedRecovery = false;
                setRecovery('');
                setSaved(false);
              }}
            >
              Continue
            </button>
          </section>`
        : loading
          ? html`<p role="status">Loading account…</p>`
          : !account
            ? html`<div>
                ${claim && html`<p className="private-note">Sign in or create an account to add this case. The old private link will stop working after the case is added.</p>`}
                <p>
                  Use a username and password to keep your cases together. Your username is
                  independent of any contact email.
                </p>
                <div className="rowbtns">
                  <button
                    className="tlink"
                    type="button"
                    onClick=${() => {
                      clearSecrets();
                      setErrors({});
                      setMode('login');
                    }}
                  >
                    Sign in</button
                  ><button
                    className="tlink"
                    type="button"
                    onClick=${() => {
                      clearSecrets();
                      setErrors({});
                      setMode('register');
                    }}
                  >
                    Create account</button
                  ><button
                    className="tlink"
                    type="button"
                    onClick=${() => {
                      clearSecrets();
                      setErrors({});
                      setMode('recover');
                    }}
                  >
                    Recover account
                  </button>
                </div>
                <h2>
                  ${mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Recover account'}
                </h2>
                <form className="form" onSubmit=${submit} novalidate>
                  <div className="fg">
                    <label htmlFor="owner-username">Username</label
                    ><span className="hint" id="owner-username-hint"
                      >3 to 40 letters, numbers, dots, underscores or hyphens.</span
                    >${errors['owner-username'] && html`<span className="emsg" id="owner-username-error">${errors['owner-username']}</span>`}<input
                      aria-invalid=${errors['owner-username'] ? 'true' : undefined}
                      aria-describedby=${errors['owner-username'] ? 'owner-username-hint owner-username-error' : 'owner-username-hint'}
                      className="in"
                      id="owner-username"
                      name="username"
                      value=${username}
                      onChange=${(e) => setUsername(e.target.value)}
                      autocomplete="username"
                      required
                    />
                  </div>
                  ${mode === 'recover' && html`<div className="fg"><label htmlFor="owner-recovery">Recovery code</label>${errors['owner-recovery'] && html`<span className="emsg" id="owner-recovery-error">${errors['owner-recovery']}</span>`}<input aria-invalid=${errors['owner-recovery'] ? 'true' : undefined} aria-describedby=${errors['owner-recovery'] ? 'owner-recovery-error' : undefined} className="in" id="owner-recovery" type="password" value=${recoveryInput} onChange=${(e) => setRecoveryInput(e.target.value)} autocomplete="off" required /></div>`}
                  <div className="fg">
                    <label htmlFor="owner-password"
                      >${mode === 'recover' ? 'New password' : 'Password'}</label
                    ><span className="hint" id="owner-password-hint"
                      >${mode === 'login' ? 'Enter your password.' : 'Use 15 to 128 characters.'}</span
                    >${errors['owner-password'] && html`<span className="emsg" id="owner-password-error">${errors['owner-password']}</span>`}<input
                      aria-invalid=${errors['owner-password'] ? 'true' : undefined}
                      aria-describedby=${errors['owner-password'] ? 'owner-password-hint owner-password-error' : 'owner-password-hint'}
                      className="in"
                      id="owner-password"
                      name="password"
                      type="password"
                      value=${mode === 'recover' ? newPassword : password}
                      onChange=${(e) => (mode === 'recover' ? setNewPassword(e.target.value) : setPassword(e.target.value))}
                      autocomplete=${mode === 'login' ? 'current-password' : 'new-password'}
                      required
                    />
                  </div>
                  <button className="btn" disabled=${busy}>
                    ${mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Reset password'}
                  </button>
                </form>
              </div>`
            : html`<div>
                <p>Signed in as <b>${account.username}</b>.</p>
                ${
                  claim &&
                  html`<section className="case-panel">
                    <h2>Add this case</h2>
                    <p>Adding ${claim.id} invalidates its old private link.</p>
                    <button className="btn" type="button" disabled=${busy} onClick=${claimCase}>
                      Add case to my account
                    </button>
                  </section>`
                }
                <section className="case-panel">
                  <h2>Cases</h2>
                  ${
                    cases.length
                      ? html`<ul>
                            ${cases.map((c) => html`<li key=${c.id}><a href=${'#case/' + c.id}>${c.id}</a> · ${c.kind === 'application' ? 'Application' : 'Report'} · ${CASE_LABELS[c.status] || c.status}${c.publication && html` · Passport ${c.publication.status}`}</li>`)}
                          </ul>
                          ${
                            hasMore &&
                            html`<button
                              type="button"
                              className="btn line"
                              disabled=${busy}
                              onClick=${() =>
                                run(async () => {
                                  const page = await request('/cases?offset=' + cases.length);
                                  setCases((current) => [...current, ...page.cases]);
                                  setHasMore(page.hasMore);
                                })}
                            >
                              Load more cases
                            </button>`
                          }`
                      : html`<p>
                          No cases yet. Submit a case while signed in or add one using its private
                          link.
                        </p>`
                  }
                </section>
                <details className="case-panel">
                  <summary>Account security</summary>
                  <h2>Change password</h2>
                  <p>
                    Changing your password signs out other sessions and replaces your recovery code.
                  </p>
                  <form
                    className="form"
                    onSubmit=${(e) => {
                      e.preventDefault();
                      if (
                        !validate({
                          currentPassword: password,
                          newPassword,
                          security: true,
                          enforceLength: true,
                        })
                      )
                        return;
                      run(async () => {
                        unsavedRecovery = true;
                        let r;
                        try {
                          r = await request('/password', {
                            currentPassword: password,
                            newPassword,
                          });
                        } catch (error) {
                          unsavedRecovery = false;
                          if (!error.status && error.name !== 'AbortError')
                            throw new Error(
                              'The response was lost. The account or password may have changed, but the new recovery code was not received. Try signing in; if you cannot, try your previously saved recovery code.',
                            );
                          throw error;
                        }
                        setAccount(r.account);
                        showRecovery(r.recoveryCode);
                        await reload();
                      });
                    }}
                    novalidate
                  >
                    <div className="fg">
                      <label htmlFor="owner-current">Current password</label
                      >${errors['owner-current'] && html`<span className="emsg" id="owner-current-error">${errors['owner-current']}</span>`}<input
                        aria-invalid=${errors['owner-current'] ? 'true' : undefined}
                        aria-describedby=${errors['owner-current'] ? 'owner-current-error' : undefined}
                        className="in"
                        id="owner-current"
                        type="password"
                        autocomplete="current-password"
                        value=${password}
                        onChange=${(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div className="fg">
                      <label htmlFor="owner-new">New password</label
                      >${errors['owner-new'] && html`<span className="emsg" id="owner-new-error">${errors['owner-new']}</span>`}<input
                        aria-invalid=${errors['owner-new'] ? 'true' : undefined}
                        aria-describedby=${errors['owner-new'] ? 'owner-new-error' : undefined}
                        className="in"
                        id="owner-new"
                        type="password"
                        autocomplete="new-password"
                        value=${newPassword}
                        onChange=${(e) => setNewPassword(e.target.value)}
                        required
                      />
                    </div>
                    <button className="btn" disabled=${busy}>Change password</button>
                  </form>
                  <h2>Sessions</h2>
                  <p>Enter your current password to revoke sessions.</p>
                  <form
                    className="form"
                    onSubmit=${(e) => {
                      e.preventDefault();
                      if (!validate({ sessionPassword: password })) return;
                      run(async () => {
                        const r = await request('/sessions/revoke-others', {
                          currentPassword: password,
                        });
                        setSessions(r.sessions);
                        setMessage('Other sessions revoked.');
                      });
                    }}
                    novalidate
                  >
                    <div className="fg">
                      <label htmlFor="owner-session-password">Current password</label
                      >${errors['owner-session-password'] && html`<span className="emsg" id="owner-session-password-error">${errors['owner-session-password']}</span>`}<input
                        aria-invalid=${errors['owner-session-password'] ? 'true' : undefined}
                        aria-describedby=${errors['owner-session-password'] ? 'owner-session-password-error' : undefined}
                        className="in"
                        id="owner-session-password"
                        type="password"
                        autocomplete="current-password"
                        value=${password}
                        onChange=${(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                    <ul>
                      ${sessions.map(
                        (s) =>
                          html`<li key=${s.id}>
                            ${s.current ? 'Current session' : 'Session'} · created
                            ${new Date(s.createdAt).toLocaleString()} · last seen
                            ${new Date(s.lastSeenAt).toLocaleString()} · expires
                            ${new Date(s.expiresAt).toLocaleString()}
                            ${
                              !s.current &&
                              html`<button
                                type="button"
                                className="tlink"
                                disabled=${busy}
                                onClick=${() => {
                                  if (!validate({ sessionPassword: password })) return;
                                  run(async () => {
                                    const r = await request('/sessions/revoke', {
                                      id: s.id,
                                      currentPassword: password,
                                    });
                                    setSessions(r.sessions);
                                    setMessage('Session revoked.');
                                  });
                                }}
                              >
                                Revoke session
                              </button>`
                            }
                          </li>`,
                      )}
                    </ul>
                    <button className="btn line" disabled=${busy}>Revoke other sessions</button>
                  </form>
                </details>
                <button
                  type="button"
                  className="tlink"
                  disabled=${busy}
                  onClick=${() =>
                    run(async () => {
                      await request('/logout', {});
                      setAccount(null);
                      setCases([]);
                      setSessions([]);
                      setMessage('Signed out.');
                    })}
                >
                  Sign out
                </button>
              </div>`
    }
    ${
      !recovery &&
      html`<details className="case-access-details">
        <summary>Open a private case link</summary>
        <${CaseAccess} embedded=${true} />
      </details>`
    }
  </div>`;
}
export { Account, accountRequest };
