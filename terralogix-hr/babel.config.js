module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      "babel-preset-expo",
      "@babel/preset-typescript",
    ],
    overrides: [
      {
        test: [
          "./node_modules/**/*.ts",
          "./node_modules/**/*.tsx",
        ],
        presets: ["@babel/preset-typescript"],
      },
    ],
    plugins: [],
  };
};