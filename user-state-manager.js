/**
 * Centralized User State Manager
 * Handles user preferences, selections, and session persistence across all pages
 */
class UserStateManager {
    constructor() {
        this.state = {
            // Navigation and page state
            currentPage: null,
            lastPage: null,
            
            // User preferences
            preferences: {
                theme: 'light',
                autoSave: true,
                showConflicts: true,
                pageSize: 50,
                refreshInterval: 30000, // 30 seconds
                defaultView: 'department'
            },
            
            // Filter states
            filters: {
                // Schedule viewer filters
                schedule: {
                    selectedDepartment: 'all',
                    selectedSemester: 'all',
                    selectedDay: 'all',
                    selectedRoom: 'all',
                    selectedTeacher: 'all',
                    viewType: 'department',
                    searchQuery: '',
                    showConflicts: false,
                    groupBy: 'department'
                },
                
                // Room timetable filters
                rooms: {
                    selectedBlock: 'all',
                    selectedRoomType: 'all',
                    showUtilization: true,
                    sortBy: 'room_number'
                },
                
                // Allocation manager filters
                allocation: {
                    selectedConflictType: 'all',
                    selectedSeverity: 'all',
                    showResolved: false,
                    pageIndex: 0,
                    sortBy: 'session_time'
                }
            },
            
            // Data loading state
            dataState: {
                lastLoaded: null,
                loadedPages: new Set(),
                cache: new Map(),
                loadingProgress: 0,
                isLoading: false,
                error: null
            },
            
            // UI state
            ui: {
                selectedSessions: new Set(),
                expandedSections: new Set(),
                activeModal: null,
                sidebarCollapsed: false,
                tooltipsEnabled: true
            },
            
            // Performance settings
            performance: {
                virtualizedTables: true,
                lazyLoading: true,
                chunkSize: 100,
                maxConcurrentRequests: 3,
                cacheTimeout: 300000 // 5 minutes
            }
        };
        
        this.listeners = new Map();
        this.loadFromStorage();
        this.initializePerformanceMonitor();
    }
    
    /**
     * Initialize performance monitoring
     */
    initializePerformanceMonitor() {
        this.performanceMetrics = {
            pageLoadTimes: new Map(),
            dataLoadTimes: new Map(),
            renderTimes: new Map(),
            memoryUsage: [],
            lastOptimization: Date.now()
        };
        
        // Monitor performance every 30 seconds
        setInterval(() => {
            this.collectPerformanceMetrics();
        }, 30000);
    }
    
    /**
     * Collect performance metrics
     */
    collectPerformanceMetrics() {
        if (performance.memory) {
            this.performanceMetrics.memoryUsage.push({
                timestamp: Date.now(),
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize
            });
            
            // Keep only last 100 measurements
            if (this.performanceMetrics.memoryUsage.length > 100) {
                this.performanceMetrics.memoryUsage.shift();
            }
        }
    }
    
    /**
     * Load state from localStorage
     */
    loadFromStorage() {
        try {
            const saved = localStorage.getItem('userState');
            if (saved) {
                const savedState = JSON.parse(saved);
                this.state = this.mergeDeep(this.state, savedState);
                
                // Convert Sets back from arrays
                this.state.dataState.loadedPages = new Set(savedState.dataState?.loadedPages || []);
                this.state.ui.selectedSessions = new Set(savedState.ui?.selectedSessions || []);
                this.state.ui.expandedSections = new Set(savedState.ui?.expandedSections || []);
                
                console.log('✅ User state loaded from storage');
            }
        } catch (error) {
            console.warn('Failed to load user state from storage:', error);
        }
    }
    
    /**
     * Save state to localStorage
     */
    saveToStorage() {
        try {
            const stateToSave = { ...this.state };
            
            // Convert Sets to arrays for JSON serialization
            stateToSave.dataState.loadedPages = Array.from(this.state.dataState.loadedPages);
            stateToSave.ui.selectedSessions = Array.from(this.state.ui.selectedSessions);
            stateToSave.ui.expandedSections = Array.from(this.state.ui.expandedSections);
            
            localStorage.setItem('userState', JSON.stringify(stateToSave));
        } catch (error) {
            console.warn('Failed to save user state to storage:', error);
        }
    }
    
    /**
     * Deep merge objects
     */
    mergeDeep(target, source) {
        const output = { ...target };
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        output[key] = source[key];
                    } else {
                        output[key] = this.mergeDeep(target[key], source[key]);
                    }
                } else {
                    output[key] = source[key];
                }
            });
        }
        return output;
    }
    
    /**
     * Check if value is an object
     */
    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }
    
    /**
     * Get current page state
     */
    getCurrentPage() {
        return this.state.currentPage;
    }
    
    /**
     * Set current page and update navigation state
     */
    setCurrentPage(page) {
        this.state.lastPage = this.state.currentPage;
        this.state.currentPage = page;
        this.state.dataState.loadedPages.add(page);
        this.saveToStorage();
        this.notifyListeners('pageChanged', { current: page, previous: this.state.lastPage });
    }
    
    /**
     * Get filter state for a specific page
     */
    getFilters(page) {
        return this.state.filters[page] || {};
    }
    
    /**
     * Update filter state for a specific page
     */
    updateFilters(page, filters) {
        if (!this.state.filters[page]) {
            this.state.filters[page] = {};
        }
        
        this.state.filters[page] = { ...this.state.filters[page], ...filters };
        this.saveToStorage();
        this.notifyListeners('filtersChanged', { page, filters: this.state.filters[page] });
    }
    
    /**
     * Get user preferences
     */
    getPreferences() {
        return this.state.preferences;
    }
    
    /**
     * Update user preferences
     */
    updatePreferences(preferences) {
        this.state.preferences = { ...this.state.preferences, ...preferences };
        this.saveToStorage();
        this.notifyListeners('preferencesChanged', this.state.preferences);
    }
    
    /**
     * Get UI state
     */
    getUIState() {
        return this.state.ui;
    }
    
    /**
     * Update UI state
     */
    updateUIState(uiState) {
        this.state.ui = { ...this.state.ui, ...uiState };
        this.saveToStorage();
        this.notifyListeners('uiStateChanged', this.state.ui);
    }
    
    /**
     * Get data loading state
     */
    getDataState() {
        return this.state.dataState;
    }
    
    /**
     * Update data loading state
     */
    updateDataState(dataState) {
        this.state.dataState = { ...this.state.dataState, ...dataState };
        this.saveToStorage();
        this.notifyListeners('dataStateChanged', this.state.dataState);
    }
    
    /**
     * Get performance settings
     */
    getPerformanceSettings() {
        return this.state.performance;
    }
    
    /**
     * Update performance settings
     */
    updatePerformanceSettings(settings) {
        this.state.performance = { ...this.state.performance, ...settings };
        this.saveToStorage();
        this.notifyListeners('performanceSettingsChanged', this.state.performance);
    }
    
    /**
     * Add event listener
     */
    addEventListener(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
    
    /**
     * Remove event listener
     */
    removeEventListener(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    /**
     * Notify listeners of state changes
     */
    notifyListeners(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }
    
    /**
     * Reset state to defaults
     */
    reset() {
        localStorage.removeItem('userState');
        this.state = this.getDefaultState();
        this.notifyListeners('stateReset', this.state);
    }
    
    /**
     * Export state for backup
     */
    exportState() {
        return JSON.stringify(this.state, null, 2);
    }
    
    /**
     * Import state from backup
     */
    importState(stateString) {
        try {
            const importedState = JSON.parse(stateString);
            this.state = this.mergeDeep(this.getDefaultState(), importedState);
            this.saveToStorage();
            this.notifyListeners('stateImported', this.state);
            return true;
        } catch (error) {
            console.error('Failed to import state:', error);
            return false;
        }
    }
    
    /**
     * Get default state structure
     */
    getDefaultState() {
        return {
            currentPage: null,
            lastPage: null,
            preferences: {
                theme: 'light',
                autoSave: true,
                showConflicts: true,
                pageSize: 50,
                refreshInterval: 30000,
                defaultView: 'department'
            },
            filters: {
                schedule: {
                    selectedDepartment: 'all',
                    selectedSemester: 'all',
                    selectedDay: 'all',
                    selectedRoom: 'all',
                    selectedTeacher: 'all',
                    viewType: 'department',
                    searchQuery: '',
                    showConflicts: false,
                    groupBy: 'department'
                },
                rooms: {
                    selectedBlock: 'all',
                    selectedRoomType: 'all',
                    showUtilization: true,
                    sortBy: 'room_number'
                },
                allocation: {
                    selectedConflictType: 'all',
                    selectedSeverity: 'all',
                    showResolved: false,
                    pageIndex: 0,
                    sortBy: 'session_time'
                }
            },
            dataState: {
                lastLoaded: null,
                loadedPages: new Set(),
                cache: new Map(),
                loadingProgress: 0,
                isLoading: false,
                error: null
            },
            ui: {
                selectedSessions: new Set(),
                expandedSections: new Set(),
                activeModal: null,
                sidebarCollapsed: false,
                tooltipsEnabled: true
            },
            performance: {
                virtualizedTables: true,
                lazyLoading: true,
                chunkSize: 100,
                maxConcurrentRequests: 3,
                cacheTimeout: 300000
            }
        };
    }
}

// Create global instance
const userState = new UserStateManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserStateManager;
} 