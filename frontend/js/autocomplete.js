/* ============================================================
   AUTOCOMPLETE.JS - Enhanced City Search
   ============================================================ */

'use strict';

var autocomplete = (function() {
    
    var timeout = null;
    var selectedIndex = -1;
    
    function init() {
        var input = document.getElementById('citySearch');
        var dropdown = document.getElementById('acDrop');
        
        if (!input || !dropdown) return;
        
        input.addEventListener('input', function(e) {
            clearTimeout(timeout);
            var query = e.target.value.trim();
            selectedIndex = -1;
            
            if (query.length < 1) {
                dropdown.innerHTML = '';
                dropdown.classList.remove('show');
                return;
            }
            
            timeout = setTimeout(function() {
                search(query);
            }, 300);
        });
        
        input.addEventListener('focus', function() {
            if (input.value.trim().length >= 1) {
                search(input.value.trim());
            }
        });
        
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.search-wrap')) {
                dropdown.classList.remove('show');
            }
        });
        
        input.addEventListener('keydown', function(e) {
            var items = dropdown.querySelectorAll('.ac-item:not(.no-result)');
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                updateSelection(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, -1);
                updateSelection(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedIndex >= 0 && items[selectedIndex]) {
                    items[selectedIndex].click();
                } else {
                    doSearch();
                }
            } else if (e.key === 'Escape') {
                dropdown.classList.remove('show');
                input.blur();
            }
        });
    }
    
    function updateSelection(items) {
        items.forEach(function(item, index) {
            if (index === selectedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                item.classList.remove('selected');
            }
        });
    }
    
    async function search(query) {
        var dropdown = document.getElementById('acDrop');
        if (!dropdown) return;
        
        try {
            var results = await api.searchCities(query);
            
            if (!results || results.length === 0) {
                dropdown.innerHTML = 
                    '<div class="ac-item no-result">' +
                    '<i class="fas fa-search"></i>' +
                    '<div><div class="ac-name">No cities found</div>' +
                    '<div class="ac-country">Press Enter to search "' + query + '"</div></div>' +
                    '</div>';
                dropdown.classList.add('show');
                return;
            }
            
            var html = '<div class="ac-items-container">';
            
            results.forEach(function(city) {
                var sub = [city.state, city.country].filter(Boolean).join(', ');
                html += '<div class="ac-item" onclick="selectCity(\'' 
                    + city.name.replace(/'/g, "\\'") + '\', ' + city.lat + ', ' + city.lon + ')">';
                html += '<div>';
                html += '<div class="ac-name">' + city.name + '</div>';
                html += '<div class="ac-country">' + (sub || city.country || '') + '</div>';
                html += '</div>';
                html += '</div>';
            });
            
            html += '</div>';
            
            dropdown.innerHTML = html;
            dropdown.classList.add('show');
            selectedIndex = -1;
            
        } catch (err) {
            console.warn('[Autocomplete] Search error:', err);
        }
    }
    
    return {
        init: init
    };
    
})();

// Global function for onclick
function selectCity(name, lat, lon) {
    var input = document.getElementById('citySearch');
    var dropdown = document.getElementById('acDrop');
    
    if (input) input.value = name;
    if (dropdown) dropdown.classList.remove('show');
    
    // Update global coordinates and reload dashboard
    LAT = parseFloat(lat);
    LON = parseFloat(lon);
    
    toast('📍 Loading data for ' + name + '...', 'info');
    loadAll();
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autocomplete.init);
} else {
    autocomplete.init();
}