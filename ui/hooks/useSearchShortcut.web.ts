import { useEffect, type RefObject } from "react";
import type { TextInput } from "react-native";

export function useSearchShortcut(input: RefObject<TextInput | null>, enabled: boolean) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!enabled || event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey)
				return;
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable ||
					["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
			)
				return;
			// React Native Web renders a modal with aria-modal while it owns keyboard focus.
			if (document.querySelector('[aria-modal="true"]')) return;
			event.preventDefault();
			input.current?.focus();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [input, enabled]);
}
