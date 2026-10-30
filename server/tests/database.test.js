import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pool from '../config/database.js';

test('schema and seed reset repeatedly and enforce the ERD constraints', async () => {
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const seed = await readFile(new URL('../db/seed.sql', import.meta.url), 'utf8');
  const client = await pool.connect();
  const testSchema = `test_${randomUUID().replaceAll('-', '')}`;

  async function expectDatabaseError(sql, code) {
    await client.query('SAVEPOINT invalid_data');
    try {
      await assert.rejects(client.query(sql), (error) => error.code === code);
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT invalid_data');
      await client.query('RELEASE SAVEPOINT invalid_data');
    }
  }

  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA "${testSchema}"`);
    // No public fallback: unqualified SQL cannot touch application tables.
    await client.query(`SET LOCAL search_path TO "${testSchema}"`);
    for (let run = 0; run < 2; run++) {
      await client.query(schema);
      await client.query(seed);
      for (const [table, count] of Object.entries({
        users: 3, trips: 2, trip_members: 5, activities: 5, activity_votes: 7, expenses: 3,
      })) {
        const result = await client.query(`SELECT count(*)::int AS count FROM ${table}`);
        assert.equal(result.rows[0].count, count, `${table} seed count on run ${run + 1}`);
      }
    }

    await expectDatabaseError("INSERT INTO users (name, email) VALUES ('Duplicate', 'yingshu@example.com')", '23505');
    await expectDatabaseError("UPDATE trips SET invite_code = 'SEATTLE26' WHERE id = 2", '23505');
    await expectDatabaseError('INSERT INTO activity_votes VALUES (1, 1, NOW())', '23505');
    await expectDatabaseError("UPDATE trip_members SET role = 'admin' WHERE trip_id = 1 AND user_id = 2", '23514');
    await expectDatabaseError('UPDATE trips SET budget = -1 WHERE id = 1', '23514');
    await expectDatabaseError("UPDATE trips SET end_date = '2026-01-01' WHERE id = 1", '23514');
    await expectDatabaseError('UPDATE activities SET estimated_cost = -1 WHERE id = 1', '23514');
    await expectDatabaseError('UPDATE expenses SET amount = 0 WHERE id = 1', '23514');
    await expectDatabaseError('UPDATE expenses SET payer_id = 99999 WHERE id = 1', '23503');
    await expectDatabaseError('DELETE FROM users WHERE id = 1', '23503');

    const organizerCheck = await client.query(`
      SELECT t.id FROM trips t LEFT JOIN trip_members m
        ON m.trip_id = t.id AND m.user_id = t.organizer_id AND m.role = 'organizer'
      WHERE m.user_id IS NULL
    `);
    assert.equal(organizerCheck.rowCount, 0);
    const user = await client.query("INSERT INTO users (name, email) VALUES ('New User', 'new@example.com') RETURNING id");
    assert.ok(Number(user.rows[0].id) > 3, 'identity continues after seed data');

    await client.query('DELETE FROM activities WHERE id = 1');
    assert.equal((await client.query('SELECT 1 FROM activity_votes WHERE activity_id = 1')).rowCount, 0);
    await client.query('DELETE FROM trips WHERE id = 1');
    for (const table of ['trip_members', 'activities', 'expenses']) {
      assert.equal((await client.query(`SELECT 1 FROM ${table} WHERE trip_id = 1`)).rowCount, 0);
    }
    assert.equal((await client.query('SELECT 1 FROM trips WHERE id = 2')).rowCount, 1);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM activity_votes')).rows[0].count, 2);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
