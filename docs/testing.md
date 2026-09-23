# Testing

Tests use Node's built-in runner against a real Postgres (the `db` service in `docker-compose.yml`).

```bash
docker compose up -d      # start Postgres
npm run db:reset          # drop + recreate the dev DB and apply all migrations
npm test                  # run all *.test.ts under src/ and test/
npm run typecheck
```

Each test file gets its own throwaway database (`backstage_test_<uuid>`) created on the server named in `DATABASE_URL`, with every migration applied from empty, and dropped afterwards. See `test/test-db.ts` and `src/services/projects.test.ts` for the pattern. Service-layer functions take a `pg.Pool`, so tests pass the pool from `createTestDb()`.

`DATABASE_URL` must be set, either in `.env` or in the environment (e.g. CI). `db:reset` refuses to run against a non-local host.

## Editing migrations

Migrations are tracked by filename, so editing an already-applied file does not change existing databases. While the schema is pre-release, edit in place and run `npm run db:reset`; once shared, add a new migration instead.
