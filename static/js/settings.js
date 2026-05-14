/* Settings page logic */

function getSettingsData() {
    return {
        ipa_server: document.getElementById('cfg-ipa-server').value,
        ipa_user: document.getElementById('cfg-ipa-user').value,
        ipa_password: document.getElementById('cfg-ipa-password').value,
        ipa_verify_ssl: document.getElementById('cfg-ipa-verify-ssl').checked,
        target_group: document.getElementById('cfg-target-group').value || 'employees',
        mail_server: document.getElementById('cfg-mail-server').value,
        mail_port: parseInt(document.getElementById('cfg-mail-port').value) || 587,
        mail_use_tls: document.getElementById('cfg-mail-tls').checked,
        mail_username: document.getElementById('cfg-mail-username').value,
        mail_password: document.getElementById('cfg-mail-password').value,
        mail_from: document.getElementById('cfg-mail-from').value,
        auto_send_credentials: document.getElementById('cfg-auto-send').checked,
        mail_send_delay: parseInt(document.getElementById('cfg-mail-delay').value) || 0,
        glpi_ssh_host: document.getElementById('cfg-glpi-ssh-host').value.trim(),
        glpi_ssh_port: parseInt(document.getElementById('cfg-glpi-ssh-port').value) || 22,
        glpi_ssh_user: document.getElementById('cfg-glpi-ssh-user').value.trim(),
        glpi_ssh_password: document.getElementById('cfg-glpi-ssh-password').value,
        glpi_ssh_key_path: document.getElementById('cfg-glpi-ssh-key-path').value.trim(),
        glpi_ssh_command: document.getElementById('cfg-glpi-ssh-command').value,
        glpi_ssh_timeout: parseInt(document.getElementById('cfg-glpi-ssh-timeout').value) || 600,
        glpi_auths_id: parseInt(document.getElementById('cfg-glpi-auths-id').value) || 1,
        glpi_auto_sync: document.getElementById('cfg-glpi-auto-sync').checked,
        password_length: parseInt(document.getElementById('cfg-password-length').value) || 8,
        password_charset: document.getElementById('cfg-password-charset').value,
        xlsx_hint: document.getElementById('cfg-xlsx-hint').value,
        mail_template_new_user_subject: document.getElementById('cfg-tpl-new-subject').value,
        mail_template_new_user_body: document.getElementById('cfg-tpl-new-body').value,
        mail_template_reset_subject: document.getElementById('cfg-tpl-reset-subject').value,
        mail_template_reset_body: document.getElementById('cfg-tpl-reset-body').value,
    };
}

async function saveSettings() {
    showLoading();
    try {
        await api('/api/settings', { method: 'POST', body: getSettingsData() });
        showAlert('Настройки сохранены', 'success');
    } catch (e) {
        showAlert('Ошибка сохранения: ' + e.message);
    } finally {
        hideLoading();
    }
}

async function testIPA() {
    var span = document.getElementById('ipa-test-result');
    span.innerHTML = '<span class="text-muted">Проверка...</span>';
    try {
        var data = getSettingsData();
        await api('/api/settings/test-ipa', {
            method: 'POST',
            body: {
                ipa_server: data.ipa_server,
                ipa_user: data.ipa_user,
                ipa_password: data.ipa_password,
                ipa_verify_ssl: data.ipa_verify_ssl,
            },
        });
        span.innerHTML = '<span class="text-success"><i class="bi bi-check-circle me-1"></i>Подключение успешно</span>';
    } catch (e) {
        span.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle me-1"></i>' + escapeHtml(e.message) + '</span>';
    }
}

async function testMail() {
    var span = document.getElementById('mail-test-result');
    span.innerHTML = '<span class="text-muted">Проверка...</span>';
    try {
        var data = getSettingsData();
        await api('/api/settings/test-mail', {
            method: 'POST',
            body: {
                mail_server: data.mail_server,
                mail_port: data.mail_port,
                mail_use_tls: data.mail_use_tls,
                mail_username: data.mail_username,
                mail_password: data.mail_password,
                mail_from: data.mail_from,
            },
        });
        span.innerHTML = '<span class="text-success"><i class="bi bi-check-circle me-1"></i>Подключение успешно</span>';
    } catch (e) {
        span.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle me-1"></i>' + escapeHtml(e.message) + '</span>';
    }
}

function _glpiPayload() {
    var d = getSettingsData();
    return {
        glpi_ssh_host: d.glpi_ssh_host,
        glpi_ssh_port: d.glpi_ssh_port,
        glpi_ssh_user: d.glpi_ssh_user,
        glpi_ssh_password: d.glpi_ssh_password,
        glpi_ssh_key_path: d.glpi_ssh_key_path,
        glpi_ssh_command: d.glpi_ssh_command,
        glpi_ssh_timeout: d.glpi_ssh_timeout,
        glpi_auths_id: d.glpi_auths_id,
    };
}

async function testGLPI() {
    var span = document.getElementById('glpi-test-result');
    var out = document.getElementById('glpi-output');
    if (out) out.style.display = 'none';
    span.innerHTML = '<span class="text-muted">Проверка SSH...</span>';
    try {
        var result = await api('/api/settings/test-glpi', { method: 'POST', body: _glpiPayload() });
        span.innerHTML = '<span class="text-success"><i class="bi bi-check-circle me-1"></i>' + escapeHtml(result.message || 'OK') + '</span>';
    } catch (e) {
        span.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle me-1"></i>' + escapeHtml(e.message) + '</span>';
    }
}

async function runGLPISync() {
    var span = document.getElementById('glpi-test-result');
    var out = document.getElementById('glpi-output');
    if (out) { out.style.display = 'none'; out.textContent = ''; }
    span.innerHTML = '<span class="text-muted">Запуск синхронизации (это может занять минуту)...</span>';
    try {
        var result = await api('/api/glpi/sync', { method: 'POST', body: {} });
        var text = '$ ' + (result.command || '') + '\n\n';
        text += '[exit: ' + result.exit_code + ']\n';
        if (result.stdout) text += '\n--- stdout ---\n' + result.stdout;
        if (result.stderr) text += '\n--- stderr ---\n' + result.stderr;
        if (out) { out.textContent = text; out.style.display = ''; }

        var p = result.parsed || {};
        var summary = [];
        if ('imported' in p) summary.push('импортировано: ' + p.imported);
        if ('synced' in p) summary.push('синхронизировано: ' + p.synced);
        if ('deleted' in p) summary.push('удалено: ' + p.deleted);
        if ('restored' in p) summary.push('восстановлено: ' + p.restored);

        if (result.errors && result.errors.length) {
            span.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle me-1"></i>' +
                escapeHtml(result.errors[0].error || 'ошибка') + '</span>';
        } else if (summary.length) {
            span.innerHTML = '<span class="text-success"><i class="bi bi-check-circle me-1"></i>' +
                escapeHtml(summary.join(', ')) + '</span>';
        } else {
            span.innerHTML = '<span class="text-success"><i class="bi bi-check-circle me-1"></i>Готово (exit ' + result.exit_code + ')</span>';
        }
    } catch (e) {
        span.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle me-1"></i>' + escapeHtml(e.message) + '</span>';
    }
}

// --- Mail queue ---

function fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts * 1000);
    return d.toLocaleString();
}

async function refreshMailQueueBadge() {
    try {
        var data = await api('/api/mail/queue');
        var badge = document.getElementById('mail-queue-badge');
        if (badge) badge.textContent = data.size;
    } catch (e) { /* ignore */ }
}

async function showMailQueue(e) {
    if (e) e.preventDefault();
    var body = document.getElementById('mail-queue-body');
    body.innerHTML = '<span class="text-muted">Загрузка...</span>';
    new bootstrap.Modal(document.getElementById('mailQueueModal')).show();
    try {
        var data = await api('/api/mail/queue');
        document.getElementById('mail-queue-badge').textContent = data.size;
        if (!data.items.length) {
            body.innerHTML = '<p class="text-muted mb-0">Очередь пуста</p>';
            return;
        }
        var rows = data.items.map(function(it) {
            var scenarioBadge = it.scenario === 'reset'
                ? '<span class="badge bg-warning text-dark">Сброс</span>'
                : '<span class="badge bg-success">Новый</span>';
            var retries = it.retries ? '<span class="badge bg-danger ms-1">повторов: ' + it.retries + '</span>' : '';
            return '<tr>' +
                '<td>' + escapeHtml(it.uid || '') + '</td>' +
                '<td>' + escapeHtml(it.email || '') + '</td>' +
                '<td>' + scenarioBadge + retries + '</td>' +
                '<td class="text-nowrap small text-muted">' + fmtTime(it.next_at) + '</td>' +
            '</tr>';
        }).join('');
        body.innerHTML =
            '<p class="small text-muted">Писем в очереди: <strong>' + data.size + '</strong></p>' +
            '<table class="table table-sm">' +
                '<thead><tr><th>Логин</th><th>Email</th><th>Сценарий</th><th>Отправка не ранее</th></tr></thead>' +
                '<tbody>' + rows + '</tbody>' +
            '</table>';
    } catch (e) {
        body.innerHTML = '<div class="text-danger">Ошибка: ' + escapeHtml(e.message) + '</div>';
    }
}

async function clearMailQueue() {
    if (!confirm('Очистить очередь писем? Невидимые письма не будут отправлены.')) return;
    try {
        await api('/api/mail/queue/clear', { method: 'POST' });
        showMailQueue();
        refreshMailQueueBadge();
    } catch (e) {
        showAlert('Ошибка: ' + e.message);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    refreshMailQueueBadge();
    // Periodically refresh badge
    setInterval(refreshMailQueueBadge, 15000);
});
