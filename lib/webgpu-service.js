import { BaseService } from './base-service.js';

/**
 * WebGPUService - 次世代圖形與運算服務
 * 封裝 WebGPU API，提供硬體加速的計算與渲染能力。
 */
export class WebGPUService extends BaseService {
    constructor() {
        super();
        this.adapter = null;
        this.device = null;
        this.isSupported = 'gpu' in navigator;
    }

    /**
     * 初始化 WebGPU 設備
     */
    async init() {
        if (!this.isSupported) {
            throw new Error('此瀏覽器不支援 WebGPU');
        }

        try {
            this.adapter = await navigator.gpu.requestAdapter();
            if (!this.adapter) {
                throw new Error('找不到合適的 GPU 適配器');
            }
            this.device = await this.adapter.requestDevice();
            this.emit('initialized', { device: this.device });
            return this.device;
        } catch (err) {
            console.error('[WebGPUService] Init Error:', err);
            throw err;
        }
    }

    /**
     * 執行簡單的 Compute Shader 範例 (將數組中的每個數字乘以 2)
     * @param {Float32Array} inputData 
     */
    async computeDouble(inputData) {
        if (!this.device) await this.init();

        const device = this.device;

        // 1. 定義 Shader 代碼 (WGSL)
        const shaderModule = device.createShaderModule({
            code: `
                @group(0) @binding(0) var<storage, read_write> data: array<f32>;

                @compute @workgroup_size(64)
                fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                    let index = global_id.x;
                    if (index >= arrayLength(&data)) { return; }
                    data[index] = data[index] * 2.0;
                }
            `
        });

        // 2. 建立 GPU 緩衝區
        const gpuBuffer = device.createBuffer({
            size: inputData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Float32Array(gpuBuffer.getMappedRange()).set(inputData);
        gpuBuffer.unmap();

        // 3. 建立管線
        const computePipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: shaderModule, entryPoint: 'main' }
        });

        // 4. 建立 Bind Group
        const bindGroup = device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: gpuBuffer } }]
        });

        // 5. 編碼指令並執行
        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(computePipeline);
        passEncoder.setBindGroup(0, bindGroup);
        const workgroupCount = Math.ceil(inputData.length / 64);
        passEncoder.dispatchWorkgroups(workgroupCount);
        passEncoder.end();

        // 6. 讀取結果
        const readBuffer = device.createBuffer({
            size: inputData.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
        commandEncoder.copyBufferToBuffer(gpuBuffer, 0, readBuffer, 0, inputData.byteLength);
        device.queue.submit([commandEncoder.finish()]);

        await readBuffer.mapAsync(GPUMapMode.READ);
        const result = new Float32Array(readBuffer.getMappedRange().slice());
        readBuffer.unmap();

        return result;
    }
}

export const webgpuService = new WebGPUService();
