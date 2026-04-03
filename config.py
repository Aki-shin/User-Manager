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
}


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
