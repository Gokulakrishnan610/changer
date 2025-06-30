/**
 * Performance Optimizer
 * Handles lazy loading, chunked processing, and performance optimizations
 */
class PerformanceOptimizer {
    constructor() {
        this.loadingQueue = [];
        this.processingQueue = [];
        this.activeRequests = 0;
        this.maxConcurrentRequests = 3;
        this.chunkSize = 100;
        this.virtualScrollConfig = {
            itemHeight: 80,
            containerHeight: 600,
            bufferSize: 5
        };
        
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.performanceMetrics = {
            loadTimes: [],
            renderTimes: [],
            memoryUsage: []
        };
        
        this.debounceTimers = new Map();
        this.throttleTimers = new Map();
    }
    
    /**
     * Load data in chunks with progress tracking
     */
    async loadDataInChunks(dataLoader, progressCallback) {
        const startTime = performance.now();
        
        try {
            userState.updateDataState({ isLoading: true, loadingProgress: 0, error: null });
            
            // Check cache first
            const cacheKey = this.generateCacheKey(dataLoader.name || 'default');
            const cachedData = this.getFromCache(cacheKey);
            
            if (cachedData) {
                progressCallback?.({ loaded: cachedData.length, total: cachedData.length, percentage: 100 });
                userState.updateDataState({ isLoading: false, loadingProgress: 100 });
                return cachedData;
            }
            
            // Load data in chunks
            const allData = [];
            let currentChunk = 0;
            let hasMore = true;
            
            while (hasMore && this.activeRequests < this.maxConcurrentRequests) {
                this.activeRequests++;
                
                try {
                    const chunkData = await this.loadChunk(dataLoader, currentChunk, this.chunkSize);
                    
                    if (chunkData && chunkData.length > 0) {
                        allData.push(...chunkData);
                        currentChunk++;
                        
                        const progress = {
                            loaded: allData.length,
                            total: allData.length + (chunkData.length === this.chunkSize ? this.chunkSize : 0),
                            percentage: hasMore ? Math.min(90, (allData.length / (allData.length + this.chunkSize)) * 100) : 100
                        };
                        
                        progressCallback?.(progress);
                        userState.updateDataState({ loadingProgress: progress.percentage });
                        
                        // Allow UI to update
                        await this.nextTick();
                        
                        // Check if we have more data
                        hasMore = chunkData.length === this.chunkSize;
                    } else {
                        hasMore = false;
                    }
                } finally {
                    this.activeRequests--;
                }
            }
            
            // Cache the result
            this.setCache(cacheKey, allData);
            
            const endTime = performance.now();
            this.recordPerformanceMetric('loadTimes', endTime - startTime);
            
            userState.updateDataState({ 
                isLoading: false, 
                loadingProgress: 100,
                lastLoaded: Date.now()
            });
            
            return allData;
            
        } catch (error) {
            console.error('Error loading data in chunks:', error);
            userState.updateDataState({ 
                isLoading: false, 
                error: error.message 
            });
            throw error;
        }
    }
    
    /**
     * Load a single chunk of data
     */
    async loadChunk(dataLoader, chunkIndex, chunkSize) {
        if (typeof dataLoader === 'function') {
            return await dataLoader(chunkIndex, chunkSize);
        } else if (typeof dataLoader === 'string') {
            // Assume it's a URL pattern
            const url = dataLoader.replace('{chunk}', chunkIndex).replace('{size}', chunkSize);
            const response = await fetch(url);
            return await response.json();
        } else {
            throw new Error('Invalid data loader provided');
        }
    }
    
    /**
     * Process data in chunks to avoid blocking UI
     */
    async processDataInChunks(data, processor, progressCallback) {
        const startTime = performance.now();
        const results = [];
        const totalChunks = Math.ceil(data.length / this.chunkSize);
        
        userState.updateDataState({ isLoading: true, loadingProgress: 0 });
        
        for (let i = 0; i < totalChunks; i++) {
            const start = i * this.chunkSize;
            const end = Math.min(start + this.chunkSize, data.length);
            const chunk = data.slice(start, end);
            
            try {
                const chunkResults = await processor(chunk, i);
                results.push(...chunkResults);
                
                const progress = {
                    processed: end,
                    total: data.length,
                    percentage: (end / data.length) * 100
                };
                
                progressCallback?.(progress);
                userState.updateDataState({ loadingProgress: progress.percentage });
                
                // Allow UI to update every few chunks
                if (i % 5 === 0) {
                    await this.nextTick();
                }
                
            } catch (error) {
                console.error(`Error processing chunk ${i}:`, error);
                throw error;
            }
        }
        
        const endTime = performance.now();
        this.recordPerformanceMetric('renderTimes', endTime - startTime);
        
        userState.updateDataState({ isLoading: false, loadingProgress: 100 });
        
        return results;
    }
    
    /**
     * Create virtual scrolling for large datasets
     */
    createVirtualScroll(container, data, itemRenderer, options = {}) {
        const config = { ...this.virtualScrollConfig, ...options };
        const viewport = this.createViewport(container, config, data.length);
        
        let scrollTop = 0;
        let startIndex = 0;
        let endIndex = 0;
        
        const updateVisibleItems = () => {
            const visibleStart = Math.floor(scrollTop / config.itemHeight);
            const visibleEnd = Math.min(
                visibleStart + Math.ceil(config.containerHeight / config.itemHeight) + config.bufferSize,
                data.length
            );
            
            startIndex = Math.max(0, visibleStart - config.bufferSize);
            endIndex = visibleEnd;
            
            // Clear viewport
            viewport.innerHTML = '';
            
            // Create spacer for items before visible area
            if (startIndex > 0) {
                const topSpacer = document.createElement('div');
                topSpacer.style.height = `${startIndex * config.itemHeight}px`;
                viewport.appendChild(topSpacer);
            }
            
            // Render visible items
            for (let i = startIndex; i < endIndex; i++) {
                if (data[i]) {
                    const item = itemRenderer(data[i], i);
                    item.style.height = `${config.itemHeight}px`;
                    viewport.appendChild(item);
                }
            }
            
            // Create spacer for items after visible area
            if (endIndex < data.length) {
                const bottomSpacer = document.createElement('div');
                bottomSpacer.style.height = `${(data.length - endIndex) * config.itemHeight}px`;
                viewport.appendChild(bottomSpacer);
            }
        };
        
        // Handle scroll events
        container.addEventListener('scroll', this.throttle(() => {
            scrollTop = container.scrollTop;
            updateVisibleItems();
        }, 16)); // ~60fps
        
        // Initial render
        updateVisibleItems();
        
        return {
            refresh: updateVisibleItems,
            getVisibleRange: () => ({ start: startIndex, end: endIndex }),
            scrollToIndex: (index) => {
                container.scrollTop = index * config.itemHeight;
                updateVisibleItems();
            }
        };
    }
    
    /**
     * Create viewport for virtual scrolling
     */
    createViewport(container, config, dataLength) {
        container.style.height = `${config.containerHeight}px`;
        container.style.overflow = 'auto';
        container.style.position = 'relative';
        
        const viewport = document.createElement('div');
        viewport.style.position = 'relative';
        viewport.style.height = `${config.itemHeight * dataLength}px`;
        
        container.innerHTML = '';
        container.appendChild(viewport);
        
        return viewport;
    }
    
    /**
     * Debounce function calls
     */
    debounce(func, delay, key = 'default') {
        return (...args) => {
            if (this.debounceTimers.has(key)) {
                clearTimeout(this.debounceTimers.get(key));
            }
            
            const timer = setTimeout(() => {
                func.apply(this, args);
                this.debounceTimers.delete(key);
            }, delay);
            
            this.debounceTimers.set(key, timer);
        };
    }
    
    /**
     * Throttle function calls
     */
    throttle(func, delay, key = 'default') {
        return (...args) => {
            if (!this.throttleTimers.has(key)) {
                func.apply(this, args);
                this.throttleTimers.set(key, setTimeout(() => {
                    this.throttleTimers.delete(key);
                }, delay));
            }
        };
    }
    
    /**
     * Cache management
     */
    setCache(key, data) {
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }
    
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        this.cache.delete(key);
        return null;
    }
    
    clearCache() {
        this.cache.clear();
    }
    
    generateCacheKey(...parts) {
        return parts.join('_');
    }
    
    /**
     * Performance metrics
     */
    recordPerformanceMetric(type, value) {
        if (!this.performanceMetrics[type]) {
            this.performanceMetrics[type] = [];
        }
        
        this.performanceMetrics[type].push({
            timestamp: Date.now(),
            value: value
        });
        
        // Keep only last 100 measurements
        if (this.performanceMetrics[type].length > 100) {
            this.performanceMetrics[type].shift();
        }
    }
    
    getPerformanceMetrics() {
        return this.performanceMetrics;
    }
    
    /**
     * Utility: Wait for next tick
     */
    nextTick() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }
    
    /**
     * Utility: Request animation frame promise
     */
    nextFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    }
    
    /**
     * Memory management
     */
    async cleanupMemory() {
        // Clear old cache entries
        const now = Date.now();
        for (const [key, cached] of this.cache.entries()) {
            if (now - cached.timestamp > this.cacheTimeout) {
                this.cache.delete(key);
            }
        }
        
        // Clear old performance metrics
        Object.keys(this.performanceMetrics).forEach(key => {
            this.performanceMetrics[key] = this.performanceMetrics[key]
                .filter(metric => now - metric.timestamp < 600000); // Keep last 10 minutes
        });
        
        // Request garbage collection if available
        if (window.gc) {
            window.gc();
        }
    }
    
    /**
     * Monitor performance and auto-optimize
     */
    startPerformanceMonitoring() {
        setInterval(() => {
            this.cleanupMemory();
            
            // Auto-adjust chunk size based on performance
            const loadTimes = this.performanceMetrics.loadTimes.slice(-10);
            if (loadTimes.length >= 10) {
                const avgLoadTime = loadTimes.reduce((sum, metric) => sum + metric.value, 0) / loadTimes.length;
                
                if (avgLoadTime > 1000) { // If loading takes more than 1 second
                    this.chunkSize = Math.max(50, this.chunkSize - 10);
                } else if (avgLoadTime < 300) { // If loading is fast
                    this.chunkSize = Math.min(200, this.chunkSize + 10);
                }
            }
        }, 30000); // Check every 30 seconds
    }
}

// Create global instance
const performanceOptimizer = new PerformanceOptimizer();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceOptimizer;
} 