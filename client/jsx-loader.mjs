import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

export async function load(url, context, nextLoad) {
  if (url.endsWith(".jsx")) {
    const source = await readFile(new URL(url), "utf8");
    const { code } = await transform(source, {
      loader: "jsx",
      jsx: "automatic",
      format: "esm",
    });
    return { format: "module", shortCircuit: true, source: code };
  }
  return nextLoad(url, context);
}
