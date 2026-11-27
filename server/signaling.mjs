#!/usr/bin/env node
/**
 * POS v2 信令參考伺服器（#16，ADR 0109；協定見 docs/superpowers/plans/2026-11-26-pos-v2-protocol.md 第 3 節）。
 *
 * 單一檔案、零依賴（只用 Node 內建模組，需要 Node 22+），下載這一個檔案就能執行：
 *
 *   node signaling.mjs                 在 http://127.0.0.1:8787 啟動
 *   node signaling.mjs --tunnel        另外啟動 Cloudflare Quick Tunnel（要先安裝 cloudflared），印出主機頁連結
 *
 * 選項（也可用環境變數）：
 *   --port <n>              SIGNALING_PORT，預設 8787
 *   --host <addr>           SIGNALING_HOST，預設 127.0.0.1
 *   --allow-origin <o>      SIGNALING_ALLOWED_ORIGINS（逗號分隔），可重複；預設 GitHub Pages 與 localhost
 *   --ice-servers <json>    SIGNALING_ICE_SERVERS，交給主機與裝置的 RTCIceServer 清單；預設公共 STUN
 *   --app-url <url>         SIGNALING_APP_URL，主機頁所在的網站，預設 https://raybird.github.io/plainvanillaweb/
 *
 * 伺服器只轉送握手訊息，不保存訂單；房間的主機席位由第一個以 hostSecret 連上的主機綁定（存在記憶體，重啟後清空）。
 */
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 8787;
export const DEFAULT_APP_URL = 'https://raybird.github.io/plainvanillaweb/';
export const DEFAULT_ALLOWED_ORIGINS = Object.freeze(['https://raybird.github.io', 'http://localhost:*', 'http://127.0.0.1:*']);
export const DEFAULT_ICE_SERVERS = Object.freeze([{ urls: 'stun:stun.l.google.com:19302' }]);

/** 協定規格 3.1 的上限 */
export const LIMITS = Object.freeze({
    MAX_MESSAGE_BYTES: 16 * 1024,
    RATE_WINDOW_MS: 10_000,
    RATE_MAX_MESSAGES: 50,
    MAX_PEERS: 64,
    KEEPALIVE_MS: 30_000,
    HOST_AUTH_TIMEOUT_MS: 10_000,
    BINDING_TTL_MS: 24 * 60 * 60 * 1000,
});

/** 自訂 close code */
export const CLOSE = Object.freeze({
    HOST_REJECTED: 4001,
    HOST_REPLACED: 4002,
    RATE_LIMITED: 4008,
    ROOM_FULL: 4009,
});

const ROOM_ID = /^[A-Za-z0-9_-]{22}$/;
const HOST_SECRET = /^[A-Za-z0-9_-]{22,128}$/;
/** 主機頁每次載入產生的執行個體 id（選填）：peer 據此判斷主機是否換了一個，只有換了才重建直連 */
const HOST_INSTANCE = /^[A-Za-z0-9_-]{8,64}$/;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ---------- 純函式（單元測試直接匯入） ----------

/**
 * 已驗證主機的速率額度：每台裝置握手時主機要送 answer 與數個 candidate，固定額度在裝置一多、
 * 同時重連（例如主機重新整理）時會被 4008 關掉，接著又重連、又觸發所有裝置重連。
 * @param {number} peers
 */
export const hostRateLimit = (peers) => LIMITS.RATE_MAX_MESSAGES * (1 + peers);

/**
 * Origin 是否在白名單內；`http://localhost:*` 這種結尾 `:*` 的項目允許任何連接埠。
 * @param {string | undefined} origin
 * @param {readonly string[]} allowed
 */
export function isOriginAllowed(origin, allowed) {
    if (typeof origin !== 'string' || !origin) return false;
    return allowed.some((pattern) => {
        if (pattern === origin) return true;
        if (!pattern.endsWith(':*')) return false;
        const prefix = pattern.slice(0, -2);
        return origin.startsWith(`${prefix}:`) && /^\d+$/.test(origin.slice(prefix.length + 1));
    });
}

/**
 * 從 cloudflared 的輸出中找出 Quick Tunnel 網址。
 * @param {string} text
 * @returns {string | null}
 */
export function extractTunnelUrl(text) {
    const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(String(text));
    return match ? match[0].toLowerCase() : null;
}

/**
 * 主機頁連結：信令位址以 `sig` 參數帶入（主機頁會先請使用者確認才儲存）。
 * @param {string} appUrl 網站根網址
 * @param {string} httpsUrl 信令的 https 網址
 */
export function hostPageLink(appUrl, httpsUrl) {
    const sig = httpsUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:').replace(/\/+$/, '');
    const base = appUrl.endsWith('/') ? appUrl : `${appUrl}/`;
    return `${base}#/solutions/pos-v2/admin?sig=${encodeURIComponent(sig)}`;
}

/**
 * 這個請求從外面看到的信令網址：經過 Cloudflare Tunnel 等反向代理時，請求本身是 http，
 * 但使用者連的是 https（審查 S6）。代理帶了 X-Forwarded-Proto 就照它；否則 localhost 與 IP 位址（直連這個程式）用 http，網域名稱用 https。
 * @param {import('node:http').IncomingMessage} req
 */
export function publicOrigin(req) {
    const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost').split(',')[0].trim();
    const forwarded = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim().toLowerCase();
    const local = /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])(:\d+)?$/i.test(host);
    const proto = forwarded === 'http' || forwarded === 'https' ? forwarded : local ? 'http' : 'https';
    return `${proto}://${host}`;
}

/** @param {string} secret */
export function hashHostSecret(secret) {
    return createHash('sha256').update(secret).digest('base64url');
}

/**
 * 解析 WebSocket 訊框（RFC 6455）。用戶端訊框必須有遮罩。
 * @param {Buffer} buffer
 * @param {number} maxPayload
 * @returns {{ frame: { fin: boolean, opcode: number, payload: Buffer } | null, rest: Buffer, error?: number }}
 *   資料不足時 frame 為 null；error 為應使用的 close code
 */
export function parseFrame(buffer, maxPayload) {
    if (buffer.length < 2) return { frame: null, rest: buffer };
    const fin = (buffer[0] & 0x80) !== 0;
    const opcode = buffer[0] & 0x0f;
    const masked = (buffer[1] & 0x80) !== 0;
    let length = buffer[1] & 0x7f;
    let offset = 2;
    if (length === 126) {
        if (buffer.length < 4) return { frame: null, rest: buffer };
        length = buffer.readUInt16BE(2);
        offset = 4;
    } else if (length === 127) {
        if (buffer.length < 10) return { frame: null, rest: buffer };
        const big = buffer.readBigUInt64BE(2);
        if (big > BigInt(maxPayload)) return { frame: null, rest: buffer, error: 1009 };
        length = Number(big);
        offset = 10;
    }
    if (!masked) return { frame: null, rest: buffer, error: 1002 };
    if (length > maxPayload) return { frame: null, rest: buffer, error: 1009 };
    if (buffer.length < offset + 4 + length) return { frame: null, rest: buffer };
    const mask = buffer.subarray(offset, offset + 4);
    const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    return { frame: { fin, opcode, payload }, rest: buffer.subarray(offset + 4 + length) };
}

/**
 * 組伺服器端訊框（不加遮罩）。
 * @param {number} opcode
 * @param {Buffer} payload
 */
export function buildFrame(opcode, payload) {
    const length = payload.length;
    let header;
    if (length < 126) {
        header = Buffer.from([0x80 | opcode, length]);
    } else if (length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 126;
        header.writeUInt16BE(length, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(length), 2);
    }
    return Buffer.concat([header, payload]);
}

// ---------- 連線 ----------

class Connection {
    /**
     * @param {import('node:net').Socket} socket
     * @param {{ onMessage: (conn: Connection, text: string) => void, onClose: (conn: Connection) => void }} handlers
     */
    constructor(socket, { onMessage, onClose }) {
        this.socket = socket;
        this.closed = false;
        this.lastSeenAt = Date.now();
        this.recent = [];
        this._buffer = Buffer.alloc(0);
        this._onMessage = onMessage;
        this._onClose = onClose;
        socket.setNoDelay(true);
        socket.on('data', (chunk) => this._receive(chunk));
        socket.on('close', () => this._finish());
        socket.on('error', () => this._finish());
    }

    _receive(chunk) {
        this.lastSeenAt = Date.now();
        this._buffer = Buffer.concat([this._buffer, chunk]);
        while (!this.closed) {
            const { frame, rest, error } = parseFrame(this._buffer, LIMITS.MAX_MESSAGE_BYTES);
            if (error) return this.close(error, error === 1009 ? 'message too large' : 'protocol error');
            if (!frame) return;
            this._buffer = rest;
            if (!frame.fin || frame.opcode === 0x0) return this.close(1003, 'fragmented frames are not supported');
            switch (frame.opcode) {
                case 0x1:
                    this._onMessage(this, frame.payload.toString('utf8'));
                    break;
                case 0x8:
                    return this.close(frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 1000, '');
                case 0x9:
                    this._write(buildFrame(0xa, frame.payload));
                    break;
                case 0xa:
                    break;
                default:
                    return this.close(1003, 'only text frames are supported');
            }
        }
    }

    _write(data) {
        if (!this.closed && this.socket.writable) this.socket.write(data);
    }

    /** @param {object} message */
    send(message) {
        this._write(buildFrame(0x1, Buffer.from(JSON.stringify(message))));
    }

    ping() {
        this._write(buildFrame(0x9, Buffer.alloc(0)));
    }

    close(code = 1000, reason = '') {
        if (this.closed) return;
        const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
        payload.writeUInt16BE(code, 0);
        payload.write(reason, 2);
        this._write(buildFrame(0x8, payload));
        this.socket.end();
        setTimeout(() => this.socket.destroy(), 1000).unref();
        this._finish();
    }

    /** socket 關閉、出錯或主動 close() 時呼叫；只通知一次 */
    _finish() {
        this.closed = true;
        if (this._finished) return;
        this._finished = true;
        this._onClose(this);
    }
}

// ---------- 伺服器 ----------

/**
 * 建立信令伺服器（不自動 listen）。
 * @param {{ allowedOrigins?: readonly string[], iceServers?: readonly object[], appUrl?: string, bindingTtlMs?: number, now?: () => number }} [options]
 */
export function createSignalingServer({
    allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
    iceServers = DEFAULT_ICE_SERVERS,
    appUrl = DEFAULT_APP_URL,
    bindingTtlMs = LIMITS.BINDING_TTL_MS,
    now = () => Date.now(),
} = {}) {
    /** @type {Map<string, { binding: string | null, host: Connection | null, peers: Map<string, Connection>, lastHostAt: number }>} */
    const rooms = new Map();
    const connections = new Set();

    const room = (roomId) => {
        let entry = rooms.get(roomId);
        if (!entry) {
            entry = { binding: null, host: null, peers: new Map(), lastHostAt: now() };
            rooms.set(roomId, entry);
        }
        return entry;
    };

    /** 綁定逾時：房間連續 bindingTtlMs 沒有主機連線就清除綁定；空房間直接移除 */
    const sweep = () => {
        for (const [roomId, entry] of rooms) {
            if (entry.host) continue;
            if (now() - entry.lastHostAt > bindingTtlMs) entry.binding = null;
            if (!entry.binding && entry.peers.size === 0) rooms.delete(roomId);
        }
    };

    /** limit：已驗證的主機要回應每一台裝置的握手，額度依 peer 數放大 */
    const allowMessage = (conn, limit = LIMITS.RATE_MAX_MESSAGES) => {
        const at = now();
        conn.recent = conn.recent.filter((t) => at - t < LIMITS.RATE_WINDOW_MS);
        conn.recent.push(at);
        if (conn.recent.length > limit) {
            conn.close(CLOSE.RATE_LIMITED, 'rate limited');
            return false;
        }
        return true;
    };

    const parse = (conn, text) => {
        let message;
        try {
            message = JSON.parse(text, (key, value) => (key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : value));
        } catch {
            message = null;
        }
        if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.t !== 'string') {
            conn.send({ t: 'error', code: 'BAD_MESSAGE' });
            return null;
        }
        if (message.t === 'ping') {
            conn.send({ t: 'pong' });
            return null;
        }
        return message;
    };

    const onHostMessage = (roomId, conn, text) => {
        const entry = room(roomId);
        if (!allowMessage(conn, conn.authenticated ? hostRateLimit(entry.peers.size) : LIMITS.RATE_MAX_MESSAGES)) return;
        const message = parse(conn, text);
        if (!message) return;
        if (!conn.authenticated) {
            if (message.t !== 'host-auth' || typeof message.secret !== 'string' || !HOST_SECRET.test(message.secret)) {
                conn.close(CLOSE.HOST_REJECTED, 'host-auth required');
                return;
            }
            const hash = hashHostSecret(message.secret);
            if (entry.binding && entry.binding !== hash) {
                conn.close(CLOSE.HOST_REJECTED, 'room is bound to another host');
                return;
            }
            entry.binding = hash;
            const previous = entry.host;
            entry.host = conn;
            entry.hostInstance = typeof message.instance === 'string' && HOST_INSTANCE.test(message.instance) ? message.instance : null;
            entry.lastHostAt = now();
            conn.authenticated = true;
            clearTimeout(conn.authTimer);
            if (previous && !previous.closed) {
                previous.send({ t: 'host-replaced' });
                previous.close(CLOSE.HOST_REPLACED, 'replaced by a newer host connection');
            }
            conn.send({ t: 'host-ready', peers: [...entry.peers.keys()] });
            conn.send({ t: 'config', iceServers });
            for (const peer of entry.peers.values()) peer.send({ t: 'host-online', instance: entry.hostInstance });
            return;
        }
        if (message.t !== 'signal' || typeof message.to !== 'string' || message.data === undefined) {
            conn.send({ t: 'error', code: 'BAD_MESSAGE' });
            return;
        }
        const peer = entry.peers.get(message.to);
        if (!peer) {
            conn.send({ t: 'error', code: 'PEER_NOT_FOUND', peerId: message.to });
            return;
        }
        peer.send({ t: 'signal', from: 'host', data: message.data });
    };

    const onPeerMessage = (roomId, conn, text) => {
        if (!allowMessage(conn)) return;
        const message = parse(conn, text);
        if (!message) return;
        const entry = room(roomId);
        if (message.t !== 'signal' || message.data === undefined) {
            conn.send({ t: 'error', code: 'BAD_MESSAGE' });
            return;
        }
        if (!entry.host) {
            conn.send({ t: 'error', code: 'HOST_OFFLINE' });
            return;
        }
        // from 一律由伺服器填入，用戶端送來的 from／to 都不採用
        entry.host.send({ t: 'signal', from: conn.peerId, data: message.data });
    };

    const onClose = (roomId, conn) => {
        connections.delete(conn);
        clearTimeout(conn.authTimer);
        const entry = rooms.get(roomId);
        if (!entry) return;
        if (conn.role === 'host') {
            if (entry.host !== conn) return; // 已被新的主機連線取代
            entry.host = null;
            entry.lastHostAt = now();
            for (const peer of entry.peers.values()) peer.send({ t: 'host-offline' });
        } else if (entry.peers.get(conn.peerId) === conn) {
            entry.peers.delete(conn.peerId);
            entry.host?.send({ t: 'peer-left', peerId: conn.peerId });
        }
    };

    const reject = (socket, status, message) => {
        socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${message}\n`);
    };

    const server = http.createServer((req, res) => {
        const { pathname } = new URL(req.url, 'http://localhost');
        if (pathname === '/healthz') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, rooms: rooms.size }));
            return;
        }
        if (pathname === '/') {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`POS v2 信令伺服器（協定 v${PROTOCOL_VERSION}）運作中。\n主機頁：${hostPageLink(appUrl, publicOrigin(req))}\n`);
            return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('not found\n');
    });

    server.on('upgrade', (req, socket) => {
        socket.on('error', () => socket.destroy());
        const url = new URL(req.url, 'http://localhost');
        const match = /^\/v1\/rooms\/([^/]+)$/.exec(url.pathname);
        const role = url.searchParams.get('role');
        if (!isOriginAllowed(req.headers.origin, allowedOrigins)) return reject(socket, 403, 'Forbidden');
        if (!match || !ROOM_ID.test(match[1]) || (role !== 'host' && role !== 'peer')) return reject(socket, 400, 'Bad Request');
        const key = req.headers['sec-websocket-key'];
        if (req.headers.upgrade?.toLowerCase() !== 'websocket' || typeof key !== 'string') return reject(socket, 400, 'Bad Request');

        const accept = createHash('sha1').update(key + WS_GUID).digest('base64');
        socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));

        const roomId = match[1];
        const entry = room(roomId);
        const conn = new Connection(socket, {
            onMessage: (c, text) => (role === 'host' ? onHostMessage(roomId, c, text) : onPeerMessage(roomId, c, text)),
            onClose: (c) => onClose(roomId, c),
        });
        conn.role = role;
        connections.add(conn);
        if (role === 'host') {
            conn.authTimer = setTimeout(() => conn.close(CLOSE.HOST_REJECTED, 'host-auth timeout'), LIMITS.HOST_AUTH_TIMEOUT_MS);
            conn.authTimer.unref();
            return;
        }
        if (entry.peers.size >= LIMITS.MAX_PEERS) {
            conn.close(CLOSE.ROOM_FULL, 'room is full');
            return;
        }
        conn.peerId = randomBytes(16).toString('base64url');
        entry.peers.set(conn.peerId, conn);
        conn.send({ t: 'welcome', peerId: conn.peerId, hostOnline: Boolean(entry.host), hostInstance: entry.host ? entry.hostInstance : null, iceServers });
        entry.host?.send({ t: 'peer-joined', peerId: conn.peerId });
    });

    const keepalive = setInterval(() => {
        const at = Date.now();
        for (const conn of connections) {
            if (at - conn.lastSeenAt > LIMITS.KEEPALIVE_MS * 2) conn.close(1001, 'keepalive timeout');
            else conn.ping();
        }
        sweep();
    }, LIMITS.KEEPALIVE_MS);
    keepalive.unref();

    return {
        server,
        rooms,
        sweep,
        /** @param {number} [port] @param {string} [host] */
        listen(port = DEFAULT_PORT, host = '127.0.0.1') {
            return new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, host, () => {
                    server.off('error', reject);
                    resolve(server.address());
                });
            });
        },
        close() {
            clearInterval(keepalive);
            for (const conn of connections) conn.close(1001, 'server shutting down');
            return new Promise((resolve) => server.close(() => resolve()));
        },
    };
}

// ---------- 命令列 ----------

/**
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} env
 */
export function parseOptions(argv, env = {}) {
    const options = {
        port: Number(env.SIGNALING_PORT ?? DEFAULT_PORT),
        host: env.SIGNALING_HOST ?? '127.0.0.1',
        allowedOrigins: env.SIGNALING_ALLOWED_ORIGINS ? env.SIGNALING_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) : null,
        iceServers: env.SIGNALING_ICE_SERVERS ? JSON.parse(env.SIGNALING_ICE_SERVERS) : DEFAULT_ICE_SERVERS,
        appUrl: env.SIGNALING_APP_URL ?? DEFAULT_APP_URL,
        tunnel: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = () => {
            const next = argv[++i];
            if (next === undefined) throw new Error(`${arg} 需要一個值`);
            return next;
        };
        if (arg === '--tunnel') options.tunnel = true;
        else if (arg === '--port') options.port = Number(value());
        else if (arg === '--host') options.host = value();
        else if (arg === '--allow-origin') options.allowedOrigins = [...(options.allowedOrigins ?? []), value()];
        else if (arg === '--ice-servers') options.iceServers = JSON.parse(value());
        else if (arg === '--app-url') options.appUrl = value();
        else throw new Error(`不認得的選項：${arg}`);
    }
    if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error(`連接埠不正確：${options.port}`);
    if (!Array.isArray(options.iceServers)) throw new Error('ice-servers 必須是 JSON 陣列');
    options.allowedOrigins ??= [...DEFAULT_ALLOWED_ORIGINS];
    return options;
}

function startTunnel(port, appUrl) {
    const manual = () => {
        console.log('\n請另開終端機執行：');
        console.log(`  cloudflared tunnel --url http://localhost:${port}`);
        console.log('再把它印出的 https://….trycloudflare.com 網址貼到主機頁的「信令網址」。');
    };
    let child;
    try {
        child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
        manual();
        return null;
    }
    let found = false;
    let output = '';
    const scan = (chunk) => {
        if (found) return;
        output = (output + chunk).slice(-8192);
        const url = extractTunnelUrl(output);
        if (!url) return;
        found = true;
        console.log(`\nQuick Tunnel：${url}`);
        console.log(`信令網址：${url.replace(/^https:/, 'wss:')}`);
        console.log(`\n開啟主機頁（會先請你確認信令網址）：\n  ${hostPageLink(appUrl, url)}\n`);
    };
    child.stdout.on('data', scan);
    child.stderr.on('data', scan);
    child.on('error', () => {
        console.log('\n找不到 cloudflared（安裝說明：https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/）。');
        manual();
    });
    child.on('exit', (code) => {
        if (!found) {
            console.log(`\ncloudflared 結束（${code}），沒有取得 Quick Tunnel 網址。`);
            manual();
        }
    });
    setTimeout(() => {
        if (!found && child.exitCode === null) {
            console.log('\n30 秒內沒有從 cloudflared 的輸出找到 Quick Tunnel 網址。');
            manual();
            found = true;
        }
    }, 30_000).unref();
    return child;
}

/**
 * 啟動時 listen 失敗的說明：連接埠被佔用或沒有權限時，告訴使用者怎麼換一個連接埠。
 * @param {NodeJS.ErrnoException} err
 * @param {number} port
 * @returns {string}
 */
export function listenErrorMessage(err, port) {
    const next = port === 65535 ? 8788 : port + 1;
    const hint = `改用其他連接埠，例如：node signaling.mjs --tunnel --port ${next}（或設定環境變數 SIGNALING_PORT=${next}）。使用 --tunnel 時 Quick Tunnel 會跟著用這個連接埠，其他步驟不變。`;
    if (err?.code === 'EADDRINUSE') return `連接埠 ${port} 已被其他程式使用。${hint}`;
    if (err?.code === 'EACCES') return `沒有權限使用連接埠 ${port}。${hint}`;
    return `無法在連接埠 ${port} 啟動：${err?.message ?? err}`;
}

async function main() {
    let options;
    try {
        options = parseOptions(process.argv.slice(2), process.env);
    } catch (err) {
        console.error(err.message);
        process.exit(2);
    }
    const signaling = createSignalingServer(options);
    let address;
    try {
        address = await signaling.listen(options.port, options.host);
    } catch (err) {
        console.error(listenErrorMessage(err, options.port));
        process.exit(1);
    }
    console.log(`POS v2 信令伺服器：http://${address.address}:${address.port}（協定 v${PROTOCOL_VERSION}）`);
    console.log(`允許的 Origin：${options.allowedOrigins.join(', ')}`);
    const tunnel = options.tunnel ? startTunnel(address.port, options.appUrl) : null;
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, () => {
            tunnel?.kill();
            signaling.close().finally(() => process.exit(0));
        });
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
