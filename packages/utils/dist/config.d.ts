/** Configuration store with type-safe access */
export declare class ConfigStore {
    private values;
    private defaults;
    /** Set default values */
    setDefaults(defaults: Record<string, unknown>): void;
    /** Get a config value with type */
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    /** Set a config value */
    set(key: string, value: unknown): void;
    /** Merge configuration from a partial record */
    merge(config: Record<string, unknown>): void;
    /** Get all configuration as a plain object */
    toJSON(): Record<string, unknown>;
}
//# sourceMappingURL=config.d.ts.map