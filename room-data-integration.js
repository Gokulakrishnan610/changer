/**
 * Room Data Integration Module
 * Integrates techlongue.csv data with the existing scheduling system
 * Provides enhanced room information, capacities, and features
 */

class RoomDataIntegration {
    constructor() {
        this.roomDatabase = new Map(); // room_id -> room data
        this.roomFeatures = new Map(); // room_id -> features
        this.techLevels = new Map(); // room_id -> tech level
        this.maintenanceStaff = new Map(); // room_id -> maintenance staff
        this.loaded = false;
    }

    /**
     * Load and parse the techlongue.csv file
     */
    async loadRoomDatabase() {
        try {
            console.log('🏢 Loading room database from techlongue.csv...');
            
            const response = await fetch('./techlongue.csv');
            if (!response.ok) {
                throw new Error(`Failed to load techlongue.csv: ${response.status}`);
            }
            
            const csvText = await response.text();
            const lines = csvText.split('\n').filter(line => line.trim());
            
            // Skip header
            const dataLines = lines.slice(1);
            
            dataLines.forEach(line => {
                const columns = line.split(',');
                if (columns.length >= 15) {
                    const roomData = {
                        id: parseInt(columns[0]),
                        room_number: columns[1],
                        block: columns[2],
                        description: columns[3],
                        is_lab: parseInt(columns[4]) === 1,
                        room_type: columns[5],
                        room_min_cap: parseInt(columns[6]),
                        room_max_cap: parseInt(columns[7]),
                        has_projector: parseInt(columns[8]) === 1,
                        has_ac: parseInt(columns[9]) === 1,
                        tech_level: columns[10],
                        maintained_by_id: parseInt(columns[11]),
                        green_board: parseInt(columns[12]) === 1,
                        isLcsAvailable: parseInt(columns[13]) === 1,
                        smart_board: parseInt(columns[14]) === 1
                    };
                    
                    this.roomDatabase.set(roomData.id, roomData);
                    
                    // Store features separately for quick access
                    this.roomFeatures.set(roomData.id, {
                        has_projector: roomData.has_projector,
                        has_ac: roomData.has_ac,
                        green_board: roomData.green_board,
                        isLcsAvailable: roomData.isLcsAvailable,
                        smart_board: roomData.smart_board
                    });
                    
                    this.techLevels.set(roomData.id, roomData.tech_level);
                    this.maintenanceStaff.set(roomData.id, roomData.maintained_by_id);
                }
            });
            
            this.loaded = true;
            console.log(`✅ Loaded ${this.roomDatabase.size} rooms from techlongue.csv`);
            
            // Log some statistics
            this.logRoomStatistics();
            
        } catch (error) {
            console.error('❌ Error loading room database:', error);
            this.loaded = false;
        }
    }

    /**
     * Get enhanced room information by room ID
     */
    getRoomInfo(roomId) {
        if (!this.loaded || !this.roomDatabase.has(roomId)) {
            return null;
        }
        return this.roomDatabase.get(roomId);
    }

    /**
     * Get room by room number (case-insensitive)
     */
    getRoomByNumber(roomNumber) {
        if (!this.loaded || !roomNumber) return null;
        
        const searchNumber = roomNumber.toString().toLowerCase();
        for (const [id, room] of this.roomDatabase) {
            if (room.room_number.toLowerCase() === searchNumber) {
                return room;
            }
        }
        return null;
    }

    /**
     * Get accurate room capacity from database
     */
    getRoomCapacity(roomId) {
        const room = this.getRoomInfo(roomId);
        if (room) {
            return room.room_max_cap;
        }
        return null;
    }

    /**
     * Get room type from database
     */
    getRoomType(roomId) {
        const room = this.getRoomInfo(roomId);
        if (room) {
            return room.is_lab ? 'lab' : 'theory';
        }
        return null;
    }

    /**
     * Get room features
     */
    getRoomFeatures(roomId) {
        return this.roomFeatures.get(roomId) || null;
    }

    /**
     * Get rooms by tech level
     */
    getRoomsByTechLevel(techLevel) {
        if (!this.loaded) return [];
        
        const rooms = [];
        for (const [id, room] of this.roomDatabase) {
            if (room.tech_level === techLevel) {
                rooms.push(room);
            }
        }
        return rooms;
    }

    /**
     * Get rooms by block
     */
    getRoomsByBlock(block) {
        if (!this.loaded) return [];
        
        const rooms = [];
        for (const [id, room] of this.roomDatabase) {
            if (room.block === block) {
                rooms.push(room);
            }
        }
        return rooms;
    }

    /**
     * Get rooms with specific features
     */
    getRoomsWithFeatures(features = {}) {
        if (!this.loaded) return [];
        
        const rooms = [];
        for (const [id, room] of this.roomDatabase) {
            let matches = true;
            
            for (const [feature, required] of Object.entries(features)) {
                if (room[feature] !== required) {
                    matches = false;
                    break;
                }
            }
            
            if (matches) {
                rooms.push(room);
            }
        }
        return rooms;
    }

    /**
     * Get available rooms for scheduling with enhanced filtering
     */
    getAvailableRoomsForScheduling(day, timeSlot, courseType = null, excludeSession = null, allocationManager = null) {
        if (!this.loaded || !allocationManager) {
            return allocationManager ? allocationManager.getAvailableRooms(day, timeSlot, courseType, excludeSession) : [];
        }

        const baseAvailableRooms = allocationManager.getAvailableRooms(day, timeSlot, courseType, excludeSession);
        const enhancedRooms = [];

        baseAvailableRooms.forEach(room => {
            const enhancedInfo = this.getRoomInfo(room.id);
            if (enhancedInfo) {
                enhancedRooms.push({
                    ...room,
                    // Override with accurate data from database
                    capacity: enhancedInfo.room_max_cap,
                    room_type: enhancedInfo.is_lab ? 'lab' : 'theory',
                    features: this.getRoomFeatures(room.id),
                    tech_level: enhancedInfo.tech_level,
                    description: enhancedInfo.description,
                    maintenance_staff: enhancedInfo.maintained_by_id
                });
            } else {
                enhancedRooms.push(room);
            }
        });

        return enhancedRooms;
    }

    /**
     * Validate room capacity against student count
     */
    validateRoomCapacity(roomId, studentCount) {
        const room = this.getRoomInfo(roomId);
        if (!room || !studentCount) return { valid: true, message: '' };

        const maxCapacity = room.room_max_cap;
        const minCapacity = room.room_min_cap;

        if (studentCount > maxCapacity) {
            return {
                valid: false,
                message: `Student count (${studentCount}) exceeds room capacity (${maxCapacity})`,
                overflow: studentCount - maxCapacity,
                capacity: maxCapacity
            };
        } else if (studentCount < minCapacity) {
            return {
                valid: true,
                warning: true,
                message: `Student count (${studentCount}) is below minimum capacity (${minCapacity})`,
                underutilization: minCapacity - studentCount,
                capacity: maxCapacity
            };
        }

        return { valid: true, message: '' };
    }

    /**
     * Get room recommendations based on requirements
     */
    getRoomRecommendations(requirements = {}) {
        if (!this.loaded) return [];

        const recommendations = [];
        const { 
            studentCount, 
            courseType, 
            techLevel, 
            needsProjector, 
            needsAC, 
            block 
        } = requirements;

        for (const [id, room] of this.roomDatabase) {
            let score = 0;
            let reasons = [];

            // Capacity scoring
            if (studentCount) {
                if (studentCount <= room.room_max_cap && studentCount >= room.room_min_cap) {
                    score += 10;
                    reasons.push('Perfect capacity match');
                } else if (studentCount <= room.room_max_cap) {
                    score += 5;
                    reasons.push('Within capacity');
                } else {
                    score -= 10;
                    reasons.push('Over capacity');
                }
            }

            // Course type matching
            if (courseType) {
                const roomType = room.is_lab ? 'lab' : 'theory';
                if (courseType === roomType) {
                    score += 5;
                    reasons.push('Correct room type');
                } else if (courseType === 'theory' && roomType === 'lab') {
                    score += 2;
                    reasons.push('Theory can use lab room');
                } else {
                    score -= 5;
                    reasons.push('Wrong room type');
                }
            }

            // Tech level matching
            if (techLevel && room.tech_level === techLevel) {
                score += 3;
                reasons.push('Matching tech level');
            }

            // Feature requirements
            if (needsProjector && room.has_projector) {
                score += 2;
                reasons.push('Has projector');
            }
            if (needsAC && room.has_ac) {
                score += 2;
                reasons.push('Has AC');
            }

            // Block preference
            if (block && room.block === block) {
                score += 1;
                reasons.push('Preferred block');
            }

            if (score > 0) {
                recommendations.push({
                    room,
                    score,
                    reasons,
                    features: this.getRoomFeatures(id)
                });
            }
        }

        return recommendations.sort((a, b) => b.score - a.score);
    }

    /**
     * Log room statistics for debugging
     */
    logRoomStatistics() {
        if (!this.loaded) return;

        const stats = {
            totalRooms: this.roomDatabase.size,
            labs: 0,
            theoryRooms: 0,
            blocks: new Set(),
            techLevels: new Map(),
            features: {
                projector: 0,
                ac: 0,
                smartBoard: 0,
                greenBoard: 0,
                lcs: 0
            }
        };

        for (const [id, room] of this.roomDatabase) {
            if (room.is_lab) stats.labs++;
            else stats.theoryRooms++;

            stats.blocks.add(room.block);

            // Tech level stats
            const techLevel = room.tech_level;
            stats.techLevels.set(techLevel, (stats.techLevels.get(techLevel) || 0) + 1);

            // Feature stats
            if (room.has_projector) stats.features.projector++;
            if (room.has_ac) stats.features.ac++;
            if (room.smart_board) stats.features.smartBoard++;
            if (room.green_board) stats.features.greenBoard++;
            if (room.isLcsAvailable) stats.features.lcs++;
        }

        console.log('📊 Room Database Statistics:', {
            totalRooms: stats.totalRooms,
            labs: stats.labs,
            theoryRooms: stats.theoryRooms,
            blocks: Array.from(stats.blocks),
            techLevels: Object.fromEntries(stats.techLevels),
            features: stats.features
        });
    }

    /**
     * Export room data for external use
     */
    exportRoomData() {
        if (!this.loaded) return null;

        return {
            rooms: Array.from(this.roomDatabase.values()),
            features: Object.fromEntries(this.roomFeatures),
            techLevels: Object.fromEntries(this.techLevels),
            maintenanceStaff: Object.fromEntries(this.maintenanceStaff),
            statistics: {
                totalRooms: this.roomDatabase.size,
                labs: Array.from(this.roomDatabase.values()).filter(r => r.is_lab).length,
                theoryRooms: Array.from(this.roomDatabase.values()).filter(r => !r.is_lab).length
            }
        };
    }
}

// Global instance
window.roomDataIntegration = new RoomDataIntegration();

// Auto-load when module is imported
if (typeof window !== 'undefined') {
    window.roomDataIntegration.loadRoomDatabase().catch(console.error);
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RoomDataIntegration;
} 