import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { audioService } from '../../../lib/audio-service.js';
import { midiService } from '../../../lib/midi-service.js';
import { notificationService } from '../../../lib/notification-service.js';

export class AudioPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            isStarted: false,
            waveType: 'sine',
            volume: 20,
            midiEnabled: false
        });
    }

    async startAudio() {
        await audioService.init();
        this.state.isStarted = true;
        notificationService.success('音訊引擎已啟動');
    }

    toggleMIDI() {
        if (!this.state.midiEnabled) {
            midiService.on('message', (msg) => {
                if (msg.command === 'Note On') {
                    audioService.playNote(audioService.midiNoteToFreq(msg.note), this.state.waveType, `midi-${msg.note}`);
                } else if (msg.command === 'Note Off') {
                    audioService.stopNote(`midi-${msg.note}`);
                }
            });
            this.state.midiEnabled = true;
            notificationService.info('已與 MIDI 設備聯動');
        }
    }

    playTest() {
        audioService.playNote(440, this.state.waveType, 'test');
        setTimeout(() => audioService.stopNote('test'), 500);
    }

    render() {
        return html`
            <style>
                .audio-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
                .wave-btn { flex: 1; padding: 1rem; border: 1px solid #ddd; border-radius: 8px; cursor: pointer; background: #fff; }
                .wave-btn.active { background: var(--primary-color); color: #fff; border-color: var(--primary-color); }
            </style>

            <div class="lab-header">
                <h2>🔊 原生音訊合成 (Web Audio)</h2>
                <p>利用振盪器直接在瀏覽器生成聲波。支援 MIDI 硬體聯動發聲。</p>
            </div>

            ${!this.state.isStarted ? html`
                <div class="lab-card" style="text-align:center; padding: 3rem;">
                    <button class="btn btn-primary btn-lg" onclick="this.closest('page-lab-audio').startAudio()">🚀 啟動音訊引擎</button>
                </div>
            ` : html`
                <div class="audio-grid">
                    <div class="lab-card">
                        <h3>🎹 合成器控制</h3>
                        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
                            ${['sine', 'square', 'sawtooth', 'triangle'].map(t => html`
                                <button class="wave-btn ${this.state.waveType === t ? 'active' : ''}" 
                                        onclick="this.closest('page-lab-audio').state.waveType = '${t}'">${t}</button>
                            `)}
                        </div>
                        <label>主音量: ${this.state.volume}%</label>
                        <input type="range" min="0" max="100" .value="${this.state.volume}" 
                               oninput="const v = this.value; this.closest('page-lab-audio').state.volume = v; audioService.setVolume(v/100)">
                        <button class="btn btn-secondary" style="width:100%; margin-top: 1rem;" onclick="this.closest('page-lab-audio').playTest()">🎵 播放測試音 (A4)</button>
                    </div>

                    <div class="lab-card">
                        <h3>🔗 硬體聯動</h3>
                        <p><small>若已連接 MIDI 設備，可開啟聯動以實體鍵盤演奏。</small></p>
                        <button class="btn ${this.state.midiEnabled ? 'btn-success' : 'btn-outline'}" 
                                style="width:100%;" 
                                onclick="this.closest('page-lab-audio').toggleMIDI()">
                            ${this.state.midiEnabled ? '✅ MIDI 已聯動' : '🔌 開啟 MIDI 聯動'}
                        </button>
                    </div>
                </div>
            `}

            <section class="info-section">
                <h3>🎓 技術手冊</h3>
                <ul>
                    <li><strong>OscillatorNode</strong>：產生各種週期的原始聲波。</li>
                    <li><strong>GainNode</strong>：控制振幅與音量包絡 (Envelope)。</li>
                    <li><strong>AudioContext</strong>：全域音訊圖形結構容器。</li>
                </ul>
                <a href="#/lab" class="btn btn-secondary btn-sm" style="margin-top: 1.5rem;">⬅️ 回實驗室列表</a>
            </section>
        `;
    }
}
customElements.define('page-lab-audio', AudioPage);
