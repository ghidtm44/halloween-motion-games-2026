#!/usr/bin/env python3
r"""Mac-native regression checks; no Keychain, browser, camera or API access.

Run: python3 native-app-signals.py /absolute/path/to/Simple\ Playground.app
The supplied bundle is read-only. All state is temporary and ports are isolated.
"""
import json
import pathlib
import plistlib
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

bundle = pathlib.Path(sys.argv[1]).resolve()
executable = bundle / 'Contents/MacOS/SimplePlayground'
playground = bundle / 'Contents/Resources/Playground'
results = []
motion_games = plistlib.loads((bundle / 'Contents/Info.plist').read_bytes()).get('PlaygroundEdition') == 'motion'


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def health(port):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=.3) as response:
            return json.load(response)
    except Exception:
        return None


def wait_ready(port, process):
    end = time.monotonic() + 15
    while time.monotonic() < end:
        status = health(port)
        if status and status.get('motionGames' if motion_games else 'spookyHost') and status.get('offlineAssetsReady'):
            return
        if process.poll() is not None:
            raise AssertionError('Process exited before readiness')
        time.sleep(.05)
    raise AssertionError('Server never became ready')


def native(port, directory):
    # The invalid synthetic override fails validation before HostCredential.load,
    # avoiding Keychain access and keeping online requests unconfigured.
    env = {'PATH': '/usr/bin:/bin', 'SIMPLE_PLAYGROUND_TEST_PORT': str(port),
           'SIMPLE_PLAYGROUND_TEST_DATA': str(directory),
           'SIMPLE_PLAYGROUND_TEST_NO_BROWSER': '1',
           'SPOOKY_HOST_API_KEY': 'packaging smoke only'}
    return subprocess.Popen([str(executable)], env=env, stdin=subprocess.DEVNULL,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def cleanup(process):
    if process.poll() is None:
        process.kill()
    process.wait(timeout=5)


def assert_port_closed(port):
    end = time.monotonic() + 2
    while health(port) and time.monotonic() < end:
        time.sleep(.05)
    assert health(port) is None, 'Owned server remains listening after native exit'


for name, sig, repeat in [('SIGTERM', signal.SIGTERM, False),
                          ('SIGINT', signal.SIGINT, False),
                          ('repeated-SIGTERM', signal.SIGTERM, True)]:
    with tempfile.TemporaryDirectory(prefix='spooky-native-signal-') as directory:
        port = free_port()
        process = native(port, directory)
        try:
            wait_ready(port, process)
            # Read only the safe state flags; never print full state.
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/state') as response:
                state = json.load(response)
            assert state['settings']['cameraOn'] is False
            assert state['host']['active'] is False and state['host']['configured'] is False
            start = time.monotonic()
            process.send_signal(sig)
            if repeat and process.poll() is None:
                process.send_signal(sig)
            assert process.wait(timeout=8) == 0, 'Native app did not exit successfully'
            elapsed = time.monotonic() - start
            assert elapsed < 3, 'Native app waited for its fallback instead of normal cleanup'
            assert_port_closed(port)
            results.append({'test': name, 'passed': True, 'shutdownSeconds': round(elapsed, 3),
                            'nativeExited': True, 'ownedServerClosed': True})
        finally:
            cleanup(process)

with tempfile.TemporaryDirectory(prefix='spooky-native-reuse-') as directory:
    port = free_port()
    owner = subprocess.Popen([str(playground / 'runtime/node'), 'scripts/native-runner.mjs'],
                             cwd=playground, stdin=subprocess.PIPE,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             env={'PATH': '/usr/bin:/bin', 'PORT': str(port),
                                  'PLAYGROUND_STATE_FILE': str(pathlib.Path(directory) / 'owner.json'),
                                  'PLAYGROUND_EDITION': 'motion' if motion_games else 'host'})
    client = None
    try:
        wait_ready(port, owner)
        client = native(port, pathlib.Path(directory) / 'client')
        # The existing owner's ready listener predates the native app. Allow its
        # initial health probe to finish before testing the unowned-server path.
        time.sleep(1)
        client.send_signal(signal.SIGTERM)
        assert client.wait(timeout=3) == 0
        assert owner.poll() is None and health(port), 'Native app stopped an unowned server'
        results.append({'test': 'unowned-server-preserved', 'passed': True})
    finally:
        if client is not None:
            cleanup(client)
        if owner.stdin:
            owner.stdin.close()
        try:
            owner.wait(timeout=6)
        finally:
            cleanup(owner)
        assert_port_closed(port)

print(json.dumps({'passed': True, 'bundle': str(bundle), 'tests': results,
                  'keychainAccess': False, 'cameraAccess': False, 'apiRequests': 0}, indent=2))
