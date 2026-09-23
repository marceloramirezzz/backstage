# Testing

Tests use Node's built-in runner against a real Postgres (the `db` service in `docker-compose.yml`).

```bash
docker compose up -d      # start Postgres
npm run db:reset          # drop + recreate the dev DB and apply all migrations
npm test                  # run all *.test.ts under src/ and test/
npm run typecheck
```

Each test file gets its own throwaway database (`backstage_test_<uuid>`) created on the server named in `DATABASE_URL`, with every migration applied from empty, and dropped afterwards. See `test/test-db.ts` and `src/services/projects.test.ts` for the pattern. Service-layer functions take a `pg.Pool`, so tests pass the pool from `createTestDb()`.
