# Archived legacy migrations

These `.sql` files are one-off, manually-applied fixes from earlier in the
project's history (all present since the initial commit). They predate the
versioned migration system in `backend/migrations/*.js`, which tracks what
has run via the `_migrations` table and is safe to re-run (`auto_migrate.js`
skips anything already applied).

**These files are not re-run automatically by anything.** They're kept here
for historical reference — e.g. if you're standing up a fresh database from
an old backup and need to know what manual steps a given environment might
already have applied.

**Going forward:** all new schema changes should be added as a new numbered
file in `backend/migrations/`, not as a loose `.sql` file here. That's the
only path that gets tracked and safely skipped on re-run.

If you're setting up a brand-new environment: `database/schema.sql` +
`database/seed.sql` (+ `seed_settings_defaults.sql` if needed) already
reflect the current, fully-migrated table structure — you should **not**
need anything in this folder for a fresh install.
