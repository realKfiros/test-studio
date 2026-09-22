import { useEffect } from "react";

export function usePageTitle(name?: string) {
	useEffect(() => {
		if (name) document.title = `${name} · Tests`;
	}, [name]);
}
