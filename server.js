#!/usr/bin/env node

const http = require('http');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const url = require('url');

class ScheduleServer {
    constructor(port = 8000) {
        this.port = port;
        this.server = http.createServer(this.handleRequest.bind(this));
    }

    async handleRequest(req, res) {
        // Enable CORS for all requests
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle preflight OPTIONS requests
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        try {
            if (req.method === 'POST') {
                await this.handlePost(req, res, pathname);
            } else if (req.method === 'GET') {
                await this.handleGet(req, res, pathname);
            } else {
                this.sendError(res, 405, 'Method Not Allowed');
            }
        } catch (error) {
            console.error('❌ Server error:', error.message);
            this.sendError(res, 500, `Server error: ${error.message}`);
        }
    }

    async handlePost(req, res, pathname) {
        if (pathname === '/api/save-schedule') {
            await this.handleSaveSchedule(req, res);
        } else {
            this.sendError(res, 404, 'Endpoint not found');
        }
    }

    async handleSaveSchedule(req, res) {
        try {
            // Read request body
            const body = await this.readRequestBody(req);
            const data = JSON.parse(body);
            
            const scheduleData = data.data || [];
            const filepath = data.filepath || '';
            
            // Validate filepath for security
            if (!filepath.startsWith('./output/')) {
                this.sendError(res, 400, 'Invalid file path');
                return;
            }

            // Create backup before saving
            if (fsSync.existsSync(filepath)) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
                const backupPath = filepath.replace('.json', `_backup_${timestamp}.json`);
                await fs.copyFile(filepath, backupPath);
                console.log(`✅ Backup created: ${backupPath}`);
            }

            // Ensure output directory exists
            const dir = path.dirname(filepath);
            await fs.mkdir(dir, { recursive: true });

            // Save the updated file
            await fs.writeFile(filepath, JSON.stringify(scheduleData, null, 2), 'utf8');
            console.log(`✅ Saved ${scheduleData.length} sessions to ${filepath}`);

            // Send success response
            const response = {
                success: true,
                message: `Successfully saved ${scheduleData.length} sessions to ${filepath}`,
                filepath: filepath,
                timestamp: new Date().toISOString()
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));

        } catch (error) {
            console.error('❌ Error saving file:', error.message);
            this.sendError(res, 500, `Error saving file: ${error.message}`);
        }
    }

    async handleGet(req, res, pathname) {
        // Handle root path
        if (pathname === '/') {
            pathname = '/index.html';
        }

        // Remove leading slash for file path
        const filePath = pathname.substring(1);
        
        try {
            // Check if file exists
            await fs.access(filePath);
            
            // Read file
            const content = await fs.readFile(filePath);
            
            // Set content type based on file extension
            const ext = path.extname(filePath).toLowerCase();
            const contentType = this.getContentType(ext);
            
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.sendError(res, 404, 'File not found');
            } else {
                this.sendError(res, 500, error.message);
            }
        }
    }

    getContentType(ext) {
        const contentTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.css': 'text/css',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        };
        return contentTypes[ext] || 'application/octet-stream';
    }

    readRequestBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                resolve(body);
            });
            req.on('error', reject);
        });
    }

    sendError(res, statusCode, message) {
        res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
        res.end(message);
    }

    start() {
        this.server.listen(this.port, () => {
            console.log('🚀 Fast Schedule Manager Server (Node.js) running on http://localhost:' + this.port);
            console.log('📁 Serving files from current directory');
            console.log('💾 API endpoint: POST /api/save-schedule');
            console.log('🔄 CORS enabled for all origins');
            console.log('⚡ Optimized for speed and performance');
            console.log('Press Ctrl+C to stop the server');
        });

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Server stopped by user');
            this.server.close(() => {
                process.exit(0);
            });
        });
    }
}

// Start the server
if (require.main === module) {
    const server = new ScheduleServer(8000);
    server.start();
}

module.exports = ScheduleServer; 