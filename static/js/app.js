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

async function api(url, options = {}) {
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        options.headers = { 'Content-Type': 'application/json', ...options.headers };
        options.body = JSON.stringify(options.body);
    }
    const resp = await fetch(url, options);
    const data = await resp.json();
    if (!resp.ok || data.error) {
        throw new Error(data.error || data.message || `HTTP ${resp.status}`);
    }
    return data;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}
