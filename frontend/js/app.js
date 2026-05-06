/* ============================================================
   APP.JS - AirWatch Pro - COMPLETE FIXED VERSION
   FIXES APPLIED:
   1. normalisePoll - correct WAQI_CPCB source check
   2. anim() - animates from current value not 0
   3. updateAI - removed Math.random(), stable predictions
   4. calcAQI_O3 - full EPA scale 0-500
   5. useDemo - removed duplicate updateAllFeatures call
   6. setBar - cleared pending timeouts
   7. startClock - cleared interval on reload
   8. drawCompass - save/restore canvas state
   9. showAutocomplete - added try/catch
   10. calcHeatIndex - temperature validation
   11. buildHistoryTable - sanitized innerHTML
   12. loadAll - source bar updates in silent mode
   13. updateAI vs updateForecasts - removed conflict
   14. useDirect - locked CPCB AQI before any UI update
   ============================================================ */

'use strict';

/* ============================================================
   GLOBAL STATE
   ============================================================ */
var LAT               = 28.6139;
var LON               = 77.2090;
var LIVE              = {};
var forecastData      = [];
var curTab            = 'aqi';
var autocompleteTimer = null;
var selectedCityIndex = -1;
var clockInterval     = null;
var barTimers         = {};
var chartInstances    = {};

/* ============================================================
   UNIT CONVERSION CONSTANTS
   ============================================================ */
var CONV = {
    NO2_UGM3_TO_PPB : 1.88,
    O3_UGM3_TO_PPB  : 1.9632,
    SO2_UGM3_TO_PPB : 2.6196,
    CO_UGM3_TO_PPM  : 1145.45,
};

/* ============================================================
   SANITIZE HELPER - Prevent XSS
   ============================================================ */
function sanitize(str) {
    return String(str || '--')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* ============================================================
   ON PAGE LOAD
   ============================================================ */
window.addEventListener('load', async function () {
    const auth = await checkAuth();
    if (!auth) return;

    startClock();
    setTimeout(hideLoader, 2500);
    
    // --- Step 1: Try Geolocation first ---
    if (navigator.geolocation) {
        console.log('[Geo] Requesting location...');
        navigator.geolocation.getCurrentPosition(
            function(pos) {
                LAT = pos.coords.latitude;
                LON = pos.coords.longitude;
                console.log('[Geo] Found:', LAT, LON);
                loadAll(); // Load with user location
            },
            function(err) {
                console.warn('[Geo] Denied or Error:', err.message);
                loadAll(); // Fallback to default
            }
        );
    } else {
        loadAll();
    }

    setInterval(function () { loadAll(true); }, 300000);
    initSearch();
    initKeyboardShortcuts();
    console.log(
        '%c🌍 AirWatch Pro v2.0 Ready!',
        'color:#00b4ff;font-size:18px;font-weight:bold;' +
        'background:#0a0f1e;padding:8px 16px;border-radius:8px'
    );
});

async function checkAuth() {
    try {
        const res = await fetch('/api/user_status');
        const data = await res.json();
        if (!data.is_authenticated) {
            window.location.href = '/login';
            return false;
        }
        
        // Show user profile
        const up = document.getElementById('userProfile');
        if (up) up.style.display = 'block';
        
        const un = document.getElementById('usernameLabel');
        if (un) un.textContent = data.username;
        
        if (data.is_admin) {
            const ab = document.getElementById('adminBadge');
            const eb = document.getElementById('adminExportBtn');
            if (ab) ab.style.display = 'block';
            if (eb) eb.style.display = 'block';
        }
        return true;
    } catch (e) {
        window.location.href = '/login';
        return false;
    }
}

async function logout() {
    await fetch('/api/logout');
    window.location.href = '/login';
}

function exportLogs() {
    window.location.href = '/api/admin/logs';
}

/* ============================================================
   CLOCK - Fixed: clears interval to prevent memory leak
   ============================================================ */
function startClock() {
    function tick() {
        var el = document.getElementById('clock');
        if (el) {
            el.textContent = new Date().toLocaleString('en-US', {
                weekday : 'short',
                hour    : '2-digit',
                minute  : '2-digit',
                second  : '2-digit',
                hour12  : true,
            });
        }
    }
    tick();
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(tick, 1000);
}

/* ============================================================
   HIDE LOADER
   ============================================================ */
function hideLoader() {
    var l = document.getElementById('loader');
    if (l) {
        l.style.opacity = '0';
        setTimeout(function () { l.classList.add('gone'); }, 500);
    }
}

/* ============================================================
   SPIN REFRESH ICON
   ============================================================ */
function spinRef() {
    var ic = document.getElementById('refIcon');
    if (!ic) return;
    ic.style.transition = 'transform .8s cubic-bezier(.68,-.55,.27,1.55)';
    ic.style.transform  = 'rotate(360deg)';
    setTimeout(function () {
        ic.style.transform  = '';
        ic.style.transition = '';
    }, 900);
}

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */
function initKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
            e.preventDefault();
            loadAll();
            toast('Refreshing data...', 'info');
        }
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            var si = document.getElementById('citySearch');
            if (si) si.focus();
        }
        if (e.key === 'Escape') closeAutocomplete();
    });
}

/* ============================================================
   UPDATE SOURCE BAR
   ============================================================ */
function updateSourceBar(type, station) {
    var label = document.getElementById('sourceLabel');
    var dot   = document.getElementById('sourceDot');
    var stEl  = document.getElementById('sourceStation');
    var bar   = document.getElementById('sourceBar');

    if (!label) return;

    var configs = {
        cpcb : {
            text   : '📍 CPCB Ground Station',
            color  : '#2dd4a0',
            dotCol : '#2dd4a0',
            bg     : 'rgba(45,212,160,0.08)',
            brd    : 'rgba(45,212,160,0.25)',
            stCol  : 'rgba(45,212,160,0.7)',
            stText : station || 'Ground Sensor',
            footer : 'CPCB Ground Station (WAQI)',
        },
        owm : {
            text   : '🛰️ OpenWeatherMap Satellite',
            color  : '#ff9800',
            dotCol : '#ff9800',
            bg     : 'rgba(255,152,0,0.08)',
            brd    : 'rgba(255,152,0,0.25)',
            stCol  : 'rgba(255,152,0,0.7)',
            stText : 'Estimated data',
            footer : 'OpenWeatherMap (Satellite)',
        },
        demo : {
            text   : '🎭 Demo Mode - Add API keys',
            color  : '#7c5cfc',
            dotCol : '#7c5cfc',
            bg     : 'rgba(124,92,252,0.08)',
            brd    : 'rgba(124,92,252,0.25)',
            stCol  : 'rgba(124,92,252,0.6)',
            stText : 'No API key set',
            footer : 'Demo Mode',
        },
        loading : {
            text   : '⏳ Fetching CPCB data...',
            color  : 'var(--txt2)',
            dotCol : 'var(--txt3)',
            bg     : 'rgba(255,255,255,0.03)',
            brd    : 'rgba(255,255,255,0.08)',
            stCol  : 'var(--txt3)',
            stText : 'Please wait...',
            footer : 'Loading...',
        },
    };

    var cfg = configs[type] || configs.loading;

    label.textContent = cfg.text;
    label.style.color = cfg.color;
    if (dot) { dot.style.background = cfg.dotCol; }
    if (bar) {
        bar.style.background = cfg.bg;
        bar.style.border     = '1px solid ' + cfg.brd;
    }
    if (stEl) {
        stEl.textContent = cfg.stText;
        stEl.style.color = cfg.stCol;
    }
    var dsEl = document.getElementById('dataSource');
    if (dsEl) dsEl.textContent = cfg.footer;
}

/* ============================================================
   LOAD ALL DATA
   Fixed: source bar now updates even in silent mode
   ============================================================ */
async function loadAll(silent) {
    silent = silent || false;
    spinRef();

    if (typeof api === 'undefined') {
        console.error('[APP] api not defined');
        updateSourceBar('demo');
        useDemo();
        hideLoader();
        return;
    }

    if (!silent) {
        var lu = document.getElementById('lastUpdated');
        if (lu) lu.innerHTML =
            '<i class="fas fa-spinner fa-spin"></i> Loading...';
        updateSourceBar('loading');
    }

    try {
        var r = await api.fetchAll(LAT, LON);

        console.log('%c[APP] Source: ' + r.source,
            'color:#7c5cfc;font-weight:bold');

        if (r.source === 'direct' || r.source === 'backend') {
            if (r.waqi_available && r.waqi_station) {
                updateSourceBar('cpcb', r.waqi_station);
                console.log(
                    '%c🎯 CPCB Official AQI: ' + r.waqi_official
                    + ' | Station: ' + r.waqi_station,
                    'color:#2dd4a0;font-size:14px;font-weight:bold'
                );
            } else {
                updateSourceBar('owm');
            }
            if (r.source === 'backend') useBackend(r.data);
            else                        useDirect(r.p, r.w, r.f);

        } else if (r.source === 'badkey') {
            updateSourceBar('demo');
            toast('❌ Invalid API key!', 'error');
            useDemo();
        } else if (r.source === 'nokey') {
            updateSourceBar('demo');
            toast('⚠️ No API key - demo mode', 'warning');
            useDemo();
        } else {
            updateSourceBar('demo');
            useDemo();
        }

    } catch (e) {
        console.error('[APP] loadAll error:', e);
        updateSourceBar('demo');
        useDemo();
    }

    hideLoader();
}

/* ============================================================
   USE BACKEND DATA
   ============================================================ */
function useBackend(d) {
    try {
        if (d.pollution && d.pollution.status === 'success') {
            d.pollution = normalisePoll(d.pollution);
            updateLeft(d.pollution);
            updatePollCards(d.pollution);
        }
        if (d.weather && d.weather.status === 'success') {
            updateWeather(d.weather);
        }
        if (d.forecast && d.forecast.status === 'success') {
            forecastData = normaliseForecast(d.forecast.forecasts || []);
            buildChart(forecastData, curTab);
        }
        if (d.ml_prediction && d.ml_prediction.status === 'success') {
            updateAI(d.ml_prediction);
        }
        if (d.hourly_prediction &&
            d.hourly_prediction.status === 'success') {
            updateForecasts(d.hourly_prediction.predictions);
        }
        LIVE = { poll: d.pollution, weather: d.weather };
        toast('✅ Live data loaded!', 'success');
    } catch (e) {
        console.error('useBackend error:', e);
        updateSourceBar('demo');
        useDemo();
    }
}

/* ============================================================
   24-HOUR ROLLING AVERAGE CALCULATOR
   ============================================================ */
function applyAveragingCorrection(instantPoll, forecastList) {
    function avg(arr, key) {
        var vals = arr
            .map(function (x) { return parseFloat(x[key]) || 0; })
            .filter(function (v) { return v > 0; });
        if (!vals.length) return parseFloat(instantPoll[key]) || 0;
        return vals.reduce(function (a, b) { return a + b; }, 0)
               / vals.length;
    }

    if (!forecastList || forecastList.length < 2) {
        return {
            pm2_5 : (parseFloat(instantPoll.pm2_5) || 0) * 0.78,
            pm10  : (parseFloat(instantPoll.pm10)  || 0) * 0.80,
            no2   : (parseFloat(instantPoll.no2)   || 0),
            o3    : (parseFloat(instantPoll.o3)    || 0) * 0.85,
            co    : (parseFloat(instantPoll.co)    || 0) * 0.82,
            so2   : (parseFloat(instantPoll.so2)   || 0),
            nh3   : (parseFloat(instantPoll.nh3)   || 0),
        };
    }

    return {
        pm2_5 : avg(forecastList.slice(0, 24), 'pm2_5'),
        pm10  : avg(forecastList.slice(0, 24), 'pm10'),
        no2   : parseFloat(instantPoll.no2) || 0,
        o3    : avg(forecastList.slice(0, 8), 'o3'),
        co    : avg(forecastList.slice(0, 8), 'co'),
        so2   : parseFloat(instantPoll.so2) || 0,
        nh3   : parseFloat(instantPoll.nh3) || 0,
    };
}

/* ============================================================
   USE DIRECT - Fixed: locks CPCB AQI before any UI update
   ============================================================ */
function useDirect(p, w, f) {
    try {
        var forecastList = [];

        if (f && f.list && f.list.length > 0) {
            forecastList = f.list.map(function (x) {
                return {
                    pm2_5 : x.components.pm2_5 || 0,
                    pm10  : x.components.pm10  || 0,
                    no2   : x.components.no2   || 0,
                    o3    : x.components.o3    || 0,
                    co    : x.components.co    || 0,
                    so2   : x.components.so2   || 0,
                    dt    : x.dt,
                };
            });
        }

        /* ── Pollution ── */
        if (p && p.list && p.list.length > 0) {
            var comp = p.list[0].components;
            var poll, result;

            /* ─── CASE 1: Official from IQAir or CPCB ─── */
            if ((p.source === 'WAQI_CPCB' || p.source === 'IQAir') && p.official_aqi > 0) {

                console.log(
                    '%c🎯 USING CPCB OFFICIAL AQI: ' + p.official_aqi
                    + ' | Station: ' + p.waqi_station,
                    'color:#2dd4a0;font-size:16px;font-weight:bold'
                );

                poll = {
                    status : 'success',
                    source : p.source,
                    aqi    : parseFloat(p.official_aqi),
                    pm2_5  : comp.pm2_5 || 0,
                    pm10   : comp.pm10  || 0,
                    no2    : comp.no2   || 0,
                    o3     : comp.o3    || 0,
                    co     : comp.co    || 0,
                    so2    : comp.so2   || 0,
                    nh3    : comp.nh3   || 0,
                };

                poll.aqi_label = getAQILabel(poll.aqi);
                poll.aqi_color = getAQIColor(poll.aqi);

                result = calcAccurateAQI(poll);
                poll.dominant = result.dominant;

                if (p.waqi_subindices) {
                    poll.breakdown = {
                        pm25 : p.waqi_subindices.pm2_5 || 0,
                        pm10 : p.waqi_subindices.pm10  || 0,
                        no2  : p.waqi_subindices.no2   || 0,
                        o3   : p.waqi_subindices.o3    || 0,
                        co   : p.waqi_subindices.co    || 0,
                        so2  : p.waqi_subindices.so2   || 0,
                    };
                } else {
                    poll.breakdown = result.breakdown;
                }

                var stEl = document.getElementById('locSub');
                if (stEl && p.waqi_station) {
                    stEl.textContent =
                        '📍 ' + p.waqi_station + ' (CPCB)';
                }

            /* ─── CASE 2: OWM Satellite ─── */
            } else {
                var instantPoll = {
                    pm2_5 : comp.pm2_5 || 0,
                    pm10  : comp.pm10  || 0,
                    no2   : comp.no2   || 0,
                    o3    : comp.o3    || 0,
                    co    : comp.co    || 0,
                    so2   : comp.so2   || 0,
                    nh3   : comp.nh3   || 0,
                };

                var averaged = applyAveragingCorrection(
                    instantPoll, forecastList
                );

                poll = Object.assign({}, averaged, {
                    status  : 'success',
                    source  : 'OWM',
                    instant : instantPoll,
                });

                result = calcAccurateAQI(poll);

                poll.aqi       = result.aqi;
                poll.aqi_label = getAQILabel(result.aqi);
                poll.aqi_color = getAQIColor(result.aqi);
                poll.dominant  = result.dominant;
                poll.breakdown = result.breakdown;

                console.log(
                    '%c📡 OWM Calculated AQI: ' + result.aqi,
                    'color:#ff9800;font-weight:bold'
                );
            }

            updateLeft(poll);
            updatePollCards(poll);
            LIVE.poll = poll;

            /* Single AI update without random values */
            updateAI({
                predicted_aqi : poll.aqi,
                category      : poll.aqi_label,
                color         : poll.aqi_color,
                health_advice : getAQICat(poll.aqi).advice,
                dominant      : poll.dominant,
            });
        }

        /* ── Weather ── */
        if (w && w.main) {
            var ww = {
                status     : 'success',
                city       : w.name,
                country    : w.sys  ? w.sys.country : '',
                temp       : w.main.temp,
                feels_like : w.main.feels_like,
                humidity   : w.main.humidity,
                pressure   : w.main.pressure,
                wind_speed : w.wind ? w.wind.speed  : 0,
                wind_deg   : w.wind ? w.wind.deg    : 0,
                visibility : w.visibility || 0,
                weather    : w.weather
                    ? w.weather[0].description : '',
                icon       : w.weather ? w.weather[0].icon : '',
                sunrise    : w.sys && w.sys.sunrise
                    ? new Date(w.sys.sunrise * 1000)
                        .toLocaleTimeString('en', {
                            hour:'2-digit', minute:'2-digit'
                        }) : '--',
                sunset     : w.sys && w.sys.sunset
                    ? new Date(w.sys.sunset * 1000)
                        .toLocaleTimeString('en', {
                            hour:'2-digit', minute:'2-digit'
                        }) : '--',
            };
            updateWeather(ww);
            LIVE.weather = ww;
        }

        /* ── Forecast ── */
        if (f && f.list && f.list.length > 0) {
            forecastData = f.list.slice(0, 24).map(function (x) {
                var fc = {
                    pm2_5 : x.components.pm2_5 || 0,
                    pm10  : x.components.pm10  || 0,
                    no2   : x.components.no2   || 0,
                    o3    : x.components.o3    || 0,
                    co    : x.components.co    || 0,
                    so2   : x.components.so2   || 0,
                };
                var fr = calcAccurateAQI(fc);
                return {
                    hour_label : new Date(x.dt * 1000).getHours() + ':00',
                    timestamp  : x.dt,
                    aqi        : fr.aqi,
                    dominant   : fr.dominant,
                    pm2_5      : x.components.pm2_5,
                    pm10       : x.components.pm10,
                    no2        : x.components.no2,
                    o3         : x.components.o3,
                    co         : x.components.co,
                    so2        : x.components.so2,
                };
            });

            buildChart(forecastData, curTab);

            var preds = forecastData.slice(0, 24).map(function (x, i) {
                return { hour: i + 1, predicted_aqi: x.aqi };
            });
            updateForecasts(preds);
            drawHeatmap(forecastData);
            buildHistoryTable(forecastData);
        }

        toast('✅ Data loaded successfully!', 'success');

    } catch (e) {
        console.error('useDirect error:', e);
        updateSourceBar('demo');
        useDemo();
    }
}

/* ============================================================
   NORMALISE HELPERS
   Fixed: correctly checks WAQI_CPCB source
   ============================================================ */
function normalisePoll(poll) {
    var result = calcAccurateAQI(poll);

    var isOfficial = (
        poll.source === 'WAQI_CPCB' ||
        poll.source === 'IQAir' ||
        poll.source === 'WAQI'
    ) && poll.aqi != null && parseFloat(poll.aqi) > 0;

    poll.aqi       = isOfficial
        ? parseFloat(poll.aqi)
        : result.aqi;
    poll.aqi_label = getAQILabel(poll.aqi);
    poll.aqi_color = getAQIColor(poll.aqi);
    poll.dominant  = result.dominant;

    if (!poll.breakdown) {
        poll.breakdown = result.breakdown;
    }

    return poll;
}

function normaliseForecast(forecasts) {
    return forecasts.map(function (f) {
        var result = calcAccurateAQI(f);
        f.aqi      = result.aqi;
        f.dominant = result.dominant;
        return f;
    });
}

/* ============================================================
   UPDATE LEFT PANEL
   Fixed: uses poll.aqi directly without recalculation
   ============================================================ */
function updateLeft(poll) {
    var result = calcAccurateAQI(poll);

    var num = (poll.aqi && poll.aqi > 0)
        ? parseFloat(poll.aqi)
        : result.aqi;

    var color = getAQIColor(num);
    var label = getAQILabel(num);
    var cat   = getAQICat(num);

    console.group('%c=== AQI DISPLAY ===',
        'color:#00b4ff;font-weight:bold');
    console.log(
        '%c' + (poll.source === 'WAQI_CPCB'
            ? '🎯 CPCB Official' : '📡 Calculated')
        + ' AQI: ' + num,
        'color:' + color + ';font-size:14px;font-weight:bold'
    );
    console.log('poll.aqi was   : ' + poll.aqi);
    console.log('calc result was: ' + result.aqi);
    console.log('USING          : ' + num);
    console.groupEnd();

    var numEl = document.getElementById('aqiBigNum');
    if (numEl) {
        anim(numEl, parseFloat(numEl.textContent) || 0, num, 1800);
        numEl.style.color      = color;
        numEl.style.textShadow =
            '0 0 40px ' + color + '66,0 0 80px ' + color + '33';
    }

    var pill = document.getElementById('aqiPill');
    if (pill) {
        pill.textContent      = label;
        pill.style.background = color + '22';
        pill.style.color      = color;
        pill.style.border     = '1px solid ' + color + '55';
        pill.style.boxShadow  = '0 0 12px ' + color + '33';
    }

    var disp = document.getElementById('aqiDisplay');
    if (disp) {
        disp.style.background =
            'linear-gradient(180deg,' + color + '15 0%,transparent 60%)';
    }

    set('aqiMessage', cat.advice);
    set('domPoll',    result.dominant);
    set('domDesc',    'Primary pollutant driving AQI today');

    if (poll.breakdown) {
        updateBreakdownBadges(poll.breakdown);
    } else {
        updateBreakdownBadges(result.breakdown);
    }

    var pointer = document.getElementById('scalePointer');
    if (pointer) {
        var pct = Math.min(num / 500 * 100, 100);
        pointer.style.left       = pct + '%';
        pointer.style.background = color;
        pointer.style.boxShadow  = '0 0 8px ' + color;
    }

    var tips = getAdvice(num);
    var list = document.getElementById('adviceList');
    if (list) {
        list.innerHTML = tips.map(function (t) {
            return '<div class="ab-item" style="border-left:3px solid '
                + t.color + '30">'
                + '<div class="ab-icon" style="background:'
                + t.color + '20;color:' + t.color + '">'
                + '<i class="' + t.icon + '"></i></div>'
                + '<span>' + sanitize(t.text) + '</span></div>';
        }).join('');
    }

    var lu = document.getElementById('lastUpdated');
    if (lu) {
        lu.innerHTML =
            '<i class="fas fa-circle" style="color:#2dd4a0;'
            + 'font-size:8px;animation:pulse 2s infinite"></i>'
            + ' Live · ' + new Date().toLocaleTimeString();
    }

    if (typeof bgScene !== 'undefined') bgScene.updateAQI(num);

    updateAllFeatures(poll, num);
}

/* ============================================================
   UPDATE BREAKDOWN BADGES
   ============================================================ */
function updateBreakdownBadges(breakdown) {
    ['pm25','pm10','no2','o3','co','so2'].forEach(function (p) {
        var el = document.getElementById('bd-' + p);
        if (!el) return;
        var val   = breakdown[p] || 0;
        var color = getAQIColor(val);
        el.textContent      = val;
        el.style.color      = color;
        el.style.background = color + '20';
        el.style.border     = '1px solid ' + color + '44';
    });
}

/* ============================================================
   UPDATE POLLUTANT CARDS
   ============================================================ */
function updatePollCards(poll) {
    var items = [
        { id:'pm25', val:poll.pm2_5, max:250,  limit:15   },
        { id:'pm10', val:poll.pm10,  max:400,  limit:45   },
        { id:'no2',  val:poll.no2,   max:300,  limit:25   },
        { id:'o3',   val:poll.o3,    max:300,  limit:100  },
        { id:'co',   val:poll.co,    max:8000, limit:4000 },
        { id:'so2',  val:poll.so2,   max:400,  limit:40   },
    ];

    items.forEach(function (item) {
        var v    = parseFloat(item.val) || 0;
        var pct  = Math.min(100, (v / item.max) * 100);
        var safe = v <= item.limit;
        var col  = pct < 25 ? '#2dd4a0'
                 : pct < 50 ? '#00b4ff'
                 : pct < 75 ? '#ff9800'
                 : '#f44444';

        var valEl = document.getElementById('pv-' + item.id);
        if (valEl) anim(valEl, parseFloat(valEl.textContent) || 0, v, 1200);

        var bar = document.getElementById('pbar-' + item.id);
        if (bar) {
            setTimeout(function () {
                bar.style.width      = pct + '%';
                bar.style.background =
                    'linear-gradient(90deg,' + col + ',' + col + 'aa)';
                bar.style.boxShadow  = '0 0 8px ' + col + '66';
            }, 200);
        }

        var badge = document.getElementById('pb-' + item.id);
        if (badge) {
            badge.textContent      = safe ? 'Safe' : 'High';
            badge.style.background = safe
                ? 'rgba(45,212,160,0.15)' : 'rgba(255,68,68,0.15)';
            badge.style.color  = safe ? '#2dd4a0' : '#f44444';
            badge.style.border = '1px solid '
                + (safe ? 'rgba(45,212,160,0.3)' : 'rgba(255,68,68,0.3)');
        }

        var card = document.getElementById('p-' + item.id);
        if (card) {
            card.style.borderTopColor = col;
            card.style.boxShadow      = '0 0 0 1px ' + col + '22 inset';
            var cardNumEl = card.querySelector('.p-value');
            if (cardNumEl) cardNumEl.style.color = col;
        }

        var limitEl = document.getElementById('plimit-' + item.id);
        if (limitEl) {
            limitEl.textContent = (v / item.limit).toFixed(1) + '× WHO';
            limitEl.style.color = safe ? '#2dd4a0' : '#f44444';
        }
    });
}

/* ============================================================
   UPDATE WEATHER
   ============================================================ */
function updateWeather(w) {
    set('locCity',  w.city    || '--');
    set('locSub',  (w.country || '') + ' • ' + capitalise(w.weather || ''));
    set('navCity', (w.city    || '--') + ', ' + (w.country || ''));

    set('qsTemp',  w.temp       ? w.temp.toFixed(0)      : '--');
    set('qsHumid', w.humidity   ? w.humidity              : '--');
    set('qsWind',  w.wind_speed ? w.wind_speed.toFixed(1) : '--');

    set('wiTemp',    (w.temp       ? w.temp.toFixed(1)       : '--') + '°C');
    set('wiFeels',   (w.feels_like ? w.feels_like.toFixed(1) : '--') + '°C');
    set('wiHumid',   (w.humidity   || '--') + '%');
    set('wiWind',    (w.wind_speed || '--') + ' m/s');
    set('wiPres',    (w.pressure   || '--') + ' hPa');
    set('wiVis',     ((w.visibility || 0) / 1000).toFixed(1) + ' km');
    set('wiSun',      w.sunrise || '--');
    set('wiSunset',   w.sunset  || '--');
    set('wiSunset2',  w.sunset  || '--');

    var iconEl = document.getElementById('weatherIcon');
    if (iconEl && w.icon) {
        iconEl.src = 'https://openweathermap.org/img/wn/' + w.icon + '@2x.png';
        iconEl.style.display = 'block';
    }

    if (w.temp != null && w.humidity != null) {
        set('heatIndex', calcHeatIndex(w.temp, w.humidity).toFixed(1) + '°C');
        set('dewPoint',  calcDewPoint(w.temp, w.humidity).toFixed(1)  + '°C');
    }

    if (w.wind_deg != null) drawCompass(w.wind_deg);
}

/* ============================================================
   WEATHER CALCULATIONS
   Fixed: calcHeatIndex validates temperature range
   ============================================================ */
function calcHeatIndex(T, H) {
    if (T < 27 || H < 40) {
        return T;
    }
    return -8.78469475556
        + 1.61139411      * T
        + 2.33854883889   * H
        - 0.14611605      * T * H
        - 0.012308094     * T * T
        - 0.0164248277778 * H * H
        + 0.002211732     * T * T * H
        + 0.00072546      * T * H * H
        - 0.000003582     * T * T * H * H;
}

function calcDewPoint(T, H) {
    var a = 17.27, b = 237.7;
    var alpha = ((a * T) / (b + T)) + Math.log(H / 100);
    return (b * alpha) / (a - alpha);
}

function capitalise(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

/* ============================================================
   UPDATE AI FORECAST BARS
   Fixed: removed Math.random() for stable predictions
   Fixed: removed conflict with updateForecasts()
   ============================================================ */
function updateAI(pred) {
    var rawAqi = parseFloat(pred.predicted_aqi) || 0;
    var color  = pred.color || getAQIColor(rawAqi);

    if (pred.dominant) set('aiDominant', pred.dominant);

    setBar('af1', rawAqi, 500, color);
    set('afv1', Math.round(rawAqi));

    /* Stable deterministic scaling - no more random flicker */
    var h3  = Math.round(rawAqi * 0.98);
    var h6  = Math.round(rawAqi * 0.95);
    var h12 = Math.round(rawAqi * 0.92);
    var h24 = Math.round(rawAqi * 0.88);

    setBar('af3',  h3,  500, getAQIColor(h3));  set('afv3',  h3);
    setBar('af6',  h6,  500, getAQIColor(h6));  set('afv6',  h6);
    setBar('af12', h12, 500, getAQIColor(h12)); set('afv12', h12);
    setBar('af24', h24, 500, getAQIColor(h24)); set('afv24', h24);

    if (pred.individual_models) {
        updateModelBars(pred.individual_models, rawAqi);
    }
}

/* ============================================================
   UPDATE MODEL COMPARISON BARS
   ============================================================ */
function updateModelBars(models, final) {
    var map = {
        'mb-gb'  : models.gradient_boosting,
        'mb-rf'  : models.random_forest,
        'mb-ada' : models.adaboost,
        'mb-rid' : models.ridge,
        'mb-ens' : final,
    };
    Object.keys(map).forEach(function (id) {
        var val = map[id] || 0;
        var bar = document.getElementById(id);
        var num = document.getElementById(id + '-num');
        if (bar) {
            bar.style.width      = Math.min(100, val / 5) + '%';
            bar.style.background = getAQIColor(val);
        }
        if (num) {
            num.textContent = Math.round(val);
            num.style.color = getAQIColor(val);
        }
    });
}

/* ============================================================
   UPDATE FORECASTS FROM HOURLY
   ============================================================ */
function updateForecasts(preds) {
    if (!preds || !preds.length) return;
    var get = function (i) {
        return preds[i] ? parseFloat(preds[i].predicted_aqi) || 0 : 0;
    };
    var h1  = get(0);
    var h3  = get(2)  || Math.round(h1 * 0.98);
    var h6  = get(5)  || Math.round(h1 * 0.95);
    var h12 = get(11) || Math.round(h1 * 0.92);
    var h24 = get(23) || Math.round(h1 * 0.88);

    setBar('af1',  h1,  500, getAQIColor(h1));  set('afv1',  Math.round(h1));
    setBar('af3',  h3,  500, getAQIColor(h3));  set('afv3',  Math.round(h3));
    setBar('af6',  h6,  500, getAQIColor(h6));  set('afv6',  Math.round(h6));
    setBar('af12', h12, 500, getAQIColor(h12)); set('afv12', Math.round(h12));
    setBar('af24', h24, 500, getAQIColor(h24)); set('afv24', Math.round(h24));
}

/* ============================================================
   SET FORECAST BAR
   Fixed: clears pending timeouts to prevent stutter
   ============================================================ */
function setBar(id, val, max, color) {
    var bar = document.getElementById(id);
    if (!bar) return;
    clearTimeout(barTimers[id]);
    bar.style.transition =
        'width 0.8s cubic-bezier(.25,.8,.25,1),background 0.5s';
    barTimers[id] = setTimeout(function () {
        bar.style.width =
            Math.min(100, (val / max) * 100) + '%';
        bar.style.background =
            'linear-gradient(90deg,' + color + ',' + color + 'bb)';
        bar.style.boxShadow = '0 0 10px ' + color + '55';
    }, 300);
}

/* ============================================================
   BUILD TREND CHART
   ============================================================ */
function buildChart(data, tab) {
    if (!data || !data.length) return;
    var values, label, color;

    if (tab === 'pm25') {
        values = data.map(function (f) { return +(f.pm2_5 || 0).toFixed(1); });
        label = 'PM2.5 (µg/m³)'; color = '#00b4ff';
    } else if (tab === 'pm10') {
        values = data.map(function (f) { return +(f.pm10 || 0).toFixed(1); });
        label = 'PM10 (µg/m³)'; color = '#7c5cfc';
    } else if (tab === 'no2') {
        values = data.map(function (f) { return +(f.no2 || 0).toFixed(1); });
        label = 'NO₂ (µg/m³)'; color = '#2dd4a0';
    } else if (tab === 'o3') {
        values = data.map(function (f) { return +(f.o3 || 0).toFixed(1); });
        label = 'O₃ (µg/m³)'; color = '#ff9800';
    } else {
        values = data.map(function (f) { return f.aqi || 0; });
        label = 'AQI (US EPA)'; color = '#e040fb';
    }

    if (typeof charts !== 'undefined' && charts.trend) {
        charts.trend(
            data.map(function (f) { return f.hour_label || ''; }),
            values, label, color
        );
    }
}

/* ============================================================
   SWITCH CHART TAB
   ============================================================ */
function changeTab(tab, btn) {
    curTab = tab;
    document.querySelectorAll('.tab-btn').forEach(function (b) {
        b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
    buildChart(forecastData, tab);
}

/* ============================================================
   SEARCH WITH AUTOCOMPLETE
   Fixed: added try/catch and loading state
   ============================================================ */
function initSearch() {
    var si = document.getElementById('citySearch');
    if (!si) return;

    si.addEventListener('keydown', function (e) {
        var items = document.querySelectorAll('.ac-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedCityIndex = Math.min(selectedCityIndex + 1, items.length - 1);
            highlightItem(items, selectedCityIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedCityIndex = Math.max(selectedCityIndex - 1, 0);
            highlightItem(items, selectedCityIndex);
        } else if (e.key === 'Enter') {
            if (selectedCityIndex >= 0 && items[selectedCityIndex]) {
                items[selectedCityIndex].click();
            } else {
                doSearch();
            }
        } else if (e.key === 'Escape') {
            closeAutocomplete();
        }
    });

    si.addEventListener('input', function () {
        var val = si.value.trim();
        selectedCityIndex = -1;
        clearTimeout(autocompleteTimer);
        if (val.length < 2) { closeAutocomplete(); return; }
        autocompleteTimer = setTimeout(function () {
            showAutocomplete(val);
        }, 300);
    });

    document.addEventListener('click', function (e) {
        if (!e.target.closest('.search-wrap')) closeAutocomplete();
    });
}

async function showAutocomplete(query) {
    try {
        var results = await api.searchCities(query);
        var drop    = document.getElementById('acDrop');
        if (!drop) return;
        if (!results || !results.length) {
            closeAutocomplete();
            return;
        }

        var indian = results.filter(function (c) { return  c.isIndian; });
        var other  = results.filter(function (c) { return !c.isIndian; });

        var makeItem = function (c) {
            var flagCode = c.country_code || c.country || '';
            var flag = flagCode
                ? '<img src="https://flagcdn.com/20x15/'
                  + sanitize(flagCode.toLowerCase())
                  + '.png" onerror="this.style.display=\'none\'" '
                  + 'style="margin-right:8px;border-radius:2px">'
                : '';
            return '<div class="ac-item" '
                + 'data-lat="' + sanitize(String(c.lat)) + '" '
                + 'data-lon="' + sanitize(String(c.lon)) + '" '
                + 'data-name="' + sanitize(c.name) + '">'
                + flag
                + '<div class="ac-text">'
                + '<span class="ac-name">' + sanitize(c.name) + '</span>'
                + '<span class="ac-sub">'
                + (c.state ? sanitize(c.state) + ', ' : '')
                + sanitize(c.country || '')
                + '</span></div></div>';
        };

        var html = '<div class="ac-scroll-buttons">'
            + '<button class="ac-scroll-btn" onclick="scrollAutocomplete(-1)">'
            + '<i class="fas fa-chevron-up"></i></button></div>'
            + '<div class="ac-items-container">';

        if (indian.length) {
            html += '<div class="ac-section">🇮🇳 India</div>';
            html += indian.map(makeItem).join('');
        }
        if (other.length) {
            html += '<div class="ac-section">🌍 Rest of World</div>';
            html += other.map(makeItem).join('');
        }

        html += '</div>'
            + '<div class="ac-scroll-buttons">'
            + '<button class="ac-scroll-btn" onclick="scrollAutocomplete(1)">'
            + '<i class="fas fa-chevron-down"></i></button></div>';

        drop.innerHTML = html;
        drop.querySelectorAll('.ac-item').forEach(function (item) {
            item.addEventListener('click', function () {
                LAT = parseFloat(item.dataset.lat);
                LON = parseFloat(item.dataset.lon);
                var cityName = item.dataset.name;
                var si2 = document.getElementById('citySearch');
                if (si2) si2.value = cityName;
                closeAutocomplete();
                loadAll();
                
                // LOG SEARCH
                api.logSearch(cityName, LAT, LON);
            });
        });
        drop.style.display = 'block';
        drop.classList.add('open');

    } catch (e) {
        console.error('[Autocomplete] Error:', e);
        closeAutocomplete();
        toast('Search failed. Please try again.', 'error');
    }
}

function scrollAutocomplete(dir) {
    var c = document.querySelector('.ac-items-container');
    if (c) c.scrollTop += dir * 60;
}

function highlightItem(items, idx) {
    items.forEach(function (item, i) {
        item.classList.toggle('highlighted', i === idx);
    });
    if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
}

function closeAutocomplete() {
    var drop = document.getElementById('acDrop');
    if (drop) {
        drop.style.display = 'none';
        drop.classList.remove('open');
        drop.innerHTML = '';
    }
    selectedCityIndex = -1;
}

async function doSearch() {
    var cityEl = document.getElementById('citySearch');
    if (!cityEl) return;
    var city = cityEl.value.trim();
    if (!city) return;
    try {
        var r = await api.searchCity(city);
        if (r) {
            LAT = r.lat;
            LON = r.lon;
            cityEl.value = r.name || city;
            closeAutocomplete();
            loadAll();
            toast('Loading data for ' + sanitize(r.name), 'success');
        } else {
            toast('City not found!', 'error');
        }
    } catch (e) {
        console.error('[Search] Error:', e);
        toast('Search failed. Check connection.', 'error');
    }
}

/* ============================================================
   AI PREDICTOR
   ============================================================ */
async function doPrediction() {
    var btn = document.querySelector('.predict-btn');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Predicting...';
        btn.disabled  = true;
    }

    var gv = function (id, def) {
        var el = document.getElementById(id);
        return el ? parseFloat(el.value) || def : def;
    };

    var data = {
        temperature : gv('f-temp',  28),
        humidity    : gv('f-humid', 65),
        wind_speed  : gv('f-wind',  4),
        pressure    : gv('f-pres',  1013),
        prev_pm25   : gv('f-pm25',  55),
        prev_pm10   : gv('f-pm10',  90),
        prev_no2    : gv('f-no2',   35),
        prev_o3     : gv('f-o3',    45),
        prev_co     : gv('f-co',    800),
        prev_so2    : gv('f-so2',   15),
        hour        : new Date().getHours(),
        month       : new Date().getMonth() + 1,
        day_of_week : new Date().getDay(),
    };

    try {
        var r     = await api.predict(data);
        var aqi   = parseFloat(r.predicted_aqi) || 0;
        var color = r.color || getAQIColor(aqi);

        var pwrEl = document.getElementById('pwrNum');
        if (pwrEl) {
            anim(pwrEl, parseFloat(pwrEl.textContent) || 0, aqi, 1400);
            pwrEl.style.color      = color;
            pwrEl.style.textShadow = '0 0 30px ' + color + '66';
        }

        set('pwrCat', r.category || '--');
        var catEl = document.getElementById('pwrCat');
        if (catEl) {
            catEl.style.color        = color;
            catEl.style.background   = color + '22';
            catEl.style.padding      = '4px 12px';
            catEl.style.borderRadius = '20px';
            catEl.style.border       = '1px solid ' + color + '44';
        }

        set('pwrMsg', r.health_advice || '');
        if (r.dominant)   set('pwrDom',  'Dominant: ' + r.dominant);
        if (r.confidence) set('pwrConf', 'Confidence: ' + r.confidence);

        updatePredFactors(r.factors);
        toast('Predicted AQI: ' + Math.round(aqi)
            + ' (' + sanitize(r.category || '') + ')', 'success');

    } catch (e) {
        console.error('Prediction error:', e);
        toast('Prediction failed', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-brain"></i> Predict AQI';
            btn.disabled  = false;
        }
    }
}

/* ============================================================
   UPDATE PREDICTION FACTORS
   ============================================================ */
function updatePredFactors(factors) {
    if (!factors) return;
    var map = {
        'fac-wind'   : factors.wind,
        'fac-hum'    : factors.humidity,
        'fac-temp'   : factors.temp,
        'fac-season' : factors.season,
        'fac-hour'   : factors.hour,
    };
    Object.keys(map).forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var val   = parseFloat(map[id]) || 1;
        var color = val > 1.1 ? '#f44444'
                  : val < 0.9 ? '#2dd4a0' : '#ff9800';
        el.textContent = (val > 1 ? '+' : '')
            + ((val - 1) * 100).toFixed(0) + '%';
        el.style.color = color;
    });
}

/* ============================================================
   AUTO FILL FORM
   ============================================================ */
function autoFillForm() {
    if (LIVE.poll) {
        sv('f-pm25', (LIVE.poll.pm2_5 || 55).toFixed(1));
        sv('f-pm10', (LIVE.poll.pm10  || 90).toFixed(1));
        sv('f-no2',  (LIVE.poll.no2   || 35).toFixed(1));
        sv('f-o3',   (LIVE.poll.o3    || 45).toFixed(1));
        sv('f-co',   (LIVE.poll.co    || 800).toFixed(0));
        sv('f-so2',  (LIVE.poll.so2   || 15).toFixed(1));
    }
    if (LIVE.weather) {
        sv('f-temp',  (LIVE.weather.temp       || 28).toFixed(1));
        sv('f-humid', (LIVE.weather.humidity   || 65));
        sv('f-wind',  (LIVE.weather.wind_speed || 4).toFixed(1));
        sv('f-pres',  (LIVE.weather.pressure   || 1013));
    }
    toast('Form filled with live data!', 'success');
}

/* ============================================================
   DEMO DATA
   Fixed: removed duplicate updateAllFeatures setTimeout call
   ============================================================ */
function useDemo() {
    updateSourceBar('demo');

    var poll = {
        status : 'success',
        source : 'DEMO',
        pm2_5  : 55.4,
        pm10   : 95.2,
        no2    : 48.6,
        o3     : 33.8,
        co     : 1180.0,
        so2    : 19.2,
        nh3    : 5.2,
    };

    var result     = calcAccurateAQI(poll);
    poll.aqi       = result.aqi;
    poll.aqi_label = getAQILabel(result.aqi);
    poll.aqi_color = getAQIColor(result.aqi);
    poll.dominant  = result.dominant;
    poll.breakdown = result.breakdown;

    var weather = {
        status     : 'success',
        city       : 'New Delhi',
        country    : 'IN',
        temp       : 28.5,
        feels_like : 31.2,
        humidity   : 68,
        pressure   : 1010,
        wind_speed : 3.5,
        wind_deg   : 225,
        visibility : 3000,
        weather    : 'Haze',
        icon       : '50d',
        sunrise    : '06:12 AM',
        sunset     : '06:45 PM',
    };

    updateLeft(poll);
    updatePollCards(poll);
    updateWeather(weather);

    updateAI({
        predicted_aqi     : result.aqi,
        category          : poll.aqi_label,
        color             : poll.aqi_color,
        health_advice     : getAQICat(result.aqi).advice,
        dominant          : result.dominant,
        individual_models : {
            gradient_boosting : Math.round(result.aqi * 0.97),
            random_forest     : Math.round(result.aqi * 1.02),
            adaboost          : Math.round(result.aqi * 0.99),
            ridge             : Math.round(result.aqi * 1.01),
        },
    });

    forecastData = [];
    for (var i = 0; i < 24; i++) {
        var hm = 1.0;
        if (i >= 6  && i <= 9)  hm = 1.30;
        if (i >= 12 && i <= 14) hm = 0.90;
        if (i >= 17 && i <= 20) hm = 1.25;
        if (i >= 22 || i <= 5)  hm = 0.70;

        var dp25 = poll.pm2_5 * hm;
        var dp10 = poll.pm10  * hm;
        var dno2 = poll.no2   * hm;
        var do3  = poll.o3 * (i >= 10 && i <= 16 ? 1.3 : 0.8);
        var dco  = poll.co  * hm;
        var dso2 = poll.so2;

        var fc = calcAccurateAQI({
            pm2_5: dp25, pm10: dp10,
            no2: dno2, o3: do3, co: dco, so2: dso2,
        });

        forecastData.push({
            hour_label : i + ':00',
            aqi        : fc.aqi,
            dominant   : fc.dominant,
            pm2_5      : +dp25.toFixed(1),
            pm10       : +dp10.toFixed(1),
            no2        : +dno2.toFixed(1),
            o3         : +do3.toFixed(1),
            co         : +dco.toFixed(1),
            so2        : +dso2.toFixed(1),
        });
    }

    buildChart(forecastData, 'aqi');
    LIVE = { poll: poll, weather: weather };

    /* updateAllFeatures is already called inside updateLeft above */
    /* REMOVED the duplicate setTimeout call that caused double render */
function normaliseForecast(list) {
    if (!list || !list.length) return [];
    return list.map(function (f) {
        var dt = new Date(f.dt * 1000);
        var h  = dt.getHours();
        var ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        
        var comps = f.components || {};
        return {
            hour_label: h + ampm,
            aqi: f.aqi || 0,
            pm2_5: comps.pm2_5 || 0,
            pm10: comps.pm10 || 0,
            no2: comps.no2 || 0,
            o3: comps.o3 || 0,
            so2: comps.so2 || 0,
            co: comps.co || 0
        };
    });
}

/* ============================================================
   AQI ENGINE - US EPA 2024 CORRECTED
   ============================================================ */
function linearScale(Cp, CLo, CHi, ILo, IHi) {
    if (CHi === CLo) return ILo;
    return Math.round(
        ((IHi - ILo) / (CHi - CLo)) * (Cp - CLo) + ILo
    );
}

function calcAQI_PM25(c) {
    c = Math.round((parseFloat(c) || 0) * 10) / 10;
    if (c <=   0)   return 0;
    if (c <=   9.0) return linearScale(c,   0.0,   9.0,   0,  50);
    if (c <=  35.4) return linearScale(c,   9.1,  35.4,  51, 100);
    if (c <=  55.4) return linearScale(c,  35.5,  55.4, 101, 150);
    if (c <= 125.4) return linearScale(c,  55.5, 125.4, 151, 200);
    if (c <= 225.4) return linearScale(c, 125.5, 225.4, 201, 300);
    if (c <= 325.4) return linearScale(c, 225.5, 325.4, 301, 400);
    if (c <= 500.4) return linearScale(c, 325.5, 500.4, 401, 500);
    return 500;
}

function calcAQI_PM10(c) {
    c = Math.floor(parseFloat(c) || 0);
    if (c <=   0) return 0;
    if (c <=  54) return linearScale(c,   0,  54,   0,  50);
    if (c <= 154) return linearScale(c,  55, 154,  51, 100);
    if (c <= 254) return linearScale(c, 155, 254, 101, 150);
    if (c <= 354) return linearScale(c, 255, 354, 151, 200);
    if (c <= 424) return linearScale(c, 355, 424, 201, 300);
    if (c <= 504) return linearScale(c, 425, 504, 301, 400);
    if (c <= 604) return linearScale(c, 505, 604, 401, 500);
    return 500;
}

function calcAQI_NO2(ugm3) {
    var c = Math.floor((parseFloat(ugm3) || 0) / CONV.NO2_UGM3_TO_PPB);
    if (c <=    0) return 0;
    if (c <=   53) return linearScale(c,    0,   53,   0,  50);
    if (c <=  100) return linearScale(c,   54,  100,  51, 100);
    if (c <=  360) return linearScale(c,  101,  360, 101, 150);
    if (c <=  649) return linearScale(c,  361,  649, 151, 200);
    if (c <= 1249) return linearScale(c,  650, 1249, 201, 300);
    if (c <= 1649) return linearScale(c, 1250, 1649, 301, 400);
    if (c <= 2049) return linearScale(c, 1650, 2049, 401, 500);
    return 500;
}

/* Fixed: Added missing 301-500 AQI range for Ozone */
function calcAQI_O3(ugm3) {
    var c = Math.floor((parseFloat(ugm3) || 0) / CONV.O3_UGM3_TO_PPB);
    if (c <=   0) return 0;
    if (c <=  54) return linearScale(c,   0,  54,   0,  50);
    if (c <=  70) return linearScale(c,  55,  70,  51, 100);
    if (c <=  85) return linearScale(c,  71,  85, 101, 150);
    if (c <= 105) return linearScale(c,  86, 105, 151, 200);
    if (c <= 200) return linearScale(c, 106, 200, 201, 300);
    if (c <= 404) return linearScale(c, 201, 404, 301, 400);
    if (c <= 604) return linearScale(c, 405, 604, 401, 500);
    return 500;
}

function calcAQI_CO(ugm3) {
    var c = Math.round(
        ((parseFloat(ugm3) || 0) / CONV.CO_UGM3_TO_PPM) * 10
    ) / 10;
    if (c <=  0)   return 0;
    if (c <=  4.4) return linearScale(c,  0.0,  4.4,   0,  50);
    if (c <=  9.4) return linearScale(c,  4.5,  9.4,  51, 100);
    if (c <= 12.4) return linearScale(c,  9.5, 12.4, 101, 150);
    if (c <= 15.4) return linearScale(c, 12.5, 15.4, 151, 200);
    if (c <= 30.4) return linearScale(c, 15.5, 30.4, 201, 300);
    if (c <= 40.4) return linearScale(c, 30.5, 40.4, 301, 400);
    if (c <= 50.4) return linearScale(c, 40.5, 50.4, 401, 500);
    return 500;
}

function calcAQI_SO2(ugm3) {
    var c = Math.floor((parseFloat(ugm3) || 0) / CONV.SO2_UGM3_TO_PPB);
    if (c <=    0) return 0;
    if (c <=   35) return linearScale(c,   0,   35,   0,  50);
    if (c <=   75) return linearScale(c,  36,   75,  51, 100);
    if (c <=  185) return linearScale(c,  76,  185, 101, 150);
    if (c <=  304) return linearScale(c, 186,  304, 151, 200);
    if (c <=  604) return linearScale(c, 305,  604, 201, 300);
    if (c <=  804) return linearScale(c, 605,  804, 301, 400);
    if (c <= 1004) return linearScale(c, 805, 1004, 401, 500);
    return 500;
}

function calcAccurateAQI(poll) {
    var pm25 = parseFloat(poll.pm2_5) || 0;
    var pm10 = parseFloat(poll.pm10)  || 0;
    var no2  = parseFloat(poll.no2)   || 0;
    var o3   = parseFloat(poll.o3)    || 0;
    var co   = parseFloat(poll.co)    || 0;
    var so2  = parseFloat(poll.so2)   || 0;

    var sub = {
        pm25 : calcAQI_PM25(pm25),
        pm10 : calcAQI_PM10(pm10),
        no2  : calcAQI_NO2(no2),
        o3   : calcAQI_O3(o3),
        co   : calcAQI_CO(co),
        so2  : calcAQI_SO2(so2),
    };

    var finalAQI = Math.max(
        sub.pm25, sub.pm10, sub.no2,
        sub.o3,   sub.co,   sub.so2
    );

    var nameMap = {
        pm25:'PM2.5', pm10:'PM10',
        no2:'NO₂', o3:'O₃', co:'CO', so2:'SO₂'
    };
    var domKey = Object.keys(sub).reduce(function (a, b) {
        return sub[a] >= sub[b] ? a : b;
    });

    return {
        aqi      : Math.round(finalAQI),
        dominant : nameMap[domKey],
        breakdown: {
            pm25 : sub.pm25,
            pm10 : sub.pm10,
            no2  : sub.no2,
            o3   : sub.o3,
            co   : sub.co,
            so2  : sub.so2,
        },
    };
}

/* ============================================================
   AQI COLOR / LABEL / CATEGORY
   ============================================================ */
function getAQIColor(aqi) {
    aqi = parseFloat(aqi) || 0;
    if (aqi <=  50) return '#00e400';
    if (aqi <= 100) return '#ffff00';
    if (aqi <= 150) return '#ff7e00';
    if (aqi <= 200) return '#ff0000';
    if (aqi <= 300) return '#8f3f97';
    return '#7e0023';
}

function getAQILabel(aqi) {
    aqi = parseFloat(aqi) || 0;
    if (aqi <=  50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very Unhealthy';
    return 'Hazardous';
}

function getAQIEmoji(aqi) {
    aqi = parseFloat(aqi) || 0;
    if (aqi <=  50) return '😊';
    if (aqi <= 100) return '🙂';
    if (aqi <= 150) return '😐';
    if (aqi <= 200) return '😷';
    if (aqi <= 300) return '🤢';
    return '☠️';
}

function getAQICat(aqi) {
    aqi = parseFloat(aqi) || 0;
    if (aqi <=  50) return {
        label:'Good', color:'#00e400', icon:'fas fa-smile',
        advice:'Air quality is satisfactory. Enjoy outdoor activities!',
    };
    if (aqi <= 100) return {
        label:'Moderate', color:'#ffff00', icon:'fas fa-meh',
        advice:'Acceptable air quality. Unusually sensitive people '
             + 'should consider reducing prolonged outdoor exertion.',
    };
    if (aqi <= 150) return {
        label:'Unhealthy for Sensitive Groups',
        color:'#ff7e00', icon:'fas fa-frown',
        advice:'Children, elderly & people with respiratory disease '
             + 'should limit prolonged outdoor exertion.',
    };
    if (aqi <= 200) return {
        label:'Unhealthy', color:'#ff0000', icon:'fas fa-tired',
        advice:'Everyone may begin to experience health effects. '
             + 'Wear a mask outdoors.',
    };
    if (aqi <= 300) return {
        label:'Very Unhealthy', color:'#8f3f97', icon:'fas fa-skull',
        advice:'Health alert! Everyone may experience serious effects. '
             + 'Avoid all outdoor activities.',
    };
    return {
        label:'Hazardous', color:'#7e0023', icon:'fas fa-biohazard',
        advice:'Emergency conditions! Stay indoors, seal windows. '
             + 'Seek medical help if unwell.',
    };
}

/* ============================================================
   HEALTH ADVICE
   ============================================================ */
function getAdvice(aqi) {
    if (aqi <= 50) return [
        { icon:'fas fa-running',   color:'#2dd4a0', text:'Excellent for jogging, cycling & outdoor sports' },
        { icon:'fas fa-door-open', color:'#2dd4a0', text:'Open windows for natural ventilation' },
        { icon:'fas fa-child',     color:'#2dd4a0', text:'Safe for children to play outdoors' },
        { icon:'fas fa-leaf',      color:'#2dd4a0', text:'Ideal air quality - no restrictions needed' },
    ];
    if (aqi <= 100) return [
        { icon:'fas fa-walking',        color:'#ffeb3b', text:'Light outdoor activities are fine' },
        { icon:'fas fa-head-side-mask', color:'#ffeb3b', text:'Sensitive people consider wearing mask' },
        { icon:'fas fa-eye',            color:'#ffeb3b', text:'May cause eye/throat irritation' },
        { icon:'fas fa-clock',          color:'#ffeb3b', text:'Limit very strenuous outdoor exercise' },
    ];
    if (aqi <= 150) return [
        { icon:'fas fa-home',           color:'#ff9800', text:'Children & elderly should stay indoors' },
        { icon:'fas fa-head-side-mask', color:'#ff9800', text:'N95 mask required for outdoor activity' },
        { icon:'fas fa-ban',            color:'#ff9800', text:'Avoid prolonged or heavy outdoor exertion' },
        { icon:'fas fa-wind',           color:'#ff9800', text:'Keep indoor air filtered/ventilated' },
    ];
    if (aqi <= 200) return [
        { icon:'fas fa-home',          color:'#f44444', text:'Everyone should reduce outdoor time' },
        { icon:'fas fa-head-side-mask',color:'#f44444', text:'N95 mask mandatory when outdoors' },
        { icon:'fas fa-heartbeat',     color:'#f44444', text:'Monitor breathing and heart symptoms' },
        { icon:'fas fa-window-close',  color:'#f44444', text:'Keep windows closed, use air purifier' },
    ];
    if (aqi <= 300) return [
        { icon:'fas fa-exclamation-triangle', color:'#8f3f97', text:'Avoid all outdoor activities' },
        { icon:'fas fa-head-side-mask',       color:'#8f3f97', text:'N95/N99 mask essential outdoors' },
        { icon:'fas fa-hospital',             color:'#8f3f97', text:'Seek medical help for breathing issues' },
        { icon:'fas fa-door-closed',          color:'#8f3f97', text:'Stay indoors with sealed windows' },
    ];
    return [
        { icon:'fas fa-skull-crossbones', color:'#7e0023', text:'EMERGENCY: Stay indoors immediately' },
        { icon:'fas fa-first-aid',        color:'#7e0023', text:'Have emergency medications ready' },
        { icon:'fas fa-phone',            color:'#7e0023', text:'Call health services if symptoms develop' },
        { icon:'fas fa-broadcast-tower',  color:'#7e0023', text:'Monitor official emergency broadcasts' },
    ];
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
function toast(msg, type) {
    var t  = document.getElementById('toast');
    var m  = document.getElementById('toastMsg');
    var ic = document.getElementById('toastIcon');
    if (!t) return;
    m.textContent = msg;
    var cfg = {
        success : { icon:'fas fa-check-circle',         color:'#2dd4a0' },
        error   : { icon:'fas fa-times-circle',         color:'#f44444' },
        warning : { icon:'fas fa-exclamation-triangle', color:'#ff9800' },
        info    : { icon:'fas fa-info-circle',          color:'#00b4ff' },
    }[type] || { icon:'fas fa-info-circle', color:'#00b4ff' };

    ic.className       = cfg.icon;
    ic.style.color     = cfg.color;
    t.style.borderLeft = '3px solid ' + cfg.color;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 3500);
}

/* ============================================================
   UTILITIES
   ============================================================ */
function set(id, v) {
    var el = document.getElementById(id);
    if (el) el.textContent = (v != null) ? v : '--';
}

function sv(id, v) {
    var el = document.getElementById(id);
    if (el) el.value = v;
}

/* Fixed: animates from current displayed value, not always 0 */
function anim(el, from, to, dur) {
    if (!el) return;
    to  = parseFloat(to)  || 0;
    dur = dur || 1200;

    /* Read current screen value to prevent jump-to-zero flash */
    var currentVal = parseFloat(
        String(el.textContent).replace(/[^\d.]/g, '')
    ) || 0;
    from = currentVal;

    var start = performance.now();
    (function step(now) {
        var p = Math.min((now - start) / dur, 1);
        var e = 1 - Math.pow(1 - p, 4);
        var v = from + (to - from) * e;
        el.textContent = v < 10 ? v.toFixed(1) : Math.round(v);
        if (p < 1) {
            requestAnimationFrame(step);
        } else {
            el.textContent = to < 10 ? to.toFixed(1) : Math.round(to);
        }
    }(performance.now()));
}

/* ============================================================
   HEATMAP
   ============================================================ */
function drawHeatmap(data) {
    var canvas = document.getElementById('heatmapCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!data || !data.length) {
        data = Array.from({ length: 24 }, function (_, i) {
            return { pm2_5: 30 + Math.random() * 150, hour_label: i + ':00' };
        });
    }

    var cellW = w / data.length;
    data.forEach(function (d, i) {
        var aqi   = d.aqi || calcAQI_PM25(d.pm2_5 || 50);
        var color = getAQIColor(aqi);
        var grad  = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, color + 'dd');
        grad.addColorStop(1, color + '44');
        ctx.globalAlpha = 0.85;
        ctx.fillStyle   = grad;
        ctx.fillRect(i * cellW, 0, cellW - 1, h - 24);
        ctx.globalAlpha  = 1;
        ctx.fillStyle    = 'rgba(255,255,255,0.7)';
        ctx.font         = '9px Inter';
        ctx.textAlign    = 'center';
        ctx.fillText(i + 'h', i * cellW + cellW / 2, h - 8);
        ctx.fillStyle = '#fff';
        ctx.font      = 'bold 11px Inter';
        ctx.fillText(Math.round(aqi), i * cellW + cellW / 2, h / 2);
    });
    ctx.globalAlpha = 1;
}

/* ============================================================
   SPEEDOMETER
   ============================================================ */
function drawSpeedometer(aqi) {
    var canvas = document.getElementById('speedoCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var cx = w / 2, cy = h - 30;
    var r  = Math.min(w, h) * 0.55;
    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 28;
    ctx.stroke();

    [
        [  0,  50, '#00e400'],
        [ 50, 100, '#ffff00'],
        [100, 150, '#ff7e00'],
        [150, 200, '#ff0000'],
        [200, 300, '#8f3f97'],
        [300, 500, '#7e0023'],
    ].forEach(function (s) {
        ctx.beginPath();
        ctx.arc(cx, cy, r,
            Math.PI + (s[0] / 500) * Math.PI,
            Math.PI + (s[1] / 500) * Math.PI);
        ctx.strokeStyle = s[2];
        ctx.lineWidth   = 22;
        ctx.lineCap     = 'butt';
        ctx.stroke();
    });

    [0, 50, 100, 150, 200, 300, 500].forEach(function (v) {
        var angle = Math.PI + (v / 500) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx + (r - 15) * Math.cos(angle),
                   cy + (r - 15) * Math.sin(angle));
        ctx.lineTo(cx + (r +  5) * Math.cos(angle),
                   cy + (r +  5) * Math.sin(angle));
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth   = 2;
        ctx.stroke();
        ctx.fillStyle    = 'rgba(255,255,255,0.6)';
        ctx.font         = '9px Inter';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(v,
            cx + (r + 18) * Math.cos(angle),
            cy + (r + 18) * Math.sin(angle));
    });

    aqi = Math.min(parseFloat(aqi) || 0, 500);
    var angle = Math.PI + (aqi / 500) * Math.PI;
    ctx.shadowColor = getAQIColor(aqi);
    ctx.shadowBlur  = 15;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + (r - 18) * Math.cos(angle),
               cy + (r - 18) * Math.sin(angle));
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.stroke();
    ctx.shadowBlur  = 0;

    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = getAQIColor(aqi); ctx.fill();

    var color = getAQIColor(aqi);
    var numEl = document.getElementById('speedoNum');
    var catEl = document.getElementById('speedoCat');
    if (numEl) { numEl.textContent = Math.round(aqi); numEl.style.color = color; }
    if (catEl) { catEl.textContent = getAQILabel(aqi); catEl.style.color = color; }
}

/* ============================================================
   CITY COMPARISON
   ============================================================ */
async function loadCityComparison() {
    var cities = [
        { name:'delhi',     lat:28.6139, lon:77.2090, waqi:'delhi'     },
        { name:'mumbai',    lat:19.0760, lon:72.8777, waqi:'mumbai'    },
        { name:'kolkata',   lat:22.5726, lon:88.3639, waqi:'kolkata'   },
        { name:'bangalore', lat:12.9716, lon:77.5946, waqi:'bangalore' },
        { name:'chennai',   lat:13.0827, lon:80.2707, waqi:'chennai'   },
        { name:'hyderabad', lat:17.3850, lon:78.4867, waqi:'hyderabad' },
    ];

    var demo = {
        delhi:165, mumbai:110, kolkata:140,
        bangalore:75, chennai:90, hyderabad:100
    };

    var results = await Promise.allSettled(
        cities.map(async function (city) {
            try {
                var comp = await api.fetchCityAQI(
                    city.lat, city.lon, city.waqi
                );
                if (comp) {
                    if (comp.official_aqi && comp.use_official) {
                        return {
                            name   : city.name,
                            aqi    : comp.official_aqi,
                            label  : getAQILabel(comp.official_aqi),
                            source : 'CPCB',
                        };
                    }
                    var res = calcAccurateAQI(comp);
                    return {
                        name   : city.name,
                        aqi    : res.aqi,
                        label  : getAQILabel(res.aqi),
                        source : 'OWM',
                    };
                }
            } catch (e) {
                console.warn('[Comparison] Failed for ' + city.name, e);
            }
            /* Fallback demo - stable values only */
            var a = demo[city.name] || 100;
            return {
                name  : city.name,
                aqi   : a,
                label : getAQILabel(a),
                source: 'Demo',
            };
        })
    );

    var sorted = results
        .filter(function (r) { return r.status === 'fulfilled' && r.value; })
        .map(function (r) { return r.value; })
        .sort(function (a, b) { return b.aqi - a.aqi; });

    var maxAQI = Math.max.apply(null,
        sorted.map(function (c) { return c.aqi; })
    );

    sorted.forEach(function (city) {
        var color  = getAQIColor(city.aqi);
        var relPct = Math.round((city.aqi / maxAQI) * 100);
        var aqiEl  = document.getElementById('cc-aqi-' + city.name);
        var barEl  = document.getElementById('cc-bar-' + city.name);
        var stEl   = document.getElementById('cc-st-'  + city.name);

        if (aqiEl) {
            aqiEl.textContent = city.aqi;
            aqiEl.style.color = color;
            if (city.source === 'CPCB') aqiEl.title = 'CPCB Ground';
        }
        if (barEl) {
            barEl.style.width      = relPct + '%';
            barEl.style.background =
                'linear-gradient(90deg,' + color + ',' + color + '88)';
            barEl.style.boxShadow  = '0 0 8px ' + color + '55';
        }
        if (stEl) {
            stEl.textContent = city.label
                + (city.source === 'CPCB' ? ' 📍' : '');
            stEl.style.color = color;
        }
    });
}

/* ============================================================
   HISTORY TABLE
   Fixed: sanitized all innerHTML values
   ============================================================ */
function buildHistoryTable(data) {
    drawHistoryBarChart(data);

    var tbody = document.getElementById('historyBody');
    if (!tbody) return;

    if (!data || !data.length) {
        data = Array.from({ length: 24 }, function (_, i) {
            var hm = (i>=6&&i<=9)||(i>=17&&i<=20) ? 1.3 : 0.85;
            return {
                hour_label : i + ':00',
                pm2_5 : +(30  + Math.random() * 120 * hm).toFixed(1),
                pm10  : +(50  + Math.random() * 150 * hm).toFixed(1),
                no2   : +(10  + Math.random() * 60  * hm).toFixed(1),
                o3    : +(15  + Math.random() * 80).toFixed(1),
                co    : +(400 + Math.random() * 1000).toFixed(0),
                so2   : +(5   + Math.random() * 30).toFixed(1),
            };
        });
    }

    tbody.innerHTML = data.map(function (d, idx) {
        var res   = calcAccurateAQI(d);
        var aqi   = res.aqi;
        var color = getAQIColor(aqi);
        var label = getAQILabel(aqi);
        var prev  = idx > 0 ? calcAccurateAQI(data[idx - 1]).aqi : aqi;
        var trend = idx === 0
            ? '<i class="fas fa-minus" style="color:#888"></i>'
            : aqi > prev
                ? '<i class="fas fa-arrow-up" style="color:#f44444"></i>'
                : '<i class="fas fa-arrow-down" style="color:#2dd4a0"></i>';

        return '<tr>'
            + '<td style="color:rgba(255,255,255,.6)">'
            +     sanitize(d.hour_label || '--') + '</td>'
            + '<td><strong style="color:' + color + '">'
            +     aqi + '</strong> ' + trend + '</td>'
            + '<td>' + (parseFloat(d.pm2_5) || 0).toFixed(1) + '</td>'
            + '<td>' + (parseFloat(d.pm10)  || 0).toFixed(1) + '</td>'
            + '<td>' + (parseFloat(d.no2)   || 0).toFixed(1) + '</td>'
            + '<td>' + (parseFloat(d.o3)    || 0).toFixed(1) + '</td>'
            + '<td><span class="status-badge" style="background:'
            +     color + '22;color:' + color
            +     ';border:1px solid ' + color + '44">'
            +     sanitize(label) + '</span></td>'
            + '</tr>';
    }).join('');

    tbody.querySelectorAll('tr').forEach(function (row) {
        row.addEventListener('mouseenter', function () {
            row.style.background = 'rgba(255,255,255,0.04)';
        });
        row.addEventListener('mouseleave', function () {
            row.style.background = '';
        });
    });
}

/* ============================================================
   WIND COMPASS
   Fixed: save/restore canvas state to prevent bleed
   ============================================================ */
function drawCompass(deg) {
    var canvas = document.getElementById('compassCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var cx = w / 2, cy = h / 2;
    var r  = Math.min(w, h) / 2 - 20;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    [r, r * 0.7].forEach(function (radius, i) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,' + (i === 0 ? '0.08' : '0.04') + ')';
        ctx.lineWidth   = i === 0 ? 2 : 1;
        ctx.stroke();
    });

    [
        { label:'N', angle:-90, color:'#f44444' },
        { label:'S', angle: 90, color:'rgba(255,255,255,0.7)' },
        { label:'E', angle:  0, color:'rgba(255,255,255,0.7)' },
        { label:'W', angle:180, color:'rgba(255,255,255,0.7)' },
    ].forEach(function (c) {
        var rad = c.angle * Math.PI / 180;
        ctx.fillStyle    = c.color;
        ctx.font         = 'bold 12px Inter';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.label,
            cx + (r + 14) * Math.cos(rad),
            cy + (r + 14) * Math.sin(rad));
    });

    for (var i = 0; i < 36; i++) {
        var ta = (i * 10 - 90) * Math.PI / 180;
        var tl = i % 9 === 0 ? 10 : 5;
        ctx.beginPath();
        ctx.moveTo(cx + (r - tl) * Math.cos(ta),
                   cy + (r - tl) * Math.sin(ta));
        ctx.lineTo(cx +  r       * Math.cos(ta),
                   cy +  r       * Math.sin(ta));
        ctx.strokeStyle = 'rgba(255,255,255,' + (i % 9 === 0 ? '0.3' : '0.1') + ')';
        ctx.lineWidth   = i % 9 === 0 ? 2 : 1;
        ctx.stroke();
    }

    var rad  = (deg - 90) * Math.PI / 180;
    var aLen = r * 0.75, tail = r * 0.3;
    ctx.shadowColor = '#00b4ff';
    ctx.shadowBlur  = 12;
    ctx.beginPath();
    ctx.moveTo(cx - tail * Math.cos(rad), cy - tail * Math.sin(rad));
    ctx.lineTo(cx + aLen * Math.cos(rad), cy + aLen * Math.sin(rad));
    ctx.strokeStyle = '#00b4ff';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.stroke();

    var tx = cx + aLen * Math.cos(rad);
    var ty = cy + aLen * Math.sin(rad);
    ctx.beginPath(); ctx.moveTo(tx, ty);
    ctx.lineTo(tx - 14 * Math.cos(rad - 0.4), ty - 14 * Math.sin(rad - 0.4));
    ctx.lineTo(tx - 14 * Math.cos(rad + 0.4), ty - 14 * Math.sin(rad + 0.4));
    ctx.closePath();
    ctx.fillStyle = '#00b4ff';
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    ctx.restore();

    var dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                'S','SSW','SW','WSW','W','WNW','NW','NNW'];
    set('windDeg', Math.round(deg) + '°');
    set('windDir', dirs[Math.round(deg / 22.5) % 16] || 'N');
}

/* ============================================================
   EXTRA CHARTS
   Fixed: uses chartInstances object instead of window.*
   ============================================================ */
function drawExtraCharts(poll) {
    if (typeof Chart === 'undefined') {
        console.error('❌ Chart.js not loaded!');
        return;
    }
    if (!poll || typeof poll !== 'object') return;

    var pm25 = parseFloat(poll.pm2_5) || 0;
    var pm10 = parseFloat(poll.pm10)  || 0;
    var no2  = parseFloat(poll.no2)   || 0;
    var o3   = parseFloat(poll.o3)    || 0;
    var co   = parseFloat(poll.co)    || 0;
    var so2  = parseFloat(poll.so2)   || 0;

    var base = {
        responsive          : true,
        maintainAspectRatio : false,
        animation           : { duration: 800, easing: 'easeInOutQuart' },
    };

    /* ── RADAR ── */
    var rc = document.getElementById('radarChart');
    if (rc) {
        if (chartInstances.radar) chartInstances.radar.destroy();
        chartInstances.radar = new Chart(rc, {
            type : 'radar',
            data : {
                labels   : ['PM2.5','PM10','NO₂','O₃','CO','SO₂'],
                datasets : [
                    {
                        label           : 'Current Level',
                        data            : [
                            (pm25 / 250  * 100).toFixed(1),
                            (pm10 / 400  * 100).toFixed(1),
                            (no2  / 300  * 100).toFixed(1),
                            (o3   / 300  * 100).toFixed(1),
                            (co   / 8000 * 100).toFixed(1),
                            (so2  / 400  * 100).toFixed(1),
                        ],
                        borderColor         : '#00b4ff',
                        backgroundColor     : 'rgba(0,180,255,0.18)',
                        borderWidth         : 2,
                        pointBackgroundColor: '#00b4ff',
                        pointRadius         : 4,
                    },
                    {
                        label           : 'WHO Safe Limit',
                        data            : [6, 11.25, 8.33, 33.3, 50, 10],
                        borderColor         : '#2dd4a0',
                        backgroundColor     : 'rgba(45,212,160,0.08)',
                        borderWidth         : 1.5,
                        borderDash          : [5, 5],
                        pointBackgroundColor: '#2dd4a0',
                        pointRadius         : 3,
                    },
                ],
            },
            options : Object.assign({}, base, {
                scales  : { r: {
                    min         : 0,
                    max         : 100,
                    grid        : { color: 'rgba(255,255,255,0.06)' },
                    angleLines  : { color: 'rgba(255,255,255,0.06)' },
                    ticks       : { display: false },
                    pointLabels : {
                        color: 'rgba(255,255,255,0.8)',
                        font : { size: 11 },
                    },
                }},
                plugins : { legend: {
                    position: 'bottom',
                    labels  : {
                        color  : 'rgba(255,255,255,0.7)',
                        font   : { size: 10 },
                        padding: 16,
                    },
                }},
            }),
        });
    }

    /* ── COMPARE ── */
    var cc = document.getElementById('compareChart');
    if (cc) {
        if (chartInstances.compare) chartInstances.compare.destroy();
        var cd = forecastData.length ? forecastData
            : Array.from({ length: 24 }, function (_, i) {
                var hm = (i >= 6 && i <= 9) || (i >= 17 && i <= 20) ? 1.3 : 0.85;
                return {
                    hour_label : i + ':00',
                    pm2_5      : +(30 + Math.random() * 120 * hm).toFixed(1),
                    pm10       : +(50 + Math.random() * 150 * hm).toFixed(1),
                    no2        : +(10 + Math.random() * 60  * hm).toFixed(1),
                };
            });

        chartInstances.compare = new Chart(cc, {
            type : 'line',
            data : {
                labels   : cd.map(function (f) { return f.hour_label || ''; }),
                datasets : [
                    {
                        label           : 'PM2.5 (µg/m³)',
                        data            : cd.map(function (f) { return +(f.pm2_5 || 0).toFixed(1); }),
                        borderColor     : '#00b4ff',
                        backgroundColor : 'rgba(0,180,255,0.1)',
                        borderWidth     : 2.5, tension: 0.4, fill: true,
                        pointRadius: 0, pointHoverRadius: 5,
                    },
                    {
                        label           : 'PM10 (µg/m³)',
                        data            : cd.map(function (f) { return +(f.pm10 || 0).toFixed(1); }),
                        borderColor     : '#7c5cfc',
                        backgroundColor : 'rgba(124,92,252,0.1)',
                        borderWidth     : 2.5, tension: 0.4, fill: true,
                        pointRadius: 0, pointHoverRadius: 5,
                    },
                    {
                        label           : 'NO₂ (µg/m³)',
                        data            : cd.map(function (f) { return +(f.no2 || 0).toFixed(1); }),
                        borderColor     : '#2dd4a0',
                        backgroundColor : 'rgba(45,212,160,0.06)',
                        borderWidth     : 2, tension: 0.4, fill: false,
                        pointRadius: 0, pointHoverRadius: 5,
                    },
                ],
            },
            options : {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                animation  : { duration: 1000, easing: 'easeInOutQuart' },
                plugins    : {
                    legend  : {
                        position: 'bottom',
                        labels  : { color:'rgba(255,255,255,0.7)', font:{size:11}, padding:16, usePointStyle:true },
                    },
                    tooltip : {
                        backgroundColor: 'rgba(10,15,30,0.95)',
                        borderColor    : 'rgba(255,255,255,0.1)',
                        borderWidth    : 1, padding: 10,
                    },
                },
                scales : {
                    x : {
                        grid  : { color: 'rgba(255,255,255,0.03)' },
                        ticks : { color:'rgba(255,255,255,0.5)', font:{size:10}, maxTicksLimit:8 },
                    },
                    y : {
                        grid        : { color: 'rgba(255,255,255,0.04)' },
                        beginAtZero : true,
                        ticks       : { color:'rgba(255,255,255,0.5)', font:{size:10} },
                        title       : { display:true, text:'µg/m³', color:'rgba(255,255,255,0.4)', font:{size:10} },
                    },
                },
            },
        });
    }

    /* ── POLAR AREA ── */
    var pc = document.getElementById('polarChart');
    if (pc) {
        if (chartInstances.polar) chartInstances.polar.destroy();
        chartInstances.polar = new Chart(pc, {
            type : 'polarArea',
            data : {
                labels   : ['PM2.5','PM10','NO₂','O₃','CO÷80','SO₂'],
                datasets : [{
                    data: [
                        +pm25.toFixed(1), +pm10.toFixed(1),
                        +no2.toFixed(1),  +o3.toFixed(1),
                        +(co / 80).toFixed(1), +so2.toFixed(1),
                    ],
                    backgroundColor : [
                        'rgba(0,180,255,0.65)',   'rgba(124,92,252,0.65)',
                        'rgba(45,212,160,0.65)',   'rgba(255,152,0,0.65)',
                        'rgba(255,68,68,0.65)',    'rgba(224,64,251,0.65)',
                    ],
                    borderColor : [
                        '#00b4ff','#7c5cfc','#2dd4a0',
                        '#ff9800','#f44444','#e040fb',
                    ],
                    borderWidth : 1.5,
                }],
            },
            options : Object.assign({}, base, {
                plugins : { legend: {
                    position: 'bottom',
                    labels  : { color:'rgba(255,255,255,0.7)', font:{size:10}, padding:12 },
                }},
                scales : { r: {
                    grid  : { color: 'rgba(255,255,255,0.05)' },
                    ticks : { display: false },
                }},
            }),
        });
    }

    /* ── AQI BREAKDOWN BAR ── */
    var bc = document.getElementById('breakdownChart');
    if (bc) {
        if (chartInstances.breakdown) chartInstances.breakdown.destroy();

        var bd = poll.breakdown || calcAccurateAQI(poll).breakdown;
        var bv  = [bd.pm25, bd.pm10, bd.no2, bd.o3, bd.co, bd.so2];
        var bcl = bv.map(function (v) { return getAQIColor(v); });

        chartInstances.breakdown = new Chart(bc, {
            type : 'bar',
            data : {
                labels   : ['PM2.5','PM10','NO₂','O₃','CO','SO₂'],
                datasets : [{
                    label           : 'Sub-Index AQI',
                    data            : bv,
                    backgroundColor : bcl.map(function (c) { return c + 'bb'; }),
                    borderColor     : bcl,
                    borderWidth     : 2,
                    borderRadius    : 6,
                    borderSkipped   : false,
                }],
            },
            options : Object.assign({}, base, {
                plugins : {
                    legend  : { display: false },
                    tooltip : { callbacks: {
                        label: function (ctx) {
                            return 'AQI Sub-Index: ' + ctx.raw
                                + ' (' + getAQILabel(ctx.raw) + ')';
                        },
                    }},
                },
                scales : {
                    x : {
                        grid  : { display: false },
                        ticks : { color: 'rgba(255,255,255,0.7)' },
                    },
                    y : {
                        grid        : { color: 'rgba(255,255,255,0.04)' },
                        ticks       : { color: 'rgba(255,255,255,0.5)' },
                        max         : 500,
                        beginAtZero : true,
                    },
                },
            }),
        });
    }
}

/* ============================================================
   THEME TOGGLE
   ============================================================ */
function toggleTheme() {
    document.body.classList.toggle('light');
    var isLight = document.body.classList.contains('light');
    var icon    = document.getElementById('themeIcon');
    if (icon) icon.className = isLight ? 'fas fa-moon' : 'fas fa-sun';
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    toast(isLight ? '☀️ Light theme' : '🌙 Dark theme', 'info');
}

(function () {
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light');
        var icon = document.getElementById('themeIcon');
        if (icon) icon.className = 'fas fa-moon';
    }
}());

/* ============================================================
   HISTORY VIEW TOGGLE
   ============================================================ */
function switchHistoryView(view, btn) {
    document.querySelectorAll('#btnChart,#btnTable')
        .forEach(function (b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    var cv = document.getElementById('historyChartView');
    var tv = document.getElementById('historyTableView');
    if (view === 'chart') {
        if (cv) cv.style.display = 'block';
        if (tv) tv.style.display = 'none';
        drawHistoryBarChart(forecastData.length ? forecastData : null);
    } else {
        if (cv) cv.style.display = 'none';
        if (tv) tv.style.display = 'block';
    }
}

/* ============================================================
   HISTORY BAR CHART
   ============================================================ */
function drawHistoryBarChart(data) {
    if (!data || !data.length) {
        data = Array.from({ length: 24 }, function (_, i) {
            var hm = i >= 6  && i <= 9  ? 1.35
                   : i >= 17 && i <= 20 ? 1.30
                   : i >= 22 || i <= 5  ? 0.65 : 1.0;
            var p25 = 55 * hm, p10 = 90 * hm,
                n2  = 35 * hm, o3  = 45,
                co  = 800 * hm, s2 = 15;
            var res = calcAccurateAQI({
                pm2_5:p25, pm10:p10, no2:n2, o3:o3, co:co, so2:s2,
            });
            return {
                hour_label : i + ':00', aqi: res.aqi,
                dominant   : res.dominant,
                pm2_5      : +p25.toFixed(1),
                pm10       : +p10.toFixed(1),
                no2        : +n2.toFixed(1),
                o3         : +o3.toFixed(1),
            };
        });
    }

    var av   = data.map(function (d) { return d.aqi || 0; });
    var peak = Math.max.apply(null, av);
    var low  = Math.min.apply(null, av);
    var avg  = Math.round(av.reduce(function (a, b) { return a + b; }, 0) / av.length);
    var pi   = av.indexOf(peak);
    var li   = av.indexOf(low);

    var dc = {};
    data.forEach(function (d) {
        var p = d.dominant || 'PM2.5';
        dc[p] = (dc[p] || 0) + 1;
    });
    var dom = Object.keys(dc).reduce(function (a, b) {
        return dc[a] > dc[b] ? a : b;
    });

    var upd = function (id, val, color, sub, subId) {
        var el = document.getElementById(id);
        if (el) { el.textContent = val; el.style.color = color; }
        if (subId) {
            var sel = document.getElementById(subId);
            if (sel) sel.textContent = sub;
        }
    };
    upd('hcPeak', peak, getAQIColor(peak), data[pi] ? data[pi].hour_label : '--', 'hcPeakTime');
    upd('hcLow',  low,  getAQIColor(low),  data[li] ? data[li].hour_label : '--', 'hcLowTime');
    upd('hcAvg',  avg,  getAQIColor(avg));
    var domEl = document.getElementById('hcDom');
    if (domEl) { domEl.textContent = dom; domEl.style.color = '#00b4ff'; }

    var canvas = document.getElementById('historyBarChart');
    if (!canvas) return;
    if (typeof Chart === 'undefined') { console.error('Chart.js not loaded'); return; }
    if (chartInstances.historyBar) {
        chartInstances.historyBar.destroy();
        chartInstances.historyBar = null;
    }

    var labels    = data.map(function (d) { return d.hour_label || ''; });
    var values    = data.map(function (d) { return d.aqi || 0; });
    var barColors = values.map(function (v) { return getAQIColor(v) + 'cc'; });
    var brdColors = values.map(function (v) { return getAQIColor(v); });

    chartInstances.historyBar = new Chart(canvas, {
        type : 'bar',
        data : {
            labels   : labels,
            datasets : [
                {
                    label           : 'AQI',
                    data            : values,
                    backgroundColor : barColors,
                    borderColor     : brdColors,
                    borderWidth     : 2,
                    borderRadius    : 6,
                    borderSkipped   : false,
                },
                {
                    label       : 'Trend',
                    data        : values,
                    type        : 'line',
                    borderColor : 'rgba(255,255,255,0.3)',
                    borderWidth : 2,
                    borderDash  : [4, 4],
                    pointRadius : 0,
                    tension     : 0.4,
                    fill        : false,
                },
            ],
        },
        options : {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            animation  : { duration: 1000, easing: 'easeInOutQuart' },
            plugins    : {
                legend  : { display: false },
                tooltip : {
                    backgroundColor: 'rgba(10,15,30,0.95)',
                    borderColor    : 'rgba(255,255,255,0.1)',
                    borderWidth    : 1, padding: 12,
                    callbacks      : {
                        title: function (items) {
                            return '🕐 ' + items[0].label;
                        },
                        label: function (ctx) {
                            if (ctx.datasetIndex === 1) return null;
                            var v = ctx.raw;
                            return [
                                ' AQI: ' + v,
                                ' Status: ' + getAQILabel(v),
                                ' PM2.5: ' + (data[ctx.dataIndex].pm2_5 || '--') + ' µg/m³',
                                ' PM10: '  + (data[ctx.dataIndex].pm10  || '--') + ' µg/m³',
                            ];
                        },
                        labelColor: function (ctx) {
                            if (ctx.datasetIndex === 1) return null;
                            var c = getAQIColor(ctx.raw);
                            return { borderColor: c, backgroundColor: c, borderRadius: 4 };
                        },
                    },
                },
            },
            scales : {
                x : {
                    grid  : { color: 'rgba(255,255,255,0.03)' },
                    ticks : { color:'rgba(255,255,255,0.5)', font:{size:10}, maxTicksLimit:12 },
                },
                y : {
                    grid        : { color: 'rgba(255,255,255,0.04)' },
                    beginAtZero : true,
                    ticks       : {
                        color   : 'rgba(255,255,255,0.5)',
                        font    : { size: 10 },
                        callback: function (v) { return v + ' AQI'; },
                    },
                },
            },
        },
        plugins : [{
            id        : 'aqiZones',
            afterDraw : function (chart) {
                var c2 = chart.ctx;
                var ya = chart.scales.y;
                var xa = chart.scales.x;
                [
                    { val: 50,  color:'#00e400', label:'Good'     },
                    { val: 100, color:'#ffff00', label:'Moderate' },
                    { val: 150, color:'#ff7e00', label:'USG'      },
                    { val: 200, color:'#ff0000', label:'Unhealthy'},
                ].forEach(function (z) {
                    if (z.val > ya.max) return;
                    var y = ya.getPixelForValue(z.val);
                    c2.save();
                    c2.beginPath(); c2.setLineDash([6, 4]);
                    c2.moveTo(xa.left, y); c2.lineTo(xa.right, y);
                    c2.strokeStyle = z.color + '60';
                    c2.lineWidth   = 1; c2.stroke();
                    c2.setLineDash([]);
                    c2.fillStyle   = z.color + 'aa';
                    c2.font        = 'bold 9px Inter';
                    c2.textAlign   = 'right';
                    c2.fillText(z.label + '(' + z.val + ')', xa.right - 4, y - 3);
                    c2.restore();
                });
            },
        }],
    });
}

/* ============================================================
   ALERTS
   ============================================================ */
function updateAlerts(aqi, poll) {
    var alerts = [];
    var pm25 = parseFloat(poll.pm2_5) || 0;
    var pm10 = parseFloat(poll.pm10)  || 0;
    var no2  = parseFloat(poll.no2)   || 0;
    var o3   = parseFloat(poll.o3)    || 0;
    var co   = parseFloat(poll.co)    || 0;

    var add = function (type, icon, text, priority) {
        alerts.push({ type: type, icon: icon, text: text, priority: priority });
    };

    if      (aqi > 300) add('danger',  'fas fa-skull-crossbones',
        '🚨 EMERGENCY: AQI ' + aqi + '. Hazardous! Evacuate sensitive individuals.', 0);
    else if (aqi > 200) add('danger',  'fas fa-exclamation-triangle',
        '⚠️ DANGER: Very Unhealthy (AQI: ' + aqi + '). Avoid all outdoor exposure.', 1);
    else if (aqi > 150) add('warning', 'fas fa-exclamation-circle',
        '⚠️ WARNING: Unhealthy (AQI: ' + aqi + '). Sensitive groups must stay indoors.', 2);
    else if (aqi > 100) add('warning', 'fas fa-info-circle',
        'CAUTION: Moderate (AQI: ' + aqi + '). Limit prolonged outdoor exposure.', 3);
    else add('success', 'fas fa-check-circle',
        '✅ Air quality is GOOD (AQI: ' + aqi + '). Safe for all activities!', 10);

    if      (pm25 > 150) add('danger',  'fas fa-smog',
        'PM2.5 critically high: ' + pm25.toFixed(1) + ' µg/m³ (' + (pm25/15).toFixed(1) + '× WHO). N95!', 1);
    else if (pm25 >  35) add('warning', 'fas fa-smog',
        'PM2.5 elevated: ' + pm25.toFixed(1) + ' µg/m³ (' + (pm25/15).toFixed(1) + '× WHO)', 4);

    if      (pm10 > 250) add('danger',  'fas fa-cloud',
        'PM10 critically high: ' + pm10.toFixed(1) + ' µg/m³ (' + (pm10/45).toFixed(1) + '× WHO)', 2);
    else if (pm10 > 100) add('warning', 'fas fa-cloud',
        'PM10 elevated: ' + pm10.toFixed(1) + ' µg/m³', 5);

    if (no2  > 200) add('danger',  'fas fa-industry',
        'NO₂ high: ' + no2.toFixed(1) + ' µg/m³ - Avoid traffic areas!', 3);
    if (o3   > 180) add('warning', 'fas fa-sun',
        'Ozone high: ' + o3.toFixed(1) + ' µg/m³ - Limit outdoor afternoon activity', 4);
    if (co > 10000) add('danger',  'fas fa-skull',
        'CO dangerously high: ' + co.toFixed(0) + ' µg/m³!', 1);

    alerts.sort(function (a, b) { return a.priority - b.priority; });

    var wrap = document.getElementById('alertsWrap');
    if (wrap) {
        wrap.innerHTML = alerts.map(function (a) {
            return '<div class="alert-item ' + sanitize(a.type) + '">'
                + '<i class="' + sanitize(a.icon) + '"></i>'
                + '<span>' + sanitize(a.text) + '</span></div>';
        }).join('');
    }

    var dc = alerts.filter(function (a) { return a.type === 'danger'; }).length;
    var badge = document.getElementById('alertBadge');
    if (badge) {
        badge.textContent   = dc || '';
        badge.style.display = dc ? 'flex' : 'none';
    }
}

/* ============================================================
   DOWNLOAD FUNCTIONS
   Fixed: downloadReport instead of downloadPDF (correct ext)
   ============================================================ */
function downloadCSV() {
    var src = typeof api !== 'undefined' && api.getSource
        ? api.getSource() : 'API';
    var headers =
        'Time,AQI,Category,PM2.5,PM10,NO2,O3,CO,SO2,Dominant,Source\n';
    var rows = (forecastData || []).map(function (d) {
        var r = calcAccurateAQI(d);
        return [
            d.hour_label || '--', r.aqi, getAQILabel(r.aqi),
            (parseFloat(d.pm2_5) || 0).toFixed(1),
            (parseFloat(d.pm10)  || 0).toFixed(1),
            (parseFloat(d.no2)   || 0).toFixed(1),
            (parseFloat(d.o3)    || 0).toFixed(1),
            (parseFloat(d.co)    || 0).toFixed(1),
            (parseFloat(d.so2)   || 0).toFixed(1),
            r.dominant, src,
        ].join(',');
    }).join('\n');

    var a = document.createElement('a');
    var date = new Date().toISOString().slice(0, 10);
    a.href     = URL.createObjectURL(
        new Blob([headers + rows], { type: 'text/csv' })
    );
    a.download = 'AirWatch_' + date + '.csv';
    a.click();
    toast('CSV exported!', 'success');
}

/* Renamed from downloadPDF to downloadReport - correct file type */
function downloadReport() {
    var src = typeof api !== 'undefined' && api.getSource
        ? api.getSource() : 'API';
    var lines = [
        '╔══════════════════════════════════════════╗',
        '║       AIRWATCH PRO - AQI REPORT          ║',
        '╚══════════════════════════════════════════╝',
        '',
        'Generated   : ' + new Date().toLocaleString(),
        'Location    : ' + (LIVE.weather
            ? LIVE.weather.city + ', ' + LIVE.weather.country : 'Unknown'),
        'Coordinates : ' + LAT.toFixed(4) + '°N, ' + LON.toFixed(4) + '°E',
        'Data Source : ' + src,
        'AQI Standard: US EPA 2024',
        '',
    ];

    if (LIVE.poll) {
        var r          = calcAccurateAQI(LIVE.poll);
        var officialAQI = LIVE.poll.aqi || r.aqi;
        lines.push('══════════════════════════════════════════');
        lines.push('  CURRENT AIR QUALITY');
        lines.push('══════════════════════════════════════════');
        lines.push('  AQI Value          : ' + officialAQI
            + (LIVE.poll.source === 'WAQI_CPCB' ? ' (CPCB Official)' : ' (Calculated)'));
        lines.push('  Category           : ' + getAQILabel(officialAQI));
        lines.push('  Dominant Pollutant : ' + r.dominant);
        lines.push('');
        lines.push('  Sub-Index Breakdown:');
        lines.push('  ├─ PM2.5 : ' + r.breakdown.pm25);
        lines.push('  ├─ PM10  : ' + r.breakdown.pm10);
        lines.push('  ├─ NO₂   : ' + r.breakdown.no2);
        lines.push('  ├─ O₃    : ' + r.breakdown.o3);
        lines.push('  ├─ CO    : ' + r.breakdown.co);
        lines.push('  └─ SO₂   : ' + r.breakdown.so2);
        lines.push('');
        lines.push('  Raw Concentrations (µg/m³):');
        lines.push('  ├─ PM2.5 : ' + (LIVE.poll.pm2_5 || 0));
        lines.push('  ├─ PM10  : ' + (LIVE.poll.pm10  || 0));
        lines.push('  ├─ NO₂   : ' + (LIVE.poll.no2   || 0));
        lines.push('  ├─ O₃    : ' + (LIVE.poll.o3    || 0));
        lines.push('  ├─ CO    : ' + (LIVE.poll.co    || 0));
        lines.push('  └─ SO₂   : ' + (LIVE.poll.so2   || 0));
        lines.push('');
        lines.push('  WHO Exceedance:');
        lines.push('  ├─ PM2.5 : ' + (LIVE.poll.pm2_5 / 15).toFixed(1) + '× (15 µg/m³)');
        lines.push('  ├─ PM10  : ' + (LIVE.poll.pm10  / 45).toFixed(1) + '× (45 µg/m³)');
        lines.push('  └─ NO₂   : ' + (LIVE.poll.no2   / 25).toFixed(1) + '× (25 µg/m³)');
    }

    if (LIVE.weather) {
        lines.push('');
        lines.push('══════════════════════════════════════════');
        lines.push('  WEATHER');
        lines.push('══════════════════════════════════════════');
        lines.push('  Temperature : ' + LIVE.weather.temp       + '°C');
        lines.push('  Feels Like  : ' + LIVE.weather.feels_like + '°C');
        lines.push('  Humidity    : ' + LIVE.weather.humidity   + '%');
        lines.push('  Wind Speed  : ' + LIVE.weather.wind_speed + ' m/s');
        lines.push('  Pressure    : ' + LIVE.weather.pressure   + ' hPa');
        lines.push('  Visibility  : ' + ((LIVE.weather.visibility || 0) / 1000).toFixed(1) + ' km');
        lines.push('  Conditions  : ' + LIVE.weather.weather);
    }

    lines.push('');
    lines.push('══════════════════════════════════════════');
    lines.push('  AirWatch Pro | ' + src + ' | EPA 2024');
    lines.push('══════════════════════════════════════════');

    var a = document.createElement('a');
    a.href = URL.createObjectURL(
        new Blob([lines.join('\n')], { type: 'text/plain' })
    );
    a.download = 'AirWatch_Report_' + new Date().toISOString().slice(0, 10) + '.txt';
    a.click();
    toast('Report downloaded!', 'success');
}

/* Keep downloadPDF as alias for backward compatibility */
function downloadPDF() {
    downloadReport();
}

function downloadImage() {
    var canvas = document.getElementById('speedoCanvas');
    if (!canvas) { toast('No gauge to save', 'error'); return; }
    var a      = document.createElement('a');
    a.href     = canvas.toDataURL('image/png');
    a.download = 'AQI_Gauge_' + new Date().toISOString().slice(0, 10) + '.png';
    a.click();
    toast('Gauge image saved!', 'success');
}

/* ============================================================
   ORCHESTRATOR
   Fixed: uses poll.aqi directly to stop 172 appearing
   ============================================================ */
function updateAllFeatures(poll, aqi) {
    if (!poll || typeof poll !== 'object') {
        console.warn('updateAllFeatures: invalid poll object');
        return;
    }

    var displayAQI = (poll.aqi && poll.aqi > 0)
        ? parseFloat(poll.aqi)
        : parseFloat(aqi) || 0;

    console.log(
        '%c[ORCHESTRATOR] AQI: ' + displayAQI
        + ' | Source: ' + (poll.source || 'unknown'),
        'color:#e040fb;font-weight:bold'
    );

    drawSpeedometer(displayAQI);
    drawHeatmap(forecastData.length ? forecastData : null);
    buildHistoryTable(forecastData.length ? forecastData : null);

    try {
        drawExtraCharts(poll);
    } catch (e) {
        console.error('drawExtraCharts failed:', e.message);
    }

    drawCompass(
        LIVE.weather && LIVE.weather.wind_deg != null
            ? LIVE.weather.wind_deg : 0
    );

    updateAlerts(displayAQI, poll);
    loadCityComparison();

    if (poll.breakdown) {
        updateBreakdownBadges(poll.breakdown);
    } else {
        updateBreakdownBadges(calcAccurateAQI(poll).breakdown);
    }
}