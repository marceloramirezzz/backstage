# Infrastructure must cost $0, and the repo stays private

Backstage is a learning project for DevOps tooling, so every piece of infrastructure (CI, image registry, and later hosting and the database) must fit inside a free tier with no payment method on file. The repo also stays private, which keeps the code closed but means living within GitHub Free's private-repo limits.

**Considered Options**:
- **Make the repo public**: unlimited Actions minutes and free public GHCR storage, and a visible portfolio piece. Rejected to keep the code closed for now; revisit if the private limits start to bite.

**Consequences**:
- **CI minutes are capped** (2,000/month on private repos). CI runs about 3–5 minutes, so there's plenty of headroom, but avoid adding matrix builds or scheduled runs without checking the budget. With no payment method on file, jobs stop at the cap rather than billing.
- **GHCR storage is capped at 500 MB for private packages**, so CI keeps only the newest 3 image versions and deletes older ones. Don't raise that number without checking image sizes.
- **Branch protection isn't available on private repos on GitHub Free**, so CI can't block a merge. A red PR can still be merged; "don't merge red" is a discipline, not a rule GitHub enforces.
- **Future hosting and database choices must have a real free tier.** This rules out options that would otherwise be the obvious choice, such as a managed Postgres billed by the hour.
