import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../services/acoustic/", import.meta.url));
const python = path.join(
  root,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
if (!existsSync(python)) {
  console.error(
    "Create services/acoustic/.venv with Python 3.12 and install its requirements first. See services/acoustic/README.md.",
  );
  process.exit(1);
}
const child = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "web_acoustic.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    "8876",
  ],
  { cwd: root, stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
