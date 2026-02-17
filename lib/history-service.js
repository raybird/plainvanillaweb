import { BaseService } from './base-service.js';

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
        this._isApplying = false;
    }

    /**
     * 儲存當前狀態快照
     * @param {object} state 
     */
    push(state) {
        if (this._isApplying) return; // 避免在執行 undo/redo 時觸發記錄

        // 深度複製快照
        const snapshot = JSON.parse(JSON.stringify(state));
        
        this.undoStack.push(snapshot);
        if (this.undoStack.length > this.maxSize) {
            this.undoStack.shift();
        }

        // 當有新操作時，清空重做棧
        this.redoStack = [];
        
        this.emit('change', { 
            canUndo: this.canUndo, 
            canRedo: this.canRedo,
            undoCount: this.undoStack.length,
            redoCount: this.redoStack.length
        });
    }

    /**
     * 執行撤銷
     * @param {object} currentState 當前狀態（用於存入 redo 棧）
     * @returns {object|null} 撤銷後的狀態
     */
    undo(currentState) {
        if (!this.canUndo) return null;

        this._isApplying = true;
        const snapshot = this.undoStack.pop();
        
        // 將當前狀態存入重做棧
        this.redoStack.push(JSON.parse(JSON.stringify(currentState)));
        
        this._isApplying = false;
        this.emit('change', { canUndo: this.canUndo, canRedo: this.canRedo });
        return snapshot;
    }

    /**
     * 執行重做
     * @param {object} currentState 當前狀態
     * @returns {object|null} 重做後的狀態
     */
    redo(currentState) {
        if (!this.canRedo) return null;

        this._isApplying = true;
        const snapshot = this.redoStack.pop();
        
        // 將當前狀態存入撤銷棧
        this.undoStack.push(JSON.parse(JSON.stringify(currentState)));
        
        this._isApplying = false;
        this.emit('change', { canUndo: this.canUndo, canRedo: this.canRedo });
        return snapshot;
    }

    get canUndo() {
        return this.undoStack.length > 0;
    }

    get canRedo() {
        return this.redoStack.length > 0;
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this.emit('change', { canUndo: false, canRedo: false });
    }
}

export const historyService = new HistoryService();
