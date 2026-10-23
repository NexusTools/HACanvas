import fs from "node:fs";
import path from "node:path";

/**
 * Abstract parent class for persistent JSON stores on disk.
 * Shares directory initialization, safe JSON reading/writing, and default state cloning.
 */
export abstract class AbstractJsonStore<T> {
    public readonly filePath: string;
    protected state: T;

    constructor(filePath: string, defaultState: T) {
        this.filePath = filePath;
        this.ensureParentDirectory();
        this.state = this.loadFromDisk(defaultState);
    }

    protected ensureParentDirectory(): void {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    protected cloneDefault(defaultState: T): T {
        return JSON.parse(JSON.stringify(defaultState));
    }

    protected loadFromDisk(defaultState: T): T {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
                if (Array.isArray(defaultState)) {
                    return (Array.isArray(raw) ? raw : this.cloneDefault(defaultState)) as T;
                }
                return { ...this.cloneDefault(defaultState), ...raw };
            }
        } catch {
            // Fall back to default state
        }
        const initial = this.cloneDefault(defaultState);
        this.state = initial;
        this.saveToDisk();
        return initial;
    }

    public saveToDisk(): void {
        this.ensureParentDirectory();
        fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
    }

    public getState(): T {
        return JSON.parse(JSON.stringify(this.state));
    }
}
