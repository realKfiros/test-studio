import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
	{
		ignores: [
			"**/node_modules/**",
			"**/dist/**",
			"**/build/**",
			"**/coverage/**",
			"**/test-results/**",
			"**/playwright-report/**",
			".idea/**",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.{ts,tsx,js,jsx}"],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		rules: {
			"no-console": "warn",
		},
	},
	{
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			globals: {
				Bun: "readonly",
			},
		},
		rules: {
			"no-console": "off",
		},
	},
);
