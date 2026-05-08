/* ============================================================
   LIVE-LOCATION.JS - Live GPS Location Detection
   ============================================================ */

'use strict';

var liveLocation = (function() {
    
    var isActive = false;
    var coords = { lat: null, lon: null };
    
    function fetch() {
        if (!navigator.geolocation) {
            toast.show('Geolocation not supported by your browser', 'error');
            return;
        }
        
        var btn = document.getElementById('liveLocBtn');
        if (!btn) return;
        
        btn.classList.add('loading');
        toast('Fetching your location...', 'info');
        
        navigator.geolocation.getCurrentPosition(
            function(position) {
                coords.lat = position.coords.latitude;
                coords.lon = position.coords.longitude;
                isActive = true;
                
                btn.classList.remove('loading');
                btn.classList.add('active');
                
                showBanner(coords.lat, coords.lon);
                loadData(coords.lat, coords.lon);
                
                toast('📍 Live location detected!', 'success');
            },
            function(error) {
                btn.classList.remove('loading');
                var msg = 'Location access denied';
                if (error.code === 1) msg = 'Please enable location permissions';
                if (error.code === 2) msg = 'Location unavailable';
                if (error.code === 3) msg = 'Location timeout';
                toast(msg, 'error');
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    }
    
    function showBanner(lat, lon) {
        var banner = document.getElementById('liveBanner');
        var coordsEl = document.getElementById('lbCoords');
        
        if (banner && coordsEl) {
            coordsEl.textContent = lat.toFixed(4) + '°N, ' + lon.toFixed(4) + '°E';
            banner.style.display = 'flex';
            
            reverseGeocode(lat, lon);
        }
    }
    
    function closeBanner() {
        var banner = document.getElementById('liveBanner');
        if (banner) banner.style.display = 'none';
        
        isActive = false;
        
        var btn = document.getElementById('liveLocBtn');
        if (btn) btn.classList.remove('active');
    }
    
    async function reverseGeocode(lat, lon) {
        try {
            var url = 'https://api.openweathermap.org/geo/1.0/reverse?lat='
                + lat + '&lon=' + lon + '&limit=1&appid=' + api.getKey();
            
            var res = await fetch(url);
            if (!res.ok) return;
            
            var data = await res.json();
            if (data && data.length > 0) {
                var cityName = data[0].name;
                var country = data[0].country;
                
                var lbCity = document.getElementById('lbCity');
                var navCity = document.getElementById('navCity');
                var locCity = document.getElementById('locCity');
                
                if (lbCity) lbCity.textContent = cityName + ', ' + country;
                if (navCity) navCity.textContent = cityName + ', ' + country;
                if (locCity) locCity.textContent = cityName;
            }
        } catch (err) {
            console.warn('[LiveLocation] Reverse geocoding failed:', err);
        }
    }
    
    async function loadData(lat, lon) {
        try {
            // Update global coordinates so loadAll() uses correct position
            LAT = lat;
            LON = lon;
            loadAll();  // uses global LAT/LON and handles all UI updates
        } catch (err) {
            console.error('[LiveLocation] Load error:', err);
            toast('Error loading data', 'error');
        }
    }
    
    function updateUI(pollutionData, weatherData, forecastData) {
    if (!pollutionData || !pollutionData.list || pollutionData.list.length === 0) {
        return;
    }
    
    var current = pollutionData.list[0];
    var comp = current.components;
    
    // Check if we have WAQI AQI value (more accurate)
    var usAqi;
    if (pollutionData.city && pollutionData.city.name) {
        // We have WAQI data - use their AQI directly
        usAqi = current.main.aqi;
        console.log('[UI] Using WAQI AQI:', usAqi);
        
        // Show WAQI attribution
        var lastUpdated = document.getElementById('lastUpdated');
        if (lastUpdated && pollutionData.attributions) {
            var attribution = pollutionData.attributions[0];
            lastUpdated.innerHTML = 
                '<i class="fas fa-clock"></i>' +
                '<span>Updated: ' + new Date().toLocaleString() + 
                ' | Data: ' + attribution.name + '</span>';
        }
    } else {
        // Calculate from EPA formula
        usAqi = calculateAccurateAQI(comp);
        console.log('[UI] Using EPA calculated AQI:', usAqi);
    }
    
    var category = api.getCat(usAqi);
    
    // Rest of the function remains the same...
    updateMainDisplay(usAqi, category, weatherData);
    updatePollutants(comp);
    
    if (weatherData) {
        updateWeather(weatherData);
    }
    
    if (forecastData && typeof timeLive !== 'undefined') {
        timeLive.update(pollutionData, forecastData);
    }
    
    window.currentAQIData = {
        aqi: usAqi,
        components: comp,
        weather: weatherData ? weatherData.main : null,
        category: category,
        source: pollutionData.city ? 'WAQI' : 'OWM'
    };
}
    
    function calculateAccurateAQI(comp) {
        var aqis = [
            api.pm25ToAQI(comp.pm2_5 || 0),
            api.pm10ToAQI(comp.pm10 || 0),
            api.no2ToAQI(comp.no2 || 0),
            api.o3ToAQI(comp.o3 || 0),
            api.coToAQI(comp.co || 0),
            api.so2ToAQI(comp.so2 || 0)
        ];
        
        return Math.max.apply(null, aqis);
    }
    
    function updateMainDisplay(aqi, category, weather) {
        var aqiBigNum = document.getElementById('aqiBigNum');
        var aqiPill = document.getElementById('aqiPill');
        var aqiMessage = document.getElementById('aqiMessage');
        var aqiDisplay = document.getElementById('aqiDisplay');
        
        if (aqiBigNum) aqiBigNum.textContent = Math.round(aqi);
        if (aqiPill) {
            aqiPill.textContent = category.label;
            aqiPill.style.background = category.color;
            aqiPill.style.color = aqi <= 100 ? '#000' : '#fff';
        }
        if (aqiMessage) aqiMessage.textContent = category.advice;
        if (aqiDisplay) {
            aqiDisplay.style.background = 'linear-gradient(135deg, ' + category.color + '15 0%, ' + category.color + '05 100%)';
            aqiDisplay.style.borderColor = category.color + '40';
        }
        
        // Update location
        if (weather) {
            var locSub = document.getElementById('locSub');
            
            if (locSub && weather.weather && weather.weather[0]) {
                locSub.textContent = weather.sys.country + ' • ' + weather.weather[0].description;
            }
        }
        
        // Update quick stats
        if (weather) {
            var qsTemp = document.getElementById('qsTemp');
            var qsHumid = document.getElementById('qsHumid');
            var qsWind = document.getElementById('qsWind');
            
            if (qsTemp) qsTemp.textContent = Math.round(weather.main.temp);
            if (qsHumid) qsHumid.textContent = weather.main.humidity;
            if (qsWind) qsWind.textContent = weather.wind.speed.toFixed(1);
        }
        
        // Update scale pointer
        updateScalePointer(aqi);
    }
    
    function updatePollutants(comp) {
        var pollutants = [
            { id: 'pm25', value: comp.pm2_5 || 0, calc: api.pm25ToAQI },
            { id: 'pm10', value: comp.pm10 || 0, calc: api.pm10ToAQI },
            { id: 'no2', value: comp.no2 || 0, calc: api.no2ToAQI },
            { id: 'o3', value: comp.o3 || 0, calc: api.o3ToAQI },
            { id: 'co', value: comp.co || 0, calc: api.coToAQI },
            { id: 'so2', value: comp.so2 || 0, calc: api.so2ToAQI }
        ];
        
        var maxAqi = 0;
        var dominantName = 'N/A';
        
        pollutants.forEach(function(p) {
            var aqi = p.calc(p.value);
            var cat = api.getCat(aqi);
            
            // Update value
            var valueEl = document.getElementById('pv-' + p.id);
            if (valueEl) valueEl.textContent = p.value.toFixed(1);
            
            // Update badge
            var badgeEl = document.getElementById('pb-' + p.id);
            if (badgeEl) {
                badgeEl.textContent = Math.round(aqi);
                badgeEl.style.background = cat.color;
                badgeEl.style.color = aqi <= 100 ? '#000' : '#fff';
            }
            
            // Update bar
            var barEl = document.getElementById('pbar-' + p.id);
            if (barEl) {
                var percent = Math.min((aqi / 500) * 100, 100);
                barEl.style.width = percent + '%';
                barEl.style.background = cat.color;
            }
            
            // Track dominant
            if (aqi > maxAqi) {
                maxAqi = aqi;
                dominantName = p.id.toUpperCase();
            }
        });
        
        // Update dominant pollutant
        var domPoll = document.getElementById('domPoll');
        if (domPoll) domPoll.textContent = dominantName;
    }
    
    function updateWeather(weather) {
        var wiTemp = document.getElementById('wiTemp');
        var wiHumid = document.getElementById('wiHumid');
        var wiWind = document.getElementById('wiWind');
        var wiPres = document.getElementById('wiPres');
        var wiVis = document.getElementById('wiVis');
        
        if (wiTemp) wiTemp.textContent = Math.round(weather.main.temp) + '°C';
        if (wiHumid) wiHumid.textContent = weather.main.humidity + '%';
        if (wiWind) wiWind.textContent = weather.wind.speed.toFixed(1) + ' m/s';
        if (wiPres) wiPres.textContent = weather.main.pressure + ' hPa';
        if (wiVis && weather.visibility) {
            wiVis.textContent = (weather.visibility / 1000).toFixed(1) + ' km';
        }
        
        var wiFeels = document.getElementById('wiFeels');
        if (wiFeels && weather.main.feels_like) {
            wiFeels.textContent = Math.round(weather.main.feels_like) + '°C';
        }
    }
    
    function updateScalePointer(aqi) {
        var pointer = document.getElementById('scalePointer');
        if (!pointer) return;
        
        var percent = 0;
        if (aqi <= 50) percent = (aqi / 50) * 16.66;
        else if (aqi <= 100) percent = 16.66 + ((aqi - 50) / 50) * 16.66;
        else if (aqi <= 150) percent = 33.32 + ((aqi - 100) / 50) * 16.66;
        else if (aqi <= 200) percent = 49.98 + ((aqi - 150) / 50) * 16.66;
        else if (aqi <= 300) percent = 66.64 + ((aqi - 200) / 100) * 16.66;
        else percent = 83.3 + ((Math.min(aqi, 500) - 300) / 200) * 16.66;
        
        percent = Math.min(percent, 100);
        pointer.style.left = percent + '%';
    }
    
    return {
        fetch: fetch,
        closeBanner: closeBanner,
        updateUI: updateUI
    };
    
})();

// Expose to global scope
window.fetchLiveLocation = liveLocation.fetch;
window.closeLiveBanner = liveLocation.closeBanner;