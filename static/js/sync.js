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

function renderSyncResults(skipSaveState) {
    // Save current checkbox state before re-rendering (only from search/filter)
    if (!skipSaveState) saveCheckboxState();

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
    renderSyncResults(true);
}
function toggleAllUpdatesCheckbox(el) {
    if (!syncData) return;
    saveCheckboxState();
    var total = (syncData.updates || []).length;
    for (var i = 0; i < total; i++) {
        if (!syncData.updates[i].locked) {
            checkedState['update_' + i] = el.checked;
        }
    }
    renderSyncResults(true);
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
    renderSyncResults(true);
}
function toggleAllCreatesCheckbox(el) {
    if (!syncData) return;
    saveCheckboxState();
    var total = (syncData.creates || []).length;
    for (var i = 0; i < total; i++) {
        checkedState['create_' + i] = el.checked;
    }
    renderSyncResults(true);
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
    renderSyncResults(true);
}
function toggleAllDeletesCheckbox(el) {
    if (!syncData) return;
    saveCheckboxState();
    var total = (syncData.deletes || []).length;
    for (var i = 0; i < total; i++) {
        if (!syncData.deletes[i].locked) {
            checkedState['delete_' + i] = el.checked;
        }
    }
    renderSyncResults(true);
}

// Apply sync — uses checkedState, sends ALL selected in batches with progress
var BATCH_SIZE = 10;

function collectSelectedOperations() {
    var ops = [];
    var i;
    for (i = 0; i < (syncData.updates || []).length; i++) {
        if (checkedState['update_' + i]) {
            ops.push({ type: 'update', item: syncData.updates[i] });
        }
    }
    for (i = 0; i < (syncData.creates || []).length; i++) {
        if (checkedState['create_' + i]) {
            ops.push({ type: 'create', item: syncData.creates[i] });
        }
    }
    for (i = 0; i < (syncData.deletes || []).length; i++) {
        if (checkedState['delete_' + i]) {
            ops.push({ type: 'delete', item: syncData.deletes[i] });
        }
    }
    return ops;
}

function updateProgress(done, total, label) {
    var pct = total > 0 ? Math.round(done / total * 100) : 0;
    var bar = document.getElementById('progress-bar');
    var pctEl = document.getElementById('progress-percent');
    var labelEl = document.getElementById('progress-label');
    var detailEl = document.getElementById('progress-detail');
    if (bar) bar.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
    if (labelEl) labelEl.textContent = label || '';
    if (detailEl) detailEl.textContent = done + ' / ' + total + ' операций';
}

function buildBatchPayload(ops) {
    var payload = { updates: [], creates: [], deletes: [] };
    for (var i = 0; i < ops.length; i++) {
        var op = ops[i];
        if (op.type === 'update') payload.updates.push(op.item);
        else if (op.type === 'create') payload.creates.push(op.item);
        else if (op.type === 'delete') payload.deletes.push(op.item);
    }
    return payload;
}

function uidsFromOps(ops, type) {
    var out = [];
    for (var i = 0; i < ops.length; i++) {
        if (ops[i].type !== type) continue;
        var it = ops[i].item;
        var uid = it.uid || (it.data && it.data.uid);
        if (uid) out.push(uid);
    }
    return out;
}

async function applySync() {
    if (!confirm('Применить выбранные изменения к FreeIPA?')) return;

    var allOps = collectSelectedOperations();
    if (!allOps.length) {
        showAlert('Ничего не выбрано', 'warning');
        return;
    }

    // Split into batches
    var batches = [];
    for (var i = 0; i < allOps.length; i += BATCH_SIZE) {
        batches.push(allOps.slice(i, i + BATCH_SIZE));
    }

    var totalOps = allOps.length;
    var doneOps = 0;
    var allApplied = [];
    var allErrors = [];
    var aggMailQueued = 0;
    var aggMailQueueTotal = 0;
    var glpiResult = null;
    var glpiError = null;

    // Pre-compute aggregates so the final batch can hand them to backend
    var allCreatedUids = uidsFromOps(allOps, 'create');
    var allUpdatedUids = uidsFromOps(allOps, 'update');
    var allDeletedUids = uidsFromOps(allOps, 'delete');

    // Pre-compute whether GLPI sync phase will run
    var willRunGlpi = window.GLPI_AUTO_SYNC &&
        (allCreatedUids.length + allUpdatedUids.length + allDeletedUids.length) > 0;
    var phasePrefix = willRunGlpi ? 'Шаг 1/2: ' : '';

    // Show progress, hide apply button
    document.getElementById('sync-progress').style.display = '';
    document.getElementById('apply-results').style.display = 'none';
    document.getElementById('apply-section').style.display = 'none';
    updateProgress(0, totalOps, phasePrefix + 'Отправка пакета 1 из ' + batches.length + '...');

    for (var b = 0; b < batches.length; b++) {
        var batch = batches[b];
        var payload = buildBatchPayload(batch);

        updateProgress(doneOps, totalOps, phasePrefix + 'Пакет ' + (b + 1) + ' из ' + batches.length + '...');

        try {
            var result = await api('/api/sync/apply', { method: 'POST', body: payload });
            if (result.applied) allApplied = allApplied.concat(result.applied);
            if (result.errors) allErrors = allErrors.concat(result.errors);
            if (typeof result.mail_queued === 'number') aggMailQueued += result.mail_queued;
            if (typeof result.mail_queue_total === 'number') aggMailQueueTotal = result.mail_queue_total;
        } catch (err) {
            // Mark all ops in this batch as errors
            for (var j = 0; j < batch.length; j++) {
                allErrors.push({
                    action: batch[j].type,
                    uid: batch[j].item.uid || (batch[j].item.data && batch[j].item.data.uid) || '?',
                    error: err.message,
                });
            }
        }

        doneOps += batch.length;
        updateProgress(doneOps, totalOps, phasePrefix + 'Пакет ' + (b + 1) + ' из ' + batches.length + ' — готово');
    }

    // Batches done
    updateProgress(totalOps, totalOps, willRunGlpi ? 'Шаг 1/2: Все пакеты применены' : 'Завершено');

    // GLPI step — separate phase, only if auto-sync enabled and something changed
    var hasChanges = allCreatedUids.length + allUpdatedUids.length + allDeletedUids.length;
    if (window.GLPI_AUTO_SYNC && hasChanges) {
        var bar = document.getElementById('progress-bar');
        var pctEl = document.getElementById('progress-percent');
        var labelEl = document.getElementById('progress-label');
        var detailEl = document.getElementById('progress-detail');
        if (bar) bar.style.width = '100%';
        if (pctEl) pctEl.textContent = '⏳';
        if (labelEl) labelEl.textContent = 'Шаг 2/2: Запуск LDAP-синхронизации GLPI...';
        if (detailEl) detailEl.textContent = 'CLI-команда на сервере GLPI (может занять минуту)';

        try {
            glpiResult = await api('/api/glpi/sync', {
                method: 'POST',
                body: {
                    created: allCreatedUids,
                    updated: allUpdatedUids,
                    deleted: allDeletedUids,
                },
            });
        } catch (err) {
            glpiError = err.message;
        }

        if (labelEl) labelEl.textContent = 'LDAP-синхронизация GLPI завершена';
        if (pctEl) pctEl.textContent = '100%';
    }

    // All done
    document.getElementById('sync-progress').style.display = 'none';
    document.getElementById('apply-section').style.display = '';

    renderApplyResults({
        applied: allApplied,
        errors: allErrors,
        mail_queued: aggMailQueued,
        mail_queue_total: aggMailQueueTotal,
        glpi: glpiResult,
        glpi_error: glpiError,
    });
}

function renderApplyResults(result) {
    document.getElementById('apply-results').style.display = '';
    var body = document.getElementById('apply-results-body');
    var html = '';

    if (result.applied && result.applied.length) {
        html += '<h6 class="text-success"><i class="bi bi-check-circle me-1"></i>FreeIPA — успешно (' + result.applied.length + '):</h6><ul>';
        result.applied.forEach(function(a) {
            var desc = a.action + ': ' + a.uid;
            if (a.password) desc += ' (пароль: <code>' + escapeHtml(a.password) + '</code>)';
            html += '<li>' + desc + '</li>';
        });
        html += '</ul>';
    }

    if (result.errors && result.errors.length) {
        html += '<h6 class="text-danger"><i class="bi bi-x-circle me-1"></i>FreeIPA — ошибки (' + result.errors.length + '):</h6><ul>';
        result.errors.forEach(function(e) {
            html += '<li>' + e.action + ': ' + escapeHtml(e.uid) + ' — ' + escapeHtml(e.error) + '</li>';
        });
        html += '</ul>';
    }

    // Mail queue summary
    if (result.mail_queued) {
        html += '<div class="alert alert-info py-2 mb-2">' +
            '<i class="bi bi-envelope me-1"></i>' +
            'В очередь отправки добавлено писем: <strong>' + result.mail_queued + '</strong>' +
            (result.mail_queue_total ? ' (всего в очереди: ' + result.mail_queue_total + ')' : '') +
            '. Письма уходят с интервалом, заданным в настройках.' +
        '</div>';
    }

    // GLPI summary
    if (result.glpi || result.glpi_error) {
        var gHtml = '';
        var g = result.glpi;
        if (g) {
            var p = g.parsed || {};
            var summary = [];
            if ('imported' in p) summary.push('импортировано: <strong>' + p.imported + '</strong>');
            if ('synced' in p) summary.push('синхронизировано: <strong>' + p.synced + '</strong>');
            if ('deleted' in p) summary.push('удалено: <strong>' + p.deleted + '</strong>');
            if ('restored' in p) summary.push('восстановлено: <strong>' + p.restored + '</strong>');

            var affectedIpa = (g.created_in_ipa || []).length +
                              (g.updated_in_ipa || []).length +
                              (g.deleted_in_ipa || []).length;
            gHtml += '<div class="small text-muted">Затронуто uid в FreeIPA: <strong>' + affectedIpa + '</strong></div>';

            if (summary.length) {
                gHtml += '<div class="small">GLPI: ' + summary.join(', ') + '</div>';
            }

            if (typeof g.exit_code === 'number') {
                var cls = (g.exit_code === 0) ? 'text-success' : 'text-danger';
                gHtml += '<div class="small ' + cls + '">CLI exit code: ' + g.exit_code + '</div>';
            }

            if (g.command) {
                gHtml += '<details class="small mt-1"><summary>Команда</summary><pre class="mb-0" style="white-space:pre-wrap;font-size:0.8rem">' + escapeHtml(g.command) + '</pre></details>';
            }
            if (g.stdout) {
                gHtml += '<details class="small mt-1"><summary>stdout</summary><pre class="mb-0" style="white-space:pre-wrap;font-size:0.8rem;max-height:300px;overflow:auto">' + escapeHtml(g.stdout) + '</pre></details>';
            }
            if (g.stderr) {
                gHtml += '<details class="small mt-1"><summary>stderr</summary><pre class="mb-0" style="white-space:pre-wrap;font-size:0.8rem;max-height:200px;overflow:auto">' + escapeHtml(g.stderr) + '</pre></details>';
            }
            if (g.errors && g.errors.length) {
                gHtml += '<div class="text-danger small mt-2">Ошибки (' + g.errors.length + '):<ul class="mb-0">';
                g.errors.forEach(function(e) {
                    gHtml += '<li>' + escapeHtml(e.error) + '</li>';
                });
                gHtml += '</ul></div>';
            }
        }
        if (result.glpi_error) {
            gHtml += '<div class="text-danger small mt-2">' + escapeHtml(result.glpi_error) + '</div>';
        }
        if (!gHtml) gHtml = '<div class="text-muted small">GLPI: нет данных</div>';
        html += '<div class="card mt-3"><div class="card-header py-1 bg-light"><i class="bi bi-terminal me-1"></i>Синхронизация с GLPI (SSH)</div><div class="card-body py-2">' + gHtml + '</div></div>';
    }

    if (!html) {
        html = '<p class="text-muted">Нет операций для выполнения.</p>';
    }

    body.innerHTML = html;
}
