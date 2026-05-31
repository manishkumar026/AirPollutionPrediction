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

        if (!labels || !labels.length) {
            console.warn('[Charts] No labels for trend chart');
            return;
        }

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
                    borderColor: z.color + '22',
                    borderWidth: 1,
                    borderDash : [4, 4],
                    label      : {
                        display   : true,
                        content   : z.label,
                        position  : 'end',
                        color     : z.color + '88',
                        font      : { size: 8 },
                        backgroundColor: 'transparent'
                    },
                };
            });

            /* NEW: Peak & Low Tagging */
            var maxVal = Math.max.apply(null, values);
            var minVal = Math.min.apply(null, values);
            var maxIdx = values.indexOf(maxVal);
            var minIdx = values.indexOf(minVal);

            annotations['peakTag'] = {
                type: 'label',
                xValue: labels[maxIdx],
                yValue: maxVal,
                backgroundColor: 'rgba(255, 51, 102, 0.9)',
                content: ['▲ PEAK', maxVal],
                color: '#fff',
                font: { size: 10, weight: 'bold' },
                padding: 4,
                borderRadius: 4,
                position: 'top'
            };

            annotations['lowTag'] = {
                type: 'label',
                xValue: labels[minIdx],
                yValue: minVal,
                backgroundColor: 'rgba(0, 255, 136, 0.9)',
                content: ['▼ BEST', minVal],
                color: '#fff',
                font: { size: 10, weight: 'bold' },
                padding: 4,
                borderRadius: 4,
                position: 'bottom'
            };
        }

        trendChart = new Chart(canvas, {
            type : 'line',
            plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [],
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
                    annotation: {
                        annotations: annotations
                    },
                    /* NEW: Custom Plugin to show values over points */
                    datalabels: {
                        display: function(ctx) {
                            return ctx.dataIndex % 2 === 0; // Show every 2nd point to avoid crowding
                        },
                        align: 'top',
                        offset: 4,
                        color: lineColor,
                        font: { size: 10, weight: 'bold' },
                        formatter: function(value) { return value; }
                    },
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
                                    return '24-Hour Trend: ' + val + '  |  ' + getAQILabel(val);
                                }
                                return '24-Hour Trend: ' + val;
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

    /* ============================================================
       COMPARISON CHART - PM2.5 vs PM10 Area Chart
       ============================================================ */
    var compareChart = null;
    function compare(labels, pm25, pm10) {
        var canvas = document.getElementById('compareChart');
        if (!canvas) return;
        
        // Safety: Prevent crash on empty data
        if (!labels || !labels.length) {
            console.warn('[Charts] No labels for comparison chart');
            return;
        }

        if (compareChart) {
            compareChart.destroy();
            compareChart = null;
        }

        var ctx = canvas.getContext('2d');
        
        // Gradients
        var g25 = ctx.createLinearGradient(0, 0, 0, 400);
        g25.addColorStop(0, 'rgba(0, 180, 255, 0.3)');
        g25.addColorStop(1, 'rgba(0, 180, 255, 0)');

        var g10 = ctx.createLinearGradient(0, 0, 0, 400);
        g10.addColorStop(0, 'rgba(0, 255, 136, 0.2)');
        g10.addColorStop(1, 'rgba(0, 255, 136, 0)');

        compareChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'PM2.5',
                        data: pm25,
                        borderColor: '#00b4ff',
                        backgroundColor: g25,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 5
                    },
                    {
                        label: 'PM10',
                        data: pm10,
                        borderColor: '#00ff88',
                        backgroundColor: g10,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: { color: 'rgba(255,255,255,0.7)', usePointStyle: true, boxWidth: 6, font: { size: 10 } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(8,12,25,0.95)',
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: { size: 12 }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, maxTicksLimit: 12 } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } }, beginAtZero: true }
                }
            }
        });
    }

    /* ============================================================
       HEATMAP - Spectral intensity map
       ============================================================ */
    function heatmap(canvasId, data) {
        var canvas = document.getElementById(canvasId);
        if (!canvas) return;

        // Store data for redraw on hover
        canvas._heatmapData = data;

        var ctx = canvas.getContext('2d');
        var w = canvas.width;
        var h = canvas.height;

        // Set up mouse events for interactivity if not already done
        if (!canvas._listenersAttached) {
            canvas.addEventListener('mousemove', function(e) {
                var rect = canvas.getBoundingClientRect();
                var mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
                var mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
                canvas._hoverX = mouseX;
                canvas._hoverY = mouseY;
                heatmap(canvasId, canvas._heatmapData);
            });
            canvas.addEventListener('mouseleave', function() {
                canvas._hoverX = null;
                canvas._hoverY = null;
                heatmap(canvasId, canvas._heatmapData);
            });
            canvas._listenersAttached = true;
        }

        ctx.clearRect(0, 0, w, h);

        if (!data || !data.length) {
            // Fallback data if empty to ensure canvas has content
            data = Array.from({ length: 24 }, function (_, i) {
                var hour = (new Date().getHours() + i) % 24;
                var ampm = hour >= 12 ? 'PM' : 'AM';
                var hour12 = hour % 12 || 12;
                return { 
                    aqi: 30 + Math.random() * 150, 
                    hour_label: hour12 + ' ' + ampm 
                };
            });
        }

        var paddingLeft = 50; // Space for Y-axis labels
        var paddingBottom = 40; // Space for X-axis labels
        var paddingTop = 30; // Space for top padding
        
        var chartWidth = w - paddingLeft - 20;
        var chartHeight = h - paddingBottom - paddingTop;

        var maxAqi = Math.max.apply(null, data.map(function(d) { return d.aqi || 50; })) || 200;
        maxAqi = Math.max(maxAqi, 200); // Scale up to at least 200 to match image style
        
        // --- 1. DRAW BACKGROUND AQI ZONE SHADING ---
        var zones = [
            { yMin: 0,   yMax: 50,  color: 'rgba(0, 228, 0, 0.05)' },
            { yMin: 50,  yMax: 100, color: 'rgba(255, 255, 0, 0.04)' },
            { yMin: 100, yMax: 150, color: 'rgba(255, 126, 0, 0.04)' },
            { yMin: 150, yMax: 200, color: 'rgba(255, 0, 0, 0.04)' },
            { yMin: 200, yMax: maxAqi, color: 'rgba(143, 63, 151, 0.05)' }
        ];

        zones.forEach(function(z) {
            if (z.yMin > maxAqi) return;
            var yStart = paddingTop + chartHeight - (Math.min(z.yMax, maxAqi) / maxAqi) * chartHeight;
            var yEnd = paddingTop + chartHeight - (z.yMin / maxAqi) * chartHeight;
            ctx.fillStyle = z.color;
            ctx.fillRect(paddingLeft, yStart, chartWidth, yEnd - yStart);
        });

        // --- 2. DRAW GRID LINES ---
        var gridLines = [0, 50, 100, 150, 200];
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '10px Space Grotesk, Inter';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        gridLines.forEach(function(val) {
            var y = paddingTop + chartHeight - (val / maxAqi) * chartHeight;
            
            // Draw grid line
            ctx.beginPath();
            ctx.moveTo(paddingLeft, y);
            ctx.lineTo(paddingLeft + chartWidth, y);
            ctx.stroke();
            
            // Draw label
            ctx.fillText(val, paddingLeft - 8, y);
        });

        // --- 3. DRAW BARS ---
        var barWidth = (chartWidth / data.length) - 2; // 2px gap
        if (barWidth < 1) barWidth = 1;

        var hoveredIndex = -1;
        if (canvas._hoverX !== null && canvas._hoverX !== undefined) {
            var relativeX = canvas._hoverX - paddingLeft;
            if (relativeX >= 0 && relativeX < chartWidth) {
                hoveredIndex = Math.floor(relativeX / (chartWidth / data.length));
            }
        }

        data.forEach(function (d, i) {
            var aqi = Math.round(d.aqi || 0);
            
            // Get color from AQI
            var color = '#00e400'; // Good
            if (aqi > 50)  color = '#ffff00'; // Moderate
            if (aqi > 100) color = '#ff7e00'; // USG
            if (aqi > 150) color = '#ff0000'; // Unhealthy
            if (aqi > 200) color = '#8f3f97'; // Very Unhealthy
            if (aqi > 300) color = '#7e0023'; // Hazardous

            var barHeight = (aqi / maxAqi) * chartHeight;
            if (barHeight < 3) barHeight = 3; // Min height

            var x = paddingLeft + i * (chartWidth / data.length);
            var y = paddingTop + chartHeight - barHeight;

            // Draw bar with vertical gradient
            var grad = ctx.createLinearGradient(0, y, 0, paddingTop + chartHeight);
            var isHovered = (i === hoveredIndex);
            
            grad.addColorStop(0.0, color + (isHovered ? 'ff' : 'bb')); // Brighter on hover
            grad.addColorStop(1.0, color + '15'); // Fade out towards bottom

            ctx.fillStyle = grad;
            ctx.fillRect(x, y, barWidth, barHeight);

            // Draw solid glowing cap at the top of the bar
            ctx.fillStyle = color;
            ctx.fillRect(x, y, barWidth, 3);

            // Time Label (every 3 hours)
            if (i % 3 === 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.font = '9px Space Grotesk, Inter';
                ctx.textAlign = 'center';
                ctx.fillText(d.hour_label || '', x + barWidth / 2, h - 15);
            }
        });

        // --- 4. DRAW HOVER LINE AND TOOLTIP ---
        if (hoveredIndex >= 0 && hoveredIndex < data.length) {
            var d = data[hoveredIndex];
            var aqi = Math.round(d.aqi || 0);
            var x = paddingLeft + hoveredIndex * (chartWidth / data.length) + (barWidth / 2);
            var y = paddingTop + chartHeight - ((aqi / maxAqi) * chartHeight);

            // Draw vertical hover indicator line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x, paddingTop);
            ctx.lineTo(x, paddingTop + chartHeight);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw hover bubble on the bar cap
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = getAQIColor(aqi);
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0; // reset shadow

            // Determine status text and color
            var color = getAQIColor(aqi);
            var status = getAQILabel(aqi);

            // Draw floating Tooltip Box
            var tooltipW = 155;
            var tooltipH = 75;
            var tooltipX = x + 15;
            var tooltipY = y - 30;

            // Make sure tooltip doesn't draw off-canvas
            if (tooltipX + tooltipW > w - 10) {
                tooltipX = x - tooltipW - 15;
            }
            if (tooltipY < 10) {
                tooltipY = 10;
            }

            // Draw Tooltip Container
            ctx.fillStyle = 'rgba(10, 15, 30, 0.95)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            
            // Rounded corners for tooltip
            roundRect(ctx, tooltipX, tooltipY, tooltipW, tooltipH, 8, true, true);

            // Draw Tooltip Text
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            
            // 1. Time Label
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = 'bold 9px Space Grotesk, Inter';
            ctx.fillText('🕒 ' + (d.hour_label || ''), tooltipX + 10, tooltipY + 16);

            // 2. AQI Value
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px Space Grotesk, Inter';
            ctx.fillText(aqi, tooltipX + 10, tooltipY + 40);
            
            ctx.fillStyle = color;
            ctx.font = 'bold 9px Space Grotesk, Inter';
            ctx.fillText('AQI', tooltipX + 45, tooltipY + 34);

            // 3. Status Category
            ctx.fillStyle = color;
            ctx.font = 'bold 9px Space Grotesk, Inter';
            
            // Handle long status strings to prevent overflow
            var displayStatus = status;
            if (displayStatus.length > 22) {
                displayStatus = displayStatus.substring(0, 19) + '...';
            }
            ctx.fillText(displayStatus, tooltipX + 10, tooltipY + 58);
            
            // 4. Dominant Pollutant (if available)
            if (d.dominant) {
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.font = '7px Space Grotesk, Inter';
                ctx.fillText('DOMINANT: ' + d.dominant, tooltipX + 10, tooltipY + 68);
            }
        }
    }

    function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
        if (typeof radius === 'number') {
            radius = {tl: radius, tr: radius, br: radius, bl: radius};
        }
        ctx.beginPath();
        ctx.moveTo(x + radius.tl, y);
        ctx.lineTo(x + width - radius.tr, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
        ctx.lineTo(x + width, y + height - radius.br);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
        ctx.lineTo(x + radius.bl, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
        ctx.lineTo(x, y + radius.tl);
        ctx.quadraticCurveTo(x, y, x + radius.tl, y);
        ctx.closePath();
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
    }

    return {
        trend     : trend,
        compare   : compare,
        sparkline : sparkline,
        gauge     : gauge,
        heatmap   : heatmap,
    };

})();

/* ============================================================
   Helpers needed by charts tooltip & heatmap
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

if (typeof getAQIColor === 'undefined') {
    function getAQIColor(aqi) {
        aqi = parseFloat(aqi) || 0;
        if (aqi <=  50) return '#00e400';
        if (aqi <= 100) return '#ffff00';
        if (aqi <= 150) return '#ff7e00';
        if (aqi <= 200) return '#ff0000';
        if (aqi <= 300) return '#8f3f97';
        return '#7e0023';
    }
}