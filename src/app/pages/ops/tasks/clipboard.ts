/** Clipboard write, fail-soft — shared by the selection batch bar and the row menu. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard unavailable — no-op */
  }
}
