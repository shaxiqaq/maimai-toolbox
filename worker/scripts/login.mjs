// `wrangler login`, but the authorization page opens in Microsoft Edge instead of the default browser.
// Usage: pnpm cf:login
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const wrangler = join(dirname(createRequire(import.meta.url).resolve("wrangler/package.json")), "bin", "wrangler.js");

/** Edge's executable, or null to fall back to the OS launcher. */
function findEdge() {
  if (process.platform === "win32") {
    const roots = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
    return roots.map((r) => join(r, "Microsoft", "Edge", "Application", "msedge.exe")).find(existsSync) ?? null;
  }
  if (process.platform === "darwin") {
    const app = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
    return existsSync(app) ? app : null;
  }
  return "microsoft-edge";
}

function openInEdge(url) {
  const edge = findEdge();
  const [cmd, args] = edge
    ? [edge, [url]]
    : process.platform === "win32"
      ? ["cmd", ["/c", "start", "", "msedge", url]]
      : ["open", ["-a", "Microsoft Edge", url]];
  const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
  child.on("error", () => console.log(`\n无法自动打开 Edge，请手动在 Edge 中打开上面的链接。`));
  child.unref();
}

// wrangler prints the OAuth link and waits for the browser to call back on localhost.
const login = spawn(process.execPath, [wrangler, "login", "--browser=false", ...process.argv.slice(2)], {
  stdio: ["inherit", "pipe", "inherit"],
});

let opened = false;
let buffer = "";
login.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (opened) return;
  buffer += chunk.toString();
  const url = buffer.match(/https:\/\/dash\.cloudflare\.com\/oauth2\/auth\?\S+/)?.[0];
  if (url) {
    opened = true;
    console.log("\n正在用 Microsoft Edge 打开授权页面……");
    openInEdge(url);
  }
});

login.on("exit", (code) => process.exit(code ?? 0));
