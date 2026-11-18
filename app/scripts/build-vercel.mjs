import { build } from "esbuild"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")

await build({
  entryPoints: [path.join(root, "api", "handler.ts")],
  outfile: path.join(root, "api", "server.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  logLevel: "info",
})
