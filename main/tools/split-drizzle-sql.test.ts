import { describe, expect, it } from 'bun:test'
import { splitSqlStatements } from './split-drizzle-sql.js'

describe('splitSqlStatements', () => {
  it('preserves semicolons inside strings, comments, and dollar-quoted blocks', () => {
    expect(splitSqlStatements(`
      SELECT 'left;right';
      -- comment; still one statement
      DO $$ BEGIN PERFORM 'inside;block'; END $$;
      /* outer; /* nested; */ done */ SELECT "semi;column";
    `)).toEqual([
      "SELECT 'left;right'",
      '-- comment; still one statement\n      DO $$ BEGIN PERFORM \'inside;block\'; END $$',
      '/* outer; /* nested; */ done */ SELECT "semi;column"',
    ])
  })

  it('rejects unterminated quoted SQL', () => {
    expect(() => splitSqlStatements("SELECT 'unfinished")).toThrow('Unterminated SQL lexical state')
  })
})
