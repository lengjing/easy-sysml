/** Configuration store with type-safe access */
export class ConfigStore {
  private values = new Map<string, unknown>();
  private defaults = new Map<string, unknown>();

  /** Set default values */
  setDefaults(defaults: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(defaults)) {
      this.defaults.set(key, value);
    }
  }

  /** Get a config value with type */
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    if (this.values.has(key)) {
      return this.values.get(key) as T;
    }
    if (this.defaults.has(key)) {
      return this.defaults.get(key) as T;
    }
    return defaultValue;
  }

  /** Set a config value */
  set(key: string, value: unknown): void {
    this.values.set(key, value);
  }

  /** Merge configuration from a partial record */
  merge(config: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(config)) {
      this.values.set(key, value);
    }
  }

  /** Get all configuration as a plain object */
  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.defaults) {
      result[key] = value;
    }
    for (const [key, value] of this.values) {
      result[key] = value;
    }
    return result;
  }
}
