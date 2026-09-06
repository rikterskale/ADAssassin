# Authorized use

ADAssassin is an operator console for **authorized** internal red-team and
purple-team work against Active Directory environments.

You may use it only when all of the following are true:

- You have written authorization from the owner of the target environment.
- The domain, hosts, and identities you enter are inside that written scope.
- Destructive or side-effect actions stay behind the product's approval gates.
- Captured secrets stay in the engagement vault and are handled as evidence.

You may not use ADAssassin to:

- Test systems you do not own or are not contracted to test.
- Bypass change control, approval, or rollback requirements.
- Publish captured credentials, tickets, or target data.

The public repository exists so authorized operators can review the console.
Availability on GitHub is not permission to operate it against arbitrary
networks.

The capability engine is ADAF-ATTACK 0.10.1, pinned by commit. ADAssassin does
not add new offensive techniques; it presents the existing catalog through a
web console.
