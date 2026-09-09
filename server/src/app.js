
import express from 'express';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import apiRoutes from './api/apiRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ============================================================
// MIDDLEWARE CONFIGURATION
// ============================================================

app.use(cors());

app.use(express.json({ limit: '2mb' }));

app.use(express.urlencoded({ extended: true }));

// ============================================================
// UNIFIED ORIGIN: STATIC DASHBOARD HOSTING
// ============================================================

const publicDir = path.resolve(__dirname, '../../public');

app.use(
    express.static(publicDir, {
        extensions: ['html'],
        index: 'index.html'
    })
);

// ============================================================
// REST API
// ============================================================

app.use('/api', apiRoutes);

// ============================================================
// SPA FALLBACK
// ============================================================
//
// IMPORTANT:
// This must NOT turn missing JS/CSS/image requests into index.html.
// Otherwise the browser receives text/html for module scripts.
//

app.get('/{*splat}', (req, res, next) => {
    const requestPath = req.path;

    // Never send index.html for API requests.
    if (requestPath === '/api' || requestPath.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: 'ENDPOINT_NOT_FOUND',
            message: `Endpoint ${req.method} ${requestPath} does not exist.`
        });
    }

    // Static asset paths must return real 404s.
    const assetPrefixes = [
        '/js/',
        '/css/',
        '/assets/',
        '/images/',
        '/fonts/',
        '/favicon'
    ];

    const isAssetRequest = assetPrefixes.some((prefix) =>
        requestPath.startsWith(prefix)
    );

    if (isAssetRequest) {
        return res.status(404).send('Asset not found');
    }

    // SPA navigation fallback.
    res.sendFile(path.join(publicDir, 'index.html'));
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    console.error('[ERROR]', err);

    if (res.headersSent) {
        return next(err);
    }

    res.status(err.status || 500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected server error occurred.'
    });
});

export default app;
