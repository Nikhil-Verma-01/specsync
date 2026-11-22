export interface BenchmarkTarget {
  id: string;               // Short identifier used in reports
  name: string;             // Human-readable repository name
  githubUrl: string;        // HTTPS git clone URL
  branch: string;           // Git branch to checkout
  sourcePatterns: string[]; // Source globs (relative to repo root)
  openApiSpec: string;      // Relative path to OpenAPI spec file
  specUrl?: string;         // Optional external spec download URL if not in repo
  basePath?: string;        // Optional explicit base path override
  notes: string;            // Notes on architectural patterns tested
}

export const BENCHMARK_TARGETS: BenchmarkTarget[] = [
  {
    id: "openapi-project",
    name: "rabindratamang/openapi-project",
    githubUrl: "https://github.com/rabindratamang/openapi-project.git",
    branch: "master",
    sourcePatterns: ["server.js", "src/routes/**/*.js"],
    openApiSpec: "swagger/swagger.yml",
    notes: "Design-first Express app with modular v1/v2/auth routers and middlewares"
  },
  {
    id: "eov-example",
    name: "cdimascio/express-openapi-validator-example",
    githubUrl: "https://github.com/cdimascio/express-openapi-validator-example.git",
    branch: "master",
    sourcePatterns: ["app.js"],
    openApiSpec: "openapi.yaml",
    notes: "Express + OpenAPI validator example; tests real-world drift detection (unimplemented DELETE endpoint)"
  },
  {
    id: "eov-standard",
    name: "cdimascio/express-openapi-validator (1-standard)",
    githubUrl: "https://github.com/cdimascio/express-openapi-validator.git",
    branch: "master",
    sourcePatterns: ["examples/1-standard/app.js"],
    openApiSpec: "examples/1-standard/api.yaml",
    basePath: "/v1",
    notes: "Standard Express API example with OAS 3.0 spec and parameterized paths"
  },
  {
    id: "realworld-express",
    name: "gothinkster/node-express-realworld-example-app",
    githubUrl: "https://github.com/gothinkster/node-express-realworld-example-app.git",
    branch: "master",
    sourcePatterns: ["src/app/routes/**/*.ts"],
    openApiSpec: "swagger.yaml",
    specUrl: "https://raw.githubusercontent.com/MacklinEngineering/Conduit/master/swagger.yaml",
    basePath: "/api",
    notes: "Full TypeScript RealWorld Conduit implementation with controllers and articles/user/tag routes"
  },
  {
    id: "node-express-boilerplate",
    name: "hagopj13/node-express-boilerplate",
    githubUrl: "https://github.com/hagopj13/node-express-boilerplate.git",
    branch: "master",
    sourcePatterns: ["src/routes/v1/*.js", "src/app.js"],
    openApiSpec: "src/docs/components.yml",
    notes: "Popular Express boilerplate (~7k stars); tests dynamic loop-based route registration safety boundaries"
  }
];
