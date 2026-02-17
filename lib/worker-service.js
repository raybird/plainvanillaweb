import { BaseService } from './base-service.js';

export class WorkerService extends BaseService {
    constructor(workerPath) {
        super();
        this.worker = new Worker(workerPath);
        this.worker.onmessage = (e) => {
            this.emit('done', e.data);
        };
    }

    run(task, data) {
        this.worker.postMessage({ task, data });
    }
}
// 導出一個運算服務單例
export const computeService = new WorkerService('./workers/compute.worker.js');
