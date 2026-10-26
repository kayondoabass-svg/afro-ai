export const NEW_CHAT_EVENT = "afro:new-chat";
export const DEFAULT_ENTRY = "/chat";

export function authDestination(stored: string | null): string {
  return stored && stored.startsWith("/") && !stored.startsWith("//") && !stored.includes("\\") ? stored : DEFAULT_ENTRY;
}

// Cancelled means the mounted chat handled the request (including a declined
// discard confirmation). Ordinary navigation remains intact on other pages.
export function requestNewChat(): boolean {
  return !window.dispatchEvent(new Event(NEW_CHAT_EVENT, { cancelable: true }));
}