/**
 * Weave - Timeline Slider Module
 * 
 * Provides an animated date-based slider for navigating organisational
 * history. Fetches date range from the API and emits date-change events
 * that other components (org chart, etc.) react to.
 * 
 * Dependencies: app.js (EventBus, API, formatDate, debounce)
 */

'use strict';

const TimelineSlider = (() => {
    // State
    let minDate = null;
    let maxDate = null;
    let currentDate = null;
    let isPlaying = false;
    let playInterval = null;
    let speed = 1; // 1x, 2x, 4x
    let totalDays = 0;

    // DOM elements
    let slider = null;
    let dateDisplay = null;
    let playBtn = null;
    let speedBtns = null;
    let statsContainer = null;

    // Speed intervals in ms
    const SPEED_MAP = {
        1: 2000,
        2: 1000,
        4: 500
    };

    /**
     * Initialize the timeline slider
     */
    async function init() {
        // Get DOM references
        slider = document.getElementById('timeline-slider');
        dateDisplay = document.getElementById('timeline-date-value');
        playBtn = document.getElementById('timeline-play-btn');
        speedBtns = document.querySelectorAll('.speed-btn');
        statsContainer = document.getElementById('timeline-stats');

        if (!slider || !dateDisplay) {
            console.warn('[TimelineSlider] Required DOM elements not found');
            return;
        }

        // Fetch date range from API
        try {
            const data = await API.get('orgchart.php?action=date_range');
            if (data.success && data.date_range) {
                minDate = new Date(data.date_range.min + 'T00:00:00');
                maxDate = new Date(data.date_range.max + 'T00:00:00');
                totalDays = daysBetween(minDate, maxDate);

                // Set up slider range
                slider.min = 0;
                slider.max = totalDays;
                slider.value = totalDays; // Start at most recent date

                // Set initial date
                currentDate = new Date(maxDate);

                // Display range labels
                const minLabel = document.getElementById('timeline-range-min');
                const maxLabel = document.getElementById('timeline-range-max');
                if (minLabel) minLabel.textContent = formatDate(dateToString(minDate));
                if (maxLabel) maxLabel.textContent = formatDate(dateToString(maxDate));

                // Update display
                updateDateDisplay();
                updateSliderProgress();

                // Check URL for date param
                const urlDate = Nav.getParam('date');
                if (urlDate) {
                    setDate(urlDate);
                } else {
                    // Emit initial date
                    emitDateChange();
                }
            }
        } catch (error) {
            console.error('[TimelineSlider] Failed to load date range:', error);
            showNoDataState();
            return;
        }

        // Bind event listeners
        bindEvents();
    }

    /**
     * Bind all event listeners
     */
    function bindEvents() {
        // Slider input (fires during drag)
        const debouncedSlide = debounce(handleSliderChange, 50);
        slider.addEventListener('input', () => {
            updateDateFromSlider();
            updateDateDisplay();
            updateSliderProgress();
            debouncedSlide();
        });

        // Curved slider click/drag support
        const curvedSlider = document.getElementById('curved-slider');
        if (curvedSlider) {
            curvedSlider.addEventListener('mousedown', handleCurvedSliderStart);
            curvedSlider.addEventListener('touchstart', handleCurvedSliderStart, { passive: false });
        }

        // Play/Pause button
        if (playBtn) {
            playBtn.addEventListener('click', togglePlay);
        }

        // Speed buttons
        if (speedBtns) {
            speedBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const newSpeed = parseInt(btn.dataset.speed, 10);
                    setSpeed(newSpeed);
                });
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeydown);
    }

    /**
     * Handle curved slider mouse/touch interaction
     */
    function handleCurvedSliderStart(e) {
        e.preventDefault();
        updateSliderFromCurvedPosition(e);

        const moveHandler = (ev) => {
            ev.preventDefault();
            updateSliderFromCurvedPosition(ev);
        };
        const upHandler = () => {
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
            document.removeEventListener('touchmove', moveHandler);
            document.removeEventListener('touchend', upHandler);
        };

        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('touchend', upHandler);
    }

    /**
     * Convert click/drag position on curved slider to slider value
     */
    function updateSliderFromCurvedPosition(e) {
        const curvedSlider = document.getElementById('curved-slider');
        if (!curvedSlider) return;

        const rect = curvedSlider.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let ratio = (clientX - rect.left) / rect.width;
        ratio = Math.max(0, Math.min(1, ratio));

        const newValue = Math.round(ratio * totalDays);
        slider.value = newValue;
        updateDateFromSlider();
        updateDateDisplay();
        updateSliderProgress();
        emitDateChange();
    }

    /**
     * Handle slider value change (debounced)
     */
    function handleSliderChange() {
        emitDateChange();
    }

    /**
     * Update current date from slider position
     */
    function updateDateFromSlider() {
        const days = parseInt(slider.value, 10);
        currentDate = addDays(new Date(minDate), days);
    }

    /**
     * Update the date display element
     */
    function updateDateDisplay() {
        if (dateDisplay && currentDate) {
            dateDisplay.textContent = formatDate(dateToString(currentDate));
            if (isPlaying) {
                dateDisplay.classList.add('animating');
            } else {
                dateDisplay.classList.remove('animating');
            }
        }
    }

    /**
     * Update slider track fill (SVG curved path)
     */
    function updateSliderProgress() {
        if (!slider || totalDays === 0) return;

        const progress = parseInt(slider.value, 10) / totalDays;
        
        // Update the SVG curved track
        const trackFill = document.getElementById('curve-track-fill');
        const thumb = document.getElementById('curve-thumb');
        const trackBg = document.getElementById('curve-track-bg');

        if (trackFill && thumb && trackBg) {
            // Get total path length
            const pathLength = trackBg.getTotalLength();
            const fillLength = pathLength * progress;

            // Set dasharray to show only the filled portion
            trackFill.style.strokeDasharray = `${fillLength} ${pathLength}`;

            // Move thumb along the path
            const point = trackBg.getPointAtLength(fillLength);
            thumb.setAttribute('cx', point.x);
            thumb.setAttribute('cy', point.y);
        }
    }

    /**
     * Toggle play/pause animation
     */
    function togglePlay() {
        if (isPlaying) {
            pause();
        } else {
            play();
        }
    }

    /**
     * Start auto-advancing the slider
     */
    function play() {
        if (totalDays === 0) return;

        isPlaying = true;
        updatePlayButton();

        // If at end, reset to beginning
        if (parseInt(slider.value, 10) >= totalDays) {
            slider.value = 0;
            updateDateFromSlider();
            updateDateDisplay();
            updateSliderProgress();
            emitDateChange();
        }

        playInterval = setInterval(() => {
            const currentVal = parseInt(slider.value, 10);
            if (currentVal >= totalDays) {
                pause();
                return;
            }

            // Advance by a day step (scaled for total range)
            const step = Math.max(1, Math.floor(totalDays / 200));
            slider.value = Math.min(currentVal + step, totalDays);
            updateDateFromSlider();
            updateDateDisplay();
            updateSliderProgress();
            emitDateChange();
        }, SPEED_MAP[speed]);
    }

    /**
     * Pause the animation
     */
    function pause() {
        isPlaying = false;
        if (playInterval) {
            clearInterval(playInterval);
            playInterval = null;
        }
        updatePlayButton();
        dateDisplay.classList.remove('animating');
    }

    /**
     * Update play button visual state
     */
    function updatePlayButton() {
        if (!playBtn) return;

        if (isPlaying) {
            playBtn.classList.add('playing');
            playBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="4" width="4" height="16" rx="1"/>
                    <rect x="14" y="4" width="4" height="16" rx="1"/>
                </svg>
            `;
            playBtn.setAttribute('aria-label', 'Pause timeline animation');
        } else {
            playBtn.classList.remove('playing');
            playBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <polygon points="5,3 19,12 5,21"/>
                </svg>
            `;
            playBtn.setAttribute('aria-label', 'Play timeline animation');
        }
    }

    /**
     * Set playback speed
     */
    function setSpeed(newSpeed) {
        speed = newSpeed;

        // Update UI
        if (speedBtns) {
            speedBtns.forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.speed, 10) === speed);
            });
        }

        // If playing, restart with new speed
        if (isPlaying) {
            clearInterval(playInterval);
            playInterval = setInterval(() => {
                const currentVal = parseInt(slider.value, 10);
                if (currentVal >= totalDays) {
                    pause();
                    return;
                }
                const step = Math.max(1, Math.floor(totalDays / 200));
                slider.value = Math.min(currentVal + step, totalDays);
                updateDateFromSlider();
                updateDateDisplay();
                updateSliderProgress();
                emitDateChange();
            }, SPEED_MAP[speed]);
        }
    }

    /**
     * Set the slider to a specific date
     */
    function setDate(dateStr) {
        const target = new Date(dateStr + 'T00:00:00');
        if (isNaN(target.getTime())) return;

        const days = daysBetween(minDate, target);
        slider.value = Math.max(0, Math.min(days, totalDays));
        currentDate = target;
        updateDateDisplay();
        updateSliderProgress();
        emitDateChange();
    }

    /**
     * Emit the date change event via EventBus
     */
    function emitDateChange() {
        if (currentDate) {
            const dateStr = dateToString(currentDate);
            EventBus.emit('timeline:datechange', { date: dateStr });
        }
    }

    /**
     * Update node count in stats
     */
    function updateStats(nodeCount, vacantCount) {
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="timeline-stat">
                    <span class="timeline-stat-value">${nodeCount}</span> roles active
                </div>
                <div class="timeline-stat">
                    <span class="timeline-stat-value">${nodeCount - vacantCount}</span> filled
                </div>
                <div class="timeline-stat">
                    <span class="timeline-stat-value">${vacantCount}</span> vacant
                </div>
            `;
        }
    }

    /**
     * Show no-data state on the timeline
     */
    function showNoDataState() {
        if (slider) slider.disabled = true;
        if (playBtn) playBtn.disabled = true;
        if (dateDisplay) dateDisplay.textContent = 'No data';
    }

    /**
     * Handle keyboard shortcuts
     */
    function handleKeydown(e) {
        // Only handle if not focused on an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case ' ':
                e.preventDefault();
                togglePlay();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                stepBackward();
                break;
            case 'ArrowRight':
                e.preventDefault();
                stepForward();
                break;
        }
    }

    /**
     * Step forward one increment
     */
    function stepForward() {
        if (!slider) return;
        const step = Math.max(1, Math.floor(totalDays / 100));
        slider.value = Math.min(parseInt(slider.value, 10) + step, totalDays);
        updateDateFromSlider();
        updateDateDisplay();
        updateSliderProgress();
        emitDateChange();
    }

    /**
     * Step backward one increment
     */
    function stepBackward() {
        if (!slider) return;
        const step = Math.max(1, Math.floor(totalDays / 100));
        slider.value = Math.max(parseInt(slider.value, 10) - step, 0);
        updateDateFromSlider();
        updateDateDisplay();
        updateSliderProgress();
        emitDateChange();
    }

    // --- Utility functions ---

    function daysBetween(d1, d2) {
        const ms = d2.getTime() - d1.getTime();
        return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
    }

    function addDays(date, days) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    function dateToString(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Public API
    return {
        init,
        setDate,
        play,
        pause,
        togglePlay,
        updateStats,
        getCurrentDate: () => currentDate ? dateToString(currentDate) : null,
        isPlaying: () => isPlaying
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only init on orgchart page
    if (document.getElementById('timeline-slider')) {
        TimelineSlider.init();
    }
});
