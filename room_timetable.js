// Time slots including all possible times - defined first
const allTimeSlots = [
    "8:00 - 8:50", "8:00 - 9:40", "8:50 - 9:40",
    "9:00 - 9:50",
    "10:00 - 10:50", "10:50 - 11:40", "10:00 - 11:40", 
    "11:00 - 11:50", "11:40 - 12:30", "11:50 - 12:30", "11:50 - 1:20",
    "12:00 - 12:50", "12:30 - 1:20",
    "1:00 - 1:50", "1:20 - 2:10", "1:20 - 3:00", 
    "2:00 - 2:50", "2:10 - 3:00",
    "3:00 - 3:50", "3:50 - 4:40", "3:00 - 4:40",
    "4:00 - 4:50",
    "5:00 - 5:50", "5:10 - 6:00", "5:10 - 6:50",
    "6:00 - 6:50"
];

// Global variables
let labData = [];
let theoryData = [];
let allData = [];
let roomData = {};

// Days will be dynamically determined from the data
let days = [];

// Group color mapping
const groupColors = {
    1: 'group-g1', 2: 'group-g2', 3: 'group-g3', 4: 'group-g4', 5: 'group-g5',
    6: 'group-g6', 7: 'group-g7', 8: 'group-g8', 9: 'group-g9', 10: 'group-g10'
};

// Helper functions
function getGroupClass(groupName) {
    if (!groupName) return '';
    const match = groupName.match(/_G(\d+)$/);
    if (match) {
        const groupNum = parseInt(match[1]);
        return groupColors[groupNum] || '';
    }
    return '';
}

function getGroupNumber(groupName) {
    if (!groupName) return '';
    const match = groupName.match(/_G(\d+)$/);
    return match ? match[1] : '';
}

// Initialize user state for rooms page
if (typeof userState !== 'undefined') {
    userState.setCurrentPage('rooms');
}

// Load and parse data
async function loadData() { 
    try {
        console.log('🏫 Loading room data with user state management...');
        
        // Update user state
        if (typeof userState !== 'undefined') {
            userState.updateDataState({ isLoading: true, loadingProgress: 0, error: null });
        }
        
        // Check if data is already cached and fresh
        const dataState = userState?.getDataState();
        const cacheTimeout = 5 * 60 * 1000; // 5 minutes
        const isCacheFresh = dataState?.lastLoaded && 
                           (Date.now() - dataState.lastLoaded) < cacheTimeout;
        
        if (isCacheFresh && allData.length > 0) {
            console.log('✅ Using cached room data');
            userState?.updateDataState({ isLoading: false, loadingProgress: 100 });
            
            // Still need to process room data and initialize UI
            processRoomData();
            initializeFilters();
            updateStats();
            renderRooms();
            restoreRoomFilters();
            return;
        }
        
        const [labPath, theoryPath, shiftPath] = [
            './output/combined_lab_schedule.json',
            './output/combined_theory_schedule.json',
            './output/verification_report.json'
        ];

        userState?.updateDataState({ loadingProgress: 20 });

        try {
            const [labRes, theoryRes, shiftRes] = await Promise.all([
                fetch(labPath),
                fetch(theoryPath),
                fetch(shiftPath).catch(() => null) // Handle potential missing file
            ]);

            userState?.updateDataState({ loadingProgress: 50 });

            labData = await labRes.json();
            theoryData = await theoryRes.json();
            allData = [...labData, ...theoryData];
            
            userState?.updateDataState({ loadingProgress: 70 });
            
            if (shiftRes && shiftRes.ok) {
                teacherShiftData = await shiftRes.json();
            }
        } catch (error) {
            console.error('Error loading JSON files:', error);
            throw error;
        }
        
        userState?.updateDataState({ loadingProgress: 80 });
        
        // Process room data
        processRoomData();
        
        userState?.updateDataState({ loadingProgress: 90 });
        
        // Initialize UI
        initializeFilters();
        updateStats();
        renderRooms();
        
        // Restore user filters
        restoreRoomFilters();
        
        userState?.updateDataState({ 
            isLoading: false, 
            loadingProgress: 100,
            lastLoaded: Date.now()
        });
        
        console.log('✅ Room data loaded successfully');
        
    } catch (error) {
        console.error('❌ Error loading room data:', error);
        userState?.updateDataState({ 
            isLoading: false, 
            error: error.message 
        });
        document.getElementById('roomContainer').innerHTML = `
            <div class="alert alert-danger text-center">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Error loading schedule data. Please ensure the data files are available.
                <br><small>Error: ${error.message}</small>
            </div>
        `;
    }
}

// Restore room filters from user state
function restoreRoomFilters() {
    if (typeof userState === 'undefined') return;
    
    const filters = userState.getFilters('rooms');
    
    if (filters.selectedBlock && filters.selectedBlock !== 'all') {
        filterByBlock(filters.selectedBlock);
        
        // Update UI to reflect the filter
        const blockButtons = document.querySelectorAll('.block-filter-btn');
        blockButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.textContent.includes(filters.selectedBlock)) {
                btn.classList.add('active');
            }
        });
    }
    
    console.log('✅ Room filters restored');
}

// Save room filter state
function saveRoomFilterState(filterType, value) {
    if (typeof userState === 'undefined') return;
    
    const currentFilters = userState.getFilters('rooms');
    const updatedFilters = { ...currentFilters };
    
    if (filterType === 'block') {
        updatedFilters.selectedBlock = value;
    } else if (filterType === 'roomType') {
        updatedFilters.selectedRoomType = value;
    } else if (filterType === 'sortBy') {
        updatedFilters.sortBy = value;
    }
    
    userState.updateFilters('rooms', updatedFilters);
}

// Process data by room
function processRoomData() {
    roomData = {};
    
    // Dynamically determine days from the actual data
    const daysInData = new Set();
    allData.forEach(session => {
        if (session.day) {
            daysInData.add(session.day);
        }
    });
    
    // Convert to sorted array - handle both day patterns
    days = Array.from(daysInData).sort((a, b) => {
        // Custom sort order for proper day sequence
        const dayOrder = {
            'monday': 1, 'tuesday': 2, 'wed': 3, 'thur': 4, 
            'fri': 5, 'saturday': 6, 'sat': 6
        };
        return (dayOrder[a] || 999) - (dayOrder[b] || 999);
    });
    
    console.log('Days found in data:', days);
    console.log('Total sessions in data:', allData.length);
    
    // Debug: Check what days are actually in the data
    const dayCount = {};
    allData.forEach(session => {
        if (session.day) {
            dayCount[session.day] = (dayCount[session.day] || 0) + 1;
        }
    });
    console.log('Day distribution:', dayCount);
    
    allData.forEach(session => {
        const roomKey = `${session.room_id}`;
        
        if (!roomData[roomKey]) {
            roomData[roomKey] = {
                room_id: session.room_id,
                room_number: session.room_number,
                block: session.block,
                capacity: session.capacity || 'N/A',
                room_type: session.schedule_type === 'lab' ? 'lab' : 'theory',
                sessions: [],
                schedule: {}
            };
            
            // Initialize schedule grid
            days.forEach(day => {
                roomData[roomKey].schedule[day] = {};
                allTimeSlots.forEach(timeSlot => {
                    roomData[roomKey].schedule[day][timeSlot] = [];
                });
            });
        }
        
        // Add session to room
        roomData[roomKey].sessions.push(session);
        
        // Add to schedule grid
        const timeKey = session.schedule_type === 'lab' ? session.time_range : session.time_slot;
        if (roomData[roomKey].schedule[session.day]) {
            if (!roomData[roomKey].schedule[session.day][timeKey]) {
                // Create the time slot if it doesn't exist
                roomData[roomKey].schedule[session.day][timeKey] = [];
            }
            roomData[roomKey].schedule[session.day][timeKey].push(session);
            if (session.day === 'monday') {
                console.log(`MONDAY session added: ${session.course_code} in room ${session.room_number} on ${session.day} at ${timeKey}`);
            }
        } else {
            console.warn(`No schedule grid for day ${session.day} in room ${roomKey}. Available days:`, Object.keys(roomData[roomKey].schedule));
        }
    });
}

// Initialize filters
function initializeFilters() {
    // Block filter buttons
    const blocks = [...new Set(Object.values(roomData).map(room => room.block))].sort();
    const blockFilter = document.getElementById('blockFilter');
    
    // Add "All" button
    const allBtn = document.createElement('button');
    allBtn.className = 'block-btn active';
    allBtn.textContent = 'All Blocks';
    allBtn.onclick = () => filterByBlock('');
    blockFilter.appendChild(allBtn);
    
    // Add block buttons
    blocks.forEach(block => {
        const btn = document.createElement('button');
        btn.className = 'block-btn';
        btn.textContent = block;
        btn.onclick = () => filterByBlock(block);
        blockFilter.appendChild(btn);
    });
    
    // Add event listeners for other filters
    document.getElementById('roomTypeFilter').addEventListener('change', renderRooms);
    document.getElementById('capacityFilter').addEventListener('change', renderRooms);
    document.getElementById('roomSearch').addEventListener('input', debounce(renderRooms, 300));
}

// Update statistics
function updateStats() {
    const rooms = Object.values(roomData);
    const labRooms = rooms.filter(room => room.room_type === 'lab');
    const theoryRooms = rooms.filter(room => room.room_type === 'theory');
    
    // Calculate average utilization
    let totalUtilization = 0;
    rooms.forEach(room => {
        const totalSlots = days.length * 10; // Approximate 10 working hours per day
        const usedSlots = room.sessions.length;
        totalUtilization += (usedSlots / totalSlots) * 100;
    });
    const avgUtilization = rooms.length > 0 ? (totalUtilization / rooms.length).toFixed(1) : 0;
    
    document.getElementById('totalRooms').textContent = rooms.length;
    document.getElementById('labRooms').textContent = labRooms.length;
    document.getElementById('theoryRooms').textContent = theoryRooms.length;
    document.getElementById('avgUtilization').textContent = `${avgUtilization}%`;
}

// Filter by block
function filterByBlock(block) {
    // Update active button
    document.querySelectorAll('.block-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Save filter state
    saveRoomFilterState('block', block);
    
    renderRooms();
}

// Get filtered rooms
function getFilteredRooms() {
    let filtered = Object.values(roomData);
    
    // Block filter
    const activeBlockBtn = document.querySelector('.block-btn.active');
    const selectedBlock = activeBlockBtn.textContent === 'All Blocks' ? '' : activeBlockBtn.textContent;
    
    if (selectedBlock) {
        filtered = filtered.filter(room => room.block === selectedBlock);
    }
    
    // Room type filter
    const roomType = document.getElementById('roomTypeFilter').value;
    if (roomType) {
        filtered = filtered.filter(room => room.room_type === roomType);
    }
    
    // Capacity filter
    const capacity = document.getElementById('capacityFilter').value;
    if (capacity) {
        filtered = filtered.filter(room => {
            const cap = parseInt(room.capacity) || 0;
            switch (capacity) {
                case 'small': return cap <= 40;
                case 'medium': return cap > 40 && cap <= 80;
                case 'large': return cap > 80;
                default: return true;
            }
        });
    }
    
    // Room search
    const search = document.getElementById('roomSearch').value.toLowerCase();
    if (search) {
        filtered = filtered.filter(room => 
            room.room_id.toString().includes(search) ||
            room.room_number.toLowerCase().includes(search) ||
            room.block.toLowerCase().includes(search)
        );
    }
    
    return filtered;
}

// Render rooms
function renderRooms() {
    const container = document.getElementById('roomContainer');
    const filteredRooms = getFilteredRooms();
    
    if (filteredRooms.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info text-center">
                <i class="fas fa-info-circle me-2"></i>
                No rooms found matching the current filters.
            </div>
        `;
        return;
    }
    
    // Sort rooms by block and room ID
    filteredRooms.sort((a, b) => {
        if (a.block !== b.block) {
            return a.block.localeCompare(b.block);
        }
        return parseInt(a.room_id) - parseInt(b.room_id);
    });
    
    let html = '<div class="room-grid">';
    
    filteredRooms.forEach(room => {
        const utilization = calculateRoomUtilization(room);
        const isLab = room.room_type === 'lab';
        
        html += `
            <div class="room-card ${isLab ? 'lab-room' : 'theory-room'}">
                <div class="room-header">
                    <div class="room-info">
                        <div>
                            <h5 class="mb-0">
                                <i class="fas ${isLab ? 'fa-flask' : 'fa-chalkboard'} me-2"></i>
                                Room ${room.room_id}: ${room.room_number}
                            </h5>
                            <div class="room-details">
                                <span class="room-badge">
                                    <i class="fas fa-building me-1"></i>${room.block}
                                </span>
                                <span class="room-badge">
                                    <i class="fas fa-users me-1"></i>Capacity: ${room.capacity}
                                </span>
                                <span class="room-badge">
                                    <i class="fas fa-calendar me-1"></i>${room.sessions.length} sessions
                                </span>
                            </div>
                        </div>
                        <div>
                            <div style="text-align: right;">
                                <strong>${utilization.toFixed(1)}%</strong>
                                <div style="font-size: 0.8rem;">Utilization</div>
                            </div>
                            <div class="utilization-bar">
                                <div class="utilization-fill" style="width: ${utilization}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card-body p-2">
                    ${generateRoomScheduleTable(room)}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// Calculate room utilization percentage
function calculateRoomUtilization(room) {
    const totalSlots = days.length * 10; // Approximate total working hours per week
    const usedSlots = room.sessions.length;
    return Math.min((usedSlots / totalSlots) * 100, 100);
}

// Generate schedule table for a room
function generateRoomScheduleTable(room) {
    // Debug: Log which days are being rendered for each room
    if (room.room_id === '113') { // Just log for room 113 to avoid spam
        console.log('Rendering table for room 113 (B First Floor) with days:', days);
        console.log('Room schedule has days:', Object.keys(room.schedule));
    }
    
    let html = `
        <div class="table-responsive">
            <table class="table table-bordered schedule-table">
                <thead>
                    <tr>
                        <th class="time-slot">Time</th>
    `;
    
    days.forEach(day => {
        html += `<th>${day.charAt(0).toUpperCase() + day.slice(1)}</th>`;
    });
    
    html += `
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Get all time slots that have sessions for this room
    const usedTimeSlots = new Set();
    Object.values(room.schedule).forEach(daySchedule => {
        Object.keys(daySchedule).forEach(timeSlot => {
            if (daySchedule[timeSlot].length > 0) {
                usedTimeSlots.add(timeSlot);
            }
        });
    });
    
    // Sort time slots
    const sortedTimeSlots = Array.from(usedTimeSlots).sort((a, b) => {
        const timeA = a.split(' - ')[0];
        const timeB = b.split(' - ')[0];
        return timeA.localeCompare(timeB);
    });
    
    if (sortedTimeSlots.length === 0) {
        // Debug: Show raw sessions data if schedule grid is empty
        if (room.sessions.length > 0) {
            console.log(`Room ${room.room_number} has ${room.sessions.length} sessions but empty schedule grid:`, room.sessions);
            html += `
                <tr>
                    <td colspan="${days.length + 1}" class="empty-slot">
                        <i class="fas fa-exclamation-triangle me-1"></i>
                        ${room.sessions.length} sessions found but not mapped to time slots
                        <br><small>Check console for details</small>
                    </td>
                </tr>
            `;
        } else {
            html += `
                <tr>
                    <td colspan="${days.length + 1}" class="empty-slot">
                        <i class="fas fa-info-circle me-1"></i>
                        No sessions scheduled for this room
                    </td>
                </tr>
            `;
        }
    } else {
        sortedTimeSlots.forEach(timeSlot => {
            html += `<tr><td class="time-slot">${timeSlot}</td>`;
            
            days.forEach(day => {
                const sessions = room.schedule[day][timeSlot] || [];
                html += '<td>';
                
                if (sessions.length === 0) {
                    html += '<div class="empty-slot">Free</div>';
                } else {
                    sessions.forEach(session => {
                        const isLab = session.schedule_type === 'lab';
                        const groupClass = getGroupClass(session.group_name);
                        const groupNumber = getGroupNumber(session.group_name);
                        
                        html += `
                            <div class="session ${isLab ? '' : 'theory-session'}" title="
                                Course: ${session.course_name}
                                Teacher: ${session.teacher_name}
                                Department: ${session.department}
                                Group: ${session.group_name}
                                ${isLab ? 'Students: ' + session.student_count : ''}
                            ">
                                <div class="session-header">
                                    <div class="session-code">${session.course_code_display || session.course_code}</div>
                                    ${groupNumber ? `<div class="group-number ${groupClass}">G${groupNumber}</div>` : ''}
                                </div>
                                <div class="session-details">
                                    ${session.teacher_name.length > 20 ? session.teacher_name.substring(0, 20) + '...' : session.teacher_name}
                                </div>
                                <div class="session-details">
                                    ${session.department.replace('Computer Science & ', 'CS&').replace('Artificial Intelligence & ', 'AI&')}
                                </div>
                            </div>
                        `;
                    });
                }
                
                html += '</td>';
            });
            
            html += '</tr>';
        });
    }
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    return html;
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadData();
}); 