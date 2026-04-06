/* Global helpers */

function showAlert(message, type = 'danger') {
    const container = document.getElementById('alert-container');
    const id = 'alert-' + Date.now();
    container.insertAdjacentHTML('beforeend',
        `<div id="${id}" class="alert alert-${type} alert-dismissible fade show">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>`
    );
    setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.remove();
    }, 8000);
}

function showLoading() {
    if (document.getElementById('loading-overlay')) return;
    document.body.insertAdjacentHTML('beforeend',
        '<div id="loading-overlay" class="loading-overlay"><div class="spinner-border text-primary"></div></div>'
    );
}

function hideLoading() {
    const el = document.getElementById('loading-overlay');
    if (el) el.remove();
}

async function api(url, options) {
    options = options || {};
    var maxRetries = options._retries || 0;
    delete options._retries;

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
        options.body = JSON.stringify(options.body);
    }

    var lastError;
    for (var attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            var resp = await fetch(url, options);
            var data = await resp.json();
            if (!resp.ok || data.error) {
                throw new Error(data.error || data.message || 'HTTP ' + resp.status);
            }
            return data;
        } catch (e) {
            lastError = e;
            if (attempt < maxRetries) {
                await new Promise(function(r) { setTimeout(r, 1000 * (attempt + 1)); });
            }
        }
    }
    throw lastError;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}
