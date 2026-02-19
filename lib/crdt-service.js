import { BaseService } from './base-service.js';
import { broadcastService } from './broadcast-service.js';

/**
 * LWWRegister - Last Write Wins 暫存器 (CRDT)
 * 確保在分散式環境下，數據最終能達成一致。
 */
export class LWWRegister {
    constructor(id, value, timestamp = 0, nodeId = '') {
        this.id = id;
        this.value = value;
        this.timestamp = timestamp;
        this.nodeId = nodeId;
    }

    /**
     * 合併另一個暫存器的狀態
     * @param {LWWRegister} other 
     * @returns {boolean} 是否發生了狀態更新
     */
    merge(other) {
        if (other.timestamp > this.timestamp) {
            this.set(other.value, other.timestamp, other.nodeId);
            return true;
        }
        
        // 如果時間戳記相同，則比較 nodeId (通常使用字母順序)
        if (other.timestamp === this.timestamp && other.nodeId > this.nodeId) {
            this.set(other.value, other.timestamp, other.nodeId);
            return true;
        }

        return false;
    }

    set(value, timestamp = Date.now(), nodeId = '') {
        this.value = value;
        this.timestamp = timestamp;
        this.nodeId = nodeId;
    }

    toJSON() {
        return {
            id: this.id,
            value: this.value,
            timestamp: this.timestamp,
            nodeId: this.nodeId
        };
    }
}

/**
 * CRDTService - 原生協作數據服務
 */
export class CRDTService extends BaseService {
    constructor() {
        super();
        this.nodeId = Math.random().toString(36).substr(2, 9);
        this.registers = new Map();

        // 監聽來自其他分頁的同步訊息
        broadcastService.on('message', (msg) => {
            if (msg.type === 'CRDT_SYNC') {
                this.handleRemoteSync(msg.payload);
            }
        });
    }

    /**
     * 更新或建立一個資料項
     */
    update(id, value) {
        let reg = this.registers.get(id);
        if (!reg) {
            reg = new LWWRegister(id, value, Date.now(), this.nodeId);
            this.registers.set(id, reg);
        } else {
            reg.set(value, Date.now(), this.nodeId);
        }

        this._sync(reg);
        this.emit('change', { id, value, state: reg.toJSON() });
    }

    /**
     * 處理遠端同步訊息
     */
    handleRemoteSync(payload) {
        let reg = this.registers.get(payload.id);
        if (!reg) {
            reg = new LWWRegister(payload.id, payload.value, payload.timestamp, payload.nodeId);
            this.registers.set(payload.id, reg);
            this.emit('change', { id: payload.id, value: payload.value, state: reg.toJSON() });
        } else {
            const updated = reg.merge(payload);
            if (updated) {
                this.emit('change', { id: payload.id, value: payload.value, state: reg.toJSON() });
            }
        }
    }

    _sync(reg) {
        broadcastService.post('CRDT_SYNC', reg.toJSON());
    }

    getValue(id) {
        return this.registers.get(id)?.value;
    }
}

export const crdtService = new CRDTService();
