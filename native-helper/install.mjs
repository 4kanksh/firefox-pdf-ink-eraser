// Registers the converter with Firefox, for the current Windows user, so the
// extension can start it. `node install.mjs uninstall` removes it again.
//
// Firefox finds a native messaging program through a registry key named
// after it, whose value is the path of a JSON file saying what to start and
// which extensions may start it.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "pdf_ink_eraser_office";
const KEY = `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${NAME}`;
const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, `${NAME}.json`);
const launcherPath = join(here, "converter.bat");

if (process.platform !== "win32") {
  console.error("The installer only supports Windows so far.");
  process.exit(1);
}

if (process.argv[2] === "uninstall") {
  execFileSync("reg", ["delete", KEY, "/f"], { stdio: "ignore" });
  rmSync(manifestPath, { force: true });
  rmSync(launcherPath, { force: true });
  console.log("Removed the converter from Firefox.");
  process.exit(0);
}

const extensionManifest = JSON.parse(readFileSync(join(here, "..", "extension", "manifest.json"), "utf8"));
const extensionId = extensionManifest.browser_specific_settings.gecko.id;

// Firefox starts programs without a console's PATH, so the launcher names
// this Node.js by its full path.
writeFileSync(launcherPath, `@echo off\r\n"${process.execPath}" "%~dp0converter.mjs"\r\n`);
writeFileSync(manifestPath, JSON.stringify({
  name: NAME,
  description: "Converts Word and PowerPoint files to PDF for PDF Ink Eraser",
  path: launcherPath,
  type: "stdio",
  allowed_extensions: [extensionId],
}, null, 2) + "\n");
execFileSync("reg", ["add", KEY, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"], { stdio: "ignore" });
console.log(`Registered the converter with Firefox for ${extensionId}.`);
