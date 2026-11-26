/**
 * POS v2 信令：Cloudflare Worker＋Durable Object 版（#16，ADR 0109）。
 * 行為與 server/signaling.mjs 相同，協定見 docs/superpowers/plans/2026-11-26-pos-v2-protocol.md 第 3 節。
 *
 * 部署（需要 Cloudflare 帳號；免費方案可用，Durable Object 使用 SQLite 儲存）：
 *   把 worker.js 與 wrangler.jsonc 放在同一個資料夾，然後執行
 *     npx wrangler@4 deploy
 *   印出的 https://pos-v2-signaling.<帳號>.workers.dev 換成 wss:// 就是信令網址。
 *
 * 設定（wrangler.jsonc 的 vars）：
 *   ALLOWED_ORIGINS  允許的 Origin，逗號分隔；結尾 :* 表示任何連接埠
 *   ICE_SERVERS      交給主機與裝置的 RTCIceServer 清單（JSON 陣列）
 *   BINDING_TTL_MS   房間多久沒有主機就清除綁定，預設 24 小時（測試時可調短）
 *   APP_URL          首頁連結指向的網站，預設 https://raybird.github.io/plainvanillaweb/
 *
 * 每個房間一個 Durable Object（以 roomId 命名）。WebSocket 使用 Hibernation API：
 * 沒有訊息時物件可以休眠，ping／pong 由平台自動回應，不計費也不喚醒物件。
 */

const PROTOCOL_VERSION = 1;
const DEFAULT_ALLOWED_ORIGINS = ['https://raybird.github.io', 'http://localhost:*', 'http://127.0.0.1:*'];
const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const DEFAULT_APP_URL = 'https://raybird.github.io/plainvanillaweb/';

const LIMITS = {
    MAX_MESSAGE_BYTES: 16 * 1024,
    RATE_WINDOW_MS: 10_000,
    RATE_MAX_MESSAGES: 50,
    MAX_PEERS: 64,
    HOST_AUTH_TIMEOUT_MS: 10_000,
    BINDING_TTL_MS: 24 * 60 * 60 * 1000,
};

const CLOSE = { HOST_REJECTED: 4001, HOST_REPLACED: 4002, RATE_LIMITED: 4008, ROOM_FULL: 4009 };

const ROOM_ID = /^[A-Za-z0-9_-]{22}$/;
const HOST_SECRET = /^[A-Za-z0-9_-]{22,128}$/;
const encoder = new TextEncoder();

function isOriginAllowed(origin, allowed) {
    if (typeof origin !== 'string' || !origin) return false;
    return allowed.some((pattern) => {
        if (pattern === origin) return true;
        if (!pattern.endsWith(':*')) return false;
        const prefix = pattern.slice(0, -2);
        return origin.startsWith(`${prefix}:`) && /^\d+$/.test(origin.slice(prefix.length + 1));
    });
}

function base64url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashHostSecret(secret) {
    return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(secret))));
}

function allowedOrigins(env) {
    return env.ALLOWED_ORIGINS ? String(env.ALLOWED_ORIGINS).split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_ALLOWED_ORIGINS;
}

function iceServers(env) {
    if (!env.ICE_SERVERS) return DEFAULT_ICE_SERVERS;
    const parsed = typeof env.ICE_SERVERS === 'string' ? JSON.parse(env.ICE_SERVERS) : env.ICE_SERVERS;
    return Array.isArray(parsed) ? parsed : DEFAULT_ICE_SERVERS;
}

/** 主機頁連結：信令位址以 sig 參數帶入（主機頁會先請使用者確認才儲存） */
function hostPageLink(appUrl, httpsUrl) {
    const sig = httpsUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:').replace(/\/+$/, '');
    const base = appUrl.endsWith('/') ? appUrl : `${appUrl}/`;
    return `${base}#/solutions/pos-v2/admin?sig=${encodeURIComponent(sig)}`;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function homePage(origin, env) {
    const sig = origin.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
    const link = hostPageLink(env.APP_URL || DEFAULT_APP_URL, origin);
    return new Response(`<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>POS v2 信令伺服器</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem}code{word-break:break-all}</style></head>
<body><h1>POS v2 信令伺服器</h1>
<p>協定 v${PROTOCOL_VERSION}（Cloudflare Worker）運作中。</p>
<p>信令網址：<code>${escapeHtml(sig)}</code></p>
<p><a href="${escapeHtml(link)}">開啟主機頁</a>（主機頁會先請你確認信令網址）</p>
</body></html>\n`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

const text = (status, body) => new Response(`${body}\n`, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export default {
    /** @param {Request} request */
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/healthz') return Response.json({ ok: true, protocol: PROTOCOL_VERSION });
        if (url.pathname === '/') return homePage(url.origin, env);
        const match = /^\/v1\/rooms\/([^/]+)$/.exec(url.pathname);
        if (!match) return text(404, 'not found');
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return text(426, 'Upgrade Required');
        if (!isOriginAllowed(request.headers.get('Origin'), allowedOrigins(env))) return text(403, 'Forbidden');
        const role = url.searchParams.get('role');
        if (!ROOM_ID.test(match[1]) || (role !== 'host' && role !== 'peer')) return text(400, 'Bad Request');
        const stub = env.ROOMS.get(env.ROOMS.idFromName(match[1]));
        return stub.fetch(request);
    },
};

/** 一個房間：主機席位綁定、peer 清單與訊息轉送 */
export class PosRoom {
    constructor(ctx, env) {
        this.ctx = ctx;
        this.env = env;
        this.iceServers = iceServers(env);
        this.bindingTtlMs = Number(env.BINDING_TTL_MS) || LIMITS.BINDING_TTL_MS;
        /** 每條連線最近的訊息時間；物件休眠後清空，對限速沒有影響（休眠代表一段時間沒有訊息） */
        this.recent = new Map();
        ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
    }

    hosts() {
        return this.ctx.getWebSockets('host').filter((ws) => ws.deserializeAttachment()?.authenticated);
    }

    peers() {
        return this.ctx.getWebSockets('peer');
    }

    /** @param {Request} request */
    async fetch(request) {
        const role = new URL(request.url).searchParams.get('role');
        const { 0: client, 1: server } = new WebSocketPair();
        if (role === 'host') {
            this.ctx.acceptWebSocket(server, ['host']);
            server.serializeAttachment({ role, authenticated: false });
            setTimeout(() => {
                if (!server.deserializeAttachment()?.authenticated) closeSocket(server, CLOSE.HOST_REJECTED, 'host-auth timeout');
            }, LIMITS.HOST_AUTH_TIMEOUT_MS);
            return new Response(null, { status: 101, webSocket: client });
        }
        if (this.peers().length >= LIMITS.MAX_PEERS) {
            this.ctx.acceptWebSocket(server, ['rejected']);
            closeSocket(server, CLOSE.ROOM_FULL, 'room is full');
            return new Response(null, { status: 101, webSocket: client });
        }
        const peerId = base64url(crypto.getRandomValues(new Uint8Array(16)));
        this.ctx.acceptWebSocket(server, ['peer', `peer:${peerId}`]);
        server.serializeAttachment({ role, peerId });
        const hostOnline = this.hosts().length > 0;
        send(server, { t: 'welcome', peerId, hostOnline, iceServers: this.iceServers });
        for (const host of this.hosts()) send(host, { t: 'peer-joined', peerId });
        return new Response(null, { status: 101, webSocket: client });
    }

    /** @param {WebSocket} ws @param {string | ArrayBuffer} raw */
    async webSocketMessage(ws, raw) {
        if (typeof raw !== 'string') return closeSocket(ws, 1003, 'only text frames are supported');
        if (encoder.encode(raw).length > LIMITS.MAX_MESSAGE_BYTES) return closeSocket(ws, 1009, 'message too large');
        if (!this.allowMessage(ws)) return;
        const message = parse(raw);
        if (!message) return send(ws, { t: 'error', code: 'BAD_MESSAGE' });
        if (message.t === 'ping') return send(ws, { t: 'pong' });
        const attachment = ws.deserializeAttachment() ?? {};
        if (attachment.role === 'host') return this.onHostMessage(ws, attachment, message);
        if (attachment.role === 'peer') return this.onPeerMessage(ws, attachment, message);
    }

    allowMessage(ws) {
        const now = Date.now();
        const recent = (this.recent.get(ws) ?? []).filter((t) => now - t < LIMITS.RATE_WINDOW_MS);
        recent.push(now);
        this.recent.set(ws, recent);
        if (recent.length > LIMITS.RATE_MAX_MESSAGES) {
            closeSocket(ws, CLOSE.RATE_LIMITED, 'rate limited');
            return false;
        }
        return true;
    }

    async onHostMessage(ws, attachment, message) {
        if (!attachment.authenticated) {
            if (message.t !== 'host-auth' || typeof message.secret !== 'string' || !HOST_SECRET.test(message.secret)) {
                return closeSocket(ws, CLOSE.HOST_REJECTED, 'host-auth required');
            }
            const hash = await hashHostSecret(message.secret);
            const binding = await this.ctx.storage.get('binding');
            if (binding && binding !== hash) return closeSocket(ws, CLOSE.HOST_REJECTED, 'room is bound to another host');
            if (!binding) await this.ctx.storage.put('binding', hash);
            await this.ctx.storage.deleteAlarm();
            const previous = this.hosts();
            ws.serializeAttachment({ ...attachment, authenticated: true });
            for (const old of previous) {
                // 先取消舊連線的資格，close 事件送達前 hosts() 就只剩新的主機
                old.serializeAttachment({ ...old.deserializeAttachment(), authenticated: false });
                send(old, { t: 'host-replaced' });
                closeSocket(old, CLOSE.HOST_REPLACED, 'replaced by a newer host connection');
            }
            send(ws, { t: 'host-ready', peers: this.peers().map((peer) => peer.deserializeAttachment().peerId) });
            send(ws, { t: 'config', iceServers: this.iceServers });
            for (const peer of this.peers()) send(peer, { t: 'host-online' });
            return;
        }
        if (message.t !== 'signal' || typeof message.to !== 'string' || message.data === undefined) {
            return send(ws, { t: 'error', code: 'BAD_MESSAGE' });
        }
        const [peer] = this.ctx.getWebSockets(`peer:${message.to}`);
        if (!peer) return send(ws, { t: 'error', code: 'PEER_NOT_FOUND', peerId: message.to });
        send(peer, { t: 'signal', from: 'host', data: message.data });
    }

    onPeerMessage(ws, attachment, message) {
        if (message.t !== 'signal' || message.data === undefined) return send(ws, { t: 'error', code: 'BAD_MESSAGE' });
        const [host] = this.hosts();
        if (!host) return send(ws, { t: 'error', code: 'HOST_OFFLINE' });
        // from 一律由伺服器填入，用戶端送來的 from／to 都不採用
        send(host, { t: 'signal', from: attachment.peerId, data: message.data });
    }

    async webSocketClose(ws) {
        await this.onDisconnect(ws);
        closeSocket(ws, 1000, '');
    }

    async webSocketError(ws) {
        await this.onDisconnect(ws);
    }

    async onDisconnect(ws) {
        this.recent.delete(ws);
        const attachment = ws.deserializeAttachment();
        if (!attachment || attachment.gone) return;
        ws.serializeAttachment({ ...attachment, gone: true, authenticated: false });
        if (attachment.role === 'peer') {
            for (const host of this.hosts()) send(host, { t: 'peer-left', peerId: attachment.peerId });
            return;
        }
        if (attachment.role === 'host' && attachment.authenticated && this.hosts().length === 0) {
            for (const peer of this.peers()) if (peer !== ws) send(peer, { t: 'host-offline' });
            // 連續 BINDING_TTL_MS（預設 24 小時）沒有主機就清除綁定
            await this.ctx.storage.setAlarm(Date.now() + this.bindingTtlMs);
        }
    }

    async alarm() {
        if (this.hosts().length === 0) await this.ctx.storage.delete('binding');
    }
}

function parse(raw) {
    let message;
    try {
        message = JSON.parse(raw, (key, value) => (key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : value));
    } catch {
        return null;
    }
    return message && typeof message === 'object' && !Array.isArray(message) && typeof message.t === 'string' ? message : null;
}

function send(ws, message) {
    try {
        ws.send(JSON.stringify(message));
    } catch {
        // 連線已關閉
    }
}

function closeSocket(ws, code, reason) {
    try {
        ws.close(code, reason);
    } catch {
        // 已關閉
    }
}
