"""Mail queue with rate limiting and background worker.

Persists pending emails to disk (mail_queue.json), processes them one at a
time with a configurable delay between sends. Survives process restarts.
"""

import json
import os
import threading
import time
import traceback

from config import load_config
from mail_service import send_credentials

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
QUEUE_PATH = os.path.join(BASE_DIR, 'mail_queue.json')

_lock = threading.Lock()
_worker_started = False


def _load():
    if not os.path.exists(QUEUE_PATH):
        return []
    try:
        with open(QUEUE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []


def _save(queue):
    tmp = QUEUE_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(queue, f, ensure_ascii=False, indent=2)
    os.replace(tmp, QUEUE_PATH)


def enqueue(email, uid, password, full_name='', scenario='new_user'):
    """Add an email to the send queue."""
    if not email:
        return False
    with _lock:
        queue = _load()
        queue.append({
            'email': email,
            'uid': uid,
            'password': password,
            'full_name': full_name,
            'scenario': scenario,
            'enqueued_at': time.time(),
            'next_at': time.time(),
            'retries': 0,
        })
        _save(queue)
    return True


def get_queue():
    with _lock:
        return _load()


def get_queue_size():
    with _lock:
        return len(_load())


def clear_queue():
    with _lock:
        _save([])


def _process_one():
    """Process one ready email. Returns True if work was attempted."""
    cfg = load_config()

    with _lock:
        queue = _load()
        if not queue:
            return False
        now = time.time()
        idx = None
        for i, item in enumerate(queue):
            if item.get('next_at', 0) <= now:
                idx = i
                break
        if idx is None:
            return False
        item = queue.pop(idx)
        _save(queue)

    # Send outside the lock so we don't block enqueue calls
    try:
        send_credentials(
            cfg,
            item['email'],
            item['uid'],
            item['password'],
            item.get('full_name', ''),
            scenario=item.get('scenario', 'new_user'),
        )
        return True
    except Exception:
        traceback.print_exc()
        # Re-enqueue with exponential backoff, max 5 retries
        with _lock:
            queue = _load()
            retries = item.get('retries', 0) + 1
            item['retries'] = retries
            if retries < 5:
                # Backoff: 60s, 120s, 240s, 480s
                item['next_at'] = time.time() + 60 * (2 ** (retries - 1))
                queue.append(item)
                _save(queue)
        return True


def _worker_loop():
    while True:
        try:
            cfg = load_config()
            delay = max(0, float(cfg.get('mail_send_delay', 30)))
            did_work = _process_one()
            if did_work:
                time.sleep(delay)
            else:
                # No work — poll every 5s
                time.sleep(5)
        except Exception:
            traceback.print_exc()
            time.sleep(10)


def start_worker():
    """Start the background worker thread (idempotent)."""
    global _worker_started
    if _worker_started:
        return
    _worker_started = True
    t = threading.Thread(target=_worker_loop, daemon=True, name='MailQueueWorker')
    t.start()
