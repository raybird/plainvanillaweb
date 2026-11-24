import http from 'node:http';
import crypto from 'node:crypto';

const WS_MAGIC_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeWsFrame(opcode, payloadBuf) {
    const payload = Buffer.isBuffer(payloadBuf) ? payloadBuf : Buffer.from(String(payloadBuf), 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) {
        header = Buffer.allocUnsafe(2);
        header[0] = 0x80 | opcode;
        header[1] = len;
    } else if (len < 65536) {
        header = Buffer.allocUnsafe(4);
        header[0] = 0x80 | opcode;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.allocUnsafe(10);
        header[0] = 0x80 | opcode;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    return Buffer.concat([header, payload]);
}

/**
 * 啟動零依賴本機 WebSocket + SSE 測試伺服器（供 Node 單元測試與 Headless Chrome 整合測試共用）。
 */
export async function startRealtimeTestServer() {
    const sockets = new Set();
    const wsClients = new Set();
    const sseClients = new Set();
    const stats = {
        totalWsOpened: 0,
        totalSseOpened: 0,
        openedWsUrls: [],
        openedSseRequests: [],
        receivedWsMessages: [],
    };
    let nextClientId = 0;

    function applyCors(req, res) {
        const origin = req.headers.origin;
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Vary', 'Origin');
        } else {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }
        res.setHeader('Access-Control-Allow-Headers', 'Last-Event-ID, Cache-Control');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    }

    const server = http.createServer((req, res) => {
        applyCors(req, res);
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('ok');
            return;
        }

        if (url.pathname === '/sse') {
            const room = url.searchParams.get('room') || 'default';
            const id = ++nextClientId;
            const lastEventId = String(req.headers['last-event-id'] || url.searchParams.get('lastEventId') || '');
            stats.totalSseOpened += 1;
            stats.openedSseRequests.push({
                id,
                room,
                url: req.url,
                lastEventId,
                origin: req.headers.origin || '',
                cookie: req.headers.cookie || '',
            });

            res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
            });
            res.flushHeaders?.();
            res.write(': connected\n\n');

            const client = {
                id,
                room,
                url: req.url,
                res,
                socket: req.socket,
                lastEventId,
                sendEvent({ id: eventId, event, data }) {
                    if (res.writableEnded || res.destroyed) return;
                    let chunk = '';
                    if (eventId !== undefined && eventId !== null && eventId !== '') {
                        chunk += `id: ${eventId}\n`;
                    }
                    if (event && event !== 'message') {
                        chunk += `event: ${event}\n`;
                    }
                    const lines = String(data).split(/\r?\n/);
                    for (const line of lines) {
                        chunk += `data: ${line}\n`;
                    }
                    chunk += '\n';
                    res.write(chunk);
                },
                drop() {
                    if (!res.destroyed) res.destroy();
                },
            };

            sseClients.add(client);
            const cleanup = () => sseClients.delete(client);
            req.on('close', cleanup);
            res.on('close', cleanup);
            res.on('error', cleanup);
            return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
    });

    server.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
    });

    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname !== '/ws') {
            socket.destroy();
            return;
        }

        const key = req.headers['sec-websocket-key'];
        if (!key) {
            socket.destroy();
            return;
        }

        const accept = crypto.createHash('sha1').update(`${key}${WS_MAGIC_GUID}`).digest('base64');
        const requestedProtocols = req.headers['sec-websocket-protocol'];
        const chosenProtocol = requestedProtocols ? requestedProtocols.split(',')[0].trim() : '';

        const headers = [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${accept}`,
        ];
        if (chosenProtocol) {
            headers.push(`Sec-WebSocket-Protocol: ${chosenProtocol}`);
        }
        headers.push('', '');
        socket.write(headers.join('\r\n'));

        const room = url.searchParams.get('room') || 'default';
        const relay = url.searchParams.get('relay') === '1';
        const id = ++nextClientId;
        stats.totalWsOpened += 1;
        stats.openedWsUrls.push({ id, room, relay, url: req.url, protocol: chosenProtocol });

        const client = {
            id,
            room,
            relay,
            url: req.url,
            protocol: chosenProtocol,
            socket,
            sendText(text) {
                if (!socket.destroyed) {
                    socket.write(encodeWsFrame(0x1, Buffer.from(String(text), 'utf8')));
                }
            },
            closeGracefully() {
                if (!socket.destroyed) {
                    socket.write(encodeWsFrame(0x8, Buffer.alloc(0)));
                    socket.end();
                }
            },
            drop() {
                if (!socket.destroyed) socket.destroy();
            },
        };
        wsClients.add(client);

        let buffer = head?.length ? Buffer.from(head) : Buffer.alloc(0);
        let fragmentedOpcode = null;
        let fragmentedChunks = [];
        let closedSent = false;

        const cleanup = () => wsClients.delete(client);
        socket.on('close', cleanup);
        socket.on('error', cleanup);

        socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            while (buffer.length >= 2) {
                const b0 = buffer[0];
                const b1 = buffer[1];
                const fin = (b0 & 0x80) !== 0;
                const opcode = b0 & 0x0f;
                const masked = (b1 & 0x80) !== 0;
                let payloadLen = b1 & 0x7f;
                let offset = 2;

                if (payloadLen === 126) {
                    if (buffer.length < offset + 2) return;
                    payloadLen = buffer.readUInt16BE(offset);
                    offset += 2;
                } else if (payloadLen === 127) {
                    if (buffer.length < offset + 8) return;
                    const bigLen = buffer.readBigUInt64BE(offset);
                    payloadLen = Number(bigLen);
                    offset += 8;
                }

                let maskKey = null;
                if (masked) {
                    if (buffer.length < offset + 4) return;
                    maskKey = buffer.subarray(offset, offset + 4);
                    offset += 4;
                }

                if (buffer.length < offset + payloadLen) return;
                const rawPayload = Buffer.from(buffer.subarray(offset, offset + payloadLen));
                buffer = buffer.subarray(offset + payloadLen);

                if (masked && maskKey) {
                    for (let i = 0; i < rawPayload.length; i++) {
                        rawPayload[i] ^= maskKey[i % 4];
                    }
                }

                if (opcode === 0x8) {
                    if (!closedSent && !socket.destroyed) {
                        closedSent = true;
                        socket.write(encodeWsFrame(0x8, Buffer.alloc(0)));
                    }
                    socket.end();
                    cleanup();
                    return;
                }
                if (opcode === 0x9) {
                    if (!socket.destroyed) {
                        socket.write(encodeWsFrame(0xA, rawPayload));
                    }
                    continue;
                }
                if (opcode === 0xA) {
                    continue;
                }

                if (!fin) {
                    if (opcode !== 0x0) {
                        fragmentedOpcode = opcode;
                        fragmentedChunks = [rawPayload];
                    } else {
                        fragmentedChunks.push(rawPayload);
                    }
                    continue;
                }

                let completePayload = rawPayload;
                let effectiveOpcode = opcode;
                if (opcode === 0x0 && fragmentedOpcode !== null) {
                    fragmentedChunks.push(rawPayload);
                    completePayload = Buffer.concat(fragmentedChunks);
                    effectiveOpcode = fragmentedOpcode;
                    fragmentedOpcode = null;
                    fragmentedChunks = [];
                }

                if (effectiveOpcode === 0x1) {
                    const text = completePayload.toString('utf8');
                    stats.receivedWsMessages.push({
                        id,
                        room,
                        data: text,
                        url: req.url,
                    });
                    if (client.relay) {
                        for (const peer of wsClients) {
                            if (peer !== client && peer.room === room && peer.relay) {
                                peer.sendText(text);
                            }
                        }
                    }
                }
            }
        });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    return {
        port,
        wsUrl(room = 'default', query = {}) {
            const u = new URL(`ws://127.0.0.1:${port}/ws`);
            u.searchParams.set('room', room);
            for (const [k, v] of Object.entries(query)) {
                if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
            }
            return u.href;
        },
        sseUrl(room = 'default', query = {}) {
            const u = new URL(`http://127.0.0.1:${port}/sse`);
            u.searchParams.set('room', room);
            for (const [k, v] of Object.entries(query)) {
                if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
            }
            return u.href;
        },
        getStats(room) {
            const matchRoom = (entry) => !room || entry.room === room;
            const activeWs = [...wsClients].filter(matchRoom);
            const activeSse = [...sseClients].filter(matchRoom);
            return {
                activeWsCount: activeWs.length,
                totalWsOpened: stats.openedWsUrls.filter(matchRoom).length,
                activeSseCount: activeSse.length,
                totalSseOpened: stats.openedSseRequests.filter(matchRoom).length,
                openedWsUrls: stats.openedWsUrls.filter(matchRoom).map((x) => ({ ...x })),
                openedSseRequests: stats.openedSseRequests.filter(matchRoom).map((x) => ({ ...x })),
                receivedWsMessages: stats.receivedWsMessages.filter(matchRoom).map((x) => ({ ...x })),
            };
        },
        broadcastWs(room, data) {
            const text = typeof data === 'string' ? data : JSON.stringify(data);
            for (const client of wsClients) {
                if (!room || client.room === room) {
                    client.sendText(text);
                }
            }
        },
        broadcastSse(room, payload) {
            for (const client of sseClients) {
                if (!room || client.room === room) {
                    client.sendEvent(payload);
                }
            }
        },
        dropWs(room) {
            for (const client of [...wsClients]) {
                if (!room || client.room === room) {
                    client.drop();
                }
            }
        },
        dropSse(room) {
            for (const client of [...sseClients]) {
                if (!room || client.room === room) {
                    client.drop();
                }
            }
        },
        resetStats() {
            stats.totalWsOpened = 0;
            stats.totalSseOpened = 0;
            stats.openedWsUrls.length = 0;
            stats.openedSseRequests.length = 0;
            stats.receivedWsMessages.length = 0;
        },
        async close() {
            for (const client of [...wsClients]) client.drop();
            for (const client of [...sseClients]) client.drop();
            for (const sock of [...sockets]) {
                if (!sock.destroyed) sock.destroy();
            }
            await new Promise((resolve) => server.close(() => resolve()));
        },
    };
}
