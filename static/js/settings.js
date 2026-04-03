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
    const span = document.getElementById('ipa-test-result');
    span.innerHTML = '<span class="text-muted">Проверка...</span>';
    try {
        const data = getSettingsData();
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
        span.innerHTML = `<span class="text-danger"><i class="bi bi-x-circle me-1"></i>${escapeHtml(e.message)}</span>`;
    }
}

async function testMail() {
    const span = document.getElementById('mail-test-result');
    span.innerHTML = '<span class="text-muted">Проверка...</span>';
    try {
        const data = getSettingsData();
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
        span.innerHTML = `<span class="text-danger"><i class="bi bi-x-circle me-1"></i>${escapeHtml(e.message)}</span>`;
    }
}
