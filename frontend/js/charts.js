/* ============================================================
   CHARTS.JS - AirWatch Pro - Enhanced
   ============================================================ */

'use strict';

var charts = (function () {

    var trendChart = null;

    /* ============================================================
       TREND CHART - Main forecast chart
       ============================================================ */
    function trend(labels, values, label, lineColor) {
        var canvas = document.getElementById('trendChart');
        if (!canvas) return;

        lineColor = lineColor || '#00b4ff';

        /* Destroy existing */
        if (trendChart) {
            trendChart.destroy();
            trendChart = null;
        }

        /* Dynamic gradient fill */
        var ctx  = canvas.getContext('2d');
        var grad = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight || 300);
        grad.addColorStop(0.0, lineColor + '55');
        grad.addColorStop(0.6, lineColor + '11');
        grad.addColorStop(1.0, lineColor + '00');

        /* AQI zone lines */
        var annotations = {};
        if (label.includes('AQI')) {
            var zones = [
                { y: 50,  label: 'Good',      color: '#00e400' },
                { y: 100, label: 'Moderate',  color: '#ffff00' },
                { y: 150, label: 'Unhealthy+',color: '#ff7e00' },
                { y: 200, label: 'Unhealthy', color: '#ff0000' },
                { y: 300, label: 'Very Unhealthy', color: '#8f3f97' },
            ];

            zones.forEach(function(z, i) {
                annotations['zone' + i] = {
                    type       : 'line',
                    yMin       : z.y,
                    yMax       : z.y,
                    borderColor: z.color + '44',
                    borderWidth: 1,
                    borderDash : [4, 4],
                    label      : {
                        display   : true,
                        content   : z.label,
                        position  : 'end',
                        color     : z.color + 'aa',
                        font      : { size: 9 },
                        backgroundColor: 'transparent',
                        padding   : 2,
                    },
                };
            });
        }

        trendChart = new Chart(canvas, {
            type : 'line',
            data : {
                labels   : labels,
                datasets : [{
                    label           : label,
                    data            : values,
                    borderColor     : lineColor,
                    backgroundColor : grad,
                    borderWidth     : 2.5,
                    tension         : 0.4,
                    fill            : true,
                    pointRadius     : 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: lineColor,
                    pointHoverBorderColor    : '#fff',
                    pointHoverBorderWidth    : 2,
                }],
            },
            options: {
                responsive          : true,
                maintainAspectRatio : false,
                interaction         : { mode: 'index', intersect: false },
                animation           : { duration: 1000, easing: 'easeInOutQuart' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor  : 'rgba(8,12,25,0.95)',
                        titleColor       : 'rgba(255,255,255,0.9)',
                        bodyColor        : lineColor,
                        borderColor      : lineColor + '44',
                        borderWidth      : 1,
                        padding          : 12,
                        cornerRadius     : 8,
                        displayColors    : false,
                        callbacks: {
                            title : function(ctx) { return '🕒 ' + ctx[0].label; },
                            label : function(ctx) {
                                var val = ctx.raw;
                                if (label.includes('AQI')) {
                                    return 'AQI: ' + val + '  |  ' + getAQILabel(val);
                                }
                                return label + ': ' + val;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        grid  : { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                        ticks : {
                            color      : 'rgba(255,255,255,0.4)',
                            font       : { size: 10 },
                            maxTicksLimit: 8,
                            maxRotation : 0,
                        },
                    },
                    y: {
                        grid       : { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                        ticks      : {
                            color : 'rgba(255,255,255,0.5)',
                            font  : { size: 10 },
                            callback: function(v) {
                                return label.includes('AQI') ? v : v.toFixed(0);
                            },
                        },
                        beginAtZero: true,
                    },
                },
            },
        });
    }

    /* ============================================================
       MINI SPARKLINE - For small stat displays
       ============================================================ */
    function sparkline(canvasId, values, color) {
        var canvas = document.getElementById(canvasId);
        if (!canvas) return;
        if (canvas._sparkChart) canvas._sparkChart.destroy();

        color = color || '#00b4ff';

        canvas._sparkChart = new Chart(canvas, {
            type : 'line',
            data : {
                labels   : values.map(function(_, i) { return i; }),
                datasets : [{
                    data            : values,
                    borderColor     : color,
                    backgroundColor : color + '22',
                    borderWidth     : 1.5,
                    tension         : 0.4,
                    fill            : true,
                    pointRadius     : 0,
                }],
            },
            options: {
                responsive          : true,
                maintainAspectRatio : false,
                animation           : false,
                plugins             : { legend: { display: false }, tooltip: { enabled: false } },
                scales              : {
                    x: { display: false },
                    y: { display: false, beginAtZero: true },
                },
            },
        });
    }

    /* ============================================================
       AQI GAUGE - Doughnut style
       ============================================================ */
    function gauge(canvasId, aqi) {
        var canvas = document.getElementById(canvasId);
        if (!canvas) return;
        if (canvas._gaugeChart) canvas._gaugeChart.destroy();

        var color = typeof getAQIColor !== 'undefined' ? getAQIColor(aqi) : '#00b4ff';
        var pct   = Math.min(aqi / 500, 1);

        canvas._gaugeChart = new Chart(canvas, {
            type : 'doughnut',
            data : {
                datasets : [{
                    data            : [pct, 1 - pct],
                    backgroundColor : [color, 'rgba(255,255,255,0.05)'],
                    borderWidth     : 0,
                    circumference   : 180,
                    rotation        : 270,
                }],
            },
            options: {
                responsive          : true,
                maintainAspectRatio : false,
                cutout              : '75%',
                animation           : { duration: 1200, easing: 'easeInOutQuart' },
                plugins             : { legend: { display: false }, tooltip: { enabled: false } },
            },
        });
    }

    return {
        trend     : trend,
        sparkline : sparkline,
        gauge     : gauge,
    };

})();

/* ============================================================
   Helper needed by charts tooltip
   ============================================================ */
if (typeof getAQILabel === 'undefined') {
    function getAQILabel(aqi) {
        aqi = parseFloat(aqi) || 0;
        if (aqi <= 50)  return 'Good';
        if (aqi <= 100) return 'Moderate';
        if (aqi <= 150) return 'Unhealthy for Sensitive';
        if (aqi <= 200) return 'Unhealthy';
        if (aqi <= 300) return 'Very Unhealthy';
        return 'Hazardous';
    }
}