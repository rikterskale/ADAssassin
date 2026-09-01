# Security

## Product boundary

ADAssassin binds to `127.0.0.1` by default. Do not expose the console on a
shared network unless you have a separate access-control plan. The console
holds engagement metadata and can display vault inventory.

## Reporting

Report product defects to the repository owner. Do not file public issues that
include target names, credentials, tickets, or engagement evidence.

## Engine gates

Live mutating work is executed by the pinned ADAF-ATTACK engine. Approval,
allowlists, and rollback are engine contracts. The GUI must not silently
weaken those contracts.
