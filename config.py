import json
import os

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json')

DEFAULT_CONFIG = {
    'ipa_server': '',
    'ipa_user': '',
    'ipa_password': '',
    'ipa_verify_ssl': False,
    'target_group': 'employees',
    'mail_server': '',
    'mail_port': 587,
    'mail_use_tls': True,
    'mail_username': '',
    'mail_password': '',
    'mail_from': '',
    'auto_send_credentials': False,
    'mail_send_delay': 30,
    'password_length': 8,
    'password_charset': 'digits',
    'mail_template_new_user_subject': 'Данные для входа в систему',
    'mail_template_new_user_body': (
        'Здравствуйте, {full_name}!\n\n'
        'Для вас создана учётная запись.\n'
        'Логин: {uid}\n'
        'Пароль: {password}\n\n'
        'Пожалуйста, смените пароль при первом входе.'
    ),
    'glpi_ssh_host': '',
    'glpi_ssh_port': 22,
    'glpi_ssh_user': '',
    'glpi_ssh_password': '',
    'glpi_ssh_key_path': '',
    'glpi_ssh_command': (
        'sudo -u www-data php /var/www/html/glpi/bin/console '
        'glpi:ldap:synchronize_users --ldap-server-id={auths_id} --no-interaction'
    ),
    'glpi_ssh_timeout': 600,
    'glpi_auths_id': 1,
    'glpi_auto_sync': False,
    'xlsx_hint': (
        'Файл XLSX должен содержать следующие столбцы:\n'
        '\n'
        '  Фамилия — фамилия сотрудника\n'
        '  Имя — имя сотрудника\n'
        '  Отчество — отчество сотрудника\n'
        '  Код — уникальный табельный номер (обязательное поле)\n'
        '  Должность — название должности\n'
        '  Подразделение — название подразделения\n'
        '  Рабочий телефон — рабочий номер телефона\n'
        '  Мобильный телефон — мобильный номер телефона\n'
        '  Email — электронная почта сотрудника\n'
        '\n'
        'Если у сотрудника несколько должностей/подразделений, '
        'добавьте несколько строк с одинаковым Кодом — '
        'они будут объединены через " / ".\n'
        '\n'
        'Сотрудники, отсутствующие в файле, будут предложены к удалению.'
    ),
    'mail_template_reset_subject': 'Сброс пароля',
    'mail_template_reset_body': (
        'Здравствуйте, {full_name}!\n\n'
        'Ваш пароль был сброшен.\n'
        'Логин: {uid}\n'
        'Новый пароль: {password}\n\n'
        'Пожалуйста, смените пароль при первом входе.'
    ),
}

PASSWORDS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'passwords.json')


def load_passwords():
    if os.path.exists(PASSWORDS_PATH):
        with open(PASSWORDS_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_password(uid, password):
    data = load_passwords()
    data[uid] = password
    with open(PASSWORDS_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
        merged = {**DEFAULT_CONFIG, **cfg}
        return merged
    return dict(DEFAULT_CONFIG)


def save_config(data):
    cfg = load_config()
    cfg.update(data)
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    return cfg
