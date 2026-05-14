"""FreeIPA User Manager — Flask web application."""

import json
import os
import traceback

from flask import (Flask, render_template, request, jsonify, redirect,
                   url_for, flash, session)

from config import load_config, save_config, load_passwords, save_password
from ipa_client import IPAClient, generate_password
from xlsx_parser import parse_xlsx, generate_uid
from mail_service import send_credentials, test_mail_connection
import mail_queue
import glpi_client

app = Flask(__name__)
app.secret_key = os.urandom(32)

# Start background mail worker (idempotent)
mail_queue.start_worker()

LOCKS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'locks.json')


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _load_locks():
    if os.path.exists(LOCKS_PATH):
        with open(LOCKS_PATH, 'r') as f:
            return json.load(f)
    return {}


def _save_locks(locks):
    with open(LOCKS_PATH, 'w') as f:
        json.dump(locks, f, ensure_ascii=False, indent=2)


def _get_ipa():
    cfg = load_config()
    if not cfg.get('ipa_server') or not cfg.get('ipa_user') or not cfg.get('ipa_password'):
        return None
    client = IPAClient(
        cfg['ipa_server'], cfg['ipa_user'], cfg['ipa_password'],
        verify_ssl=cfg.get('ipa_verify_ssl', False),
    )
    client.login()
    return client


def _gen_password():
    """Generate password using current config settings."""
    cfg = load_config()
    return generate_password(
        length=int(cfg.get('password_length', 8)),
        charset=cfg.get('password_charset', 'digits'),
    )


def _first(val):
    """Extract first element if value is a list."""
    if isinstance(val, (list, tuple)):
        return val[0] if val else ''
    return val or ''


def _user_to_dict(u):
    """Convert IPA user record to a flat dict for the frontend."""
    return {
        'uid': _first(u.get('uid', '')),
        'givenname': _first(u.get('givenname', '')),
        'sn': _first(u.get('sn', '')),
        'cn': _first(u.get('cn', '')),
        'telephonenumber': _first(u.get('telephonenumber', '')),
        'mobile': _first(u.get('mobile', '')),
        'mail': _first(u.get('mail', '')),
        'title': _first(u.get('title', '')),
        'ou': _first(u.get('ou', '')),
        'employeenumber': _first(u.get('employeenumber', '')),
    }


def _get_group_members(ipa, group):
    """Return list of user dicts that are members of the given group."""
    users_raw = ipa.user_find('', in_group=group)
    return [_user_to_dict(u) for u in users_raw]


# ------------------------------------------------------------------
# Pages
# ------------------------------------------------------------------

@app.route('/')
def index():
    cfg = load_config()
    if not cfg.get('ipa_server'):
        return redirect(url_for('settings'))
    return render_template('index.html', target_group=cfg.get('target_group', 'employees'))


@app.route('/sync')
def sync_page():
    cfg = load_config()
    if not cfg.get('ipa_server'):
        return redirect(url_for('settings'))
    return render_template('sync.html',
                           target_group=cfg.get('target_group', 'employees'),
                           xlsx_hint=cfg.get('xlsx_hint', ''),
                           glpi_auto_sync=bool(cfg.get('glpi_auto_sync') and cfg.get('glpi_ssh_host')))


@app.route('/settings')
def settings():
    cfg = load_config()
    return render_template('settings.html', config=cfg)


# ------------------------------------------------------------------
# API — Users
# ------------------------------------------------------------------

@app.route('/api/users')
def api_users():
    try:
        ipa = _get_ipa()
        if not ipa:
            return jsonify({'error': 'FreeIPA не настроен'}), 400
        cfg = load_config()
        group = cfg.get('target_group', 'employees')
        users = _get_group_members(ipa, group)
        locks = _load_locks()
        passwords = load_passwords()
        for u in users:
            u['locked'] = locks.get(u['uid'], False)
            u['has_password'] = u['uid'] in passwords
        return jsonify({'users': users})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/users/<uid>', methods=['PUT'])
def api_user_update(uid):
    try:
        ipa = _get_ipa()
        data = request.json
        kwargs = {}
        field_map = {
            'givenname': 'givenname',
            'sn': 'sn',
            'cn': 'cn',
            'telephonenumber': 'telephonenumber',
            'mobile': 'mobile',
            'mail': 'mail',
            'title': 'title',
            'ou': 'ou',
            'employeenumber': 'employeenumber',
        }
        for front_key, ipa_key in field_map.items():
            if front_key in data:
                kwargs[ipa_key] = data[front_key]
        ipa.user_mod(uid, **kwargs)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/users', methods=['POST'])
def api_user_create():
    try:
        ipa = _get_ipa()
        cfg = load_config()
        data = request.json

        uid = data.get('uid', '').strip()
        givenname = data.get('givenname', '').strip()
        sn = data.get('sn', '').strip()
        if not uid or not givenname or not sn:
            return jsonify({'error': 'uid, givenname и sn обязательны'}), 400

        password = data.get('userpassword') or _gen_password()
        kwargs = {}
        for key in ('cn', 'telephonenumber', 'mobile', 'mail', 'title', 'ou', 'employeenumber'):
            if data.get(key):
                kwargs[key] = data[key]
        kwargs['userpassword'] = password

        ipa.user_add(uid, givenname, sn, **kwargs)

        group = cfg.get('target_group', 'employees')
        try:
            ipa.group_add_member(group, uid)
        except Exception:
            pass

        # Save password for later resend
        save_password(uid, password)

        # Auto-send credentials if enabled
        email_sent = False
        if cfg.get('auto_send_credentials') and cfg.get('mail_server'):
            email = data.get('mail', '')
            cn = data.get('cn', '')
            if email:
                try:
                    send_credentials(cfg, email, uid, password, cn, scenario='new_user')
                    email_sent = True
                except Exception:
                    pass

        return jsonify({'ok': True, 'uid': uid, 'password': password, 'email_sent': email_sent})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/users/<uid>', methods=['DELETE'])
def api_user_delete(uid):
    try:
        ipa = _get_ipa()
        ipa.user_del(uid)
        locks = _load_locks()
        locks.pop(uid, None)
        _save_locks(locks)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/users/<uid>/password', methods=['POST'])
def api_user_password(uid):
    try:
        ipa = _get_ipa()
        cfg = load_config()
        password = request.json.get('password') or _gen_password()
        ipa.passwd(uid, password)

        # Save for later resend
        save_password(uid, password)

        # Optionally send by email
        if request.json.get('send_email'):
            if cfg.get('mail_server'):
                user = ipa.user_show(uid)
                email = _first(user.get('mail', ''))
                cn = _first(user.get('cn', ''))
                if email:
                    send_credentials(cfg, email, uid, password, cn, scenario='reset')

        return jsonify({'ok': True, 'password': password})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/users/<uid>/resend', methods=['POST'])
def api_user_resend(uid):
    """Resend saved password to user's email."""
    try:
        cfg = load_config()
        passwords = load_passwords()
        password = passwords.get(uid)
        if not password:
            return jsonify({'error': 'Нет сохранённого пароля для этого пользователя'}), 400

        if not cfg.get('mail_server'):
            return jsonify({'error': 'Почтовый сервер не настроен'}), 400

        ipa = _get_ipa()
        user = ipa.user_show(uid)
        email = _first(user.get('mail', ''))
        cn = _first(user.get('cn', ''))
        if not email:
            return jsonify({'error': 'У пользователя нет email'}), 400

        scenario = request.json.get('scenario', 'new_user') if request.json else 'new_user'
        send_credentials(cfg, email, uid, password, cn, scenario=scenario)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/users/<uid>/lock', methods=['POST'])
def api_user_lock(uid):
    locks = _load_locks()
    current = locks.get(uid, False)
    locks[uid] = not current
    _save_locks(locks)
    return jsonify({'ok': True, 'locked': locks[uid]})


# ------------------------------------------------------------------
# API — Sync
# ------------------------------------------------------------------

@app.route('/api/sync/upload', methods=['POST'])
def api_sync_upload():
    try:
        ipa = _get_ipa()
        if not ipa:
            return jsonify({'error': 'FreeIPA не настроен'}), 400

        f = request.files.get('file')
        if not f:
            return jsonify({'error': 'Файл не загружен'}), 400

        file_users = parse_xlsx(f.stream)

        cfg = load_config()
        group = cfg.get('target_group', 'employees')
        ipa_users = _get_group_members(ipa, group)
        locks = _load_locks()

        # Get ALL uids in IPA (not just group) to avoid collisions
        all_ipa_users = ipa.user_find('', pkey_only=True)
        all_ipa_uids = set()
        for au in all_ipa_users:
            uid = _first(au.get('uid', ''))
            if uid:
                all_ipa_uids.add(uid)

        # Index IPA users by employeenumber and by cn
        ipa_by_code = {}
        ipa_no_code = []
        for u in ipa_users:
            if u.get('employeenumber'):
                ipa_by_code[u['employeenumber']] = u
            else:
                ipa_no_code.append(u)

        # Index file users by cn for fallback matching
        file_by_cn = {}
        for fu in file_users:
            cn = fu['cn']
            if cn:
                file_by_cn.setdefault(cn, []).append(fu)

        # Try to match IPA users without code by cn
        matched_no_code = set()
        for u in ipa_no_code:
            cn = u.get('cn', '')
            if cn and cn in file_by_cn and len(file_by_cn[cn]) == 1:
                fu = file_by_cn[cn][0]
                ipa_by_code[fu['code']] = u
                matched_no_code.add(u['uid'])

        # Build diff
        updates = []
        creates = []
        deletes = []
        seen_codes = set()

        field_pairs = [
            ('givenname', 'givenname'),
            ('sn', 'sn'),
            ('cn', 'cn'),
            ('phone', 'telephonenumber'),
            ('mobile', 'mobile'),
            ('email', 'mail'),
            ('title', 'title'),
            ('department', 'ou'),
        ]

        for fu in file_users:
            code = fu['code']
            seen_codes.add(code)

            if code in ipa_by_code:
                ipa_u = ipa_by_code[code]
                changes = {}
                for file_key, ipa_key in field_pairs:
                    new_val = fu.get(file_key, '')
                    old_val = ipa_u.get(ipa_key, '')
                    if new_val != old_val:
                        changes[ipa_key] = {'old': old_val, 'new': new_val}

                if ipa_u['uid'] in matched_no_code:
                    old_code = ipa_u.get('employeenumber', '')
                    if old_code != code:
                        changes['employeenumber'] = {'old': old_code, 'new': code}

                if changes:
                    updates.append({
                        'uid': ipa_u['uid'],
                        'code': code,
                        'current': ipa_u,
                        'changes': changes,
                        'locked': locks.get(ipa_u['uid'], False),
                    })
            else:
                uid = generate_uid(fu['surname'], fu['firstname'], fu['patronymic'], all_ipa_uids)
                all_ipa_uids.add(uid)
                password = _gen_password()
                creates.append({
                    'uid': uid,
                    'password': password,
                    'data': {
                        'uid': uid,
                        'givenname': fu['givenname'],
                        'sn': fu['sn'],
                        'cn': fu['cn'],
                        'telephonenumber': fu['phone'],
                        'mobile': fu['mobile'],
                        'mail': fu['email'],
                        'title': fu['title'],
                        'ou': fu['department'],
                        'employeenumber': code,
                    },
                })

        for code, ipa_u in ipa_by_code.items():
            if code not in seen_codes:
                deletes.append({
                    'uid': ipa_u['uid'],
                    'code': code,
                    'current': ipa_u,
                    'locked': locks.get(ipa_u['uid'], False),
                })

        for u in ipa_no_code:
            if u['uid'] not in matched_no_code:
                deletes.append({
                    'uid': u['uid'],
                    'code': '',
                    'current': u,
                    'locked': locks.get(u['uid'], False),
                })

        return jsonify({
            'updates': updates,
            'creates': creates,
            'deletes': deletes,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/sync/apply', methods=['POST'])
def api_sync_apply():
    try:
        ipa = _get_ipa()
        cfg = load_config()
        group = cfg.get('target_group', 'employees')
        data = request.json
        results = {'applied': [], 'errors': []}
        locks = _load_locks()

        created_uids = []
        updated_uids = []
        deleted_uids = []
        queued_mails = 0

        # Updates
        for upd in data.get('updates', []):
            uid = upd['uid']
            if locks.get(uid):
                continue
            changes = upd.get('changes', {})
            kwargs = {k: v['new'] for k, v in changes.items()}
            try:
                ipa.user_mod(uid, **kwargs)
                updated_uids.append(uid)
                results['applied'].append({'action': 'update', 'uid': uid})
            except Exception as e:
                results['errors'].append({'action': 'update', 'uid': uid, 'error': str(e)})

        # Creates
        for cr in data.get('creates', []):
            d = cr['data']
            uid = d['uid']
            password = cr.get('password', _gen_password())
            try:
                kwargs = {}
                for k in ('cn', 'telephonenumber', 'mobile', 'mail', 'title', 'ou', 'employeenumber'):
                    if d.get(k):
                        kwargs[k] = d[k]
                kwargs['userpassword'] = password
                ipa.user_add(uid, d['givenname'], d['sn'], **kwargs)
                try:
                    ipa.group_add_member(group, uid)
                except Exception:
                    pass

                save_password(uid, password)
                created_uids.append(uid)

                # Auto-send via queue (mass operation → rate-limited)
                if cfg.get('auto_send_credentials') and cfg.get('mail_server') and d.get('mail'):
                    if mail_queue.enqueue(d['mail'], uid, password,
                                          d.get('cn', ''), scenario='new_user'):
                        queued_mails += 1

                results['applied'].append({
                    'action': 'create', 'uid': uid, 'password': password,
                })
            except Exception as e:
                results['errors'].append({'action': 'create', 'uid': uid, 'error': str(e)})

        # Deletes
        for dl in data.get('deletes', []):
            uid = dl['uid']
            if locks.get(uid):
                continue
            try:
                ipa.user_del(uid)
                locks.pop(uid, None)
                deleted_uids.append(uid)
                results['applied'].append({'action': 'delete', 'uid': uid})
            except Exception as e:
                results['errors'].append({'action': 'delete', 'uid': uid, 'error': str(e)})

        _save_locks(locks)

        if queued_mails:
            results['mail_queued'] = queued_mails
            results['mail_queue_total'] = mail_queue.get_queue_size()

        # GLPI sync is NOT run here. The frontend calls /api/glpi/sync as a
        # separate step after all batches complete, so it appears as its own
        # phase in the progress bar.

        return jsonify(results)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ------------------------------------------------------------------
# API — Settings
# ------------------------------------------------------------------

@app.route('/api/settings', methods=['POST'])
def api_settings_save():
    try:
        data = request.json
        save_config(data)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/settings/test-ipa', methods=['POST'])
def api_test_ipa():
    try:
        data = request.json
        client = IPAClient(
            data.get('ipa_server', ''),
            data.get('ipa_user', ''),
            data.get('ipa_password', ''),
            verify_ssl=data.get('ipa_verify_ssl', False),
        )
        client.login()
        return jsonify({'ok': True, 'message': 'Подключение успешно'})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 400


@app.route('/api/settings/test-mail', methods=['POST'])
def api_test_mail():
    try:
        data = request.json
        ok, msg = test_mail_connection(data)
        if ok:
            return jsonify({'ok': True, 'message': 'Подключение успешно'})
        return jsonify({'ok': False, 'message': msg}), 400
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 400


@app.route('/api/settings/test-glpi', methods=['POST'])
def api_test_glpi():
    try:
        ok, msg = glpi_client.test_connection(request.json or {})
        if ok:
            return jsonify({'ok': True, 'message': msg or 'Подключение успешно'})
        return jsonify({'ok': False, 'message': msg}), 400
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 400


# ------------------------------------------------------------------
# API — Mail queue
# ------------------------------------------------------------------

@app.route('/api/mail/queue')
def api_mail_queue():
    queue = mail_queue.get_queue()
    return jsonify({
        'size': len(queue),
        'items': [
            {
                'email': it.get('email'),
                'uid': it.get('uid'),
                'scenario': it.get('scenario'),
                'retries': it.get('retries', 0),
                'next_at': it.get('next_at'),
                'enqueued_at': it.get('enqueued_at'),
            }
            for it in queue
        ],
    })


@app.route('/api/mail/queue/clear', methods=['POST'])
def api_mail_queue_clear():
    mail_queue.clear_queue()
    return jsonify({'ok': True})


# ------------------------------------------------------------------
# API — GLPI manual sync
# ------------------------------------------------------------------

@app.route('/api/glpi/sync', methods=['POST'])
def api_glpi_sync():
    """Manually trigger GLPI's LDAP sync."""
    try:
        cfg = load_config()
        if not cfg.get('glpi_url'):
            return jsonify({'error': 'GLPI не настроен'}), 400
        data = request.json or {}
        result = glpi_client.trigger_sync(
            cfg,
            created_uids=data.get('created', []),
            updated_uids=data.get('updated', []),
            deleted_uids=data.get('deleted', []),
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500




# ------------------------------------------------------------------

if __name__ == '__main__':
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', 5000))
    app.run(host=host, port=port, debug=False, use_reloader=False, threaded=True)
