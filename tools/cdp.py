"""Mini client Chrome DevTools Protocol (websocket écrit à la main, stdlib uniquement)."""
import base64, json, os, socket, struct, subprocess, time, urllib.request

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class WS:
    def __init__(self, url):
        assert url.startswith("ws://")
        hostport, path = url[5:].split("/", 1)
        host, port = hostport.split(":")
        self.s = socket.create_connection((host, int(port)))
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\n"
                        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            resp += self.s.recv(1)
        assert b" 101 " in resp.split(b"\r\n")[0], resp

    def send(self, text):
        data = text.encode()
        hdr = bytes([0x81])
        n = len(data)
        if n < 126:
            hdr += bytes([0x80 | n])
        elif n < 65536:
            hdr += bytes([0x80 | 126]) + struct.pack(">H", n)
        else:
            hdr += bytes([0x80 | 127]) + struct.pack(">Q", n)
        mask = os.urandom(4)
        self.s.sendall(hdr + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _exact(self, n):
        buf = bytearray()
        while len(buf) < n:
            chunk = self.s.recv(n - len(buf))
            if not chunk:
                raise ConnectionError("fermé")
            buf += chunk
        return bytes(buf)

    def recv(self):
        msg = bytearray()
        while True:
            b1, b2 = self._exact(2)
            n = b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._exact(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._exact(8))[0]
            payload = self._exact(n)
            msg += payload
            if b1 & 0x80:
                return msg.decode()


class Chrome:
    def __init__(self, profile, port=9333):
        self.proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--mute-audio",
                                      f"--remote-debugging-port={port}", f"--user-data-dir={profile}",
                                      "--no-first-run", "about:blank"],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json"))
                page = [t for t in tabs if t["type"] == "page"][0]
                break
            except Exception:
                time.sleep(0.2)
        self.ws = WS(page["webSocketDebuggerUrl"])
        self.id = 0
        self.events = []

    def call(self, method, **params):
        self.id += 1
        my = self.id
        self.ws.send(json.dumps({"id": my, "method": method, "params": params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == my:
                if "error" in m:
                    raise RuntimeError(f"{method}: {m['error']}")
                return m.get("result", {})
            self.events.append(m)

    def js(self, expr):
        r = self.call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        return r.get("result", {}).get("value")

    def wait(self, expr, timeout=60):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if self.js(expr):
                return True
            time.sleep(0.2)
        return False

    def shot(self, path):
        data = self.call("Page.captureScreenshot", format="png")["data"]
        open(path, "wb").write(base64.b64decode(data))

    def close(self):
        self.proc.terminate()
        self.proc.wait()
