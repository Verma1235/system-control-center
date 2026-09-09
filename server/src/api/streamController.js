import { getActiveNodesMap } from '../socket/socketManager.js';
import { verifyToken } from '../auth/jwt.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

export const streamController = {
    /**
     * Proxy bridge for streaming large media and downloading Zips
     */
    streamMedia: async (req, res) => {
        const io = req.app.get('io');
        const { id: nodeId } = req.params;
        const { path: targetPath, token, action } = req.query; // action = 'stream' or 'zip'

        // 1. Authenticate via URL Token
        if (!token) return res.status(401).send('Unauthorized: No token provided');
        const decoded = verifyToken(token);
        if (!decoded) return res.status(401).send('Unauthorized: Invalid or expired token');

        // 2. Locate Active Electron Node
        const activeNodes = getActiveNodesMap();
        const nodeSocketId = activeNodes.get(nodeId);
        if (!nodeSocketId) return res.status(404).send('Node is currently offline');

        const nodeSocket = io.sockets.sockets.get(nodeSocketId);
        if (!nodeSocket) return res.status(404).send('Node socket connection lost');

        // 3. Set up the specific stream tracking
        const range = req.headers.range;
        const streamId = crypto.randomUUID();
        let headersSent = false;

        // Auto-cleanup if node goes silent
        const streamTimeout = setTimeout(() => {
            if (!headersSent) res.status(504).send('Node failed to respond in time');
            cleanup();
        }, 15000);

        const cleanup = () => {
            clearTimeout(streamTimeout);
            nodeSocket.removeAllListeners(`stream-metadata-${streamId}`);
            nodeSocket.removeAllListeners(`stream-chunk-${streamId}`);
            nodeSocket.removeAllListeners(`stream-end-${streamId}`);
            nodeSocket.removeAllListeners(`stream-error-${streamId}`);
        };

        // 4. Step A: Wait for Node to send file details (size, mime type)
        nodeSocket.once(`stream-metadata-${streamId}`, (metadata) => {
            clearTimeout(streamTimeout);

            // Safety Check: Avoid setting headers if already sent
            if (headersSent) return;

            if (metadata.error) {
                cleanup();
                return res.status(500).send(metadata.error);
            }

            // ==========================================
            // ACTION: ZIP FOLDER DOWNLOAD
            // ==========================================
            if (action === 'zip') {
                res.writeHead(200, {
                    'Content-Type': 'application/zip',
                    'Content-Disposition': `attachment; filename="${metadata.filename || 'download.zip'}"`
                });
                headersSent = true;
                return; // ✨ CRITICAL FIX: Ye return guarantee dega ki neeche ka file-download wala logic dobara headers (res.writeHead) fire nahi karega.
            }

            // ==========================================
            // ACTION: MEDIA STREAMING / FILE DOWNLOAD
            // ==========================================
            const fileSize = metadata.fileSize;
            const mimeType = metadata.mimeType || 'application/octet-stream';

            // If user clicked download instead of stream
            if (action === 'download') {
                res.setHeader('Content-Disposition', `attachment; filename="${metadata.filename || 'file'}"`);
            }

            if (range) {
                // Video seeking (206 Partial Content)
                const start = metadata.start || 0;
                const end = metadata.end || (fileSize - 1);
                const chunkSize = metadata.chunkSize || (end - start) + 1;

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': mimeType,
                });
            } else {
                // Initial load or normal file download
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': mimeType,
                });
            }

            headersSent = true;
        });

        // 5. Step B: Receive binary chunks from Node and pipe to browser with BACKPRESSURE
        nodeSocket.on(`stream-chunk-${streamId}`, (chunk, callback) => {
            const canContinue = res.write(chunk);

            if (canContinue) {
                if (typeof callback === 'function') callback();
            } else {
                res.once('drain', () => {
                    if (typeof callback === 'function') callback();
                });
            }
        });

        // 6. Step C: End of file
        nodeSocket.on(`stream-end-${streamId}`, () => {
            res.end();
            cleanup();
        });

        // Handle errors from node
        nodeSocket.on(`stream-error-${streamId}`, (err) => {
            logger.error(`Stream error on node ${nodeId}`, { err });
            if (!headersSent) {
                res.status(500).send('Stream crashed');
            } else {
                res.end();
            }
            cleanup();
        });

        // ✨ CRITICAL: If admin closes the browser tab or cancels the download
        req.on('close', () => {
            nodeSocket.emit('abort-stream', { streamId });
            cleanup();
        });

        // 7. Fire the starting gun - Request the stream from the node
        nodeSocket.emit('request-stream', {
            streamId,
            path: targetPath,
            range: range,
            action: action // 'stream', 'download', or 'zip'
        });
    }
};