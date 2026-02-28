"""
Mimics the Samsung Orsay TV app's connection flow against a Jellyfin server.
Tests: connection → version check → authentication → capabilities → WebSocket → remote commands.

Usage:
    python3 test_connection.py --server https://your-server.com
    python3 test_connection.py --server https://your-server.com --username user --password pass
"""

import argparse
import json
import sys
import uuid
import time

# --- Constants matching Main.js and Server.js ---
APP_VERSION = "v2.2.5b"
REQUIRED_SERVER_VERSION = "10.3.2"
DEVICE_NAME = "Samsung Smart TV"
DEVICE_ID = "test-" + uuid.uuid4().hex[:16]
CLIENT_NAME = "Samsung TV"
SESSION_ID = None  # Set after authentication


def make_headers(user_id=None, token=None):
    """Build MediaBrowser auth headers matching Server.setRequestHeaders()"""
    uid = user_id or ""
    auth = (
        f'MediaBrowser Client="{CLIENT_NAME}", '
        f'Device="{DEVICE_NAME}", '
        f'DeviceId="{DEVICE_ID}", '
        f'Version="{APP_VERSION}", '
        f'UserId="{uid}"'
    )
    headers = {
        "Authorization": auth,
        "Content-Type": "application/json; charset=UTF-8",
    }
    if token:
        headers["X-MediaBrowser-Token"] = token
    return headers


def step1_test_connection(session, base_url):
    """Mimics Server.testConnectionSettings() — GET /emby/System/Info/Public"""
    url = f"{base_url}/emby/System/Info/Public?format=json"
    print(f"\n[Step 1] Testing connection: GET {url}")

    resp = session.get(url, headers={"Content-Type": "application/json"}, timeout=10)

    if resp.status_code != 200:
        print(f"  FAIL — HTTP {resp.status_code}")
        if resp.status_code == 0 or resp.status_code >= 500:
            print("  → Server is not responding (same as TV error: 'Your Jellyfin server is not responding.')")
        return None

    info = resp.json()
    print(f"  OK — Server recognized!")
    print(f"  Server Name: {info.get('ServerName', 'N/A')}")
    print(f"  Server ID:   {info.get('Id', 'N/A')}")
    print(f"  Version:     {info.get('Version', 'N/A')}")
    print(f"  Local Addr:  {info.get('LocalAddress', 'N/A')}")
    return info


def parse_version(v):
    """Parse version string into tuple of ints for proper comparison."""
    try:
        return tuple(int(x) for x in v.split("."))
    except ValueError:
        return (0,)


def step2_check_version(info):
    """Mimics ServerVersion.checkServerVersion() — with proper numeric comparison.
    NOTE: The TV app uses string comparison (>=) which is buggy for versions like
    10.11.x vs 10.3.x. This script uses proper numeric comparison."""
    current = info.get("Version", "0.0.0")
    print(f"\n[Step 2] Version check: server={current}, required>={REQUIRED_SERVER_VERSION}")

    # Proper numeric comparison
    if parse_version(current) >= parse_version(REQUIRED_SERVER_VERSION):
        print(f"  OK — Version is compatible.")
        # Warn about the TV app bug
        if current >= REQUIRED_SERVER_VERSION:
            pass  # String comparison also passes, no issue
        else:
            print(f"  WARNING — The TV app uses string comparison which would FAIL here!")
            print(f"    ('{current}' < '{REQUIRED_SERVER_VERSION}' lexicographically)")
            print(f"    Bug in ServerVersion.js — needs a fix for this to work on the TV.")
        return True
    else:
        print(f"  FAIL — Server version too old. TV would show: 'Please update it and restart the app'")
        return False


def step3_authenticate(session, base_url, username, password):
    """Mimics Server.Authenticate()"""
    global SESSION_ID
    url = f"{base_url}/emby/Users/AuthenticateByName?format=json"
    payload = json.dumps({"Username": username, "Pw": password})
    headers = make_headers()

    print(f"\n[Step 3] Authenticating as '{username}': POST {url}")

    resp = session.post(url, data=payload, headers=headers, timeout=10)

    if resp.status_code != 200:
        print(f"  FAIL — HTTP {resp.status_code}")
        return None, None

    data = resp.json()
    token = data.get("AccessToken")
    user_id = data["User"]["Id"]
    SESSION_ID = data.get("SessionInfo", {}).get("Id")
    print(f"  OK — Authenticated!")
    print(f"  User ID:    {user_id}")
    print(f"  Session ID: {SESSION_ID}")
    print(f"  Token:      {token[:8]}...{token[-4:]}" if token else "  Token: None")
    return user_id, token


def step4_post_capabilities(session, base_url, user_id, token):
    """Mimics Server.postCapabilities()"""
    url = f"{base_url}/emby/Sessions/Capabilities/Full"
    headers = make_headers(user_id, token)
    payload = json.dumps({
        "PlayableMediaTypes": ["Audio", "Video"],
        "SupportsMediaControl": True,
        "SupportsPersistentIdentifier": False,
        "SupportedCommands": [
            "SetAudioStreamIndex", "SetSubtitleStreamIndex",
            "Mute", "Unmute", "ToggleMute", "SetVolume",
            "DisplayContent", "DisplayMessage", "GoHome",
        ],
    })

    print(f"\n[Step 4] Posting capabilities: POST {url}")

    resp = session.post(url, data=payload, headers=headers, timeout=10)

    if resp.status_code == 204 or resp.status_code == 200:
        print(f"  OK — Capabilities registered (SupportsMediaControl=true).")
        return True
    else:
        print(f"  FAIL — HTTP {resp.status_code}: {resp.text[:200]}")
        return False


def step5_test_websocket(base_url, token):
    """Mimics RemoteControl.connect()"""
    try:
        import websockets
        import asyncio
    except ImportError:
        print(f"\n[Step 5] WebSocket test: SKIPPED (install websockets: pip3 install websockets)")
        return

    ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://")
    ws_url += f"/emby/socket?api_key={token}&deviceId={DEVICE_ID}"
    # Mask token in output
    display_url = ws_url.replace(token, token[:8] + "...***")

    print(f"\n[Step 5] WebSocket test: {display_url}")

    async def test_ws():
        try:
            async with websockets.connect(ws_url, close_timeout=5) as ws:
                print(f"  OK — WebSocket connected!")

                # Send keep-alive like the TV app does
                await ws.send(json.dumps({"MessageType": "KeepAlive"}))
                print(f"  Sent KeepAlive.")

                # Wait for a message from the server
                import asyncio as aio
                try:
                    msg = await aio.wait_for(ws.recv(), timeout=3)
                    parsed = json.loads(msg)
                    print(f"  Received: MessageType={parsed.get('MessageType', 'unknown')}")
                except aio.TimeoutError:
                    print(f"  No message received in 3s (normal — server sends on events).")

                print(f"  OK — WebSocket is working. Remote control will function.")
        except Exception as e:
            print(f"  FAIL — {e}")

    asyncio.run(test_ws())


def find_session_id(session, base_url, user_id, token):
    """Find the session ID for our device by querying active sessions."""
    global SESSION_ID
    if SESSION_ID:
        return SESSION_ID
    url = f"{base_url}/emby/Sessions?format=json"
    headers = make_headers(user_id, token)
    resp = session.get(url, headers=headers, timeout=10)
    if resp.status_code == 200:
        for s in resp.json():
            if s.get("DeviceId") == DEVICE_ID:
                SESSION_ID = s["Id"]
                return SESSION_ID
    return None


def step6_test_remote_commands(http_session, base_url, user_id, token):
    """Send remote commands via REST API and verify they arrive on the WebSocket.
    This simulates what the Jellyfin Android app does when controlling the TV."""
    try:
        import websockets
        import asyncio
    except ImportError:
        print(f"\n[Step 6] Remote command test: SKIPPED (install websockets: pip3 install websockets)")
        return

    session_id = find_session_id(http_session, base_url, user_id, token)
    if not session_id:
        print(f"\n[Step 6] Remote command test: FAIL — Could not find session ID for this device.")
        return

    headers = make_headers(user_id, token)
    ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://")
    ws_url += f"/emby/socket?api_key={token}&deviceId={DEVICE_ID}"

    # Define all commands to test, grouped by type
    # Each entry: (description, method, url_path, body_or_none, expected_ws_type)
    commands = [
        # --- PlaystateCommands (via POST /Sessions/{id}/Playing/{command}) ---
        (
            "Playstate: Pause",
            "POST",
            f"/emby/Sessions/{session_id}/Playing/Pause",
            None,
            "Playstate",
        ),
        (
            "Playstate: Unpause",
            "POST",
            f"/emby/Sessions/{session_id}/Playing/Unpause",
            None,
            "Playstate",
        ),
        (
            "Playstate: Stop",
            "POST",
            f"/emby/Sessions/{session_id}/Playing/Stop",
            None,
            "Playstate",
        ),
        (
            "Playstate: Seek",
            "POST",
            f"/emby/Sessions/{session_id}/Playing/Seek?seekPositionTicks=300000000",
            None,
            "Playstate",
        ),
        (
            "Playstate: NextTrack",
            "POST",
            f"/emby/Sessions/{session_id}/Playing/NextTrack",
            None,
            "Playstate",
        ),
        (
            "Playstate: PreviousTrack",
            "POST",
            f"/emby/Sessions/{session_id}/Playing/PreviousTrack",
            None,
            "Playstate",
        ),
        # --- GeneralCommands (via POST /Sessions/{id}/Command/{command}) ---
        (
            "GeneralCommand: SetVolume",
            "POST",
            f"/emby/Sessions/{session_id}/Command/SetVolume?Volume=50",
            None,
            "GeneralCommand",
        ),
        (
            "GeneralCommand: Mute",
            "POST",
            f"/emby/Sessions/{session_id}/Command/Mute",
            None,
            "GeneralCommand",
        ),
        (
            "GeneralCommand: Unmute",
            "POST",
            f"/emby/Sessions/{session_id}/Command/Unmute",
            None,
            "GeneralCommand",
        ),
        (
            "GeneralCommand: ToggleMute",
            "POST",
            f"/emby/Sessions/{session_id}/Command/ToggleMute",
            None,
            "GeneralCommand",
        ),
        (
            "GeneralCommand: SetAudioStreamIndex",
            "POST",
            f"/emby/Sessions/{session_id}/Command/SetAudioStreamIndex?Index=0",
            None,
            "GeneralCommand",
        ),
        (
            "GeneralCommand: SetSubtitleStreamIndex",
            "POST",
            f"/emby/Sessions/{session_id}/Command/SetSubtitleStreamIndex?Index=0",
            None,
            "GeneralCommand",
        ),
        (
            "GeneralCommand: DisplayMessage",
            "POST",
            f"/emby/Sessions/{session_id}/Command",
            {"Name": "DisplayMessage", "Arguments": {"Header": "Test", "Text": "Hello from test script", "TimeoutMs": "3000"}},
            "GeneralCommand",
        ),
        (
            "GeneralCommand: GoHome",
            "POST",
            f"/emby/Sessions/{session_id}/Command/GoHome",
            None,
            "GeneralCommand",
        ),
        (
            "GeneralCommand: DisplayContent",
            "POST",
            f"/emby/Sessions/{session_id}/Command/DisplayContent?ItemId=test123&ItemName=TestItem&ItemType=Movie",
            None,
            "GeneralCommand",
        ),
    ]

    # Get a playable item for the Play command test
    items_url = f"{base_url}/emby/Users/{user_id}/Items?format=json&IncludeItemTypes=Movie,Episode&Recursive=true&Limit=1"
    items_resp = http_session.get(items_url, headers=headers, timeout=10)
    if items_resp.status_code == 200:
        items = items_resp.json().get("Items", [])
        if items:
            item_id = items[0]["Id"]
            item_name = items[0].get("Name", "Unknown")
            commands.insert(0, (
                f"PlayCommand: PlayNow ({item_name})",
                "POST",
                f"/emby/Sessions/{session_id}/Playing?ItemIds={item_id}&StartPositionTicks=0&PlayCommand=PlayNow",
                None,
                "Play",
            ))
        else:
            print(f"  (No playable items found — skipping PlayCommand test)")
    else:
        print(f"  (Could not query items — skipping PlayCommand test)")

    print(f"\n[Step 6] Testing remote commands (Session: {session_id})")
    print(f"  Sending {len(commands)} commands via REST API, verifying delivery on WebSocket...\n")

    async def run_command_tests():
        passed = 0
        failed = 0

        async with websockets.connect(ws_url, close_timeout=5) as ws:
            # Drain any initial messages (ForceKeepAlive, etc.)
            try:
                while True:
                    await asyncio.wait_for(ws.recv(), timeout=1)
            except asyncio.TimeoutError:
                pass

            for desc, method, path, body, expected_type in commands:
                url = base_url + path
                try:
                    if body:
                        resp = http_session.post(url, data=json.dumps(body), headers=headers, timeout=5)
                    else:
                        resp = http_session.post(url, headers=headers, timeout=5)

                    if resp.status_code not in (200, 204):
                        print(f"  FAIL  {desc}")
                        print(f"        REST API returned HTTP {resp.status_code}: {resp.text[:120]}")
                        failed += 1
                        continue

                    # Check if the command arrived on the WebSocket
                    try:
                        msg = await asyncio.wait_for(ws.recv(), timeout=3)
                        parsed = json.loads(msg)
                        received_type = parsed.get("MessageType", "")

                        if received_type == expected_type:
                            detail = ""
                            data = parsed.get("Data", {})
                            if received_type == "Playstate":
                                detail = f" Command={data.get('Command', '?')}"
                            elif received_type == "GeneralCommand":
                                detail = f" Name={data.get('Name', '?')}"
                            elif received_type == "Play":
                                detail = f" PlayCommand={data.get('PlayCommand', '?')}"
                            print(f"  OK    {desc}{detail}")
                            passed += 1
                        else:
                            print(f"  FAIL  {desc}")
                            print(f"        Expected MessageType={expected_type}, got {received_type}")
                            failed += 1
                    except asyncio.TimeoutError:
                        print(f"  FAIL  {desc}")
                        print(f"        REST API returned OK but no WebSocket message received in 3s")
                        failed += 1

                except Exception as e:
                    print(f"  FAIL  {desc}")
                    print(f"        Error: {e}")
                    failed += 1

                # Small delay between commands
                await asyncio.sleep(0.3)

        print(f"\n  Results: {passed} passed, {failed} failed, {len(commands)} total")

    asyncio.run(run_command_tests())


def step7_test_quick_connect(http_session, base_url, user_id, token):
    """Test Quick Connect initiation (mimics GuiUsers_QuickConnect.start)"""
    headers = make_headers(user_id, token)

    # Check if Quick Connect is enabled
    enabled_url = f"{base_url}/emby/QuickConnect/Enabled"
    print(f"\n[Step 7] Quick Connect test: GET {enabled_url}")

    resp = http_session.get(enabled_url, headers=headers, timeout=10)
    if resp.status_code != 200:
        print(f"  SKIP — HTTP {resp.status_code} (Quick Connect endpoint not available)")
        return

    enabled = resp.json()
    print(f"  Quick Connect enabled: {enabled}")

    if not enabled:
        print(f"  SKIP — Quick Connect is disabled on this server.")
        return

    # Initiate Quick Connect
    initiate_url = f"{base_url}/emby/QuickConnect/Initiate"
    resp = http_session.post(initiate_url, headers=headers, timeout=10)
    if resp.status_code != 200:
        print(f"  FAIL — Initiate returned HTTP {resp.status_code}")
        return

    data = resp.json()
    code = data.get("Code")
    secret = data.get("Secret")
    print(f"  OK — Code: {code}")
    print(f"  Secret: {secret[:8]}...***" if secret else "  Secret: None")

    if code and len(str(code)) >= 4:
        print(f"  OK — Quick Connect code format is valid ({len(str(code))} digits).")
    else:
        print(f"  WARN — Quick Connect code format unexpected: {code}")


def step8_test_syncplay(http_session, base_url, user_id, token):
    """Test SyncPlay group creation and listing"""
    headers = make_headers(user_id, token)

    print(f"\n[Step 8] SyncPlay test")

    # List existing groups
    list_url = f"{base_url}/emby/SyncPlay/List"
    resp = http_session.get(list_url, headers=headers, timeout=10)
    if resp.status_code != 200:
        print(f"  SKIP — SyncPlay List returned HTTP {resp.status_code} (may not be supported)")
        return

    groups = resp.json()
    print(f"  OK — {len(groups)} existing SyncPlay group(s) found.")

    # Create a test group
    new_url = f"{base_url}/emby/SyncPlay/New"
    resp = http_session.post(new_url, data=json.dumps({"GroupName": "Test Group (Orsay)"}),
                              headers=headers, timeout=10)
    if resp.status_code in (200, 204):
        print(f"  OK — Created test SyncPlay group.")

        # Leave the group immediately
        leave_url = f"{base_url}/emby/SyncPlay/Leave"
        resp = http_session.post(leave_url, headers=headers, timeout=10)
        if resp.status_code in (200, 204):
            print(f"  OK — Left the group successfully.")
        else:
            print(f"  WARN — Leave returned HTTP {resp.status_code}")
    else:
        print(f"  FAIL — Create group returned HTTP {resp.status_code}: {resp.text[:120]}")


def step9_test_trickplay(http_session, base_url, user_id, token):
    """Test trickplay metadata availability"""
    headers = make_headers(user_id, token)

    print(f"\n[Step 9] Trickplay test")

    # Find a video item to check for trickplay data
    items_url = f"{base_url}/emby/Users/{user_id}/Items?format=json&IncludeItemTypes=Movie,Episode&Recursive=true&Limit=5&Fields=Trickplay"
    resp = http_session.get(items_url, headers=headers, timeout=10)

    if resp.status_code != 200:
        print(f"  FAIL — Could not fetch items: HTTP {resp.status_code}")
        return

    items = resp.json().get("Items", [])
    if not items:
        print(f"  SKIP — No video items found to check trickplay data.")
        return

    found_trickplay = False
    for item in items:
        name = item.get("Name", "Unknown")
        trickplay = item.get("Trickplay")
        if trickplay:
            found_trickplay = True
            for source_id, widths in trickplay.items():
                for width, meta in widths.items():
                    print(f"  OK — '{name}' has trickplay: {width}px, "
                          f"tiles={meta.get('TileWidth', '?')}x{meta.get('TileHeight', '?')}, "
                          f"count={meta.get('ThumbnailCount', '?')}, "
                          f"interval={meta.get('Interval', '?')}ms")
            break

    if not found_trickplay:
        print(f"  INFO — No trickplay data found in the first {len(items)} items.")
        print(f"  (Enable trickplay generation in Jellyfin 10.9+ server settings)")


def main():
    parser = argparse.ArgumentParser(description="Test Jellyfin server connection (mimics Samsung Orsay TV app)")
    parser.add_argument("--server", required=True, help="Jellyfin server URL (e.g. https://your-server.com)")
    parser.add_argument("--username", default=None, help="Username for authentication (optional)")
    parser.add_argument("--password", default=None, help="Password for authentication (optional)")
    args = parser.parse_args()

    import requests
    session = requests.Session()
    base_url = args.server.rstrip("/")

    print(f"=== Jellyfin Orsay TV App Connection Test ===")
    print(f"Server:    {base_url}")
    print(f"Client:    {CLIENT_NAME} {APP_VERSION}")
    print(f"DeviceId:  {DEVICE_ID}")

    # Step 1: Test connection (public endpoint, no auth needed)
    info = step1_test_connection(session, base_url)
    if info is None:
        print("\nConnection failed. The TV app would show an error and return to the server entry page.")
        sys.exit(1)

    # Step 2: Check version
    if not step2_check_version(info):
        print("\nVersion check failed. The TV app would show: 'Please update it and restart the app'")
        sys.exit(1)

    # Step 3+: Authentication (optional)
    if args.username:
        password = args.password or ""
        user_id, token = step3_authenticate(session, base_url, args.username, password)
        if not token:
            print("\nAuthentication failed. The TV app would return to the user selection page.")
            sys.exit(1)

        # Step 4: Post capabilities
        step4_post_capabilities(session, base_url, user_id, token)

        # Step 5: WebSocket
        step5_test_websocket(base_url, token)

        # Step 6: Remote commands
        step6_test_remote_commands(session, base_url, user_id, token)

        # Step 7: Quick Connect
        step7_test_quick_connect(session, base_url, user_id, token)

        # Step 8: SyncPlay
        step8_test_syncplay(session, base_url, user_id, token)

        # Step 9: Trickplay
        step9_test_trickplay(session, base_url, user_id, token)
    else:
        print("\n[Steps 3-9] Skipped — pass --username to test authentication, capabilities, WebSocket, commands, Quick Connect, SyncPlay, and Trickplay.")

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
