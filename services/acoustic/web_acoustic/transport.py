import os
from starlette.responses import JSONResponse

class SecureTransportMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            host = (scope.get("client") or ("",))[0]
            if scope.get("scheme") != "https" and host not in {"127.0.0.1", "::1"} and os.environ.get("TRUSTLENS_WEB_ALLOW_HTTP_DEV") != "true":
                return await JSONResponse({"detail": "HTTPS required"}, status_code=426)(scope, receive, send)
        await self.app(scope, receive, send)
