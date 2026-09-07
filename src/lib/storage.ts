import { readFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface Storage {
  getSignedUploadUrl(path: string, contentType: string): Promise<string>;
  getSignedReadUrl(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
}

const DATA_DIR = join(process.cwd(), 'data');

export class LocalStorage implements Storage {
  /**
   * Returns a file:// URL pointing to the local path.
   * The caller writes the file content to disk at this path.
   */
  async getSignedUploadUrl(path: string, _contentType: string): Promise<string> {
    const fullPath = join(DATA_DIR, path);
    await mkdir(dirname(fullPath), { recursive: true });
    return `file://${fullPath}`;
  }

  async getSignedReadUrl(path: string): Promise<string> {
    const fullPath = join(DATA_DIR, path);
    // Verify the file exists before returning a URL
    await readFile(fullPath, { flag: 'r' });
    return `file://${fullPath}`;
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(join(DATA_DIR, path));
      return true;
    } catch {
      return false;
    }
  }
}
