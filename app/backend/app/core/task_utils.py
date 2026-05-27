"""
Utilities for safely dispatching Celery tasks without blocking the API.

When the broker (Redis) is unavailable, `task.delay()` can hang indefinitely
waiting for a socket connection. These helpers run the dispatch in a thread
with a short timeout so the API response is never delayed by broker issues.
"""

import logging
import threading
from typing import Callable

logger = logging.getLogger(__name__)

_DISPATCH_TIMEOUT = 3.0  # seconds — if broker doesn't accept in 3s, give up


def fire_and_forget(task_fn: Callable, *args, **kwargs) -> None:
    """
    Call `task_fn.delay(*args, **kwargs)` in a background thread.
    If it doesn't complete within _DISPATCH_TIMEOUT seconds, log a warning
    and move on — the API response is never blocked by broker unavailability.
    """
    result_holder = [None]
    exc_holder = [None]

    def _dispatch():
        try:
            result_holder[0] = task_fn.delay(*args, **kwargs)
        except Exception as e:
            exc_holder[0] = e

    t = threading.Thread(target=_dispatch, daemon=True)
    t.start()
    t.join(timeout=_DISPATCH_TIMEOUT)

    if t.is_alive():
        logger.warning(
            "Celery task dispatch timed out after %.1fs (broker unavailable?). "
            "Task %s will not be queued.",
            _DISPATCH_TIMEOUT, getattr(task_fn, "__name__", repr(task_fn)),
        )
    elif exc_holder[0]:
        logger.warning(
            "Celery task dispatch failed: %s — task %s not queued.",
            exc_holder[0], getattr(task_fn, "__name__", repr(task_fn)),
        )
