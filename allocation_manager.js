// Enhanced Allocation Manager - Advanced Conflict Detection and Schedule Management
// Based on combined_scheduler.py logic for comprehensive validation
class AllocationManager {
    constructor() {
        this.labData = [];
        this.theoryData = [];
        this.allData = [];
        this.conflicts = [];
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

    // Load existing schedule data
    async loadScheduleData() {
        try {
            const [labRes, theoryRes] = await Promise.all([
                fetch('./output/combined_lab_schedule.json'),
                fetch('./output/combined_theory_schedule.json')
            ]);
            
            this.labData = await labRes.json();
            this.theoryData = await theoryRes.json();
            this.allData = [...this.labData, ...this.theoryData];
            
            // Enhanced data processing (matching Python scheduler)
            this.extractUniqueValues();
            this.identifyCrossDepartmentTeachers();
            this.setupDepartmentDayPatterns();
            this.initializeGlobalRoomRegistry();
            
            // Perform comprehensive conflict detection
            this.detectAllConflicts();
            
            return { success: true, message: 'Schedule data loaded successfully' };
        } catch (error) {
            console.error('Error loading schedule data:', error);
            return { success: false, message: 'Failed to load schedule data', error };
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
                this.rooms.add(JSON.stringify({
                    id: session.room_id,
                    number: session.room_number,
                    block: session.block,
                    capacity: session.capacity || 35
                }));
                
                // Track room types and capacities
                this.roomTypes.set(session.room_id, this.getRoomType(session.room_number));
                this.roomCapacities.set(session.room_id, session.capacity || 35);
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
            }
        });
        
        // Filter available rooms
        Array.from(this.rooms).forEach(roomStr => {
            const room = JSON.parse(roomStr);
            if (!occupiedRooms.has(room.id)) {
                // If course type is specified, filter by room type
                const roomType = this.getRoomType(room.number);
                if (!courseType || 
                    (courseType === 'lab' && roomType === 'lab') ||
                    (courseType === 'theory' && roomType === 'theory')) {
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
                
                // Group conflict (only if different courses)
                if (session.group_name === otherSession.group_name && 
                    session.course_instance_id !== otherSession.course_instance_id) {
                    conflicts.push({
                        type: 'group_conflict',
                        message: `Group ${session.group_name} has another course`,
                        conflictingSession: otherSession,
                        conflictingIndex: index
                    });
                }
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
                                    ['ME', 'CE']  // Mechanical & Civil (if applicable)
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
                        
                        // ✅ ALLOW: Different courses in same group are now allowed
                        return { 
                            allowed: true, 
                            reason: "Different courses allowed in same group", 
                            rule: "Removed group conflict constraint per user request" 
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
                        // ✅ ALLOW: Different courses in same group are now allowed
                        sessions.forEach(s => {
                            s.session.is_different_course_allowed = true;
                            s.session.co_schedule_info = `✅ ${validationResult.reason} (${validationResult.rule})`;
                        });
                        console.log(`✅ Different courses allowed: ${sessions[0].session.group_name} - ${validationResult.reason} (${validationResult.rule})`);
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
        
        // Remove original session if editing
        if (originalSession) {
            tempData = tempData.filter(s => s !== originalSession);
        }
        
        // Add new session
        tempData.push(newSession);

        // Check for conflicts with the new session
        const conflictChecks = [
            this.checkTeacherAvailability(newSession, tempData),
            this.checkRoomAvailability(newSession, tempData),
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
            s !== newSession
        );

        teacherSessions.forEach(session => {
            if (this.doTimeSlotsOverlap(newSession, session)) {
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
            s !== newSession
        );

        roomSessions.forEach(session => {
            if (this.doTimeSlotsOverlap(newSession, session)) {
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

    // Check group availability (enhanced with co-scheduling rules from combined_scheduler.py)
    checkGroupAvailability(newSession, tempData) {
        const conflicts = [];
        const warnings = [];
        
        const groupSessions = tempData.filter(s => 
            s.group_name === newSession.group_name &&
            s.day === newSession.day &&
            s !== newSession &&
            this.doTimeSlotsOverlap(newSession, s)
        );

        if (groupSessions.length > 0) {
            // Get all sessions including the new one for co-scheduling analysis
            const allSessions = [...groupSessions, newSession];
            const courseCodes = allSessions.map(s => s.course_code);
            const uniqueCourseCodes = [...new Set(courseCodes)];
            
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
                
                // ✅ RULE 7: Same course instance IDs (different teacher sections) 
                const courseInstanceIds = allSessions.map(s => s.course_instance_id);
                const uniqueCourseInstances = [...new Set(courseInstanceIds)];
                if (uniqueCourseInstances.length === 1) {
                    return { allowed: true, reason: "Same course instance batching", rule: "Multiple instances of same course" };
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
                    sessions.forEach(s => {
                        s.session.is_cs19_co_scheduled = true;
                        s.session.co_schedule_info = `CS19XXX series co-scheduling (${uniqueCourseCodes.join(', ')})`;
                    });
                    return; // No conflict - CS19XXX series courses can co-schedule
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
                            ['ME', 'CE']  // Mechanical & Civil (if applicable)
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
                
                // ❌ CONFLICT: Different courses not allowed
                return { 
                    allowed: false, 
                    reason: "Different courses in same group", 
                    rule: "Basic group conflict constraint" 
                };
            };
            
            const validationResult = validateCoScheduling();
            
            if (validationResult.allowed) {
                // ✅ CO-SCHEDULING ALLOWED
                warnings.push({
                    type: 'co_scheduling_allowed',
                    message: `✅ Co-scheduling allowed: ${validationResult.reason} - ${uniqueCourseCodes.join(', ')} for group ${newSession.group_name}`,
                    rule: validationResult.rule,
                    note: `${validationResult.reason} per combined_scheduler.py rules`
                });
                console.log(`✅ Co-scheduling allowed: ${newSession.group_name} - ${validationResult.reason} (${validationResult.rule})`);
                return { isValid: true, conflicts: [], warnings: warnings };
            } else {
                // ✅ ALLOW: Different courses in same group are now allowed
                warnings.push({
                    type: 'different_courses_allowed',
                    message: `✅ Different courses allowed: ${validationResult.reason} - ${uniqueCourseCodes.join(', ')} for group ${newSession.group_name}`,
                    rule: validationResult.rule,
                    note: `${validationResult.reason} - constraint removed per user request`
                });
                console.log(`✅ Different courses allowed: ${newSession.group_name} - ${validationResult.reason} (${validationResult.rule})`);
            }
        }

        return {
            isValid: true, // Always valid now since different courses in same group are allowed
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
        const validation = this.validateAllocation(updatedSession, this.allData[sessionIndex]);
        
        if (!validation.isValid) {
            return {
                success: false,
                message: 'Allocation change failed validation',
                conflicts: validation.conflicts,
                warnings: validation.warnings
            };
        }

        // Apply the change
        const originalSession = { ...this.allData[sessionIndex] };
        this.allData[sessionIndex] = { ...updatedSession };

        // Update the appropriate data array
        if (updatedSession.schedule_type === 'lab') {
            const labIndex = this.labData.findIndex(s => s === originalSession);
            if (labIndex >= 0) {
                this.labData[labIndex] = { ...updatedSession };
            }
        } else {
            const theoryIndex = this.theoryData.findIndex(s => s === originalSession);
            if (theoryIndex >= 0) {
                this.theoryData[theoryIndex] = { ...updatedSession };
            }
        }

        // Re-run conflict detection
        this.detectAllConflicts();

        return {
            success: true,
            message: 'Allocation change applied successfully',
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
            }
        });
        
        // Filter available rooms
        Array.from(this.rooms).forEach(roomStr => {
            const room = JSON.parse(roomStr);
            if (!occupiedRooms.has(room.id)) {
                // If course type is specified, filter by room type
                const roomType = this.getRoomType(room.number);
                if (!courseType || 
                    (courseType === 'lab' && roomType === 'lab') ||
                    (courseType === 'theory' && roomType === 'theory')) {
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
                
                // Group conflict (only if different courses)
                if (session.group_name === otherSession.group_name && 
                    session.course_instance_id !== otherSession.course_instance_id) {
                    conflicts.push({
                        type: 'group_conflict',
                        message: `Group ${session.group_name} has another course`,
                        conflictingSession: otherSession,
                        conflictingIndex: index
                    });
                }
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
    try {
        // Show loading state
        document.getElementById('loadingState').classList.remove('d-none');
        document.getElementById('mainContent').classList.add('d-none');

        // Load schedule data
        const result = await allocationManager.loadScheduleData();
        
        if (result.success) {
            // Hide loading and show main content
            document.getElementById('loadingState').classList.add('d-none');
            document.getElementById('mainContent').classList.remove('d-none');
            
            // Initialize UI components
            renderStatistics();
            renderConflicts();
            setupEventListeners();
            
            console.log('Allocation Manager initialized successfully');
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Failed to initialize Allocation Manager:', error);
        document.getElementById('loadingState').innerHTML = `
            <div class="alert alert-danger">
                <h4>Error Loading Data</h4>
                <p>${error.message}</p>
                <p>Please ensure the schedule data files are available and try refreshing the page.</p>
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
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('editSessionModal'));
            modal.hide();
            
            // Refresh UI
            renderStatistics();
            renderConflicts();
            
            // Show success message
            showAlert('success', 'Session updated successfully!');
            
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

// Global allocation manager instance
window.allocationManager = new AllocationManager(); 