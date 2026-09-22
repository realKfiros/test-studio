import { sessionToken } from "./session";

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
	const token = sessionToken();
	const response = await fetch(path, {
		method: body === undefined ? "GET" : "POST",
		headers: {
			"x-test-studio-token": token,
			...(body === undefined ? {} : { "Content-Type": "application/json" }),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
		signal,
	});
	const result = await response.json();
	if (!response.ok) throw new Error(result.error || "Request failed");
	return result as T;
}
