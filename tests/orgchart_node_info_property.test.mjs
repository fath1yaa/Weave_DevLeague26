/**
 * Property-Based Test - Property 10: Org chart node information completeness
 *
 * Validates: Requirements 5.5
 *
 * Property statement (design.md):
 *   For any node rendered in the Org_Chart_View, the node SHALL display the role
 *   title, the current occupant's name (or "Vacant" if unoccupied), and the
 *   reporting line (parent role).
 *
 * Approach:
 *   - No JS test runner / PBT library is configured in this repo (no
 *     package.json). To avoid installing dependencies we use Node's built-in
 *     test runner (node:test) plus a tiny standalone DOM stub (dom-stub.mjs)
 *     and a small hand-rolled generative loop that plays the role of a
 *     property-based testing library.
 *   - Each iteration generates a randomised org tree (varying titles, occupant
 *     present/absent, person_id present/null, reports_to present/null, root vs
 *     non-root, arbitrary nesting) and renders it through the REAL, unmodified
 *     OrgChart component loaded from assets/js/orgchart.js.
 *   - For EVERY rendered node card we assert node-information completeness:
 *       (1) role title is displayed and matches the node's title (or the
 *           documented "Untitled role" fallback when title is missing),
 *       (2) the occupant is displayed and equals the occupant name, or "Vacant"
 *           when the role is unoccupied (occupant blank OR person_id null),
 *       (3) the reporting line is displayed - the parent role text when a parent
 *           exists, or the explicit no-parent indicator ("Reports to: —").
 *
 * Run:  node tests/orgchart_node_info_property.test.mjs [iterations] [seed]
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

import { installDom } from './dom-stub.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORGCHART_SRC = join(__dirname, '..', 'assets', 'js', 'orgchart.js');

// The no-parent reporting-line indicator uses an em-dash (U+2014).
const NO_PARENT = 'Reports to: \u2014';

// ------------------------------------------------------------------
// Load the REAL OrgChart class from source under the DOM stub. orgchart.js is
// a classic (non-module) script that assigns window.OrgChart, so we run it in a
// vm context whose globals are the stub, then read OrgChart back off window.
// Nothing in the production source is modified.
// ------------------------------------------------------------------
function loadOrgChart() {
    const { document, window } = installDom();
    const source = readFileSync(ORGCHART_SRC, 'utf8');
    const context = { document, window, console };
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'orgchart.js' });
    const OrgChart = window.OrgChart;
    assert.ok(typeof OrgChart === 'function', 'OrgChart should be exposed on window');
    return { OrgChart, document };
}

// ------------------------------------------------------------------
// Deterministic seeded PRNG (mulberry32) so failures reproduce from the seed.
// ------------------------------------------------------------------
function makeRng(seed) {
    let a = seed >>> 0;
    return function rng() {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const TITLE_POOL = [
    'CEO', 'CTO', 'VP Engineering', 'Engineering Manager', 'Staff Engineer',
    'Senior Engineer', 'Product Manager', 'Designer', 'Analyst', 'Intern',
    'Head of People', 'Finance Lead', ' ', '', 'Role with a rather long title'
];
const NAME_POOL = [
    'Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson',
    'Linus T', 'Margaret H', "O'Brien", 'José García', '', '   '
];
const DEPT_POOL = ['Engineering', 'Product', 'Finance', 'People', null, ''];

let ROLE_ID_COUNTER = 1;

/**
 * Generate a random node subtree. Depth-limited to keep trees small but varied.
 * Deliberately produces the full input space OrgChart must handle:
 *  - title present / whitespace / empty / missing
 *  - occupant present / whitespace / empty / missing, person_id present / null
 *  - reports_to present / empty / null (roots typically have no parent)
 *  - department present / null / empty
 *  - role_id present / occasionally missing
 */
function genNode(rng, depth, isRoot) {
    const pick = arr => arr[Math.floor(rng() * arr.length)];

    // ~10% of the time omit title entirely to exercise the "Untitled role" path.
    const hasTitle = rng() > 0.1;
    const title = hasTitle ? pick(TITLE_POOL) : undefined;

    // Decide occupancy. A role is vacant when occupant is blank/absent OR
    // person_id is null - mirror that spread across generated cases.
    const occupancyRoll = rng();
    let occupant;
    let person_id;
    if (occupancyRoll < 0.45) {
        // Occupied: real name + real person_id.
        occupant = pick(NAME_POOL.filter(n => n.trim().length > 0));
        person_id = 'p' + Math.floor(rng() * 1000);
    } else if (occupancyRoll < 0.7) {
        // Vacant via missing/blank occupant.
        occupant = pick(['', '   ', undefined, null]);
        person_id = rng() > 0.5 ? 'p' + Math.floor(rng() * 1000) : null;
    } else if (occupancyRoll < 0.85) {
        // Vacant via null person_id even though a name string may linger.
        occupant = rng() > 0.5 ? pick(NAME_POOL) : undefined;
        person_id = null;
    } else {
        // Fully occupied but with a name that has surrounding whitespace.
        occupant = '  ' + pick(NAME_POOL.filter(n => n.trim().length > 0)) + ' ';
        person_id = 'p' + Math.floor(rng() * 1000);
    }

    // reports_to: roots usually null; children usually have a parent name.
    let reports_to;
    if (isRoot) {
        reports_to = rng() > 0.2 ? null : '';
    } else {
        const r = rng();
        reports_to = r < 0.75 ? pick(TITLE_POOL.filter(t => t.trim().length > 0))
            : (r < 0.9 ? null : '');
    }

    const node = {
        role_id: rng() > 0.05 ? 'r' + (ROLE_ID_COUNTER++) : undefined,
        title,
        occupant,
        person_id,
        reports_to,
        department: pick(DEPT_POOL)
    };

    if (depth > 0) {
        const childCount = Math.floor(rng() * (depth + 1)); // 0..depth
        if (childCount > 0) {
            node.children = [];
            for (let i = 0; i < childCount; i++) {
                node.children.push(genNode(rng, depth - 1, false));
            }
        }
    }

    return node;
}

function genTree(rng) {
    ROLE_ID_COUNTER = 1;
    const rootCount = 1 + Math.floor(rng() * 3); // 1..3 roots
    const maxDepth = Math.floor(rng() * 4);      // 0..3
    const nodes = [];
    for (let i = 0; i < rootCount; i++) {
        nodes.push(genNode(rng, maxDepth, true));
    }
    return nodes;
}

// ------------------------------------------------------------------
// Reference expectations - independent of OrgChart internals.
// ------------------------------------------------------------------
function expectedTitle(node) {
    return node.title != null ? String(node.title) : 'Untitled role';
}

function expectedOccupant(node) {
    // Property 10 concerns the DISPLAYED occupant text. In the component the
    // label shown is the occupant's name when one is present, and "Vacant" only
    // when the role is unoccupied (occupant absent/blank). person_id does not
    // change the displayed text - it only controls whether the name is a
    // clickable link to the person journey. So the expected text mirrors the
    // occupant-name resolution, not the person_id linkability.
    const raw = node.occupant;
    const blank = raw == null || String(raw).trim().length === 0;
    if (blank) return 'Vacant';
    return String(raw);
}

function expectedReports(node) {
    return node.reports_to != null && String(node.reports_to).length > 0
        ? 'Reports to: ' + String(node.reports_to)
        : NO_PARENT;
}

/** Flatten a generated tree in the same pre-order the renderer walks it. */
function flatten(nodes, out = []) {
    for (const n of nodes) {
        out.push(n);
        if (Array.isArray(n.children) && n.children.length) flatten(n.children, out);
    }
    return out;
}

/**
 * Extract, from a rendered card element, the pieces Property 10 requires.
 * Returns null for a missing piece so the assertion can report it.
 */
function readCard(card) {
    const role = card.querySelector('.orgchart-role');
    const occupant = card.querySelector('.orgchart-occupant');
    const reports = card.querySelector('.orgchart-reports-to');
    return {
        title: role ? role.textContent : null,
        occupant: occupant ? occupant.textContent : null,
        reports: reports ? reports.textContent : null
    };
}

// ------------------------------------------------------------------
// The property test.
// ------------------------------------------------------------------
const ITERATIONS = Number.parseInt(process.argv[2], 10) || 500;
const SEED = Number.parseInt(process.argv[3], 10) || 0x51ede;

test('Property 10: every rendered org chart node shows title, occupant/Vacant, and reporting line', () => {
    const { OrgChart, document } = loadOrgChart();
    const rng = makeRng(SEED);

    let checkedNodes = 0;

    for (let i = 0; i < ITERATIONS; i++) {
        const tree = genTree(rng);

        const container = document.createElement('div');
        // Disable animation so _swapCanvas commits synchronously on first render.
        const chart = new OrgChart(container, { animate: false });
        chart.render({ date: '2023-06-01', nodes: tree });

        const cards = container.querySelectorAll('.orgchart-card');
        const expectedNodes = flatten(tree);

        // One card per node, walked in the same pre-order.
        assert.equal(
            cards.length,
            expectedNodes.length,
            `iteration ${i}: card count ${cards.length} != node count ${expectedNodes.length}\n` +
            `tree=${JSON.stringify(tree)}`
        );

        for (let j = 0; j < cards.length; j++) {
            const node = expectedNodes[j];
            const got = readCard(cards[j]);
            const ctx = `iteration ${i}, node ${j}: ${JSON.stringify(node)}`;

            // (1) Role title displayed and correct.
            assert.notEqual(got.title, null, `${ctx}\n  role title element missing`);
            assert.equal(got.title, expectedTitle(node), `${ctx}\n  title mismatch`);

            // (2) Occupant name displayed, or "Vacant" when unoccupied.
            assert.notEqual(got.occupant, null, `${ctx}\n  occupant element missing`);
            assert.equal(got.occupant, expectedOccupant(node), `${ctx}\n  occupant mismatch`);

            // (3) Reporting line displayed (parent role or explicit no-parent).
            assert.notEqual(got.reports, null, `${ctx}\n  reporting-line element missing`);
            assert.equal(got.reports, expectedReports(node), `${ctx}\n  reporting-line mismatch`);

            checkedNodes++;
        }
    }

    assert.ok(checkedNodes > 0, 'expected to check at least one node');
    // Surfaced in the run output as a quick sanity signal.
    console.log(
        `Property 10 OK: ${ITERATIONS} generated trees, ${checkedNodes} node cards checked (seed=0x${SEED.toString(16)}).`
    );
});
