export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const normalized = path.toLowerCase();
  if (
    normalized.includes('android.intent.action.send')
    || normalized.startsWith('content://')
    || normalized.includes('send?')
    || normalized.startsWith('packproof://import')
  ) {
    return '/transaction/import';
  }
  return path;
}
