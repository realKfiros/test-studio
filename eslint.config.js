import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

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
			"**/.expo/**",
		],
	},
	{
		files: ["ui/**/*.{ts,tsx}"],
		plugins: { "react-hooks": reactHooks },
		rules: {
			"react-hooks/rules-of-hooks": "error",
			"react-hooks/exhaustive-deps": "warn",
			"no-restricted-imports": [
				"error",
				{
					paths: [
						{
							name: "styled-components",
							message: "Use styled-components/native with React Native primitives.",
						},
					],
				},
			],
			"no-restricted-syntax": [
				"error",
				{
					selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name=/^[a-z]/]",
					message: "Use React Native components instead of HTML elements.",
				},
			],
		},
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
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
		files: ["**/*.{ts,tsx}", "scripts/*.mjs", "examples/*.mjs"],
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
