/** @type {import('prettier').Config} */
module.exports = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: "all",
  plugins: [require.resolve("prettier-plugin-tailwindcss")],
  overrides: [
    {
      files: ["*.css", "*.scss"],
      options: {
        singleQuote: false
      }
    }
  ]
};
