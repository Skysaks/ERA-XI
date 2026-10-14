// Tiny runner: bundle a TS script with esbuild (resolving @/ alias) and execute it.
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import path from "node:path";
const entry = process.argv[2];
const out = path.resolve("node_modules/.cache/run-ts", path.basename(entry).replace(/\.ts$/, `-${process.pid}.mjs`));
await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: out, alias: { "@": path.resolve("src") }, logLevel: "error" });
await import(pathToFileURL(out).href);
