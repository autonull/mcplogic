import { SessionStorage, SavedSession } from './storage.js';
import fs from 'fs/promises';
import path from 'path';

export class FileSessionStorage implements SessionStorage {
    private storageDir: string;

    constructor(storageDir: string = '.mcplogic-sessions') {
        this.storageDir = storageDir;
    }

    async init(): Promise<void> {
        try {
            await fs.mkdir(this.storageDir, { recursive: true });
        } catch (e) {
            // Ignore if exists
        }
    }

    private getFilePath(id: string): string {
        return path.join(this.storageDir, `${id}.json`);
    }

    async save(session: SavedSession): Promise<void> {
        await this.init();
        await fs.writeFile(this.getFilePath(session.id), JSON.stringify(session, null, 2));
    }

    async load(id: string): Promise<SavedSession | null> {
        try {
            const data = await fs.readFile(this.getFilePath(id), 'utf-8');
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }

    async delete(id: string): Promise<void> {
        try {
            await fs.unlink(this.getFilePath(id));
        } catch (e) {
            // Ignore if not exists
        }
    }

    async list(): Promise<string[]> {
        await this.init();
        try {
            const files = await fs.readdir(this.storageDir);
            return files
                .filter(f => f.endsWith('.json'))
                .map(f => f.replace('.json', ''));
        } catch (e) {
            return [];
        }
    }

    async clear(): Promise<void> {
        const ids = await this.list();
        for (const id of ids) {
            await this.delete(id);
        }
    }
}
