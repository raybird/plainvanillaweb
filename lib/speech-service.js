import { BaseService } from './base-service.js';

/**
 * SpeechService - 原生語音服務
 * 封裝 Web Speech API (Synthesis & Recognition)。
 * 展示原生 Web 的多媒體互動能力。
 */
export class SpeechService extends BaseService {
    constructor() {
        super();
        this.synth = window.speechSynthesis;
        this.recognition = null;
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            
            this.recognition.onresult = (event) => {
                const text = event.results[0][0].transcript;
                this.emit('result', { text });
            };
            
            this.recognition.onerror = (event) => {
                this.emit('error', { error: event.error });
            };

            this.recognition.onend = () => {
                this.emit('end');
            };
        }
    }

    /**
     * 文字轉語音 (TTS)
     * @param {string} text 
     * @param {string} lang 
     */
    speak(text, lang = 'zh-TW') {
        if (!this.synth) return;
        
        // 如果正在說話，先停止
        this.synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 1.0;
        
        this.synth.speak(utterance);
    }

    /**
     * 開始語音辨識 (STT)
     * @param {string} lang 
     */
    startListening(lang = 'zh-TW') {
        if (!this.recognition) {
            throw new Error('此瀏覽器不支援語音辨識');
        }
        this.recognition.lang = lang;
        this.recognition.start();
        this.emit('start');
    }

    stopListening() {
        this.recognition?.stop();
    }

    get isRecognitionSupported() {
        return !!this.recognition;
    }
}

export const speechService = new SpeechService();
