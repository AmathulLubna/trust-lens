"""Operator-configured ICE with short-lived coturn REST credentials.

Shared secret stays server-side. No third-party relay is selected implicitly.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from urllib.parse import urlsplit
from fastapi import HTTPException


def configuration():
    try:
        urls = json.loads(os.environ.get('TRUSTLENS_WEB_ICE_URLS', '[]'))
        if not isinstance(urls, list) or len(urls) > 8:
            raise ValueError()
        for url in urls:
            if not isinstance(url, str) or len(url) > 256 or any(c.isspace() for c in url):
                raise ValueError()
            scheme, address = url.split(':', 1)
            parsed = urlsplit('//' + address)
            if (scheme not in {'stun','stuns','turn','turns'} or not parsed.hostname
                    or parsed.username or parsed.password or parsed.path or parsed.fragment
                    or parsed.query not in {'','transport=udp','transport=tcp'}
                    or (parsed.port is not None and not 1 <= parsed.port <= 65535)):
                raise ValueError()
            if scheme.startswith('stun') and parsed.query:
                raise ValueError()
        turns = [url for url in urls if url.startswith(('turn:', 'turns:'))]
        secret = os.environ.get('TRUSTLENS_WEB_TURN_SECRET', '')
        if turns and len(secret) < 32:
            raise ValueError()
        policy = os.environ.get('TRUSTLENS_WEB_ICE_TRANSPORT_POLICY', 'all')
        if policy not in {'all','relay'} or (policy == 'relay' and not turns):
            raise ValueError()
        return urls, turns, secret, policy
    except (ValueError, TypeError):
        raise HTTPException(503, 'ICE configuration invalid; operator must check relay settings')


def client_configuration():
    urls, turns, secret, policy = configuration()
    servers = [{'urls': url} for url in urls if url not in turns]
    expires = int(time.time()) + 960
    if turns:
        username = f'{expires}:{secrets.token_hex(12)}'
        credential = base64.b64encode(hmac.new(secret.encode(), username.encode(), hashlib.sha1).digest()).decode()
        servers.append({'urls': turns, 'username': username, 'credential': credential})
    return {'iceServers': servers, 'iceTransportPolicy': policy,
            'turnConfigured': bool(turns), 'expiresAt': expires if turns else None}
