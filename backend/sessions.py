"""Bounded, thread-safe workstation sessions with explicit revocation."""
import secrets, threading, time
from fastapi import HTTPException

class Sessions:
    def __init__(self, ttl=7*86400, clock=time.time):
        self.ttl, self.clock = ttl, clock
        self.tokens, self.attempts = {}, {}
        self.lock = threading.RLock()

    def prune(self):
        now = self.clock()
        self.tokens = {k:v for k,v in self.tokens.items() if v > now}
        self.attempts = {k:[t for t in v if t > now-60] for k,v in self.attempts.items() if v and v[-1] > now-60}

    def allowed(self, token):
        with self.lock:
            self.prune()
            return self.tokens.get(token or '', 0) > self.clock()

    def attempt(self, host):
        with self.lock:
            self.prune()
            if host not in self.attempts and len(self.attempts) >= 2048:
                raise HTTPException(429, 'Sign-in is busy. Try again in one minute.')
            values = self.attempts.setdefault(host, [])
            if len(values) >= 10: raise HTTPException(429, 'Too many attempts. Try again in one minute.')
            values.append(self.clock())

    def issue(self, previous=None):
        with self.lock:
            self.prune()
            self.tokens.pop(previous, None)
            if len(self.tokens) >= 256:
                self.tokens.pop(min(self.tokens, key=self.tokens.get))
            token = secrets.token_urlsafe(32)
            self.tokens[token] = self.clock()+self.ttl
            return token

    def revoke(self, token):
        with self.lock: self.tokens.pop(token, None)
