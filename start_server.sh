#!/bin/bash

echo "🚀 Starting University Schedule Manager Server..."
echo "📁 Working directory: $(pwd)"
echo ""

# Check if Python is available
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Python is not installed or not in PATH"
    echo "Please install Python 3.x and try again"
    exit 1
fi

echo "🐍 Using Python: $PYTHON_CMD"
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
echo "🔄 Press Ctrl+C to stop the server"
echo ""

# Start the server
$PYTHON_CMD server.py 