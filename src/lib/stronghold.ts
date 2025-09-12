// Utilities to interact with Stronghold for retrieving the master key
// The actual Stronghold API should provide a method to fetch the key.
// Here we expect an object `__STRONGHOLD__` exposed on window with a `getKey` method.

export async function getStrongholdKey(): Promise<string> {
  if (typeof window !== 'undefined') {
    const api = (window as any).__STRONGHOLD__
    if (api && typeof api.getKey === 'function') {
      return await api.getKey()
    }
  }
  // Fallback for non-browser environments (e.g., tests)
  return 'test-key'
}

