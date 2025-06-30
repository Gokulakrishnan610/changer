let labData = [], theoryData = [], allData = [], teacherShiftData = {};
let days = ['tuesday', 'wed', 'thur', 'fri', 'saturday'];

// Time slots for theory sessions (50-minute slots)
const timeSlots = [
    "8:00 - 8:50", "9:00 - 9:50", "10:00 - 10:50", "11:00 - 11:50",
    "12:00 - 12:50", "1:00 - 1:50", "2:00 - 2:50", "3:00 - 3:50",
    "4:00 - 4:50", "5:00 - 5:50", "6:00 - 6:50"
];

const labSessions = {'L1': '8:00 - 9:40', 'L2': '10:00 - 11:40', 'L3': '11:50 - 1:20', 'L4': '1:20 - 3:00', 'L5': '3:00 - 4:40', 'L6': '5:10 - 6:50'};
const allTimeSlots = [...new Set(Object.values(labSessions).concat(timeSlots))];
const groupColors = {1: 'group-g1', 2: 'group-g2', 3: 'group-g3', 4: 'group-g4'};
const deptColors = {'Computer Science & Engineering': 'dept-cs', 'Information Technology': 'dept-it', 'Artificial Intelligence & Data Science': 'dept-ai', 'Computer Science & Business Systems': 'dept-cb'};

const getGroupClass = (name) => name ? groupColors[name.match(/_G(\d+)$/)?.[1] || ''] || '' : '';
const getDeptClass = (dept) => deptColors[dept] || '';
const getSemesterFromGroupName = (name) => name ? `S${name.match(/_S(\d+)_/)?.[1] || ''}` : '';

async function loadData() {
    try {
        // Load files directly from the output directory
        const [labPath, theoryPath, shiftPath] = [
            './output/combined_lab_schedule.json',
            './output/combined_theory_schedule.json',
            './output/teacher_shift_dashboard_latest.json',
            './output/verification_report.json',
            './output/weekly_summary_latest.json',
            './output/daily_campus_presence_latest.json',
        ];

        const [labRes, theoryRes, shiftRes] = await Promise.all([
                fetch(labPath),
                fetch(theoryPath),                
                fetch(shiftPath).catch(() => null) // Handle potential missing file
            ]);

        labData = await labRes.json();
            theoryData = await theoryRes.json();
            allData = [...labData, ...theoryData];
            
            // Fix room capacities: Set default capacity of 70 for theory rooms, 35 for lab rooms
            allData.forEach(session => {
                if (session.room_number && (!session.capacity || session.capacity === null)) {
                    const roomType = getRoomType(session.room_number);
                    session.capacity = roomType === 'theory' ? 70 : 35;
                }
            });
            
            // Update the original arrays as well
            labData.forEach(session => {
                if (session.room_number && (!session.capacity || session.capacity === null)) {
                    session.capacity = 35; // Lab rooms default to 35
                }
            });
            
            theoryData.forEach(session => {
                if (session.room_number && (!session.capacity || session.capacity === null)) {
                    session.capacity = 70; // Theory rooms default to 70
                }
            });
            
            if (shiftRes && shiftRes.ok) {
                teacherShiftData = await shiftRes.json();
        }

        // labData = await labPath.json();
        // theoryData = await theoryPath.json();
        // shiftData = await shiftPath.json();
        // allData = [...labData, ...theoryData, ...shiftData];
        // if (shiftRes && shiftRes.ok) teacherShiftData = await shiftPath.json();

        initializeUI();
    } catch (error) {
        document.getElementById('mainContent').innerHTML = `<div class="alert alert-danger text-center">Error loading data: ${error.message}</div>`;
    }
}

// Determine room type based on room number (same logic as allocation manager)
function getRoomType(roomNumber) {
    if (!roomNumber) return 'unknown';
    const room = roomNumber.toString().toLowerCase();
    if (room.includes('lab') || room.includes('comp') || room.includes('cse') || room.includes('it')) {
        return 'lab';
    }
    return 'theory';
}

// ==== JSON FILE PERSISTENCE FUNCTIONS ====

// Save changes directly to the original JSON files
async function saveChangesToJsonFiles() {
    try {
        console.log('💾 Saving changes to original JSON files...');
        
        // Save updated data directly to original files (server creates backups automatically)
        await saveUpdatedJsonFiles();
        
        console.log('✅ Changes saved to original JSON files successfully');
        showSuccessAlert('Changes saved to original JSON files successfully!');
        
    } catch (error) {
        console.error('❌ Error saving changes to JSON files:', error);
        showErrorAlert('Failed to save changes to JSON files: ' + error.message);
    }
}

// Create backup copies of the original JSON files
async function createBackupFiles() {
    try {
        // Since we can't directly write files from browser, we'll use a different approach
        // We'll create downloadable backup files when changes are made
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        
        // Create backup data objects
        const backupData = {
            lab: [...labData],
            theory: [...theoryData],
            timestamp: timestamp,
            originalFiles: {
                lab: './output/combined_lab_schedule.json',
                theory: './output/combined_theory_schedule.json'
            }
        };
        
        // Store backup in localStorage for now
        localStorage.setItem('schedule_backup_' + timestamp, JSON.stringify(backupData));
        
        // Also create downloadable backup files
        downloadBackupFiles(backupData);
        
        console.log(`✅ Backup created with timestamp: ${timestamp}`);
        
    } catch (error) {
        console.error('❌ Error creating backup files:', error);
        throw new Error('Failed to create backup files');
    }
}

// Download backup files
function downloadBackupFiles(backupData) {
    try {
        // Download lab backup
        downloadJsonFile(backupData.lab, `combined_lab_schedule_backup_${backupData.timestamp}.json`);
        
        // Download theory backup
        downloadJsonFile(backupData.theory, `combined_theory_schedule_backup_${backupData.timestamp}.json`);
        
        console.log('✅ Backup files prepared for download');
        
    } catch (error) {
        console.error('❌ Error preparing backup downloads:', error);
    }
}

// Save updated JSON files directly to the original files
async function saveUpdatedJsonFiles() {
    try {
        console.log('📤 Saving lab and theory schedules to original files...');
        
        // Save both lab and theory schedules to original files
        const savePromises = [
            saveJsonToServer(labData, './output/combined_lab_schedule.json'),
            saveJsonToServer(theoryData, './output/combined_theory_schedule.json')
        ];
        
        const results = await Promise.all(savePromises);
        
        console.log('✅ All files saved to original location successfully');
        console.log(`   - Lab sessions: ${labData.length} saved`);
        console.log(`   - Theory sessions: ${theoryData.length} saved`);
        
        return results;
        
    } catch (error) {
        console.error('❌ Error saving updated JSON files:', error);
        throw new Error(`Failed to save files to original location: ${error.message}`);
    }
}

// Save JSON data directly to server via API
async function saveJsonToServer(data, filepath) {
    console.log(`📡 Sending ${data.length} sessions to ${filepath}...`);
    
    const response = await fetch('/api/save-schedule', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            data: data,
            filepath: filepath
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error (${response.status}): ${errorText}`);
    }
    
    const result = await response.json();
    console.log(`✅ ${filepath}: ${result.message}`);
    
    return result;
}

// Download JSON file to user's computer
function downloadJsonFile(data, filename) {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
}

// Show instructions for manual file replacement
function showSaveInstructions() {
    const instructionsModal = document.createElement('div');
    instructionsModal.className = 'modal fade';
    instructionsModal.id = 'saveInstructionsModal';
    instructionsModal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header bg-warning text-dark">
                    <h5 class="modal-title">
                        <i class="fas fa-download me-2"></i>
                        Manual File Update Required
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle me-2"></i>
                        <strong>Your changes have been downloaded as JSON files.</strong> 
                        Please replace the original files to persist your changes.
                    </div>
                    
                    <h6>📋 Instructions:</h6>
                    <ol class="list-group list-group-numbered">
                        <li class="list-group-item">
                            <strong>Locate the downloaded files:</strong>
                            <ul class="mt-2">
                                <li><code>combined_lab_schedule.json</code></li>
                                <li><code>combined_theory_schedule.json</code></li>
                                <li><code>combined_lab_schedule_backup_[timestamp].json</code> (backup)</li>
                                <li><code>combined_theory_schedule_backup_[timestamp].json</code> (backup)</li>
                            </ul>
                        </li>
                        <li class="list-group-item">
                            <strong>Replace the original files:</strong>
                            <br>Copy the downloaded files to: <code>./output/</code> directory
                        </li>
                        <li class="list-group-item">
                            <strong>Keep backups safe:</strong>
                            <br>Store the backup files in a secure location
                        </li>
                    </ol>
                    
                    <div class="alert alert-success mt-3">
                        <i class="fas fa-shield-alt me-2"></i>
                        <strong>Backup files created automatically</strong> - Your original data is safe!
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-primary" onclick="downloadAllFiles()">
                        <i class="fas fa-download me-1"></i>
                        Download All Files Again
                    </button>
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                        Got It
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(instructionsModal);
    
    const modal = new bootstrap.Modal(instructionsModal);
    modal.show();
    
    // Cleanup when modal is hidden
    instructionsModal.addEventListener('hidden.bs.modal', () => {
        instructionsModal.remove();
    });
}

// Download all files again
function downloadAllFiles() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    
    // Download updated files
    downloadJsonFile(labData, 'combined_lab_schedule.json');
    downloadJsonFile(theoryData, 'combined_theory_schedule.json');
    
    // Download backup files
    downloadJsonFile(labData, `combined_lab_schedule_backup_${timestamp}.json`);
    downloadJsonFile(theoryData, `combined_theory_schedule_backup_${timestamp}.json`);
    
    showSuccessAlert('All files downloaded successfully!');
}

// ==== BACKUP MANAGEMENT FUNCTIONS ====

// List all available backups
function listAvailableBackups() {
    const backups = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('schedule_backup_')) {
            try {
                const backup = JSON.parse(localStorage.getItem(key));
                backups.push({
                    key: key,
                    timestamp: backup.timestamp,
                    labSessions: backup.lab.length,
                    theorySessions: backup.theory.length
                });
            } catch (e) {
                console.warn('Invalid backup found:', key);
            }
        }
    }
    return backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// Restore from backup
function restoreFromBackup(backupKey) {
    try {
        const backupData = JSON.parse(localStorage.getItem(backupKey));
        if (!backupData) {
            throw new Error('Backup not found');
        }
        
        // Restore data
        labData = [...backupData.lab];
        theoryData = [...backupData.theory];
        allData = [...labData, ...theoryData];
        
        // Refresh UI
        renderContent();
        
        showSuccessAlert(`Restored from backup: ${backupData.timestamp}`);
        
    } catch (error) {
        console.error('Error restoring backup:', error);
        showErrorAlert('Failed to restore backup: ' + error.message);
    }
}

// ==== UI INTEGRATION FUNCTIONS ====

// Add backup management UI
function showBackupManager() {
    const backups = listAvailableBackups();
    
    const backupModal = document.createElement('div');
    backupModal.className = 'modal fade';
    backupModal.id = 'backupManagerModal';
    backupModal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header bg-primary text-white">
                    <h5 class="modal-title">
                        <i class="fas fa-history me-2"></i>
                        Backup Manager
                    </h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    ${backups.length === 0 ? `
                        <div class="alert alert-info text-center">
                            <i class="fas fa-info-circle me-2"></i>
                            No backups available. Backups are created automatically when you make changes.
                        </div>
                    ` : `
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>Timestamp</th>
                                        <th>Lab Sessions</th>
                                        <th>Theory Sessions</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${backups.map(backup => `
                                        <tr>
                                            <td>
                                                <small class="text-muted">${backup.timestamp.replace('T', ' ')}</small>
                                            </td>
                                            <td>
                                                <span class="badge bg-info">${backup.labSessions}</span>
                                            </td>
                                            <td>
                                                <span class="badge bg-success">${backup.theorySessions}</span>
                                            </td>
                                            <td>
                                                <button class="btn btn-sm btn-outline-primary me-1" 
                                                        onclick="restoreFromBackup('${backup.key}')">
                                                    <i class="fas fa-undo me-1"></i>Restore
                                                </button>
                                                <button class="btn btn-sm btn-outline-danger" 
                                                        onclick="deleteBackup('${backup.key}')">
                                                    <i class="fas fa-trash me-1"></i>Delete
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline-warning" onclick="clearAllBackups()">
                        <i class="fas fa-trash-alt me-1"></i>
                        Clear All Backups
                    </button>
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(backupModal);
    
    const modal = new bootstrap.Modal(backupModal);
    modal.show();
    
    // Cleanup when modal is hidden
    backupModal.addEventListener('hidden.bs.modal', () => {
        backupModal.remove();
    });
}

// Delete a specific backup
function deleteBackup(backupKey) {
    if (confirm('Are you sure you want to delete this backup?')) {
        localStorage.removeItem(backupKey);
        showSuccessAlert('Backup deleted successfully');
        
        // Refresh backup manager if open
        const modal = document.getElementById('backupManagerModal');
        if (modal) {
            bootstrap.Modal.getInstance(modal).hide();
            setTimeout(() => showBackupManager(), 300);
        }
    }
}

// Clear all backups
function clearAllBackups() {
    if (confirm('Are you sure you want to delete ALL backups? This action cannot be undone.')) {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('schedule_backup_')) {
                keys.push(key);
            }
        }
        
        keys.forEach(key => localStorage.removeItem(key));
        
        showSuccessAlert(`${keys.length} backups cleared successfully`);
        
        // Refresh backup manager
        const modal = document.getElementById('backupManagerModal');
        if (modal) {
            bootstrap.Modal.getInstance(modal).hide();
            setTimeout(() => showBackupManager(), 300);
        }
    }
}

function initializeUI() {
    const filters = {
        department: [...new Set(allData.map(i => i.department).filter(Boolean))].sort(),
        semester: [...new Set(allData.map(i => i.semester).filter(Boolean))].sort((a, b) => a - b),
        group: [...new Set(allData.map(i => i.group_name).filter(Boolean))].sort()
    };
    const addOptions = (id, data, textFn) => {
        const select = document.getElementById(id);
        data.forEach(item => select.add(new Option(textFn(item), item)));
    };
    addOptions('departmentFilter', filters.department, d => d);
    addOptions('semesterFilter', filters.semester, s => `Semester ${s}`);
    addOptions('groupFilter', filters.group, g => g.replace(/_/g, ' '));

    updateDaysFromData();
    updateSummaryStats();
    
    document.querySelectorAll('#viewType, #departmentFilter, #semesterFilter, #groupFilter, #dayPatternFilter').forEach(el => el.addEventListener('change', renderContent));
    document.querySelectorAll('#courseSearch, #teacherSearch, #roomSearch').forEach(el => el.addEventListener('input', debounce(renderContent, 300)));

    renderContent();
}

function updateDaysFromData() {
    const allDaysInData = new Set(allData.map(item => item.day));
    days = ['monday', 'tuesday', 'wed', 'thur', 'fri', 'saturday'].filter(day => allDaysInData.has(day));
}

function updateSummaryStats() {
    document.getElementById('totalSessions').textContent = allData.length;
    document.getElementById('labSessions').textContent = labData.length;
    document.getElementById('theorySessions').textContent = theoryData.length;
    document.getElementById('totalTeachers').textContent = new Set(allData.map(i => i.teacher_id)).size;
    document.getElementById('totalRooms').textContent = new Set(allData.map(i => i.room_id)).size;
}

function getFilteredData() {
    const vals = {
        department: document.getElementById('departmentFilter').value,
        semester: document.getElementById('semesterFilter').value,
        group: document.getElementById('groupFilter').value,
        dayPattern: document.getElementById('dayPatternFilter').value,
        course: document.getElementById('courseSearch').value.toLowerCase(),
        teacher: document.getElementById('teacherSearch').value.toLowerCase(),
        room: document.getElementById('roomSearch').value.toLowerCase()
    };
    return allData.filter(i => 
        (!vals.department || i.department === vals.department) &&
        (!vals.semester || i.semester == vals.semester) &&
        (!vals.group || i.group_name === vals.group) &&
        (!vals.dayPattern || i.day_pattern === vals.dayPattern) &&
        (!vals.course || (i.course_code || '').toLowerCase().includes(vals.course) || (i.course_name || '').toLowerCase().includes(vals.course)) &&
        (!vals.teacher || (i.teacher_name || '').toLowerCase().includes(vals.teacher)) &&
        (!vals.room || (i.room_number || '').toLowerCase().includes(vals.room))
    );
}

function renderContent() {
    const viewType = document.getElementById('viewType').value;
    const filteredData = getFilteredData();
    const renderMap = { department: renderDepartmentView, semester: renderSemesterView, room: renderRoomView, teacher: renderTeacherView, day: renderDayView };
    if (renderMap[viewType]) renderMap[viewType](filteredData);
}

const renderBy = (data, key, titleFn) => {
    const items = [...new Set(data.map(i => i[key]))].sort();
    return items.map(item => {
        const itemData = data.filter(i => i[key] === item);
        return `<div class="card mb-4">
                    <div class="card-header"><h5 class="mb-0">${titleFn(item, itemData)}</h5></div>
                    <div class="card-body">${generateScheduleTable(itemData)}</div>
                </div>`;
    }).join('') || '<div class="alert alert-info">No data matches the current filters.</div>';
};

const renderDepartmentView = (data) => document.getElementById('mainContent').innerHTML = renderBy(data, 'department', (d, dData) => `${d} <span class="badge bg-light text-dark ms-2">${dData.length} sessions</span>`);
const renderSemesterView = (data) => document.getElementById('mainContent').innerHTML = renderBy(data, 'semester', (s, sData) => `Semester ${s} <span class="badge bg-light text-dark ms-2">${sData.length} sessions</span>`);
const renderRoomView = (data) => document.getElementById('mainContent').innerHTML = renderBy(data, 'room_number', (r, rData) => `${r} <span class="badge bg-light text-dark ms-2">${rData.length} sessions</span>`);
const renderDayView = (data) => document.getElementById('mainContent').innerHTML = renderBy(data, 'day', (d, dData) => `${d.charAt(0).toUpperCase() + d.slice(1)} <span class="badge bg-info ms-2">${dData.filter(i=>i.schedule_type==='lab').length} Labs</span> <span class="badge bg-success">${dData.filter(i=>i.schedule_type==='theory').length} Theory</span>`);

function renderTeacherView(data) {
    const teachers = [...new Set(data.map(item => `${item.teacher_name}|${item.staff_code}`))].sort();
    let html = teachers.map(teacherInfo => {
        const [teacherName, staffCode] = teacherInfo.split('|');
        if (!teacherName || teacherName === 'Unknown') return '';
        const teacherData = data.filter(item => item.teacher_name === teacherName);
        const shiftInfo = teacherShiftData[staffCode] || null;
        return `
            <div class="card mb-4">
                <div class="card-header">
                    <div class="d-flex justify-content-between align-items-center">
                        <h5 class="mb-0"><i class="fas fa-user-tie me-2"></i>${teacherName} (${staffCode || 'N/A'})</h5>
                        <button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="collapse" 
                                data-bs-target="#shiftPanel-${staffCode?.replace(/[^a-zA-Z0-9]/g, '_')}" aria-expanded="true">
                            <i class="fas fa-tachometer-alt me-1"></i>Shift Dashboard
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="row g-3">
                        <div class="col-lg-8">${generateScheduleTable(teacherData)}</div>
                        <div class="col-lg-4">
                            <div class="collapse show" id="shiftPanel-${staffCode?.replace(/[^a-zA-Z0-9]/g, '_')}">
                                ${generateShiftPanel(shiftInfo, staffCode)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    }).join('');
    document.getElementById('mainContent').innerHTML = html || '<div class="alert alert-info">No teachers match the current filters.</div>';
}

function generateShiftPanel(shiftInfo, staffCode) {
    if (!shiftInfo) {
        return `<div class="card border-light h-100"><div class="card-header bg-secondary text-white"><h6 class="mb-0"><i class="fas fa-info-circle me-2"></i>Shift Information</h6></div><div class="card-body text-center text-muted d-flex align-items-center justify-content-center"><div><p>No shift data available for staff code: <strong>${staffCode || 'N/A'}</strong></p><small>Run the report generator.</small></div></div></div>`;
    }

    const categories = [ { id: 'optimal', name: 'Optimal', color: 'success' }, { id: 'medium', name: 'Medium', color: 'warning' }, { id: 'violation', name: 'Violation', color: 'danger' }];
    const leaveInstances = shiftInfo.leave_time_instances || { leave_3pm: 0, leave_5pm: 0, leave_7pm: 0 };
    const consistencyScore = shiftInfo.shift_consistency_score || 0;

    let html = `
        <div class="card border-primary h-100">
            <div class="card-header bg-primary text-white"><h6 class="mb-0"><i class="fas fa-tachometer-alt me-2"></i>Shift Dashboard</h6></div>
            <div class="card-body p-3">
                <div class="row mb-3 text-center">
                    <div class="col-6 border-end"><div class="h4 fw-bold text-primary">${shiftInfo.total_sessions}</div><small class="text-muted">Total Sessions</small></div>
                    <div class="col-6"><div class="h4 fw-bold text-success">${shiftInfo.days_worked}</div><small class="text-muted">Days Worked</small></div>
                </div>
                <h6 class="mb-2 small text-muted text-uppercase fw-bold"><i class="fas fa-chart-pie me-1"></i>Shift Distribution</h6>
                <div class="mb-3">`;

    categories.forEach(category => {
        const count = shiftInfo.shift_distribution?.[category.id] || 0;
        const percentage = shiftInfo.days_worked > 0 ? (count / shiftInfo.days_worked * 100).toFixed(0) : 0;
        html += `<div class="mb-2">
                    <div class="d-flex justify-content-between"><span class="small">${category.name}</span><span class="small fw-bold">${count} (${percentage}%)</span></div>
                    <div class="progress" style="height: 8px;"><div class="progress-bar bg-${category.color}" style="width: ${percentage}%"></div></div>
                </div>`;
    });

    html += `</div>
            <h6 class="mb-2 small text-muted text-uppercase fw-bold"><i class="fas fa-door-open me-1"></i>Daily Leave Times</h6>
            <div class="row text-center g-2 mb-3">
                <div class="col-4"><div class="p-2 rounded ${leaveInstances.leave_3pm > 0 ? 'bg-success text-white' : 'bg-light'}"><div class="fw-bold">3PM</div><small>${leaveInstances.leave_3pm} days</small></div></div>
                <div class="col-4"><div class="p-2 rounded ${leaveInstances.leave_5pm > 0 ? 'bg-warning text-dark' : 'bg-light'}"><div class="fw-bold">5PM</div><small>${leaveInstances.leave_5pm} days</small></div></div>
                <div class="col-4"><div class="p-2 rounded ${leaveInstances.leave_7pm > 0 ? 'bg-danger text-white' : 'bg-light'}"><div class="fw-bold">7PM</div><small>${leaveInstances.leave_7pm} days</small></div></div>
            </div>
            <h6 class="mb-2 small text-muted text-uppercase fw-bold"><i class="fas fa-hourglass-half me-1"></i>Work Hours</h6>
            <div class="row text-center mb-3">
                <div class="col-6"><div class="small text-muted">Earliest Start</div><div class="fw-bold text-primary">${shiftInfo.work_hours?.earliest_start || 'N/A'}</div></div>
                <div class="col-6"><div class="small text-muted">Latest End</div><div class="fw-bold text-danger">${shiftInfo.work_hours?.latest_end || 'N/A'}</div></div>
            </div>
            <h6 class="mb-2 small text-muted text-uppercase fw-bold"><i class="fas fa-bullseye me-1"></i>Shift Consistency (Optimal Days)</h6>
            <div class="d-flex justify-content-between align-items-center">
                <div class="progress flex-grow-1 me-2" style="height: 8px;"><div class="progress-bar bg-info" style="width: ${consistencyScore.toFixed(0)}%"></div></div>
                <span class="badge bg-info rounded-pill">${consistencyScore.toFixed(0)}%</span>
            </div>
        </div></div>`;
    return html;
}

function generateScheduleTable(data) {
    if (data.length === 0) {
        return '<div class="alert alert-info">No sessions found for the selected filters.</div>';
    }

    // Determine which days to use based on the data being displayed
    const daysInData = [...new Set(data.map(item => item.day))];
    const dayOrder = ['monday', 'tuesday', 'wed', 'thur', 'fri', 'saturday'];
    const currentDays = dayOrder.filter(day => daysInData.includes(day));
    
    // Show day pattern information if available
    const dayPatterns = [...new Set(data.map(item => item.day_pattern).filter(Boolean))];
    
    // Create separate grids for theory and lab sessions
    const theoryGrid = {};
    const labGrid = {};
    
    // Initialize grids with appropriate time slots for each type
    currentDays.forEach(day => {
        theoryGrid[day] = {};
        labGrid[day] = {};
        
        // Theory sessions use 50-minute slots
        timeSlots.forEach(slot => {
            theoryGrid[day][slot] = [];
        });
        
        // Lab sessions use extended slots
        Object.values(labSessions).forEach(slot => {
            labGrid[day][slot] = [];
        });
    });

    // Fill grids with data - separate theory and lab sessions
    data.forEach(item => {
        const day = item.day;
        
        if (item.schedule_type === 'lab') {
            // Lab sessions go into lab grid
            const timeKey = labSessions[item.session_name] || item.time_range;
            if (labGrid[day] && labGrid[day][timeKey]) {
                labGrid[day][timeKey].push(item);
            }
        } else if (item.schedule_type === 'theory') {
            // Theory sessions go into theory grid
            const timeKey = item.time_slot;
            if (theoryGrid[day] && theoryGrid[day][timeKey]) {
                theoryGrid[day][timeKey].push(item);
            }
        }
    });

    // Generate table HTML with day pattern info
    let html = '';
    
    // Add day pattern information header if available
    if (dayPatterns.length > 0) {
        html += `
            <div class="alert alert-info mb-3">
                <i class="fas fa-calendar-week me-2"></i>
                <strong>Day Pattern${dayPatterns.length > 1 ? 's' : ''}:</strong> 
                ${dayPatterns.join(', ')}
                <span class="ms-3">
                    <i class="fas fa-calendar-day me-1"></i>
                    <strong>Days:</strong> ${currentDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}
                </span>
            </div>
        `;
    }
    
    html += `
        <div class="table-responsive">
            <table class="table table-bordered schedule-table">
                <thead>
                    <tr>
                        <th style="width: 120px;">Time</th>
    `;

    currentDays.forEach(day => {
        html += `<th>${day.charAt(0).toUpperCase() + day.slice(1)}</th>`;
    });

    html += `
                    </tr>
                </thead>
                <tbody>
    `;

    // Get used time slots for theory and lab separately
    const usedTheorySlots = new Set();
    const usedLabSlots = new Set();
    
    // Check theory grid for used slots
    Object.values(theoryGrid).forEach(daySchedule => {
        Object.keys(daySchedule).forEach(timeSlot => {
            if (daySchedule[timeSlot].length > 0) {
                usedTheorySlots.add(timeSlot);
            }
        });
    });
    
    // Check lab grid for used slots
    Object.values(labGrid).forEach(daySchedule => {
        Object.keys(daySchedule).forEach(timeSlot => {
            if (daySchedule[timeSlot].length > 0) {
                usedLabSlots.add(timeSlot);
            }
        });
    });

    // Sort theory and lab slots separately
    const sortedTheorySlots = Array.from(usedTheorySlots).sort((a, b) => {
        return parseTimeSlot(a) - parseTimeSlot(b);
    });
    
    const sortedLabSlots = Array.from(usedLabSlots).sort((a, b) => {
        return parseTimeSlot(a) - parseTimeSlot(b);
    });

    // Render theory sessions first
    if (sortedTheorySlots.length > 0) {
        html += `
            <tr class="table-section-header">
                <td colspan="${currentDays.length + 1}" class="text-center" style="background-color: #e8f4fd; font-weight: bold; padding: 10px;">
                    <i class="fas fa-chalkboard me-2"></i>THEORY SESSIONS
                </td>
            </tr>
        `;
        
        sortedTheorySlots.forEach(timeSlot => {
            html += `<tr><td class="time-header"><strong>${timeSlot}</strong></td>`;
            
            currentDays.forEach(day => {
                const sessions = theoryGrid[day][timeSlot] || [];
                html += `<td class="drop-zone" data-day="${day}" data-time-slot="${timeSlot}" data-session-type="theory"
                            ondragover="handleDragOver(event)" 
                            ondragenter="handleDragEnter(event)" 
                            ondragleave="handleDragLeave(event)" 
                            ondrop="handleDrop(event)">`;
                
                sessions.forEach(session => {
                    const isBatched = session.is_batched;
                    const sessionClass = 'theory-session';
                    const batchClass = isBatched ? 'batched-session' : '';
                    
                    // Get group and department colors
                    const groupClass = getGroupClass(session.group_name);
                    const deptClass = getDeptClass(session.department);
                    const semester = getSemesterFromGroupName(session.group_name) || `S${session.semester}`;
                    
                    // Extract group number for display
                    const groupNumber = session.group_name ? session.group_name.match(/_G(\d+)$/)?.[1] || '' : '';
                    
                    const sessionIndex = allData.indexOf(session);
                    html += `
                        <div class="${sessionClass} ${batchClass} ${deptClass} editable-session draggable-session" 
                             data-session-index="${sessionIndex}"
                             data-day="${session.day}"
                             data-time-slot="${timeSlot}"
                             data-session-type="theory"
                             draggable="true"
                             onclick="openQuickEdit(${sessionIndex})"
                             onmouseover="showSessionTooltip(event, ${sessionIndex})"
                             onmouseout="hideSessionTooltip()"
                             ondragstart="handleDragStart(event, ${sessionIndex})"
                             ondragend="handleDragEnd(event)"
                             title="Drag to move • Click to edit • Course: ${session.course_name} • Teacher: ${session.teacher_name} • Room: ${session.room_number}">
                            <div class="session-header">
                                <div class="session-code">${session.course_code_display || session.course_code}</div>
                                ${groupNumber ? `<div class="group-number ${groupClass}">G${groupNumber}</div>` : ''}
                            </div>
                            <div class="session-teacher">${session.teacher_name}</div>
                            <div class="session-room">${session.room_number}</div>
                            <div class="semester-indicator">${semester}</div>
                            <div class="drag-handle">
                                <i class="fas fa-grip-vertical"></i>
                            </div>
                        </div>
                    `;
                });
                
                html += '</td>';
            });
            
            html += '</tr>';
        });
    }

    // Render lab sessions after theory sessions
    if (sortedLabSlots.length > 0) {
        html += `
            <tr class="table-section-divider">
                <td colspan="${currentDays.length + 1}" class="text-center" style="background-color: #f8f9fa; font-weight: bold; padding: 10px;">
                    <i class="fas fa-flask me-2"></i>LAB SESSIONS
                </td>
            </tr>
        `;
        
        sortedLabSlots.forEach(timeSlot => {
            html += `<tr><td class="time-header"><strong>${timeSlot}</strong></td>`;
            
            currentDays.forEach(day => {
                const sessions = labGrid[day][timeSlot] || [];
                html += `<td class="drop-zone" data-day="${day}" data-time-slot="${timeSlot}" data-session-type="lab"
                            ondragover="handleDragOver(event)" 
                            ondragenter="handleDragEnter(event)" 
                            ondragleave="handleDragLeave(event)" 
                            ondrop="handleDrop(event)">`;
                
                sessions.forEach(session => {
                    const isBatched = session.is_batched;
                    const sessionClass = 'lab-session';
                    const batchClass = isBatched ? 'batched-session' : '';
                    
                    // Get group and department colors
                    const groupClass = getGroupClass(session.group_name);
                    const deptClass = getDeptClass(session.department);
                    const semester = getSemesterFromGroupName(session.group_name) || `S${session.semester}`;
                    
                    // Extract group number for display
                    const groupNumber = session.group_name ? session.group_name.match(/_G(\d+)$/)?.[1] || '' : '';
                    
                    const sessionIndex = allData.indexOf(session);
                    html += `
                        <div class="${sessionClass} ${batchClass} ${deptClass} editable-session draggable-session" 
                             data-session-index="${sessionIndex}"
                             data-day="${session.day}"
                             data-time-slot="${timeSlot}"
                             data-session-type="lab"
                             draggable="true"
                             onclick="openQuickEdit(${sessionIndex})"
                             onmouseover="showSessionTooltip(event, ${sessionIndex})"
                             onmouseout="hideSessionTooltip()"
                             ondragstart="handleDragStart(event, ${sessionIndex})"
                             ondragend="handleDragEnd(event)"
                             title="Drag to move • Click to edit • Course: ${session.course_name} • Teacher: ${session.teacher_name} • Room: ${session.room_number}">
                            <div class="session-header">
                                <div class="session-code">${session.course_code_display || session.course_code}</div>
                                ${groupNumber ? `<div class="group-number ${groupClass}">G${groupNumber}</div>` : ''}
                            </div>
                            <div class="session-teacher">${session.teacher_name}</div>
                            <div class="session-room">${session.room_number}</div>
                            <div class="semester-indicator">${semester}</div>
                            <div class="drag-handle">
                                <i class="fas fa-grip-vertical"></i>
                            </div>
                        </div>
                    `;
                });
                
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

const parseTimeSlot = (slot) => {
    if (!slot) return 9999;
    const [h, m] = slot.split(' - ')[0].trim().split(':').map(Number);
    return ((h >= 1 && h <= 7) ? h + 12 : h) * 60 + (m || 0);
};
const debounce = (fn, delay) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; };
const openShiftReports = () => window.open('shift_reports_viewer.html', '_blank');

// Conflict Detection Functionality
let detectedConflicts = [];

function detectConflicts() {
    const conflictBtn = document.getElementById('conflictBtn');
    const clearBtn = document.getElementById('clearBtn');
    const conflictStats = document.getElementById('conflictStats');
    const totalConflicts = document.getElementById('totalConflicts');

    // Show loading state
    conflictBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Detecting...';
    conflictBtn.disabled = true;

    // Reset conflicts
    detectedConflicts = [];
    clearConflictHighlights();

    // 🔧 STEP 1: Detect and handle duplicates first
    detectAndHandleDuplicates();

    // Detect different types of conflicts
    detectTeacherConflicts();
    detectRoomConflicts();
    detectGroupConflicts();
    detectCapacityViolations();

    // Update UI
    totalConflicts.textContent = detectedConflicts.length;
    conflictStats.style.display = detectedConflicts.length > 0 ? 'block' : 'none';

    // Show/hide buttons
    conflictBtn.innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i>Conflicts Found';
    conflictBtn.disabled = false;
    clearBtn.style.display = detectedConflicts.length > 0 ? 'inline-block' : 'none';

    // Highlight conflicts in the schedule
    highlightConflicts();

    // Show conflict panel if conflicts found
    if (detectedConflicts.length > 0) {
        showConflictPanel();
    }

    console.log(`Conflict detection complete. Found ${detectedConflicts.length} conflicts.`);
}

// Detect and handle duplicate sessions
function detectAndHandleDuplicates() {
    const duplicateGroups = new Map();
    const duplicatesToRemove = [];
    
    // Group sessions by key properties to find duplicates
    allData.forEach((session, index) => {
        const timeKey = session.schedule_type === 'lab' ? session.time_range : session.time_slot;
        const key = `${session.course_code}_${session.teacher_id}_${session.room_id}_${session.day}_${timeKey}_${session.group_name}_${session.schedule_type}`;
        
        if (!duplicateGroups.has(key)) {
            duplicateGroups.set(key, []);
        }
        duplicateGroups.get(key).push({ session, index });
    });
    
    // Identify duplicates
    duplicateGroups.forEach((sessions, key) => {
        if (sessions.length > 1) {
            // Add to conflicts as a warning
            detectedConflicts.push({
                type: 'duplicate_sessions',
                severity: 'warning',
                message: `🔧 Found ${sessions.length} duplicate sessions: ${sessions[0].session.course_code} - ${sessions[0].session.teacher_name}`,
                sessions: sessions.map(s => ({ ...s.session, originalIndex: s.index })),
                details: {
                    course: sessions[0].session.course_code,
                    teacher: sessions[0].session.teacher_name,
                    room: sessions[0].session.room_number,
                    time: sessions[0].session.schedule_type === 'lab' ? sessions[0].session.time_range : sessions[0].session.time_slot,
                    day: sessions[0].session.day,
                    group: sessions[0].session.group_name,
                    duplicateCount: sessions.length,
                    action: 'Keep first instance, remove duplicates'
                }
            });
            
            // Mark indices for removal (keep first, remove others)
            for (let i = 1; i < sessions.length; i++) {
                duplicatesToRemove.push(sessions[i].index);
            }
        }
    });
    
    // Remove duplicates (in reverse order to maintain indices)
    duplicatesToRemove.sort((a, b) => b - a).forEach(index => {
        const removedSession = allData[index];
        
        // Remove from main data array
        allData.splice(index, 1);
        
        // Remove from appropriate sub-array
        if (removedSession.schedule_type === 'lab') {
            const labIndex = labData.indexOf(removedSession);
            if (labIndex >= 0) {
                labData.splice(labIndex, 1);
            }
        } else {
            const theoryIndex = theoryData.indexOf(removedSession);
            if (theoryIndex >= 0) {
                theoryData.splice(theoryIndex, 1);
            }
        }
    });
    
    if (duplicatesToRemove.length > 0) {
        console.log(`🔧 Removed ${duplicatesToRemove.length} duplicate sessions from dataset`);
        
        // Update summary stats after removing duplicates
        updateSummaryStats();
    }
}

function detectTeacherConflicts() {
    const teacherSchedule = {};

    allData.forEach((session, index) => {
        const timeKey = session.schedule_type === 'lab' ? session.time_range : session.time_slot;
        const key = `${session.teacher_id}_${session.day}_${timeKey}`;

        if (!teacherSchedule[key]) {
            teacherSchedule[key] = [];
        }
        teacherSchedule[key].push({ ...session, originalIndex: index });
    });

    // Find conflicts
    Object.entries(teacherSchedule).forEach(([key, sessions]) => {
        if (sessions.length > 1) {
            detectedConflicts.push({
                type: 'teacher_conflict',
                severity: 'high',
                message: `Teacher ${sessions[0].teacher_name} has multiple sessions at the same time`,
                sessions: sessions,
                details: {
                    teacher: sessions[0].teacher_name,
                    day: sessions[0].day,
                    time: sessions[0].schedule_type === 'lab' ? sessions[0].time_range : sessions[0].time_slot,
                    conflictingSessions: sessions.length
                }
            });
        }
    });
}

function detectRoomConflicts() {
    const roomSchedule = {};

    allData.forEach((session, index) => {
        const timeKey = session.schedule_type === 'lab' ? session.time_range : session.time_slot;
        const key = `${session.room_id}_${session.day}_${timeKey}`;

        if (!roomSchedule[key]) {
            roomSchedule[key] = [];
        }
        roomSchedule[key].push({ ...session, originalIndex: index });
    });

    // Find conflicts
    Object.entries(roomSchedule).forEach(([key, sessions]) => {
        if (sessions.length > 1) {
            detectedConflicts.push({
                type: 'room_conflict',
                severity: 'high',
                message: `Room ${sessions[0].room_number} has multiple sessions at the same time`,
                sessions: sessions,
                details: {
                    room: sessions[0].room_number,
                    day: sessions[0].day,
                    time: sessions[0].schedule_type === 'lab' ? sessions[0].time_range : sessions[0].time_slot,
                    conflictingSessions: sessions.length
                }
            });
        }
    });
}

function detectGroupConflicts() {
    const groupSchedule = {};

    allData.forEach((session, index) => {
        const timeKey = session.schedule_type === 'lab' ? session.time_range : session.time_slot;
        const key = `${session.group_name}_${session.day}_${timeKey}`;

        if (!groupSchedule[key]) {
            groupSchedule[key] = [];
        }
        groupSchedule[key].push({ ...session, originalIndex: index });
    });

    // ❌ STRICT GROUP RULE: No group overlaps allowed
    // - Lab and theory sessions for same group cannot overlap
    // - Any overlap is treated as a high-severity conflict
    Object.entries(groupSchedule).forEach(([key, sessions]) => {
        if (sessions.length > 1) {
            const [groupName, day, timeSlot] = key.split('_');
            const courseCodes = sessions.map(s => s.course_code);
            const sessionTypes = sessions.map(s => s.schedule_type);
            
            // ❌ GROUP CONFLICT: Multiple sessions for same group at same time
            detectedConflicts.push({
                type: 'group_conflict',
                severity: 'high',
                message: `Group ${groupName.replace(/_/g, ' ')} has ${sessions.length} overlapping sessions at ${day} ${timeSlot}: ${courseCodes.join(', ')} (${sessionTypes.join(', ')})`,
                sessions: sessions,
                details: {
                    group: groupName,
                    day: day,
                    timeSlot: timeSlot,
                    sessionCount: sessions.length,
                    courseCodes: courseCodes,
                    sessionTypes: sessionTypes,
                    rule: 'No group overlaps allowed'
                }
            });
        }
    });
}

function detectCapacityViolations() {
    allData.forEach((session, index) => {
        if (session.student_count && session.capacity) {
            if (session.student_count > session.capacity) {
                detectedConflicts.push({
                    type: 'capacity_violation',
                    severity: 'medium',
                    message: `Room ${session.room_number} capacity exceeded (${session.student_count}/${session.capacity})`,
                    sessions: [{ ...session, originalIndex: index }],
                    details: {
                        room: session.room_number,
                        capacity: session.capacity,
                        students: session.student_count,
                        overflow: session.student_count - session.capacity
                    }
                });
            }
        }
    });
}

function highlightConflicts() {
    // Clear existing highlights
    clearConflictHighlights();

    // Highlight conflicting sessions
    detectedConflicts.forEach(conflict => {
        conflict.sessions.forEach(session => {
            const sessionElements = document.querySelectorAll('.lab-session, .theory-session');
            sessionElements.forEach(element => {
                const sessionText = element.textContent;
                if (sessionText.includes(session.course_code) && 
                    sessionText.includes(session.teacher_name) &&
                    sessionText.includes(session.room_number)) {
                    
                    element.classList.add(conflict.severity === 'high' ? 'conflict-session' : 'conflict-warning');
                    
                    // Add conflict indicator
                    const indicator = document.createElement('div');
                    indicator.className = 'conflict-indicator';
                    indicator.textContent = conflict.type === 'teacher_conflict' ? 'T' :
                                         conflict.type === 'room_conflict' ? 'R' : 'C';
                    indicator.title = conflict.message;
                    element.style.position = 'relative';
                    element.appendChild(indicator);
                }
            });
        });
    });
}

function clearConflictHighlights() {
    // Remove conflict classes and indicators
    document.querySelectorAll('.conflict-session, .conflict-warning').forEach(element => {
        element.classList.remove('conflict-session', 'conflict-warning');
        const indicator = element.querySelector('.conflict-indicator');
        if (indicator) {
            indicator.remove();
        }
    });
}

function clearConflicts() {
    detectedConflicts = [];
    clearConflictHighlights();
    
    // Update UI
    document.getElementById('totalConflicts').textContent = '0';
    document.getElementById('conflictStats').style.display = 'none';
    document.getElementById('clearBtn').style.display = 'none';
    document.getElementById('conflictBtn').innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i>Detect Conflicts';
    
    // Hide conflict panel
    hideConflictPanel();
}

function showConflictPanel() {
    const panel = document.getElementById('conflictPanel');
    const conflictList = document.getElementById('conflictList');
    
    // Populate conflict list
    let html = '';
    detectedConflicts.forEach((conflict, index) => {
        const severityBadge = conflict.severity === 'high' ? 'bg-danger' : 'bg-warning';
        html += `
            <div class="mb-2 p-2 border rounded ${conflict.severity === 'high' ? 'border-danger' : 'border-warning'}">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <small class="fw-bold">${conflict.message}</small>
                        <br>
                        <small class="text-muted">${conflict.type.replace('_', ' ').toUpperCase()}</small>
                    </div>
                    <span class="badge ${severityBadge}">${conflict.severity}</span>
                </div>
                <div class="mt-1">
                    <small><strong>Sessions:</strong></small>
                    ${conflict.sessions.map(session => `
                        <div class="text-muted" style="font-size: 0.75rem;">
                            ${session.course_code} - ${session.teacher_name} - ${session.room_number}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });
    
    conflictList.innerHTML = html;
    panel.classList.add('show');
}

function hideConflictPanel() {
    document.getElementById('conflictPanel').classList.remove('show');
}

function toggleConflictPanel() {
    const panel = document.getElementById('conflictPanel');
    if (panel.classList.contains('show')) {
        hideConflictPanel();
    } else {
        showConflictPanel();
    }
}

document.addEventListener('DOMContentLoaded', loadData);

// Interactive Editing Functionality
let currentTooltip = null;

// Open quick edit interface for a session
function openQuickEdit(sessionIndex) {
    if (!window.allocationManager) {
        // Load allocation manager if not already loaded
        loadAllocationManager().then(() => {
            showQuickEditModal(sessionIndex);
        });
    } else {
        showQuickEditModal(sessionIndex);
    }
}

// Load allocation manager
async function loadAllocationManager() {
    if (!window.allocationManager) {
        // Import allocation manager
        const script = document.createElement('script');
        script.src = 'allocation_manager.js';
        document.head.appendChild(script);
        
        await new Promise((resolve) => {
            script.onload = () => {
                window.allocationManager = new AllocationManager();
                window.allocationManager.loadScheduleData().then(resolve);
            };
        });
    }
}

// Show quick edit modal
function showQuickEditModal(sessionIndex) {
    const session = allData[sessionIndex];
    if (!session) return;

    // Remove existing modal if any
    const existingModal = document.getElementById('quickEditModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Create quick edit modal
    const modal = document.createElement('div');
    modal.id = 'quickEditModal';
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">
                        <i class="fas fa-edit me-2"></i>
                        Quick Edit: ${session.course_code}
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <!-- Course Information Header -->
                    <div class="card bg-primary text-white mb-3">
                        <div class="card-body text-center">
                            <h5 class="mb-1">${session.course_code} - ${session.course_name || 'N/A'}</h5>
                            <small>Group: ${session.group_name} | Type: ${session.schedule_type.toUpperCase()}</small>
                        </div>
                    </div>

                    <!-- From → To Layout -->
                    <form id="quickEditForm">
                        <div class="row">
                            <!-- Day Change -->
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-bold">Day</label>
                                <div class="d-flex align-items-center">
                                    <div class="me-2">
                                        <small class="text-muted">From:</small>
                                        <div class="badge bg-light text-dark">${session.day.charAt(0).toUpperCase() + session.day.slice(1)}</div>
                                    </div>
                                    <i class="fas fa-arrow-right mx-2 text-muted"></i>
                                    <div class="flex-grow-1">
                                        <small class="text-muted">To:</small>
                                        <select class="form-control form-control-sm" id="quickEditDay" onchange="updateAvailability()">
                                            <option value="monday" ${session.day === 'monday' ? 'selected' : ''}>Monday</option>
                                            <option value="tuesday" ${session.day === 'tuesday' ? 'selected' : ''}>Tuesday</option>
                                            <option value="wed" ${session.day === 'wed' ? 'selected' : ''}>Wednesday</option>
                                            <option value="thur" ${session.day === 'thur' ? 'selected' : ''}>Thursday</option>
                                            <option value="fri" ${session.day === 'fri' ? 'selected' : ''}>Friday</option>
                                            <option value="saturday" ${session.day === 'saturday' ? 'selected' : ''}>Saturday</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <!-- Time Slot Change -->
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-bold">Time Slot</label>
                                <div class="d-flex align-items-center">
                                    <div class="me-2">
                                        <small class="text-muted">From:</small>
                                        <div class="badge bg-light text-dark">${getSessionTimeSlot(session)}</div>
                                    </div>
                                    <i class="fas fa-arrow-right mx-2 text-muted"></i>
                                    <div class="flex-grow-1">
                                        <small class="text-muted">To:</small>
                                        <select class="form-control form-control-sm" id="quickEditTimeSlot" onchange="updateAvailability()">
                                            <!-- Will be populated dynamically -->
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="row">
                            <!-- Teacher Change -->
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-bold">Teacher</label>
                                <div class="d-flex align-items-center">
                                    <div class="me-2 text-center" style="min-width: 120px;">
                                        <small class="text-muted">From:</small>
                                        <div class="badge bg-info text-wrap">${session.teacher_name}</div>
                                    </div>
                                    <i class="fas fa-arrow-right mx-2 text-muted"></i>
                                    <div class="flex-grow-1">
                                        <small class="text-muted">To:</small>
                                        <select class="form-control form-control-sm" id="quickEditTeacher" onchange="checkValidation()" onfocus="populateAvailableTeachers()">
                                            <option value="${session.teacher_id}">${session.teacher_name} (${session.staff_code})</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <!-- Room Change -->
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-bold">Room</label>
                                <div class="d-flex align-items-center">
                                    <div class="me-2 text-center" style="min-width: 120px;">
                                        <small class="text-muted">From:</small>
                                        <div class="badge bg-success text-wrap">${session.room_number} (${session.block})</div>
                                    </div>
                                    <i class="fas fa-arrow-right mx-2 text-muted"></i>
                                    <div class="flex-grow-1">
                                        <small class="text-muted">To:</small>
                                        <select class="form-control form-control-sm" id="quickEditRoom" onchange="checkValidation()" onfocus="populateAvailableRooms()">
                                            <option value="${session.room_id}">${session.room_number} (${session.block}) - Capacity: ${session.capacity}</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>

                    <!-- Validation Results -->
                    <div id="quickValidationResults" class="mt-3"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" id="quickSaveBtn" onclick="saveQuickEdit(${sessionIndex})" disabled>
                        <i class="fas fa-save me-1"></i>
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    
    // Initialize form
    populateQuickEditForm(session);
    
    // Show modal
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
    
    // Cleanup when modal is hidden
    modal.addEventListener('hidden.bs.modal', () => {
        modal.remove();
    });
}

// Get time slot for session
function getSessionTimeSlot(session) {
    if (session.schedule_type === 'lab') {
        return session.time_range || session.session_name;
    } else {
        return session.time_slot;
    }
}

// Populate quick edit form
function populateQuickEditForm(session) {
    // Populate time slots
    populateQuickTimeSlots(session.schedule_type, getSessionTimeSlot(session));
    
    // Populate teachers and rooms
    if (window.allocationManager) {
        populateQuickTeachers(session.teacher_id);
        populateQuickRooms(session.room_id, session.schedule_type);
        updateAvailability();
    }
}

// Populate time slots for quick edit
function populateQuickTimeSlots(sessionType, currentTimeSlot) {
    const timeSlotSelect = document.getElementById('quickEditTimeSlot');
    timeSlotSelect.innerHTML = '<option value="">Select Time Slot</option>';

    if (sessionType === 'lab') {
        const labSlots = {'L1': '8:00 - 9:40', 'L2': '10:00 - 11:40', 'L3': '11:50 - 1:20', 'L4': '1:20 - 3:00', 'L5': '3:00 - 4:40', 'L6': '5:10 - 6:50'};
        Object.entries(labSlots).forEach(([key, value]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = `${key} (${value})`;
            option.selected = (key === currentTimeSlot || value === currentTimeSlot);
            timeSlotSelect.appendChild(option);
        });
    } else {
        const theorySlots = ["8:00 - 8:50", "9:00 - 9:50", "10:00 - 10:50", "11:00 - 11:50", "12:00 - 12:50", "1:00 - 1:50", "2:00 - 2:50", "3:00 - 3:50", "4:00 - 4:50", "5:00 - 5:50", "6:00 - 6:50"];
        theorySlots.forEach(slot => {
            const option = document.createElement('option');
            option.value = slot;
            option.textContent = slot;
            option.selected = (slot === currentTimeSlot);
            timeSlotSelect.appendChild(option);
        });
    }
}

// Populate teachers for quick edit (initial setup - will be filtered by updateAvailability)
function populateQuickTeachers(currentTeacherId) {
    const teacherSelect = document.getElementById('quickEditTeacher');
    // Default option is already set in HTML with current teacher
    // This function is kept for compatibility but logic moved to populateAvailableTeachers
}

// Populate available teachers when dropdown is focused
function populateAvailableTeachers() {
    const teacherSelect = document.getElementById('quickEditTeacher');
    const day = document.getElementById('quickEditDay').value;
    const timeSlot = document.getElementById('quickEditTimeSlot').value;
    
    if (!day || !timeSlot || !window.allocationManager) return;
    
    // Get session info
    const saveBtn = document.getElementById('quickSaveBtn');
    const sessionIndex = parseInt(saveBtn.getAttribute('onclick').match(/\d+/)[0]);
    const session = allData[sessionIndex];
    
    const currentTeacherId = teacherSelect.value; // Preserve current selection
    const availableTeachers = window.allocationManager.getAvailableTeachers(day, timeSlot, session);
    
    // Clear and repopulate
    teacherSelect.innerHTML = '<option value="">Select Teacher</option>';
    
    // Always add current teacher first
    if (currentTeacherId) {
        const currentTeacher = Array.from(window.allocationManager.teachers)
            .map(teacherStr => JSON.parse(teacherStr))
            .find(teacher => teacher.id == currentTeacherId);
        
        if (currentTeacher) {
            const isAvailable = availableTeachers.some(t => t.id == currentTeacherId);
            const option = document.createElement('option');
            option.value = currentTeacher.id;
            option.textContent = `${currentTeacher.name} (${currentTeacher.staff_code}) ${isAvailable ? '✓' : '⚠️ (Busy)'}`;
            option.selected = true;
            option.style.fontWeight = 'bold';
            teacherSelect.appendChild(option);
        }
    }
    
    // Add available teachers
    availableTeachers.forEach(teacher => {
        if (teacher.id != currentTeacherId) {
            const option = document.createElement('option');
            option.value = teacher.id;
            option.textContent = `${teacher.name} (${teacher.staff_code})`;
            teacherSelect.appendChild(option);
        }
    });
    
    // Add separator and unavailable teachers
    const unavailableTeachers = Array.from(window.allocationManager.teachers)
        .map(teacherStr => JSON.parse(teacherStr))
        .filter(teacher => {
            if (teacher.id == currentTeacherId) return false;
            if (availableTeachers.some(t => t.id == teacher.id)) return false;
            return true;
        });
        
    if (unavailableTeachers.length > 0) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '─── Unavailable Teachers ───';
        teacherSelect.appendChild(separator);
        
        unavailableTeachers.forEach(teacher => {
            const option = document.createElement('option');
            option.value = teacher.id;
            option.textContent = `${teacher.name} (${teacher.staff_code}) - Busy`;
            option.style.color = '#999';
            teacherSelect.appendChild(option);
        });
    }
}

// Helper function to get room capacity with fallback
function getRoomCapacity(room) {
    if (room.capacity && room.capacity !== null && room.capacity !== undefined) {
        return room.capacity;
    }
    
    // Fallback based on room type
    const roomType = getRoomType(room.number);
    return roomType === 'lab' ? 35 : 70;
}



// Populate rooms for quick edit (initial setup - will be filtered by updateAvailability)
function populateQuickRooms(currentRoomId, sessionType) {
    const roomSelect = document.getElementById('quickEditRoom');
    // Default option is already set in HTML with current room
    // This function is kept for compatibility but logic moved to populateAvailableRooms
}

// Populate available rooms when dropdown is focused
function populateAvailableRooms() {
    const roomSelect = document.getElementById('quickEditRoom');
    const day = document.getElementById('quickEditDay').value;
    const timeSlot = document.getElementById('quickEditTimeSlot').value;
    
    if (!day || !timeSlot || !window.allocationManager) return;
    
    // Get session type from the save button onclick to extract session index
    const saveBtn = document.getElementById('quickSaveBtn');
    const sessionIndex = parseInt(saveBtn.getAttribute('onclick').match(/\d+/)[0]);
    const session = allData[sessionIndex];
    const sessionType = session ? session.schedule_type : 'theory';
    
    const currentRoomId = roomSelect.value; // Preserve current selection
    const availableRooms = window.allocationManager.getAvailableRooms(day, timeSlot, sessionType, session);
    
    // Clear and repopulate
    roomSelect.innerHTML = '<option value="">Select Room</option>';
    
    // Always add current room first (even if not available - user might want to keep it)
    if (currentRoomId) {
        const currentRoom = Array.from(window.allocationManager.rooms)
            .map(roomStr => JSON.parse(roomStr))
            .find(room => room.id == currentRoomId);
        
        if (currentRoom) {
            const isAvailable = availableRooms.some(r => r.id == currentRoomId);
            const option = document.createElement('option');
            option.value = currentRoom.id;
            option.textContent = `${currentRoom.number} (${currentRoom.block}) - Capacity: ${getRoomCapacity(currentRoom)} ${isAvailable ? '✓' : '⚠️ (Busy)'}`;
            option.selected = true;
            option.style.fontWeight = 'bold';
            roomSelect.appendChild(option);
        }
    }
    
    // Add available rooms
    availableRooms.forEach(room => {
        if (room.id != currentRoomId) { // Don't duplicate current room
            const option = document.createElement('option');
            option.value = room.id;
            option.textContent = `${room.number} (${room.block}) - Capacity: ${getRoomCapacity(room)}`;
            roomSelect.appendChild(option);
        }
    });
    
    // Add separator and unavailable rooms in gray
    const unavailableRooms = Array.from(window.allocationManager.rooms)
        .map(roomStr => JSON.parse(roomStr))
        .filter(room => {
            if (room.id == currentRoomId) return false; // Don't duplicate current room
            if (availableRooms.some(r => r.id == room.id)) return false; // Don't duplicate available rooms
            
            // For theory sessions, show lab rooms as unavailable if they have lab conflicts
            const roomType = window.allocationManager.getRoomType(room.number);
            if (sessionType === 'lab' && roomType !== 'lab') return false;
            // Theory sessions can potentially use lab rooms, so show them as unavailable if occupied
            
            return true;
        });
        
    if (unavailableRooms.length > 0) {
        // Add separator
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '─── Unavailable Rooms ───';
        roomSelect.appendChild(separator);
        
        unavailableRooms.forEach(room => {
            const option = document.createElement('option');
            option.value = room.id;
            option.textContent = `${room.number} (${room.block}) - Capacity: ${getRoomCapacity(room)} - Busy`;
            option.style.color = '#999';
            roomSelect.appendChild(option);
        });
    }
}

// Update availability and filter dropdowns
function updateAvailability() {
    const day = document.getElementById('quickEditDay').value;
    const timeSlot = document.getElementById('quickEditTimeSlot').value;

    if (!day || !timeSlot || !window.allocationManager) {
        return;
    }

    // Get session type from the save button onclick to extract session index
    const saveBtn = document.getElementById('quickSaveBtn');
    const sessionIndex = parseInt(saveBtn.getAttribute('onclick').match(/\d+/)[0]);
    const session = allData[sessionIndex];
    const sessionType = session ? session.schedule_type : 'theory';

    // Force repopulate available rooms with new day/time
    populateAvailableRooms();
    
    // Force repopulate available teachers with new day/time
    populateAvailableTeachers();

    checkValidation();
}

// Update dropdowns to show only available options (compatibility function)
function updateQuickDropdowns(day, timeSlot, sessionType) {
    if (!window.allocationManager) return;

    // Note: Dropdowns are now populated on focus (onfocus events)
    // This function now just validates current selections
    checkValidation();
}

// Check validation for quick edit
function checkValidation() {
    const day = document.getElementById('quickEditDay').value;
    const timeSlot = document.getElementById('quickEditTimeSlot').value;
    const teacherId = document.getElementById('quickEditTeacher').value;
    const roomId = document.getElementById('quickEditRoom').value;
    const saveBtn = document.getElementById('quickSaveBtn');
    const validationResults = document.getElementById('quickValidationResults');

    if (!day || !timeSlot || !teacherId || !roomId) {
        saveBtn.disabled = true;
        validationResults.innerHTML = '';
        return;
    }

    if (!window.allocationManager) {
        saveBtn.disabled = true;
        return;
    }

    // Check if teacher and room are available
    const teacherFree = window.allocationManager.isTeacherFree(teacherId, day, timeSlot);
    const roomFree = window.allocationManager.isRoomFree(roomId, day, timeSlot);

    let validation = { isValid: true, conflicts: [], warnings: [] };

    if (!teacherFree) {
        validation.isValid = false;
        validation.conflicts.push({ message: 'Selected teacher is not available at this time' });
    }

    if (!roomFree) {
        validation.isValid = false;
        validation.conflicts.push({ message: 'Selected room is not available at this time' });
    }

    // Display validation results
    if (validation.isValid) {
        validationResults.innerHTML = `
            <div class="alert alert-success">
                <i class="fas fa-check-circle me-2"></i>
                <strong>Valid Configuration</strong>
                <p class="mb-0">The proposed changes are valid and can be applied.</p>
            </div>
        `;
        saveBtn.disabled = false;
    } else {
        validationResults.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Validation Failed</strong>
                <ul class="mb-0">
                    ${validation.conflicts.map(c => `<li>${c.message}</li>`).join('')}
                </ul>
            </div>
        `;
        saveBtn.disabled = true;
    }
}

// Save quick edit changes
async function saveQuickEdit(sessionIndex) {
    const session = allData[sessionIndex];
    if (!session || !window.allocationManager) return;

    const day = document.getElementById('quickEditDay').value;
    const timeSlot = document.getElementById('quickEditTimeSlot').value;
    const teacherId = document.getElementById('quickEditTeacher').value;
    const roomId = document.getElementById('quickEditRoom').value;

    // Create updated session
    const updatedSession = { ...session };
    updatedSession.day = day;
    
    if (session.schedule_type === 'lab') {
        updatedSession.time_range = timeSlot;
        // Find the lab session name (L1, L2, etc.)
        const labSlots = {'L1': '8:00 - 9:40', 'L2': '10:00 - 11:40', 'L3': '11:50 - 1:20', 'L4': '1:20 - 3:00', 'L5': '3:00 - 4:40', 'L6': '5:10 - 6:50'};
        const sessionName = Object.keys(labSlots).find(key => labSlots[key] === timeSlot);
        if (sessionName) updatedSession.session_name = sessionName;
    } else {
        updatedSession.time_slot = timeSlot;
    }

    // Update teacher details
    const teacher = Array.from(window.allocationManager.teachers)
        .map(t => JSON.parse(t))
        .find(t => t.id == teacherId);
    if (teacher) {
        updatedSession.teacher_id = teacher.id;
        updatedSession.teacher_name = teacher.name;
        updatedSession.staff_code = teacher.staff_code;
    }

    // Update room details
    const room = Array.from(window.allocationManager.rooms)
        .map(r => JSON.parse(r))
        .find(r => r.id == roomId);
    if (room) {
        updatedSession.room_id = room.id;
        updatedSession.room_number = room.number;
        updatedSession.block = room.block;
        updatedSession.capacity = room.capacity;
    }

    try {
        console.log(`🔄 Updating session: ${session.course_code} (${session.schedule_type})`);
        console.log(`   Old: ${session.day} ${getSessionTimeSlot(session)} - ${session.teacher_name} - ${session.room_number}`);
        console.log(`   New: ${updatedSession.day} ${getSessionTimeSlot(updatedSession)} - ${updatedSession.teacher_name} - ${updatedSession.room_number}`);
        
        // Apply the change using allocation manager
        const result = await window.allocationManager.applyAllocationChange(sessionIndex, updatedSession);
        
        if (result.success) {
            // ✅ COMPLETE SESSION REPLACEMENT: Delete old session and add new one
            
            // 1. Remove the old session from all arrays
            const oldSessionIndex = allData.indexOf(session);
            if (oldSessionIndex >= 0) {
                allData.splice(oldSessionIndex, 1);
                console.log(`🗑️ Removed old session from allData at index ${oldSessionIndex}`);
            }
            
            if (session.schedule_type === 'lab') {
                const labIndex = labData.indexOf(session);
                if (labIndex >= 0) {
                    labData.splice(labIndex, 1);
                    console.log(`🗑️ Removed old lab session at index ${labIndex}`);
                }
            } else {
                const theoryIndex = theoryData.indexOf(session);
                if (theoryIndex >= 0) {
                    theoryData.splice(theoryIndex, 1);
                    console.log(`🗑️ Removed old theory session at index ${theoryIndex}`);
                }
            }
            
            // 2. Add the new session to appropriate arrays
            allData.push(updatedSession);
            
            if (updatedSession.schedule_type === 'lab') {
                labData.push(updatedSession);
                console.log(`➕ Added new lab session`);
            } else {
                theoryData.push(updatedSession);
                console.log(`➕ Added new theory session`);
            }
            
            console.log(`✅ Session replacement completed`);
            console.log(`   Total sessions: ${allData.length} (Lab: ${labData.length}, Theory: ${theoryData.length})`);
            
            // 3. Persist changes to original JSON files
            await saveChangesToJsonFiles();
            
            // 4. Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('quickEditModal'));
            modal.hide();
            
            // 5. Refresh the schedule display
            renderContent();
            
            // 6. Show success message
            showSuccessAlert('Session updated successfully! Old session deleted, new session saved to original JSON files.');
            
        } else {
            showErrorAlert(`Failed to save changes: ${result.message}`);
        }
    } catch (error) {
        console.error('Error saving quick edit:', error);
        showErrorAlert('An error occurred while saving changes: ' + error.message);
    }
}

// Show session tooltip on hover
function showSessionTooltip(event, sessionIndex) {
    if (!window.allocationManager) return;
    
    const session = allData[sessionIndex];
    if (!session) return;

    // Remove existing tooltip
    hideSessionTooltip();
    
    // Get conflicts for this session (excluding group conflicts since different courses in same group are now allowed)
    const conflicts = window.allocationManager.getSessionConflicts(sessionIndex).filter(conflict => conflict.type !== 'group_conflict');
    
    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.id = 'sessionTooltip';
    tooltip.className = 'position-absolute bg-white border rounded shadow-lg p-3';
    tooltip.style.cssText = `
        z-index: 9999;
        max-width: 300px;
        left: ${event.pageX + 10}px;
        top: ${event.pageY - 10}px;
        font-size: 0.85rem;
    `;
    
    let conflictInfo = '';
    if (conflicts.length > 0) {
        conflictInfo = `
            <div class="mt-2 pt-2 border-top">
                <div class="text-danger fw-bold">
                    <i class="fas fa-exclamation-triangle me-1"></i>
                    ${conflicts.length} Conflict${conflicts.length > 1 ? 's' : ''}
                </div>
                ${conflicts.map(c => `<div class="text-danger small">${c.message}</div>`).join('')}
            </div>
        `;
    } else {
        conflictInfo = `
            <div class="mt-2 pt-2 border-top">
                <div class="text-success">
                    <i class="fas fa-check-circle me-1"></i>
                    No conflicts detected
                </div>
            </div>
        `;
    }
    
    tooltip.innerHTML = `
        <div>
            <div class="fw-bold text-primary">${session.course_code}</div>
            <div class="text-muted small">${session.course_name}</div>
            <div class="mt-1">
                <div><strong>Teacher:</strong> ${session.teacher_name}</div>
                <div><strong>Room:</strong> ${session.room_number} (${session.block})</div>
                <div><strong>Time:</strong> ${session.day} ${getSessionTimeSlot(session)}</div>
                <div><strong>Group:</strong> ${session.group_name}</div>
            </div>
            ${conflictInfo}
            <div class="mt-2 pt-2 border-top text-center">
                <small class="text-muted">Click to edit this session</small>
            </div>
        </div>
    `;
    
    document.body.appendChild(tooltip);
    currentTooltip = tooltip;
    
    // Position tooltip better if it goes off screen
    const rect = tooltip.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        tooltip.style.left = (event.pageX - rect.width - 10) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        tooltip.style.top = (event.pageY - rect.height - 10) + 'px';
    }
}

// Hide session tooltip
function hideSessionTooltip() {
    if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
    }
}

// Utility functions for alerts
function showSuccessAlert(message) {
    showAlert('success', message);
}

function showErrorAlert(message) {
    showAlert('danger', message);
}

function showAlert(type, message) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alert.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alert);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (alert.parentNode) {
            alert.parentNode.removeChild(alert);
        }
    }, 5000);
}

// Drag and Drop Functionality
let draggedSessionIndex = null;
let draggedSessionElement = null;
let originalDropZone = null;

// Handle drag start
function handleDragStart(event, sessionIndex) {
    draggedSessionIndex = sessionIndex;
    draggedSessionElement = event.target;
    originalDropZone = event.target.closest('.drop-zone');
    
    // Add dragging class for visual feedback
    event.target.classList.add('dragging');
    
    // Set drag effect
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/html', event.target.outerHTML);
    
    // Show drag feedback
    showDragFeedback(true);
    
    // Prevent click event during drag
    setTimeout(() => {
        event.target.style.pointerEvents = 'none';
    }, 0);
}

// Handle drag end
function handleDragEnd(event) {
    // Remove dragging class
    event.target.classList.remove('dragging');
    
    // Restore pointer events
    event.target.style.pointerEvents = 'auto';
    
    // Clear drag feedback
    showDragFeedback(false);
    clearDropZoneHighlights();
    
    // Clear drag state
    draggedSessionIndex = null;
    draggedSessionElement = null;
    originalDropZone = null;
}

// Handle drag over (required to allow drop)
function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
}

// Handle drag enter
function handleDragEnter(event) {
    event.preventDefault();
    const dropZone = event.currentTarget;
    
    if (draggedSessionIndex !== null && canDropInZone(dropZone)) {
        dropZone.classList.add('drop-zone-valid');
    } else {
        dropZone.classList.add('drop-zone-invalid');
    }
}

// Handle drag leave
function handleDragLeave(event) {
    const dropZone = event.currentTarget;
    dropZone.classList.remove('drop-zone-valid', 'drop-zone-invalid');
}

// Handle drop
async function handleDrop(event) {
    event.preventDefault();
    const dropZone = event.currentTarget;
    
    // Clear visual feedback
    dropZone.classList.remove('drop-zone-valid', 'drop-zone-invalid');
    
    if (draggedSessionIndex === null) {
        showErrorAlert('No session selected for drop');
        return;
    }
    
    const session = allData[draggedSessionIndex];
    if (!session) {
        showErrorAlert('Invalid session data');
        return;
    }
    
    const newDay = dropZone.dataset.day;
    const newTimeSlot = dropZone.dataset.timeSlot;
    const newSessionType = dropZone.dataset.sessionType;
    
    // Check if dropping in the same location
    if (session.day === newDay && getSessionTimeSlot(session) === newTimeSlot) {
        showSuccessAlert('Session is already in this location');
        return;
    }
    
    // Check if session type matches (lab sessions can only go to lab slots, theory to theory)
    if (session.schedule_type !== newSessionType) {
        showErrorAlert(`Cannot move ${session.schedule_type} session to ${newSessionType} time slot`);
        return;
    }
    
    // Load allocation manager if not available
    if (!window.allocationManager) {
        await loadAllocationManager();
    }
    
    // Validate the move
    const conflicts = await validateDrop(draggedSessionIndex, newDay, newTimeSlot);
    
    if (conflicts.length > 0) {
        const conflictMessages = conflicts.map(c => c.message).join('\n');
        showErrorAlert(`Cannot move session due to conflicts:\n${conflictMessages}`);
        return;
    }
    
    // Perform the move
    try {
        await performSessionMove(draggedSessionIndex, newDay, newTimeSlot);
        showSuccessAlert(`Session moved successfully to ${newDay} ${newTimeSlot}`);
    } catch (error) {
        console.error('Error moving session:', error);
        showErrorAlert('Failed to move session');
    }
}

// Check if a session can be dropped in a specific zone
function canDropInZone(dropZone) {
    if (draggedSessionIndex === null) return false;
    
    const session = allData[draggedSessionIndex];
    const dropSessionType = dropZone.dataset.sessionType;
    
    // Check session type compatibility
    return session.schedule_type === dropSessionType;
}

// Enhanced validation with comprehensive conflict detection (based on combined_scheduler.py)
async function validateDrop(sessionIndex, newDay, newTimeSlot) {
    const session = allData[sessionIndex];
    const conflicts = [];
    
    if (!window.allocationManager) {
        return [{ 
            type: 'system_error',
            message: 'Allocation manager not loaded - advanced validation unavailable' 
        }];
    }
    
    // Create updated session for validation
    const updatedSession = { ...session, day: newDay };
    if (session.schedule_type === 'theory') {
        updatedSession.time_slot = newTimeSlot;
    } else {
        updatedSession.session_name = newTimeSlot;
        const labSlots = {'L1': '8:00 - 9:40', 'L2': '10:00 - 11:40', 'L3': '11:50 - 1:20', 'L4': '1:20 - 3:00', 'L5': '3:00 - 4:40', 'L6': '5:10 - 6:50'};
        updatedSession.time_range = labSlots[newTimeSlot] || newTimeSlot;
    }
    
    // 1. Comprehensive teacher conflict checking (matching Python scheduler)
    const teacherId = session.teacher_id;
    const dayNorm = window.allocationManager.normalizeDayName ? 
                    window.allocationManager.normalizeDayName(newDay) : newDay.toLowerCase();
    
    // Get all time slots this session would occupy
    let sessionTimeSlots = [];
    if (session.schedule_type === 'lab') {
        sessionTimeSlots = window.allocationManager.labSessionDetails?.[newTimeSlot] || [newTimeSlot];
    } else {
        sessionTimeSlots = [newTimeSlot];
    }
    
    // Check each time slot for teacher conflicts
    for (const timeSlot of sessionTimeSlots) {
        const teacherConflict = allData.find(s => 
            s !== session &&
            s.teacher_id === teacherId &&
            s.day === newDay &&
            getSessionTimeSlot(s) === timeSlot
        );
        
        if (teacherConflict) {
            conflicts.push({
                type: 'teacher_conflict',
                severity: 'high',
                message: `Teacher ${session.teacher_name} already has ${teacherConflict.course_code} at ${timeSlot}`,
                details: {
                    teacher: session.teacher_name,
                    conflictingCourse: teacherConflict.course_code,
                    timeSlot: timeSlot,
                    scheduleType: teacherConflict.schedule_type
                }
            });
        }
    }
    
    // 2. Enhanced room conflict checking with cross-schedule validation
    const roomId = session.room_id;
    
    // Check lab-theory cross conflicts
    if (session.schedule_type === 'lab') {
        // Lab session: check each individual time slot against theory sessions
        for (const timeSlot of sessionTimeSlots) {
            const roomConflict = allData.find(s => 
                s !== session &&
                s.room_id === roomId &&
                s.day === newDay &&
                s.schedule_type === 'theory' &&
                s.time_slot === timeSlot
            );
            
            if (roomConflict) {
                conflicts.push({
                    type: 'cross_schedule_room_conflict',
                    severity: 'critical',
                    message: `Room ${session.room_number} occupied by theory session ${roomConflict.course_code} at ${timeSlot}`,
                    details: {
                        room: session.room_number,
                        conflictingCourse: roomConflict.course_code,
                        timeSlot: timeSlot,
                        conflictType: 'lab-theory'
                    }
                });
            }
        }
    } else {
        // Theory session: check against lab sessions
        const labConflict = allData.find(s => 
            s !== session &&
            s.room_id === roomId &&
            s.day === newDay &&
            s.schedule_type === 'lab' &&
            window.allocationManager.labSessionDetails?.[s.session_name]?.includes(newTimeSlot)
        );
        
        if (labConflict) {
            conflicts.push({
                type: 'cross_schedule_room_conflict',
                severity: 'critical',
                message: `Room ${session.room_number} occupied by lab session ${labConflict.course_code}`,
                details: {
                    room: session.room_number,
                    conflictingCourse: labConflict.course_code,
                    labSession: labConflict.session_name,
                    conflictType: 'theory-lab'
                }
            });
        }
    }
    
    // Check same-schedule room conflicts
    const sameScheduleRoomConflict = allData.find(s => 
        s !== session &&
        s.room_id === roomId &&
        s.day === newDay &&
        s.schedule_type === session.schedule_type &&
        getSessionTimeSlot(s) === newTimeSlot
    );
    
    if (sameScheduleRoomConflict) {
        conflicts.push({
            type: 'room_conflict',
            severity: 'high',
            message: `Room ${session.room_number} already occupied by ${sameScheduleRoomConflict.course_code}`,
            details: {
                room: session.room_number,
                conflictingCourse: sameScheduleRoomConflict.course_code,
                timeSlot: newTimeSlot,
                scheduleType: session.schedule_type
            }
        });
    }
    
    // 3. ❌ STRICT GROUP RULE: No group overlaps allowed in drag & drop
    const groupConflicts = allData.filter(s => 
        s !== session &&
        s.group_name === session.group_name &&
        s.day === newDay &&
        getSessionTimeSlot(s) === newTimeSlot
    );
    
    if (groupConflicts.length > 0) {
        const courseCodes = groupConflicts.map(s => s.course_code);
        const sessionTypes = groupConflicts.map(s => s.schedule_type);
        
        conflicts.push({
            type: 'group_conflict',
            severity: 'high',
            message: `Group ${session.group_name} already has sessions at this time: ${courseCodes.join(', ')} (${sessionTypes.join(', ')})`,
            details: {
                group: session.group_name,
                day: newDay,
                timeSlot: newTimeSlot,
                conflictingCourses: courseCodes,
                conflictingTypes: sessionTypes,
                rule: 'No group overlaps allowed'
            }
        });
    }
    
    // 4. Department day pattern validation (matching Python scheduler)
    const dept = session.department || session.student_dept;
    const sessionDayPattern = session.day_pattern;
    
    if (dept && sessionDayPattern) {
        // Check if moving to a day violates department pattern
        const mondayFridayDays = ['monday', 'tuesday', 'wed', 'thur', 'fri'];
        const tuesdaySaturdayDays = ['tuesday', 'wed', 'thur', 'fri', 'saturday'];
        
        const isMonFriPattern = sessionDayPattern.includes('Monday') || sessionDayPattern.includes('Friday');
        const isTueSatPattern = sessionDayPattern.includes('Saturday');
        
        if (isMonFriPattern && !mondayFridayDays.includes(newDay.toLowerCase())) {
            conflicts.push({
                type: 'day_pattern_violation',
                severity: 'medium',
                message: `${dept} follows Monday-Friday pattern, cannot schedule on ${newDay}`,
                details: {
                    department: dept,
                    dayPattern: sessionDayPattern,
                    requestedDay: newDay
                }
            });
        } else if (isTueSatPattern && !tuesdaySaturdayDays.includes(newDay.toLowerCase())) {
            conflicts.push({
                type: 'day_pattern_violation',
                severity: 'medium',
                message: `${dept} follows Tuesday-Saturday pattern, cannot schedule on ${newDay}`,
                details: {
                    department: dept,
                    dayPattern: sessionDayPattern,
                    requestedDay: newDay
                }
            });
        }
    }
    
    // 5. Cross-department teacher validation
    if (window.allocationManager.crossDepartmentTeachers?.has(teacherId)) {
        const teacherDepts = window.allocationManager.teacherDepartments?.get(teacherId);
        conflicts.push({
            type: 'cross_department_warning',
            severity: 'info',
            message: `Teacher ${session.teacher_name} teaches across ${teacherDepts?.size || 'multiple'} departments`,
            details: {
                teacher: session.teacher_name,
                departments: teacherDepts ? Array.from(teacherDepts) : ['multiple']
            }
        });
    }
    
    return conflicts;
}

// Perform the actual session move
async function performSessionMove(sessionIndex, newDay, newTimeSlot) {
    const session = allData[sessionIndex];
    
    console.log(`🔄 Moving session via drag & drop: ${session.course_code} (${session.schedule_type})`);
    console.log(`   From: ${session.day} ${getSessionTimeSlot(session)}`);
    console.log(`   To: ${newDay} ${newTimeSlot}`);
    
    // Create updated session
    const updatedSession = { ...session };
    updatedSession.day = newDay;
    
    if (session.schedule_type === 'lab') {
        updatedSession.time_range = newTimeSlot;
        // Find corresponding lab session name
        const labSlots = {'L1': '8:00 - 9:40', 'L2': '10:00 - 11:40', 'L3': '11:50 - 1:20', 'L4': '1:20 - 3:00', 'L5': '3:00 - 4:40', 'L6': '5:10 - 6:50'};
        const sessionName = Object.keys(labSlots).find(key => labSlots[key] === newTimeSlot);
        if (sessionName) {
            updatedSession.session_name = sessionName;
        }
    } else {
        updatedSession.time_slot = newTimeSlot;
    }
    
    // Apply the change using allocation manager
    if (window.allocationManager) {
        const result = await window.allocationManager.applyAllocationChange(sessionIndex, updatedSession);
        
        if (result.success) {
            // ✅ COMPLETE SESSION REPLACEMENT: Delete old session and add new one
            
            // 1. Remove the old session from all arrays
            const oldSessionIndex = allData.indexOf(session);
            if (oldSessionIndex >= 0) {
                allData.splice(oldSessionIndex, 1);
                console.log(`🗑️ Removed old session from allData at index ${oldSessionIndex}`);
            }
            
            if (session.schedule_type === 'lab') {
                const labIndex = labData.indexOf(session);
                if (labIndex >= 0) {
                    labData.splice(labIndex, 1);
                    console.log(`🗑️ Removed old lab session at index ${labIndex}`);
                }
            } else {
                const theoryIndex = theoryData.indexOf(session);
                if (theoryIndex >= 0) {
                    theoryData.splice(theoryIndex, 1);
                    console.log(`🗑️ Removed old theory session at index ${theoryIndex}`);
                }
            }
            
            // 2. Add the new session to appropriate arrays
            allData.push(updatedSession);
            
            if (updatedSession.schedule_type === 'lab') {
                labData.push(updatedSession);
                console.log(`➕ Added new lab session`);
            } else {
                theoryData.push(updatedSession);
                console.log(`➕ Added new theory session`);
            }
            
            console.log(`✅ Session move completed`);
            console.log(`   Total sessions: ${allData.length} (Lab: ${labData.length}, Theory: ${theoryData.length})`);
            
            // 3. Persist changes to original JSON files
            await saveChangesToJsonFiles();
            
            // 4. Refresh display
            renderContent();
            
        } else {
            throw new Error(result.message);
        }
    } else {
        // Fallback: complete replacement without allocation manager validation
        console.log('⚠️ No allocation manager available, performing direct replacement');
        
        // Remove old session
        const oldIndex = allData.indexOf(session);
        if (oldIndex >= 0) {
            allData.splice(oldIndex, 1);
        }
        
        if (session.schedule_type === 'lab') {
            const labIndex = labData.indexOf(session);
            if (labIndex >= 0) labData.splice(labIndex, 1);
        } else {
            const theoryIndex = theoryData.indexOf(session);
            if (theoryIndex >= 0) theoryData.splice(theoryIndex, 1);
        }
        
        // Add new session
        allData.push(updatedSession);
        
        if (updatedSession.schedule_type === 'lab') {
            labData.push(updatedSession);
        } else {
            theoryData.push(updatedSession);
        }
        
        // Persist changes
        await saveChangesToJsonFiles();
        
        renderContent();
    }
}

// Show drag feedback
function showDragFeedback(show) {
    const dropZones = document.querySelectorAll('.drop-zone');
    
    if (show) {
        // Highlight valid drop zones
        dropZones.forEach(zone => {
            if (canDropInZone(zone)) {
                zone.classList.add('drop-zone-highlight');
            } else {
                zone.classList.add('drop-zone-disabled');
            }
        });
        
        // Show drag instruction
        showDragInstruction(true);
    } else {
        // Clear all highlighting
        dropZones.forEach(zone => {
            zone.classList.remove('drop-zone-highlight', 'drop-zone-disabled');
        });
        
        showDragInstruction(false);
    }
}

// Clear drop zone highlights
function clearDropZoneHighlights() {
    document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.classList.remove('drop-zone-valid', 'drop-zone-invalid', 'drop-zone-highlight', 'drop-zone-disabled');
    });
}

// Show drag instruction tooltip
let dragInstructionElement = null;

function showDragInstruction(show) {
    if (show && !dragInstructionElement) {
        dragInstructionElement = document.createElement('div');
        dragInstructionElement.id = 'dragInstruction';
        dragInstructionElement.className = 'position-fixed bg-primary text-white p-2 rounded shadow';
        dragInstructionElement.style.cssText = `
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999;
            font-size: 0.9rem;
            pointer-events: none;
        `;
        dragInstructionElement.innerHTML = `
            <i class="fas fa-hand-paper me-2"></i>
            Drop in a highlighted slot to move the session
        `;
        document.body.appendChild(dragInstructionElement);
    } else if (!show && dragInstructionElement) {
        dragInstructionElement.remove();
        dragInstructionElement = null;
    }
}