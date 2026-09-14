/** Tiny argv helpers shared by the pipeline stages. */

export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * Reads `--name N`, or `--name=N`. Returns null when absent so callers can tell
 * "not given" from a deliberate zero.
 */
export function numberFlag(name: string): number | null {
  const argv = process.argv;
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  const raw = inline ? inline.slice(name.length + 3) : argv[argv.indexOf(`--${name}`) + 1];

  if (raw === undefined || (!inline && !argv.includes(`--${name}`))) return null;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    console.error(`--${name} needs a whole number of 1 or more (got "${raw}")`);
    process.exit(2);
  }
  return value;
}
