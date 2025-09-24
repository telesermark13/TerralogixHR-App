const fs = require("fs");
const path = require("path");
const { glob } = require("glob");

const nodeModulesPath = path.resolve(__dirname, "node_modules");

console.log("🔍 Scanning node_modules for TypeScript files...");

glob(
  "**/*.ts?(x)",
  {
    cwd: nodeModulesPath,
    ignore: [
      "**/node_modules/**", // skip nested node_modules
      "**/examples/**",
      "**/__tests__/**",
      "**/*.d.ts", // skip type definition files
    ],
  },
  (err, files) => {
    if (err) {
      console.error("❌ Error scanning:", err);
      process.exit(1);
    }

    // Collect unique package roots
    const packages = new Set();

    files.forEach((file) => {
      const parts = file.split(path.sep);
      if (parts[0].startsWith("@")) {
        // Scoped package (@expo/package)
        packages.add(path.join(parts[0], parts[1]));
      } else {
        packages.add(parts[0]);
      }
    });

    const overrides = Array.from(packages)
      .filter((pkg) => pkg.startsWith("expo") || pkg.startsWith("@expo"))
      .map((pkg) => `./node_modules/${pkg}/**/*.ts`);

    console.log("\n✅ Add this to your babel.config.js:");
    console.log(`
overrides: [
  {
    test: [
      ${overrides.map((o) => `\"${o}\"`).join(",\n      ")}
    ],
    presets: ["@babel/preset-typescript"],
  },
],
`);
  }
);
