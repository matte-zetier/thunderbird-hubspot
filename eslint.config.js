import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import vitest from '@vitest/eslint-plugin'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  eslint.configs.recommended,
  // Type-aware rules applied only to source files (requires tsconfig)
  {
    files: ['src/**/*.ts'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unhandled promises are a common source of silent bugs in extension code
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Numbers in template literals are safe and idiomatic; String() wrappers add noise
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  // Vitest-specific rules for test files
  {
    files: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      // Vitest matcher helpers (expect.objectContaining etc.) are typed as `any` internally;
      // disabling here avoids noise on every assertion without weakening production code checks.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      'vitest/no-focused-tests': 'error',     // Prevents .only from being committed
      'vitest/expect-expect': 'error',         // Every test must contain an assertion
      'vitest/no-disabled-tests': 'warn',      // Flag skipped tests so they don't rot
      'vitest/no-standalone-expect': 'error',  // expect() must be inside a test body
      'vitest/valid-expect': 'error',          // Catches expect(...) with no matcher
      'vitest/prefer-strict-equal': 'error',  // Use toStrictEqual over toEqual
    },
    settings: {
      vitest: { typecheck: true },
    },
  },
  // Looser rules for config/test infrastructure files outside src/
  {
    files: ['*.config.*', 'vitest.setup.ts'],
    extends: [...tseslint.configs.recommended],
  },
)
