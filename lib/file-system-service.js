import { BaseService } from './base-service.js';

/**
 * FileSystemService - 原生檔案系統存取服務
 * 利用 File System Access API (showDirectoryPicker, FileSystemHandle) 
 * 實現網頁與本地檔案系統的深度互動。
 */
export class FileSystemService extends BaseService {
    constructor() {
        super();
        this.dirHandle = null;
    }

    /**
     * 請求使用者選擇目錄
     */
    async openDirectory() {
        try {
            this.dirHandle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });
            this.emit('dir-opened', { handle: this.dirHandle });
            return this.dirHandle;
        } catch (err) {
            console.error('[FileSystemService] Open Directory Error:', err);
            throw err;
        }
    }

    /**
     * 遞迴獲取目錄下的所有檔案 (簡化版)
     */
    async listFiles(handle = this.dirHandle) {
        if (!handle) return [];
        const files = [];
        for await (const entry of handle.values()) {
            files.push({
                name: entry.name,
                kind: entry.kind,
                handle: entry
            });
        }
        return files;
    }

    /**
     * 讀取檔案內容
     * @param {FileSystemFileHandle} fileHandle 
     */
    async readFile(fileHandle) {
        const file = await fileHandle.getFile();
        return await file.text();
    }

    /**
     * 寫入內容至檔案
     * @param {FileSystemFileHandle} fileHandle 
     * @param {string} content 
     */
    async writeFile(fileHandle, content) {
        try {
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            this.emit('file-saved', { name: fileHandle.name });
            return true;
        } catch (err) {
            console.error('[FileSystemService] Write File Error:', err);
            throw err;
        }
    }

    /**
     * 獲取特定路徑的檔案控制代碼
     */
    async getFileHandle(fileName, create = false) {
        if (!this.dirHandle) return null;
        return await this.dirHandle.getFileHandle(fileName, { create });
    }
}

export const fileSystemService = new FileSystemService();
