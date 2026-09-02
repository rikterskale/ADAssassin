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

## Reporting

Report product defects to the repository owner. Do not file public issues that
include target names, credentials, tickets, or engagement evidence.

## Engine gates

Live mutating work is executed by the pinned ADAF-ATTACK engine. Approval,
allowlists, and rollback are engine contracts. The GUI must not silently
weaken those contracts.
