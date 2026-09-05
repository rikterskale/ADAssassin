/** Copy text to the clipboard. Returns false when the API is missing or denied. */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (!value || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
