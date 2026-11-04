/**
 * morph - 以新 HTML 就地更新既有 DOM（ADR 0100）
 *
 * 規則：
 *   - 一般元素：同位置（或同 id）、同標籤時保留節點，只同步屬性並遞迴比對子節點
 *   - 自訂元素（標籤含 "-"）：一律以新節點取代，維持子元件的建立／銷毀生命週期
 *   - 表單控制項：value / checked / selected 以新 HTML 為準，值相同時不寫入
 *   - data-persistent 節點遇到同 id 的 data-persistent-placeholder，或同 id 的 data-persistent 元素時原樣保留
 *   - Lucide 產生的 <svg> 與其來源 <i data-lucide> HTML 相同時原樣保留
 */

/** Lucide 產生的 svg 會記錄來源 <i data-lucide> 的 outerHTML 於此屬性 */
export const ICON_SOURCE = Symbol('lucideIconSource');

/**
 * 讓 container 的子節點與 html 一致
 * @param {Element|ShadowRoot} container
 * @param {string} html
 */
export function morph(container, html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    morphChildren(container, template.content);
}

function morphChildren(from, to) {
    const oldNodes = [...from.childNodes];
    const newNodes = [...to.childNodes];

    // 依 id 配對：新舊都有同 id 的元素時優先配對（順序改變時搬移而非重建）
    const newIds = new Set(newNodes.filter(isElement).map((n) => n.id).filter(Boolean));
    const oldById = new Map();
    for (const node of oldNodes) {
        if (isElement(node) && node.id && newIds.has(node.id)) oldById.set(node.id, node);
    }

    // 第一輪：決定每個新節點對應哪個舊節點（沒有對應時使用新節點本身）
    const used = new Set();
    const placed = [];
    let cursor = 0;

    for (const neu of newNodes) {
        let match = null;
        if (isElement(neu) && neu.id && oldById.has(neu.id)) {
            match = oldById.get(neu.id);
        } else {
            // 依位置配對：從目前位置往後找第一個可保留的舊節點（跳過已使用、保留給 id 配對，
            // 或無法保留的節點，例如一律重建的自訂元素）。被跳過的舊節點若之後沒被配對，最後會移除。
            for (let i = cursor; i < oldNodes.length; i++) {
                const old = oldNodes[i];
                if (used.has(old) || isReservedById(old, oldById)) continue;
                if (canKeep(old, neu)) {
                    match = old;
                    cursor = i + 1;
                    break;
                }
            }
        }

        if (match && canKeep(match, neu)) {
            used.add(match);
            updateNode(match, neu);
            placed.push(match);
        } else {
            placed.push(neu);
        }
    }

    // 第二輪：依序擺放。略過即將移除的舊節點，已在正確位置的保留節點不搬動——
    // 搬動會讓整棵子樹斷開再接上，裡面的自訂元素都會重跑 disconnected／connectedCallback
    const oldSet = new Set(oldNodes);
    let ref = from.firstChild;
    const skipRemoved = () => {
        while (ref && !used.has(ref) && oldSet.has(ref)) ref = ref.nextSibling;
    };
    for (const node of placed) {
        skipRemoved();
        if (node === ref) {
            ref = ref.nextSibling;
        } else {
            from.insertBefore(node, ref);
        }
    }

    // 沒有被配對的舊節點全部移除
    for (const node of oldNodes) {
        if (!used.has(node) && node.parentNode === from) from.removeChild(node);
    }
}

function isElement(node) {
    return node.nodeType === Node.ELEMENT_NODE;
}

function isReservedById(node, oldById) {
    return isElement(node) && node.id && oldById.get(node.id) === node;
}

/** 舊節點能否保留並以新節點的內容更新 */
function canKeep(old, neu) {
    if (old.nodeType !== neu.nodeType) return false;
    if (!isElement(old)) return old.nodeType === Node.TEXT_NODE || old.nodeType === Node.COMMENT_NODE;

    // data-persistent 節點對應同 id 的佔位符，或 render() 每次都輸出的同 id 元素本身（例如 <x-switch data-persistent="routes">）
    const persistentId = old.getAttribute('data-persistent');
    if (persistentId !== null) {
        return neu.getAttribute('data-persistent-placeholder') === persistentId
            || neu.getAttribute('data-persistent') === persistentId;
    }

    // Lucide 產生的 svg 對應同樣的 <i data-lucide>
    if (old[ICON_SOURCE] !== undefined) return old[ICON_SOURCE] === neu.outerHTML;

    if (old.localName !== neu.localName) return false;
    // 自訂元素一律重建，維持子元件的生命週期
    if (old.localName.includes('-')) return false;
    return true;
}

function updateNode(old, neu) {
    if (!isElement(old)) {
        if (old.nodeValue !== neu.nodeValue) old.nodeValue = neu.nodeValue;
        return;
    }
    // data-persistent 節點與 Lucide svg 原樣保留
    if (old.hasAttribute('data-persistent') || old[ICON_SOURCE] !== undefined) return;

    syncAttributes(old, neu);

    if (old.localName === 'template') {
        if (old.innerHTML !== neu.innerHTML) old.innerHTML = neu.innerHTML;
        return;
    }

    morphChildren(old, neu);
    syncFormState(old, neu);
}

function syncAttributes(old, neu) {
    for (const { name } of [...old.attributes]) {
        if (!neu.hasAttribute(name)) old.removeAttribute(name);
    }
    for (const { name, value } of [...neu.attributes]) {
        if (old.getAttribute(name) !== value) old.setAttribute(name, value);
    }
}

/** 表單控制項的「目前值」不隨屬性變動，需另外同步成新 HTML 重建後會有的值 */
function syncFormState(old, neu) {
    switch (old.localName) {
        case 'input':
            if (old.type === 'checkbox' || old.type === 'radio') {
                if (old.checked !== neu.defaultChecked) old.checked = neu.defaultChecked;
            } else if (old.type !== 'file' && old.value !== neu.defaultValue) {
                old.value = neu.defaultValue;
            }
            break;
        case 'textarea':
            if (old.value !== neu.defaultValue) old.value = neu.defaultValue;
            break;
        case 'option':
            if (old.selected !== neu.defaultSelected) old.selected = neu.defaultSelected;
            break;
    }
}
