import { spawn } from "node:child_process";

const child = spawn("node", [".output/server/index.mjs"], { stdio: "inherit" });

function poke() {
  fetch("http://127.0.0.1:3000/").catch(() => {});
}

setTimeout(poke, 8000);
setInterval(poke, 5 * 60 * 1000);

child.on("exit", (code) => process.exit(code ?? 1));
