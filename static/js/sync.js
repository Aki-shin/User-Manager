/* Sync page logic */

var syncData = null;

// Checked state stored separately so search doesn't reset it
// Keys: 'update_<idx>', 'create_<idx>', 'delete_<idx>'
var checkedState = {};

var FIELD_LABELS = {
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

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('upload-form').addEventListener('submit', uploadFile);
});

async function uploadFile(e) {
    e.preventDefault();
    var fileInput = document.getElementById('xlsx-file');
    if (!fileInput.files.length) {
        showAlert('Выберите файл');
        return;
    }
    var formData = new FormData();
    formData.append('file', fileInput.files[0]);

    showLoading();
    try {
        syncData = await api('/api/sync/upload', { method: 'POST', body: formData });
        initCheckedState();
        renderSyncResults();
    } catch (err) {
        showAlert('Ошибка обработки: ' + err.message);
    } finally {
        hideLoading();
    }
}

function initCheckedState() {
    checkedState = {};
    var i;
    for (i = 0; i < (syncData.updates || []).length; i++) {
        var key = 'update_' + i;
        checkedState[key] = !syncData.updates[i].locked;
    }
    for (i = 0; i < (syncData.creates || []).length; i++) {
        checkedState['create_' + i] = true;
    }
    for (i = 0; i < (syncData.deletes || []).length; i++) {
        var dkey = 'delete_' + i;
        checkedState[dkey] = !syncData.deletes[i].locked;
    }
}

function filterSyncResults() {
    renderSyncResults();
}

function matchesSearch(text, query) {
    return (text || '').toLowerCase().indexOf(query) !== -1;
}

function getSearchQuery() {
    var el = document.getElementById('sync-search');
    return el ? el.value.toLowerCase().trim() : '';
}

// Save checkbox state from DOM before re-render
function saveCheckboxState() {
    document.querySelectorAll('input[data-check-key]').forEach(function(el) {
        checkedState[el.dataset.checkKey] = el.checked;
    });
}

function countChecked(prefix, total) {
    var count = 0;
    for (var i = 0; i < total; i++) {
        if (checkedState[prefix + '_' + i]) count++;
    }
    return count;
}

function updateSelectionCounters() {
    var updCount = countChecked('update', (syncData.updates || []).length);
    var crCount = countChecked('create', (syncData.creates || []).length);
    var dlCount = countChecked('delete', (syncData.deletes || []).length);
    var total = updCount + crCount + dlCount;

    var selUpd = document.getElementById('sel-updates');
    var selCr = document.getElementById('sel-creates');
    var selDl = document.getElementById('sel-deletes');
    var selTotal = document.getElementById('sel-total');

    if (selUpd) selUpd.textContent = '(выбрано: ' + updCount + ')';
    if (selCr) selCr.textContent = '(выбрано: ' + crCount + ')';
    if (selDl) selDl.textContent = '(выбрано: ' + dlCount + ')';
    if (selTotal) selTotal.textContent = 'Всего выбрано для синхронизации: ' + total;
}

function onCheckboxChange(el) {
    checkedState[el.dataset.checkKey] = el.checked;
    updateSelectionCounters();
}

function renderSyncResults() {
    // Save current checkbox state before re-rendering
    saveCheckboxState();

    document.getElementById('sync-results').style.display = '';
    document.getElementById('sync-search-box').style.display = '';
    document.getElementById('apply-results').style.display = 'none';

    var q = getSearchQuery();

    var filteredUpdates = [];
    var filteredUpdateIndices = [];
    (syncData.updates || []).forEach(function(u, i) {
        if (!q) { filteredUpdates.push(u); filteredUpdateIndices.push(i); return; }
        if (matchesSearch(u.uid, q) || matchesSearch(u.code, q)) {
            filteredUpdates.push(u); filteredUpdateIndices.push(i); return;
        }
        var matched = Object.keys(u.changes).some(function(f) {
            return matchesSearch(u.changes[f].old, q) || matchesSearch(u.changes[f].new, q);
        });
        if (matched) { filteredUpdates.push(u); filteredUpdateIndices.push(i); }
    });

    var filteredCreates = [];
    var filteredCreateIndices = [];
    (syncData.creates || []).forEach(function(c, i) {
        if (!q) { filteredCreates.push(c); filteredCreateIndices.push(i); return; }
        var matched = Object.values(c.data).some(function(v) { return matchesSearch(v, q); });
        if (matched) { filteredCreates.push(c); filteredCreateIndices.push(i); }
    });

    var filteredDeletes = [];
    var filteredDeleteIndices = [];
    (syncData.deletes || []).forEach(function(d, i) {
        if (!q) { filteredDeletes.push(d); filteredDeleteIndices.push(i); return; }
        if (matchesSearch(d.uid, q) || matchesSearch(d.code, q) ||
            Object.values(d.current).some(function(v) { return matchesSearch(v, q); })) {
            filteredDeletes.push(d); filteredDeleteIndices.push(i);
        }
    });

    var hasUpdates = filteredUpdates.length;
    var hasCreates = filteredCreates.length;
    var hasDeletes = filteredDeletes.length;
    var totalAll = (syncData.updates || []).length + (syncData.creates || []).length + (syncData.deletes || []).length;
    var hasAny = totalAll > 0;

    // Updates
    var updSec = document.getElementById('section-updates');
    updSec.style.display = hasUpdates ? '' : 'none';
    if (hasUpdates) {
        document.getElementById('count-updates').textContent = (syncData.updates || []).length;
        var tbody = document.getElementById('updates-tbody');
        var html = '';
        filteredUpdates.forEach(function(u, fi) {
            var idx = filteredUpdateIndices[fi];
            var checkKey = 'update_' + idx;
            var isChecked = checkedState[checkKey];
            var fields = Object.keys(u.changes);
            fields.forEach(function(field, fieldIdx) {
                var ch = u.changes[field];
                var first = fieldIdx === 0;
                html += '<tr>';
                if (first) {
                    html += '<td rowspan="' + fields.length + '"><input type="checkbox" data-check-key="' + checkKey + '" onchange="onCheckboxChange(this)" ' + (isChecked ? 'checked' : '') + ' ' + (u.locked ? 'disabled' : '') + '></td>';
                    html += '<td rowspan="' + fields.length + '">' + escapeHtml(u.uid) + '</td>';
                    html += '<td rowspan="' + fields.length + '">' + escapeHtml(u.code) + '</td>';
                }
                html += '<td class="diff-field-changed">' + (FIELD_LABELS[field] || field) + '</td>';
                html += '<td class="diff-old">' + escapeHtml(ch.old) + '</td>';
                html += '<td class="diff-new">' + escapeHtml(ch.new) + '</td>';
                if (first) {
                    html += '<td rowspan="' + fields.length + '">' +
                        (u.locked ? '<i class="bi bi-lock-fill text-danger" title="Заблокирован"></i>' : '') +
                    '</td>';
                }
                html += '</tr>';
            });
        });
        tbody.innerHTML = html;
    }

    // Creates
    var crSec = document.getElementById('section-creates');
    crSec.style.display = hasCreates ? '' : 'none';
    if (hasCreates) {
        document.getElementById('count-creates').textContent = (syncData.creates || []).length;
        var ctbody = document.getElementById('creates-tbody');
        ctbody.innerHTML = filteredCreates.map(function(c, fi) {
            var cidx = filteredCreateIndices[fi];
            var checkKey = 'create_' + cidx;
            var isChecked = checkedState[checkKey];
            var d = c.data;
            return '<tr class="row-create">' +
                '<td><input type="checkbox" data-check-key="' + checkKey + '" onchange="onCheckboxChange(this)" ' + (isChecked ? 'checked' : '') + '></td>' +
                '<td>' + escapeHtml(d.uid) + '</td>' +
                '<td>' + escapeHtml(d.givenname) + '</td>' +
                '<td>' + escapeHtml(d.sn) + '</td>' +
                '<td>' + escapeHtml(d.cn) + '</td>' +
                '<td>' + escapeHtml(d.mail) + '</td>' +
                '<td>' + escapeHtml(d.telephonenumber) + '</td>' +
                '<td>' + escapeHtml(d.title) + '</td>' +
                '<td>' + escapeHtml(d.ou) + '</td>' +
                '<td>' + escapeHtml(d.employeenumber) + '</td>' +
                '<td><code>' + escapeHtml(c.password) + '</code></td>' +
            '</tr>';
        }).join('');
    }

    // Deletes
    var dlSec = document.getElementById('section-deletes');
    dlSec.style.display = hasDeletes ? '' : 'none';
    if (hasDeletes) {
        document.getElementById('count-deletes').textContent = (syncData.deletes || []).length;
        var dtbody = document.getElementById('deletes-tbody');
        dtbody.innerHTML = filteredDeletes.map(function(d, fi) {
            var didx = filteredDeleteIndices[fi];
            var checkKey = 'delete_' + didx;
            var isChecked = checkedState[checkKey];
            return '<tr class="row-delete">' +
                '<td><input type="checkbox" data-check-key="' + checkKey + '" onchange="onCheckboxChange(this)" ' + (isChecked ? 'checked' : '') + ' ' + (d.locked ? 'disabled' : '') + '></td>' +
                '<td>' + escapeHtml(d.uid) + '</td>' +
                '<td>' + escapeHtml(d.code) + '</td>' +
                '<td>' + escapeHtml(d.current.cn) + '</td>' +
                '<td>' + escapeHtml(d.current.mail) + '</td>' +
                '<td>' + escapeHtml(d.current.title) + '</td>' +
                '<td>' + (d.locked ? '<i class="bi bi-lock-fill text-danger" title="Заблокирован"></i>' : '') + '</td>' +
            '</tr>';
        }).join('');
    }

    document.getElementById('no-changes').style.display = hasAny ? 'none' : '';
    document.getElementById('apply-section').style.display = hasAny ? '' : 'none';

    updateSelectionCounters();
}

// Toggle helpers — operate on ALL items, not just visible
function toggleAllUpdates() {
    if (!syncData) return;
    saveCheckboxState();
    var total = (syncData.updates || []).length;
    var checkedCount = countChecked('update', total);
    var setTo = checkedCount < total;
    for (var i = 0; i < total; i++) {
        if (!syncData.updates[i].locked) {
            checkedState['update_' + i] = setTo;
        }
    }
    renderSyncResults();
}
function toggleAllUpdatesCheckbox(el) {
    if (!syncData) return;
    var total = (syncData.updates || []).length;
    for (var i = 0; i < total; i++) {
        if (!syncData.updates[i].locked) {
            checkedState['update_' + i] = el.checked;
        }
    }
    renderSyncResults();
}

function toggleAllCreates() {
    if (!syncData) return;
    saveCheckboxState();
    var total = (syncData.creates || []).length;
    var checkedCount = countChecked('create', total);
    var setTo = checkedCount < total;
    for (var i = 0; i < total; i++) {
        checkedState['create_' + i] = setTo;
    }
    renderSyncResults();
}
function toggleAllCreatesCheckbox(el) {
    if (!syncData) return;
    var total = (syncData.creates || []).length;
    for (var i = 0; i < total; i++) {
        checkedState['create_' + i] = el.checked;
    }
    renderSyncResults();
}

function toggleAllDeletes() {
    if (!syncData) return;
    saveCheckboxState();
    var total = (syncData.deletes || []).length;
    var checkedCount = countChecked('delete', total);
    var setTo = checkedCount < total;
    for (var i = 0; i < total; i++) {
        if (!syncData.deletes[i].locked) {
            checkedState['delete_' + i] = setTo;
        }
    }
    renderSyncResults();
}
function toggleAllDeletesCheckbox(el) {
    if (!syncData) return;
    var total = (syncData.deletes || []).length;
    for (var i = 0; i < total; i++) {
        if (!syncData.deletes[i].locked) {
            checkedState['delete_' + i] = el.checked;
        }
    }
    renderSyncResults();
}

// Apply sync — uses checkedState, sends ALL selected (not just filtered)
async function applySync() {
    if (!confirm('Применить выбранные изменения к FreeIPA?')) return;

    var payload = { updates: [], creates: [], deletes: [] };
    var i;

    for (i = 0; i < (syncData.updates || []).length; i++) {
        if (checkedState['update_' + i]) {
            payload.updates.push(syncData.updates[i]);
        }
    }
    for (i = 0; i < (syncData.creates || []).length; i++) {
        if (checkedState['create_' + i]) {
            payload.creates.push(syncData.creates[i]);
        }
    }
    for (i = 0; i < (syncData.deletes || []).length; i++) {
        if (checkedState['delete_' + i]) {
            payload.deletes.push(syncData.deletes[i]);
        }
    }

    if (!payload.updates.length && !payload.creates.length && !payload.deletes.length) {
        showAlert('Ничего не выбрано', 'warning');
        return;
    }

    showLoading();
    try {
        var result = await api('/api/sync/apply', { method: 'POST', body: payload });
        renderApplyResults(result);
    } catch (err) {
        showAlert('Ошибка применения: ' + err.message);
    } finally {
        hideLoading();
    }
}

function renderApplyResults(result) {
    document.getElementById('apply-results').style.display = '';
    var body = document.getElementById('apply-results-body');
    var html = '';

    if (result.applied && result.applied.length) {
        html += '<h6 class="text-success">Успешно:</h6><ul>';
        result.applied.forEach(function(a) {
            var desc = a.action + ': ' + a.uid;
            if (a.password) desc += ' (пароль: <code>' + escapeHtml(a.password) + '</code>)';
            html += '<li>' + desc + '</li>';
        });
        html += '</ul>';
    }

    if (result.errors && result.errors.length) {
        html += '<h6 class="text-danger">Ошибки:</h6><ul>';
        result.errors.forEach(function(e) {
            html += '<li>' + e.action + ': ' + e.uid + ' — ' + escapeHtml(e.error) + '</li>';
        });
        html += '</ul>';
    }

    if ((!result.applied || !result.applied.length) && (!result.errors || !result.errors.length)) {
        html = '<p class="text-muted">Нет операций для выполнения.</p>';
    }

    body.innerHTML = html;
}
