import { defineConfig, mergeConfig } from "vitest/config";
import vite from "./vite.config";
export default mergeConfig(vite,defineConfig({test:{include:["src/**/*.{test,spec}.{ts,tsx}"]}}));
