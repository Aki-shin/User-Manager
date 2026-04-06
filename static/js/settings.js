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
