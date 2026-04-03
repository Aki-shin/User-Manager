/* Sync page logic */

let syncData = null;

const FIELD_LABELS = {
    givenname: 'Имя',
    sn: 'Фамилия',
    cn: 'Полное имя',
    telephonenumber: 'Раб. телефон',
    mobile: 'Моб. телефон',
    mail: 'Email',
    title: 'Должность',
    ou: 'Подразделение',
    employeenumber: 'Код',
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('upload-form').addEventListener('submit', uploadFile);
});

async function uploadFile(e) {
    e.preventDefault();
    const fileInput = document.getElementById('xlsx-file');
    if (!fileInput.files.length) {
        showAlert('Выберите файл');
        return;
    }
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    showLoading();
    try {
        syncData = await api('/api/sync/upload', { method: 'POST', body: formData });
        renderSyncResults();
    } catch (e) {
        showAlert('Ошибка обработки: ' + e.message);
    } finally {
        hideLoading();
    }
}

function filterSyncResults() {
    renderSyncResults();
}

function matchesSearch(text, query) {
    return (text || '').toLowerCase().includes(query);
}

function renderSyncResults() {
    document.getElementById('sync-results').style.display = '';
    document.getElementById('sync-search-box').style.display = '';
    document.getElementById('apply-results').style.display = 'none';

    const q = (document.getElementById('sync-search')?.value || '').toLowerCase().trim();

    const filteredUpdates = (syncData.updates || []).filter(u => {
        if (!q) return true;
        if (matchesSearch(u.uid, q) || matchesSearch(u.code, q)) return true;
        return Object.keys(u.changes).some(f =>
            matchesSearch(u.changes[f].old, q) || matchesSearch(u.changes[f].new, q)
        );
    });
    const filteredCreates = (syncData.creates || []).filter(c => {
        if (!q) return true;
        const d = c.data;
        return Object.values(d).some(v => matchesSearch(v, q));
    });
    const filteredDeletes = (syncData.deletes || []).filter(d => {
        if (!q) return true;
        return matchesSearch(d.uid, q) || matchesSearch(d.code, q) ||
               Object.values(d.current).some(v => matchesSearch(v, q));
    });

    const hasUpdates = filteredUpdates.length;
    const hasCreates = filteredCreates.length;
    const hasDeletes = filteredDeletes.length;
    const hasAny = hasUpdates || hasCreates || hasDeletes;

    // Updates
    const updSec = document.getElementById('section-updates');
    updSec.style.display = hasUpdates ? '' : 'none';
    if (hasUpdates) {
        document.getElementById('count-updates').textContent = filteredUpdates.length;
        const tbody = document.getElementById('updates-tbody');
        let html = '';
        filteredUpdates.forEach((u, i) => {
            const idx = syncData.updates.indexOf(u);
            const fields = Object.keys(u.changes);
            fields.forEach((field, fi) => {
                const ch = u.changes[field];
                const first = fi === 0;
                html += `<tr>`;
                if (first) {
                    html += `<td rowspan="${fields.length}"><input type="checkbox" class="chk-update" data-idx="${idx}" checked ${u.locked ? 'disabled' : ''}></td>`;
                    html += `<td rowspan="${fields.length}">${escapeHtml(u.uid)}</td>`;
                    html += `<td rowspan="${fields.length}">${escapeHtml(u.code)}</td>`;
                }
                html += `<td class="diff-field-changed">${FIELD_LABELS[field] || field}</td>`;
                html += `<td class="diff-old">${escapeHtml(ch.old)}</td>`;
                html += `<td class="diff-new">${escapeHtml(ch.new)}</td>`;
                if (first) {
                    html += `<td rowspan="${fields.length}">
                        ${u.locked ? '<i class="bi bi-lock-fill text-danger" title="Заблокирован"></i>' : ''}
                    </td>`;
                }
                html += `</tr>`;
            });
        });
        tbody.innerHTML = html;
    }

    // Creates
    const crSec = document.getElementById('section-creates');
    crSec.style.display = hasCreates ? '' : 'none';
    if (hasCreates) {
        document.getElementById('count-creates').textContent = filteredCreates.length;
        const tbody = document.getElementById('creates-tbody');
        tbody.innerHTML = filteredCreates.map(c => {
            const idx = syncData.creates.indexOf(c);
            const d = c.data;
            return `<tr class="row-create">
                <td><input type="checkbox" class="chk-create" data-idx="${idx}" checked></td>
                <td>${escapeHtml(d.uid)}</td>
                <td>${escapeHtml(d.givenname)}</td>
                <td>${escapeHtml(d.sn)}</td>
                <td>${escapeHtml(d.cn)}</td>
                <td>${escapeHtml(d.mail)}</td>
                <td>${escapeHtml(d.telephonenumber)}</td>
                <td>${escapeHtml(d.title)}</td>
                <td>${escapeHtml(d.ou)}</td>
                <td>${escapeHtml(d.employeenumber)}</td>
                <td><code>${escapeHtml(c.password)}</code></td>
            </tr>`;
        }).join('');
    }

    // Deletes
    const dlSec = document.getElementById('section-deletes');
    dlSec.style.display = hasDeletes ? '' : 'none';
    if (hasDeletes) {
        document.getElementById('count-deletes').textContent = filteredDeletes.length;
        const tbody = document.getElementById('deletes-tbody');
        tbody.innerHTML = filteredDeletes.map(d => {
            const idx = syncData.deletes.indexOf(d);
            return `<tr class="row-delete">
                <td><input type="checkbox" class="chk-delete" data-idx="${idx}" checked ${d.locked ? 'disabled' : ''}></td>
                <td>${escapeHtml(d.uid)}</td>
                <td>${escapeHtml(d.code)}</td>
                <td>${escapeHtml(d.current.cn)}</td>
                <td>${escapeHtml(d.current.mail)}</td>
                <td>${escapeHtml(d.current.title)}</td>
                <td>${d.locked ? '<i class="bi bi-lock-fill text-danger" title="Заблокирован"></i>' : ''}</td>
            </tr>`;
        }).join('');
    }

    document.getElementById('no-changes').style.display = hasAny ? 'none' : '';
    document.getElementById('apply-section').style.display = hasAny ? '' : 'none';
}

// Toggle helpers
function toggleAllUpdates() {
    const chks = document.querySelectorAll('.chk-update:not(:disabled)');
    const allChecked = [...chks].every(c => c.checked);
    chks.forEach(c => c.checked = !allChecked);
}
function toggleAllUpdateCheckboxes(master) {
    document.querySelectorAll('.chk-update:not(:disabled)').forEach(c => c.checked = master.checked);
}
function toggleAllCreates() {
    const chks = document.querySelectorAll('.chk-create');
    const allChecked = [...chks].every(c => c.checked);
    chks.forEach(c => c.checked = !allChecked);
}
function toggleAllCreateCheckboxes(master) {
    document.querySelectorAll('.chk-create').forEach(c => c.checked = master.checked);
}
function toggleAllDeletes() {
    const chks = document.querySelectorAll('.chk-delete:not(:disabled)');
    const allChecked = [...chks].every(c => c.checked);
    chks.forEach(c => c.checked = !allChecked);
}
function toggleAllDeleteCheckboxes(master) {
    document.querySelectorAll('.chk-delete:not(:disabled)').forEach(c => c.checked = master.checked);
}

// Apply sync
async function applySync() {
    if (!confirm('Применить выбранные изменения к FreeIPA?')) return;

    const payload = { updates: [], creates: [], deletes: [] };

    document.querySelectorAll('.chk-update:checked').forEach(chk => {
        const idx = parseInt(chk.dataset.idx);
        payload.updates.push(syncData.updates[idx]);
    });
    document.querySelectorAll('.chk-create:checked').forEach(chk => {
        const idx = parseInt(chk.dataset.idx);
        payload.creates.push(syncData.creates[idx]);
    });
    document.querySelectorAll('.chk-delete:checked').forEach(chk => {
        const idx = parseInt(chk.dataset.idx);
        payload.deletes.push(syncData.deletes[idx]);
    });

    if (!payload.updates.length && !payload.creates.length && !payload.deletes.length) {
        showAlert('Ничего не выбрано', 'warning');
        return;
    }

    showLoading();
    try {
        const result = await api('/api/sync/apply', { method: 'POST', body: payload });
        renderApplyResults(result);
    } catch (e) {
        showAlert('Ошибка применения: ' + e.message);
    } finally {
        hideLoading();
    }
}

function renderApplyResults(result) {
    document.getElementById('apply-results').style.display = '';
    const body = document.getElementById('apply-results-body');
    let html = '';

    if (result.applied && result.applied.length) {
        html += '<h6 class="text-success">Успешно:</h6><ul>';
        result.applied.forEach(a => {
            let desc = `${a.action}: ${a.uid}`;
            if (a.password) desc += ` (пароль: <code>${escapeHtml(a.password)}</code>)`;
            html += `<li>${desc}</li>`;
        });
        html += '</ul>';
    }

    if (result.errors && result.errors.length) {
        html += '<h6 class="text-danger">Ошибки:</h6><ul>';
        result.errors.forEach(e => {
            html += `<li>${e.action}: ${e.uid} — ${escapeHtml(e.error)}</li>`;
        });
        html += '</ul>';
    }

    if ((!result.applied || !result.applied.length) && (!result.errors || !result.errors.length)) {
        html = '<p class="text-muted">Нет операций для выполнения.</p>';
    }

    body.innerHTML = html;
}
