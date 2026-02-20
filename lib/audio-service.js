import { BaseService } from './base-service.js';

/**
 * AudioService - 原生 Web Audio 服務
 * 處理音訊內容、振盪器與增益控制。
 */
export class AudioService extends BaseService {
    constructor() {
        super();
        this.ctx = null;
        this.masterGain = null;
        this.activeNodes = new Map(); // 追蹤活躍的音符
    }

    async init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 0.2; // 預設音量
    }

    /**
     * 播放特定頻率
     * @param {number} freq 頻率 (Hz)
     * @param {string} type 波形
     * @param {string} key 識別標記 (用於停止)
     */
    playNote(freq, type = 'sine', key = 'default') {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        this.stopNote(key);

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        this.activeNodes.set(key, { osc, gain });
    }

    stopNote(key = 'default') {
        const node = this.activeNodes.get(key);
        if (node) {
            const { osc, gain } = node;
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
            osc.stop(this.ctx.currentTime + 0.15);
            this.activeNodes.delete(key);
        }
    }

    setVolume(value) {
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
        }
    }

    midiNoteToFreq(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
    }
}

export const audioService = new AudioService();
