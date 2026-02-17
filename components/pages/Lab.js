import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { speechService } from '../../lib/speech-service.js';
import { notificationService } from '../../lib/notification-service.js';

export class LabPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            isListening: false,
            transcript: '',
            ttsText: '歡迎來到 Vanilla Web 實驗室，這裡展示了原生網頁 API 的無限可能。'
        });
        this.handleResult = this.handleResult.bind(this);
        this.handleEnd = this.handleEnd.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        speechService.addEventListener('result', this.handleResult);
        speechService.addEventListener('end', this.handleEnd);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        speechService.removeEventListener('result', this.handleResult);
        speechService.removeEventListener('end', this.handleEnd);
    }

    handleResult(e) {
        this.state.transcript = e.detail.text;
        notificationService.success(`辨識結果: ${e.detail.text}`);
    }

    handleEnd() {
        this.state.isListening = false;
    }

    toggleListening() {
        if (this.state.isListening) {
            speechService.stopListening();
        } else {
            try {
                speechService.startListening();
                this.state.isListening = true;
                notificationService.info('請開始說話...');
            } catch (err) {
                notificationService.error(err.message);
            }
        }
    }

    speak() {
        speechService.speak(this.state.ttsText);
    }

    render() {
        return html`
            <style>
                .lab-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; }
                .lab-card { border: 1px solid #ddd; padding: 1.5rem; border-radius: 12px; background: var(--bg-color); }
                textarea { width: 100%; padding: 0.5rem; border-radius: 8px; border: 1px solid #ccc; margin-bottom: 1rem; }
                .mic-btn { 
                    width: 60px; height: 60px; border-radius: 50%; border: none; 
                    background: var(--primary-color); color: white; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 1.5rem; transition: transform 0.2s, background 0.2s;
                }
                .mic-btn.active { background: #dc3545; animation: pulse 1.5s infinite; }
                @keyframes pulse {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.4); }
                    70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(220, 53, 69, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); }
                }
            </style>

            <h1>🧪 Vanilla 實驗室 (Lab)</h1>
            <p>探索最前沿的原生 Web 技術與實驗性功能。</p>

            <div class="lab-grid">
                <!-- 文字轉語音 -->
                <div class="lab-card">
                    <h3>🗣️ 文字轉語音 (TTS)</h3>
                    <p><small>利用 <code>SpeechSynthesis</code> API 讓網頁開口說話。</small></p>
                    <textarea rows="4" oninput="this.closest('page-lab').state.ttsText = this.value">${this.state.ttsText}</textarea>
                    <button class="btn btn-primary" onclick="this.closest('page-lab').speak()">播放語音</button>
                </div>

                <!-- 語音轉文字 -->
                <div class="lab-card" style="text-align: center;">
                    <h3>🎙️ 語音辨識 (STT)</h3>
                    <p><small>利用 <code>SpeechRecognition</code> API 實作聲控輸入。</small></p>
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                        <button class="mic-btn ${this.state.isListening ? 'active' : ''}" onclick="this.closest('page-lab').toggleListening()">
                            ${this.state.isListening ? '⏹️' : '🎤'}
                        </button>
                        <div style="min-height: 2.5rem; font-style: italic; color: #666;">
                            ${this.state.transcript || '辨識結果將顯示在此...'}
                        </div>
                    </div>
                </div>
            </div>

            <section style="margin-top: 3rem; padding: 2rem; background: var(--nav-bg); border-radius: 12px;">
                <h3>🎓 教學重點：Web Speech API</h3>
                <ul>
                    <li><strong>零依賴</strong>：無需呼叫雲端語音 API (如 Google Cloud Speech)，完全在瀏覽器端運算。</li>
                    <li><strong>無障礙 (A11y)</strong>：TTS 是建構友善視障者應用的核心技術。</li>
                    <li><strong>非同步交互</strong>：展示了事件驅動的媒體處理流程。</li>
                </ul>
            </section>
        `;
    }
}
customElements.define('page-lab', LabPage);
