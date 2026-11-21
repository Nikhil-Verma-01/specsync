import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import type {
  AnalysisLimitation,
  ExtractorFramework,
  HttpMethod,
  RouteInventory,
  SourceLocation,
  SourceRoute,
} from "../types.js";
import {
  isDynamicOrRegexPath,
  joinPaths,
  normalizeMethod,
  normalizePath,
} from "../normalization/paths.js";

const SUPPORTED_HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "head",
]);

const FRAMEWORK: ExtractorFramework = "express";

// ─── Internal types ────────────────────────────────────────────────────────

/** A resolved mount: a variable name → its mount prefix string and parent variable */
interface RouterMount {
  routerVar: string;
  prefix: string;
  parentVar?: string;
  location: SourceLocation;
}

/** An import binding: local variable name → resolved absolute file path */
interface ImportBinding {
  localName: string;
  importedName: string;
  resolvedPath: string;
}

/** A re-export binding: exported name → target resolved file path */
interface ReExportBinding {
  exportedName: string;
  resolvedPath: string;
}

interface FileBindings {
  imports: ImportBinding[];
  reExports: ReExportBinding[];
  declaredVars: Set<string>;
}

// ─── Public entry point ────────────────────────────────────────────────────

/**
 * Extracts Express routes from a list of JS/TS source files using a 3-pass
 * TypeScript AST approach with multi-tier nested router resolution:
 *
 * Pass 0 – Collect import & re-export bindings across ALL files and resolve transitive barrel exports
 * Pass 1 – Collect router mounts across ALL files, resolve intra-file mount DAG and cross-file mount tree
 * Pass 2 – Extract route registrations per file, resolving composed hierarchical prefixes
 */
export async function extractExpressRoutes(
  filePaths: string[],
  basePath?: string
): Promise<RouteInventory> {
  const allRoutes: SourceRoute[] = [];
  const allLimitations: AnalysisLimitation[] = [];

  // Step 1: Parse all source files into ASTs
  const sourceFiles = new Map<string, ts.SourceFile>();
  for (const filePath of filePaths) {
    try {
      const code = await fs.readFile(filePath, "utf-8");
      const sf = ts.createSourceFile(
        filePath,
        code,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true
      );
      sourceFiles.set(filePath, sf);
    } catch (err) {
      allLimitations.push({
        type: "PARSE_ERROR",
        file: filePath,
        message: `Failed to read or parse file: ${(err as Error).message}`,
      });
    }
  }

  const knownFiles = new Set(sourceFiles.keys());

  // Pass 0: Collect import and re-export bindings across all parsed files
  const fileBindings = new Map<string, FileBindings>();
  for (const [filePath, sf] of sourceFiles) {
    fileBindings.set(filePath, collectFileBindings(sf, filePath, knownFiles));
  }

  // Transitively resolve all imports through re-exporting barrel files
  for (const [, fb] of fileBindings) {
    for (const binding of fb.imports) {
      binding.resolvedPath = resolveTransitiveImport(binding, fileBindings, knownFiles);
    }
  }

  // Pass 1: Collect ALL router mounts across all files.
  // childToParentMountMap: childResolvedPath -> { parentPath, prefix }
  const childToParentMountMap = new Map<string, { parentPath: string; prefix: string }>();
  // intraFileMountMap: within-file variable mounts (varName → composed prefix, scoped to file)
  const intraFileMountMap = new Map<string, Map<string, string>>();

  for (const [filePath, sf] of sourceFiles) {
    const bindings = fileBindings.get(filePath)?.imports ?? [];
    const mounts = collectRouterMounts(sf, filePath);

    // Build intra-file mount graph: childVar -> { parentVar, prefix }
    const intraMountGraph = new Map<string, { parentVar?: string; prefix: string }>();
    for (const mount of mounts) {
      intraMountGraph.set(mount.routerVar, {
        parentVar: mount.parentVar,
        prefix: mount.prefix,
      });
    }

    // Resolve composed local prefixes for all router variables in this file
    const localMap = new Map<string, string>();
    for (const [routerVar] of intraMountGraph) {
      const composedPrefix = resolveLocalPrefix(routerVar, intraMountGraph);
      localMap.set(routerVar, composedPrefix);
    }
    intraFileMountMap.set(filePath, localMap);

    for (const mount of mounts) {
      // Find if mount.routerVar was imported from another file
      let targetResolvedPath: string | undefined;

      if (mount.routerVar.includes(".")) {
        // Namespace access: routes.usersRouter
        const [ns, member] = mount.routerVar.split(".");
        const nsBinding = bindings.find((b) => b.localName === ns);
        if (nsBinding) {
          const targetBindings = fileBindings.get(nsBinding.resolvedPath);
          const reExport = targetBindings?.reExports.find((r) => r.exportedName === member);
          if (reExport) {
            targetResolvedPath = reExport.resolvedPath;
          }
        }
      } else {
        const binding = bindings.find((b) => b.localName === mount.routerVar);
        if (binding) {
          targetResolvedPath = binding.resolvedPath;
        }
      }

      if (targetResolvedPath) {
        const effectivePrefix = localMap.get(mount.routerVar) ?? mount.prefix;
        childToParentMountMap.set(targetResolvedPath, {
          parentPath: filePath,
          prefix: effectivePrefix,
        });
      }
    }
  }

  // Composes hierarchical prefixes across arbitrary router nesting depth
  function resolveComposedPrefix(
    currentPath: string,
    visited: Set<string> = new Set()
  ): string | undefined {
    if (visited.has(currentPath)) return undefined; // circular protection
    visited.add(currentPath);

    const mountInfo = childToParentMountMap.get(currentPath);
    if (!mountInfo) return undefined;

    const parentPrefix = resolveComposedPrefix(mountInfo.parentPath, visited);
    return parentPrefix ? joinPaths(parentPrefix, mountInfo.prefix) : mountInfo.prefix;
  }

  // Pass 2: Extract route registrations from each file
  for (const [filePath, sf] of sourceFiles) {
    const localMountMap = intraFileMountMap.get(filePath) ?? new Map();
    const crossFilePrefix = resolveComposedPrefix(filePath);

    const { routes, limitations } = extractRoutesFromFile(
      sf,
      filePath,
      localMountMap,
      crossFilePrefix,
      basePath
    );

    allRoutes.push(...routes);
    allLimitations.push(...limitations);
  }

  // Deduplicate routes by (method + normalizedPath + file:line)
  const seen = new Set<string>();
  const deduped = allRoutes.filter((r) => {
    const key = `${r.method}|${r.normalizedPath}|${r.location.file}:${r.location.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    routes: deduped,
    limitations: allLimitations,
    filesScanned: sourceFiles.size,
  };
}

// ─── Pass 0: Import and Re-Export Binding Collector ────────────────────────

function isRequireCall(
  node: ts.Node
): node is ts.CallExpression & { arguments: [ts.StringLiteral] } {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "require" &&
    node.arguments.length === 1 &&
    ts.isStringLiteral(node.arguments[0])
  );
}

function collectFileBindings(
  sourceFile: ts.SourceFile,
  filePath: string,
  knownFiles?: Set<string>
): FileBindings {
  const imports: ImportBinding[] = [];
  const reExports: ReExportBinding[] = [];
  const declaredVars = new Set<string>();
  const dir = path.dirname(filePath);

  function visit(node: ts.Node) {
    // Top-level variable / function declarations for symbol tracking
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      declaredVars.add(node.name.text);
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      declaredVars.add(node.name.text);
    }

    // ESM: import ... from "./routes/..."
    if (ts.isImportDeclaration(node)) {
      const moduleSpec = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpec)) {
        const specValue = moduleSpec.text;
        if (isRelativeImport(specValue)) {
          const resolved = resolveModulePath(dir, specValue, knownFiles);
          const clause = node.importClause;
          if (clause) {
            // default import: import usersRouter from "..."
            if (clause.name) {
              imports.push({
                localName: clause.name.text,
                importedName: "default",
                resolvedPath: resolved,
              });
              declaredVars.add(clause.name.text);
            }

            const namedBindings = clause.namedBindings;
            if (namedBindings) {
              // namespace import: import * as routes from "..."
              if (ts.isNamespaceImport(namedBindings)) {
                imports.push({
                  localName: namedBindings.name.text,
                  importedName: "*",
                  resolvedPath: resolved,
                });
                declaredVars.add(namedBindings.name.text);
              }
              // named imports: import { usersRouter, ordersRouter as orders } from "..."
              else if (ts.isNamedImports(namedBindings)) {
                for (const elem of namedBindings.elements) {
                  imports.push({
                    localName: elem.name.text,
                    importedName: elem.propertyName
                      ? elem.propertyName.text
                      : elem.name.text,
                    resolvedPath: resolved,
                  });
                  declaredVars.add(elem.name.text);
                }
              }
            }
          }
        }
      }
    }

    // ESM Re-export: export { ... } from "./..." or export * from "./..."
    if (ts.isExportDeclaration(node)) {
      const moduleSpec = node.moduleSpecifier;
      if (moduleSpec && ts.isStringLiteral(moduleSpec)) {
        const specValue = moduleSpec.text;
        if (isRelativeImport(specValue)) {
          const resolved = resolveModulePath(dir, specValue, knownFiles);
          if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            for (const elem of node.exportClause.elements) {
              reExports.push({
                exportedName: elem.name.text,
                resolvedPath: resolved,
              });
              declaredVars.add(elem.name.text);
            }
          } else if (!node.exportClause) {
            // export * from "./..."
            reExports.push({
              exportedName: "*",
              resolvedPath: resolved,
            });
          }
        }
      } else if (!moduleSpec && node.exportClause && ts.isNamedExports(node.exportClause)) {
        // Local re-export: export { usersRouter, ordersRouter };
        for (const elem of node.exportClause.elements) {
          const internalName = elem.propertyName
            ? elem.propertyName.text
            : elem.name.text;
          const matched = imports.find((i) => i.localName === internalName);
          if (matched) {
            reExports.push({
              exportedName: elem.name.text,
              resolvedPath: matched.resolvedPath,
            });
          }
          declaredVars.add(elem.name.text);
        }
      }
    }

    // ESM Export Assignment: export default router;
    if (ts.isExportAssignment(node)) {
      const expr = node.expression;
      if (!node.isExportEquals && ts.isIdentifier(expr)) {
        const matched = imports.find((i) => i.localName === expr.text);
        if (matched) {
          reExports.push({
            exportedName: "default",
            resolvedPath: matched.resolvedPath,
          });
        }
        declaredVars.add("default");
      }
    }

    // CJS: const usersRouter = require("./routes/users") or const { usersRouter } = require(...)
    if (ts.isVariableDeclaration(node)) {
      const init = node.initializer;
      if (init && isRequireCall(init)) {
        const specValue = init.arguments[0].text;
        if (isRelativeImport(specValue)) {
          const resolved = resolveModulePath(dir, specValue, knownFiles);
          if (ts.isIdentifier(node.name)) {
            imports.push({
              localName: node.name.text,
              importedName: "default",
              resolvedPath: resolved,
            });
          } else if (ts.isObjectBindingPattern(node.name)) {
            for (const elem of node.name.elements) {
              if (ts.isIdentifier(elem.name)) {
                const importedName =
                  elem.propertyName && ts.isIdentifier(elem.propertyName)
                    ? elem.propertyName.text
                    : elem.name.text;
                imports.push({
                  localName: elem.name.text,
                  importedName,
                  resolvedPath: resolved,
                });
                declaredVars.add(elem.name.text);
              }
            }
          }
        }
      }
    }

    // CJS: module.exports = { ... } or module.exports.foo = ... or exports.foo = ...
    if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)) {
      const binExpr = node.expression;
      if (binExpr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const left = binExpr.left;
        const right = binExpr.right;

        if (
          ts.isPropertyAccessExpression(left) &&
          ts.isIdentifier(left.expression) &&
          left.expression.text === "module" &&
          left.name.text === "exports"
        ) {
          if (ts.isObjectLiteralExpression(right)) {
            for (const prop of right.properties) {
              if (ts.isPropertyAssignment(prop)) {
                let propName: string | undefined;
                if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) {
                  propName = prop.name.text;
                }
                if (!propName) continue;

                const init = prop.initializer;
                if (isRequireCall(init)) {
                  const spec = init.arguments[0].text;
                  if (isRelativeImport(spec)) {
                    reExports.push({
                      exportedName: propName,
                      resolvedPath: resolveModulePath(dir, spec, knownFiles),
                    });
                  }
                } else if (ts.isIdentifier(init)) {
                  const matched = imports.find(
                    (i) => i.localName === init.text
                  );
                  if (matched) {
                    reExports.push({
                      exportedName: propName,
                      resolvedPath: matched.resolvedPath,
                    });
                  }
                }
              }
            }
          }
        }

        let exportPropName: string | undefined;
        if (
          ts.isPropertyAccessExpression(left) &&
          ts.isIdentifier(left.expression) &&
          left.expression.text === "exports"
        ) {
          exportPropName = left.name.text;
        } else if (
          ts.isPropertyAccessExpression(left) &&
          ts.isPropertyAccessExpression(left.expression) &&
          ts.isIdentifier(left.expression.expression) &&
          left.expression.expression.text === "module" &&
          left.expression.name.text === "exports"
        ) {
          exportPropName = left.name.text;
        }

        if (exportPropName) {
          if (isRequireCall(right)) {
            const spec = right.arguments[0].text;
            if (isRelativeImport(spec)) {
              reExports.push({
                exportedName: exportPropName,
                resolvedPath: resolveModulePath(dir, spec, knownFiles),
              });
            }
          } else if (ts.isIdentifier(right)) {
            const matched = imports.find((i) => i.localName === right.text);
            if (matched) {
              reExports.push({
                exportedName: exportPropName,
                resolvedPath: matched.resolvedPath,
              });
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return { imports, reExports, declaredVars };
}

/**
 * Transitively resolves an import binding through any intermediate barrel re-exports.
 */
function resolveTransitiveImport(
  binding: ImportBinding,
  fileBindings: Map<string, FileBindings>,
  knownFiles: Set<string>,
  visited = new Set<string>()
): string {
  const currPath = binding.resolvedPath;
  if (visited.has(currPath)) return currPath;
  visited.add(currPath);

  const targetFile = fileBindings.get(currPath);
  if (!targetFile) return currPath;

  // 1. Direct named re-export matching importedName or localName
  const directReExport = targetFile.reExports.find(
    (r) =>
      r.exportedName === binding.importedName ||
      r.exportedName === binding.localName ||
      (binding.importedName === "default" && r.exportedName === "default")
  );

  if (directReExport) {
    return resolveTransitiveImport(
      {
        localName: binding.localName,
        importedName: directReExport.exportedName,
        resolvedPath: directReExport.resolvedPath,
      },
      fileBindings,
      knownFiles,
      visited
    );
  }

  // 2. Wildcard re-export: export * from "./..."
  const wildcardReExports = targetFile.reExports.filter(
    (r) => r.exportedName === "*"
  );
  for (const wildcard of wildcardReExports) {
    const wildcardTarget = fileBindings.get(wildcard.resolvedPath);
    if (wildcardTarget) {
      if (
        wildcardTarget.declaredVars.has(binding.importedName) ||
        wildcardTarget.declaredVars.has(binding.localName) ||
        wildcardTarget.reExports.some(
          (r) =>
            r.exportedName === binding.importedName ||
            r.exportedName === binding.localName
        )
      ) {
        return resolveTransitiveImport(
          {
            localName: binding.localName,
            importedName: binding.importedName,
            resolvedPath: wildcard.resolvedPath,
          },
          fileBindings,
          knownFiles,
          visited
        );
      }
    }
  }

  return currPath;
}

// ─── Pass 1: Router mount collector & Graph Resolution ──────────────────────

function getParentVar(
  expr: ts.Expression,
  callNode: ts.CallExpression
): string | undefined {
  let curr: ts.Expression = expr;
  while (ts.isCallExpression(curr)) {
    if (ts.isPropertyAccessExpression(curr.expression)) {
      curr = curr.expression.expression;
    } else if (ts.isIdentifier(curr.expression)) {
      curr = curr.expression;
      break;
    } else {
      break;
    }
  }

  // Look for enclosing VariableDeclaration if curr is Router / express factory call or identifier
  const isFactory =
    (ts.isIdentifier(curr) && (curr.text === "Router" || curr.text === "express")) ||
    (ts.isPropertyAccessExpression(curr) && curr.name.text === "Router");

  if (isFactory) {
    let parent: ts.Node | undefined = callNode.parent;
    while (parent && !ts.isSourceFile(parent) && !ts.isStatement(parent)) {
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
      parent = parent.parent;
    }
  }

  if (ts.isIdentifier(curr)) {
    return curr.text;
  }

  return undefined;
}

function resolveLocalPrefix(
  varName: string,
  mountGraph: Map<string, { parentVar?: string; prefix: string }>,
  visited = new Set<string>()
): string {
  if (visited.has(varName)) return "";
  visited.add(varName);

  const node = mountGraph.get(varName);
  if (!node) return "";

  const parentPrefix = node.parentVar
    ? resolveLocalPrefix(node.parentVar, mountGraph, visited)
    : "";

  return parentPrefix ? joinPaths(parentPrefix, node.prefix) : node.prefix;
}

function collectRouterMounts(
  sourceFile: ts.SourceFile,
  filePath: string
): RouterMount[] {
  const mounts: RouterMount[] = [];

  function visit(node: ts.Node) {
    // Pattern: someVar.use("/prefix", ...middlewares, routerVar) or someVar.use(routerVar)
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (
        ts.isPropertyAccessExpression(expr) &&
        expr.name.text === "use" &&
        node.arguments.length >= 1
      ) {
        const parentVar = getParentVar(expr.expression, node);
        const firstArg = node.arguments[0];

        let prefix: string | undefined;
        let candidateArgs: ts.Expression[] = [];

        if (
          ts.isStringLiteral(firstArg) ||
          ts.isNoSubstitutionTemplateLiteral(firstArg)
        ) {
          prefix = firstArg.text;
          candidateArgs = node.arguments.slice(1);
        } else if (
          ts.isIdentifier(firstArg) ||
          ts.isPropertyAccessExpression(firstArg)
        ) {
          prefix = "";
          candidateArgs = Array.from(node.arguments);
        }

        if (prefix !== undefined) {
          const { line, character } =
            sourceFile.getLineAndCharacterOfPosition(node.getStart());

          const addMount = (argExpr: ts.Expression) => {
            if (ts.isIdentifier(argExpr)) {
              mounts.push({
                routerVar: argExpr.text,
                prefix,
                parentVar,
                location: {
                  file: filePath,
                  line: line + 1,
                  column: character + 1,
                },
              });
            } else if (
              ts.isPropertyAccessExpression(argExpr) &&
              ts.isIdentifier(argExpr.expression) &&
              ts.isIdentifier(argExpr.name)
            ) {
              mounts.push({
                routerVar: `${argExpr.expression.text}.${argExpr.name.text}`,
                prefix,
                parentVar,
                location: {
                  file: filePath,
                  line: line + 1,
                  column: character + 1,
                },
              });
            }
          };

          for (const arg of candidateArgs) {
            if (ts.isArrayLiteralExpression(arg)) {
              for (const elem of arg.elements) {
                addMount(elem);
              }
            } else {
              addMount(arg);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return mounts;
}

// ─── Pass 2: Route extractor ───────────────────────────────────────────────

/** @internal — exported for unit testing */
export function analyzeSourceFile(
  sourceFile: ts.SourceFile,
  filePath: string,
  basePath?: string
): { routes: SourceRoute[]; limitations: AnalysisLimitation[] } {
  const mounts = collectRouterMounts(sourceFile, filePath);
  const intraMountGraph = new Map<string, { parentVar?: string; prefix: string }>();
  for (const mount of mounts) {
    intraMountGraph.set(mount.routerVar, {
      parentVar: mount.parentVar,
      prefix: mount.prefix,
    });
  }
  const localMap = new Map<string, string>();
  for (const [routerVar] of intraMountGraph) {
    localMap.set(routerVar, resolveLocalPrefix(routerVar, intraMountGraph));
  }
  return extractRoutesFromFile(sourceFile, filePath, localMap, undefined, basePath);
}

function extractRoutesFromFile(
  sourceFile: ts.SourceFile,
  filePath: string,
  localMountMap: Map<string, string>,
  crossFilePrefix: string | undefined,
  basePath: string | undefined
): { routes: SourceRoute[]; limitations: AnalysisLimitation[] } {
  const routes: SourceRoute[] = [];
  const limitations: AnalysisLimitation[] = [];

  function getLocation(node: ts.Node): SourceLocation {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart()
    );
    return { file: filePath, line: line + 1, column: character + 1 };
  }

  function recordRoute(
    methodName: string,
    rawRoutePath: string,
    routerVar: string | undefined,
    location: SourceLocation
  ) {
    if (isDynamicOrRegexPath(rawRoutePath)) {
      limitations.push({
        type: "UNSUPPORTED_PATTERN",
        file: filePath,
        location,
        message: `Route pattern "${rawRoutePath}" contains wildcards or regex syntax not supported in static analysis.`,
      });
      return;
    }

    // Determine prefix: intra-file mount composed with cross-file mount
    const intraPrefix = routerVar ? localMountMap.get(routerVar) : undefined;
    const prefix = intraPrefix
      ? crossFilePrefix
        ? joinPaths(crossFilePrefix, intraPrefix)
        : intraPrefix
      : crossFilePrefix;

    const fullRawPath = prefix ? joinPaths(prefix, rawRoutePath) : rawRoutePath;
    const normalized = normalizePath(fullRawPath, basePath);

    const methods: HttpMethod[] =
      methodName === "all"
        ? ["GET", "POST", "PUT", "DELETE", "PATCH"]
        : [normalizeMethod(methodName)];

    for (const method of methods) {
      routes.push({
        method,
        rawPath: fullRawPath,
        normalizedPath: normalized,
        location,
        confidence: "static",
        supported: true,
        framework: FRAMEWORK,
        routerPrefix: prefix,
      });
    }
  }

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;

      // ── Pattern 1: app.get("/path", handler) or router.post("/path", handler) ──
      if (ts.isPropertyAccessExpression(expr)) {
        const methodName = expr.name.text.toLowerCase();
        const calleeVar = ts.isIdentifier(expr.expression)
          ? expr.expression.text
          : undefined;

        if (
          (SUPPORTED_HTTP_METHODS.has(methodName) || methodName === "all") &&
          !isChainedFromRoute(expr.expression)
        ) {
          const args = node.arguments;
          if (args.length >= 2) {
            const firstArg = args[0];
            const location = getLocation(node);

            if (
              ts.isStringLiteral(firstArg) ||
              ts.isNoSubstitutionTemplateLiteral(firstArg)
            ) {
              recordRoute(methodName, firstArg.text, calleeVar, location);
            } else if (ts.isArrayLiteralExpression(firstArg)) {
              // Array paths: app.get(["/users", "/accounts"], handler)
              for (const elem of firstArg.elements) {
                if (
                  ts.isStringLiteral(elem) ||
                  ts.isNoSubstitutionTemplateLiteral(elem)
                ) {
                  recordRoute(methodName, elem.text, calleeVar, location);
                }
              }
            } else {
              // Dynamic path — variable, function call, etc.
              limitations.push({
                type: "DYNAMIC_ROUTE",
                file: filePath,
                location,
                message: `Dynamic route path "${firstArg.getText(sourceFile)}" could not be statically resolved.`,
                snippet: node.getText(sourceFile).slice(0, 120),
              });
            }
          }
        }

        // ── Pattern 2: app.route("/path").get(handler).post(handler) ──
        if (methodName === "route") {
          const args = node.arguments;
          if (args.length === 1) {
            const firstArg = args[0];
            if (
              ts.isStringLiteral(firstArg) ||
              ts.isNoSubstitutionTemplateLiteral(firstArg)
            ) {
              collectRouteChain(
                node,
                firstArg.text,
                calleeVar,
                sourceFile,
                getLocation(node),
                recordRoute
              );
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { routes, limitations };
}

// ─── app.route() chaining ──────────────────────────────────────────────────

function collectRouteChain(
  routeCallNode: ts.CallExpression,
  routePath: string,
  calleeVar: string | undefined,
  sourceFile: ts.SourceFile,
  location: SourceLocation,
  recordRoute: (
    method: string,
    path: string,
    callee: string | undefined,
    loc: SourceLocation
  ) => void
) {
  let current: ts.Node = routeCallNode.parent;

  while (current && ts.isPropertyAccessExpression(current)) {
    const chainedMethod = current.name.text.toLowerCase();
    const chainCallNode = current.parent;

    if (ts.isCallExpression(chainCallNode)) {
      if (SUPPORTED_HTTP_METHODS.has(chainedMethod) || chainedMethod === "all") {
        recordRoute(chainedMethod, routePath, calleeVar, location);
      }
      current = chainCallNode.parent;
    } else {
      break;
    }
  }
}

function isChainedFromRoute(expr: ts.Expression): boolean {
  let curr: ts.Expression = expr;
  while (ts.isCallExpression(curr)) {
    if (ts.isPropertyAccessExpression(curr.expression)) {
      if (curr.expression.name.text === "route") return true;
      curr = curr.expression.expression;
    } else {
      break;
    }
  }
  return false;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function isRelativeImport(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

/**
 * Resolves a relative import specifier to an absolute path, prioritizing
 * files present in the known parsed file set.
 */
function resolveModulePath(
  fromDir: string,
  specifier: string,
  knownFiles?: Set<string>
): string {
  const base = path.resolve(fromDir, specifier);

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.js`,
    `${base.replace(/\.js$/, "")}.ts`,
    path.join(base, "index.ts"),
    path.join(base, "index.js"),
  ];

  if (knownFiles) {
    for (const c of candidates) {
      if (knownFiles.has(c)) {
        return c;
      }
    }
  }

  if (specifier.endsWith(".js")) {
    return base.slice(0, -3) + ".ts";
  }

  return candidates[1]; // default .ts
}
