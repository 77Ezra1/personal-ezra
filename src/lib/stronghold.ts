// Utilities to interact with Stronghold for retrieving the master key
// The actual Stronghold API should provide a method to fetch the key.
// Here we expect an object `__STRONGHOLD__` exposed on window with a `getKey` method.

export async function getStrongholdKey(): Promise<Uint8Array> {
  if (typeof window !== 'undefined') {
    const api = (window as any).__STRONGHOLD__
    if (api && typeof api.getKey === 'function') {
      const key = await api.getKey()
      if (key instanceof Uint8Array) return key
      if (typeof key === 'string') return new TextEncoder().encode(key)
    }
  }
  // Fallback for non-browser environments (e.g., tests)
  return new Uint8Array(32)
}

