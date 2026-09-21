# Security

## Product boundary

ADAssassin is a local, single-operator console. It binds to `127.0.0.1` by
default and refuses non-loopback bind addresses. The API is not a remote or
multi-user control plane. The console holds engagement metadata and can
display vault inventory.

Offline demo engagements are permanently offline: connect, target-interacting
runs, and rollback application are rejected server-side.

## Vault key

Live engine vaults use the operator-supplied `ADAF_SESSION_VAULT_KEY`. Keep the
Fernet key in the approved engagement secret store and provide the same key
after restart. ADAssassin never generates a separate live key or writes it to
engagement JSON. Synthetic demo material uses a restart-stable, local demo-only
key under the console data directory.

## Local data protection

On POSIX systems, ADAssassin creates its app-owned data directories with mode
`0700` and engagement JSON, reports, and demo vault keys with mode `0600`.
Windows access remains governed by the user's NTFS ACL. These controls protect
against accidental cross-user disclosure on the same workstation; they are not
disk encryption. Keep the data directory on an approved encrypted endpoint,
and treat exported reports as assessment evidence.

The console never persists bind passwords, NTLM hashes, or scoped approval
tokens in engagement JSON. Sensitive dynamic run prompts are masked in the UI
and cleared whenever the selected capability changes.

Authenticated Connect preflight requires a username plus exactly one password
or NTLM hash and makes one LDAP bind attempt through the pinned engine. A
missing, rejected, or unverified credential blocks YELLOW/RED execution and is
never staged in the in-memory secret store. Live run requests cannot replace
the preflight-validated target credential. Anonymous mode remains explicit and
does not perform a credential bind. Credential traces record the gate, method,
transport, result, secret-handling decision, and retry policy without recording
the username or credential value. There are no automatic bind retries. A
rejected bind returns ordered lockout, identity, account, credential-format,
directory-policy, and controlled-retry remediation.

## Reporting

Report product defects to the repository owner. Do not file public issues that
include target names, credentials, tickets, or engagement evidence.

## Engine gates

Live mutating work is executed by the pinned ADAF-ATTACK engine. Approval,
allowlists, and rollback are engine contracts. The GUI must not silently
weaken those contracts.

The guided progress endpoint accepts visit tracking only for the GREEN catalog
and glossary. Connect, observe, and RED steps complete exclusively from actual
engagement state, so a client cannot mark operational safety outcomes complete.
