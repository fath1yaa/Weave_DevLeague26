/**
 * Minimal DOM stub for testing assets/js/orgchart.js under Node.
 *
 * This implements just the slice of the DOM/Window API that OrgChart touches:
 *   Element: nodeType, className, classList.add/contains, dataset, textContent,
 *            type, setAttribute/getAttribute, appendChild, contains,
 *            innerHTML (set to '' to clear), querySelector, querySelectorAll,
 *            closest, addEventListener.
 *   document.createElement, window (matchMedia, setTimeout).
 *
 * It is intentionally tiny and standalone so no external packages (jsdom) need
 * to be installed. It exercises the REAL production render/_buildNode/_buildCard
 * logic - nothing in orgchart.js is mocked or altered.
 *
 * Only class selectors (".foo") and tag selectors ("li") that OrgChart uses are
 * supported by querySelector/querySelectorAll.
 */
'use strict';

class ClassList {
    constructor(el) {
        this._el = el;
        this._set = new Set();
    }
    add(...names) {
        names.forEach(n => n && this._set.add(n));
        this._sync();
    }
    remove(...names) {
        names.forEach(n => this._set.delete(n));
        this._sync();
    }
    contains(name) {
        return this._set.has(name);
    }
    _sync() {
        this._el._className = Array.from(this._set).join(' ');
    }
    _adopt(className) {
        this._set = new Set(String(className || '').split(/\s+/).filter(Boolean));
    }
}

class StubElement {
    constructor(tagName) {
        this.tagName = String(tagName).toUpperCase();
        this.nodeType = 1;
        this.childNodes = [];
        this.parentNode = null;
        this._className = '';
        this.classList = new ClassList(this);
        this.dataset = {};
        this.attributes = {};
        this._textContent = '';
        this._listeners = {};
        this.type = '';
    }

    get className() {
        return this._className;
    }
    set className(value) {
        this._className = String(value);
        this.classList._adopt(this._className);
    }

    get textContent() {
        if (this.childNodes.length === 0) return this._textContent;
        return this.childNodes.map(c => c.textContent).join('');
    }
    set textContent(value) {
        this._textContent = String(value);
        this.childNodes = [];
    }

    // Setting innerHTML to '' is the only usage in orgchart.js (clearing).
    get innerHTML() {
        return '';
    }
    set innerHTML(value) {
        if (String(value) === '') {
            this.childNodes.forEach(c => (c.parentNode = null));
            this.childNodes = [];
        } else {
            throw new Error('DOM stub only supports innerHTML = "" (clear)');
        }
    }

    appendChild(child) {
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
    }

    contains(node) {
        if (node === this) return true;
        return this.childNodes.some(c => c.contains(node));
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }
    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name)
            ? this.attributes[name]
            : null;
    }

    addEventListener(type, handler) {
        (this._listeners[type] = this._listeners[type] || []).push(handler);
    }
    removeEventListener(type, handler) {
        const list = this._listeners[type];
        if (!list) return;
        this._listeners[type] = list.filter(h => h !== handler);
    }

    _matches(selector) {
        if (selector.startsWith('.')) {
            return this.classList.contains(selector.slice(1));
        }
        return this.tagName === selector.toUpperCase();
    }

    querySelector(selector) {
        for (const child of this.childNodes) {
            if (child._matches(selector)) return child;
            const found = child.querySelector(selector);
            if (found) return found;
        }
        return null;
    }

    querySelectorAll(selector) {
        const out = [];
        const walk = el => {
            for (const child of el.childNodes) {
                if (child._matches(selector)) out.push(child);
                walk(child);
            }
        };
        walk(this);
        return out;
    }

    closest(selector) {
        let node = this;
        while (node && node.nodeType === 1) {
            if (node._matches(selector)) return node;
            node = node.parentNode;
        }
        return null;
    }
}

function createStubDocument() {
    return {
        createElement(tag) {
            return new StubElement(tag);
        }
    };
}

/**
 * Install the DOM stub onto globalThis so a non-module script that references
 * `document` / `window` can run. Returns the created container element.
 */
export function installDom() {
    const documentStub = createStubDocument();
    const windowStub = {
        matchMedia() {
            return { matches: false };
        },
        setTimeout: (fn, ms) => setTimeout(fn, ms)
    };

    globalThis.document = documentStub;
    globalThis.window = windowStub;
    // orgchart.js does `window.OrgChart = OrgChart` and feature-detects window.
    return { document: documentStub, window: windowStub };
}

export { StubElement };
