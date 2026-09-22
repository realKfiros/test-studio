import { Platform } from "react-native";
import "styled-components/native";

export const theme = {
	colors: {
		background: "#f7f8f6",
		surface: "#ffffff",
		text: "#24322d",
		secondaryText: "#53674a",
		muted: "#8a9590",
		border: "#e4e8e2",
		green: "#217957",
		sidebar: "#182b24",
		selected: "#edf2e7",
		danger: "#ae6654",
		success: "#739261",
		terminal: "#1c2b22",
	},
	fonts: {
		body: Platform.select({
			ios: "System",
			android: "sans-serif",
			default: "system-ui",
		}),
		mono: Platform.select({
			ios: "Menlo",
			android: "monospace",
			default: "monospace",
		}),
	},
};

type AppTheme = typeof theme;
declare module "styled-components/native/dist/models/ThemeProvider" {
	export interface DefaultTheme {
		colors: AppTheme["colors"];
		fonts: AppTheme["fonts"];
	}
}
