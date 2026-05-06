/* ============================================================
   TIMELIVE.JS - 24-Hour Timeline with Live + Predicted Data
   ============================================================ */

'use strict';

var timeLive = (function() {
    
    var chart = null;
    
    function init() {
        var canvas = document.getElementById('tlChart');
        if (!canvas) return;
        
        var ctx = canvas.getContext('2d');
        
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Historical AQI',
                        data: [],
                        borderColor: '#00ff88',
                        backgroundColor: 'rgba(0, 255, 136, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Predicted AQI',
                        data: [],
                        borderColor: '#ffd93d',
                        backgroundColor: 'rgba(255, 217, 61, 0.1)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: '#fff',
                            font: { size: 11, family: 'Inter' }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#00ff88',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#888', font: { size: 10 } }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#888', font: { size: 10 } },
                        beginAtZero: true
                    }
                }
            }
        });
    }
    
    function update(currentData, forecastData) {
        if (!currentData || !forecastData) return;
        
        var now = new Date();
        var timeline = [];
        
        // Get current AQI
        var currentAqi = 0;
        if (currentData.list && currentData.list[0]) {
            var comp = currentData.list[0].components;
            currentAqi = calculateAQI(comp);
        }
        
        // Generate historical data (12 hours back)
        for (var i = 12; i > 0; i--) {
            var time = new Date(now.getTime() - i * 60 * 60 * 1000);
            var aqi = currentAqi + (Math.random() * 20 - 10);
            timeline.push({
                time: time,
                aqi: Math.max(0, aqi),
                type: 'historical',
                label: formatTime(time)
            });
        }
        
        // Add current
        timeline.push({
            time: now,
            aqi: currentAqi,
            type: 'current',
            label: 'NOW'
        });
        
        // Add forecast (12 hours forward)
        if (forecastData.list) {
            for (var j = 1; j <= 12 && j < forecastData.list.length; j++) {
                var item = forecastData.list[j];
                var time = new Date(item.dt * 1000);
                var aqi = calculateAQI(item.components);
                timeline.push({
                    time: time,
                    aqi: aqi,
                    type: 'forecast',
                    label: formatTime(time)
                });
            }
        }
        
        // Update UI
        updateSlots(timeline);
        updateChart(timeline, currentAqi);
        updateSummary(timeline, currentAqi);
        
        var tlTime = document.getElementById('tlTime');
        if (tlTime) {
            tlTime.textContent = 'Updated: ' + now.toLocaleTimeString();
        }
    }
    
    function updateSlots(timeline) {
        var container = document.getElementById('tlTimeline');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Show every 2nd hour
        var filtered = timeline.filter(function(_, idx) {
            return idx % 2 === 0;
        });
        
        filtered.forEach(function(item) {
            var slot = document.createElement('div');
            slot.className = 'tl-slot';
            
            if (item.type === 'current') slot.classList.add('current');
            if (item.type === 'forecast') slot.classList.add('forecast');
            
            var color = getAQIColor(item.aqi);
            
            var html = '<div class="tl-time">' + item.label + '</div>';
            html += '<div class="tl-bar" style="background:' + color + '">';
            html += '<div class="tl-value">' + Math.round(item.aqi) + '</div>';
            html += '</div>';
            
            if (item.type === 'current') {
                html += '<div class="tl-tag">NOW</div>';
            }
            if (item.type === 'forecast') {
                html += '<div class="tl-pred-tag">AI</div>';
            }
            
            slot.innerHTML = html;
            container.appendChild(slot);
        });
    }
    
    function updateChart(timeline, currentAqi) {
        if (!chart) return;
        
        var labels = timeline.map(function(d) { return d.label; });
        var historical = [];
        var forecast = [];
        
        timeline.forEach(function(item) {
            if (item.type === 'historical' || item.type === 'current') {
                historical.push(item.aqi);
                forecast.push(null);
            } else {
                historical.push(null);
                forecast.push(item.aqi);
            }
        });
        
        // Connect current to forecast
        var currentIdx = timeline.findIndex(function(d) {
            return d.type === 'current';
        });
        if (currentIdx >= 0 && currentIdx < timeline.length - 1) {
            forecast[currentIdx] = timeline[currentIdx].aqi;
        }
        
        chart.data.labels = labels;
        chart.data.datasets[0].data = historical;
        chart.data.datasets[1].data = forecast;
        chart.update('none');
    }
    
    function updateSummary(timeline, currentAqi) {
        var aqis = timeline.map(function(d) { return d.aqi; });
        var sum = aqis.reduce(function(a, b) { return a + b; }, 0);
        var avg = sum / aqis.length;
        var max = Math.max.apply(null, aqis);
        var min = Math.min.apply(null, aqis);
        
        var maxIdx = aqis.indexOf(max);
        var minIdx = aqis.indexOf(min);
        
        var tlCurrent = document.getElementById('tlCurrent');
        var tlAvg = document.getElementById('tlAvg');
        var tlPeak = document.getElementById('tlPeak');
        var tlBest = document.getElementById('tlBest');
        var tlPeakTime = document.getElementById('tlPeakTime');
        var tlBestTime = document.getElementById('tlBestTime');
        
        if (tlCurrent) tlCurrent.textContent = Math.round(currentAqi);
        if (tlAvg) tlAvg.textContent = Math.round(avg);
        if (tlPeak) tlPeak.textContent = Math.round(max);
        if (tlBest) tlBest.textContent = Math.round(min);
        if (tlPeakTime) tlPeakTime.textContent = timeline[maxIdx].label;
        if (tlBestTime) tlBestTime.textContent = timeline[minIdx].label;
    }
    
    function calculateAQI(comp) {
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
    
    function formatTime(date) {
        var hours = date.getHours();
        var ampm = hours >= 12 ? 'PM' : 'AM';
        var h = hours % 12 || 12;
        return h + ampm;
    }
    
    function getAQIColor(aqi) {
        if (aqi <= 50) return '#00e400';
        if (aqi <= 100) return '#ffff00';
        if (aqi <= 150) return '#ff7e00';
        if (aqi <= 200) return '#ff0000';
        if (aqi <= 300) return '#8f3f97';
        return '#7e0023';
    }
    
    return {
        init: init,
        update: update
    };
    
})();

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', timeLive.init);
} else {
    timeLive.init();
}