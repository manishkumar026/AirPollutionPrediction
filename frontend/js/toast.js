/* ============================================================
   TOAST.JS - NOTIFICATION SYSTEM
   AirWatch - Air Quality Monitoring Dashboard
   ============================================================ */

'use strict';

/* ============================================================
   TOAST NOTIFICATION
   Usage:
     showToast('Message here');                  // success (default)
     showToast('Something went wrong', 'error'); // error
     showToast('Did you know...', 'info');       // info
   ============================================================ */
function showToast(msg, type) {

    /* Default type */
    type = type || 'success';

    /* Get elements */
    var toast    = document.getElementById('toast');
    var toastMsg = document.getElementById('toastMsg');

    /* Guard: toast container must exist */
    if (!toast || !toastMsg) {
        console.warn('showToast: #toast or #toastMsg element not found.');
        return;
    }

    var icon = toast.querySelector('i');

    /* Set message text */
    toastMsg.textContent = msg;

    /* ---- Apply style by type ---- */
    if (type === 'success') {
        if (icon) {
            icon.className = 'fas fa-check-circle';
            icon.style.color = '#00e676';
        }
        toast.style.borderColor = 'rgba(0,230,118,0.3)';

    } else if (type === 'error') {
        if (icon) {
            icon.className = 'fas fa-exclamation-circle';
            icon.style.color = '#ff1744';
        }
        toast.style.borderColor = 'rgba(255,23,68,0.3)';

    } else {
        /* Info (default fallback) */
        if (icon) {
            icon.className = 'fas fa-info-circle';
            icon.style.color = '#00d4ff';
        }
        toast.style.borderColor = 'rgba(0,212,255,0.3)';
    }

    /* ---- Show toast (slide in) ---- */
    toast.style.transform = 'translateX(0)';

    /* ---- Auto hide after 3 seconds ---- */
    setTimeout(function () {
        toast.style.transform = 'translateX(200px)';
    }, 3000);
}