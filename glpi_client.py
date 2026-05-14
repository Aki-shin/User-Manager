"""GLPI LDAP sync trigger via SSH.

The High-level REST API (v2.1) doesn't expose an LDAP sync action,
so we run GLPI's native CLI command over SSH:

    sudo -u www-data php /var/www/html/glpi/bin/console \\
        glpi:ldap:synchronize_users --ldap-server-id={auths_id} --no-interaction

GLPI then reads from FreeIPA (its configured LDAP directory) and applies
all changes — new users, attribute updates, and deletions according to
the AuthLDAP "Deleted users in LDAP" setting.

We capture stdout/stderr and parse the result summary table.
"""

import re
import paramiko


# Default command template. {auths_id} is replaced with the configured LDAP server ID.
DEFAULT_COMMAND = (
    'sudo -u www-data php /var/www/html/glpi/bin/console '
    'glpi:ldap:synchronize_users --ldap-server-id={auths_id} --no-interaction'
)


class GLPISSHClient:
    """Lightweight SSH client for running one-off commands on the GLPI host."""

    def __init__(self, host, port=22, user='', password='', key_path='',
                 connect_timeout=20):
        if not host:
            raise ValueError('SSH хост не задан')
        self.host = host
        self.port = int(port or 22)
        self.user = user or ''
        self.password = password or ''
        self.key_path = key_path or ''
        self.connect_timeout = connect_timeout
        self.client = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    def connect(self):
        self.client = paramiko.SSHClient()
        # Auto-accept unknown host keys — typical for an internal deployment.
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        kwargs = {
            'hostname': self.host,
            'port': self.port,
            'username': self.user,
            'timeout': self.connect_timeout,
            'auth_timeout': self.connect_timeout,
            'banner_timeout': self.connect_timeout,
            'look_for_keys': False,
            'allow_agent': False,
        }
        if self.key_path:
            kwargs['key_filename'] = self.key_path
            if self.password:
                # Password for an encrypted key
                kwargs['passphrase'] = self.password
        elif self.password:
            kwargs['password'] = self.password

        self.client.connect(**kwargs)

    def close(self):
        if self.client:
            try:
                self.client.close()
            except Exception:
                pass
            self.client = None

    def run(self, command, timeout=600):
        """Run a command, return (exit_code, stdout, stderr)."""
        if not self.client:
            raise RuntimeError('SSH not connected')
        stdin, stdout, stderr = self.client.exec_command(command, timeout=timeout)
        # Block until command finishes; recv_exit_status will close streams
        exit_code = stdout.channel.recv_exit_status()
        out = stdout.read().decode('utf-8', errors='replace')
        err = stderr.read().decode('utf-8', errors='replace')
        return exit_code, out, err


def _build_client(cfg):
    return GLPISSHClient(
        host=cfg.get('glpi_ssh_host', ''),
        port=cfg.get('glpi_ssh_port', 22),
        user=cfg.get('glpi_ssh_user', ''),
        password=cfg.get('glpi_ssh_password', ''),
        key_path=cfg.get('glpi_ssh_key_path', ''),
    )


def _render_command(template, cfg):
    auths_id = str(cfg.get('glpi_auths_id', 1) or 1)
    return (template or DEFAULT_COMMAND).replace('{auths_id}', auths_id)


# ----------------------------------------------------------------------
# Output parsing — extract counts from the result table
# ----------------------------------------------------------------------

# Column-header keywords (Russian / English) → result key
_HEADER_KEYS = [
    (('Импортировано', 'Imported'), 'imported'),
    (('Синхронизировано', 'Synchronized'), 'synced'),
    (('Удалено из LDAP', 'Deleted from LDAP'), 'deleted'),
    (('Восстановлено из LDAP', 'Restored from LDAP'), 'restored'),
]


def _parse_output(stdout):
    """Try to extract counts from GLPI's result table. Returns dict or empty."""
    if not stdout:
        return {}
    lines = stdout.splitlines()

    # Find the header row (the one containing the count column names)
    header_idx = -1
    for i, line in enumerate(lines):
        if 'LDAP' in line and ('Импортировано' in line or 'Imported' in line):
            header_idx = i
            break
    if header_idx < 0:
        return {}

    # Identify column positions in the header
    header_cells = [c.strip() for c in lines[header_idx].split('|')]
    col_index = {}
    for i, cell in enumerate(header_cells):
        for keywords, key in _HEADER_KEYS:
            if any(kw in cell for kw in keywords):
                col_index[key] = i
                break

    # Find the data row (after a separator '+---...---+')
    data_row = None
    for j in range(header_idx + 1, len(lines)):
        line = lines[j].strip()
        if line.startswith('+'):
            continue
        if '|' in line:
            data_row = line
            break
    if not data_row:
        return {}

    cells = [c.strip() for c in data_row.split('|')]
    result = {}
    # Server name is usually in column 1 (column 0 is empty due to leading '|')
    if len(cells) > 1:
        result['server'] = cells[1]
    for key, idx in col_index.items():
        try:
            result[key] = int(cells[idx])
        except (ValueError, IndexError):
            pass
    return result


# ----------------------------------------------------------------------
# Public helpers
# ----------------------------------------------------------------------

def trigger_sync(cfg, created_uids=None, updated_uids=None, deleted_uids=None,
                 command_override=None):
    """Run the GLPI LDAP sync command over SSH. Returns dict for UI."""
    created_uids = list(created_uids or [])
    updated_uids = list(updated_uids or [])
    deleted_uids = list(deleted_uids or [])

    result = {
        'created_in_ipa': created_uids,
        'updated_in_ipa': updated_uids,
        'deleted_in_ipa': deleted_uids,
        'command': '',
        'exit_code': None,
        'stdout': '',
        'stderr': '',
        'parsed': {},
        'errors': [],
    }

    if not cfg.get('glpi_ssh_host'):
        result['errors'].append({'error': 'SSH-хост GLPI не настроен'})
        return result

    cmd = _render_command(command_override or cfg.get('glpi_ssh_command'), cfg)
    result['command'] = cmd

    try:
        with _build_client(cfg) as ssh:
            exit_code, out, err = ssh.run(cmd, timeout=int(cfg.get('glpi_ssh_timeout', 600) or 600))
            result['exit_code'] = exit_code
            # Trim to avoid blowing up the JSON response
            result['stdout'] = out[:8000]
            result['stderr'] = err[:4000]
            result['parsed'] = _parse_output(out)
            if exit_code != 0:
                result['errors'].append({
                    'error': 'CLI завершился с кодом {}: {}'.format(
                        exit_code, (err or out)[:400])
                })
    except Exception as e:
        result['errors'].append({'error': str(e)})

    return result


def test_connection(cfg):
    """Open SSH session and run `whoami` to verify creds + host. Returns (ok, msg)."""
    try:
        with _build_client(cfg) as ssh:
            exit_code, out, err = ssh.run('whoami', timeout=15)
            if exit_code == 0:
                return True, 'Подключение успешно (whoami: {})'.format(out.strip())
            return False, 'whoami завершился с кодом {}: {}'.format(exit_code, err.strip())
    except Exception as e:
        return False, str(e)
