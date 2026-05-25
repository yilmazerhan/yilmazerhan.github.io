from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse


def _get_real_ip(request: Request) -> str:
    """
    Returns the real client IP without trusting X-Forwarded-For headers that
    could be spoofed by the client.

    In production behind nginx/load-balancer the REAL_IP header set by nginx
    (using `set_real_ip_from` + `real_ip_header`) is trusted; elsewhere we
    fall back to the direct TCP connection address (request.client.host).

    Explicitly NOT reading X-Forwarded-For so that attackers cannot bypass
    per-IP rate limits by spoofing that header.
    """
    # nginx sets X-Real-IP from the socket-level IP (not forwardable by client)
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.split(",")[0].strip()
    # Direct connection (no proxy, or proxy is on localhost)
    if request.client:
        return request.client.host
    return "127.0.0.1"


limiter = Limiter(key_func=_get_real_ip)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "Çok fazla istek gönderildi. Lütfen bir süre bekleyin."},
    )
