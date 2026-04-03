"""FreeIPA JSON-RPC client wrapper."""

import json
import random
import string
import warnings
from urllib.parse import urljoin

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class IPAClient:
    """Minimal FreeIPA JSON-RPC client."""

    API_VERSION = '2.254'

    def __init__(self, server, user, password, verify_ssl=False):
        self.server = server if server.startswith('http') else f'https://{server}'
        self.user = user
        self.password = password
        self.verify_ssl = verify_ssl
        self.session = requests.Session()
        self.session.verify = verify_ssl
        self._logged_in = False

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------
    def login(self):
        url = urljoin(self.server, '/ipa/session/login_password')
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'text/plain',
            'Referer': urljoin(self.server, '/ipa'),
        }
        data = {'user': self.user, 'password': self.password}
        resp = self.session.post(url, data=data, headers=headers)
        if resp.status_code != 200:
            raise Exception(f'Login failed ({resp.status_code}): {resp.text}')
        self._logged_in = True

    def _rpc(self, method, args=None, options=None):
        if not self._logged_in:
            self.login()
        url = urljoin(self.server, '/ipa/session/json')
        payload = {
            'method': method,
            'params': [args or [], options or {}],
            'id': 0,
        }
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Referer': urljoin(self.server, '/ipa'),
        }
        resp = self.session.post(url, json=payload, headers=headers)
        result = resp.json()
        if result.get('error'):
            err = result['error']
            raise Exception(f"IPA error {err.get('code')}: {err.get('message')}")
        return result.get('result', {})

    # ------------------------------------------------------------------
    # Users
    # ------------------------------------------------------------------
    def user_find(self, criteria='', **kwargs):
        opts = {'version': self.API_VERSION, 'all': True, 'sizelimit': 0}
        opts.update(kwargs)
        res = self._rpc('user_find', [criteria], opts)
        return res.get('result', [])

    def user_show(self, uid):
        res = self._rpc('user_show', [uid], {'version': self.API_VERSION, 'all': True})
        return res.get('result', {})

    def user_add(self, uid, givenname, sn, **kwargs):
        opts = {
            'version': self.API_VERSION,
            'givenname': givenname,
            'sn': sn,
            'all': True,
        }
        opts.update(kwargs)
        res = self._rpc('user_add', [uid], opts)
        return res.get('result', {})

    def user_mod(self, uid, **kwargs):
        opts = {'version': self.API_VERSION, 'all': True}
        opts.update(kwargs)
        res = self._rpc('user_mod', [uid], opts)
        return res.get('result', {})

    def user_del(self, uid):
        res = self._rpc('user_del', [uid], {'version': self.API_VERSION})
        return res

    def passwd(self, uid, password):
        res = self._rpc('passwd', [uid, password], {'version': self.API_VERSION})
        return res

    # ------------------------------------------------------------------
    # Groups
    # ------------------------------------------------------------------
    def group_add_member(self, group, users):
        if isinstance(users, str):
            users = [users]
        res = self._rpc('group_add_member', [group], {
            'version': self.API_VERSION,
            'user': users,
        })
        return res

    def group_remove_member(self, group, users):
        if isinstance(users, str):
            users = [users]
        res = self._rpc('group_remove_member', [group], {
            'version': self.API_VERSION,
            'user': users,
        })
        return res

    def group_show(self, group):
        res = self._rpc('group_show', [group], {'version': self.API_VERSION, 'all': True})
        return res.get('result', {})


def generate_password(length=8):
    """Generate a numeric password of given length."""
    return ''.join(random.choices(string.digits, k=length))
