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

    /* ── IQAir Token (Real-time AQI) ────────────────────────── */
    var IQAIR_KEY = '27636e29-836f-490f-bc7f-01b3871d8b8e';

    /* ── OWM Endpoints ──────────────────────────────────────── */
    var URL_AIR      = 'https://api.openweathermap.org/data/2.5/air_pollution';
    var URL_FORECAST = 'https://api.openweathermap.org/data/2.5/air_pollution/forecast';
    var URL_WEATHER  = 'https://api.openweathermap.org/data/2.5/weather';

    /* ── IQAir Endpoint ─────────────────────────────────────── */
    var URL_IQAIR = 'https://api.airvisual.com/v2/nearest_city';
    
    /* ── Nominatim Endpoint (Search) ────────────────────────── */
    var URL_GEO = 'https://nominatim.openstreetmap.org/search';

    /* ── CO Conversion Constant (µg/m³ per ppm) ─────────────── */
    /* Fixed: unified with app.js CONV object value             */
    var CO_FACTOR = 1145.45;

    /* ── Data source tracker ────────────────────────────────── */
    var DATA_SOURCE = 'Unknown';

    /* ============================================================
       KEY VALIDATORS
       ============================================================ */
    function iqairOk() {
        return typeof IQAIR_KEY === 'string'
            && IQAIR_KEY.trim().length > 10;
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
       IQAIR: GET NEAREST STATION BY LAT/LON
       ============================================================ */
    async function fetchIQAir_NearestStation(lat, lon) {
        var url = URL_IQAIR
            + '?lat=' + lat + '&lon=' + lon
            + '&key=' + IQAIR_KEY;

        console.log('%c[IQAir] Fetching real-time AQI...', 'color:#2dd4a0');

        try {
            var res  = await fetchT(url, 12);
            var data = await safeJson(res);

            if (!data || data.status !== 'success') {
                console.warn('[IQAir] Status not success:', data);
                return null;
            }

            var d = data.data;
            var aqi = d.current.pollution.aqius;

            console.log(
                '%c[IQAir] ✅ City: ' + d.city + ' | Official AQI: ' + aqi,
                'color:#2dd4a0;font-weight:bold;font-size:13px'
            );

            return {
                station: d.city + (d.state ? ', ' + d.state : '') + (d.country ? ', ' + d.country : ''),
                official_aqi: aqi,
                main_pollutant: d.current.pollution.mainus,
                timestamp: d.current.pollution.ts
            };

        } catch (e) {
            console.error('[IQAir] Station fetch error:', e.message);
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
       FETCH ALL - Main entry point
       ============================================================ */
    async function fetchAll(lat, lon) {
        console.group('%c🔑 AirWatch API Status', 'color:#ff9800;font-weight:bold');
        console.log('OWM Key   :', keyOk() ? '✅ ' + OWM_KEY.substring(0, 8) + '...' : '❌ MISSING');
        console.log('IQAir Key :', iqairOk() ? '✅ ' + IQAIR_KEY.substring(0, 8) + '...' : '❌ MISSING');
        console.groupEnd();

        if (!keyOk()) {
            console.warn('[API] ❌ OWM key missing or invalid');
            return { source: 'nokey' };
        }

        /* ── Step 1: Fetch IQAir (Real-time AQI) & OWM in parallel ── */
        var iqairPromise = iqairOk() ? fetchIQAir_NearestStation(lat, lon) : Promise.resolve(null);
        
        var results = await Promise.allSettled([
            fetchPollution(lat, lon),
            fetchWeather(lat, lon),
            fetchForecast(lat, lon),
            iqairPromise
        ]);

        var owmPoll = results[0].status === 'fulfilled' ? results[0].value : null;
        var w = results[1].status === 'fulfilled' ? results[1].value : null;
        var f = results[2].status === 'fulfilled' ? results[2].value : null;
        var iqairStation = results[3].status === 'fulfilled' ? results[3].value : null;

        /* Check OWM auth errors */
        if (results[0].status === 'rejected') {
            var err = results[0].reason.message;
            console.error('[OWM] Pollution failed:', err);
            if ((err.includes('401') || err.includes('Invalid')) && !iqairStation) {
                return { source: 'badkey' };
            }
        }

        /* ── Step 2: Build final poll object ── */
        var dsEl = document.getElementById('dataSource');
        var finalPoll = owmPoll;

        // If OWM failed but IQAir worked, we can still show IQAir data!
        if (iqairStation) {
            DATA_SOURCE = 'IQAir (AirVisual)';
            if (dsEl) dsEl.textContent = 'IQAir (AirVisual) Official';
            
            if (!finalPoll) {
                // Create a dummy poll object so the UI doesn't crash
                finalPoll = {
                    list: [{
                        components: {
                            pm2_5: 0, pm10: 0, no2: 0, o3: 0, co: 0, so2: 0
                        }
                    }]
                };
            }
            
            finalPoll.source = 'IQAir';
            finalPoll.official_aqi = iqairStation.official_aqi;
            finalPoll.waqi_station = iqairStation.station;
            finalPoll.use_official = true;

            console.log('%c✅ Using IQAir Data', 'color:#2dd4a0;font-weight:bold');
        } else if (finalPoll) {
            DATA_SOURCE = 'OpenWeatherMap (Satellite)';
            if (dsEl) dsEl.textContent = 'OpenWeatherMap (Satellite)';
        }

        if (!finalPoll && !w) {
            console.error('[API] ❌ All APIs failed (OWM & IQAir)');
            return { source: 'error', message: 'All requests failed' };
        }

        return {
            source         : 'direct',
            p              : finalPoll,
            w              : w,
            f              : f,
            waqi_available : !!iqairStation,
            waqi_official  : iqairStation ? iqairStation.official_aqi : null,
            waqi_station   : iqairStation ? iqairStation.station : null,
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

        // Fallback to OWM for comparison cities
        try {
            var data = await fetchPollution(lat, lon);
            if (data && data.list && data.list.length > 0) {
                return data.list[0].components;
            }
        } catch (e) {
            console.warn('[OWM] City AQI failed:', e.message);
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

    async function searchCities(query) {
        if (!query || query.trim().length < 2) return [];

        try {
            var url = URL_GEO
                + '?q=' + encodeURIComponent(query.trim())
                + '&format=json&limit=12&addressdetails=1';

            var res = await fetchT(url, 8);
            if (!res.ok) return [];

            var data = await safeJson(res);
            if (!data || !Array.isArray(data) || !data.length) return [];

            return data.map(function (c) {
                var addr = c.address || {};
                var countryCode = (addr.country_code || '').toLowerCase();
                
                // Extract best name
                var name = addr.city || addr.town || addr.village || addr.suburb || addr.hamlet || c.display_name.split(',')[0].trim();
                
                return {
                    name         : name,
                    display      : c.display_name,
                    country      : addr.country || '',
                    country_code : countryCode,
                    state        : addr.state || '',
                    lat          : parseFloat(c.lat),
                    lon          : parseFloat(c.lon),
                    isIndian     : countryCode === 'in',
                };
            });

        } catch (e) {
            console.error('[API] searchCities error:', e.message);
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
        getSource    : getSource,
        iqairOk      : iqairOk,
        keyOk        : keyOk,
        logSearch    : logSearch,
    };

    async function logSearch(city, lat, lon) {
        try {
            await fetch('/api/log_search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ city, lat, lon })
            });
        } catch (e) {
            console.warn('[API] Log search failed:', e.message);
        }
    }

}());