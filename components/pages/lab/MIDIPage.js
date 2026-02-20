import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { midiService } from '../../../lib/midi-service.js';
import { notificationService } from '../../../lib/notification-service.js';

/**
 * MIDIPage - 原生 MIDI 互動實驗室
 */
export class MIDIPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            isInitialized: false,
            devices: { inputs: [], outputs: [] },
            lastMessage: null,
            messageHistory: []
        });
    }

    async initMIDI() {
        try {
            await midiService.init();
            this.state.isInitialized = true;
            this.state.devices = midiService.getDevices();
            notificationService.success('MIDI 系統已啟動');

            midiService.on('message', (msg) => {
                this.state.lastMessage = msg;
                this.state.messageHistory = [msg, ...this.state.messageHistory].slice(0, 10);
            });

            midiService.on('devices-updated', (devices) => {
                this.state.devices = devices;
            });
        } catch (err) {
            notificationService.error(err.message);
        }
    }

    render() {
        return html`
            <style>
                .midi-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; }
                .midi-card { background: var(--card-bg); padding: 1.5rem; border-radius: 12px; border: 1px solid #eee; }
                .device-list { list-style: none; padding: 0; }
                .device-item { padding: 0.5rem; background: #f8f9fa; border-radius: 6px; margin-bottom: 0.5rem; font-size: 0.9rem; border-left: 4px solid var(--primary-color); }
                .log-area { font-family: monospace; font-size: 0.85rem; background: #2d2d2d; color: #00ff00; padding: 1rem; border-radius: 8px; height: 200px; overflow-y: auto; }
                .note-display { font-size: 2rem; font-weight: bold; text-align: center; color: var(--primary-color); margin: 1rem 0; }
            </style>

            <div class="lab-header">
                <h2>🎹 原生 MIDI 互動 (Web MIDI)</h2>
                <p>將您的電子琴、控制器連上電腦，即時捕獲與解析 MIDI 指令。</p>
            </div>

            ${!this.state.isInitialized ? html`
                <div class="midi-card" style="text-align: center; padding: 3rem;">
                    <p>Web MIDI 需要您的權限來與硬體設備通訊。</p>
                    <button class="btn btn-primary" onclick="this.closest('page-lab-midi').initMIDI()">
                        🚀 啟動 MIDI 存取
                    </button>
                </div>
            ` : html`
                <div class="midi-container">
                    <div class="midi-card">
                        <h3>🔌 已偵測設備</h3>
                        <div style="margin-bottom: 1rem;">
                            <strong>輸入 (Inputs):</strong>
                            <ul class="device-list">
                                ${this.state.devices.inputs.length ? this.state.devices.inputs.map(d => html`
                                    <li class="device-item">${d.name} <small>(${d.state})</small></li>
                                `) : html`<li style="color: #999;">未偵測到輸入設備</li>`}
                            </ul>
                        </div>
                        <div>
                            <strong>輸出 (Outputs):</strong>
                            <ul class="device-list">
                                ${this.state.devices.outputs.length ? this.state.devices.outputs.map(d => html`
                                    <li class="device-item">${d.name}</li>
                                `) : html`<li style="color: #999;">未偵測到輸出設備</li>`}
                            </ul>
                        </div>
                    </div>

                    <div class="midi-card">
                        <h3>訊號監控</h3>
                        ${this.state.lastMessage ? html`
                            <div class="note-display">
                                ${this.state.lastMessage.command}: ${this.state.lastMessage.note}
                            </div>
                            <div style="text-align: center; color: #666; font-size: 0.8rem;">
                                力度 (Velocity): ${this.state.lastMessage.velocity} | 頻道: ${this.state.lastMessage.channel}
                            </div>
                        ` : html`<p style="text-align: center; padding: 2rem; color: #999;">等待 MIDI 訊號...</p>`}
                        
                        <div class="log-area">
                            ${this.state.messageHistory.map(m => html`
                                <div>[${m.command}] Ch:${m.channel} Note:${m.note} Vel:${m.velocity}</div>
                            `)}
                        </div>
                    </div>
                </div>
            `}

            <section class="info-section" style="margin-top: 2rem;">
                <h3>🎓 技術說明</h3>
                <ul>
                    <li><strong>requestMIDIAccess</strong>：請求系統級的 MIDI 存取權限。</li>
                    <li><strong>Event Driven</strong>：透過 <code>onmidimessage</code> 實現毫秒級的訊號響應。</li>
                    <li><strong>跨設備通訊</strong>：不僅能接收，還能向硬體發送 MIDI 指令來控制燈光或音色。</li>
                </ul>
                <div style="margin-top: 1.5rem;">
                    <a href="#/lab" class="btn btn-secondary btn-sm">⬅️ 回到實驗室列表</a>
                </div>
            </section>
        `;
    }
}

customElements.define('page-lab-midi', MIDIPage);
