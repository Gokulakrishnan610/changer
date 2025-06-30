// Enhanced Allocation Manager - Advanced Conflict Detection and Schedule Management
// Based on combined_scheduler.py logic for comprehensive validation
class AllocationManager {
    constructor() {
        this.labData = [];
        this.theoryData = [];
        this.allData = [];
        this.conflicts = [];
        this.isInitialized = false;
        this.loadingProgress = 0;
        this.currentPage = 0;
        this.pageSize = userState?.getPreferences()?.pageSize || 50;
        
        this.validationRules = {
            teacherConflicts: true,
            roomConflicts: true,
            groupConflicts: true,
            capacityLimits: true,
            timeSlotValidation: true,
            dayPatternValidation: true,
            shiftBasedValidation: true,
            crossScheduleValidation: true
        };
        
        // Enhanced time slot definitions (matching Python scheduler exactly)
        this.timeSlots = {
            theory: [
                "8:00 - 8:50", "9:00 - 9:50", "10:00 - 10:50", "11:00 - 11:50",
                "12:00 - 12:50", "1:00 - 1:50", "2:00 - 2:50", "3:00 - 3:50",
                "4:00 - 4:50", "5:00 - 5:50", "6:00 - 6:50"
            ],
            lab: {
                'L1': '8:00 - 9:40', 'L2': '10:00 - 11:40', 'L3': '11:50 - 1:20', 
                'L4': '1:20 - 3:00', 'L5': '3:00 - 4:40', 'L6': '5:10 - 6:50'
            }
        };
        
        // Lab session detailed mapping (for conflict detection)
        this.labSessionDetails = {
            'L1': ['8:00 - 8:50', '8:50 - 9:40'],      // 8:00 - 9:40
            'L2': ['10:00 - 10:50', '10:50 - 11:40'],   // 10:00 - 11:40  
            'L3': ['11:50 - 12:30', '12:30 - 1:20'],   // 11:50 - 1:20
            'L4': ['1:20 - 2:10', '2:10 - 3:00'],      // 1:20 - 3:00
            'L5': ['3:00 - 3:50', '3:50 - 4:40'],      // 3:00 - 4:40
            'L6': ['5:10 - 6:00', '6:00 - 6:50']       // 5:10 - 6:50
        };
        
        // Shift definitions (matching Python scheduler)
        this.shiftDefinitions = {
            'shift_1': {
                'name': 'Shift 1 (8AM-3PM)',
                'theory_slots': [0, 1, 2, 3, 4, 5, 6],  // 8:00-2:50
                'lab_sessions': ['L1', 'L2', 'L3', 'L4'],
                'start_time': '8:00',
                'end_time': '3:00'
            },
            'shift_2': {
                'name': 'Shift 2 (10AM-5PM)', 
                'theory_slots': [2, 3, 4, 5, 6, 7, 8],  // 10:00-4:50
                'lab_sessions': ['L2', 'L3', 'L4', 'L5'],
                'start_time': '10:00',
                'end_time': '5:00'
            },
            'shift_3': {
                'name': 'Shift 3 (12PM-7PM)',
                'theory_slots': [4, 5, 6, 7, 8, 9, 10], // 12:00-6:50
                'lab_sessions': ['L3', 'L4', 'L5', 'L6'],
                'start_time': '12:00',
                'end_time': '7:00'
            }
        };
        
        this.days = ['monday', 'tuesday', 'wed', 'thur', 'fri', 'saturday'];
        this.currentEditingSession = null;
        this.teachers = new Set();
        this.rooms = new Set();
        this.groups = new Set();
        
        // Enhanced tracking (matching Python scheduler)
        this.roomTypes = new Map(); // room_id -> 'lab' or 'theory'
        this.roomCapacities = new Map(); // room_id -> capacity
        this.departmentDayPatterns = new Map(); // dept -> day pattern
        this.departmentShiftPatterns = new Map(); // dept -> shift pattern
        this.crossDepartmentTeachers = new Set(); // teachers across multiple depts
        this.teacherDepartments = new Map(); // teacher_id -> Set of departments
        this.lunchBreakConfig = new Map(); // dept -> lunch break config
        
        // Global room registry for cross-schedule validation
        this.globalRoomRegistry = new Map(); // key: 'day_timeslot_roomid' -> session_info
        
        // Enhanced validation statistics
        this.validationStats = {
            totalConflicts: 0,
            roomConflicts: 0,
            teacherConflicts: 0,
            groupConflicts: 0,
            capacityViolations: 0,
            dayPatternViolations: 0,
            shiftViolations: 0,
            crossScheduleConflicts: 0
        };
    }

    // Load existing schedule data with performance optimization and fallback
    async loadScheduleData(options = {}) {
        try {
            console.log('📊 Starting allocation manager data loading...');
            
            // Check if we should use cached data
            const useCache = options.useCache !== false;
            const forceReload = options.forceReload === true;
            
            if (useCache && !forceReload && this.isInitialized) {
                console.log('✅ Using cached data');
                return { success: true, message: 'Using cached schedule data' };
            }
            
            // Safely update user state (with fallback if not available)
            this.safeUpdateUserState({ isLoading: true, loadingProgress: 0, error: null });
            this.safeSetCurrentPage('allocation');
            
            // Use simple loading approach first (fallback to old method)
            console.log('🔄 Loading data files...');
            this.updateLoadingProgress(10);
            
            const [labRes, theoryRes] = await Promise.all([
                fetch('./output/combined_lab_schedule.json'),
                fetch('./output/combined_theory_schedule.json')
            ]);

            if (!labRes.ok || !theoryRes.ok) {
                throw new Error(`Failed to fetch data files. Lab: ${labRes.status}, Theory: ${theoryRes.status}`);
            }
            
            this.updateLoadingProgress(40);
            console.log('📊 Parsing JSON data...');

            const labData = await labRes.json();
            const theoryData = await theoryRes.json();

            // ✅ ADDED: Assign session indices to all sessions for proper validation
            labData.forEach((session, index) => {
                session.sessionIndex = index;
            });
            theoryData.forEach((session, index) => {
                session.sessionIndex = labData.length + index;
            });

            this.labData = labData;
            this.theoryData = theoryData;
            this.allData = [...labData, ...theoryData];
            
            console.log(`✅ Loaded ${this.labData.length} lab sessions and ${this.theoryData.length} theory sessions`);
            this.updateLoadingProgress(70);
            
            // Process data with performance optimization if available, otherwise use standard processing
            if (typeof performanceOptimizer !== 'undefined' && this.allData.length > 500) {
                console.log('⚡ Using optimized data processing...');
                await this.processDataInChunks();
            } else {
                console.log('🔄 Using standard data processing...');
                await this.processDataStandard();
            }
            
            this.updateLoadingProgress(100);
            this.isInitialized = true;
            
            this.safeUpdateUserState({ 
                isLoading: false, 
                loadingProgress: 100,
                lastLoaded: Date.now()
            });
            
            console.log('✅ Allocation manager data loaded successfully');
            return { success: true, message: 'Schedule data loaded successfully' };
            
        } catch (error) {
            console.error('❌ Error loading allocation manager data:', error);
            this.safeUpdateUserState({ 
                isLoading: false, 
                error: error.message 
            });
            
            // Try to provide more specific error information
            let errorMessage = 'Failed to load schedule data';
            if (error.message.includes('fetch')) {
                errorMessage += ' - Network error or files not found';
            } else if (error.message.includes('JSON')) {
                errorMessage += ' - Invalid JSON format';
            } else {
                errorMessage += ` - ${error.message}`;
            }
            
            return { success: false, message: errorMessage, error };
        }
    }
    
    // Safe wrapper for user state updates
    safeUpdateUserState(dataState) {
        try {
            if (typeof userState !== 'undefined' && userState) {
                userState.updateDataState(dataState);
            }
        } catch (error) {
            console.warn('Could not update user state:', error);
        }
    }
    
    // Safe wrapper for setting current page
    safeSetCurrentPage(page) {
        try {
            if (typeof userState !== 'undefined' && userState) {
                userState.setCurrentPage(page);
            }
        } catch (error) {
            console.warn('Could not set current page:', error);
        }
    }
    
    // Standard data processing (fallback)
    async processDataStandard() {
        console.log('🔄 Processing data using standard method...');
            
            // Enhanced data processing (matching Python scheduler)
            this.extractUniqueValues();
        this.updateLoadingProgress(75);
        
            this.identifyCrossDepartmentTeachers();
            this.setupDepartmentDayPatterns();
            this.initializeGlobalRoomRegistry();
        this.updateLoadingProgress(85);
            
        // Perform conflict detection immediately for initial display
        console.log('🔍 Starting immediate conflict detection...');
            this.detectAllConflicts();
        console.log(`✅ Conflict detection completed - found ${this.conflicts.length} conflicts`);
        
        // Notify UI to update
        this.notifyConflictDetectionComplete();
        
        this.updateLoadingProgress(90);
    }
    
    // Process data in chunks to avoid blocking UI
    async processDataInChunks() {
        try {
            console.log('⚡ Processing data in optimized chunks...');
            
            if (typeof performanceOptimizer === 'undefined') {
                console.warn('Performance optimizer not available, falling back to standard processing');
                return await this.processDataStandard();
            }
            
            // Enhanced data processing (matching Python scheduler)
            await performanceOptimizer.processDataInChunks(
                [this.allData],
                async (chunks) => {
                    this.extractUniqueValues();
                    return chunks;
                },
                (progress) => {
                    this.updateLoadingProgress(80 + (progress.percentage * 0.05));
                }
            );
            
            await performanceOptimizer.processDataInChunks(
                [this.allData],
                async (chunks) => {
                    this.identifyCrossDepartmentTeachers();
                    this.setupDepartmentDayPatterns();
                    this.initializeGlobalRoomRegistry();
                    return chunks;
                },
                (progress) => {
                    this.updateLoadingProgress(85 + (progress.percentage * 0.05));
                }
            );
            
            // Perform conflict detection immediately for initial display
            console.log('🔍 Starting immediate conflict detection...');
            this.detectAllConflicts();
            console.log(`✅ Conflict detection completed - found ${this.conflicts.length} conflicts`);
            
            // Notify UI to update
            this.notifyConflictDetectionComplete();
            
        } catch (error) {
            console.error('Error in chunked processing, falling back to standard:', error);
            await this.processDataStandard();
        }
    }
    
    // Asynchronous conflict detection to avoid blocking UI
    async detectAllConflictsAsync() {
        console.log('🔍 Starting background conflict detection...');
        
        try {
            if (typeof performanceOptimizer !== 'undefined' && this.allData.length > 500) {
                // Use optimized processing for large datasets
                await performanceOptimizer.processDataInChunks(
                    this.allData,
                    async (sessionChunk) => {
                        // Process conflicts for this chunk
                        sessionChunk.forEach((session, index) => {
                            const conflicts = this.getSessionConflicts(index);
                            if (conflicts.length > 0) {
                                this.conflicts.push(...conflicts);
                            }
                        });
                        return sessionChunk;
                    },
                    (progress) => {
                        console.log(`Conflict detection progress: ${progress.percentage.toFixed(1)}%`);
                    }
                );
            } else {
                // Fallback to standard conflict detection
                console.log('🔍 Using standard conflict detection...');
                this.detectAllConflicts();
            }
            
            console.log(`✅ Conflict detection complete. Found ${this.conflicts.length} conflicts`);
            this.notifyConflictDetectionComplete();
            
        } catch (error) {
            console.error('❌ Error in background conflict detection, using fallback:', error);
            // Fallback to standard method
            try {
                this.detectAllConflicts();
                console.log(`✅ Fallback conflict detection complete. Found ${this.conflicts.length} conflicts`);
                this.notifyConflictDetectionComplete();
            } catch (fallbackError) {
                console.error('❌ Even fallback conflict detection failed:', fallbackError);
            }
        }
    }
    
    // Update loading progress UI
    updateLoadingProgress(progress = null) {
        if (progress !== null) {
            this.loadingProgress = progress;
        }
        
        this.safeUpdateUserState({ loadingProgress: this.loadingProgress });
        
        // Update progress bar if it exists
        const progressBar = document.querySelector('.loading-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${this.loadingProgress}%`;
            progressBar.setAttribute('aria-valuenow', this.loadingProgress);
        }
        
        // Update progress text if it exists
        const progressText = document.querySelector('.loading-progress-text');
        if (progressText) {
            if (this.loadingProgress < 100) {
                progressText.textContent = `Loading allocation manager... ${Math.round(this.loadingProgress)}%`;
            } else {
                progressText.textContent = 'Loading complete!';
            }
        }
    }
    
    // Notify when conflict detection is complete
    notifyConflictDetectionComplete() {
        const event = new CustomEvent('conflictDetectionComplete', {
            detail: { conflicts: this.conflicts.length }
        });
        document.dispatchEvent(event);
        
        // Update UI if conflicts panel exists
        if (typeof renderConflicts === 'function') {
            console.log(`🔄 Updating conflicts display - found ${this.conflicts.length} conflicts`);
            renderConflicts();
            console.log('✅ Conflicts display updated');
        } else {
            console.warn('⚠️ renderConflicts function not available');
        }
    }
    
    // Enhanced data extraction with room types and capacities
    extractUniqueValues() {
        this.allData.forEach(session => {
            if (session.teacher_name && session.teacher_id) {
                this.teachers.add(JSON.stringify({
                    id: session.teacher_id,
                    name: session.teacher_name,
                    staff_code: session.staff_code
                }));
            }
            if (session.room_number && session.room_id) {
                // Determine room type and set appropriate default capacity
                const roomType = this.getRoomType(session.room_number);
                const defaultCapacity = roomType === 'theory' ? 70 : 35;
                const actualCapacity = session.capacity || defaultCapacity;
                
                this.rooms.add(JSON.stringify({
                    id: session.room_id,
                    number: session.room_number,
                    block: session.block,
                    capacity: actualCapacity
                }));
                
                // Track room types and capacities
                this.roomTypes.set(session.room_id, roomType);
                this.roomCapacities.set(session.room_id, actualCapacity);
            }
            if (session.group_name) {
                this.groups.add(session.group_name);
            }
        });
    }
    
    // Identify cross-department teachers (matching Python scheduler logic)
    identifyCrossDepartmentTeachers() {
        const teacherDeptMap = new Map();
        
        this.allData.forEach(session => {
            const teacherId = session.teacher_id;
            const studentDept = session.student_dept || session.department;
            
            if (teacherId && studentDept) {
                if (!teacherDeptMap.has(teacherId)) {
                    teacherDeptMap.set(teacherId, new Set());
                }
                teacherDeptMap.get(teacherId).add(studentDept);
            }
        });
        
        // Identify cross-department teachers
        teacherDeptMap.forEach((depts, teacherId) => {
            this.teacherDepartments.set(teacherId, depts);
            if (depts.size > 1) {
                this.crossDepartmentTeachers.add(teacherId);
            }
        });
        
        console.log(`Identified ${this.crossDepartmentTeachers.size} cross-department teachers`);
    }
    
    // Setup department day patterns (Monday-Friday vs Tuesday-Saturday)
    setupDepartmentDayPatterns() {
        const deptPatterns = new Map();
        
        this.allData.forEach(session => {
            const dept = session.department || session.student_dept;
            const dayPattern = session.day_pattern;
            
            if (dept && dayPattern) {
                deptPatterns.set(dept, dayPattern);
            }
        });
        
        this.departmentDayPatterns = deptPatterns;
        console.log(`Setup day patterns for ${deptPatterns.size} departments`);
    }
    
    // Initialize global room registry for cross-schedule validation
    initializeGlobalRoomRegistry() {
        this.globalRoomRegistry.clear();
        
        this.allData.forEach(session => {
            this.registerRoomUsage(session);
        });
        
        console.log(`Initialized global room registry with ${this.globalRoomRegistry.size} entries`);
    }
    
    // Register room usage in global registry
    registerRoomUsage(session) {
        const day = this.normalizeDayName(session.day);
        const roomId = session.room_id;
        
        if (session.schedule_type === 'lab') {
            // Lab sessions occupy multiple time slots
            const sessionName = session.session_name;
            const timeSlots = this.labSessionDetails[sessionName] || [];
            
            timeSlots.forEach(timeSlot => {
                const key = `${day}_${timeSlot}_${roomId}`;
                this.globalRoomRegistry.set(key, session);
            });
        } else {
            // Theory sessions occupy single time slot
            const timeSlot = session.time_slot;
            if (timeSlot) {
                const key = `${day}_${timeSlot}_${roomId}`;
                this.globalRoomRegistry.set(key, session);
            }
        }
    }
    
    // Normalize day names for consistency
    normalizeDayName(dayName) {
        const dayMapping = {
            'monday': 'monday',
            'tue': 'tuesday', 'tuesday': 'tuesday',
            'wed': 'wed', 'wednesday': 'wed',
            'thu': 'thur', 'thur': 'thur', 'thursday': 'thur',
            'fri': 'fri', 'friday': 'fri',
            'sat': 'saturday', 'saturday': 'saturday'
        };
        return dayMapping[dayName.toLowerCase()] || dayName.toLowerCase();
    }
    
    // Check if room is available globally
    isRoomAvailableGlobal(day, timeSlot, roomId) {
        const dayNorm = this.normalizeDayName(day);
        const key = `${dayNorm}_${timeSlot}_${roomId}`;
        return !this.globalRoomRegistry.has(key);
    }
    
    // Parse time to minutes (matching Python scheduler logic)
    parseTimeToMinutes(timeStr) {
        try {
            if (timeStr.includes(' - ')) {
                timeStr = timeStr.split(' - ')[0];
            }
            
            const [h, m] = timeStr.split(':').map(Number);
            // Handle PM conversion for 12-hour format
            let hours = h;
            if (h <= 7 && h >= 1) {
                hours += 12;
            }
            return hours * 60 + m;
        } catch {
            return 0;
        }
    }
    
    // Check if two time ranges overlap (matching Python scheduler logic)
    timesOverlap(timeRange1, timeRange2) {
        try {
            const parseRange = (range) => {
                if (range.includes(' - ')) {
                    const [start, end] = range.split(' - ');
                    return {
                        start: this.parseTimeToMinutes(start),
                        end: this.parseTimeToMinutes(end)
                    };
                }
                return null;
            };
            
            const range1 = parseRange(timeRange1);
            const range2 = parseRange(timeRange2);
            
            if (!range1 || !range2) return false;
            
            // Check overlap: (StartA < EndB) and (EndA > StartB)
            return range1.start < range2.end && range1.end > range2.start;
        } catch {
            return false;
        }
    }



    // Determine room type based on room number
    getRoomType(roomNumber) {
        if (!roomNumber) return 'unknown';
        const room = roomNumber.toString().toLowerCase();
        if (room.includes('lab') || room.includes('comp') || room.includes('cse') || room.includes('it')) {
            return 'lab';
        }
        return 'theory';
    }

    // Convert time string to minutes since midnight
    timeToMinutes(timeStr) {
        const match = timeStr.match(/(\d{1,2}):(\d{2})/);
        if (!match) return null;
        
        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        return hours * 60 + minutes;
    }

    // Parse time range string to start and end times in minutes
    parseTimeRange(timeStr) {
        if (!timeStr) return null;
        
        try {
            let startTime, endTime;
            
            if (timeStr.includes(' - ')) {
                if (timeStr.includes(' to ')) {
                    // Format: "8:00 - 8:50 to 8:50 - 9:40"
                    const parts = timeStr.split(' to ');
                    startTime = this.timeToMinutes(parts[0].split(' - ')[0]);
                    endTime = this.timeToMinutes(parts[parts.length - 1].split(' - ')[1]);
                } else {
                    // Format: "8:00 - 8:50"
                    const parts = timeStr.split(' - ');
                    startTime = this.timeToMinutes(parts[0]);
                    endTime = this.timeToMinutes(parts[1]);
                }
            } else {
                // Lab session name format (L1, L2, etc.)
                const labTime = this.timeSlots.lab[timeStr];
                if (labTime) {
                    const parts = labTime.split(' - ');
                    startTime = this.timeToMinutes(parts[0]);
                    endTime = this.timeToMinutes(parts[1]);
                }
            }
            
            return startTime && endTime ? { start: startTime, end: endTime } : null;
        } catch (error) {
            console.warn('Error parsing time range:', timeStr, error);
            return null;
        }
    }

    // Helper method to get time key for a session
    getTimeKey(session) {
        if (session.schedule_type === 'lab') {
            return session.time_range || session.session_name;
        } else {
            return session.time_slot;
        }
    }

    // Check if two time slots overlap
    doTimeSlotsOverlap(session1, session2) {
        const time1 = this.parseTimeRange(this.getTimeKey(session1));
        const time2 = this.parseTimeRange(this.getTimeKey(session2));
        
        if (!time1 || !time2) return false;
        
        return (time1.start < time2.end && time2.start < time1.end);
    }

    // Get available rooms for a specific time slot and course type
    getAvailableRooms(day, timeSlot, courseType = null, excludeSession = null) {
        const availableRooms = [];
        const occupiedRooms = new Set();
        const labOccupiedRooms = new Set(); // Track rooms occupied specifically by lab sessions
        
        // Find all rooms occupied at this time slot
        this.allData.forEach(session => {
            if (session === excludeSession) return;
            if (session.day !== day) return;
            
            const sessionTime = this.getTimeKey(session);
            if (sessionTime === timeSlot || this.doTimeSlotsOverlap({
                schedule_type: 'temp',
                time_slot: timeSlot,
                time_range: timeSlot
            }, session)) {
                occupiedRooms.add(session.room_id);
                
                // Track lab-specific occupancy
                if (session.schedule_type === 'lab') {
                    labOccupiedRooms.add(session.room_id);
                }
            }
        });
        
        // Filter available rooms
        Array.from(this.rooms).forEach(roomStr => {
            const room = JSON.parse(roomStr);
            const roomType = this.getRoomType(room.number);
            
            if (!courseType) {
                // No filter specified - return all non-occupied rooms
                if (!occupiedRooms.has(room.id)) {
                    availableRooms.push(room);
                }
            } else if (courseType === 'lab') {
                // Lab sessions can only use lab rooms that are completely free
                if (roomType === 'lab' && !occupiedRooms.has(room.id)) {
                    availableRooms.push(room);
                }
            } else if (courseType === 'theory') {
                // Theory sessions can use:
                // 1. Theory rooms that are completely free
                // 2. Lab rooms that are NOT occupied by lab sessions
                if (!occupiedRooms.has(room.id)) {
                    // Room is completely free
                    availableRooms.push(room);
                } else if (roomType === 'lab' && !labOccupiedRooms.has(room.id)) {
                    // Lab room is occupied but not by a lab session (theory can share)
                    availableRooms.push(room);
                }
            }
        });
        
        return availableRooms.sort((a, b) => a.number.localeCompare(b.number));
    }

    // Get available teachers for a specific time slot
    getAvailableTeachers(day, timeSlot, excludeSession = null) {
        const availableTeachers = [];
        const occupiedTeachers = new Set();
        
        // Find all teachers occupied at this time slot
        this.allData.forEach(session => {
            if (session === excludeSession) return;
            if (session.day !== day) return;
            
            const sessionTime = this.getTimeKey(session);
            if (sessionTime === timeSlot || this.doTimeSlotsOverlap({
                schedule_type: 'temp',
                time_slot: timeSlot,
                time_range: timeSlot
            }, session)) {
                occupiedTeachers.add(session.teacher_id);
            }
        });
        
        // Filter available teachers
        Array.from(this.teachers).forEach(teacherStr => {
            const teacher = JSON.parse(teacherStr);
            if (!occupiedTeachers.has(teacher.id)) {
                availableTeachers.push(teacher);
            }
        });
        
        return availableTeachers.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Check if a specific time slot is free for a room
    isRoomFree(roomId, day, timeSlot) {
        return !this.allData.some(session => {
            if (session.room_id !== roomId || session.day !== day) return false;
            const sessionTime = this.getTimeKey(session);
            return sessionTime === timeSlot || this.doTimeSlotsOverlap({
                schedule_type: 'temp',
                time_slot: timeSlot,
                time_range: timeSlot
            }, session);
        });
    }

    // Check if a specific teacher is free at a time slot
    isTeacherFree(teacherId, day, timeSlot) {
        return !this.allData.some(session => {
            if (session.teacher_id !== teacherId || session.day !== day) return false;
            const sessionTime = this.getTimeKey(session);
            return sessionTime === timeSlot || this.doTimeSlotsOverlap({
                schedule_type: 'temp',
                time_slot: timeSlot,
                time_range: timeSlot
            }, session);
        });
    }

    // Get conflicts for a specific session
    getSessionConflicts(sessionIndex) {
        const session = this.allData[sessionIndex];
        if (!session) return [];
        
        const conflicts = [];
        const sessionTime = this.getTimeKey(session);
        
        // Check for conflicts with other sessions
        this.allData.forEach((otherSession, index) => {
            if (index === sessionIndex) return;
            
            const otherTime = this.getTimeKey(otherSession);
            if (session.day === otherSession.day && 
                (sessionTime === otherTime || this.doTimeSlotsOverlap(session, otherSession))) {
                
                // Teacher conflict
                if (session.teacher_id === otherSession.teacher_id) {
                    conflicts.push({
                        type: 'teacher_conflict',
                        message: `Teacher ${session.teacher_name} has another session`,
                        conflictingSession: otherSession,
                        conflictingIndex: index
                    });
                }
                
                // Room conflict
                if (session.room_id === otherSession.room_id) {
                    conflicts.push({
                        type: 'room_conflict',
                        message: `Room ${session.room_number} is already booked`,
                        conflictingSession: otherSession,
                        conflictingIndex: index
                    });
                }
                
                // ✅ Group conflicts removed: Different courses in same group are now allowed
                // No longer reporting group conflicts for different courses in same group
            }
        });
        
        return conflicts;
    }

    // Detect and handle duplicate sessions
    detectAndHandleDuplicates() {
        const duplicateGroups = new Map();
        const duplicatesToRemove = [];
        
        // Group sessions by key properties to find duplicates
        this.allData.forEach((session, index) => {
            const key = `${session.course_code}_${session.teacher_id}_${session.room_id}_${session.day}_${this.getTimeKey(session)}_${session.group_name}_${session.schedule_type}`;
            
            if (!duplicateGroups.has(key)) {
                duplicateGroups.set(key, []);
            }
            duplicateGroups.get(key).push({ session, index });
        });
        
        // Identify duplicates
        duplicateGroups.forEach((sessions, key) => {
            if (sessions.length > 1) {
                // Mark as duplicates
                this.conflicts.push({
                    type: 'duplicate_sessions',
                    severity: 'warning',
                    message: `🔧 Found ${sessions.length} duplicate sessions: ${sessions[0].session.course_code} - ${sessions[0].session.teacher_name}`,
                    sessions: sessions.map(s => ({ ...s.session, originalIndex: s.index })),
                    details: {
                        course: sessions[0].session.course_code,
                        teacher: sessions[0].session.teacher_name,
                        room: sessions[0].session.room_number,
                        time: this.getTimeKey(sessions[0].session),
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
            const removedSession = this.allData[index];
            
            // Remove from main data array
            this.allData.splice(index, 1);
            
            // Remove from appropriate sub-array
            if (removedSession.schedule_type === 'lab') {
                const labIndex = this.labData.indexOf(removedSession);
                if (labIndex >= 0) {
                    this.labData.splice(labIndex, 1);
                }
            } else {
                const theoryIndex = this.theoryData.indexOf(removedSession);
                if (theoryIndex >= 0) {
                    this.theoryData.splice(theoryIndex, 1);
                }
            }
        });
        
        if (duplicatesToRemove.length > 0) {
            console.log(`🔧 Removed ${duplicatesToRemove.length} duplicate sessions from dataset`);
            
            // Update unique value sets
            this.extractUniqueValues();
            this.initializeGlobalRoomRegistry();
        }
    }

    // ✅ UPDATED: Detect time slot exclusivity conflicts (Fixed - no false positives)
    detectTimeSlotExclusivityConflicts() {
        console.log('🕐 Detecting same-group time slot conflicts only...');
        
        // REMOVED: Global Theory-Lab exclusivity and Theory Single Group rules
        // These were causing false positives for different departments/semesters
        
        // Only check for conflicts within the same group
        const groupMap = {};
        
        // Group sessions by group name and day
        this.allData.forEach((session, index) => {
            const groupKey = `${session.group_name}_${session.day}`;
            if (!groupMap[groupKey]) {
                groupMap[groupKey] = [];
            }
            groupMap[groupKey].push({ session, index });
        });
        
        // Check each group for internal conflicts only
        Object.entries(groupMap).forEach(([groupKey, sessions]) => {
            const [groupName, day] = groupKey.split('_');
            
            // Check for overlapping sessions within the same group
            for (let i = 0; i < sessions.length; i++) {
                for (let j = i + 1; j < sessions.length; j++) {
                    const session1 = sessions[i].session;
                    const session2 = sessions[j].session;
                    
                    // Check if sessions overlap in time
                    if (this.doTimeSlotsOverlap(session1, session2)) {
                        // Different session types within same group = conflict
                        if (session1.schedule_type !== session2.schedule_type) {
                    this.conflicts.push({
                                type: 'same_group_mixed_session_overlap',
                                severity: 'high',
                                message: `Group ${groupName}: ${session1.schedule_type} session ${session1.course_code} overlaps with ${session2.schedule_type} session ${session2.course_code}`,
                                sessions: [
                                    { ...session1, originalIndex: sessions[i].index },
                                    { ...session2, originalIndex: sessions[j].index }
                                ],
                        details: {
                                    rule: 'Same Group Session Overlap Prevention',
                                    group: groupName,
                            day: day,
                                    session1: `${session1.course_code} (${session1.schedule_type})`,
                                    session2: `${session2.course_code} (${session2.schedule_type})`,
                                    reason: 'Same group cannot have overlapping sessions of different types'
                        }
                    });
                }
                    }
                }
            }
        });
        
        console.log('✅ Same-group conflict detection completed');
    }

    // Comprehensive conflict detection
    detectAllConflicts() {
        this.conflicts = [];
        
        // 🔧 STEP 1: Detect and handle duplicate sessions first
        this.detectAndHandleDuplicates();
        
        // Create conflict maps for efficient detection
        const teacherSlots = new Map();
        const roomSlots = new Map();
        const groupSlots = new Map();
        
        // Build conflict maps
        this.allData.forEach((session, index) => {
            const timeKey = this.getTimeKey(session);
            const dayTimeKey = `${session.day}_${timeKey}`;
            
            // Teacher conflicts
            const teacherKey = `${session.teacher_id}_${dayTimeKey}`;
            if (!teacherSlots.has(teacherKey)) {
                teacherSlots.set(teacherKey, []);
            }
            teacherSlots.get(teacherKey).push({ session, index });
            
            // Room conflicts
            const roomKey = `${session.room_id}_${dayTimeKey}`;
            if (!roomSlots.has(roomKey)) {
                roomSlots.set(roomKey, []);
            }
            roomSlots.get(roomKey).push({ session, index });
            
            // Group conflicts
            const groupKey = `${session.group_name}_${dayTimeKey}`;
            if (!groupSlots.has(groupKey)) {
                groupSlots.set(groupKey, []);
            }
            groupSlots.get(groupKey).push({ session, index });
        });
        
        // Detect teacher conflicts
        teacherSlots.forEach((sessions, key) => {
            if (sessions.length > 1) {
                this.conflicts.push({
                    type: 'teacher_conflict',
                    severity: 'high',
                    message: `Teacher ${sessions[0].session.teacher_name} has ${sessions.length} sessions at the same time`,
                    sessions: sessions.map(s => ({ ...s.session, originalIndex: s.index })),
                    details: {
                        teacher: sessions[0].session.teacher_name,
                        day: sessions[0].session.day,
                        time: this.getTimeKey(sessions[0].session),
                        conflictingSessions: sessions.length
                    }
                });
            }
        });
        
        // Detect room conflicts
        roomSlots.forEach((sessions, key) => {
            if (sessions.length > 1) {
                this.conflicts.push({
                    type: 'room_conflict',
                    severity: 'high',
                    message: `Room ${sessions[0].session.room_number} has ${sessions.length} sessions at the same time`,
                    sessions: sessions.map(s => ({ ...s.session, originalIndex: s.index })),
                    details: {
                        room: sessions[0].session.room_number,
                        day: sessions[0].session.day,
                        time: this.getTimeKey(sessions[0].session),
                        conflictingSessions: sessions.length
                    }
                });
            }
        });

        // ✅ NEW: Detect time slot exclusivity conflicts (User Requested Rules)
        this.detectTimeSlotExclusivityConflicts();
        
        // 🎯 COMPREHENSIVE group conflict detection with ALL combined_scheduler.py rules
        groupSlots.forEach((sessions, key) => {
            if (sessions.length > 1) {
                const allSessions = sessions.map(s => s.session);
                const courseCodes = allSessions.map(s => s.course_code);
                const uniqueCourseCodes = [...new Set(courseCodes)];
                const uniqueCourses = new Set(sessions.map(s => s.session.course_instance_id));
                
                if (uniqueCourses.size > 1) {
                    // 🎯 COMPREHENSIVE CO-SCHEDULING VALIDATION (All rules from combined_scheduler.py)
                    const validateCoScheduling = () => {
                        // ✅ RULE 1: Same course code - Basic co-scheduling (Lines 4277-4281, 5579-5658)
                        if (uniqueCourseCodes.length === 1) {
                            return { allowed: true, reason: "Same course co-scheduling", rule: "Lines 4277-4281" };
                        }
                        
                        // ✅ RULE 2: Virtual instances (e.g., "877-A", "877-B") - Lines 1295-1369
                        const baseCourseIds = uniqueCourseCodes.map(code => {
                            const match = code.match(/^([A-Z]*\d+)/);
                            return match ? match[1] : code.split('-')[0];
                        });
                        const uniqueBaseCourses = [...new Set(baseCourseIds)];
                        
                        if (uniqueBaseCourses.length === 1 && courseCodes.some(code => code.includes('-'))) {
                            return { allowed: true, reason: "Virtual instance co-scheduling", rule: "Lines 1295-1369" };
                        }
                        
                        // ✅ RULE 3: Batched sessions (is_batched = true) - Lines 5744-5856
                        const hasBatchedSessions = allSessions.some(s => 
                            s.is_batched === true || 
                            s.session_info?.includes('batch') ||
                            s.co_schedule_info?.includes('batch')
                        );
                        if (hasBatchedSessions && uniqueCourseCodes.length === 1) {
                            return { allowed: true, reason: "Batched session co-scheduling", rule: "Lines 5744-5856" };
                        }
                        
                        // ✅ RULE 4: Cross-department allowances - Lines 3989-4092
                        const departments = allSessions.map(s => s.group_name.split('_S')[0]);
                        const uniqueDepartments = [...new Set(departments)];
                        if (uniqueDepartments.length > 1) {
                            return { allowed: true, reason: "Cross-department scheduling", rule: "Lines 3989-4092" };
                        }
                        
                        // ✅ RULE 5: Co-scheduled session markers (is_co_scheduled = true)
                        const hasCoScheduledMarkers = allSessions.some(s => 
                            s.is_co_scheduled === true || 
                            s.co_schedule_id || 
                            s.co_schedule_info?.includes('Co-scheduled')
                        );
                        if (hasCoScheduledMarkers) {
                            return { allowed: true, reason: "Marked co-scheduled sessions", rule: "Lines 5579-5658" };
                        }
                        
                        // ✅ RULE 6: Large course capacity splitting (140+ students total)
                        const totalStudents = allSessions.reduce((sum, s) => sum + (parseInt(s.student_count) || 0), 0);
                        const roomCapacities = allSessions.map(s => parseInt(s.capacity) || 0);
                        const maxCapacity = Math.max(...roomCapacities);
                        
                        if ((totalStudents >= 140 || maxCapacity >= 140) && uniqueCourseCodes.length === 1) {
                            return { allowed: true, reason: "Large course capacity splitting", rule: "Virtual instances for 140+ students" };
                        }
                        
                        // ✅ RULE 7: Different courses in same group - ALLOWED (User Request)
                        // This allows split groups, electives, and specialized tracks
                        if (uniqueCourseCodes.length > 1) {
                            return { allowed: true, reason: "Different courses allowed in same group", rule: "Split groups/electives/tracks allowance" };
                        }
                        
                        // ✅ RULE 8: Large lab co-scheduling (140+ capacity rooms)
                        const isLargeLab = maxCapacity >= 140;
                        const allLabSessions = allSessions.every(s => s.schedule_type === 'lab');
                        if (isLargeLab && allLabSessions) {
                            return { allowed: true, reason: "Large lab co-scheduling", rule: "140+ capacity lab optimization" };
                        }
                        
                        // ✅ RULE 9: Closely related course codes (e.g., CS23331 vs CS23333, CS19741 vs CS19P18)
                        // Special handling for CS19XXX series (numeric and alphanumeric patterns)
                        const cs19Pattern = /^CS19/;
                        const allCS19Series = uniqueCourseCodes.every(code => cs19Pattern.test(code));
                        
                        if (allCS19Series && uniqueCourseCodes.length > 1) {
                            // Allow all CS19XXX combinations (CS19741, CS19P18, CS19321, etc.)
                            return { allowed: true, reason: "CS19XXX series co-scheduling", rule: `CS19XXX series (${uniqueCourseCodes.join(', ')})` };
                        }
                        
                        // General pattern for other course series
                        const coursePattern = /^([A-Z]+)(\d{2,3})(.+)$/; // Flexible pattern for various formats
                        const courseMatches = uniqueCourseCodes.map(code => {
                            const match = code.match(coursePattern);
                            return match ? { prefix: match[1], series: match[2], number: match[3] } : null;
                        }).filter(m => m !== null);
                        
                        if (courseMatches.length === uniqueCourseCodes.length && courseMatches.length > 1) {
                            // Check if all courses have same prefix and series (e.g., CS233XX, CS23XXX)
                            const prefixes = [...new Set(courseMatches.map(m => m.prefix))];
                            const series = [...new Set(courseMatches.map(m => m.series))];
                            
                            if (prefixes.length === 1 && series.length === 1) {
                                return { allowed: true, reason: "Closely related course codes", rule: `${prefixes[0]}${series[0]}XXX series co-scheduling` };
                            }
                            
                            // ✅ RULE 10: Cross-department related courses in same series (e.g., CS23333 vs CB23331, CR23331 vs CS23333)
                            // Allow related department courses in same series
                            if (series.length === 1) {
                                const relatedDeptPairs = [
                                    ['CS', 'CB'], // Computer Science & Computer Business
                                    ['CS', 'IT'], // Computer Science & Information Technology
                                    ['CS', 'CR'], // Computer Science & Cryptography/Cyber Security
                                    ['AI', 'CS'], // AI & Computer Science
                                    ['MA', 'CS'], // Mathematics & Computer Science
                                    ['MA', 'ME'], // Mathematics & Mechanical Engineering
                                    ['EC', 'EE'], // Electronics & Electrical
                                    ['ME', 'CE'], // Mechanical & Civil
                                    ['BM', 'CS'], // Biomedical & Computer Science
                                    ['BM', 'EC'], // Biomedical & Electronics
                                    ['BM', 'ME']  // Biomedical & Mechanical
                                ];
                                
                                const sortedPrefixes = [...prefixes].sort();
                                const isRelatedDepartments = relatedDeptPairs.some(pair => {
                                    const sortedPair = [...pair].sort();
                                    return JSON.stringify(sortedPrefixes) === JSON.stringify(sortedPair);
                                });
                                
                                if (isRelatedDepartments) {
                                    return { allowed: true, reason: "Cross-department related courses", rule: `${sortedPrefixes.join('-')}${series[0]}XXX cross-department series` };
                                }
                            }
                        }
                        
                        // ✅ DEFAULT: Allow different courses in same group (per user request)
                        return { 
                            allowed: true, 
                            reason: "Different courses allowed in same group", 
                            rule: "University scheduling flexibility" 
                        };
                    };
                    
                    const validationResult = validateCoScheduling();
                    
                    if (validationResult.allowed) {
                        // ✅ CO-SCHEDULING ALLOWED: Mark sessions but don't create conflict
                        sessions.forEach(s => {
                            s.session.is_co_scheduled = true;
                            s.session.co_schedule_info = `✅ ${validationResult.reason} (${validationResult.rule})`;
                        });
                        console.log(`✅ Co-scheduling allowed: ${sessions[0].session.group_name} - ${validationResult.reason} (${validationResult.rule})`);
                        console.log(`   Courses: ${uniqueCourseCodes.join(', ')} at ${sessions[0].session.day} ${this.getTimeKey(sessions[0].session)}`);
                    } else {
                        // ❌ CONFLICT: This should rarely happen now since we allow most group scenarios
                        this.conflicts.push({
                            type: 'group_conflict',
                            severity: 'medium',  // Reduced severity since group conflicts are now less critical
                            message: `Group ${sessions[0].session.group_name} has unusual scheduling: ${sessions.length} courses at the same time`,
                            sessions: sessions.map(s => ({ ...s.session, originalIndex: s.index })),
                            details: {
                                group: sessions[0].session.group_name,
                                day: sessions[0].session.day,
                                time: this.getTimeKey(sessions[0].session),
                                courses: uniqueCourseCodes,
                                conflictingSessions: sessions.length,
                                reason: validationResult.reason,
                                rule: validationResult.rule
                            }
                        });
                        console.log(`⚠️ Unusual group scheduling: ${sessions[0].session.group_name} - ${validationResult.reason} (${validationResult.rule})`);
                        console.log(`   Courses: ${uniqueCourseCodes.join(', ')} at ${sessions[0].session.day} ${this.getTimeKey(sessions[0].session)}`);
                    }
                }
            }
        });
        
        // Detect capacity violations
        this.allData.forEach((session, index) => {
            if (session.student_count && session.capacity) {
                if (session.student_count > session.capacity) {
                    this.conflicts.push({
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
        
        console.log(`Conflict detection complete. Found ${this.conflicts.length} conflicts.`);
        return this.conflicts;
    }

    // Validate a proposed schedule change
    validateAllocation(newSession, originalSession = null) {
        const validation = {
            isValid: true,
            conflicts: [],
            warnings: []
        };

        // Create a temporary dataset for validation
        let tempData = [...this.allData];
        
        console.log(`🔍 validateAllocation: Starting with ${tempData.length} sessions in tempData`);
        console.log(`   New session index: ${newSession.sessionIndex}`);
        console.log(`   Original session index: ${originalSession?.sessionIndex}`);
        
        // Remove original session if editing
        if (originalSession) {
            // ✅ FIXED: Use session index comparison instead of object reference
            const beforeFilter = tempData.length;
            tempData = tempData.filter(s => {
                // If both sessions have sessionIndex, compare by that
                if (s.sessionIndex !== undefined && originalSession.sessionIndex !== undefined) {
                    const shouldKeep = s.sessionIndex !== originalSession.sessionIndex;
                    if (!shouldKeep) {
                        console.log(`🔍 Filtering out session ${s.course_code} (index: ${s.sessionIndex}) - matches original session index`);
                    }
                    return shouldKeep;
                }
                // Fallback to object reference comparison
                const shouldKeep = s !== originalSession;
                if (!shouldKeep) {
                    console.log(`🔍 Filtering out session ${s.course_code} by object reference`);
                }
                return shouldKeep;
            });
            console.log(`🔍 validateAllocation: Filtered out ${beforeFilter - tempData.length} sessions, ${tempData.length} remaining`);
        }
        
        // Add new session
        tempData.push(newSession);
        console.log(`🔍 validateAllocation: Added new session, total: ${tempData.length}`);

        // Check for conflicts with the new session
        const conflictChecks = [
            this.checkTeacherAvailability(newSession, tempData),
            this.checkRoomAvailability(newSession, tempData),
            this.checkTimeSlotExclusivity(newSession, tempData),  // ✅ NEW: Time slot exclusivity rules
            this.checkGroupAvailability(newSession, tempData),
            this.checkCapacityLimits(newSession),
            this.checkTimeSlotValidity(newSession)
        ];

        conflictChecks.forEach(check => {
            if (!check.isValid) {
                validation.isValid = false;
                validation.conflicts.push(...check.conflicts);
            }
            if (check.warnings) {
                validation.warnings.push(...check.warnings);
            }
        });

        return validation;
    }

    // Check teacher availability
    checkTeacherAvailability(newSession, tempData) {
        const conflicts = [];
        const teacherSessions = tempData.filter(s => 
            s.teacher_id === newSession.teacher_id &&
            s.day === newSession.day &&
            // ✅ FIXED: Better session comparison for updates
            // Compare by session index or unique identifier instead of object reference
            !(s.sessionIndex !== undefined && newSession.sessionIndex !== undefined && s.sessionIndex === newSession.sessionIndex) &&
            // ✅ FIXED: Exclude sessions with same course code and group
            !(s.course_code === newSession.course_code && s.group_name === newSession.group_name) &&
            s !== newSession
        );

        // ✅ ADDED: Debug logging for teacher availability check
        if (teacherSessions.length > 0) {
            console.log(`🔍 Teacher availability check for ${newSession.teacher_name} on ${newSession.day}:`);
            console.log(`   New session index: ${newSession.sessionIndex}`);
            teacherSessions.forEach(s => {
                console.log(`   Found conflicting session: ${s.course_code} (index: ${s.sessionIndex}) at ${this.getTimeKey(s)}`);
            });
        }

        // ✅ ADDED: Debug logging for excluded sessions
        const excludedSessions = tempData.filter(s => 
            s.teacher_id === newSession.teacher_id &&
            s.day === newSession.day &&
            s.course_code === newSession.course_code &&
            s.group_name === newSession.group_name &&
            s !== newSession
        );
        if (excludedSessions.length > 0) {
            console.log(`🔍 Excluded ${excludedSessions.length} sessions with same course code and group from teacher validation:`);
            excludedSessions.forEach(s => {
                console.log(`   Excluded: ${s.course_code} (index: ${s.sessionIndex}) at ${this.getTimeKey(s)}`);
            });
        }

        teacherSessions.forEach(session => {
            const overlaps = this.doTimeSlotsOverlap(newSession, session);
            console.log(`🔍 Time overlap check: ${newSession.course_code} (${this.getTimeKey(newSession)}) vs ${session.course_code} (${this.getTimeKey(session)}) = ${overlaps}`);
            
            if (overlaps) {
                conflicts.push({
                    type: 'teacher_conflict',
                    message: `Teacher ${newSession.teacher_name} is already scheduled at this time`,
                    conflictingSession: session
                });
            }
        });

        return {
            isValid: conflicts.length === 0,
            conflicts: conflicts
        };
    }

    // Check room availability
    checkRoomAvailability(newSession, tempData) {
        const conflicts = [];
        const roomSessions = tempData.filter(s => 
            s.room_id === newSession.room_id &&
            s.day === newSession.day &&
            // ✅ FIXED: Better session comparison for updates
            // Compare by session index or unique identifier instead of object reference
            !(s.sessionIndex !== undefined && newSession.sessionIndex !== undefined && s.sessionIndex === newSession.sessionIndex) &&
            // ✅ FIXED: Exclude sessions with same course code and group
            !(s.course_code === newSession.course_code && s.group_name === newSession.group_name) &&
            s !== newSession
        );

        // ✅ ADDED: Debug logging for room availability check
        if (roomSessions.length > 0) {
            console.log(`🔍 Room availability check for ${newSession.room_number} on ${newSession.day}:`);
            console.log(`   New session index: ${newSession.sessionIndex}`);
            roomSessions.forEach(s => {
                console.log(`   Found conflicting session: ${s.course_code} (index: ${s.sessionIndex}) at ${this.getTimeKey(s)}`);
            });
        }

        roomSessions.forEach(session => {
            const overlaps = this.doTimeSlotsOverlap(newSession, session);
            console.log(`🔍 Room time overlap check: ${newSession.course_code} (${this.getTimeKey(newSession)}) vs ${session.course_code} (${this.getTimeKey(session)}) = ${overlaps}`);
            
            if (overlaps) {
                conflicts.push({
                    type: 'room_conflict',
                    message: `Room ${newSession.room_number} is already booked at this time`,
                    conflictingSession: session
                });
            }
        });

        return {
            isValid: conflicts.length === 0,
            conflicts: conflicts
        };
    }

    // ✅ UPDATED: Check time slot exclusivity rules (Fixed to allow different courses in same group)
    checkTimeSlotExclusivity(newSession, tempData) {
        const conflicts = [];
        
        // Get time key for the new session
        const newTimeKey = this.getTimeKey(newSession);
        
        // ✅ UPDATED LOGIC: Allow different courses in same group at same time
        // Only prevent duplicate courses, not different courses
        // This supports split groups, electives, and specialized tracks
        
        // Rule 1: Theory sessions within same group/department
        // Check if the same group already has a theory session at this time
        if (newSession.schedule_type === 'theory') {
            const sameGroupTheoryConflicts = tempData.filter(s => 
                s !== newSession &&
                // ✅ FIXED: Exclude all sessions with same course code and group when updating
                !(s.sessionIndex !== undefined && newSession.sessionIndex !== undefined && s.sessionIndex === newSession.sessionIndex) &&
                !(s.course_code === newSession.course_code && s.group_name === newSession.group_name) &&
                s.schedule_type === 'theory' &&
                s.day === newSession.day &&
                s.time_slot === newSession.time_slot &&
                s.group_name === newSession.group_name &&  // Same group only
                // ✅ MODIFIED: Only flag if it's the exact same course (not different courses)
                s.course_code === newSession.course_code
            );
            
            // ✅ ADDED: Debug logging for time slot exclusivity
            if (sameGroupTheoryConflicts.length > 0) {
                console.log(`🔍 Time slot exclusivity check for ${newSession.group_name} on ${newSession.day} at ${newSession.time_slot}:`);
                console.log(`   New session: ${newSession.course_code} (index: ${newSession.sessionIndex})`);
                sameGroupTheoryConflicts.forEach(s => {
                    console.log(`   Found conflicting theory session: ${s.course_code} (index: ${s.sessionIndex})`);
                });
            }
            
            // ✅ ADDED: Debug logging for excluded sessions in time slot exclusivity
            const excludedTimeSlotSessions = tempData.filter(s => 
                s.schedule_type === 'theory' &&
                s.day === newSession.day &&
                s.time_slot === newSession.time_slot &&
                s.group_name === newSession.group_name &&
                s.course_code === newSession.course_code &&
                s !== newSession
            );
            if (excludedTimeSlotSessions.length > 0) {
                console.log(`🔍 Excluded ${excludedTimeSlotSessions.length} sessions with same course code and group from time slot exclusivity:`);
                excludedTimeSlotSessions.forEach(s => {
                    console.log(`   Excluded: ${s.course_code} (index: ${s.sessionIndex}) at ${s.time_slot}`);
                });
            }
            
            sameGroupTheoryConflicts.forEach(conflictSession => {
                conflicts.push({
                    type: 'duplicate_theory_course_in_group',
                    message: `Group ${newSession.group_name} already has the same theory course ${conflictSession.course_code} at ${newTimeKey}`,
                    conflictingSession: conflictSession,
                    details: {
                        rule: 'Duplicate Course Prevention',
                        conflictingSession: `${conflictSession.course_code} - ${conflictSession.group_name}`,
                        timeSlot: newTimeKey,
                        day: newSession.day,
                        reason: 'Same course cannot be scheduled twice for same group at same time'
                    }
                });
            });
        }
        
        // Rule 2: Lab sessions within same group/department  
        // Check if the same group already has a lab session at this time
        if (newSession.schedule_type === 'lab') {
            const sameGroupLabConflicts = tempData.filter(s => 
                s !== newSession &&
                // ✅ FIXED: Exclude all sessions with same course code and group when updating
                !(s.sessionIndex !== undefined && newSession.sessionIndex !== undefined && s.sessionIndex === newSession.sessionIndex) &&
                !(s.course_code === newSession.course_code && s.group_name === newSession.group_name) &&
                s.schedule_type === 'lab' &&
                s.day === newSession.day &&
                this.doTimeSlotsOverlap(newSession, s) &&
                s.group_name === newSession.group_name &&  // Same group only
                // ✅ MODIFIED: Only flag if it's the exact same course (not different courses)
                s.course_code === newSession.course_code
            );
            
            sameGroupLabConflicts.forEach(conflictSession => {
                conflicts.push({
                    type: 'duplicate_course_theory_lab_conflict',
                    message: `Group ${newSession.group_name} already has the same course ${conflictSession.course_code} as lab at ${newTimeKey}`,
                    conflictingSession: conflictSession,
                    details: {
                        rule: 'Duplicate Course Prevention',
                        conflictingSession: `${conflictSession.course_code} (lab) - ${conflictSession.group_name}`,
                        timeSlot: newTimeKey,
                        day: newSession.day,
                        reason: 'Same course cannot have both theory and lab sessions at same time for same group'
                    }
                });
            });
        }
        
        // Rule 3: Cross-session conflicts only within same group
        if (newSession.schedule_type === 'theory') {
            const sameGroupLabConflicts = tempData.filter(s => 
                s !== newSession &&
                // ✅ FIXED: Exclude all sessions with same course code and group when updating
                !(s.sessionIndex !== undefined && newSession.sessionIndex !== undefined && s.sessionIndex === newSession.sessionIndex) &&
                !(s.course_code === newSession.course_code && s.group_name === newSession.group_name) &&
                s.schedule_type === 'lab' &&
                s.day === newSession.day &&
                s.group_name === newSession.group_name &&  // Same group only
                this.doTimeSlotsOverlap(newSession, s) &&
                // ✅ MODIFIED: Only flag if it's the exact same course (not different courses)
                s.course_code === newSession.course_code
            );
            
            sameGroupLabConflicts.forEach(conflictSession => {
                conflicts.push({
                    type: 'same_group_theory_lab_conflict',
                    message: `Group ${newSession.group_name} has lab session ${conflictSession.course_code} overlapping with theory session`,
                    conflictingSession: conflictSession,
                    details: {
                        rule: 'Same Group Theory-Lab Overlap Prevention',
                        conflictingSession: `${conflictSession.course_code} - ${conflictSession.group_name}`,
                        timeSlot: newTimeKey,
                        day: newSession.day,
                        reason: 'Same group cannot have theory and lab sessions at overlapping times'
                    }
                });
            });
        }

        return {
            isValid: conflicts.length === 0,
            conflicts: conflicts,
            warnings: []
        };
    }

    // ✅ FLEXIBLE GROUP RULE: Allow different courses in same group
    // - Different courses can run simultaneously (split groups, electives, tracks)
    // - Only flag if exact same course is duplicated
    // - Support university scheduling flexibility
    checkGroupAvailability(newSession, tempData) {
        const conflicts = [];
        const warnings = [];
        
        const groupSessions = tempData.filter(s => 
            s.group_name === newSession.group_name &&
            s.day === newSession.day &&
            s !== newSession &&
            // ✅ FIXED: Exclude all sessions with same course code and group when updating
            !(s.sessionIndex !== undefined && newSession.sessionIndex !== undefined && s.sessionIndex === newSession.sessionIndex) &&
            !(s.course_code === newSession.course_code && s.group_name === newSession.group_name) &&
            this.doTimeSlotsOverlap(newSession, s)
        );

        if (groupSessions.length > 0) {
            groupSessions.forEach(session => {
                // ✅ UPDATED LOGIC: Only flag if it's the exact same course
                if (session.course_code === newSession.course_code && 
                    session.schedule_type === newSession.schedule_type) {
                    conflicts.push({
                        type: 'duplicate_course_in_group',
                        message: `Group ${newSession.group_name} already has the same course ${session.course_code} (${session.schedule_type}) at this time`,
                        conflictingSession: session,
                        details: {
                            currentSession: `${newSession.course_code} (${newSession.schedule_type})`,
                            conflictingSession: `${session.course_code} (${session.schedule_type})`,
                            timeSlot: this.getTimeKey(session),
                            day: session.day,
                            group: session.group_name,
                            reason: 'Exact same course cannot be duplicated for same group'
                        }
                    });
                } else {
                    // ✅ DIFFERENT COURSES: Add as informational warning only (not a conflict)
                    warnings.push({
                        type: 'multiple_courses_in_group',
                        message: `Group ${newSession.group_name} has multiple courses at this time: ${newSession.course_code} and ${session.course_code}`,
                        details: {
                            currentSession: `${newSession.course_code} (${newSession.schedule_type})`,
                            existingSession: `${session.course_code} (${session.schedule_type})`,
                            timeSlot: this.getTimeKey(session),
                            day: session.day,
                            group: session.group_name,
                            reason: 'Split groups, electives, or specialized tracks - this is typically allowed'
                        }
                    });
                }
            });
        }

        return {
            isValid: conflicts.length === 0,
            conflicts: conflicts,
            warnings: warnings
        };
    }

    // Check capacity limits
    checkCapacityLimits(newSession) {
        const warnings = [];
        
        if (newSession.student_count && newSession.capacity) {
            if (newSession.student_count > newSession.capacity) {
                return {
                    isValid: false,
                    conflicts: [{
                        type: 'capacity_violation',
                        message: `Student count (${newSession.student_count}) exceeds room capacity (${newSession.capacity})`
                    }]
                };
            } else if (newSession.student_count > newSession.capacity * 0.9) {
                warnings.push({
                    type: 'capacity_warning',
                    message: `Room utilization is high (${((newSession.student_count / newSession.capacity) * 100).toFixed(1)}%)`
                });
            }
        }

        return {
            isValid: true,
            conflicts: [],
            warnings: warnings
        };
    }

    // Check time slot validity
    checkTimeSlotValidity(newSession) {
        const conflicts = [];
        
        if (newSession.schedule_type === 'theory') {
            if (!this.timeSlots.theory.includes(newSession.time_slot)) {
                conflicts.push({
                    type: 'invalid_time_slot',
                    message: `Invalid theory time slot: ${newSession.time_slot}`
                });
            }
        } else if (newSession.schedule_type === 'lab') {
            const labTimeSlots = Object.values(this.timeSlots.lab);
            if (!labTimeSlots.includes(newSession.time_range) && 
                !Object.keys(this.timeSlots.lab).includes(newSession.session_name)) {
                conflicts.push({
                    type: 'invalid_time_slot',
                    message: `Invalid lab time slot: ${newSession.time_range || newSession.session_name}`
                });
            }
        }

        return {
            isValid: conflicts.length === 0,
            conflicts: conflicts
        };
    }

    // Apply allocation change
    async applyAllocationChange(sessionIndex, updatedSession) {
        console.log(`🚀 applyAllocationChange called with sessionIndex: ${sessionIndex}`);
        
        const originalSession = this.allData[sessionIndex];
        
        // ✅ ADDED: Session indices for proper validation
        originalSession.sessionIndex = sessionIndex;
        updatedSession.sessionIndex = sessionIndex;
        
        console.log(`🔍 Validating allocation change for session ${sessionIndex}:`);
        console.log(`   Original: ${originalSession.course_code} - ${originalSession.day} ${this.getTimeKey(originalSession)} - ${originalSession.teacher_name} - ${originalSession.room_number}`);
        console.log(`   Updated:  ${updatedSession.course_code} - ${updatedSession.day} ${this.getTimeKey(updatedSession)} - ${updatedSession.teacher_name} - ${updatedSession.room_number}`);
        
        const validation = this.validateAllocation(updatedSession, originalSession);
        
        if (!validation.isValid) {
            console.log(`❌ Validation failed with ${validation.conflicts.length} conflicts:`);
            validation.conflicts.forEach((conflict, index) => {
                console.log(`   ${index + 1}. ${conflict.type}: ${conflict.message}`);
            });
            
            return {
                success: false,
                message: 'Allocation change failed validation',
                conflicts: validation.conflicts,
                warnings: validation.warnings
            };
        }

        console.log(`🔄 Applying allocation change: ${originalSession.course_code} (${originalSession.schedule_type})`);
        console.log(`   Old: ${originalSession.day} ${this.getTimeKey(originalSession)} - ${originalSession.teacher_name} - ${originalSession.room_number}`);
        console.log(`   New: ${updatedSession.day} ${this.getTimeKey(updatedSession)} - ${updatedSession.teacher_name} - ${updatedSession.room_number}`);

        // ✅ COMPLETE SESSION REPLACEMENT: Delete old session and add new one
        
        // 1. Remove the old session from all arrays
        const allDataIndex = this.allData.indexOf(originalSession);
        if (allDataIndex >= 0) {
            this.allData.splice(allDataIndex, 1);
            console.log(`🗑️ Removed old session from allData at index ${allDataIndex}`);
        }

        if (originalSession.schedule_type === 'lab') {
            const labIndex = this.labData.indexOf(originalSession);
            if (labIndex >= 0) {
                this.labData.splice(labIndex, 1);
                console.log(`🗑️ Removed old lab session at index ${labIndex}`);
            }
        } else {
            const theoryIndex = this.theoryData.indexOf(originalSession);
            if (theoryIndex >= 0) {
                this.theoryData.splice(theoryIndex, 1);
                console.log(`🗑️ Removed old theory session at index ${theoryIndex}`);
            }
        }

        // 2. Add the new session to appropriate arrays
        this.allData.push(updatedSession);

        if (updatedSession.schedule_type === 'lab') {
            this.labData.push(updatedSession);
            console.log(`➕ Added new lab session`);
        } else {
            this.theoryData.push(updatedSession);
            console.log(`➕ Added new theory session`);
        }

        console.log(`✅ Allocation change completed`);
        console.log(`   Total sessions: ${this.allData.length} (Lab: ${this.labData.length}, Theory: ${this.theoryData.length})`);

        // Re-run conflict detection
        this.detectAllConflicts();

        return {
            success: true,
            message: 'Allocation change applied successfully - old session deleted, new session added',
            warnings: validation.warnings,
            conflicts: this.conflicts
        };
    }

    // Get available time slots for a given day and session type
    getAvailableTimeSlots(day, sessionType, excludeSession = null) {
        const availableSlots = [];
        const slotsToCheck = sessionType === 'lab' ? 
            Object.entries(this.timeSlots.lab) : 
            this.timeSlots.theory.map(slot => [slot, slot]);

        slotsToCheck.forEach(([slotKey, slotValue]) => {
            const isAvailable = !this.allData.some(session => {
                if (session === excludeSession) return false;
                if (session.day !== day) return false;
                
                const sessionTime = this.getTimeKey(session);
                return sessionTime === slotKey || sessionTime === slotValue;
            });

            if (isAvailable) {
                availableSlots.push({
                    key: slotKey,
                    value: slotValue,
                    display: sessionType === 'lab' ? `${slotKey} (${slotValue})` : slotValue
                });
            }
        });

        return availableSlots;
    }

    // Get available rooms for a specific time slot and course type
    getAvailableRooms(day, timeSlot, courseType = null, excludeSession = null) {
        const availableRooms = [];
        const occupiedRooms = new Set();
        const labOccupiedRooms = new Set(); // Track rooms occupied specifically by lab sessions
        
        // Find all rooms occupied at this time slot
        this.allData.forEach(session => {
            if (session === excludeSession) return;
            if (session.day !== day) return;
            
            const sessionTime = this.getTimeKey(session);
            if (sessionTime === timeSlot || this.doTimeSlotsOverlap({
                schedule_type: 'temp',
                time_slot: timeSlot,
                time_range: timeSlot
            }, session)) {
                occupiedRooms.add(session.room_id);
                
                // Track lab-specific occupancy
                if (session.schedule_type === 'lab') {
                    labOccupiedRooms.add(session.room_id);
                }
            }
        });
        
        // Filter available rooms
        Array.from(this.rooms).forEach(roomStr => {
            const room = JSON.parse(roomStr);
            const roomType = this.getRoomType(room.number);
            
            if (!courseType) {
                // No filter specified - return all non-occupied rooms
                if (!occupiedRooms.has(room.id)) {
                    availableRooms.push(room);
                }
            } else if (courseType === 'lab') {
                // Lab sessions can only use lab rooms that are completely free
                if (roomType === 'lab' && !occupiedRooms.has(room.id)) {
                    availableRooms.push(room);
                }
            } else if (courseType === 'theory') {
                // Theory sessions can use:
                // 1. Theory rooms that are completely free
                // 2. Lab rooms that are NOT occupied by lab sessions
                if (!occupiedRooms.has(room.id)) {
                    // Room is completely free
                    availableRooms.push(room);
                } else if (roomType === 'lab' && !labOccupiedRooms.has(room.id)) {
                    // Lab room is occupied but not by a lab session (theory can share)
                    availableRooms.push(room);
                }
            }
        });
        
        return availableRooms.sort((a, b) => a.number.localeCompare(b.number));
    }

    // Get available teachers for a specific time slot
    getAvailableTeachers(day, timeSlot, excludeSession = null) {
        const availableTeachers = [];
        const occupiedTeachers = new Set();
        
        // Find all teachers occupied at this time slot
        this.allData.forEach(session => {
            if (session === excludeSession) return;
            if (session.day !== day) return;
            
            const sessionTime = this.getTimeKey(session);
            if (sessionTime === timeSlot || this.doTimeSlotsOverlap({
                schedule_type: 'temp',
                time_slot: timeSlot,
                time_range: timeSlot
            }, session)) {
                occupiedTeachers.add(session.teacher_id);
            }
        });
        
        // Filter available teachers
        Array.from(this.teachers).forEach(teacherStr => {
            const teacher = JSON.parse(teacherStr);
            if (!occupiedTeachers.has(teacher.id)) {
                availableTeachers.push(teacher);
            }
        });
        
        return availableTeachers.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Determine room type based on room number
    getRoomType(roomNumber) {
        if (!roomNumber) return 'unknown';
        const room = roomNumber.toString().toLowerCase();
        if (room.includes('lab') || room.includes('comp') || room.includes('cse') || room.includes('it')) {
            return 'lab';
        }
        return 'theory';
    }

    // Check if a specific time slot is free for a room
    isRoomFree(roomId, day, timeSlot) {
        return !this.allData.some(session => {
            if (session.room_id !== roomId || session.day !== day) return false;
            const sessionTime = this.getTimeKey(session);
            return sessionTime === timeSlot || this.doTimeSlotsOverlap({
                schedule_type: 'temp',
                time_slot: timeSlot,
                time_range: timeSlot
            }, session);
        });
    }

    // Check if a specific teacher is free at a time slot
    isTeacherFree(teacherId, day, timeSlot) {
        return !this.allData.some(session => {
            if (session.teacher_id !== teacherId || session.day !== day) return false;
            const sessionTime = this.getTimeKey(session);
            return sessionTime === timeSlot || this.doTimeSlotsOverlap({
                schedule_type: 'temp',
                time_slot: timeSlot,
                time_range: timeSlot
            }, session);
        });
    }

    // Get conflicts for a specific session
    getSessionConflicts(sessionIndex) {
        const session = this.allData[sessionIndex];
        if (!session) return [];
        
        const conflicts = [];
        const sessionTime = this.getTimeKey(session);
        
        // Check for conflicts with other sessions
        this.allData.forEach((otherSession, index) => {
            if (index === sessionIndex) return;
            
            const otherTime = this.getTimeKey(otherSession);
            if (session.day === otherSession.day && 
                (sessionTime === otherTime || this.doTimeSlotsOverlap(session, otherSession))) {
                
                // Teacher conflict
                if (session.teacher_id === otherSession.teacher_id) {
                    conflicts.push({
                        type: 'teacher_conflict',
                        message: `Teacher ${session.teacher_name} has another session`,
                        conflictingSession: otherSession,
                        conflictingIndex: index
                    });
                }
                
                // Room conflict
                if (session.room_id === otherSession.room_id) {
                    conflicts.push({
                        type: 'room_conflict',
                        message: `Room ${session.room_number} is already booked`,
                        conflictingSession: otherSession,
                        conflictingIndex: index
                    });
                }
                
                // ✅ Group conflicts removed: Different courses in same group are now allowed
                // No longer reporting group conflicts for different courses in same group
            }
        });
        
        return conflicts;
    }

    // Get conflict summary
    getConflictSummary() {
        const summary = {
            total: this.conflicts.length,
            byType: {},
            bySeverity: { high: 0, medium: 0, low: 0 }
        };

        this.conflicts.forEach(conflict => {
            // Count by type
            summary.byType[conflict.type] = (summary.byType[conflict.type] || 0) + 1;
            
            // Count by severity
            summary.bySeverity[conflict.severity] = (summary.bySeverity[conflict.severity] || 0) + 1;
        });

        return summary;
    }

    // Search sessions
    searchSessions(query) {
        const lowerQuery = query.toLowerCase();
        return this.allData.filter(session => {
            return (
                (session.course_code && session.course_code.toLowerCase().includes(lowerQuery)) ||
                (session.course_name && session.course_name.toLowerCase().includes(lowerQuery)) ||
                (session.teacher_name && session.teacher_name.toLowerCase().includes(lowerQuery)) ||
                (session.room_number && session.room_number.toLowerCase().includes(lowerQuery)) ||
                (session.group_name && session.group_name.toLowerCase().includes(lowerQuery))
            );
        });
    }

    // Export updated schedule data
    exportScheduleData() {
        return {
            labData: this.labData,
            theoryData: this.theoryData,
            allData: this.allData,
            conflicts: this.conflicts,
            conflictSummary: this.getConflictSummary()
        };
    }
}

// Global allocation manager instance
window.allocationManager = new AllocationManager();

// Manual conflict detection refresh function
async function refreshConflictDetection() {
    if (!allocationManager.allData || allocationManager.allData.length === 0) {
        showAlert('warning', 'No data loaded to refresh conflicts for');
        return;
    }

    try {
        console.log('🔄 Manually refreshing conflict detection...');
        
        // Clear existing conflicts
        allocationManager.conflicts = [];
        
        // Run conflict detection
        allocationManager.detectAllConflicts();
        
        // Update UI
        renderStatistics();
        renderConflicts();
        
        showAlert('success', `Conflict detection refreshed. Found ${allocationManager.conflicts.length} conflicts.`);
        console.log(`✅ Manual refresh complete - found ${allocationManager.conflicts.length} conflicts`);
        
    } catch (error) {
        console.error('Error refreshing conflict detection:', error);
        showAlert('error', 'Failed to refresh conflict detection: ' + error.message);
    }
}

// Manual duplicate cleaning function
async function cleanDuplicates() {
    if (!allocationManager.allData || allocationManager.allData.length === 0) {
        showAlert('warning', 'No data loaded to clean duplicates from');
        return;
    }

    const originalCount = allocationManager.allData.length;
    
    // Run duplicate detection and removal
    allocationManager.detectAndHandleDuplicates();
    
    const newCount = allocationManager.allData.length;
    const removedCount = originalCount - newCount;
    
    if (removedCount > 0) {
        // Refresh UI
        renderStatistics();
        renderConflicts();
        
        showAlert('success', `Successfully removed ${removedCount} duplicate session${removedCount > 1 ? 's' : ''} from the dataset`);
    } else {
        showAlert('info', 'No duplicate sessions found in the dataset');
    }
}

// UI Management Functions
let currentEditingSession = null;

async function initializeAllocationManager() {
    console.log('🚀 Initializing Allocation Manager...');
    
    try {
        // Show loading state
        document.getElementById('loadingState').classList.remove('d-none');
        document.getElementById('mainContent').classList.add('d-none');

        // Initialize allocation manager instance
        if (!window.allocationManager) {
            console.log('📊 Creating AllocationManager instance...');
            window.allocationManager = new AllocationManager();
        }

        // Load schedule data with detailed progress
        console.log('📥 Loading schedule data...');
        const result = await allocationManager.loadScheduleData();
        
        if (result.success) {
            console.log('✅ Data loaded successfully, initializing UI...');
            
            // Hide loading and show main content
            document.getElementById('loadingState').classList.add('d-none');
            document.getElementById('mainContent').classList.remove('d-none');
            
            // Initialize UI components
            console.log('🎨 Rendering UI components...');
            renderStatistics();
            renderConflicts();
            setupEventListeners();
            
            // Add conflict detection completion listener
            document.addEventListener('conflictDetectionComplete', (event) => {
                console.log(`🔍 Conflict detection completed: ${event.detail.conflicts} conflicts found`);
                renderConflicts(); // Refresh conflicts display
                renderStatistics(); // Update statistics
            });
            
            console.log('✅ Allocation Manager initialized successfully');
        } else {
            throw new Error(result.message || 'Unknown error during data loading');
        }
    } catch (error) {
        console.error('❌ Failed to initialize Allocation Manager:', error);
        
        // Provide detailed error information and troubleshooting
        let errorDetails = error.message || 'Unknown error occurred';
        let troubleshootingTips = '';
        
        if (errorDetails.includes('fetch') || errorDetails.includes('Network') || errorDetails.includes('files not found')) {
            troubleshootingTips = `
                <div class="mt-3">
                    <h6><i class="fas fa-tools me-2"></i>Troubleshooting Tips:</h6>
                    <ul class="text-start small">
                        <li>Verify that <code>combined_lab_schedule.json</code> and <code>combined_theory_schedule.json</code> exist in the <code>./output/</code> directory</li>
                        <li>Ensure the web server is running and serving files correctly</li>
                        <li>Check browser console (F12) for more detailed network errors</li>
                        <li>Try refreshing the page or clearing browser cache</li>
                    </ul>
                </div>
            `;
        } else if (errorDetails.includes('JSON')) {
            troubleshootingTips = `
                <div class="mt-3">
                    <h6><i class="fas fa-tools me-2"></i>Troubleshooting Tips:</h6>
                    <ul class="text-start small">
                        <li>The data files may be corrupted or have invalid JSON format</li>
                        <li>Check the browser console (F12) for detailed JSON parsing errors</li>
                        <li>Try regenerating the schedule data files using the scheduler</li>
                        <li>Validate JSON files using an online JSON validator</li>
                    </ul>
                </div>
            `;
        } else {
            troubleshootingTips = `
                <div class="mt-3">
                    <h6><i class="fas fa-tools me-2"></i>Troubleshooting Tips:</h6>
                    <ul class="text-start small">
                        <li>Check browser console (F12) for detailed error messages</li>
                        <li>Ensure all required JavaScript files are loaded properly</li>
                        <li>Try accessing the scheduler page first to verify data integrity</li>
                        <li>Contact system administrator if the problem persists</li>
                    </ul>
                </div>
            `;
        }
        
        document.getElementById('loadingState').innerHTML = `
            <div class="alert alert-danger text-center">
                <div class="mb-3">
                    <i class="fas fa-exclamation-triangle fa-3x text-danger"></i>
                </div>
                <h4>Error Loading Data</h4>
                <p class="mb-3"><strong>${errorDetails}</strong></p>
                <p>Please ensure the schedule data files are available and try refreshing the page.</p>
                ${troubleshootingTips}
                                 <div class="mt-4">
                     <button class="btn btn-primary me-2" onclick="location.reload()">
                         <i class="fas fa-refresh me-1"></i>
                         Refresh Page
                     </button>
                     <button class="btn btn-secondary me-2" onclick="initializeAllocationManager()">
                         <i class="fas fa-redo me-1"></i>
                         Retry Loading
                     </button>
                     <a href="schedule_website.html" class="btn btn-info me-2">
                         <i class="fas fa-calendar me-1"></i>
                         Go to Scheduler
                     </a>
                     <a href="diagnostics.html" class="btn btn-warning">
                         <i class="fas fa-stethoscope me-1"></i>
                         Run Diagnostics
                     </a>
                 </div>
                <div class="mt-3">
                    <small class="text-muted">
                        <i class="fas fa-info-circle me-1"></i>
                        Check browser console (F12 → Console) for detailed technical information
                    </small>
                </div>
            </div>
        `;
    }
}

function renderStatistics() {
    const stats = {
        totalSessions: allocationManager.allData.length,
        labSessions: allocationManager.labData.length,
        theorySessions: allocationManager.theoryData.length,
        totalConflicts: allocationManager.conflicts.length,
        highSeverityConflicts: allocationManager.conflicts.filter(c => c.severity === 'high').length,
        teachers: allocationManager.teachers.size,
        rooms: allocationManager.rooms.size
    };

    const statsGrid = document.getElementById('statsGrid');
    statsGrid.innerHTML = `
        <div class="stats-card">
            <div class="stats-number text-primary">${stats.totalSessions}</div>
            <div class="text-muted">Total Sessions</div>
        </div>
        <div class="stats-card">
            <div class="stats-number text-info">${stats.labSessions}</div>
            <div class="text-muted">Lab Sessions</div>
        </div>
        <div class="stats-card">
            <div class="stats-number text-success">${stats.theorySessions}</div>
            <div class="text-muted">Theory Sessions</div>
        </div>
        <div class="stats-card">
            <div class="stats-number text-danger">${stats.totalConflicts}</div>
            <div class="text-muted">Total Conflicts</div>
        </div>
        <div class="stats-card">
            <div class="stats-number text-warning">${stats.highSeverityConflicts}</div>
            <div class="text-muted">High Priority</div>
        </div>
        <div class="stats-card">
            <div class="stats-number text-secondary">${stats.teachers}</div>
            <div class="text-muted">Teachers</div>
        </div>
        <div class="stats-card">
            <div class="stats-number text-secondary">${stats.rooms}</div>
            <div class="text-muted">Rooms</div>
        </div>
    `;
}

function renderConflicts() {
    const conflictsContainer = document.getElementById('conflictsContainer');
    const conflictCount = document.getElementById('conflictCount');
    
    conflictCount.textContent = allocationManager.conflicts.length;

    if (allocationManager.conflicts.length === 0) {
        conflictsContainer.innerHTML = `
            <div class="p-4 text-center text-success">
                <i class="fas fa-check-circle fa-3x mb-3"></i>
                <h5>No Conflicts Detected</h5>
                <p class="text-muted">All sessions are properly scheduled without conflicts.</p>
            </div>
        `;
        return;
    }

    let html = '';
    allocationManager.conflicts.forEach((conflict, index) => {
        const severityClass = `conflict-${conflict.severity}`;
        const severityIcon = conflict.severity === 'high' ? 'fas fa-exclamation-triangle' : 
                            conflict.severity === 'medium' ? 'fas fa-exclamation-circle' : 'fas fa-info-circle';
        
        html += `
            <div class="card ${severityClass} mb-3">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h6 class="card-title">
                                <i class="${severityIcon} me-2"></i>
                                ${conflict.message}
                            </h6>
                            <p class="card-text text-muted mb-2">${conflict.type.replace('_', ' ').toUpperCase()}</p>
                        </div>
                        <span class="badge bg-${conflict.severity === 'high' ? 'danger' : conflict.severity === 'medium' ? 'warning' : 'info'}">${conflict.severity}</span>
                    </div>
                    
                    <div class="mt-3">
                        <h6 class="small text-muted">Affected Sessions:</h6>
                        ${conflict.sessions.map(session => `
                            <div class="session-card" onclick="editSession(${session.originalIndex})">
                                <div class="d-flex justify-content-between">
                                    <div>
                                        <strong>${session.course_code}</strong> - ${session.course_name || 'N/A'}
                                    </div>
                                    <small class="text-muted">${session.schedule_type.toUpperCase()}</small>
                                </div>
                                <div class="session-details">
                                    <div>Teacher: ${session.teacher_name}</div>
                                    <div>Room: ${session.room_number} (${session.block})</div>
                                    <div>Time: ${session.day} ${allocationManager.getTimeKey(session)}</div>
                                    <div>Group: ${session.group_name}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    });

    conflictsContainer.innerHTML = html;
}

function setupEventListeners() {
    // Session search functionality
    const searchBtn = document.getElementById('searchBtn');
    const sessionSearch = document.getElementById('sessionSearch');

    searchBtn.addEventListener('click', performSessionSearch);
    sessionSearch.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSessionSearch();
        }
    });

    // Modal event listeners
    const validateBtn = document.getElementById('validateBtn');
    const saveBtn = document.getElementById('saveBtn');

    if (validateBtn) {
        validateBtn.addEventListener('click', validateSessionChanges);
    }
    
    if (saveBtn) {
        saveBtn.addEventListener('click', saveSessionChanges);
    }
}

function performSessionSearch() {
    const query = document.getElementById('sessionSearch').value.trim();
    const searchResults = document.getElementById('searchResults');

    if (query.length < 2) {
        searchResults.style.display = 'none';
        return;
    }

    const results = allocationManager.searchSessions(query);
    
    if (results.length === 0) {
        searchResults.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                No sessions found matching "${query}"
            </div>
        `;
        searchResults.style.display = 'block';
        return;
    }

    let html = `<div class="mb-2"><strong>Search Results (${results.length} found):</strong></div>`;
    
    results.slice(0, 20).forEach((session, index) => {
        const sessionIndex = allocationManager.allData.indexOf(session);
        html += `
            <div class="session-card" onclick="editSession(${sessionIndex})">
                <div class="d-flex justify-content-between">
                    <div>
                        <strong>${session.course_code}</strong> - ${session.course_name || 'N/A'}
                    </div>
                    <small class="text-muted">${session.schedule_type.toUpperCase()}</small>
                </div>
                <div class="session-details">
                    <div>Teacher: ${session.teacher_name}</div>
                    <div>Room: ${session.room_number} (${session.block})</div>
                    <div>Time: ${session.day} ${allocationManager.getTimeKey(session)}</div>
                    <div>Group: ${session.group_name}</div>
                </div>
            </div>
        `;
    });

    if (results.length > 20) {
        html += `<div class="text-muted text-center">... and ${results.length - 20} more results</div>`;
    }

    searchResults.innerHTML = html;
    searchResults.style.display = 'block';
}

function editSession(sessionIndex) {
    currentEditingSession = allocationManager.allData[sessionIndex];
    populateEditModal(currentEditingSession);
    
    const modal = new bootstrap.Modal(document.getElementById('editSessionModal'));
    modal.show();
}

function populateEditModal(session) {
    // Populate basic fields
    document.getElementById('editCourseCode').value = session.course_code || '';
    document.getElementById('editCourseName').value = session.course_name || '';
    document.getElementById('editDay').value = session.day || '';
    document.getElementById('editSessionType').value = session.schedule_type || '';
    document.getElementById('editGroup').value = session.group_name || '';
    document.getElementById('editStudentCount').value = session.student_count || '';
    document.getElementById('editRoomCapacity').value = session.capacity || '';

    // Populate time slot
    const timeSlot = allocationManager.getTimeKey(session);
    populateTimeSlots(session.schedule_type, timeSlot);

    // Populate teachers dropdown
    populateTeachersDropdown(session.teacher_id);

    // Populate rooms dropdown
    populateRoomsDropdown(session.room_id);
}

function populateTimeSlots(sessionType, currentTimeSlot) {
    const timeSlotSelect = document.getElementById('editTimeSlot');
    timeSlotSelect.innerHTML = '<option value="">Select Time Slot</option>';

    if (sessionType === 'lab') {
        Object.entries(allocationManager.timeSlots.lab).forEach(([key, value]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `${key} (${value})`;
            option.selected = (key === currentTimeSlot || value === currentTimeSlot);
            timeSlotSelect.appendChild(option);
        });
    } else {
        allocationManager.timeSlots.theory.forEach(slot => {
            const option = document.createElement('option');
            option.value = slot;
            option.textContent = slot;
            option.selected = (slot === currentTimeSlot);
            timeSlotSelect.appendChild(option);
        });
    }
}

function populateTeachersDropdown(currentTeacherId) {
    const teacherSelect = document.getElementById('editTeacher');
    teacherSelect.innerHTML = '<option value="">Select Teacher</option>';

    Array.from(allocationManager.teachers).forEach(teacherStr => {
        const teacher = JSON.parse(teacherStr);
        const option = document.createElement('option');
        option.value = teacher.id;
        option.textContent = `${teacher.name} (${teacher.staff_code})`;
        option.selected = (teacher.id == currentTeacherId);
        teacherSelect.appendChild(option);
    });
}

function populateRoomsDropdown(currentRoomId) {
    const roomSelect = document.getElementById('editRoom');
    roomSelect.innerHTML = '<option value="">Select Room</option>';

    Array.from(allocationManager.rooms).forEach(roomStr => {
        const room = JSON.parse(roomStr);
        const option = document.createElement('option');
        option.value = room.id;
        option.textContent = `${room.number} (${room.block}) - Capacity: ${room.capacity}`;
        option.selected = (room.id == currentRoomId);
        roomSelect.appendChild(option);
    });
}

function validateSessionChanges() {
    if (!currentEditingSession) return;

    // Get updated values from form
    const updatedSession = { ...currentEditingSession };
    updatedSession.day = document.getElementById('editDay').value;
    updatedSession.teacher_id = document.getElementById('editTeacher').value;
    updatedSession.room_id = document.getElementById('editRoom').value;
    updatedSession.student_count = parseInt(document.getElementById('editStudentCount').value) || updatedSession.student_count;

    // Update time slot
    const timeSlot = document.getElementById('editTimeSlot').value;
    if (updatedSession.schedule_type === 'lab') {
        updatedSession.session_name = timeSlot;
        updatedSession.time_range = allocationManager.timeSlots.lab[timeSlot];
    } else {
        updatedSession.time_slot = timeSlot;
    }

    // Update teacher and room details
    if (updatedSession.teacher_id) {
        const teacherData = Array.from(allocationManager.teachers)
            .map(t => JSON.parse(t))
            .find(t => t.id == updatedSession.teacher_id);
        if (teacherData) {
            updatedSession.teacher_name = teacherData.name;
            updatedSession.staff_code = teacherData.staff_code;
        }
    }

    if (updatedSession.room_id) {
        const roomData = Array.from(allocationManager.rooms)
            .map(r => JSON.parse(r))
            .find(r => r.id == updatedSession.room_id);
        if (roomData) {
            updatedSession.room_number = roomData.number;
            updatedSession.block = roomData.block;
            updatedSession.capacity = roomData.capacity;
        }
    }

    // Validate the changes
    const validation = allocationManager.validateAllocation(updatedSession, currentEditingSession);
    
    // Display validation results
    displayValidationResults(validation);
    
    // Enable/disable save button
    document.getElementById('saveBtn').disabled = !validation.isValid;
}

function displayValidationResults(validation) {
    const validationResults = document.getElementById('validationResults');
    
    if (validation.isValid) {
        validationResults.innerHTML = `
            <div class="validation-result validation-success">
                <i class="fas fa-check-circle me-2"></i>
                <strong>Validation Passed</strong>
                <p class="mb-0">The proposed changes are valid and can be applied.</p>
                ${validation.warnings.length > 0 ? `
                    <div class="mt-2">
                        <small><strong>Warnings:</strong></small>
                        <ul class="mb-0">
                            ${validation.warnings.map(w => `<li>${w.message}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    } else {
        validationResults.innerHTML = `
            <div class="validation-result validation-error">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Validation Failed</strong>
                <p>The following conflicts were detected:</p>
                <ul>
                    ${validation.conflicts.map(c => `<li>${c.message}</li>`).join('')}
                </ul>
                ${validation.warnings.length > 0 ? `
                    <div class="mt-2">
                        <small><strong>Warnings:</strong></small>
                        <ul class="mb-0">
                            ${validation.warnings.map(w => `<li>${w.message}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }
}

async function saveSessionChanges() {
    if (!currentEditingSession) return;

    const sessionIndex = allocationManager.allData.indexOf(currentEditingSession);
    if (sessionIndex === -1) return;

    // Get updated session data (same as in validate function)
    const updatedSession = { ...currentEditingSession };
    updatedSession.day = document.getElementById('editDay').value;
    updatedSession.teacher_id = document.getElementById('editTeacher').value;
    updatedSession.room_id = document.getElementById('editRoom').value;
    updatedSession.student_count = parseInt(document.getElementById('editStudentCount').value) || updatedSession.student_count;

    // Update time slot
    const timeSlot = document.getElementById('editTimeSlot').value;
    if (updatedSession.schedule_type === 'lab') {
        updatedSession.session_name = timeSlot;
        updatedSession.time_range = allocationManager.timeSlots.lab[timeSlot];
    } else {
        updatedSession.time_slot = timeSlot;
    }

    // Update teacher and room details
    if (updatedSession.teacher_id) {
        const teacherData = Array.from(allocationManager.teachers)
            .map(t => JSON.parse(t))
            .find(t => t.id == updatedSession.teacher_id);
        if (teacherData) {
            updatedSession.teacher_name = teacherData.name;
            updatedSession.staff_code = teacherData.staff_code;
        }
    }

    if (updatedSession.room_id) {
        const roomData = Array.from(allocationManager.rooms)
            .map(r => JSON.parse(r))
            .find(r => r.id == updatedSession.room_id);
        if (roomData) {
            updatedSession.room_number = roomData.number;
            updatedSession.block = roomData.block;
            updatedSession.capacity = roomData.capacity;
        }
    }

    try {
        const result = await allocationManager.applyAllocationChange(sessionIndex, updatedSession);
        
        if (result.success) {
            // Save changes to JSON files
            await saveChangesToJsonFiles();
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('editSessionModal'));
            modal.hide();
            
            // Refresh UI
            renderStatistics();
            renderConflicts();
            
            // Show success message
            showAlert('success', 'Session updated successfully! Changes saved to JSON files.');
            
            // Clear current editing session
            currentEditingSession = null;
        } else {
            showAlert('danger', `Failed to save changes: ${result.message}`);
        }
    } catch (error) {
        console.error('Error saving session changes:', error);
        showAlert('danger', 'An error occurred while saving changes.');
    }
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

// ==== JSON FILE PERSISTENCE FUNCTIONS ====

// Save changes directly to the original JSON files
async function saveChangesToJsonFiles() {
    try {
        console.log('💾 Saving allocation changes to original JSON and CSV files...');
        
        // Save updated data directly to original files (server creates backups automatically)
        await saveUpdatedJsonAndCsvFiles();
        
        console.log('✅ Allocation changes saved to original JSON and CSV files successfully');
        showAlert('success', 'Changes saved to original JSON and CSV files successfully!');
        
    } catch (error) {
        console.error('❌ Error saving changes to JSON and CSV files:', error);
        showAlert('danger', 'Failed to save changes to JSON and CSV files: ' + error.message);
    }
}

// Create backup copies of the original JSON files
async function createBackupFiles() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        
        // Create backup data objects
        const backupData = {
            lab: [...allocationManager.labData],
            theory: [...allocationManager.theoryData],
            timestamp: timestamp,
            originalFiles: {
                lab: './output/combined_lab_schedule.json',
                theory: './output/combined_theory_schedule.json'
            }
        };
        
        // Store backup in localStorage
        localStorage.setItem('allocation_backup_' + timestamp, JSON.stringify(backupData));
        
        // Create downloadable backup files
        downloadBackupFiles(backupData);
        
        console.log(`✅ Allocation Manager backup created: ${timestamp}`);
        
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

// Save updated JSON and CSV files directly to the original files
async function saveUpdatedJsonAndCsvFiles() {
    try {
        console.log('📤 Saving allocation data to original JSON and CSV files...');
        
        // Convert data to CSV format
        const labCsvData = convertLabDataToCSV(allocationManager.labData);
        const theoryCsvData = convertTheoryDataToCSV(allocationManager.theoryData);
        
        // Save both JSON and CSV files simultaneously
        const savePromises = [
            // JSON files
            saveJsonToServer(allocationManager.labData, './output/combined_lab_schedule.json'),
            saveJsonToServer(allocationManager.theoryData, './output/combined_theory_schedule.json'),
            // CSV files
            saveCsvToServer(labCsvData, './output/combined_schedule_lab.csv'),
            saveCsvToServer(theoryCsvData, './output/combined_schedule_theory.csv')
        ];
        
        const results = await Promise.all(savePromises);
        
        console.log('✅ All allocation files saved to original location successfully (JSON + CSV)');
        console.log(`   - Lab sessions: ${allocationManager.labData.length} saved (JSON + CSV)`);
        console.log(`   - Theory sessions: ${allocationManager.theoryData.length} saved (JSON + CSV)`);
        
        return results;
        
    } catch (error) {
        console.error('❌ Error saving updated JSON and CSV files:', error);
        throw new Error(`Failed to save allocation files to original location: ${error.message}`);
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
                    <button type="button" class="btn btn-primary" onclick="downloadAllFilesAllocation()">
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

// Download all files again (allocation manager version)
function downloadAllFilesAllocation() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    
    // Download updated files
    downloadJsonFile(allocationManager.labData, 'combined_lab_schedule.json');
    downloadJsonFile(allocationManager.theoryData, 'combined_theory_schedule.json');
    
    // Download backup files
    downloadJsonFile(allocationManager.labData, `combined_lab_schedule_backup_${timestamp}.json`);
    downloadJsonFile(allocationManager.theoryData, `combined_theory_schedule_backup_${timestamp}.json`);
    
    showAlert('success', 'All files downloaded successfully!');
}

// ==== BACKUP MANAGEMENT FUNCTIONS ====

// List all available backups
function listAvailableBackups() {
    const backups = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('schedule_backup_') || key.startsWith('allocation_backup_'))) {
            try {
                const backup = JSON.parse(localStorage.getItem(key));
                backups.push({
                    key: key,
                    timestamp: backup.timestamp,
                    labSessions: backup.lab.length,
                    theorySessions: backup.theory.length,
                    source: key.startsWith('schedule_') ? 'Interactive Scheduler' : 'Allocation Manager'
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
        
        // Restore data to allocation manager
        allocationManager.labData = [...backupData.lab];
        allocationManager.theoryData = [...backupData.theory];
        allocationManager.allData = [...backupData.lab, ...backupData.theory];
        
        // Re-extract unique values and detect conflicts
        allocationManager.extractUniqueValues();
        allocationManager.detectAllConflicts();
        
        // Refresh UI
        renderStatistics();
        renderConflicts();
        
        showAlert('success', `Restored from backup: ${backupData.timestamp}`);
        
    } catch (error) {
        console.error('Error restoring backup:', error);
        showAlert('danger', 'Failed to restore backup: ' + error.message);
    }
}

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
                                        <th>Source</th>
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
                                                <span class="badge ${backup.source === 'Interactive Scheduler' ? 'bg-info' : 'bg-primary'}">${backup.source}</span>
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
        showAlert('success', 'Backup deleted successfully');
        
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
            if (key && (key.startsWith('schedule_backup_') || key.startsWith('allocation_backup_'))) {
                keys.push(key);
            }
        }
        
        keys.forEach(key => localStorage.removeItem(key));
        
        showAlert('success', `${keys.length} backups cleared successfully`);
        
        // Refresh backup manager
        const modal = document.getElementById('backupManagerModal');
        if (modal) {
            bootstrap.Modal.getInstance(modal).hide();
            setTimeout(() => showBackupManager(), 300);
        }
    }
}

// Global allocation manager instance
window.allocationManager = new AllocationManager(); 

// Convert JSON data to CSV format for lab sessions
function convertLabDataToCSV(labData) {
    const headers = [
        'day', 'session_name', 'time_range', 'course_instance_id', 'course_code', 
        'course_code_display', 'course_name', 'practical_hours', 'teacher_id', 
        'teacher_name', 'staff_code', 'room_id', 'room_number', 'block', 'capacity',
        'student_count', 'total_students', 'is_batched', 'batch_info', 'num_batches',
        'schedule_type', 'group_name', 'group_index', 'department', 'semester',
        'day_pattern', 'is_co_scheduled', 'co_schedule_id', 'co_schedule_group_size',
        'co_schedule_partner_teachers', 'co_schedule_info'
    ];
    
    const csvRows = [headers.join(',')];
    
    labData.forEach(session => {
        const row = [
            session.day || '',
            session.session_name || '',
            session.time_range || '',
            session.course_instance_id || '',
            session.course_code || '',
            session.course_code_display || session.course_code || '',
            session.course_name || '',
            session.practical_hours || '2',
            session.teacher_id || '',
            session.teacher_name || '',
            session.staff_code || '',
            session.room_id || '',
            session.room_number || '',
            session.block || '',
            session.capacity || '',
            session.student_count || '',
            session.total_students || session.student_count || '',
            session.is_batched ? 'TRUE' : 'FALSE',
            session.batch_info || '',
            session.num_batches || '1',
            'lab',
            session.group_name || '',
            session.group_index || '',
            session.department || '',
            session.semester || '',
            session.day_pattern || '',
            session.is_co_scheduled ? 'TRUE' : 'FALSE',
            session.co_schedule_id || '',
            session.co_schedule_group_size || '1',
            session.co_schedule_partner_teachers || '',
            session.co_schedule_info || 'Single session'
        ];
        
        // Escape commas and quotes in CSV fields
        const escapedRow = row.map(field => {
            const fieldStr = String(field);
            if (fieldStr.includes(',') || fieldStr.includes('"') || fieldStr.includes('\n')) {
                return `"${fieldStr.replace(/"/g, '""')}"`;
            }
            return fieldStr;
        });
        
        csvRows.push(escapedRow.join(','));
    });
    
    return csvRows.join('\n');
}

// Convert JSON data to CSV format for theory sessions
function convertTheoryDataToCSV(theoryData) {
    const headers = [
        'day', 'time_slot', 'slot_index', 'course_instance_id', 'course_code',
        'course_name', 'session_type', 'session_number', 'teacher_id', 'teacher_name',
        'staff_code', 'room_id', 'room_number', 'block', 'student_count',
        'lecture_hours', 'tutorial_hours', 'schedule_type', 'is_co_scheduled',
        'capacity_info', 'partner_instance_id', 'group_name', 'group_index',
        'department', 'semester', 'day_pattern'
    ];
    
    const csvRows = [headers.join(',')];
    
    theoryData.forEach(session => {
        // Calculate slot_index from time_slot
        const timeSlotToIndex = {
            '8:00 - 8:50': 0, '9:00 - 9:50': 1, '10:00 - 10:50': 2,
            '11:00 - 11:50': 3, '12:00 - 12:50': 4, '1:00 - 1:50': 5,
            '2:00 - 2:50': 6, '3:00 - 3:50': 7, '4:00 - 4:50': 8,
            '5:00 - 5:50': 9, '6:00 - 6:50': 10
        };
        
        const row = [
            session.day || '',
            session.time_slot || '',
            timeSlotToIndex[session.time_slot] !== undefined ? timeSlotToIndex[session.time_slot] : '',
            session.course_instance_id || '',
            session.course_code || '',
            session.course_name || '',
            session.session_type || 'Lecture',
            session.session_number || '1',
            session.teacher_id || '',
            session.teacher_name || '',
            session.staff_code || '',
            session.room_id || '',
            session.room_number || '',
            session.block || '',
            session.student_count || '70',
            session.lecture_hours || '3',
            session.tutorial_hours || '0',
            'theory',
            session.is_co_scheduled ? 'TRUE' : 'FALSE',
            session.capacity_info || `Regular: ${session.student_count || '70'} students`,
            session.partner_instance_id || '',
            session.group_name || '',
            session.group_index || '',
            session.department || '',
            session.semester || '',
            session.day_pattern || ''
        ];
        
        // Escape commas and quotes in CSV fields
        const escapedRow = row.map(field => {
            const fieldStr = String(field);
            if (fieldStr.includes(',') || fieldStr.includes('"') || fieldStr.includes('\n')) {
                return `"${fieldStr.replace(/"/g, '""')}"`;
            }
            return fieldStr;
        });
        
        csvRows.push(escapedRow.join(','));
    });
    
    return csvRows.join('\n');
}

// Save CSV data to server via API
async function saveCsvToServer(csvData, filepath) {
    console.log(`📡 Sending CSV data to ${filepath}...`);
    
    const response = await fetch('/api/save-csv', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            data: csvData,
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

