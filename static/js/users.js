/* Users page logic */

var usersData = [];
var editingUid = null;
var originalData = {};

var FIELDS = [
    { key: 'uid', label: 'Логин', readonly: true },
    { key: 'givenname', label: 'Имя' },
    { key: 'sn', label: 'Фамилия' },
    { key: 'cn', label: 'Полное имя' },
    { key: 'telephonenumber', label: 'Раб. телефон' },
    { key: 'mobile', label: 'Моб. телефон' },
    { key: 'mail', label: 'Email' },
    { key: 'title', label: 'Должность' },
    { key: 'ou', label: 'Подразделение' },
    { key: 'employeenumber', label: 'Код' },
];

document.addEventListener('DOMContentLoaded', function() {
    loadUsers();
    // Auto-focus search field on any keypress when not in an input/textarea
    document.addEventListener('keydown', function(e) {
        var tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.key.length !== 1) return; // ignore special keys
        var search = document.getElementById('user-search');
        if (search) {
            search.focus();
        }
    });
});

async function loadUsers() {
    showLoading();
    try {
        var data = await api('/api/users', { _retries: 2 });
        usersData = data.users;
        renderUsers();
    } catch (e) {
        showAlert('Ошибка загрузки: ' + e.message);
    } finally {
        hideLoading();
    }
}

function filterUsers() {
    renderUsers();
}

function getFilteredUsers() {
    var q = (document.getElementById('user-search') ? document.getElementById('user-search').value : '').toLowerCase().trim();
    if (!q) return usersData;
    return usersData.filter(function(u) {
        return FIELDS.some(function(f) { return (u[f.key] || '').toLowerCase().indexOf(q) !== -1; });
    });
}

function renderUsers() {
    var tbody = document.getElementById('users-tbody');
    var countEl = document.getElementById('user-count');
    var filtered = getFilteredUsers();

    if (countEl) countEl.textContent = usersData.length;

    if (!filtered.length) {
        var msg = usersData.length ? 'Ничего не найдено' : 'Нет пользователей в группе';
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted py-4">' + msg + '</td></tr>';
        return;
    }
    tbody.innerHTML = filtered.map(function(u) {
        var isEditing = editingUid === u.uid;
        var rowClass = isEditing ? 'editing' : '';
        var lockClass = u.locked ? 'locked' : 'unlocked';
        var lockIcon = u.locked ? 'bi-lock-fill' : 'bi-unlock';

        var cells = '<td>' +
            '<button class="btn btn-link btn-xs lock-btn ' + lockClass + '" onclick="toggleLock(\'' + u.uid + '\')" title="' + (u.locked ? 'Разблокировать' : 'Заблокировать') + '">' +
                '<i class="bi ' + lockIcon + '"></i>' +
            '</button>' +
        '</td>';

        for (var i = 0; i < FIELDS.length; i++) {
            var f = FIELDS[i];
            if (isEditing && !f.readonly) {
                cells += '<td><input class="form-control form-control-sm" data-field="' + f.key + '" value="' + escapeHtml(u[f.key]) + '"></td>';
            } else {
                cells += '<td>' + escapeHtml(u[f.key]) + '</td>';
            }
        }

        if (isEditing) {
            cells += '<td class="text-nowrap">' +
                '<button class="btn btn-success btn-xs" onclick="saveUser(\'' + u.uid + '\')"><i class="bi bi-check-lg"></i> Сохранить</button> ' +
                '<button class="btn btn-secondary btn-xs" onclick="cancelEdit()"><i class="bi bi-x-lg"></i> Отмена</button>' +
            '</td>';
        } else {
            cells += '<td class="text-nowrap">' +
                '<button class="btn btn-outline-primary btn-xs" onclick="startEdit(\'' + u.uid + '\')" title="Редактировать"><i class="bi bi-pencil"></i></button> ' +
                '<button class="btn btn-outline-warning btn-xs" onclick="showPasswordModal(\'' + u.uid + '\')" title="Пароль"><i class="bi bi-key"></i></button> ' +
                (u.has_password ? '<button class="btn btn-outline-info btn-xs" onclick="resendPassword(\'' + u.uid + '\')" title="Переотправить пароль на email"><i class="bi bi-envelope"></i></button> ' : '') +
                '<button class="btn btn-outline-danger btn-xs" onclick="deleteUser(\'' + u.uid + '\')" title="Удалить"><i class="bi bi-trash"></i></button>' +
            '</td>';
        }

        return '<tr class="' + rowClass + '">' + cells + '</tr>';
    }).join('');
}

function startEdit(uid) {
    editingUid = uid;
    var u = usersData.find(function(x) { return x.uid === uid; });
    originalData = Object.assign({}, u);
    renderUsers();
}

function cancelEdit() {
    var idx = usersData.findIndex(function(x) { return x.uid === editingUid; });
    if (idx >= 0) {
        Object.assign(usersData[idx], originalData);
    }
    editingUid = null;
    renderUsers();
}

async function saveUser(uid) {
    var row = document.querySelector('tr.editing');
    if (!row) return;
    var inputs = row.querySelectorAll('input[data-field]');
    var data = {};
    inputs.forEach(function(inp) { data[inp.dataset.field] = inp.value; });

    showLoading();
    try {
        await api('/api/users/' + uid, { method: 'PUT', body: data });
        var idx = usersData.findIndex(function(x) { return x.uid === uid; });
        if (idx >= 0) Object.assign(usersData[idx], data);
        editingUid = null;
        renderUsers();
        showAlert('Пользователь обновлён', 'success');
    } catch (e) {
        showAlert('Ошибка сохранения: ' + e.message);
    } finally {
        hideLoading();
    }
}

async function deleteUser(uid) {
    if (!confirm('Удалить пользователя ' + uid + '?')) return;
    showLoading();
    try {
        await api('/api/users/' + uid, { method: 'DELETE' });
        usersData = usersData.filter(function(x) { return x.uid !== uid; });
        renderUsers();
        showAlert('Пользователь удалён', 'success');
    } catch (e) {
        showAlert('Ошибка удаления: ' + e.message);
    } finally {
        hideLoading();
    }
}

async function toggleLock(uid) {
    try {
        var data = await api('/api/users/' + uid + '/lock', { method: 'POST' });
        var u = usersData.find(function(x) { return x.uid === uid; });
        if (u) u.locked = data.locked;
        renderUsers();
    } catch (e) {
        showAlert('Ошибка: ' + e.message);
    }
}

// --- Create Modal ---

function showCreateModal() {
    document.querySelectorAll('#createModal input').forEach(function(i) { i.value = ''; });
    new bootstrap.Modal(document.getElementById('createModal')).show();
}

async function createUser() {
    var data = {};
    var fields = ['uid','givenname','sn','cn','mail','telephonenumber','mobile','employeenumber','title','ou'];
    fields.forEach(function(f) { data[f] = document.getElementById('cr-' + f).value; });
    var pw = document.getElementById('cr-password').value;
    if (pw) data.userpassword = pw;

    if (!data.uid || !data.givenname || !data.sn) {
        showAlert('Логин, Имя и Фамилия обязательны');
        return;
    }

    showLoading();
    try {
        var result = await api('/api/users', { method: 'POST', body: data });
        bootstrap.Modal.getInstance(document.getElementById('createModal')).hide();
        var msg = 'Пользователь ' + result.uid + ' создан. Пароль: <code>' + result.password + '</code>';
        if (result.email_sent) msg += ' (отправлен на email)';
        showAlert(msg, 'success');
        loadUsers();
    } catch (e) {
        showAlert('Ошибка создания: ' + e.message);
    } finally {
        hideLoading();
    }
}

// --- Password Modal ---

function showPasswordModal(uid) {
    document.getElementById('pw-uid').textContent = uid;
    document.getElementById('pw-password').value = '';
    document.getElementById('pw-send-email').checked = false;
    new bootstrap.Modal(document.getElementById('passwordModal')).show();
}

async function resetPassword() {
    var uid = document.getElementById('pw-uid').textContent;
    var password = document.getElementById('pw-password').value;
    var sendEmail = document.getElementById('pw-send-email').checked;

    showLoading();
    try {
        var result = await api('/api/users/' + uid + '/password', {
            method: 'POST',
            body: { password: password || undefined, send_email: sendEmail },
        });
        bootstrap.Modal.getInstance(document.getElementById('passwordModal')).hide();
        showAlert('Пароль обновлён: <code>' + result.password + '</code>', 'success');
    } catch (e) {
        showAlert('Ошибка: ' + e.message);
    } finally {
        hideLoading();
    }
}

// --- Resend saved password ---

async function resendPassword(uid) {
    if (!confirm('Переотправить сохранённый пароль на email пользователя ' + uid + '?')) return;
    showLoading();
    try {
        await api('/api/users/' + uid + '/resend', {
            method: 'POST',
            body: { scenario: 'new_user' },
        });
        showAlert('Пароль отправлен на email', 'success');
    } catch (e) {
        showAlert('Ошибка: ' + e.message);
    } finally {
        hideLoading();
    }
}
