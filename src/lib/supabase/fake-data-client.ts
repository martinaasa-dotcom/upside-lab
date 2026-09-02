/**
 * An in-memory stand-in for the data client, for route tests.
 *
 * A route test wants to ask "what did this handler do to the rows" rather
 * than "which methods did it call in which order", and a fake that answers
 * the first question is a fake that still passes when a query is rewritten
 * to reach the same rows another way. So this holds tables of plain rows,
 * applies the filters a handler chains on, and applies its writes, which is
 * enough of PostgREST for a handler to run end to end against.
 *
 * What it does not do, on purpose: row level security, joins, or a
 * `db-max-rows` cap. Tests for those are `supabase/tests/*.test.sql` and
 * `read-all.test.ts`.
 */

export type FakeRow = Record<string, unknown>;

export type FakeWrite = {
  table: string;
  op: "insert" | "upsert" | "update" | "delete";
  rows: FakeRow[];
};

type Filter = (row: FakeRow) => boolean;

type Result = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count: number | null;
};

class FakeQuery implements PromiseLike<Result> {
  private op: FakeWrite["op"] | "select" = "select";
  private filters: Filter[] = [];
  private head = false;
  private wantCount = false;
  private orderBy: { key: string; ascending: boolean } | null = null;
  private limitTo: number | null = null;
  private one: "single" | "maybe" | null = null;
  private payload: FakeRow[] = [];
  private patch: FakeRow = {};

  constructor(
    private readonly table: string,
    private readonly tables: Record<string, FakeRow[]>,
    private readonly writes: FakeWrite[],
    private readonly failOn: (write: FakeWrite) => string | null
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.head) this.head = true;
    if (opts?.count) this.wantCount = true;
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push((row) => row[key] === value);
    return this;
  }
  neq(key: string, value: unknown) {
    this.filters.push((row) => row[key] !== value);
    return this;
  }
  in(key: string, values: unknown[]) {
    const set = new Set(values);
    this.filters.push((row) => set.has(row[key]));
    return this;
  }
  is(key: string, value: unknown) {
    this.filters.push((row) => (row[key] ?? null) === value);
    return this;
  }
  not(key: string, operator: string, value: unknown) {
    if (operator !== "is") throw new Error(`fake client: not(${operator})`);
    this.filters.push((row) => (row[key] ?? null) !== value);
    return this;
  }
  order(key: string, opts?: { ascending?: boolean }) {
    this.orderBy = { key, ascending: opts?.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.limitTo = n;
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }
  insert(rows: FakeRow | FakeRow[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: FakeRow | FakeRow[]) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: FakeRow) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  private matching(): FakeRow[] {
    const all = this.tables[this.table] ?? [];
    return all.filter((row) => this.filters.every((f) => f(row)));
  }

  private run(): Result {
    const all = (this.tables[this.table] ??= []);
    let rows: FakeRow[];

    if (this.op === "select") {
      rows = this.matching();
    } else {
      const write: FakeWrite = { table: this.table, op: this.op, rows: [] };
      if (this.op === "delete") {
        write.rows = this.matching();
      } else if (this.op === "update") {
        write.rows = this.matching();
      } else {
        write.rows = this.payload;
      }
      const refused = this.failOn(write);
      if (refused) {
        return { data: null, error: { message: refused }, count: null };
      }
      if (this.op === "delete") {
        const gone = new Set(write.rows);
        this.tables[this.table] = all.filter((row) => !gone.has(row));
      } else if (this.op === "update") {
        for (const row of write.rows) Object.assign(row, this.patch);
      } else {
        all.push(...this.payload);
      }
      this.writes.push(write);
      rows = write.rows;
    }

    if (this.orderBy) {
      const { key, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) => {
        const x = a[key] as string | number;
        const y = b[key] as string | number;
        return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
      });
    }
    if (this.limitTo !== null) rows = rows.slice(0, this.limitTo);

    const count = this.wantCount ? rows.length : null;
    if (this.head) return { data: null, error: null, count };
    if (this.one === "maybe") {
      return { data: rows[0] ?? null, error: null, count };
    }
    if (this.one === "single") {
      if (rows.length !== 1) {
        return {
          data: null,
          error: {
            message: "JSON object requested, multiple (or no) rows returned",
            code: "PGRST116",
          },
          count,
        };
      }
      return { data: rows[0], error: null, count };
    }
    return { data: rows, error: null, count };
  }

  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }
}

export type FakeDataClient = {
  from: (table: string) => FakeQuery;
  rpc: (name: string, args?: unknown) => Promise<Result>;
  /** Every write that went through, in order. */
  writes: FakeWrite[];
};

/**
 * `tables` is keyed by the real table name (`PORTFELL_TABLES.*`) and holds
 * plain rows the test can read back after the handler ran. `failOn` lets a
 * test make one write fail with a message, the way a unique constraint
 * would.
 */
export function fakeDataClient(
  tables: Record<string, FakeRow[]>,
  opts: { failOn?: (write: FakeWrite) => string | null } = {}
): FakeDataClient {
  const writes: FakeWrite[] = [];
  const failOn = opts.failOn ?? (() => null);
  return {
    from: (table) => new FakeQuery(table, tables, writes, failOn),
    rpc: async () => ({ data: null, error: null, count: null }),
    writes,
  };
}
