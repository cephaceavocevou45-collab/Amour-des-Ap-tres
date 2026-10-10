const { spawnSync } = require('node:child_process');
const { pgEnvironment } = require('./backup-s3.cjs');

function fail() {
  process.stderr.write('Comparaison impossible; aucune URL ni donnée personnelle affichée.\n');
  process.exitCode = 1;
}

function parseUrl(name) {
  try { return new URL(process.env[name] || ''); }
  catch { throw new Error('invalid-url'); }
}

function identity(url) {
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`.toLowerCase();
}

function query(url, sql) {
  const result = spawnSync('psql', ['--no-password', '--tuples-only', '--no-align', '--command', sql], {
    env: pgEnvironment(url), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error('query-failed');
  return result.stdout.trim();
}

function snapshot(url) {
  const tables = query(url, "SELECT coalesce(json_agg(tablename ORDER BY tablename), '[]'::json)::text FROM pg_tables WHERE schemaname = 'public'");
  const tableNames = JSON.parse(tables);
  if (tableNames.some(name => !/^[A-Za-z0-9_]+$/.test(name))) throw new Error('unsafe-table-name');
  const rowSql = tableNames.length
    ? tableNames.map(name => `SELECT '${name}', count(*) FROM public."${name}"`).join(' UNION ALL ')
    : "SELECT ''::text, 0::bigint WHERE false";
  const rows = query(url, `SELECT coalesce(json_agg(json_build_array(table_name, row_count) ORDER BY table_name), '[]'::json)::text FROM (${rowSql}) AS counts(table_name, row_count)`);
  const columns = JSON.parse(query(url, "SELECT coalesce(json_agg(json_build_array(table_name,column_name,ordinal_position,data_type,is_nullable,column_default,udt_name,character_maximum_length,numeric_precision,numeric_scale) ORDER BY table_name, ordinal_position), '[]'::json)::text FROM information_schema.columns WHERE table_schema = 'public'")).map(row => [row[0]+'\0'+row[1], JSON.stringify(row)]);
  const constraints = JSON.parse(query(url, "SELECT coalesce(json_agg(json_build_array(t.relname,c.conname,c.contype,pg_get_constraintdef(c.oid),c.condeferrable,c.condeferred) ORDER BY t.relname,c.conname), '[]'::json)::text FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND c.contype IN ('p','f','u','c')")).map(row => [row[0]+'\0'+row[1], JSON.stringify(row), row[2]]);
  const indexes = query(url, "SELECT coalesce(json_agg(json_build_array(tablename,indexname,indexdef) ORDER BY tablename,indexname), '[]'::json)::text FROM pg_indexes WHERE schemaname = 'public'");
  const types = query(url, "SELECT coalesce(json_agg(json_build_array(t.typname, e.enumlabel, e.enumsortorder) ORDER BY t.typname, e.enumsortorder), '[]'::json)::text FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'");
  return { tableNames, rows: JSON.parse(rows), columns, constraints, indexes: JSON.parse(indexes), types: JSON.parse(types) };
}

try {
  const source = parseUrl('COMPARE_SOURCE_DATABASE_URL');
  const target = parseUrl('COMPARE_TARGET_DATABASE_URL');
  if (identity(source) === identity(target)) throw new Error('same-database');
  const a = snapshot(source), b = snapshot(target);
  const countsEqual = JSON.stringify(a.rows) === JSON.stringify(b.rows);
  const schemaEqual = JSON.stringify(a.tableNames) === JSON.stringify(b.tableNames)
    && JSON.stringify(a.columns) === JSON.stringify(b.columns)
    && JSON.stringify(a.constraints) === JSON.stringify(b.constraints)
    && JSON.stringify(a.indexes) === JSON.stringify(b.indexes)
    && JSON.stringify(a.types) === JSON.stringify(b.types);
  const schemaMismatches = {
    columns: countMismatches(a.columns, b.columns),
    constraints: countMismatches(a.constraints, b.constraints),
    indexes: JSON.stringify(a.indexes) === JSON.stringify(b.indexes) ? 0 : 1,
    enumTypes: JSON.stringify(a.types) === JSON.stringify(b.types) ? 0 : 1,
  };
  process.stdout.write(JSON.stringify({
    sourceTables: a.tableNames.length,
    restoredTables: b.tableNames.length,
    rowCountMismatchCount: countsEqual ? 0 : 1,
    sourceForeignKeys: a.constraints.filter(row => row[2] === 'f').length,
    restoredForeignKeys: b.constraints.filter(row => row[2] === 'f').length,
    rowCountsEqual: countsEqual,
    schemaEqual,
    schemaMismatches,
  }) + '\n');
  if (!countsEqual || !schemaEqual) process.exitCode = 1;
} catch {
  fail();
}

function countMismatches(left, right) {
  const a = new Map(left), b = new Map(right);
  return [...new Set([...a.keys(), ...b.keys()])].filter(key => a.get(key) !== b.get(key)).length;
}
