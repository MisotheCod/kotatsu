import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

// The build id is written by scripts/write-version.mjs. The app compares it with /version.json to know
// when a newer build is on the Mac and shows the Update ready bar.
const build = JSON.parse(readFileSync(new URL("./public/version.json", import.meta.url), "utf8"));

const config: NextConfig = {
  output: "export",                 // static files, served by the bridge
  images: { unoptimized: true },
  transpilePackages: ["@kotatsu/shared"],
  env: { NEXT_PUBLIC_BUILD: build.build, NEXT_PUBLIC_VERSION: build.version },
  devIndicators: false,
};
export default config;
