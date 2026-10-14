// Builds dist/era-xi.html: one self-contained page (JS, CSS, fonts inlined). No network at runtime.
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".");
const alias = { "@": path.join(root, "src") };

const js = await build({
  entryPoints: ["src/standalone.tsx"], bundle: true, minify: true, write: false, format: "iife",
  jsx: "automatic", target: "es2020", alias, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error",
});
const fonts = await build({
  entryPoints: ["src/fonts/fonts.css"], bundle: true, minify: true, write: false,
  loader: { ".woff2": "dataurl" }, logLevel: "error",
});
const twSrc = await fs.readFile("src/app/globals.css", "utf8");
const tw = await postcss([tailwind({ base: root, optimize: { minify: true } })]).process(twSrc, { from: path.join(root, "src/app/globals.css") });

const html = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>ERA XI</title>
<meta name="description" content="Every era. One XI. Prove yours.">
<meta name="theme-color" content="#080A09">
<style>${fonts.outputFiles[0].text}</style>
<style>${tw.css}
html,body{height:100%}body{margin:0;background:#080a09}</style>
<div id="era-xi-root"></div>
<script>${js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script>
`;
await fs.mkdir("dist", { recursive: true });
await fs.writeFile("dist/era-xi.html", html);
console.log("dist/era-xi.html", (html.length / 1024).toFixed(0), "KB");
