# Database SQL

The schema and sample data are not implemented yet. Add `schema.sql` and
`seed.sql` here when implementing the ERD in `planning/entity_relationship_diagram.md`.

`schema.sql` should recreate the application tables, and `seed.sql` should insert
sample data. Do not put BEGIN/COMMIT in these files: the reset script runs both
in one transaction. Use this only with a dedicated development database.

Until both files exist, the reset command exits with an explanation and does
not change the database.
