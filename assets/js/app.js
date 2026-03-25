/**
 * HealthVault SPA
 *
 * Hash-based router, view renderers, mini canvas charts and AI analysis UI.
 * All data is fetched from the PHP API layer via the `api()` helper.
 */

/* ── Bootstrap ───────────────────────────────────────────────────── */
(function () {
    'use strict';

    /** Preloaded data from the PHP SPA shell */
    const App = window.__APP_DATA__ || { user: {}, tests: [], latestTest: null };

    /** Global cache: key → Promise (so duplicate in-flight requests collapse) */
    const Cache = {};

    /* ── DOM helpers ─────────────────────────────────────────────── */

    /**
     * Query selector shorthand.
     * @param {string} sel
     * @param {Element} [ctx=document]
     * @returns {Element|null}
     */
    const $ = (sel, ctx = document) => ctx.querySelector(sel);

    /**
     * Query selector all shorthand.
     * @param {string} sel
     * @param {Element} [ctx=document]
     * @returns {NodeListOf<Element>}
     */
    const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

    /**
     * Escape HTML special characters to prevent XSS.
     * @param {*} v
     * @returns {string}
     */
    const esc = v => String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    /* ── Date helpers ────────────────────────────────────────────── */

    /**
     * Format an ISO date string as "12 Aug 2024".
     * @param {string} d
     * @returns {string}
     */
    const fmtDate = d => {
        if (!d) return '';
        const dt = new Date(d + 'T00:00:00');
        return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    /**
     * Split an ISO date into { day, mon, yr } for the history list display.
     * @param {string} d
     * @returns {{ day: string, mon: string, yr: string }}
     */
    const splitDate = d => {
        const dt = new Date(d + 'T00:00:00');
        return {
            day: dt.getDate().toString(),
            mon: dt.toLocaleDateString('en-AU', { month: 'short' }),
            yr:  dt.getFullYear().toString(),
        };
    };

    /* ── API helper ──────────────────────────────────────────────── */

    /**
     * Fetch JSON from a HealthVault API endpoint.
     * GET requests are cached by URL in sessionStorage.
     *
     * @param {string} url   Relative URL, e.g. "api/trends.php?code=VITD"
     * @param {object} [options]
     * @param {string} [options.method="GET"]
     * @param {object} [options.body]
     * @param {boolean} [options.noCache=false]
     * @returns {Promise<any>}
     */
    const api = async (url, { method = 'GET', body = null, noCache = false } = {}) => {
        const cacheKey = 'hv_' + url;

        if (method === 'GET' && !noCache) {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                try { return JSON.parse(cached); } catch (_) { /* ignore corrupt cache */ }
            }
            // Collapse concurrent duplicate requests
            if (Cache[cacheKey]) return Cache[cacheKey];
        }

        const opts = {
            method,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json',
            },
        };

        if (body) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }

        const promise = fetch(url, opts).then(async res => {
            const json = await res.json();
            if (!res.ok) {
                const err = new Error(json.error || `HTTP ${res.status}`);
                err.status = res.status;
                throw err;
            }
            if (method === 'GET' && !noCache) {
                try { sessionStorage.setItem(cacheKey, JSON.stringify(json)); } catch (_) { /* storage full */ }
            }
            return json;
        }).finally(() => {
            if (method === 'GET') delete Cache[cacheKey];
        });

        if (method === 'GET') Cache[cacheKey] = promise;
        return promise;
    };

    /** Invalidate a cached API response so the next GET is fresh. */
    const bustCache = url => sessionStorage.removeItem('hv_' + url);

    /* ── Toast ───────────────────────────────────────────────────── */

    /**
     * Show an error toast.
     * @param {string} msg
     */
    const toastError = msg => showToast(msg, true);

    /**
     * Show a brief toast notification at the bottom of the screen.
     * @param {string} msg
     * @param {boolean} [isError=false]
     */
    const showToast = (msg, isError = false) => {
        const container = $('#toast-container');
        if (!container) return;

        const el = document.createElement('div');
        el.className = isError ? 'toast toast-error' : 'toast';
        el.textContent = msg;
        container.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    };

    /* ── Overlay / Modal ─────────────────────────────────────────── */

    const overlayEl  = $('#overlay');
    const modalEl    = $('#modal');
    const modalInner = $('#modal-inner');

    /** Show the modal sheet with arbitrary HTML content. */
    const showModal = html => {
        modalInner.innerHTML = html;
        overlayEl.hidden  = false;
        modalEl.hidden     = false;
        document.body.style.overflow = 'hidden';
    };

    /** Hide the modal sheet. */
    const hideModal = () => {
        overlayEl.hidden  = true;
        modalEl.hidden     = true;
        modalInner.innerHTML = '';
        document.body.style.overflow = '';
    };

    if (overlayEl) overlayEl.addEventListener('click', hideModal);

    /* ── Navigation active state ─────────────────────────────────── */

    /**
     * Update the bottom nav to reflect the current route.
     * @param {string} route  e.g. "home" | "history" | "trends" | "encyclopedia" | "add"
     */
    const setActiveNav = route => {
        $$('.nav-item').forEach(el => {
            el.classList.toggle('active', el.dataset.route === route);
        });
    };

    /* ── Router ──────────────────────────────────────────────────── */

    const contentEl = $('#app-content');

    /**
     * Main router — reads window.location.hash and dispatches to a view.
     */
    const route = async () => {
        const hash  = location.hash.replace(/^#\/?/, '') || '';
        const parts = hash.split('/');
        const view  = parts[0] || 'home';

        window.scrollTo(0, 0);

        try {
            switch (view) {
                case '':
                case 'home':
                    setActiveNav('home');
                    await Views.home();
                    break;
                case 'history':
                    setActiveNav('history');
                    await Views.history();
                    break;
                case 'test':
                    setActiveNav('history');
                    await Views.detail(parts[1]);
                    break;
                case 'trends':
                    setActiveNav('trends');
                    if (parts[1]) {
                        await Views.trendDetail(parts[1]);
                    } else {
                        await Views.trends();
                    }
                    break;
                case 'encyclopedia':
                    setActiveNav('encyclopedia');
                    await Views.encyclopedia();
                    break;
                case 'add':
                    setActiveNav('add');
                    await Views.add();
                    break;
                default:
                    setActiveNav('home');
                    await Views.home();
            }
        } catch (err) {
            console.error('[Router]', err);
            contentEl.innerHTML = renderError('Failed to load this view. Please try again.');
        }
    };

    window.addEventListener('hashchange', route);

    /* ── Status helpers ──────────────────────────────────────────── */

    /**
     * Return a status string based on a result row.
     * @param {{ flag: string, value_numeric: number|null, ref_range_low: number|null, ref_range_high: number|null }} row
     * @returns {"normal"|"high"|"low"|"unknown"}
     */
    const resultStatus = row => {
        if (row.flag === 'H' || row.flag === 'HH') return 'high';
        if (row.flag === 'L' || row.flag === 'LL') return 'low';
        if (row.flag === 'N' || row.flag === '') return 'normal';
        if (row.value_numeric !== null) {
            if (row.ref_range_high !== null && +row.value_numeric > +row.ref_range_high) return 'high';
            if (row.ref_range_low  !== null && +row.value_numeric < +row.ref_range_low)  return 'low';
            if (row.ref_range_low  !== null || row.ref_range_high !== null) return 'normal';
        }
        return 'unknown';
    };

    /**
     * Render a status pill HTML element.
     * @param {"normal"|"high"|"low"|"unknown"} status
     * @returns {string}
     */
    const statusPill = status => {
        const labels = { normal: 'Normal', high: 'High', low: 'Low', unknown: '—' };
        return `<span class="status-pill status-pill-${esc(status)}">${labels[status] || '—'}</span>`;
    };

    /**
     * Format a numeric result value.
     * @param {number|string|null} v
     * @param {number} [decimals=2]
     * @returns {string}
     */
    const fmtVal = (v, decimals = 2) => {
        if (v === null || v === undefined || v === '') return '—';
        const n = parseFloat(v);
        if (isNaN(n)) return esc(v);
        return n.toLocaleString('en-AU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals,
        });
    };

    /**
     * Build the reference range display string.
     * @param {{ ref_range_low: number|null, ref_range_high: number|null, ref_range_text: string|null, units: string|null }} row
     * @returns {string}
     */
    const fmtRef = row => {
        if (row.ref_range_text) return esc(row.ref_range_text);
        if (row.ref_range_low !== null && row.ref_range_high !== null) {
            return `${fmtVal(row.ref_range_low, 2)} – ${fmtVal(row.ref_range_high, 2)}`;
        }
        if (row.ref_range_high !== null) return `< ${fmtVal(row.ref_range_high, 2)}`;
        if (row.ref_range_low  !== null) return `> ${fmtVal(row.ref_range_low, 2)}`;
        return '';
    };

    /* ── Shared render helpers ────────────────────────────────────── */

    /**
     * Render an error message block.
     * @param {string} msg
     * @returns {string}
     */
    const renderError = msg =>
        `<div class="alert alert-error">${esc(msg)}</div>`;

    /**
     * Render the loading spinner block.
     * @returns {string}
     */
    const renderLoading = () =>
        `<div class="loading-state"><div class="spinner"></div><p>Loading…</p></div>`;

    /**
     * Group an array of result objects by their category.
     * @param {Array<object>} results
     * @returns {Array<[string, Array<object>]>}  [categoryName, [results]]
     */
    const groupByCategory = results => {
        const map = new Map();
        results.forEach(r => {
            const cat = r.category || 'Other';
            if (!map.has(cat)) map.set(cat, []);
            map.get(cat).push(r);
        });
        return [...map.entries()];
    };

    /**
     * Render a single result row inside a test detail panel.
     * @param {object} r  Result row from API
     * @returns {string}
     */
    const renderResultRow = r => {
        const status  = r.status || resultStatus(r);
        const val     = fmtVal(r.value_numeric, r.decimals ?? 2);
        const refStr  = fmtRef(r);
        const units   = r.units ? esc(r.units) : '';
        const valLine = r.value_numeric !== null ? val : (r.value_text ? esc(r.value_text) : '—');
        const testId  = r.blood_test_id || '';

        return `
        <div class="result-row status-${esc(status)}"
             onclick="App.goTrend(${esc(JSON.stringify(r.test_code))})"
             title="View trend for ${esc(r.test_name || r.test_code)}">
            <span class="status-badge status-badge-${esc(status)}"></span>
            <div class="result-name">
                <div class="result-label">${esc(r.test_name || r.test_code)}</div>
                ${refStr ? `<div class="result-meta">Ref: ${refStr}${units ? ' ' + units : ''}</div>` : ''}
            </div>
            <div class="result-value-wrap">
                <span class="result-value">${valLine}</span>
                <span class="result-ref">${units}</span>
            </div>
            ${statusPill(status)}
        </div>`;
    };

    /* ── Views ───────────────────────────────────────────────────── */

    const Views = {};

    /* ---- Dashboard ------------------------------------------------ */

    /**
     * Render the dashboard view showing the latest test session summary.
     */
    Views.home = async () => {
        let latest = App.latestTest;

        // If not preloaded, fetch fresh
        if (!latest) {
            contentEl.innerHTML = renderLoading();
            try {
                const tests = await api('api/blood-tests.php');
                if (!tests.length) {
                    contentEl.innerHTML = renderEmpty(
                        'No Results Yet',
                        'Add your first blood test to get started.',
                        '#/add',
                        'Add Results'
                    );
                    return;
                }
                latest = await api(`api/blood-tests.php?id=${tests[0].id}`);
            } catch (err) {
                contentEl.innerHTML = renderError(err.message);
                return;
            }
        }

        if (!latest) {
            contentEl.innerHTML = renderEmpty(
                'No Results Yet',
                'Add your first blood test to get started.',
                '#/add',
                'Add Results'
            );
            return;
        }

        const abnormal = (latest.results || []).filter(r => (r.status || resultStatus(r)) !== 'normal' && (r.status || resultStatus(r)) !== 'unknown');
        const abnCnt   = abnormal.length;
        const totalCnt = (latest.results || []).length;

        const groups = groupByCategory(latest.results || []);
        const categorySections = groups.map(([cat, rows]) => `
            <div class="category-group">
                <div class="category-label">${esc(cat)}</div>
                ${rows.map(renderResultRow).join('')}
            </div>
        `).join('');

        contentEl.innerHTML = `
            <div class="page-header flex-between">
                <div>
                    <div class="page-title">Dashboard</div>
                    <div class="page-subtitle">Latest: ${fmtDate(latest.test_date)}</div>
                </div>
                <a href="#/add" class="btn btn-accent btn-sm">+ Add</a>
            </div>

            <div class="stat-grid">
                <div class="stat-card">
                    <div class="stat-card-label">Results</div>
                    <div class="stat-card-value">${totalCnt}</div>
                    <div class="stat-card-sub">${esc(latest.lab_name || '')}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-label">Out of Range</div>
                    <div class="stat-card-value ${abnCnt > 0 ? 'is-high' : 'is-good'}">${abnCnt}</div>
                    <div class="stat-card-sub">${abnCnt === 0 ? 'All results normal' : 'Requires attention'}</div>
                </div>
            </div>

            ${abnCnt > 0 ? `
            <div class="alert-banner high mb-3">
                <svg class="alert-banner-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span><strong>${abnCnt} result${abnCnt !== 1 ? 's' : ''}</strong> are outside the reference range from your latest test.</span>
            </div>` : ''}

            <div class="flex-between mb-3">
                <div class="section-title">Latest Results — ${fmtDate(latest.test_date)}</div>
                <button class="btn btn-ai btn-sm" onclick="App.analyseTest(${latest.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3m-3.27-6.73-2.12 2.12M7.39 16.61l-2.12 2.12m0-12.85 2.12 2.12M16.61 16.61l2.12 2.12"/></svg>
                    AI Analysis
                </button>
            </div>

            <div class="card">
                ${categorySections || `<div class="empty-state" style="padding: 48px 16px;">No results recorded for this session.</div>`}
            </div>

            <div class="mt-3">
                <a href="#/history" class="btn btn-ghost btn-full">View All History</a>
            </div>
        `;
    };

    /* ---- History -------------------------------------------------- */

    /**
     * Render the test history timeline.
     */
    Views.history = async () => {
        contentEl.innerHTML = renderLoading();

        try {
            const tests = await api('api/blood-tests.php');

            if (!tests.length) {
                contentEl.innerHTML = renderEmpty('No History', 'No blood tests have been recorded yet.', '#/add', 'Add Results');
                return;
            }

            const items = tests.map(t => {
                const d = splitDate(t.test_date);
                const abn = t.abnormal_count || 0;
                return `
                <a class="history-item" href="#/test/${t.id}">
                    <div class="history-date-col">
                        <div class="history-day">${esc(d.day)}</div>
                        <div class="history-mon">${esc(d.mon)}</div>
                        <div class="history-yr">${esc(d.yr)}</div>
                    </div>
                    <div class="history-info">
                        <div class="history-lab">${esc(t.lab_name || 'Unknown lab')}</div>
                        <div class="history-doctor">${t.referring_doctor ? esc(t.referring_doctor) : ''}</div>
                        <div class="history-meta">
                            <span class="tag">${t.result_count || 0} results</span>
                            ${abn > 0 ? `<span class="tag" style="background:var(--clr-high-bg);color:var(--clr-high);border-color:var(--clr-high-border);">${abn} out of range</span>` : ''}
                        </div>
                    </div>
                    <div class="history-counts">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--clr-text-muted)" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                </a>`;
            }).join('');

            contentEl.innerHTML = `
                <div class="page-header flex-between">
                    <div>
                        <div class="page-title">History</div>
                        <div class="page-subtitle">${tests.length} test session${tests.length !== 1 ? 's' : ''} recorded</div>
                    </div>
                    <a href="#/add" class="btn btn-accent btn-sm">+ Add</a>
                </div>
                ${items}
            `;
        } catch (err) {
            contentEl.innerHTML = renderError(err.message);
        }
    };

    /* ---- Test Detail ---------------------------------------------- */

    /**
     * Render the detail view for a single test session.
     * @param {string|number} id
     */
    Views.detail = async id => {
        if (!id) { location.hash = '#/history'; return; }

        contentEl.innerHTML = renderLoading();

        try {
            const data = await api(`api/blood-tests.php?id=${encodeURIComponent(id)}`);
            const results = data.results || [];
            const abn = results.filter(r => (r.status || resultStatus(r)) !== 'normal' && (r.status || resultStatus(r)) !== 'unknown');

            const groups = groupByCategory(results);
            const categorySections = groups.map(([cat, rows]) => `
                <div class="category-group">
                    <div class="category-label">${esc(cat)}</div>
                    ${rows.map(renderResultRow).join('')}
                </div>
            `).join('');

            contentEl.innerHTML = `
                <button class="back-link" onclick="history.back()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                    History
                </button>

                <div class="page-header">
                    <div class="page-title">${fmtDate(data.test_date)}</div>
                    <div class="page-subtitle">${esc(data.lab_name || '')}${data.referring_doctor ? ' &ndash; ' + esc(data.referring_doctor) : ''}</div>
                </div>

                ${abn.length > 0 ? `
                <div class="alert-banner high mb-3">
                    <svg class="alert-banner-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span><strong>${abn.length} result${abn.length !== 1 ? 's' : ''}</strong> are outside reference range.</span>
                </div>` : `
                <div class="alert-banner normal mb-3">
                    <svg class="alert-banner-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <span>All ${results.length} results are within reference range.</span>
                </div>`}

                <div class="flex-between mb-3">
                    <div class="section-title">${results.length} results</div>
                    <div class="flex-row">
                        <button class="btn btn-ai btn-sm" onclick="App.analyseTest(${data.id})">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3m-3.27-6.73-2.12 2.12M7.39 16.61l-2.12 2.12m0-12.85 2.12 2.12M16.61 16.61l2.12 2.12"/></svg>
                            Analyse
                        </button>
                        <button class="btn btn-icon-only" onclick="App.confirmDeleteTest(${data.id})" title="Delete this session">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                    </div>
                </div>

                <div class="card">
                    ${categorySections || '<div class="empty-state" style="padding:48px 16px;">No results for this session.</div>'}
                </div>
            `;
        } catch (err) {
            contentEl.innerHTML = renderError(err.message);
        }
    };

    /* ---- Trends overview ------------------------------------------ */

    /**
     * Render the trends overview — one mini chart per test code.
     */
    Views.trends = async () => {
        contentEl.innerHTML = renderLoading();

        try {
            const data = await api('api/trends.php');

            if (!Object.keys(data).length) {
                contentEl.innerHTML = renderEmpty('No Trends Yet', 'Record more than one blood test to see trends.', '#/add', 'Add Results');
                return;
            }

            const categories = Object.keys(data);

            const sections = categories.map(cat => {
                const tests = data[cat];
                const cards = tests.map(t => {
                    const pts = t.data || [];
                    const latest = pts.length ? pts[pts.length - 1] : null;
                    if (!pts.length) return '';

                    const latestStatus = latest ? resultStatus({ flag: latest.flag, value_numeric: latest.value, ref_range_low: t.ref_range_low, ref_range_high: t.ref_range_high }) : 'unknown';

                    return `
                    <div class="trend-card" onclick="location.hash='#/trends/${esc(t.test_code)}'">
                        <div class="trend-card-header">
                            <div>
                                <div class="trend-name">${esc(t.test_name || t.test_code)}</div>
                                <div class="trend-units">${t.units ? esc(t.units) : ''} &bull; ${pts.length} reading${pts.length !== 1 ? 's' : ''}</div>
                            </div>
                            <div class="trend-latest">
                                <div class="trend-latest-val status-${esc(latestStatus)}" style="color:var(--clr-${latestStatus === 'normal' ? 'normal' : latestStatus === 'high' ? 'high' : latestStatus === 'low' ? 'low' : 'text-md'})">
                                    ${fmtVal(latest?.value, t.decimals ?? 2)}
                                </div>
                                ${latest ? `<div class="trend-units">${fmtDate(latest.date)}</div>` : ''}
                            </div>
                        </div>
                        <div class="trend-canvas-wrap">
                            <canvas class="trend-canvas" data-points='${esc(JSON.stringify(pts))}' data-low='${t.ref_range_low ?? ''}' data-high='${t.ref_range_high ?? ''}'></canvas>
                        </div>
                    </div>`;
                }).filter(Boolean).join('');

                if (!cards) return '';

                return `
                    <div class="section-heading mb-3">
                        <div class="section-title">${esc(cat)}</div>
                    </div>
                    ${cards}
                    <div style="height:var(--sp-3)"></div>
                `;
            }).join('');

            contentEl.innerHTML = `
                <div class="page-header">
                    <div class="page-title">Trends</div>
                    <div class="page-subtitle">Track how your results change over time</div>
                </div>
                ${sections || renderEmpty('No Data', 'Record more test results to see trends.')}
            `;

            // Draw mini charts after render
            $$('.trend-canvas').forEach(canvas => {
                const pts  = JSON.parse(canvas.dataset.points || '[]');
                const low  = canvas.dataset.low  !== '' ? parseFloat(canvas.dataset.low)  : null;
                const high = canvas.dataset.high !== '' ? parseFloat(canvas.dataset.high) : null;
                MiniChart.draw(canvas, pts, low, high, true);
            });

        } catch (err) {
            contentEl.innerHTML = renderError(err.message);
        }
    };

    /* ---- Trend Detail ---------------------------------------------- */

    /**
     * Render a detailed trend view for a single test code.
     * @param {string} code
     */
    Views.trendDetail = async code => {
        contentEl.innerHTML = renderLoading();

        try {
            const t = await api(`api/trends.php?code=${encodeURIComponent(code)}`);
            const pts = t.data || [];

            if (!pts.length) {
                contentEl.innerHTML = renderEmpty('No Data', 'No readings recorded for this test yet.');
                return;
            }

            const tableRows = [...pts].reverse().map(p => {
                const status = resultStatus({ flag: p.flag, value_numeric: p.value, ref_range_low: t.ref_range_low, ref_range_high: t.ref_range_high });
                return `
                <tr>
                    <td>${fmtDate(p.date)}</td>
                    <td style="font-family:var(--font-mono);font-weight:700;color:var(--clr-${status === 'normal' ? 'normal' : status === 'high' ? 'high' : status === 'low' ? 'low' : 'text-md'})">${fmtVal(p.value, t.decimals ?? 2)}</td>
                    <td>${esc(t.units || '')}</td>
                    <td>${statusPill(status)}</td>
                </tr>`;
            }).join('');

            contentEl.innerHTML = `
                <button class="back-link" onclick="location.hash='#/trends'">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                    All Trends
                </button>

                <div class="page-header">
                    <div class="page-title">${esc(t.test_name || t.test_code)}</div>
                    <div class="page-subtitle">${t.units ? esc(t.units) : ''} &bull; ${pts.length} reading${pts.length !== 1 ? 's' : ''}</div>
                </div>

                <div class="card mb-3">
                    <div class="card-body" style="padding-bottom:var(--sp-3)">
                        <canvas class="trend-full-canvas"
                            data-points='${esc(JSON.stringify(pts))}'
                            data-low='${t.ref_range_low ?? ''}'
                            data-high='${t.ref_range_high ?? ''}'></canvas>
                    </div>
                </div>

                ${t.description ? `
                <div class="card mb-3">
                    <div class="card-header"><div class="card-title">About this test</div></div>
                    <div class="card-body">
                        <p class="text-sm" style="color:var(--clr-text-md);line-height:1.7">${esc(t.description)}</p>
                        ${t.ref_range_low !== null || t.ref_range_high !== null ? `
                        <div class="enc-range" style="margin-top:var(--sp-3)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--clr-normal)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                            Reference range: ${fmtRef({ ref_range_low: t.ref_range_low, ref_range_high: t.ref_range_high, ref_range_text: t.ref_range_text })} ${t.units ? esc(t.units) : ''}
                        </div>` : ''}
                    </div>
                </div>` : ''}

                <div class="card mb-3">
                    <div class="card-header"><div class="card-title">Reading History</div></div>
                    <table style="width:100%;border-collapse:collapse">
                        <thead>
                            <tr style="background:var(--clr-surface)">
                                <th style="padding:var(--sp-2) var(--sp-4);font-size:var(--text-xs);font-weight:700;text-align:left;color:var(--clr-text-muted);text-transform:uppercase;letter-spacing:.5px">Date</th>
                                <th style="padding:var(--sp-2) var(--sp-4);font-size:var(--text-xs);font-weight:700;text-align:left;color:var(--clr-text-muted);text-transform:uppercase;letter-spacing:.5px">Value</th>
                                <th style="padding:var(--sp-2) var(--sp-4);font-size:var(--text-xs);font-weight:700;text-align:left;color:var(--clr-text-muted);text-transform:uppercase;letter-spacing:.5px">Units</th>
                                <th style="padding:var(--sp-2) var(--sp-4);font-size:var(--text-xs);font-weight:700;text-align:left;color:var(--clr-text-muted);text-transform:uppercase;letter-spacing:.5px">Status</th>
                            </tr>
                        </thead>
                        <tbody style="font-size:var(--text-sm)">
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            `;

            // Draw full chart
            const fullCanvas = $('[data-points]', contentEl);
            if (fullCanvas) {
                const pts2 = JSON.parse(fullCanvas.dataset.points || '[]');
                const low  = fullCanvas.dataset.low  !== '' ? parseFloat(fullCanvas.dataset.low)  : null;
                const high = fullCanvas.dataset.high !== '' ? parseFloat(fullCanvas.dataset.high) : null;
                MiniChart.draw(fullCanvas, pts2, low, high, false);
            }

        } catch (err) {
            contentEl.innerHTML = renderError(err.message);
        }
    };

    /* ---- Encyclopedia --------------------------------------------- */

    /**
     * Render the plain-English encyclopedia for the user's test types.
     */
    Views.encyclopedia = async () => {
        contentEl.innerHTML = renderLoading();

        try {
            const types = await api('api/test-types.php');

            if (!Object.keys(types).length) {
                contentEl.innerHTML = renderEmpty('No Tests Yet', 'Record some blood tests and the encyclopedia will show relevant information about each one.', '#/add', 'Add Results');
                return;
            }

            const categories = Object.keys(types);

            const sections = categories.map(cat => {
                const tests = types[cat];
                const items = tests.map(t => {
                    const range = fmtRef({ ref_range_low: t.ref_low, ref_range_high: t.ref_high, ref_range_text: null });

                    return `
                    <div class="enc-item" id="enc-${esc(t.test_code)}">
                        <div class="enc-header" onclick="App.toggleEncItem(this)">
                            <div>
                                <div class="enc-title">${esc(t.name)}</div>
                                <div style="margin-top:3px">
                                    <span class="enc-code">${esc(t.test_code)}</span>
                                    <span class="enc-category" style="margin-left:6px">${esc(cat)}</span>
                                </div>
                            </div>
                            <svg class="enc-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                        </div>
                        <div class="enc-body">
                            ${t.description ? `
                            <div class="enc-section">
                                <div class="enc-section-title">What it is</div>
                                <div class="enc-section-text">${esc(t.description)}</div>
                            </div>` : ''}
                            ${t.why_done ? `
                            <div class="enc-section">
                                <div class="enc-section-title">Why it's tested</div>
                                <div class="enc-section-text">${esc(t.why_done)}</div>
                            </div>` : ''}
                            ${range ? `
                            <div class="enc-section">
                                <div class="enc-section-title">Reference range</div>
                                <div class="enc-range">${range}${t.units ? ' ' + esc(t.units) : ''}</div>
                            </div>` : ''}
                            ${(t.low_meaning || t.high_meaning) ? `
                            <div class="enc-section">
                                <div class="enc-section-title">What abnormal results mean</div>
                                <div class="enc-status-grid">
                                    ${t.low_meaning  ? `<div class="enc-status-box low"><span class="enc-dir">&#9660; Low</span>${esc(t.low_meaning)}</div>`  : '<div></div>'}
                                    ${t.high_meaning ? `<div class="enc-status-box high"><span class="enc-dir">&#9650; High</span>${esc(t.high_meaning)}</div>` : '<div></div>'}
                                </div>
                            </div>` : ''}
                        </div>
                    </div>`;
                }).join('');

                return `
                    <div class="section-heading mb-3"><div class="section-title">${esc(cat)}</div></div>
                    ${items}
                    <div style="height:var(--sp-3)"></div>
                `;
            }).join('');

            contentEl.innerHTML = `
                <div class="page-header">
                    <div class="page-title">Encyclopedia</div>
                    <div class="page-subtitle">Plain-English guide to your blood tests</div>
                </div>
                ${sections}
            `;

        } catch (err) {
            contentEl.innerHTML = renderError(err.message);
        }
    };

    /* ---- Add Test Results ----------------------------------------- */

    /**
     * Render the multi-step "Add Results" form.
     */
    Views.add = async () => {
        contentEl.innerHTML = renderLoading();

        try {
            const allTypes = await api('api/test-types.php?all=1');
            renderAddStep1(allTypes);
        } catch (err) {
            contentEl.innerHTML = renderError(err.message);
        }
    };

    /**
     * Step 1: Test metadata (date, lab, doctor).
     * @param {object} allTypes  Category → test list map
     */
    const renderAddStep1 = allTypes => {
        const today = new Date().toISOString().split('T')[0];

        contentEl.innerHTML = `
            <div class="page-header">
                <div class="page-title">Add Results</div>
                <div class="page-subtitle">Step 1 of 3 — Test details</div>
            </div>

            <div class="card card-body">
                <div class="form-group">
                    <label class="form-label" for="add-date">Test date *</label>
                    <input id="add-date" type="date" class="form-input" value="${today}" max="${today}" required>
                </div>
                <div class="form-group">
                    <label class="form-label" for="add-lab">Laboratory</label>
                    <input id="add-lab" type="text" class="form-input" placeholder="e.g. Melbourne Pathology" value="Melbourne Pathology">
                </div>
                <div class="form-group">
                    <label class="form-label" for="add-doctor">Referring doctor</label>
                    <input id="add-doctor" type="text" class="form-input" placeholder="e.g. Dr Smith">
                </div>
                <div class="form-group">
                    <label class="form-label" for="add-ref">Lab reference</label>
                    <input id="add-ref" type="text" class="form-input" placeholder="Optional">
                </div>
                <div class="form-group">
                    <label class="form-label" for="add-notes">Notes</label>
                    <textarea id="add-notes" class="form-textarea" placeholder="Any additional notes"></textarea>
                </div>

                <button class="btn btn-primary btn-full" onclick="App.addStep2()">
                    Choose Tests &rarr;
                </button>
            </div>
        `;

        // Store allTypes for next step
        window.__addTypes = allTypes;
    };

    /**
     * Step 2: Select which test panels to enter results for.
     */
    window.addStep2Data = {};

    const renderAddStep2 = () => {
        const date   = $('#add-date');
        const lab    = $('#add-lab');
        const doctor = $('#add-doctor');
        const ref    = $('#add-ref');
        const notes  = $('#add-notes');

        if (!date?.value) { toastError('Please select a test date.'); return; }

        window.addStep2Data = {
            test_date:        date.value,
            lab_name:         lab?.value.trim() || '',
            referring_doctor: doctor?.value.trim() || '',
            lab_reference:    ref?.value.trim() || '',
            notes:            notes?.value.trim() || '',
        };

        const allTypes = window.__addTypes || {};
        const categories = Object.keys(allTypes);

        if (!categories.length) {
            toastError('No test types available – check API.');
            return;
        }

        const checkboxes = categories.map(cat => {
            const slugCat = cat.replace(/[^a-zA-Z0-9]/g, '_');
            return `
            <div style="margin-bottom:var(--sp-3)">
                <div class="form-label" style="margin-bottom:var(--sp-2)">${esc(cat)}</div>
                ${allTypes[cat].map(t =>
                    `<div class="form-check">
                        <input type="checkbox" class="check-input test-panel-check" id="chk-${esc(t.test_code)}" value="${esc(t.test_code)}">
                        <label class="check-label" for="chk-${esc(t.test_code)}">${esc(t.name)}</label>
                    </div>`
                ).join('')}
            </div>`;
        }).join('');

        contentEl.innerHTML = `
            <div class="page-header">
                <div class="page-title">Add Results</div>
                <div class="page-subtitle">Step 2 of 3 — Select tests performed</div>
            </div>

            <div class="card card-body">
                <p class="text-muted" style="margin-bottom:var(--sp-4)">Tick every test that was included in your results.</p>
                ${checkboxes}
                <button class="btn btn-primary btn-full" onclick="App.addStep3()">Enter Values &rarr;</button>
                <button class="btn btn-ghost btn-full mt-1" onclick="App.addBack1()">&#8592; Back</button>
            </div>
        `;

        window.__addTypes = allTypes;
    };

    /**
     * Step 3: Enter numeric values for the selected tests.
     */
    const renderAddStep3 = () => {
        const checked = [...$$('.test-panel-check:checked')].map(c => c.value);
        if (!checked.length) { toastError('Please select at least one test.'); return; }

        const allTypes = window.__addTypes || {};
        const allFlat = Object.values(allTypes).flat();
        const selected = allFlat.filter(t => checked.includes(t.test_code));

        const fields = selected.map(t => `
            <div class="result-input-row">
                <div class="result-input-label">
                    ${esc(t.name)}
                    <small>${t.ref_low !== null || t.ref_high !== null ? 'Ref: ' + fmtRef({ ref_range_low: t.ref_low, ref_range_high: t.ref_high, ref_range_text: null }) : ''}</small>
                </div>
                <input type="number" step="any" class="result-input-field" data-code="${esc(t.test_code)}" placeholder="—">
                <div class="result-input-units">${t.units ? esc(t.units) : ''}</div>
            </div>
        `).join('');

        contentEl.innerHTML = `
            <div class="page-header">
                <div class="page-title">Add Results</div>
                <div class="page-subtitle">Step 3 of 3 — Enter values</div>
            </div>

            <div class="card card-body">
                <p class="text-muted" style="margin-bottom:var(--sp-3)">Enter the value for each test. Leave blank to skip.</p>
                ${fields}
                <div style="margin-top:var(--sp-4)">
                    <button class="btn btn-primary btn-full" onclick="App.saveResults()">Save Results</button>
                    <button class="btn btn-ghost btn-full mt-1" onclick="App.addBack2()">&#8592; Back</button>
                </div>
            </div>
        `;

        window.__addSelected = selected;
    };

    /* ── Global App Namespace ────────────────────────────────────── */

    /** Public methods used by inline onclick handlers. */
    window.App = {

        /** Route to trend detail for a test code. */
        goTrend: code => { location.hash = `#/trends/${encodeURIComponent(code)}`; },

        /** Step navigation. */
        addStep2:  renderAddStep2,
        addStep3:  renderAddStep3,
        addBack1:  () => { contentEl.innerHTML = ''; Views.add(); },
        addBack2:  renderAddStep2,

        /** Toggle an encyclopedia item open/closed. */
        toggleEncItem: header => {
            const item = header.closest('.enc-item');
            if (item) item.classList.toggle('is-open');
        },

        /** Confirm and delete a blood test session. */
        confirmDeleteTest: id => {
            showModal(`
                <div style="padding:var(--sp-6)">
                    <div class="card-title" style="margin-bottom:var(--sp-3)">Delete this test session?</div>
                    <p class="text-muted" style="margin-bottom:var(--sp-5)">This will permanently remove the session and all its results. This cannot be undone.</p>
                    <div class="flex-row">
                        <button class="btn btn-ghost flex-1" onclick="App.closeModal()">Cancel</button>
                        <button class="btn btn-primary flex-1" style="background:var(--clr-high)" onclick="App.deleteTest(${id})">Delete</button>
                    </div>
                </div>
            `);
        },

        closeModal: hideModal,

        /** Delete a blood test session. */
        deleteTest: async id => {
            hideModal();
            try {
                await api(`api/blood-tests.php?id=${id}`, { method: 'DELETE', noCache: true });
                bustCache('api/blood-tests.php');
                App.latestTest = null;
                App.tests = [];
                location.hash = '#/history';
            } catch (err) {
                toastError(err.message || 'Could not delete test session.');
            }
        },

        /** Save new test results (step 3). */
        saveResults: async () => {
            const selected = window.__addSelected || [];
            const meta     = window.addStep2Data || {};

            const results = [];
            selected.forEach(t => {
                const input = $(`[data-code="${t.test_code}"]`);
                if (!input) return;
                const raw = input.value.trim();
                if (raw === '') return;
                const val = parseFloat(raw);
                if (isNaN(val)) return;

                let flag = '';
                if (t.ref_high !== null && val > t.ref_high) flag = 'H';
                else if (t.ref_low !== null && val < t.ref_low) flag = 'L';

                results.push({
                    test_code:      t.test_code,
                    value_numeric:  val,
                    value_text:     raw,
                    flag:           flag,
                    ref_range_low:  t.ref_low,
                    ref_range_high: t.ref_high,
                    units:          t.units || '',
                });
            });

            if (!results.length) { toastError('No values entered.'); return; }

            try {
                const body = { ...meta, results };
                await api('api/blood-tests.php', { method: 'POST', body, noCache: true });
                bustCache('api/blood-tests.php');
                bustCache('api/trends.php');
                App.latestTest = null;
                location.hash = '#/history';
            } catch (err) {
                toastError(err.message || 'Failed to save results. Please try again.');
            }
        },

        /** Trigger AI analysis for a blood test session. */
        analyseTest: async bloodTestId => {
            showModal(`
                <div class="ai-panel">
                    <div class="ai-panel-header">
                        <div class="ai-panel-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3m-3.27-6.73-2.12 2.12M7.39 16.61l-2.12 2.12m0-12.85 2.12 2.12M16.61 16.61l2.12 2.12"/></svg>
                        </div>
                        <div>
                            <div class="ai-panel-title">AI Analysis</div>
                            <div class="ai-panel-subtitle">Powered by Gemini – for informational purposes only</div>
                        </div>
                    </div>
                    <div class="ai-panel-body" id="ai-body">
                        <div class="ai-loading">
                            <div class="spinner" style="border-top-color:var(--clr-ai)"></div>
                            <div class="ai-loading-text">Analysing your results…</div>
                        </div>
                    </div>
                </div>
            `);

            try {
                const res  = await api('api/analyse.php', {
                    method:  'POST',
                    body:    { blood_test_id: bloodTestId },
                    noCache: true,
                });
                const body = $('#ai-body');
                if (!body) return;

                body.innerHTML = `
                    <div class="ai-content">${renderMarkdown(res.analysis || 'No analysis available.')}</div>
                    <div class="ai-note-box">
                        This analysis is provided for general information only and is not a substitute for professional medical advice. Always consult your doctor about your results.
                    </div>
                `;
            } catch (err) {
                const body = $('#ai-body');
                if (body) body.innerHTML = renderError(err.message || 'Analysis failed. Please try again.');
            }
        },
    };

    /* ── Minimal Markdown renderer ───────────────────────────────── */

    /**
     * Convert a small subset of Markdown to safe HTML.
     * Handles: ## headings, **bold**, * bullets, line breaks.
     * All user-facing content is escaped first.
     *
     * @param {string} text
     * @returns {string}  HTML string (headings, paragraphs, lists, bold)
     */
    const renderMarkdown = text => {
        if (!text) return '';

        const lines   = text.split('\n');
        const out     = [];
        let inList    = false;

        const closePara = () => {
            if (inList) { out.push('</ul>'); inList = false; }
        };

        const processInline = str =>
            esc(str)
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>');

        lines.forEach(line => {
            const trimmed = line.trim();

            if (!trimmed) {
                closePara();
                return;
            }

            if (/^##\s+/.test(trimmed)) {
                closePara();
                out.push(`<h2>${processInline(trimmed.replace(/^##\s+/, ''))}</h2>`);
                return;
            }

            if (/^[*-]\s+/.test(trimmed)) {
                if (!inList) { out.push('<ul>'); inList = true; }
                out.push(`<li>${processInline(trimmed.replace(/^[*-]\s+/, ''))}</li>`);
                return;
            }

            closePara();
            out.push(`<p>${processInline(trimmed)}</p>`);
        });

        closePara();
        return out.join('');
    };

    /* ── Empty state helper ──────────────────────────────────────── */

    /**
     * Render an empty state placeholder.
     * @param {string} title
     * @param {string} desc
     * @param {string} [link]
     * @param {string} [linkLabel]
     * @returns {string}
     */
    const renderEmpty = (title, desc, link, linkLabel) => `
        <div class="empty-state">
            <div class="empty-state-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--clr-text-muted)" stroke-width="1.5">
                    <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
            </div>
            <div class="empty-state-title">${esc(title)}</div>
            <div class="empty-state-desc">${esc(desc)}</div>
            ${link ? `<a href="${esc(link)}" class="btn btn-primary mt-3">${esc(linkLabel || 'Go')}</a>` : ''}
        </div>
    `;

    /* ── MiniChart – canvas trend renderer ───────────────────────── */

    const MiniChart = {

        /**
         * Draw a trend line chart on a canvas element.
         *
         * @param {HTMLCanvasElement} canvas
         * @param {Array<{date:string, value:number, flag:string}>} pts
         * @param {number|null} refLow
         * @param {number|null} refHigh
         * @param {boolean} isMini  true = small sparkline, false = full chart with axis labels
         */
        draw(canvas, pts, refLow, refHigh, isMini) {
            if (!pts || pts.length < 1) return;

            const dpr = window.devicePixelRatio || 1;
            const W   = canvas.offsetWidth  || canvas.clientWidth  || 280;
            const H   = canvas.offsetHeight || canvas.clientHeight || (isMini ? 60 : 220);

            canvas.width  = W * dpr;
            canvas.height = H * dpr;

            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);

            const padL = isMini ? 6 : 48;
            const padR = isMini ? 6 : 12;
            const padT = isMini ? 6 : 12;
            const padB = isMini ? 6 : 28;

            const vals  = pts.map(p => parseFloat(p.value));
            const allY  = [...vals];
            if (refLow  !== null) allY.push(refLow);
            if (refHigh !== null) allY.push(refHigh);

            const minY = Math.min(...allY) * 0.88;
            const maxY = Math.max(...allY) * 1.12;
            const rangeY = maxY - minY || 1;

            const chartW = W - padL - padR;
            const chartH = H - padT - padB;

            const xPos = i => padL + (pts.length > 1 ? (i / (pts.length - 1)) * chartW : chartW / 2);
            const yPos = v => padT + chartH - ((v - minY) / rangeY) * chartH;

            // Reference range band
            if (refLow !== null || refHigh !== null) {
                const yTop = refHigh !== null ? yPos(refHigh) : padT;
                const yBot = refLow  !== null ? yPos(refLow)  : padT + chartH;
                ctx.fillStyle = 'rgba(22,163,74,0.08)';
                ctx.fillRect(padL, yTop, chartW, yBot - yTop);

                ctx.strokeStyle = 'rgba(22,163,74,0.3)';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                if (refHigh !== null) {
                    ctx.beginPath(); ctx.moveTo(padL, yPos(refHigh)); ctx.lineTo(padL + chartW, yPos(refHigh)); ctx.stroke();
                }
                if (refLow !== null) {
                    ctx.beginPath(); ctx.moveTo(padL, yPos(refLow)); ctx.lineTo(padL + chartW, yPos(refLow)); ctx.stroke();
                }
                ctx.setLineDash([]);
            }

            // Axis labels (full chart only)
            if (!isMini) {
                ctx.fillStyle = 'rgba(107,127,147,0.8)';
                ctx.font = `11px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif`;
                ctx.textAlign = 'right';

                const tickCount = 4;
                for (let i = 0; i <= tickCount; i++) {
                    const v = minY + (rangeY / tickCount) * i;
                    const y = yPos(v);
                    ctx.fillText(v.toFixed(v < 10 ? 1 : 0), padL - 4, y + 4);
                }

                ctx.textAlign = 'center';
                pts.forEach((p, i) => {
                    const x = xPos(i);
                    const parts = splitDate(p.date);
                    ctx.fillText(`${parts.day} ${parts.mon}`, x, H - 6);
                });
            }

            // Line
            ctx.beginPath();
            ctx.strokeStyle = '#17B0BD';
            ctx.lineWidth = isMini ? 1.5 : 2;
            ctx.lineJoin = 'round';
            ctx.lineCap  = 'round';

            pts.forEach((p, i) => {
                const x = xPos(i);
                const y = yPos(parseFloat(p.value));
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Dots
            pts.forEach((p, i) => {
                const x   = xPos(i);
                const y   = yPos(parseFloat(p.value));
                const val = parseFloat(p.value);

                let dot = '#17B0BD';
                if (refHigh !== null && val > refHigh) dot = '#DC2626';
                else if (refLow !== null && val < refLow) dot = '#2563EB';
                else if (refLow !== null || refHigh !== null) dot = '#16A34A';

                ctx.beginPath();
                ctx.arc(x, y, isMini ? 3 : 5, 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();
                ctx.strokeStyle = dot;
                ctx.lineWidth = isMini ? 1.5 : 2;
                ctx.stroke();
            });
        }
    };

    /* ── Init ────────────────────────────────────────────────────── */

    // Apply pre-loaded dashboard data from PHP shell
    if (App.latestTest) {
        window.__LATEST = App.latestTest;
    }

    // Observe hash changes and run initial route
    route();

})();
