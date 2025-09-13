export class Stronghold {
  static async load(_path: string, _pw: string) {
    return new Stronghold();
  }
  async loadClient(_name: string) {
    return {
      getStore: () => ({
        get: async () => null,
        insert: async () => {},
      })
    };
  }
  async save() {}
  async unload() {}
}
