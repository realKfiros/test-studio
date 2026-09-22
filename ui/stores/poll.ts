/** A poll owns its timer and requests; disposing it also ignores late responses. */
export function poll(request: (signal: AbortSignal) => Promise<number | null>) {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	async function tick() {
		const delay = await request(controller.signal);
		if (!controller.signal.aborted && delay !== null) timer = setTimeout(tick, delay);
	}
	void tick();
	return () => {
		controller.abort();
		clearTimeout(timer);
	};
}
