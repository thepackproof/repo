export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[A-Za-z0-9]+$/.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.js`, context);
    } catch {
      // Fall through to the default resolver.
    }
  }
  return nextResolve(specifier, context);
}
