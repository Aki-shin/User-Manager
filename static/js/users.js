/* Users page logic */

let usersData = [];
let editingUid = null;
let originalData = {};

const FIELDS = [
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

document.addEventListener('DOMContentLoaded', loadUsers);

async function loadUsers() {
    showLoading();
    try {
        const data = await api('/api/users');
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
    const q = (document.getElementById('user-search')?.value || '').toLowerCase().trim();
    if (!q) return usersData;
    return usersData.filter(u =>
        FIELDS.some(f => (u[f.key] || '').toLowerCase().includes(q))
    );
}

function renderUsers() {
    const tbody = document.getElementById('users-tbody');
    const filtered = getFilteredUsers();
    if (!filtered.length) {
        const msg = usersData.length ? 'Ничего не найдено' : 'Нет пользователей в группе';
        tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted py-4">${msg}</td></tr>`;
        return;
    }
    tbody.innerHTML = filtered.map(u => {
        const isEditing = editingUid === u.uid;
        const rowClass = isEditing ? 'editing' : '';
        const lockClass = u.locked ? 'locked' : 'unlocked';
        const lockIcon = u.locked ? 'bi-lock-fill' : 'bi-unlock';

        let cells = `<td>
            <button class="btn btn-link btn-xs lock-btn ${lockClass}" onclick="toggleLock('${u.uid}')" title="${u.locked ? 'Разблокировать' : 'Заблокировать'}">
                <i class="bi ${lockIcon}"></i>
            </button>
        </td>`;

        for (const f of FIELDS) {
            if (isEditing && !f.readonly) {
                cells += `<td><input class="form-control form-control-sm" data-field="${f.key}" value="${escapeHtml(u[f.key])}"></td>`;
            } else {
                cells += `<td>${escapeHtml(u[f.key])}</td>`;
            }
        }

        if (isEditing) {
            cells += `<td class="text-nowrap">
                <button class="btn btn-success btn-xs" onclick="saveUser('${u.uid}')"><i class="bi bi-check-lg"></i> Сохранить</button>
                <button class="btn btn-secondary btn-xs" onclick="cancelEdit()"><i class="bi bi-x-lg"></i> Отмена</button>
            </td>`;
        } else {
            cells += `<td class="text-nowrap">
                <button class="btn btn-outline-primary btn-xs" onclick="startEdit('${u.uid}')" title="Редактировать"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-outline-warning btn-xs" onclick="showPasswordModal('${u.uid}')" title="Пароль"><i class="bi bi-key"></i></button>
                <button class="btn btn-outline-danger btn-xs" onclick="deleteUser('${u.uid}')" title="Удалить"><i class="bi bi-trash"></i></button>
            </td>`;
        }

        return `<tr class="${rowClass}">${cells}</tr>`;
    }).join('');
}

function startEdit(uid) {
    editingUid = uid;
    const u = usersData.find(x => x.uid === uid);
    originalData = { ...u };
    renderUsers();
}

function cancelEdit() {
    // Restore original data
    const idx = usersData.findIndex(x => x.uid === editingUid);
    if (idx >= 0) {
        usersData[idx] = { ...usersData[idx], ...originalData };
    }
    editingUid = null;
    renderUsers();
}

async function saveUser(uid) {
    const row = document.querySelector('tr.editing');
    if (!row) return;
    const inputs = row.querySelectorAll('input[data-field]');
    const data = {};
    inputs.forEach(inp => { data[inp.dataset.field] = inp.value; });

    showLoading();
    try {
        await api(`/api/users/${uid}`, { method: 'PUT', body: data });
        // Update local data
        const idx = usersData.findIndex(x => x.uid === uid);
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
    if (!confirm(`Удалить пользователя ${uid}?`)) return;
    showLoading();
    try {
        await api(`/api/users/${uid}`, { method: 'DELETE' });
        usersData = usersData.filter(x => x.uid !== uid);
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
        const data = await api(`/api/users/${uid}/lock`, { method: 'POST' });
        const u = usersData.find(x => x.uid === uid);
        if (u) u.locked = data.locked;
        renderUsers();
    } catch (e) {
        showAlert('Ошибка: ' + e.message);
    }
}

// --- Create Modal ---

function showCreateModal() {
    document.querySelectorAll('#createModal input').forEach(i => i.value = '');
    new bootstrap.Modal(document.getElementById('createModal')).show();
}

async function createUser() {
    const data = {};
    const fields = ['uid','givenname','sn','cn','mail','telephonenumber','mobile','employeenumber','title','ou'];
    fields.forEach(f => { data[f] = document.getElementById('cr-' + f).value; });
    const pw = document.getElementById('cr-password').value;
    if (pw) data.userpassword = pw;

    if (!data.uid || !data.givenname || !data.sn) {
        showAlert('Логин, Имя и Фамилия обязательны');
        return;
    }

    showLoading();
    try {
        const result = await api('/api/users', { method: 'POST', body: data });
        bootstrap.Modal.getInstance(document.getElementById('createModal')).hide();
        showAlert(`Пользователь ${result.uid} создан. Пароль: <code>${result.password}</code>`, 'success');
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
    const uid = document.getElementById('pw-uid').textContent;
    const password = document.getElementById('pw-password').value;
    const sendEmail = document.getElementById('pw-send-email').checked;

    showLoading();
    try {
        const result = await api(`/api/users/${uid}/password`, {
            method: 'POST',
            body: { password: password || undefined, send_email: sendEmail },
        });
        bootstrap.Modal.getInstance(document.getElementById('passwordModal')).hide();
        showAlert(`Пароль обновлён: <code>${result.password}</code>`, 'success');
    } catch (e) {
        showAlert('Ошибка: ' + e.message);
    } finally {
        hideLoading();
    }
}
