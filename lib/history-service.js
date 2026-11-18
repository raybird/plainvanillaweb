import { BaseService } from './base-service.js';

function cloneSnapshot(value) {
    try {
        return structuredClone(value);
    } catch (error) {
        if (error.name !== 'DataCloneError') throw error;
        // 相容既有可轉成 JSON 的 Proxy 狀態。無法用任一方式複製時回報原始錯誤。
        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            throw error;
        }
    }
}

/**
 * HistoryService - 原生操作歷史管理服務
 * 實作撤銷 (Undo) 與重做 (Redo) 邏輯。
 * 採用快照模式 (Snapshot Pattern)。
 */
export class HistoryService extends BaseService {
    constructor(maxSize = 20) {
        super();
        this.undoStack = [];
        this.redoStack = [];
        this.maxSize = maxSize;
    }

    /**
     * 儲存當前狀態快照
     * @param {*} state
     */
    push(state) {
        // 深度複製快照
        const snapshot = cloneSnapshot(state);
        
        this.undoStack.push(snapshot);
        if (this.undoStack.length > this.maxSize) {
            this.undoStack.shift();
        }

        // 當有新操作時，清空重做棧
        this.redoStack = [];
        
        this._emitChange();
    }

    /**
     * 執行撤銷
     * @param {*} currentState 當前狀態（用於存入 redo 棧）
     * @returns {*} 撤銷後的狀態
     */
    undo(currentState) {
        if (!this.canUndo) return null;

        const currentSnapshot = cloneSnapshot(currentState);
        const snapshot = this.undoStack.pop();
        this.redoStack.push(currentSnapshot);
        this._emitChange();
        return snapshot;
    }

    /**
     * 執行重做
     * @param {*} currentState 當前狀態
     * @returns {*} 重做後的狀態
     */
    redo(currentState) {
        if (!this.canRedo) return null;

        const currentSnapshot = cloneSnapshot(currentState);
        const snapshot = this.redoStack.pop();
        this.undoStack.push(currentSnapshot);
        this._emitChange();
        return snapshot;
    }

    get canUndo() {
        return this.undoStack.length > 0;
    }

    get canRedo() {
        return this.redoStack.length > 0;
    }

    _emitChange() {
        this.emit('change', {
            canUndo: this.canUndo,
            canRedo: this.canRedo,
            undoCount: this.undoStack.length,
            redoCount: this.redoStack.length
        });
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this._emitChange();
    }
}

export const historyService = new HistoryService();
