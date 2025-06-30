#!/bin/bash

echo "🚀 Starting Fast University Schedule Manager Server..."
echo "📁 Working directory: $(pwd)"
echo ""

# Check if Node.js is available
if command -v node &> /dev/null; then
    NODE_CMD="node"
elif command -v nodejs &> /dev/null; then
    NODE_CMD="nodejs"
else
    echo "❌ Node.js is not installed or not in PATH"
    echo "Please install Node.js and try again"
    echo "💡 Download from: https://nodejs.org/"
    exit 1
fi

echo "⚡ Using Node.js: $NODE_CMD"
echo "📊 Server will be available at: http://localhost:8000"
echo ""
echo "📝 Available endpoints:"
echo "   - GET  /                          → Main dashboard (index.html)"
echo "   - GET  /schedule_website.html     → Interactive Schedule Viewer"
echo "   - GET  /allocation_manager.html   → Allocation Manager"
echo "   - GET  /room_timetable.html       → Room Timetable"
echo "   - POST /api/save-schedule         → Save JSON files directly"
echo ""
echo "💾 Changes will be saved directly to original JSON files with automatic backups"
echo "⚡ Optimized for speed and performance"
echo "🔄 Press Ctrl+C to stop the server"
echo ""

# Start the fast Node.js server
$NODE_CMD server.js 