/** Small persisted player preferences; storage may be blocked, then nothing is remembered. */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(`checkmaw.${key}`);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(`checkmaw.${key}`, value);
  } catch {
    // Private mode or blocked storage: the choice simply is not remembered.
  }
}
