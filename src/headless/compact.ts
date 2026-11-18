/** MCP: lists of records without their repeated names.
 *
 * A tool result lists panels or circuits as records: [{ "id": "L1", "loadKw": 2.4, … }, …]. Every record repeats
 * every name, and an AI program pays for each of them, in every call. The MCP server sends such a list once as
 * { "columns": ["id", "loadKw", …], "rows": [["L1", 2.4, …], …] }: the values of a row are in the order of the
 * columns, and a value a record did not have is null. Measured on a 30-panel network: list_panels 47 % smaller,
 * circuit_results 40 %, get_panel 38 %, run_checks 20 %.
 *
 * Only on MCP, where the reader is an AI program; the command line and the local API (read by scripts and Excel)
 * keep records. `lvds mcp --full-rows` keeps records on MCP too. */

/** Shorter lists are left as records: the saving is small and records are easier to read. */
const ROWS_MIN = 3;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A result with every list of at least three records turned into columns and rows (lists inside records too). */
export function compactRows(v: unknown): unknown {
  if (Array.isArray(v)) {
    const items = v.map(compactRows);
    if (items.length < ROWS_MIN || !v.every(isRecord)) return items;
    // A name whose value is undefined is not written in a record either: it is no column.
    const columns = [...new Set(v.flatMap((x) => Object.entries(x as Record<string, unknown>).filter(([, val]) => val !== undefined).map(([k]) => k)))];
    // A list that is already columns and rows (or has such a column) is left: its meaning would be unclear.
    if (!columns.length || columns.includes('columns') || columns.includes('rows')) return items;
    const records = items as Record<string, unknown>[];
    return { columns, rows: records.map((x) => columns.map((c) => x[c] ?? null)) };
  }
  if (isRecord(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, compactRows(x)]));
  return v;
}

/** Added to the server's instructions for the AI program. */
export const ROWS_INSTRUCTIONS = ' Lists of records come as {"columns": [...], "rows": [[...], ...]}: the values of each row are in the order of the columns; null means the record has no such value.';
