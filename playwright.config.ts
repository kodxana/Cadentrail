import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser", fullyParallel: false, workers: 1, timeout: 45000,
  outputDir: ".runtime/browser-results",
  reporter: [["list"], ["json", {outputFile: ".runtime/browser-results.json"}]],
  use: {baseURL: "http://127.0.0.1:8014", channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : "chromium"), headless: true, launchOptions:{args:["--autoplay-policy=no-user-gesture-required"]}, viewport: {width:1440,height:900}, trace:"retain-on-failure", screenshot:"only-on-failure"},
  webServer: {command: `${process.platform === "win32" ? ".venv\\Scripts\\python.exe" : ".venv/bin/python"} -m scripts.browser_test_server`, url:"http://127.0.0.1:8014/health", timeout:30000, reuseExistingServer:false},
});
