import { BaseService } from './base-service.js';

/**
 * MIDIService - 原生 Web MIDI 服務
 * 處理 MIDI 設備連線與訊息解析。
 */
export class MIDIService extends BaseService {
    constructor() {
        super();
        this.midiAccess = null;
        this.inputs = new Map();
        this.outputs = new Map();
        this.isSupported = !!navigator.requestMIDIAccess;
    }

    async init() {
        if (!this.isSupported) {
            throw new Error('此瀏覽器不支援 Web MIDI API');
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess();
            this._updateDevices();
            
            this.midiAccess.onstatechange = (e) => {
                this._updateDevices();
                this.emit('state-change', e);
            };

            return this.midiAccess;
        } catch (err) {
            throw new Error('無法存取 MIDI 設備: ' + err.message);
        }
    }

    _updateDevices() {
        this.inputs.clear();
        this.outputs.clear();
        
        for (const input of this.midiAccess.inputs.values()) {
            this.inputs.set(input.id, input);
            input.onmidimessage = (msg) => this._handleMIDIMessage(msg, input);
        }

        for (const output of this.midiAccess.outputs.values()) {
            this.outputs.set(output.id, output);
        }
        
        this.emit('devices-updated', { 
            inputs: Array.from(this.inputs.values()), 
            outputs: Array.from(this.outputs.values()) 
        });
    }

    _handleMIDIMessage(event, input) {
        const [status, data1, data2] = event.data;
        const type = status & 0xf0;
        const channel = (status & 0x0f) + 1;

        // 解析常見訊息
        let command = 'Unknown';
        if (type === 0x90 && data2 > 0) command = 'Note On';
        else if (type === 0x80 || (type === 0x90 && data2 === 0)) command = 'Note Off';
        else if (type === 0xB0) command = 'Control Change';
        else if (type === 0xE0) command = 'Pitch Bend';

        this.emit('message', {
            deviceId: input.name,
            command,
            channel,
            note: data1,
            velocity: data2,
            rawData: event.data
        });
    }

    getDevices() {
        return {
            inputs: Array.from(this.inputs.values()),
            outputs: Array.from(this.outputs.values())
        };
    }
}

export const midiService = new MIDIService();
