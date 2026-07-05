import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { dbService } from "../../../lib/db-service.js";
import { notificationService } from "../../../lib/notification-service.js";

/**
 * IndexedDBBackupPage
 * 
 * 離線筆記與 Worker 背景備份實驗室。
 * 展示以下前沿技術：
 * 1. 原生 IndexedDB 增刪改查與自動存檔 (Auto-save) 觸發。
 * 2. 多執行緒協同：主執行緒 DOM 渲染，背景 Worker 處理大容量 JSON 序列化、Gzip 壓縮與加密。
 * 3. 檔案解鎖還原：透過 XOR 位元解鎖與 DecompressionStream 原生解壓導入。
 */
export class IndexedDBBackupPage extends BaseComponent {
  constructor() {
    super();
    this.initReactiveState({
      notes: [],
      activeNoteId: null,
      saveStatus: "已同步至資料庫",
      isBackingUp: false,
      searchQuery: ""
    });
    this._saveTimeout = null;
    this._onDBChange = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._onDBChange = () => this.loadNotes();
    // 訂閱資料庫變更事件，實現反應式自動刷新
    dbService.on("change", this._onDBChange);
    this.loadNotes();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._onDBChange) {
      dbService.off("change", this._onDBChange);
    }
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
    }
  }

  /**
   * 自資料庫載入所有筆記
   */
  async loadNotes() {
    try {
      const list = await dbService.getAll();
      this.state.notes = list;
      
      // 若資料庫為空，自動載入預設示範資料
      if (list.length === 0) {
        await dbService.resetDemoData();
        return;
      }

      // 預設選取第一筆筆記
      if (list.length > 0 && !this.state.activeNoteId) {
        this.state.activeNoteId = list[0].id;
      }
      this.update();
    } catch (error) {
      notificationService.error(`載入資料庫失敗: ${error.message}`);
    }
  }

  /**
   * 建立新筆記
   */
  async createNote() {
    const newNote = {
      id: "note-" + Date.now(),
      title: "新建筆記",
      content: "在此處撰寫內容...",
      updatedAt: new Date().toISOString()
    };
    await dbService.put(newNote);
    this.state.activeNoteId = newNote.id;
    notificationService.info("已新增筆記");
  }

  /**
   * 刪除當前選取的筆記
   */
  async deleteActiveNote() {
    if (!this.state.activeNoteId) return;
    if (confirm("確定要刪除這筆筆記嗎？")) {
      const idToDelete = this.state.activeNoteId;
      
      // 重置選取狀態
      const remaining = this.state.notes.filter(n => n.id !== idToDelete);
      this.state.activeNoteId = remaining.length > 0 ? remaining[0].id : null;
      
      await dbService.delete(idToDelete);
      notificationService.info("已刪除筆記");
    }
  }

  /**
   * 重置回示範資料
   */
  async handleReset() {
    if (confirm("這將會清除您目前所有的筆記並還原為示範資料，確定嗎？")) {
      this.state.activeNoteId = null;
      await dbService.resetDemoData();
      notificationService.success("已重置為預設示範資料");
    }
  }

  /**
   * 編輯區欄位輸入變更
   */
  handleNoteInput(field, value) {
    const note = this.state.notes.find(n => n.id === this.state.activeNoteId);
    if (note) {
      note[field] = value;
      note.updatedAt = new Date().toISOString();
      this.triggerAutoSave(note);
    }
  }

  /**
   * 防抖 (Debounce) 自動存檔機制
   */
  triggerAutoSave(note) {
    this.state.saveStatus = "儲存中...";
    this.update();

    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    
    this._saveTimeout = setTimeout(async () => {
      try {
        await dbService.put(note);
        this.state.saveStatus = "已自動儲存";
        this.update();
      } catch (err) {
        this.state.saveStatus = "儲存失敗";
        this.update();
      }
    }, 600);
  }

  /**
   * 觸發 Worker 執行背景備份
   */
  triggerBackup() {
    if (this.state.notes.length === 0) {
      notificationService.warn("資料庫中無資料可備份。");
      return;
    }
    
    this.state.isBackingUp = true;
    this.update();

    // 啟動 Web Worker
    const worker = new Worker("./lib/backup-worker.js");
    worker.postMessage({ action: "backup", payload: this.state.notes });

    worker.onmessage = (e) => {
      const { status, blob, originalSize, compressedSize, error } = e.data;
      this.state.isBackingUp = false;

      if (status === "success") {
        const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
        notificationService.success(`加密備份封裝完成！壓縮率: ${ratio}%`);

        // 提供下載
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `vanilla-db-backup-${new Date().toISOString().slice(0, 10)}.bak`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        notificationService.error(`備份失敗: ${error}`);
      }
      
      worker.terminate();
      this.update();
    };
  }

  /**
   * 處理備份檔還原匯入
   */
  async handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      notificationService.info("正在還原備份檔...");
      const arrayBuffer = await file.arrayBuffer();
      const view = new DataView(arrayBuffer);
      const length = arrayBuffer.byteLength;
      const decryptedBytes = new Uint8Array(length);

      // 1. 還原異或混淆加密 (XOR 0x42)
      for (let i = 0; i < length; i++) {
        decryptedBytes[i] = view.getUint8(i) ^ 0x42;
      }

      // 2. Gzip 解壓縮
      let jsonStr;
      if (typeof DecompressionStream !== "undefined") {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(decryptedBytes);
            controller.close();
          }
        }).pipeThrough(new DecompressionStream("gzip"));
        
        const response = new Response(stream);
        jsonStr = await response.text();
      } else {
        // Fallback
        const decoder = new TextDecoder();
        jsonStr = decoder.decode(decryptedBytes);
      }

      // 3. 解析 JSON 並導入 IndexedDB
      const importedNotes = JSON.parse(jsonStr);
      if (Array.isArray(importedNotes)) {
        for (const note of importedNotes) {
          // 強制校驗欄位完整性
          if (note.id && note.title) {
            await dbService.put(note);
          }
        }
        // 重設目前焦點筆記
        this.state.activeNoteId = importedNotes[0].id;
        notificationService.success(`成功還原 ${importedNotes.length} 筆筆記資料！`);
      } else {
        throw new Error("備份檔案內容並非標準陣列格式。");
      }
    } catch (err) {
      notificationService.error(`還原失敗: 檔案格式無效或已毀損。(${err.message})`);
    } finally {
      event.target.value = ""; // 清空 input 觸發 change
    }
  }

  render() {
    const activeNote = this.state.notes.find(n => n.id === this.state.activeNoteId) || null;
    const filteredNotes = this.state.notes.filter(n => 
      n.title.toLowerCase().includes(this.state.searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(this.state.searchQuery.toLowerCase())
    );

    return html`
      <style>
        .db-container {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 1.5rem;
          height: 600px;
          margin-top: 1rem;
          border: 1px solid var(--border-color);
          border-radius: 16px;
          overflow: hidden;
          background: var(--card-bg);
          box-shadow: var(--card-shadow);
        }

        /* 側欄 */
        .db-sidebar {
          border-right: 1px solid var(--border-color);
          background: var(--surface-color);
          display: flex;
          flex-direction: column;
          padding: 1rem;
          gap: 0.8rem;
          overflow: hidden;
        }

        .search-input {
          width: 100%;
          padding: 0.5rem 0.8rem;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          background: var(--card-bg);
          color: var(--text-color);
          font-size: 0.9rem;
        }

        .notes-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .note-item {
          padding: 0.75rem;
          border-radius: 8px;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
          text-align: left;
        }

        .note-item:hover {
          background: rgba(var(--primary-color-rgb, 37, 99, 235), 0.05);
          transform: translateX(2px);
        }

        .note-item.active {
          background: var(--primary-subtle, rgba(37, 99, 235, 0.1));
          border-color: var(--primary-color);
        }

        .note-item h4 {
          margin: 0 0 0.25rem;
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-color);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .note-item span {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        /* 編輯區 */
        .db-editor {
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          background: var(--card-bg);
          overflow: hidden;
        }

        .editor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 0.8rem;
          margin-bottom: 1rem;
        }

        .status-badge {
          font-size: 0.75rem;
          padding: 0.25rem 0.6rem;
          border-radius: 99px;
          background: var(--surface-color);
          color: var(--text-muted);
          border: 1px solid var(--border-color);
        }

        .editor-title {
          width: 100%;
          border: none;
          background: transparent;
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-color);
          outline: none;
          margin-bottom: 0.8rem;
          font-family: var(--font-title);
        }

        .editor-textarea {
          width: 100%;
          flex: 1;
          border: none;
          background: transparent;
          resize: none;
          outline: none;
          font-size: 1rem;
          line-height: 1.6;
          color: var(--text-color);
          font-family: inherit;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
          gap: 0.5rem;
        }

        /* 控制列 */
        .control-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding: 1rem;
          background: var(--surface-color);
          border-radius: 12px;
          border: 1px solid var(--border-color);
          flex-wrap: wrap;
          gap: 0.8rem;
        }

        .button-group {
          display: flex;
          gap: 0.6rem;
          align-items: center;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 0.9rem;
          border-radius: 8px;
          font-size: 0.88rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid var(--border-color);
          background: var(--card-bg);
          color: var(--text-color);
        }

        .btn:hover {
          background: var(--surface-color);
          border-color: var(--text-muted);
        }

        .btn-primary {
          background: var(--primary-color);
          color: #fff;
          border-color: var(--primary-color);
        }

        .btn-primary:hover {
          filter: brightness(1.08);
        }

        .btn-danger {
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.2);
        }

        .btn-danger:hover {
          background: rgba(239, 68, 68, 0.05);
          border-color: #ef4444;
        }

        .file-upload-label {
          cursor: pointer;
        }

        /* 旋轉動畫 */
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      </style>

      <div>
        <h2>🧪 IndexedDB 離線庫與 Worker 備份實驗室</h2>
        <p>此頁面展示了如何在不依賴任何外部資料庫套件（如 RxDB 或 LocalForage）的環境下，操作瀏覽器原生 IndexedDB 來管理大量離線數據。並使用背景 Worker 執行 Gzip 壓縮備份，確保 UI 在大檔案處理時流暢不卡頓。</p>

        <!-- 工具控制列 -->
        <div class="control-bar">
          <div class="button-group">
            <button class="btn btn-primary" onclick="this.closest('indexeddb-backup-page').createNote()">
              <i data-lucide="plus"></i> 新建筆記
            </button>
            <button class="btn btn-danger" onclick="this.closest('indexeddb-backup-page').deleteActiveNote()">
              <i data-lucide="trash-2"></i> 刪除目前筆記
            </button>
          </div>

          <div class="button-group">
            <label class="btn file-upload-label">
              <i data-lucide="upload"></i> 匯入備份 (.bak)
              <input 
                type="file" 
                accept=".bak" 
                style="display: none;" 
                onchange="this.closest('indexeddb-backup-page').handleImport(event)"
              />
            </label>
            
            <button class="btn" onclick="this.closest('indexeddb-backup-page').triggerBackup()" ?disabled="${this.state.isBackingUp}">
              <i data-lucide="shield-check" class="${this.state.isBackingUp ? "spin" : ""}"></i>
              ${this.state.isBackingUp ? "背景封裝中..." : "導出加密備份"}
            </button>
            
            <button class="btn" onclick="this.closest('indexeddb-backup-page').handleReset()">
              <i data-lucide="rotate-ccw"></i> 還原預設
            </button>
          </div>
        </div>

        <!-- 筆記主容器 -->
        <div class="db-container">
          <!-- 側欄列表 -->
          <div class="db-sidebar">
            <input 
              type="text" 
              class="search-input" 
              placeholder="搜尋筆記..." 
              value="${this.state.searchQuery}"
              oninput="this.closest('indexeddb-backup-page').state.searchQuery = this.value; this.closest('indexeddb-backup-page').update()"
            />
            <div class="notes-list">
              ${filteredNotes.map(
                (note) => html`
                  <div 
                    class="note-item ${note.id === this.state.activeNoteId ? "active" : ""}" 
                    onclick="this.closest('indexeddb-backup-page').state.activeNoteId = '${note.id}'; this.closest('indexeddb-backup-page').update()"
                  >
                    <h4>${note.title || "無標題"}</h4>
                    <span>${new Date(note.updatedAt).toLocaleTimeString()}</span>
                  </div>
                `
              )}
              ${filteredNotes.length === 0 ? html`<div style="text-align: center; color: var(--text-muted); margin-top: 2rem; font-size: 0.85rem;">找不到相關筆記</div>` : ""}
            </div>
          </div>

          <!-- 右側編輯區 -->
          <div class="db-editor">
            ${activeNote
              ? html`
                  <div class="editor-header">
                    <span class="status-badge"><i data-lucide="save" style="margin-right: 0.2rem; vertical-align: middle;"></i>${this.state.saveStatus}</span>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">
                      修改時間: ${new Date(activeNote.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  <input 
                    class="editor-title" 
                    value="${activeNote.title}"
                    oninput="this.closest('indexeddb-backup-page').handleNoteInput('title', this.value)"
                  />
                  <textarea 
                    class="editor-textarea" 
                    placeholder="在此寫下筆記大綱或程式碼範例..."
                    oninput="this.closest('indexeddb-backup-page').handleNoteInput('content', this.value)"
                  >${activeNote.content}</textarea>
                `
              : html`
                  <div class="empty-state">
                    <i data-lucide="book-open" style="width: 48px; height: 48px; stroke-width: 1.5;"></i>
                    <p>請選取或建立一個筆記以開始編輯</p>
                  </div>
                `}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("indexeddb-backup-page", IndexedDBBackupPage);
