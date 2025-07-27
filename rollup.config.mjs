// rollup.config.mjs
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import alias from "@rollup/plugin-alias";
import { execSync } from "child_process";

const autoGitPackageVersionPlugin = {
  name: "auto-git-package-version",

  buildStart() {
    try {
      execSync("scripts/update_package_json_version.sh", {
        stdio: "inherit",
        cwd: process.cwd(),
      });
    } catch (error) {
      console.error("auto-git-package-version script failed:", error.message);
      throw error;
    }
  },
};

const plugins = [
  autoGitPackageVersionPlugin,
  typescript({
    declaration: false,
  }),
  nodeResolve(),
  json(),
  alias({
    entries: {
      // "lit/static-html$": "lit/static-html.js",
      "lit/decorators": "lit/decorators.js",
      // "lit/directive$": "lit/directive.js",
      // "lit/directives/until$": "lit/directives/until.js",
      // "lit/directives/class-map$": "lit/directives/class-map.js",
      // "lit/directives/style-map$": "lit/directives/style-map.js",
      "lit/directives/if-defined": "lit/directives/if-defined.js",
      // "lit/directives/guard$": "lit/directives/guard.js",
      // "lit/directives/cache$": "lit/directives/cache.js",
      "lit/directives/repeat": "lit/directives/repeat.js",
      // "lit/directives/live$": "lit/directives/live.js",
      // "lit/directives/keyed$": "lit/directives/keyed.js",
      // "lit/polyfill-support$": "lit/polyfill-support.js",
      // "@lit-labs/virtualizer/layouts/grid":
      //   "@lit-labs/virtualizer/layouts/grid.js",
      // "@lit-labs/virtualizer/polyfills/resize-observer-polyfill/ResizeObserver":
      //   "@lit-labs/virtualizer/polyfills/resize-observer-polyfill/ResizeObserver.js",
      // "@lit-labs/observers/resize-controller":
      //   "@lit-labs/observers/resize-controller.js",
    },
  }),
];

export default {
  input: "src/energy-sankey.ts",
  output: {
    dir: "dist",
    format: "es",
    inlineDynamicImports: true,
  },
  plugins,
  moduleContext: (id) => {
    const thisAsWindowForModules = [
      "node_modules/@formatjs/intl-utils/lib/src/diff.js",
      "node_modules/@formatjs/intl-utils/lib/src/resolve-locale.js",
    ];
    if (thisAsWindowForModules.some((id_) => id.trimRight().endsWith(id_))) {
      return "window";
    }
  },
};
