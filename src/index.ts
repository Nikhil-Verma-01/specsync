/**
 * @specsync/cli — Public Programmatic API
 *
 * Static Express-to-OpenAPI drift detector. Catch undocumented, stale,
 * and mismatched routes before they ship.
 */

export { runCheck, checkCommand } from "./commands/check.js";
export {
  extractExpressRoutes,
  analyzeSourceFile,
} from "./extractors/express-routes.js";
export { parseOpenApiSpec } from "./openapi/parse-spec.js";
export { compareRoutes } from "./comparison/compare-routes.js";
export {
  normalizePath,
  normalizeMethod,
  joinPaths,
  isDynamicOrRegexPath,
} from "./normalization/paths.js";
export {
  discoverSourceFiles,
  DEFAULT_SOURCE_PATTERNS,
  DEFAULT_EXCLUDE_PATTERNS,
} from "./discovery/source-files.js";
export {
  loadConfig,
  findOpenApiSpec,
  DEFAULT_CONFIG_FILENAMES,
  DEFAULT_SPEC_FILENAMES,
} from "./config/load-config.js";
export {
  formatTerminalReport,
  printTerminalReport,
} from "./reporters/terminal.js";
export {
  formatJsonReport,
  printJsonReport,
} from "./reporters/json.js";
export {
  formatGitHubAnnotations,
  printGitHubAnnotations,
} from "./reporters/github.js";
export type * from "./types.js";
