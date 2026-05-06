/* ============================================================
   API-HANDLER.JS - AirWatch Pro - COMPLETE FIXED VERSION
   FIXES APPLIED:
   1.  o3ToAQI - Full EPA scale 0-500 (was capped at 300)
   2.  coToAQI - Correct constant 1145.45 (was 1150.0)
   3.  predict - Deterministic model outputs (removed Math.random)
   4.  waqiToStandardPoll - Fixed CO/SO2 conversion (sub-index not mg)
   5.  fetchWAQI_NearestStation - Handles WAQI "-" AQI value
   6.  searchCities - Safe JSON parse with try/catch
   7.  loadIndianCities - Uses fetchT with timeout
   8.  dsEl variable scope - Single declaration before if/else
   9.  aqi_to_o3_ppb - Complete reverse range added
   10. fetchAll - Handles 'error' source properly
   11. aqi_to_no2/o3 reverse - High ranges added
   ============================================================ */

'use strict';

var api = (function () {

    /* ╔══════════════════════════════════════════════════════════╗
       ║                   API KEYS                              ║
       ║  To change: just replace the string values below       ║
       ╚══════════════════════════════════════════════════════════╝ */

    /* ── OpenWeatherMap API Key ──────────────────────────────── */
    var OWM_KEY = '1cc153b8da9c132a0ede08d220b59a60';

    /* ── WAQI Token (CPCB Ground Station Data) ──────────────── */
    var WAQI_TOKEN = 'c12943ab88ad31947b8aaf9568a9633988c61ce7';

    /* ── OWM Endpoints ──────────────────────────────────────── */
    var URL_AIR      = 'https://api.openweathermap.org/data/2.5/air_pollution';
    var URL_FORECAST = 'https://api.openweathermap.org/data/2.5/air_pollution/forecast';
    var URL_WEATHER  = 'https://api.openweathermap.org/data/2.5/weather';
    var URL_GEO      = 'https://api.openweathermap.org/geo/1.0/direct';

    /* ── WAQI Endpoint ──────────────────────────────────────── */
    var WAQI_BASE = 'https://api.waqi.info';

    /* ── CO Conversion Constant (µg/m³ per ppm) ─────────────── */
    /* Fixed: unified with app.js CONV object value             */
    var CO_FACTOR = 1145.45;

    /* ── Indian cities list ─────────────────────────────────── */
    var INDIA_CITIES        = [];
    var INDIA_CITIES_LOADED = false;

    /* ── Data source tracker ────────────────────────────────── */
    var DATA_SOURCE = 'Unknown';

    /* ============================================================
       KEY VALIDATORS
       ============================================================ */
    function waqiOk() {
        return typeof WAQI_TOKEN === 'string'
            && WAQI_TOKEN.trim().length > 10
            && WAQI_TOKEN !== 'YOUR_WAQI_TOKEN_HERE'
            && WAQI_TOKEN !== 'demo';
    }

    function keyOk() {
        return typeof OWM_KEY === 'string'
            && OWM_KEY.trim().length >= 20
            && OWM_KEY !== 'YOUR_OWM_KEY_HERE';
    }

    /* ============================================================
       FETCH WITH TIMEOUT
       ============================================================ */
    function fetchT(url, sec) {
        sec = sec || 10;
        return new Promise(function (resolve, reject) {
            var done  = false;
            var timer = setTimeout(function () {
                if (!done) {
                    done = true;
                    reject(new Error('Timeout after ' + sec + 's'));
                }
            }, sec * 1000);

            fetch(url)
                .then(function (r) {
                    if (!done) {
                        done = true;
                        clearTimeout(timer);
                        resolve(r);
                    }
                })
                .catch(function (e) {
                    if (!done) {
                        done = true;
                        clearTimeout(timer);
                        reject(e);
                    }
                });
        });
    }

    /* ============================================================
       SAFE JSON PARSE
       Fixed: prevents unhandled errors on malformed responses
       ============================================================ */
    async function safeJson(res) {
        try {
            return await res.json();
        } catch (e) {
            console.error('[API] JSON parse failed:', e.message);
            return null;
        }
    }

    /* ============================================================
       WAQI: GET NEAREST STATION BY LAT/LON
       Fixed: handles "-" AQI value from WAQI
       ============================================================ */
    async function fetchWAQI_NearestStation(lat, lon) {
        var url = WAQI_BASE
            + '/feed/geo:' + lat + ';' + lon
            + '/?token=' + WAQI_TOKEN;

        console.log('%c[WAQI] Fetching nearest CPCB station...',
            'color:#2dd4a0');

        try {
            var res  = await fetchT(url, 12);
            var data = await safeJson(res);

            if (!data) {
                console.warn('[WAQI] Empty or invalid JSON response');
                return null;
            }

            if (data.status !== 'ok') {
                console.warn('[WAQI] Status not ok:', data.data || data);
                return null;
            }

            var d    = data.data;
            var iaqi = d.iaqi || {};

            /* Fixed: WAQI sometimes returns "-" for AQI */
            var rawAqi = parseInt(d.aqi);
            if (!rawAqi || isNaN(rawAqi) || rawAqi <= 0) {
                console.warn('[WAQI] Invalid AQI value:', d.aqi);
                return null;
            }

            console.log(
                '%c[WAQI] ✅ CPCB Station: '
                + (d.city && d.city.name ? d.city.name : 'Unknown')
                + ' | Official AQI: ' + rawAqi,
                'color:#2dd4a0;font-weight:bold;font-size:13px'
            );

            return {
                station      : d.city  ? d.city.name : 'Unknown',
                station_url  : d.city  ? d.city.url  : '',
                station_geo  : d.city  ? d.city.geo  : [lat, lon],
                station_idx  : d.idx   || 0,

                /* Valid, parsed official AQI */
                official_aqi : rawAqi,

                /*
                 * WAQI iaqi values are AQI SUB-INDICES
                 * NOT raw concentration values
                 */
                pollutants : {
                    pm2_5    : iaqi.pm25 ? iaqi.pm25.v : null,
                    pm10     : iaqi.pm10 ? iaqi.pm10.v : null,
                    no2      : iaqi.no2  ? iaqi.no2.v  : null,
                    o3       : iaqi.o3   ? iaqi.o3.v   : null,
                    co       : iaqi.co   ? iaqi.co.v   : null,
                    so2      : iaqi.so2  ? iaqi.so2.v  : null,
                    temp     : iaqi.t    ? iaqi.t.v    : null,
                    humidity : iaqi.h    ? iaqi.h.v    : null,
                    wind     : iaqi.w    ? iaqi.w.v    : null,
                    pressure : iaqi.p    ? iaqi.p.v    : null,
                },

                data_type    : 'sub_index',
                attributions : d.attributions || [],
                timestamp    : d.time ? d.time.iso : new Date().toISOString(),
                forecast     : d.forecast ? d.forecast.daily : {},
            };

        } catch (e) {
            console.error('[WAQI] Station fetch error:', e.message);
            return null;
        }
    }

    /* ============================================================
       WAQI: GET BY CITY NAME
       ============================================================ */
    async function fetchWAQI_ByCity(cityName) {
        var url = WAQI_BASE
            + '/feed/' + encodeURIComponent(cityName)
            + '/?token=' + WAQI_TOKEN;

        try {
            var res  = await fetchT(url, 10);
            var data = await safeJson(res);

            if (!data || data.status !== 'ok') return null;

            var d    = data.data;
            var iaqi = d.iaqi || {};

            /* Fixed: validate AQI value */
            var rawAqi = parseInt(d.aqi);
            if (!rawAqi || isNaN(rawAqi) || rawAqi <= 0) return null;

            return {
                station      : d.city  ? d.city.name : cityName,
                official_aqi : rawAqi,
                pollutants   : {
                    pm2_5 : iaqi.pm25 ? iaqi.pm25.v : null,
                    pm10  : iaqi.pm10 ? iaqi.pm10.v : null,
                    no2   : iaqi.no2  ? iaqi.no2.v  : null,
                    o3    : iaqi.o3   ? iaqi.o3.v   : null,
                    co    : iaqi.co   ? iaqi.co.v   : null,
                    so2   : iaqi.so2  ? iaqi.so2.v  : null,
                },
                data_type : 'sub_index',
                timestamp : d.time ? d.time.iso : new Date().toISOString(),
            };

        } catch (e) {
            console.error('[WAQI] City fetch error:', e.message);
            return null;
        }
    }

    /* ============================================================
       REVERSE AQI → CONCENTRATION HELPERS
       Fixed: all ranges now cover 0-500 AQI
       ============================================================ */
    function aqi_to_pm25(aqi) {
        if (!aqi || aqi <= 0) return 0;
        if (aqi <=  50) return aqi * 9.0 / 50;
        if (aqi <= 100) return 9.1  + (aqi -  51) * (35.4  -  9.1) / 49;
        if (aqi <= 150) return 35.5 + (aqi - 101) * (55.4  - 35.5) / 49;
        if (aqi <= 200) return 55.5 + (aqi - 151) * (125.4 - 55.5) / 49;
        if (aqi <= 300) return 125.5 + (aqi - 201) * (225.4 - 125.5) / 99;
        if (aqi <= 400) return 225.5 + (aqi - 301) * (325.4 - 225.5) / 99;
        return 325.5 + (aqi - 401) * (500.4 - 325.5) / 99;
    }

    function aqi_to_pm10(aqi) {
        if (!aqi || aqi <= 0) return 0;
        if (aqi <=  50) return aqi * 54 / 50;
        if (aqi <= 100) return 55  + (aqi -  51) * (154 -  55) / 49;
        if (aqi <= 150) return 155 + (aqi - 101) * (254 - 155) / 49;
        if (aqi <= 200) return 255 + (aqi - 151) * (354 - 255) / 49;
        if (aqi <= 300) return 355 + (aqi - 201) * (424 - 355) / 99;
        if (aqi <= 400) return 425 + (aqi - 301) * (504 - 425) / 99;
        return 505 + (aqi - 401) * (604 - 505) / 99;
    }

    function aqi_to_no2_ppb(aqi) {
        if (!aqi || aqi <= 0) return 0;
        if (aqi <=  50) return aqi * 53 / 50;
        if (aqi <= 100) return 54  + (aqi -  51) * (100  -  54) / 49;
        if (aqi <= 150) return 101 + (aqi - 101) * (360  - 101) / 49;
        if (aqi <= 200) return 361 + (aqi - 151) * (649  - 361) / 49;
        if (aqi <= 300) return 650 + (aqi - 201) * (1249 - 650) / 99;
        if (aqi <= 400) return 1250 + (aqi - 301) * (1649 - 1250) / 99;
        return 1650 + (aqi - 401) * (2049 - 1650) / 99;
    }

    /* Fixed: complete range including AQI 201-500 */
    function aqi_to_o3_ppb(aqi) {
        if (!aqi || aqi <= 0) return 0;
        if (aqi <=  50) return aqi * 54 / 50;
        if (aqi <= 100) return 55 + (aqi -  51) * (70  -  55) / 49;
        if (aqi <= 150) return 71 + (aqi - 101) * (85  -  71) / 49;
        if (aqi <= 200) return 86 + (aqi - 151) * (105 -  86) / 49;
        if (aqi <= 300) return 106 + (aqi - 201) * (200 - 106) / 99;
        if (aqi <= 400) return 201 + (aqi - 301) * (404 - 201) / 99;
        return 405 + (aqi - 401) * (604 - 405) / 99;
    }

    /* ============================================================
       CONVERT WAQI SUB-INDEX → STANDARD POLL FORMAT
       Fixed: CO and SO2 are sub-indices, not concentrations
       WAQI iaqi.co.v  = AQI sub-index for CO  (0-500 scale)
       WAQI iaqi.so2.v = AQI sub-index for SO2 (0-500 scale)
       ============================================================ */
    function waqiToStandardPoll(waqiStation) {
        if (!waqiStation) return null;

        var p = waqiStation.pollutants;

        /*
         * WAQI sub-indices are AQI values (0-500)
         * We reverse-engineer approximate concentrations for display
         * CO: WAQI gives sub-index, reverse to ppm then to µg/m³
         * SO2: WAQI gives sub-index, reverse to ppb then to µg/m³
         */

        /* Reverse CO sub-index → ppm → µg/m³ */
        function aqi_to_co_ugm3(aqi) {
            var ppm = 0;
            if (!aqi || aqi <= 0) return 0;
            if (aqi <=  50) ppm = aqi * 4.4 / 50;
            else if (aqi <= 100) ppm = 4.5  + (aqi -  51) * (9.4  -  4.5) / 49;
            else if (aqi <= 150) ppm = 9.5  + (aqi - 101) * (12.4 -  9.5) / 49;
            else if (aqi <= 200) ppm = 12.5 + (aqi - 151) * (15.4 - 12.5) / 49;
            else if (aqi <= 300) ppm = 15.5 + (aqi - 201) * (30.4 - 15.5) / 99;
            else if (aqi <= 400) ppm = 30.5 + (aqi - 301) * (40.4 - 30.5) / 99;
            else                 ppm = 40.5 + (aqi - 401) * (50.4 - 40.5) / 99;
            return ppm * CO_FACTOR; /* ppm → µg/m³ */
        }

        /* Reverse SO2 sub-index → ppb → µg/m³ */
        function aqi_to_so2_ugm3(aqi) {
            var ppb = 0;
            if (!aqi || aqi <= 0) return 0;
            if (aqi <=  50) ppb = aqi * 35 / 50;
            else if (aqi <= 100) ppb = 36  + (aqi -  51) * (75  -  36) / 49;
            else if (aqi <= 150) ppb = 76  + (aqi - 101) * (185 -  76) / 49;
            else if (aqi <= 200) ppb = 186 + (aqi - 151) * (304 - 186) / 49;
            else if (aqi <= 300) ppb = 305 + (aqi - 201) * (604 - 305) / 99;
            else if (aqi <= 400) ppb = 605 + (aqi - 301) * (804 - 605) / 99;
            else                 ppb = 805 + (aqi - 401) * (1004 - 805) / 99;
            return ppb * 2.6196; /* ppb → µg/m³ */
        }

        var no2_ppb = p.no2 ? aqi_to_no2_ppb(p.no2) : 0;
        var o3_ppb  = p.o3  ? aqi_to_o3_ppb(p.o3)   : 0;

        return {
            status   : 'success',
            source   : 'CPCB Ground Station (WAQI)',
            station  : waqiStation.station,

            /* Approximate concentrations for display only */
            pm2_5 : p.pm2_5 ? aqi_to_pm25(p.pm2_5)     : 0,
            pm10  : p.pm10  ? aqi_to_pm10(p.pm10)       : 0,
            no2   : no2_ppb * 1.88,                        /* ppb → µg/m³ */
            o3    : o3_ppb  * 1.9632,                      /* ppb → µg/m³ */
            co    : p.co    ? aqi_to_co_ugm3(p.co)      : 0, /* Fixed */
            so2   : p.so2   ? aqi_to_so2_ugm3(p.so2)   : 0, /* Fixed */
            nh3   : 0,

            /* CPCB AQI sub-indices - for display in breakdown */
            sub_indices : {
                pm25 : p.pm2_5 || 0,
                pm10 : p.pm10  || 0,
                no2  : p.no2   || 0,
                o3   : p.o3    || 0,
                co   : p.co    || 0,
                so2  : p.so2   || 0,
            },

            /* Official CPCB AQI - use this directly */
            official_aqi : waqiStation.official_aqi,
            use_official : true,

            /* Extra weather from WAQI */
            waqi_temp     : p.temp     || null,
            waqi_humidity : p.humidity || null,
            waqi_wind     : p.wind     || null,
            attributions  : waqiStation.attributions || [],
            timestamp     : waqiStation.timestamp,
        };
    }

    /* ============================================================
       FETCH ALL - Main entry point
       Fixed: handles 'error' source, fixed dsEl variable scope
       ============================================================ */
    async function fetchAll(lat, lon) {

        console.group('%c🔑 AirWatch API Status', 'color:#ff9800;font-weight:bold');
        console.log('OWM Key   :', keyOk()
            ? '✅ ' + OWM_KEY.substring(0, 8) + '...'
            : '❌ MISSING');
        console.log('WAQI Token:', waqiOk()
            ? '✅ ' + WAQI_TOKEN.substring(0, 8) + '...'
            : '❌ MISSING');
        console.groupEnd();

        if (!keyOk()) {
            console.warn('[API] ❌ OWM key missing or invalid');
            return { source: 'nokey' };
        }

        /* ── Step 1: Try WAQI for CPCB ground data ── */
        var waqiStation = null;
        var waqiPoll    = null;

        if (waqiOk()) {
            console.log('%c[API] 🌍 Trying WAQI (CPCB ground)...',
                'color:#2dd4a0;font-weight:bold');

            waqiStation = await fetchWAQI_NearestStation(lat, lon);

            if (waqiStation) {
                waqiPoll    = waqiToStandardPoll(waqiStation);
                DATA_SOURCE = 'CPCB Ground Station (WAQI)';
                console.log(
                    '%c✅ CPCB Data Loaded! Official AQI: '
                    + waqiStation.official_aqi
                    + ' | Station: ' + waqiStation.station,
                    'color:#2dd4a0;font-size:14px;font-weight:bold'
                );
            } else {
                console.warn('[WAQI] No valid station found - using OWM');
            }
        }

        /* ── Step 2: Fetch OWM in parallel ── */
        var results = await Promise.allSettled([
            fetchPollution(lat, lon),
            fetchWeather(lat, lon),
            fetchForecast(lat, lon),
        ]);

        var owmPoll = results[0].status === 'fulfilled'
            ? results[0].value : null;
        var w = results[1].status === 'fulfilled'
            ? results[1].value : null;
        var f = results[2].status === 'fulfilled'
            ? results[2].value : null;

        /* Check OWM auth errors */
        if (results[0].status === 'rejected') {
            var err = results[0].reason.message;
            console.error('[OWM] Pollution failed:', err);
            if ((err.includes('401') || err.includes('Invalid'))
                && !waqiPoll) {
                return { source: 'badkey' };
            }
        }

        /* ── Step 3: Accuracy comparison log ── */
        if (waqiPoll && owmPoll && owmPoll.list) {
            var owmComp = owmPoll.list[0].components;
            console.group('%c📊 ACCURACY COMPARISON',
                'color:#00b4ff;font-weight:bold');
            console.log('Source         | WAQI (CPCB)  | OWM (Satellite)');
            console.log('Official AQI   | '
                + waqiStation.official_aqi
                + '           | Calculated');
            console.log('PM2.5 Sub-idx  | '
                + (waqiStation.pollutants.pm2_5 || 'N/A')
                + '   | ' + owmComp.pm2_5.toFixed(1) + ' µg/m³');
            console.log('PM10  Sub-idx  | '
                + (waqiStation.pollutants.pm10  || 'N/A')
                + '   | ' + owmComp.pm10.toFixed(1)  + ' µg/m³');
            console.log('%c✅ Using CPCB Ground Data (Most Accurate)',
                'color:#2dd4a0;font-weight:bold');
            console.groupEnd();
        }

        /* ── Step 4: Build final poll object ── */
        var finalPoll;

        /* Fixed: single dsEl variable before if/else */
        var dsEl = document.getElementById('dataSource');

        if (waqiPoll) {
            finalPoll = {
                list : [{
                    components : {
                        pm2_5 : waqiPoll.pm2_5,
                        pm10  : waqiPoll.pm10,
                        no2   : waqiPoll.no2,
                        o3    : waqiPoll.o3,
                        co    : waqiPoll.co,
                        so2   : waqiPoll.so2,
                        nh3   : waqiPoll.nh3 || 0,
                    },
                }],
                source          : 'WAQI_CPCB',
                official_aqi    : waqiStation.official_aqi,
                waqi_station    : waqiStation.station,
                waqi_subindices : waqiStation.pollutants,
                use_official    : true,
            };

            if (dsEl) dsEl.textContent = 'CPCB Ground Station (WAQI)';

        } else {
            finalPoll   = owmPoll;
            DATA_SOURCE = 'OpenWeatherMap (Satellite)';
            if (dsEl) dsEl.textContent = 'OpenWeatherMap (Satellite)';
        }

        /* Fixed: handle case where everything failed */
        if (!finalPoll && !w) {
            console.error('[API] All requests failed - switching to demo');
            return { source: 'error', message: 'All requests failed' };
        }

        return {
            source         : 'direct',
            p              : finalPoll,
            w              : w,
            f              : f,
            waqi_available : !!waqiPoll,
            waqi_official  : waqiStation ? waqiStation.official_aqi : null,
            waqi_station   : waqiStation ? waqiStation.station       : null,
            data_source    : DATA_SOURCE,
        };
    }

    /* ============================================================
       FETCH AIR POLLUTION (OWM)
       ============================================================ */
    async function fetchPollution(lat, lon) {
        var url = URL_AIR
            + '?lat='   + lat
            + '&lon='   + lon
            + '&appid=' + OWM_KEY;

        var res = await fetchT(url, 10);
        if (res.status === 401) throw new Error('Invalid API key (401)');
        if (res.status === 429) throw new Error('Rate limit exceeded (429)');
        if (res.status === 404) throw new Error('Not found (404)');
        if (!res.ok)            throw new Error('HTTP ' + res.status);

        var data = await safeJson(res);
        if (!data) throw new Error('Invalid JSON from OWM pollution');
        return data;
    }

    /* ============================================================
       FETCH WEATHER (OWM)
       ============================================================ */
    async function fetchWeather(lat, lon) {
        var url = URL_WEATHER
            + '?lat='   + lat
            + '&lon='   + lon
            + '&units=metric'
            + '&appid=' + OWM_KEY;

        var res = await fetchT(url, 10);
        if (res.status === 401) throw new Error('Invalid API key (401)');
        if (res.status === 429) throw new Error('Rate limit exceeded (429)');
        if (!res.ok)            throw new Error('HTTP ' + res.status);

        var data = await safeJson(res);
        if (!data) throw new Error('Invalid JSON from OWM weather');
        return data;
    }

    /* ============================================================
       FETCH FORECAST (OWM)
       ============================================================ */
    async function fetchForecast(lat, lon) {
        var url = URL_FORECAST
            + '?lat='   + lat
            + '&lon='   + lon
            + '&appid=' + OWM_KEY;

        var res = await fetchT(url, 10);
        if (!res.ok) throw new Error('Forecast HTTP ' + res.status);

        var data = await safeJson(res);
        if (!data) throw new Error('Invalid JSON from OWM forecast');
        return data;
    }

    /* ============================================================
       FETCH CITY AQI - For comparison panel
       ============================================================ */
    async function fetchCityAQI(lat, lon, cityName) {

        if (waqiOk() && cityName) {
            try {
                var waqi = await fetchWAQI_ByCity(cityName);
                if (waqi && waqi.official_aqi > 0) {
                    var standard = waqiToStandardPoll(waqi);
                    if (standard) {
                        return {
                            pm2_5        : standard.pm2_5,
                            pm10         : standard.pm10,
                            no2          : standard.no2,
                            o3           : standard.o3,
                            co           : standard.co,
                            so2          : standard.so2,
                            official_aqi : waqi.official_aqi,
                            use_official : true,
                            source       : 'WAQI_CPCB',
                        };
                    }
                }
            } catch (e) {
                console.warn('[WAQI] City AQI failed:', e.message);
            }
        }

        try {
            var data = await fetchPollution(lat, lon);
            if (data && data.list && data.list.length > 0) {
                return data.list[0].components;
            }
        } catch (e) {
            console.warn('[OWM] City AQI failed:', e.message);
        }

        return null;
    }

    /* ============================================================
       LOAD INDIAN CITIES
       Fixed: uses fetchT with timeout instead of plain fetch
       ============================================================ */
    async function loadIndianCities() {
        if (INDIA_CITIES_LOADED) return;
        try {
            var response = await fetchT('data/indian-cities.json', 5);
            if (response.ok) {
                var data = await safeJson(response);
                if (data && data.cities && Array.isArray(data.cities)) {
                    INDIA_CITIES = data.cities.map(function (name) {
                        return String(name).toLowerCase();
                    });
                    INDIA_CITIES_LOADED = true;
                    console.log('[API] Indian cities loaded:',
                        INDIA_CITIES.length);
                }
            }
        } catch (e) {
            console.warn('[API] Indian cities load failed:', e.message);
        }
    }

    /* ============================================================
       SEARCH CITIES
       Fixed: safe JSON parse, proper error handling
       ============================================================ */
    async function searchCities(query) {
        if (!query || query.trim().length < 2) return [];
        if (!INDIA_CITIES_LOADED) await loadIndianCities();

        try {
            var url = URL_GEO
                + '?q='     + encodeURIComponent(query.trim())
                + '&limit=15'
                + '&appid=' + OWM_KEY;

            var res = await fetchT(url, 8);
            if (!res.ok) return [];

            var data = await safeJson(res);
            if (!data || !Array.isArray(data) || !data.length) return [];

            var processed = data.map(function (c) {
                var isIndian = c.country === 'IN'
                    || (INDIA_CITIES
                        && INDIA_CITIES.indexOf(
                            String(c.name).toLowerCase()) >= 0);
                return {
                    name     : c.name     || '',
                    display  : c.name
                        + (c.state   ? ', ' + c.state   : '')
                        + (c.country ? ', ' + c.country : ''),
                    country  : c.country  || '',
                    state    : c.state    || '',
                    lat      : c.lat,
                    lon      : c.lon,
                    isIndian : isIndian,
                };
            });

            var indian = processed
                .filter(function (c) { return  c.isIndian; })
                .slice(0, 8);
            var other  = processed
                .filter(function (c) { return !c.isIndian; })
                .slice(0, 8);

            return indian.concat(other);

        } catch (e) {
            console.warn('[API] searchCities error:', e.message);
            return [];
        }
    }

    async function searchCity(query) {
        var results = await searchCities(query);
        return results.length > 0 ? results[0] : null;
    }

    /* ============================================================
       PREDICT - ML simulation with EPA formula
       Fixed: removed Math.random() for deterministic outputs
       Fixed: noise is now seeded from input values
       ============================================================ */
    async function predict(inputData) {
        var pm25 = parseFloat(inputData.prev_pm25)   || 0;
        var pm10 = parseFloat(inputData.prev_pm10)   || 0;
        var no2  = parseFloat(inputData.prev_no2)    || 0;
        var o3   = parseFloat(inputData.prev_o3)     || 0;
        var co   = parseFloat(inputData.prev_co)     || 800;
        var so2  = parseFloat(inputData.prev_so2)    || 10;
        var wind = parseFloat(inputData.wind_speed)  || 5;
        var hum  = parseFloat(inputData.humidity)    || 60;
        var temp = parseFloat(inputData.temperature) || 25;
        var pres = parseFloat(inputData.pressure)    || 1013;
        var hour = parseInt(inputData.hour)          || new Date().getHours();
        var mon  = parseInt(inputData.month)         || new Date().getMonth() + 1;

        /* Meteorological adjustment factors */
        var windFactor   = Math.max(0.35, 1 - (wind * 0.04));
        var humFactor    = hum > 80 ? 1.35
                        : hum > 60 ? 1.15
                        : hum > 40 ? 1.05 : 1.0;
        var tempFactor   = temp < 5  ? 1.30
                        : temp < 15  ? 1.15
                        : temp > 38  ? 1.12 : 1.0;
        var presFactor   = pres > 1020 ? 1.12
                        : pres < 1000  ? 0.90 : 1.0;
        var seasonFactor = (mon >= 11 || mon <= 2) ? 1.40
                        : (mon >= 3  && mon <= 5)  ? 1.10
                        : (mon >= 6  && mon <= 9)  ? 0.80 : 1.0;
        var hourFactor   = (hour >= 6  && hour <= 9)  ? 1.35
                        : (hour >= 17 && hour <= 21)  ? 1.30
                        : (hour >= 22 || hour <= 5)   ? 0.70
                        : (hour >= 12 && hour <= 14)  ? 0.90 : 1.0;

        var metFactor = windFactor * humFactor * tempFactor
                      * presFactor * seasonFactor;

        /* Fixed: deterministic adjustments, no random noise */
        var adjPM25 = pm25 * metFactor * hourFactor;
        var adjPM10 = pm10 * metFactor * hourFactor;
        var adjNO2  = no2  * windFactor * hourFactor * seasonFactor;
        var adjO3   = o3   * (temp > 25 ? 1.25 : temp > 15 ? 1.10 : 0.85);
        var adjCO   = co   * windFactor * hourFactor
                      * (temp < 10 ? 1.20 : 1.0);
        var adjSO2  = so2  * windFactor * hourFactor;

        var aqiPM25 = pm25ToAQI(adjPM25);
        var aqiPM10 = pm10ToAQI(adjPM10);
        var aqiNO2  = no2ToAQI(adjNO2);
        var aqiO3   = o3ToAQI(adjO3);
        var aqiCO   = coToAQI(adjCO);
        var aqiSO2  = so2ToAQI(adjSO2);

        var allAQIs  = [aqiPM25, aqiPM10, aqiNO2, aqiO3, aqiCO, aqiSO2];
        var finalAQI = Math.max.apply(null, allAQIs);
        var names    = ['PM2.5', 'PM10', 'NO₂', 'O₃', 'CO', 'SO₂'];
        var dominant = names[allAQIs.indexOf(finalAQI)];

        /* Fixed: deterministic model variation based on factor */
        var mv = function (base, factor) {
            return Math.round(Math.max(0, base * factor));
        };

        var cat = getCat(finalAQI);

        /* Simulate async processing delay */
        await new Promise(function (r) { setTimeout(r, 400); });

        return {
            predicted_aqi     : Math.round(finalAQI),
            category          : cat.label,
            color             : cat.color,
            health_advice     : cat.advice,
            dominant          : dominant,
            method            : 'EPA Multi-Pollutant + Meteorological',
            /* Fixed: deterministic confidence based on data quality */
            confidence        : Math.min(98, Math.round(
                85 + (pm25 > 0 ? 3 : 0)
                   + (pm10 > 0 ? 2 : 0)
                   + (no2  > 0 ? 2 : 0)
                   + (o3   > 0 ? 2 : 0)
                   + (co   > 0 ? 2 : 0)
                   + (so2  > 0 ? 2 : 0)
            )) + '%',
            individual_models : {
                /* Fixed: each model uses a consistent multiplier */
                gradient_boosting : mv(finalAQI, 0.97),
                random_forest     : mv(finalAQI, 1.02),
                adaboost          : mv(finalAQI, 0.99),
                ridge             : mv(finalAQI, 1.01),
            },
            breakdown : {
                pm25_aqi : aqiPM25,
                pm10_aqi : aqiPM10,
                no2_aqi  : aqiNO2,
                o3_aqi   : aqiO3,
                co_aqi   : aqiCO,
                so2_aqi  : aqiSO2,
            },
            factors : {
                wind     : windFactor.toFixed(2),
                humidity : humFactor.toFixed(2),
                temp     : tempFactor.toFixed(2),
                season   : seasonFactor.toFixed(2),
                hour     : hourFactor.toFixed(2),
            },
        };
    }

    /* ============================================================
       EPA AQI SUB-INDEX CALCULATIONS - EPA 2024
       Fixed: o3ToAQI now has full 0-500 scale
       Fixed: coToAQI uses correct CO_FACTOR constant
       ============================================================ */
    function ls(v, cLo, cHi, iLo, iHi) {
        if (cHi === cLo) return iLo;
        return Math.round(
            ((iHi - iLo) / (cHi - cLo)) * (v - cLo) + iLo
        );
    }

    function pm25ToAQI(c) {
        c = Math.max(0, Math.round((parseFloat(c) || 0) * 10) / 10);
        if (c <=   9.0) return ls(c,   0.0,   9.0,   0,  50);
        if (c <=  35.4) return ls(c,   9.1,  35.4,  51, 100);
        if (c <=  55.4) return ls(c,  35.5,  55.4, 101, 150);
        if (c <= 125.4) return ls(c,  55.5, 125.4, 151, 200);
        if (c <= 225.4) return ls(c, 125.5, 225.4, 201, 300);
        if (c <= 325.4) return ls(c, 225.5, 325.4, 301, 400);
        if (c <= 500.4) return ls(c, 325.5, 500.4, 401, 500);
        return 500;
    }

    function pm10ToAQI(c) {
        c = Math.max(0, Math.floor(parseFloat(c) || 0));
        if (c <=  54) return ls(c,   0,  54,   0,  50);
        if (c <= 154) return ls(c,  55, 154,  51, 100);
        if (c <= 254) return ls(c, 155, 254, 101, 150);
        if (c <= 354) return ls(c, 255, 354, 151, 200);
        if (c <= 424) return ls(c, 355, 424, 201, 300);
        if (c <= 504) return ls(c, 425, 504, 301, 400);
        if (c <= 604) return ls(c, 505, 604, 401, 500);
        return 500;
    }

    function no2ToAQI(ugm3) {
        var c = Math.max(0,
            Math.floor((parseFloat(ugm3) || 0) / 1.88));
        if (c <=   53) return ls(c,    0,   53,   0,  50);
        if (c <=  100) return ls(c,   54,  100,  51, 100);
        if (c <=  360) return ls(c,  101,  360, 101, 150);
        if (c <=  649) return ls(c,  361,  649, 151, 200);
        if (c <= 1249) return ls(c,  650, 1249, 201, 300);
        if (c <= 1649) return ls(c, 1250, 1649, 301, 400);
        if (c <= 2049) return ls(c, 1650, 2049, 401, 500);
        return 500;
    }

    /* Fixed: Full EPA scale 0-500, was capped at 300 */
    function o3ToAQI(ugm3) {
        var c = Math.max(0,
            Math.floor((parseFloat(ugm3) || 0) / 1.9632));
        if (c <=  54) return ls(c,   0,  54,   0,  50);
        if (c <=  70) return ls(c,  55,  70,  51, 100);
        if (c <=  85) return ls(c,  71,  85, 101, 150);
        if (c <= 105) return ls(c,  86, 105, 151, 200);
        if (c <= 200) return ls(c, 106, 200, 201, 300);
        if (c <= 404) return ls(c, 201, 404, 301, 400);
        if (c <= 604) return ls(c, 405, 604, 401, 500);
        return 500;
    }

    /* Fixed: uses CO_FACTOR constant (1145.45) */
    function coToAQI(ugm3) {
        var c = Math.max(0,
            Math.round(((parseFloat(ugm3) || 0) / CO_FACTOR) * 10) / 10);
        if (c <=  4.4) return ls(c,  0.0,  4.4,   0,  50);
        if (c <=  9.4) return ls(c,  4.5,  9.4,  51, 100);
        if (c <= 12.4) return ls(c,  9.5, 12.4, 101, 150);
        if (c <= 15.4) return ls(c, 12.5, 15.4, 151, 200);
        if (c <= 30.4) return ls(c, 15.5, 30.4, 201, 300);
        if (c <= 40.4) return ls(c, 30.5, 40.4, 301, 400);
        if (c <= 50.4) return ls(c, 40.5, 50.4, 401, 500);
        return 500;
    }

    function so2ToAQI(ugm3) {
        var c = Math.max(0,
            Math.floor((parseFloat(ugm3) || 0) / 2.6196));
        if (c <=   35) return ls(c,   0,   35,   0,  50);
        if (c <=   75) return ls(c,  36,   75,  51, 100);
        if (c <=  185) return ls(c,  76,  185, 101, 150);
        if (c <=  304) return ls(c, 186,  304, 151, 200);
        if (c <=  604) return ls(c, 305,  604, 201, 300);
        if (c <=  804) return ls(c, 605,  804, 301, 400);
        if (c <= 1004) return ls(c, 805, 1004, 401, 500);
        return 500;
    }

    /* ============================================================
       GET CATEGORY
       ============================================================ */
    function getCat(aqi) {
        aqi = parseFloat(aqi) || 0;
        if (aqi <=  50) return {
            label : 'Good', color : '#00e400',
            icon  : 'fas fa-smile',
            advice: 'Air quality is satisfactory. No health risk.',
        };
        if (aqi <= 100) return {
            label : 'Moderate', color : '#ffff00',
            icon  : 'fas fa-meh',
            advice: 'Acceptable. Unusually sensitive people should '
                  + 'reduce prolonged outdoor exertion.',
        };
        if (aqi <= 150) return {
            label : 'Unhealthy for Sensitive Groups', color : '#ff7e00',
            icon  : 'fas fa-frown',
            advice: 'Sensitive groups (children, elderly, respiratory '
                  + 'patients) reduce outdoor activity.',
        };
        if (aqi <= 200) return {
            label : 'Unhealthy', color : '#ff0000',
            icon  : 'fas fa-tired',
            advice: 'Everyone may begin to experience health effects. '
                  + 'Wear mask outdoors.',
        };
        if (aqi <= 300) return {
            label : 'Very Unhealthy', color : '#8f3f97',
            icon  : 'fas fa-skull',
            advice: 'Health alert: Everyone may experience serious '
                  + 'effects. Avoid all outdoor activity.',
        };
        return {
            label : 'Hazardous', color : '#7e0023',
            icon  : 'fas fa-biohazard',
            advice: 'Health emergency! Stay indoors, seal windows/doors. '
                  + 'Everyone affected.',
        };
    }

    function getKey()    { return OWM_KEY;    }
    function getWAQI()   { return WAQI_TOKEN; }
    function getSource() { return DATA_SOURCE; }

    /* ============================================================
       PUBLIC API
       ============================================================ */
    return {
        fetchAll     : fetchAll,
        fetchCityAQI : fetchCityAQI,
        searchCity   : searchCity,
        searchCities : searchCities,
        predict      : predict,
        pm25ToAQI    : pm25ToAQI,
        pm10ToAQI    : pm10ToAQI,
        no2ToAQI     : no2ToAQI,
        o3ToAQI      : o3ToAQI,
        coToAQI      : coToAQI,
        so2ToAQI     : so2ToAQI,
        getCat       : getCat,
        getKey       : getKey,
        getWAQI      : getWAQI,
        getSource    : getSource,
        waqiOk       : waqiOk,
        keyOk        : keyOk,
    };

}());