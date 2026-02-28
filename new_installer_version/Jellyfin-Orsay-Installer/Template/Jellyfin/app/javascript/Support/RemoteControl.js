var RemoteControl = {
	socket : null,
	keepAliveInterval : null,
	reconnectTimeout : null,
	reconnectAttempts : 0,
	maxReconnectAttempts : 10
}

RemoteControl.connect = function() {
	// Only connect if WebSocket is supported (model year E+ / 2012+)
	if (typeof WebSocket === "undefined") {
		FileLog.write("RemoteControl : WebSocket not supported on this TV model. Remote control disabled.");
		return;
	}

	// Build WebSocket URL from server address
	var serverAddr = Server.getServerAddr();
	// Remove /emby suffix to get base server URL
	var baseUrl = serverAddr.replace(/\/emby$/, "");
	var wsUrl = baseUrl.replace("https://", "wss://").replace("http://", "ws://");
	wsUrl += "/emby/socket?api_key=" + Server.getAuthToken() + "&deviceId=" + Server.getDeviceID();

	FileLog.write("RemoteControl : Connecting to " + Server.sanitizeUrl(wsUrl));

	try {
		this.socket = new WebSocket(wsUrl);
	} catch (e) {
		FileLog.write("RemoteControl : Failed to create WebSocket: " + e);
		return;
	}

	this.socket.onopen = function() {
		FileLog.write("RemoteControl : WebSocket connected.");
		RemoteControl.reconnectAttempts = 0;
		RemoteControl.startKeepAlive(30);
	};

	this.socket.onmessage = function(event) {
		RemoteControl.onMessage(event.data);
	};

	this.socket.onclose = function() {
		FileLog.write("RemoteControl : WebSocket closed.");
		RemoteControl.stopKeepAlive();
		RemoteControl.scheduleReconnect();
	};

	this.socket.onerror = function() {
		FileLog.write("RemoteControl : WebSocket error.");
	};
}

RemoteControl.disconnect = function() {
	this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
	this.stopKeepAlive();
	if (this.reconnectTimeout) {
		clearTimeout(this.reconnectTimeout);
		this.reconnectTimeout = null;
	}
	if (this.socket) {
		this.socket.close();
		this.socket = null;
	}
	FileLog.write("RemoteControl : Disconnected.");
}

RemoteControl.startKeepAlive = function(intervalSeconds) {
	this.stopKeepAlive();
	this.keepAliveInterval = setInterval(function() {
		if (RemoteControl.socket && RemoteControl.socket.readyState === 1) {
			RemoteControl.socket.send(JSON.stringify({"MessageType": "KeepAlive"}));
		}
	}, intervalSeconds * 1000);
}

RemoteControl.stopKeepAlive = function() {
	if (this.keepAliveInterval) {
		clearInterval(this.keepAliveInterval);
		this.keepAliveInterval = null;
	}
}

RemoteControl.scheduleReconnect = function() {
	if (this.reconnectAttempts >= this.maxReconnectAttempts) {
		FileLog.write("RemoteControl : Max reconnect attempts reached.");
		return;
	}
	this.reconnectAttempts++;
	var delay = 5000;
	FileLog.write("RemoteControl : Reconnecting in " + (delay / 1000) + "s (attempt " + this.reconnectAttempts + ")");
	this.reconnectTimeout = setTimeout(function() {
		RemoteControl.connect();
	}, delay);
}

RemoteControl.onMessage = function(rawData) {
	try {
		var msg = JSON.parse(rawData);
	} catch (e) {
		return;
	}

	var type = msg.MessageType;
	var data = msg.Data;

	switch (type) {
		case "ForceKeepAlive":
			// Server requests keep-alive at a specific interval (in seconds)
			if (data) {
				RemoteControl.startKeepAlive(data);
			}
			break;

		case "Play":
			RemoteControl.handlePlayCommand(data);
			break;

		case "Playstate":
			RemoteControl.handlePlaystateCommand(data);
			break;

		case "GeneralCommand":
			RemoteControl.handleGeneralCommand(data);
			break;

		case "SyncPlayCommand":
			SyncPlay.handleSyncPlayCommand(data);
			break;

		case "SyncPlayGroupUpdate":
			SyncPlay.handleSyncPlayGroupUpdate(data);
			break;

		default:
			// Ignore other message types (LibraryChanged, UserDataChanged, etc.)
			break;
	}
}

//------------------------------------------------------------
//      Play Command - start playing an item
//------------------------------------------------------------
RemoteControl.handlePlayCommand = function(data) {
	if (!data || !data.ItemIds || data.ItemIds.length === 0) {
		return;
	}

	var itemId = data.ItemIds[0];
	var startPositionTicks = data.StartPositionTicks || 0;
	// Convert ticks to milliseconds for the player (1 tick = 100ns, so ticks / 10000 = ms)
	var startPositionMs = Math.floor(startPositionTicks / 10000);

	FileLog.write("RemoteControl : Play command received for item " + itemId);

	// Stop any current playback
	if (GuiPlayer.Status == "PLAYING" || GuiPlayer.Status == "PAUSED") {
		GuiPlayer.stopPlayback();
	}
	if (GuiMusicPlayer.Status == "PLAYING" || GuiMusicPlayer.Status == "PAUSED") {
		GuiMusicPlayer.stopPlayback();
	}

	// Fetch item info and start playback (same flow as GuiPage_ItemDetails)
	var url = Server.getItemInfoURL(itemId, "&ExcludeLocationTypes=Virtual");
	var itemData = Server.getContent(url);
	if (itemData == null) {
		FileLog.write("RemoteControl : Failed to fetch item data for " + itemId);
		return;
	}

	if (itemData.MediaType == "Audio") {
		// Audio playback
		GuiMusicPlayer.queuedItems = [itemData];
		GuiMusicPlayer.currentPlayingItem = 0;
		GuiMusicPlayer.videoURL = Server.getServerAddr() + '/Audio/' + itemData.Id + '/Stream.mp3?static=true&MediaSource=' + itemData.MediaSources[0].Id + '&api_key=' + Server.getAuthToken();
		GuiMusicPlayer.handlePlayKey();
	} else {
		// Video playback
		GuiPlayer.start("PLAY", url, startPositionMs, "GuiMainMenu");
	}
}

//------------------------------------------------------------
//      Playstate Command - pause, unpause, stop, seek, etc.
//------------------------------------------------------------
RemoteControl.handlePlaystateCommand = function(data) {
	if (!data || !data.Command) {
		return;
	}

	var command = data.Command;
	FileLog.write("RemoteControl : Playstate command: " + command);

	// Determine which player is active
	var isVideoPlaying = (GuiPlayer.Status == "PLAYING" || GuiPlayer.Status == "PAUSED");
	var isMusicPlaying = (GuiMusicPlayer.Status == "PLAYING" || GuiMusicPlayer.Status == "PAUSED");

	switch (command) {
		case "Stop":
			if (isVideoPlaying) {
				GuiPlayer.stopPlayback();
				Support.processReturnURLHistory();
			} else if (isMusicPlaying) {
				GuiMusicPlayer.stopPlayback();
			}
			break;

		case "Pause":
			if (isVideoPlaying && GuiPlayer.Status == "PLAYING") {
				GuiPlayer.handlePauseKey();
			} else if (isMusicPlaying && GuiMusicPlayer.Status == "PLAYING") {
				GuiMusicPlayer.handlePauseKey();
			}
			break;

		case "Unpause":
			if (isVideoPlaying && GuiPlayer.Status == "PAUSED") {
				GuiPlayer.handlePlayKey();
			} else if (isMusicPlaying && GuiMusicPlayer.Status == "PAUSED") {
				GuiMusicPlayer.handlePlayKey();
			}
			break;

		case "PlayPause":
			if (isVideoPlaying) {
				if (GuiPlayer.Status == "PLAYING") {
					GuiPlayer.handlePauseKey();
				} else {
					GuiPlayer.handlePlayKey();
				}
			} else if (isMusicPlaying) {
				if (GuiMusicPlayer.Status == "PLAYING") {
					GuiMusicPlayer.handlePauseKey();
				} else {
					GuiMusicPlayer.handlePlayKey();
				}
			}
			break;

		case "Seek":
			if (data.SeekPositionTicks != null && isVideoPlaying) {
				GuiPlayer.newPlaybackPosition(data.SeekPositionTicks);
			}
			break;

		case "NextTrack":
			if (isMusicPlaying) {
				GuiMusicPlayer.handleNextKey();
			}
			break;

		case "PreviousTrack":
			if (isMusicPlaying) {
				GuiMusicPlayer.handlePreviousKey();
			}
			break;

		default:
			FileLog.write("RemoteControl : Unhandled playstate command: " + command);
			break;
	}
}

//------------------------------------------------------------
//      General Command - volume, mute, display content, etc.
//------------------------------------------------------------
RemoteControl.handleGeneralCommand = function(data) {
	if (!data || !data.Name) {
		return;
	}

	var name = data.Name;
	var args = data.Arguments || {};

	switch (name) {
		case "SetVolume":
			// Samsung Orsay audio plugin volume control
			try {
				var pluginAudio = document.getElementById("pluginObjectAudio");
				if (pluginAudio && args.Volume != null) {
					pluginAudio.SetVolume(parseInt(args.Volume));
				}
			} catch (e) {
				FileLog.write("RemoteControl : SetVolume failed: " + e);
			}
			break;

		case "Mute":
			try {
				var pluginAudio = document.getElementById("pluginObjectAudio");
				if (pluginAudio) {
					pluginAudio.SetUserMute(true);
				}
			} catch (e) {}
			break;

		case "Unmute":
			try {
				var pluginAudio = document.getElementById("pluginObjectAudio");
				if (pluginAudio) {
					pluginAudio.SetUserMute(false);
				}
			} catch (e) {}
			break;

		case "ToggleMute":
			try {
				var pluginAudio = document.getElementById("pluginObjectAudio");
				if (pluginAudio) {
					var muted = pluginAudio.GetUserMute();
					pluginAudio.SetUserMute(!muted);
				}
			} catch (e) {}
			break;

		case "DisplayContent":
			if (args.ItemId) {
				var url = Server.getItemInfoURL(args.ItemId, null);
				var itemData = Server.getContent(url);
				if (itemData != null) {
					GuiPage_ItemDetails.start(itemData.Name, url);
				}
			}
			break;

		case "GoHome":
			GuiMainMenu.start();
			break;

		default:
			FileLog.write("RemoteControl : Unhandled general command: " + name);
			break;
	}
}
