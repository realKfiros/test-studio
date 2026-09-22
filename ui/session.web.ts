export function sessionToken(): string {
	const token = document.querySelector<HTMLMetaElement>(
		'meta[name="test-studio-token"]',
	)?.content;
	if (!token) throw new Error("Open the UI at the address printed by the executable.");
	return token;
}
