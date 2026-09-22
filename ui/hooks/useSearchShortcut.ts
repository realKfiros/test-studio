import type { RefObject } from "react";
import type { TextInput } from "react-native";

export function useSearchShortcut(input: RefObject<TextInput | null>, enabled: boolean) {
	void input;
	void enabled;
}
