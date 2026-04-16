/** Configuration store with type-safe access */
export class ConfigStore {
    values = new Map();
    defaults = new Map();
    /** Set default values */
    setDefaults(defaults) {
        for (const [key, value] of Object.entries(defaults)) {
            this.defaults.set(key, value);
        }
    }
    get(key, defaultValue) {
        if (this.values.has(key)) {
            return this.values.get(key);
        }
        if (this.defaults.has(key)) {
            return this.defaults.get(key);
        }
        return defaultValue;
    }
    /** Set a config value */
    set(key, value) {
        this.values.set(key, value);
    }
    /** Merge configuration from a partial record */
    merge(config) {
        for (const [key, value] of Object.entries(config)) {
            this.values.set(key, value);
        }
    }
    /** Get all configuration as a plain object */
    toJSON() {
        const result = {};
        for (const [key, value] of this.defaults) {
            result[key] = value;
        }
        for (const [key, value] of this.values) {
            result[key] = value;
        }
        return result;
    }
}
//# sourceMappingURL=config.js.map