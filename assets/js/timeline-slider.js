/**
 * Weave - Timeline Slider Component
 *
 * A reusable UI control for navigating organisational history over time.
 *
 * Responsibilities:
 * - Determine the selectable date range from imported data (fetch from the
 *   org chart API, or accept an explicit { min, max } range)
 * - Allow manual date selection via drag/click on a horizontal track
 * - Provide a play/pause animation mode that advances the date over time
 * - Support configurable animation speed (slow, medium, fast)
 * - Emit a custom `datechange` event (and mirror it on the shared EventBus)
 *   carrying the selected date as YYYY-MM-DD so other components can react
 *
 * Usage:
 *   const slider = new TimelineSlider(document.getElementById('timeline'), {
 *       speed: 'medium'
 *   });
 *   await slider.init();                       // fetches range from orgchart API
 *   // or: slider.setRange('2020-01-01', '2024-01-01');
 *   slider.element.addEventListener('datechange', (e) => {
 *       console.log(e.detail.date);            // 'YYYY-MM-DD'
 *   });
 *
 * Depends on app.js (EventBus, API) being loaded first. All app.js usage is
 * feature-detected so the component still works standalone.
 */

'use strict';

// ============================================
// Date helpers (UTC-based, avoids TZ drift)
// ============================================

/** One day in milliseconds. */
const TS_MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse a YYYY-MM-DD string into a UTC timestamp (ms).
 * @param {string} dateStr
 * @returns {number} milliseconds since epoch, or NaN if invalid
 */
function tsParseDate(dateStr) {
    if (typeof dateStr !== 'string') return NaN;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
    if (!match) return NaN;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return NaN;
    return Date.UTC(year, month - 1, day);
}

/**
 * Format a UTC timestamp (ms) as a YYYY-MM-DD string.
 * @param {number} ts
 * @returns {string}
 */
function tsFormatDate(ts) {
    const d = new Date(ts);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Clamp a value between a lower and upper bound.
 * @param {number} value
 * @param {number} lower
 * @param {number} upper
 * @returns {number}
 */
function tsClamp(value, lower, upper) {
    if (value < lower) return lower;
    if (value > upper) return upper;
    return value;
}


// ============================================
// Timeline Slider Component
// ============================================

class TimelineSlider {
    /**
     * @param {HTMLElement} container - Element the slider renders into
     * @param {Object} [options]
     * @param {'slow'|'medium'|'fast'} [options.speed='medium'] - Animation speed
     * @param {string} [options.min] - Optional min date (YYYY-MM-DD)
     * @param {string} [options.max] - Optional max date (YYYY-MM-DD)
     * @param {string} [options.date] - Optional initial date (YYYY-MM-DD)
     * @param {string} [options.apiEndpoint='orgchart.php'] - Endpoint used to
     *        derive the date range when no explicit range is supplied
     */
    constructor(container, options = {}) {
        if (!container || container.nodeType !== 1) {
            throw new Error('TimelineSlider requires a container element');
        }

        this.element = container;
        this.options = options;
        this.apiEndpoint = options.apiEndpoint || 'orgchart.php';

        // Speed presets: milliseconds between automatic day advances.
        this.speedPresets = { slow: 1200, medium: 600, fast: 200 };
        this.speed = this.speedPresets[options.speed] ? options.speed : 'medium';

        // Timeline bounds and current position (UTC ms).
        this.minTs = null;
        this.maxTs = null;
        this.currentTs = null;

        // Animation state.
        this.playing = false;
        this._animTimer = null;

        // Drag state.
        this._dragging = false;

        // Cached DOM references (populated by _render).
        this.dom = {};

        // Bound handlers so they can be added/removed cleanly.
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);

        this._buildStructure();
    }

    // ----------------------------------------
    // Public API
    // ----------------------------------------

    /**
     * Initialise the slider, deriving its date range from the org chart API
     * unless an explicit range was provided in options.
     * @returns {Promise<void>}
     */
    async init() {
        if (this.options.min && this.options.max) {
            this.setRange(this.options.min, this.options.max, this.options.date);
            return;
        }

        const range = await this._fetchRange();
        if (range && range.min && range.max) {
            this.setRange(range.min, range.max, this.options.date);
        } else {
            this._showEmpty('No data available for the timeline');
        }
    }

    /**
     * Set (or reset) the selectable date range and optionally the current date.
     * @param {string} min - Minimum date (YYYY-MM-DD)
     * @param {string} max - Maximum date (YYYY-MM-DD)
     * @param {string} [date] - Initial date; defaults to max when omitted
     */
    setRange(min, max, date) {
        let minTs = tsParseDate(min);
        let maxTs = tsParseDate(max);
        if (Number.isNaN(minTs) || Number.isNaN(maxTs)) {
            this._showEmpty('Invalid date range');
            return;
        }
        if (minTs > maxTs) {
            [minTs, maxTs] = [maxTs, minTs];
        }

        this.minTs = minTs;
        this.maxTs = maxTs;

        let startTs = date != null ? tsParseDate(date) : maxTs;
        if (Number.isNaN(startTs)) startTs = maxTs;
        this.currentTs = tsClamp(startTs, minTs, maxTs);

        this._enable(true);
        this._updateBounds();
        this._updatePosition();
        // Announce the initial date so listeners can render immediately.
        this._emitChange();
    }

    /**
     * Programmatically set the current date within range.
     * @param {string} date - YYYY-MM-DD
     * @param {boolean} [emit=true] - Whether to emit a datechange event
     */
    setDate(date, emit = true) {
        if (this.minTs == null || this.maxTs == null) return;
        const ts = tsParseDate(date);
        if (Number.isNaN(ts)) return;
        const clamped = tsClamp(ts, this.minTs, this.maxTs);
        if (clamped === this.currentTs) {
            this._updatePosition();
            return;
        }
        this.currentTs = clamped;
        this._updatePosition();
        if (emit) this._emitChange();
    }

    /**
     * Get the currently selected date.
     * @returns {string|null} YYYY-MM-DD, or null if uninitialised
     */
    getDate() {
        return this.currentTs == null ? null : tsFormatDate(this.currentTs);
    }

    /**
     * Get the active date range.
     * @returns {{min: string, max: string}|null}
     */
    getRange() {
        if (this.minTs == null || this.maxTs == null) return null;
        return { min: tsFormatDate(this.minTs), max: tsFormatDate(this.maxTs) };
    }

    /**
     * Set the animation speed.
     * @param {'slow'|'medium'|'fast'} speed
     */
    setSpeed(speed) {
        if (!this.speedPresets[speed]) return;
        this.speed = speed;
        if (this.dom.speedSelect && this.dom.speedSelect.value !== speed) {
            this.dom.speedSelect.value = speed;
        }
        // Restart the timer with the new interval if currently playing.
        if (this.playing) {
            this._stopTimer();
            this._startTimer();
        }
    }

    /** Start the play animation. */
    play() {
        if (this.playing || this.minTs == null) return;
        // If we're already at the end, restart from the beginning.
        if (this.currentTs >= this.maxTs) {
            this.currentTs = this.minTs;
            this._updatePosition();
            this._emitChange();
        }
        this.playing = true;
        this._updatePlayButton();
        this._startTimer();
    }

    /** Pause the play animation. */
    pause() {
        if (!this.playing) return;
        this.playing = false;
        this._updatePlayButton();
        this._stopTimer();
    }

    /** Toggle between play and pause. */
    toggle() {
        if (this.playing) {
            this.pause();
        } else {
            this.play();
        }
    }

    /** Tear down timers and event listeners. */
    destroy() {
        this._stopTimer();
        document.removeEventListener('pointermove', this._onPointerMove);
        document.removeEventListener('pointerup', this._onPointerUp);
    }

    // ----------------------------------------
    // Rendering
    // ----------------------------------------

    _buildStructure() {
        this.element.classList.add('timeline-slider');
        this.element.innerHTML = `
            <div class="timeline-controls">
                <button type="button" class="timeline-play" aria-label="Play timeline" aria-pressed="false" disabled>
                    <span class="timeline-play-icon" aria-hidden="true">&#9654;</span>
                </button>
                <label class="timeline-speed">
                    <span class="timeline-speed-label">Speed</span>
                    <select class="timeline-speed-select" aria-label="Animation speed" disabled>
                        <option value="slow">Slow</option>
                        <option value="medium">Medium</option>
                        <option value="fast">Fast</option>
                    </select>
                </label>
                <output class="timeline-current-date" aria-live="polite">&mdash;</output>
            </div>
            <div class="timeline-track-wrap">
                <div class="timeline-track"
                     role="slider"
                     tabindex="0"
                     aria-label="Timeline date"
                     aria-valuemin="0"
                     aria-valuemax="0"
                     aria-valuenow="0">
                    <div class="timeline-fill"></div>
                    <button type="button" class="timeline-thumb" aria-label="Selected date" disabled></button>
                </div>
                <div class="timeline-labels">
                    <span class="timeline-label-min">&mdash;</span>
                    <span class="timeline-label-max">&mdash;</span>
                </div>
            </div>
        `;

        this.dom.playBtn = this.element.querySelector('.timeline-play');
        this.dom.playIcon = this.element.querySelector('.timeline-play-icon');
        this.dom.speedSelect = this.element.querySelector('.timeline-speed-select');
        this.dom.currentDate = this.element.querySelector('.timeline-current-date');
        this.dom.track = this.element.querySelector('.timeline-track');
        this.dom.fill = this.element.querySelector('.timeline-fill');
        this.dom.thumb = this.element.querySelector('.timeline-thumb');
        this.dom.labelMin = this.element.querySelector('.timeline-label-min');
        this.dom.labelMax = this.element.querySelector('.timeline-label-max');

        this.dom.speedSelect.value = this.speed;

        this._bindEvents();
    }

    _bindEvents() {
        this.dom.playBtn.addEventListener('click', () => this.toggle());

        this.dom.speedSelect.addEventListener('change', (e) => {
            this.setSpeed(e.target.value);
        });

        // Pointer-based drag/click on the track.
        this.dom.track.addEventListener('pointerdown', (e) => {
            if (this.minTs == null) return;
            this._dragging = true;
            this.dom.track.classList.add('is-dragging');
            // Auto-pause while scrubbing manually.
            if (this.playing) this.pause();
            this._seekToClientX(e.clientX);
            document.addEventListener('pointermove', this._onPointerMove);
            document.addEventListener('pointerup', this._onPointerUp);
        });

        // Keyboard support on the track (accessibility).
        this.dom.track.addEventListener('keydown', (e) => this._onKeyDown(e));
    }

    _onPointerMove(e) {
        if (!this._dragging) return;
        this._seekToClientX(e.clientX);
    }

    _onPointerUp() {
        if (!this._dragging) return;
        this._dragging = false;
        this.dom.track.classList.remove('is-dragging');
        document.removeEventListener('pointermove', this._onPointerMove);
        document.removeEventListener('pointerup', this._onPointerUp);
    }

    _onKeyDown(e) {
        if (this.minTs == null) return;
        let handled = true;
        const day = TS_MS_PER_DAY;
        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowDown':
                this._nudge(-day);
                break;
            case 'ArrowRight':
            case 'ArrowUp':
                this._nudge(day);
                break;
            case 'PageDown':
                this._nudge(-day * 7);
                break;
            case 'PageUp':
                this._nudge(day * 7);
                break;
            case 'Home':
                this.setDate(tsFormatDate(this.minTs));
                break;
            case 'End':
                this.setDate(tsFormatDate(this.maxTs));
                break;
            case ' ':
            case 'Enter':
                this.toggle();
                break;
            default:
                handled = false;
        }
        if (handled) e.preventDefault();
    }

    _nudge(deltaMs) {
        if (this.playing) this.pause();
        const next = tsClamp(this.currentTs + deltaMs, this.minTs, this.maxTs);
        if (next !== this.currentTs) {
            this.currentTs = next;
            this._updatePosition();
            this._emitChange();
        }
    }

    /**
     * Convert a clientX pixel position into a date and select it.
     * @param {number} clientX
     */
    _seekToClientX(clientX) {
        const rect = this.dom.track.getBoundingClientRect();
        if (rect.width === 0) return;
        const ratio = tsClamp((clientX - rect.left) / rect.width, 0, 1);
        const span = this.maxTs - this.minTs;
        // Snap to whole days for stable, meaningful dates.
        const rawTs = this.minTs + Math.round((span * ratio) / TS_MS_PER_DAY) * TS_MS_PER_DAY;
        const ts = tsClamp(rawTs, this.minTs, this.maxTs);
        if (ts !== this.currentTs) {
            this.currentTs = ts;
            this._updatePosition();
            this._emitChange();
        } else {
            this._updatePosition();
        }
    }

    _updateBounds() {
        this.dom.labelMin.textContent = this._displayDate(this.minTs);
        this.dom.labelMax.textContent = this._displayDate(this.maxTs);
        this.dom.track.setAttribute('aria-valuemin', String(this.minTs));
        this.dom.track.setAttribute('aria-valuemax', String(this.maxTs));
    }

    _updatePosition() {
        if (this.minTs == null || this.currentTs == null) return;
        const span = this.maxTs - this.minTs;
        const ratio = span === 0 ? 0 : (this.currentTs - this.minTs) / span;
        const pct = (ratio * 100).toFixed(3) + '%';
        this.dom.thumb.style.left = pct;
        this.dom.fill.style.width = pct;

        const dateStr = tsFormatDate(this.currentTs);
        this.dom.currentDate.textContent = this._displayDate(this.currentTs);
        this.dom.thumb.setAttribute('aria-label', 'Selected date: ' + dateStr);
        this.dom.track.setAttribute('aria-valuenow', String(this.currentTs));
        this.dom.track.setAttribute('aria-valuetext', dateStr);
    }

    _updatePlayButton() {
        const btn = this.dom.playBtn;
        btn.setAttribute('aria-pressed', String(this.playing));
        btn.setAttribute('aria-label', this.playing ? 'Pause timeline' : 'Play timeline');
        this.dom.playIcon.innerHTML = this.playing ? '&#10074;&#10074;' : '&#9654;';
        this.element.classList.toggle('is-playing', this.playing);
    }

    _enable(enabled) {
        this.dom.playBtn.disabled = !enabled;
        this.dom.speedSelect.disabled = !enabled;
        this.dom.thumb.disabled = !enabled;
        this.element.classList.toggle('is-disabled', !enabled);
    }

    _showEmpty(message) {
        this._enable(false);
        this.dom.currentDate.textContent = message;
    }

    /**
     * Human-friendly display date, using app.js formatDate when available.
     * @param {number} ts
     * @returns {string}
     */
    _displayDate(ts) {
        const dateStr = tsFormatDate(ts);
        if (typeof formatDate === 'function') {
            try {
                return formatDate(dateStr);
            } catch (_) {
                return dateStr;
            }
        }
        return dateStr;
    }

    // ----------------------------------------
    // Animation
    // ----------------------------------------

    _startTimer() {
        this._stopTimer();
        const interval = this.speedPresets[this.speed];
        this._animTimer = setInterval(() => this._advance(), interval);
    }

    _stopTimer() {
        if (this._animTimer != null) {
            clearInterval(this._animTimer);
            this._animTimer = null;
        }
    }

    _advance() {
        if (this.currentTs >= this.maxTs) {
            // Reached the end; stop at the final date.
            this.pause();
            return;
        }
        this.currentTs = tsClamp(this.currentTs + TS_MS_PER_DAY, this.minTs, this.maxTs);
        this._updatePosition();
        this._emitChange();
    }

    // ----------------------------------------
    // Data & events
    // ----------------------------------------

    /**
     * Fetch the date range from the org chart API.
     * @returns {Promise<{min: string, max: string}|null>}
     */
    async _fetchRange() {
        try {
            let data;
            if (typeof API !== 'undefined' && typeof API.get === 'function') {
                data = await API.get(this.apiEndpoint);
            } else {
                const response = await fetch('../api/' + this.apiEndpoint);
                if (!response.ok) throw new Error('HTTP ' + response.status);
                data = await response.json();
            }
            if (data && data.date_range && data.date_range.min && data.date_range.max) {
                return { min: data.date_range.min, max: data.date_range.max };
            }
            return null;
        } catch (error) {
            console.error('[TimelineSlider] Failed to fetch date range:', error);
            if (typeof Toast !== 'undefined' && Toast.error) {
                Toast.error('Could not load timeline range');
            }
            return null;
        }
    }

    /**
     * Emit a datechange event on the container element and mirror on EventBus.
     */
    _emitChange() {
        const date = this.getDate();
        if (date == null) return;
        const detail = { date };
        this.element.dispatchEvent(new CustomEvent('datechange', {
            detail,
            bubbles: true
        }));
        if (typeof EventBus !== 'undefined' && EventBus.emit) {
            EventBus.emit('timeline:datechange', detail);
        }
    }
}

// Expose globally for non-module usage (matches app.js style).
if (typeof window !== 'undefined') {
    window.TimelineSlider = TimelineSlider;
}
