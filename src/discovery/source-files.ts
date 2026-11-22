import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";

export interface DiscoverOptions {
  cwd?: string;
  sourcePatterns?: string[];
  excludePatterns?: string[];
}

export const DEFAULT_SOURCE_PATTERNS = [
  "src/**/*.{js,ts,mjs,cjs,jsx,tsx}",
  "app/**/*.{js,ts,mjs,cjs,jsx,tsx}",
  "routes/**/*.{js,ts,mjs,cjs,jsx,tsx}",
  "server/**/*.{js,ts,mjs,cjs,jsx,tsx}"
];

export const DEFAULT_EXCLUDE_PATTERNS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/*.d.ts",
  "**/*.test.{js,ts}",
  "**/*.spec.{js,ts}",
  "**/tests/**",
  "**/__tests__/**"
];

/**
 * Discovers candidate Express route files in the project workspace based on glob patterns.
 */
export async function discoverSourceFiles(options: DiscoverOptions = {}): Promise<string[]> {
  const cwd = options.cwd ?? process.cwd();
  let patterns = options.sourcePatterns && options.sourcePatterns.length > 0
    ? options.sourcePatterns
    : DEFAULT_SOURCE_PATTERNS;

  let ignore = [
    ...DEFAULT_EXCLUDE_PATTERNS,
    ...(options.excludePatterns ?? [])
  ];

  if (options.sourcePatterns && options.sourcePatterns.length > 0) {
    const targetsTest = options.sourcePatterns.some((p) => /(^|\/|\\)tests?(\/|\\|$)/.test(p));
    if (targetsTest) {
      ignore = ignore.filter((ig) => !ig.includes("tests"));
    }
  }

  // Auto-expand directory patterns to recursive code file globs
  patterns = patterns.map((p) => {
    try {
      const fullPath = path.resolve(cwd, p);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        const cleanP = p.replace(/[\\/]+$/, "");
        return `${cleanP}/**/*.{js,ts,mjs,cjs,jsx,tsx}`;
      }
    } catch {}
    return p;
  });

  // Convert Windows backslashes to forward slashes for fast-glob
  patterns = patterns.map((p) => p.replace(/\\/g, "/"));
  ignore = ignore.map((p) => p.replace(/\\/g, "/"));

  const matched = await fg(patterns, {
    cwd,
    ignore,
    absolute: true,
    onlyFiles: true
  });

  // If no files matched default patterns, try fallback to all JS/TS in cwd (excluding ignore patterns)
  if (matched.length === 0 && (!options.sourcePatterns || options.sourcePatterns.length === 0)) {
    const rootMatched = await fg(["*.{js,ts,mjs,cjs}"], {
      cwd,
      ignore,
      absolute: true,
      onlyFiles: true
    });
    return rootMatched.map((p) => path.resolve(p)).sort();
  }

  return matched.map((p) => path.resolve(p)).sort();
}
