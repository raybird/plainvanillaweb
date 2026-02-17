import test from 'node:test';
import assert from 'node:assert';
import { NotificationService } from '../lib/notification-service.js';

test('NotificationService 應能正確添加通知', (t) => {
    const service = new NotificationService();
    service.notify('測試訊息', 'success');
    
    const list = service.list;
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].message, '測試訊息');
    assert.strictEqual(list[0].type, 'success');
});

test('NotificationService 應能手動移除通知', (t) => {
    const service = new NotificationService();
    const id = service.notify('要移除的訊息');
    
    service.remove(id);
    assert.strictEqual(service.list.length, 0);
});

test('NotificationService 應觸發事件', (t) => {
    const service = new NotificationService();
    let eventData = null;
    
    service.addEventListener('add', (e) => {
        eventData = e.detail;
    });
    
    service.notify('事件測試');
    assert.notStrictEqual(eventData, null);
    assert.strictEqual(eventData.notification.message, '事件測試');
});
