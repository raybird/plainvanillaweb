/**
 * POS v2 管理主機（#16）：把房間、信令、WebRTC 與 hub 組起來。
 *
 * - 同一台電腦同一個 namespace 只有一個主機分頁：以 Web Lock 決定，其他管理分頁是唯讀，
 *   並排隊等鎖；主機分頁關閉後，排在最前面的唯讀分頁自動接手。
 * - 主機寫入（遠端裝置送單、管理頁操作）後以 MessageBus 發出 `pos-v2:changed`，唯讀分頁收到後重讀 IndexedDB。
 * - 「重設 demo 資料」保留房間；「重新產生房間」換新的 roomId 與 hostSecret，所有裝置都要重新設定。
 *
 * 事件：`status`（角色、信令狀態、房間）、`changed`（資料改變，畫面重讀）、`connections`、`pairings`、`attempts`。
 */
import { BaseService } from '../../../../lib/base-service.js';
import { createMessageBus } from '../../../../lib/coordination.js';
import { solutionStorageName } from '../solution-kit.js';
import { createPosV2Repository } from './pos-v2-repository.js';
import { PosV2Hub } from './pos-v2-hub.js';
import { HostLinks } from './peer-link.js';
import { SIGNALING_STATE, SignalingClient } from './signaling-client.js';

export const HOST_ROLE = Object.freeze({
    STARTING: 'starting',
    PRIMARY: 'primary',
    READONLY: 'readonly',
    STOPPED: 'stopped',
});

export const POS_V2_TOPIC_CHANGED = 'pos-v2:changed';

export class PosV2Host extends BaseService {
    /**
     * @param {{ namespace: string, signalingUrl?: string | null, repository?: object, locks?: LockManager, bus?: object }} options
     */
    constructor({ namespace, signalingUrl = null, repository, locks = globalThis.navigator?.locks, bus }) {
        super();
        this.namespace = namespace;
        this.signalingUrl = signalingUrl;
        this.repository = repository ?? createPosV2Repository({
            dbName: solutionStorageName(namespace, 'orders'),
            roomDbName: solutionStorageName(namespace, 'room'),
        });
        this._ownsRepository = !repository;
        this._locks = locks;
        this._bus = bus ?? createMessageBus({ namespace });
        this._ownsBus = !bus;
        this.role = HOST_ROLE.STARTING;
        this.room = null;
        this.hub = null;
        this.signaling = null;
        this.links = null;
        this._releaseLock = null;
        this._abortLock = new AbortController();
        this._offs = [];
        this._disposed = false;
    }

    get lockName() {
        return solutionStorageName(this.namespace, 'host');
    }

    get signalingState() {
        return this.signaling?.state ?? SIGNALING_STATE.IDLE;
    }

    status() {
        return {
            role: this.role,
            signalingUrl: this.signalingUrl,
            signalingState: this.signalingState,
            roomId: this.room?.roomId ?? null,
        };
    }

    async start() {
        this._offs.push(this._bus.subscribe(POS_V2_TOPIC_CHANGED, () => {
            if (this.role !== HOST_ROLE.PRIMARY) this.emit('changed', {});
        }));
        this.room = await this.repository.loadRoom();
        if (this._disposed) return;
        if (!this._locks) {
            // 沒有 Web Locks（很舊的瀏覽器）：無法保證單一主機，仍以主機身分執行
            await this._becomePrimary();
            return;
        }
        const granted = await new Promise((resolve) => {
            this._locks.request(this.lockName, { ifAvailable: true }, (lock) => {
                if (!lock) {
                    resolve(false);
                    return null;
                }
                resolve(true);
                return new Promise((release) => {
                    this._releaseLock = release;
                });
            }).catch(() => resolve(false));
        });
        if (this._disposed) {
            this._releaseLock?.();
            return;
        }
        if (granted) {
            await this._becomePrimary();
            return;
        }
        this._setRole(HOST_ROLE.READONLY);
        // 排隊等鎖：主機分頁關閉後自動接手
        this._locks.request(this.lockName, { signal: this._abortLock.signal }, (lock) => {
            if (!lock || this._disposed) return null;
            this._becomePrimary().catch((err) => console.warn('[pos-v2] 接手主機失敗', err));
            return new Promise((release) => {
                this._releaseLock = release;
            });
        }).catch(() => {});
    }

    async _becomePrimary() {
        if (this._disposed) return;
        this.room = await this.repository.loadRoom();
        this.hub = new PosV2Hub({ repository: this.repository });
        for (const type of ['connections', 'pairings', 'attempts']) {
            this._offs.push(this.hub.on(type, (detail) => this.emit(type, detail)));
        }
        this._offs.push(this.hub.on('changed', () => {
            this._bus.publish(POS_V2_TOPIC_CHANGED, {});
            this.emit('changed', {});
        }));
        this.hub.start();
        this._setRole(HOST_ROLE.PRIMARY);
        this._connectSignaling();
    }

    _connectSignaling() {
        this._closeSignaling();
        if (!this.signalingUrl || !this.room || this.role !== HOST_ROLE.PRIMARY) {
            this._emitStatus();
            return;
        }
        const signaling = new SignalingClient({ url: this.signalingUrl, roomId: this.room.roomId, role: 'host', hostSecret: this.room.hostSecret });
        const links = new HostLinks({ signaling });
        this.signaling = signaling;
        this.links = links;
        this._signalingOffs = [
            signaling.on('state', () => this._emitStatus()),
            signaling.on('peer-left', ({ peerId }) => this.hub?.disconnect(peerId, 'peer left signaling')),
            links.on('channel', ({ peerId, channel }) => this.hub?.attach(peerId, channel)),
        ];
        signaling.connect();
        this._emitStatus();
    }

    _closeSignaling() {
        for (const off of this._signalingOffs ?? []) off();
        this._signalingOffs = [];
        this.links?.dispose();
        this.signaling?.close();
        this.links = null;
        this.signaling = null;
    }

    /** 管理頁改了信令網址 */
    setSignalingUrl(url) {
        this.signalingUrl = url;
        if (this.role === HOST_ROLE.PRIMARY) this._connectSignaling();
        else this._emitStatus();
    }

    /** 被 4002 取代或 4001 被拒後，使用者按下重新連線 */
    reconnectSignaling() {
        this._connectSignaling();
    }

    _assertPrimary() {
        if (this.role !== HOST_ROLE.PRIMARY) throw new Error('這個分頁是唯讀的，請在主機分頁操作');
    }

    /** 管理頁的寫入：完成後推送給遠端裝置並通知唯讀分頁 */
    async mutate(run) {
        this._assertPrimary();
        const value = await run(this.repository, this.hub);
        this.hub.notifyChanged();
        return value;
    }

    /** 建立配對票：配對 token（放進 QR Code）與 6 位數連線碼，5 分鐘內有效 */
    createPairing() {
        this._assertPrimary();
        return this.repository.createPairing();
    }

    /** 核准配對申請並指定角色；廚房要有站台名稱（同一個 namespace 內唯一） */
    approvePairing(pairRequestId, options) {
        this._assertPrimary();
        return this.hub.approvePairing(pairRequestId, options);
    }

    rejectPairing(pairRequestId) {
        this._assertPrimary();
        this.hub.rejectPairing(pairRequestId);
    }

    /** 撤銷店員裝置：連線中的裝置立即失去權限 */
    revokeDevice(credentialId) {
        this._assertPrimary();
        return this.hub.revoke(credentialId);
    }

    /** 開桌：建立新的用餐場次，回傳只出現這一次的入桌碼 */
    openTable(tableId) {
        return this.mutate((repository) => repository.openTable(tableId));
    }

    /** 關桌：這個場次的入桌授權不能再送單，連線中的顧客畫面收到場次已關閉 */
    closeTable(tableId) {
        return this.mutate((repository) => repository.closeTable(tableId));
    }

    /** 換新入桌碼：舊碼立即失效，已加入的顧客不受影響 */
    rotateTableCode(tableId) {
        return this.mutate((repository) => repository.rotateTableCode(tableId));
    }

    listAttempts() {
        return this.hub?.listAttempts() ?? [];
    }

    listPairings() {
        return this.hub?.listPairings() ?? [];
    }

    /** 重設 demo 資料：刪除訂單資料庫（訂單、桌位、授權），保留房間。已連線的裝置全部斷線，要重新配對 */
    async resetData() {
        this._assertPrimary();
        for (const conn of this.hub.listConnections()) this.hub.disconnect(conn.id, 'demo data reset');
        const report = await this.repository.reset();
        this.hub.notifyChanged();
        return report;
    }

    /** 重新產生房間：新的 roomId 與 hostSecret，撤銷所有授權，信令以新房間重新連線 */
    async regenerateRoom() {
        this._assertPrimary();
        for (const conn of this.hub.listConnections()) this.hub.disconnect(conn.id, 'room regenerated');
        this.room = await this.repository.regenerateRoom();
        this._connectSignaling();
        this.hub.notifyChanged();
        return this.room;
    }

    _setRole(role) {
        this.role = role;
        this._emitStatus();
    }

    _emitStatus() {
        this.emit('status', this.status());
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        this._abortLock.abort();
        for (const off of this._offs) off();
        this._offs = [];
        this._closeSignaling();
        this.hub?.dispose();
        this._releaseLock?.();
        if (this._ownsBus) this._bus.dispose();
        if (this._ownsRepository) this.repository.close();
        this.role = HOST_ROLE.STOPPED;
    }
}
