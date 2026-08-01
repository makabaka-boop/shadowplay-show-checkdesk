// ESM resolve hook: lets Node run the app's TS source directly in tests.
// - Resolves extensionless relative imports (./foo -> ./foo.ts)
// - Resolves directory imports (../types -> ../types/index.ts)
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TS_EXTS = ['.ts', '.tsx', '.js', '.mjs'];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:')) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      const base = context.parentURL ? new URL(specifier, context.parentURL) : new URL(specifier);
      let p = fileURLToPath(base);

      // try appending known extensions
      for (const ext of TS_EXTS) {
        if (existsSync(p + ext)) {
          return { url: base.href + ext, shortCircuit: true };
        }
      }
      // try directory index
      if (existsSync(p) && statSync(p).isDirectory()) {
        for (const ext of TS_EXTS) {
          const idx = p.replace(/\/$/, '') + '/index' + ext;
          if (existsSync(idx)) {
            return { url: new URL('file://' + idx).href, shortCircuit: true };
          }
        }
      }
      throw err;
    }
  }
  return nextResolve(specifier, context);
}
