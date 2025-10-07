const path = require("node:path");

const tsProjectPaths = [
  path.resolve(__dirname, "apps/backend/tsconfig.json"),
  path.resolve(__dirname, "apps/frontend/tsconfig.json"),
  path.resolve(__dirname, "apps/desktop/tsconfig.json"),
  path.resolve(__dirname, "packages/shared/tsconfig.json")
];

module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module"
  },
  ignorePatterns: [
    "node_modules/",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.specify/**",
    "**/.turbo/**"
  ],
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: tsProjectPaths,
        tsconfigRootDir: __dirname,
        ecmaVersion: 2022,
        sourceType: "module"
      },
      plugins: ["@typescript-eslint", "import", "promise"],
      extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
        "plugin:@typescript-eslint/stylistic",
        "plugin:import/recommended",
        "plugin:import/typescript",
        "plugin:promise/recommended",
        "prettier"
      ],
      rules: {
        "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/no-floating-promises": ["error", { ignoreIIFE: true }],
        "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
        "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        "import/no-unresolved": "off",
        "import/order": [
          "error",
          {
            groups: [["builtin", "external"], ["internal"], ["parent", "sibling", "index"]],
            "newlines-between": "always",
            alphabetize: { order: "asc", caseInsensitive: true }
          }
        ],
        "promise/always-return": "off",
        "promise/catch-or-return": "error",
        "promise/no-nesting": "warn",
        "promise/no-new-statics": "error",
        "promise/no-return-wrap": "error"
      }
    },
    {
      files: ["apps/frontend/**/*.{ts,tsx}"],
      env: {
        browser: true,
        es2022: true
      },
      plugins: ["react", "react-hooks", "jsx-a11y", "testing-library"],
      extends: [
        "plugin:react/recommended",
        "plugin:react-hooks/recommended",
        "plugin:jsx-a11y/strict",
        "plugin:testing-library/react"
      ],
      settings: {
        react: {
          version: "detect"
        }
      },
      rules: {
        "react/react-in-jsx-scope": "off",
        "react/prop-types": "off"
      }
    },
    {
      files: ["apps/desktop/src/**/*.{ts,tsx}"],
      env: {
        node: true,
        browser: false
      },
      rules: {
        "import/no-extraneous-dependencies": [
          "error",
          {
            devDependencies: true
          }
        ]
      }
    },
    {
      files: ["tests/**/*.{ts,tsx}"],
      env: {
        node: true,
        browser: true
      },
      plugins: ["testing-library"],
      extends: ["plugin:testing-library/dom"],
      rules: {}
    }
  ]
};
