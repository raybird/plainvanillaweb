import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { speechService } from '../../../lib/speech-service.js';
import { notificationService } from '../../../lib/notification-service.js';

export class SpeechPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            isListening: false,
            transcript: '',
            ttsText: '歡迎來到原生語音實驗室。'
        });
    }

    connectedCallback() {
        super.connectedCallback();
        this._onSpeechResult = (data) => {
            this.state.transcript = data.text;
            notificationService.success(`辨識結果: ${data.text}`);
        };
        speechService.on('result', this._onSpeechResult);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        speechService.off('result', this._onSpeechResult);
        if (this.state.isListening) speechService.stopListening();
    }

    speak() {
        if (!this.state.ttsText) return;
        speechService.speak(this.state.ttsText);
    }

    toggleSpeechRecognition() {
        if (this.state.isListening) {
            speechService.stopListening();
            this.state.isListening = false;
        } else {
            try {
                speechService.startListening();
                this.state.isListening = true;
                notificationService.info('正在傾聽...');
            } catch (err) {
                notificationService.error(err.message);
            }
        }
    }

    render() {
        return html`
            <div class="lab-card">
                <h3>🗣️ 原生語音 (Speech API)</h3>
                <p><small>文字轉語音 (TTS) 與 語音辨識 (STT)。</small></p>
                <textarea placeholder="輸入要發音的文字..." 
                          oninput="this.closest('page-lab-speech').state.ttsText = this.value">${this.state.ttsText}</textarea>
                <div class="btn-group">
                    <button class="btn btn-primary" onclick="this.closest('page-lab-speech').speak()">🔊 朗讀文字</button>
                    <button class="btn ${this.state.isListening ? 'btn-danger' : 'btn-secondary'}" 
                            ?disabled="${!speechService.isRecognitionSupported}"
                            onclick="this.closest('page-lab-speech').toggleSpeechRecognition()">
                        ${this.state.isListening ? '⏹️ 停止辨識' : '🎤 開始辨識'}
                    </button>
                </div>
                ${!speechService.isRecognitionSupported ? html`<p style="color:red; font-size:0.7rem; margin-top:0.5rem;">⚠️ 您的瀏覽器不支援語音辨識 (建議使用 Chrome/Edge)</p>` : ''}
                ${this.state.transcript ? html`<div style="margin-top:1rem; font-size:0.9rem; border-top:1px solid #eee; padding-top:0.5rem;">辨識結果: <strong>${this.state.transcript}</strong></div>` : ''}
            </div>
            
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}
customElements.define('page-lab-speech', SpeechPage);
