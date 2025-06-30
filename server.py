#!/usr/bin/env python3

import json
import os
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import shutil

class ScheduleHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        """Handle POST requests to save JSON files"""
        try:
            if self.path == '/api/save-schedule':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                schedule_data = data.get('data', [])
                filepath = data.get('filepath', '')
                
                # Validate filepath for security
                if not filepath.startswith('./output/'):
                    self.send_error(400, "Invalid file path")
                    return
                
                # Create backup before saving
                if os.path.exists(filepath):
                    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                    backup_path = filepath.replace('.json', f'_backup_{timestamp}.json')
                    shutil.copy2(filepath, backup_path)
                    print(f"✅ Backup created: {backup_path}")
                
                # Save the updated file
                os.makedirs(os.path.dirname(filepath), exist_ok=True)
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(schedule_data, f, indent=2, ensure_ascii=False)
                
                print(f"✅ Saved {len(schedule_data)} sessions to {filepath}")
                
                # Send success response
                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                
                response = {
                    'success': True,
                    'message': f'Successfully saved {len(schedule_data)} sessions to {filepath}',
                    'filepath': filepath,
                    'timestamp': datetime.now().isoformat()
                }
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
            else:
                self.send_error(404, "Endpoint not found")
                
        except Exception as e:
            print(f"❌ Error saving file: {str(e)}")
            self.send_error(500, f"Error saving file: {str(e)}")

    def do_GET(self):
        """Handle GET requests for static files"""
        if self.path == '/':
            self.path = '/index.html'
        
        try:
            # Serve static files
            if self.path.endswith('.html'):
                with open(self.path[1:], 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                self.end_headers()
                self.wfile.write(content)
            elif self.path.endswith('.js'):
                with open(self.path[1:], 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/javascript')
                self.end_headers()
                self.wfile.write(content)
            elif self.path.endswith('.json'):
                with open(self.path[1:], 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_error(404, "File not found")
        except FileNotFoundError:
            self.send_error(404, "File not found")
        except Exception as e:
            self.send_error(500, str(e))

def run_server(port=8000):
    """Start the development server"""
    server_address = ('', port)
    httpd = HTTPServer(server_address, ScheduleHandler)
    print(f"🚀 Schedule Manager Server running on http://localhost:{port}")
    print(f"📁 Serving files from current directory")
    print(f"💾 API endpoint: POST /api/save-schedule")
    print(f"🔄 CORS enabled for all origins")
    print("Press Ctrl+C to stop the server")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
        httpd.server_close()

if __name__ == '__main__':
    run_server() 