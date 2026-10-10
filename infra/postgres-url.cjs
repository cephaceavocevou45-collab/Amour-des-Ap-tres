function normalizePostgresUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error('URL PostgreSQL invalide.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('URL PostgreSQL invalide.');
  url.searchParams.delete('schema');
  return url.toString();
}

if (require.main === module) {
  try {
    const value = process.env.PG_URL_TO_NORMALIZE;
    if (!value) throw new Error('URL PostgreSQL absente.');
    process.stdout.write(normalizePostgresUrl(value));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { normalizePostgresUrl };
