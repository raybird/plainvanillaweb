import { BaseService } from './base-service.js';

/**
 * PlaygroundService - 原生代碼執行服務
 * 利用 Blob 與 URL.createObjectURL 實作即時預覽。
 */
export class PlaygroundService extends BaseService {
    /**
     * 建立執行用的本地 URL
     * @param {string} html 
     * @param {string} css 
     * @param {string} js 
     * @returns {string}
     */
    createRunnerUrl(htmlCode, cssCode, jsCode) {
        const source = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>${cssCode}</style>
            </head>
            <body>
                ${htmlCode}
                <script>
                    (function() {
                        try {
                            ${jsCode}
                        } catch (err) {
                            console.error('[Playground Error]', err);
                            const message = document.createElement('p');
                            message.setAttribute('role', 'alert');
                            message.textContent = 'Runtime Error: ' + err.message;
                            document.body.append(message);
                        }
                    })();
                </script>
            </body>
            </html>
        `;

        const blob = new Blob([source], { type: 'text/html' });
        return URL.createObjectURL(blob);
    }

    /**
     * 釋放 URL 資源
     * @param {string} url 
     */
    revokeUrl(url) {
        if (url && url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
        }
    }
}

export const playgroundService = new PlaygroundService();
