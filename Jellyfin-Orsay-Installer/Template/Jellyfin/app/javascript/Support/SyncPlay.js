var SyncPlay = {
	groupId : null,
	isEnabled : false,
	lastPing : 0,
	timeDiff : 0,
	pingInterval : null
}

//------------------------------------------------------------
//      Group Management
//------------------------------------------------------------

SyncPlay.createGroup = function(name) {
	var url = Server.getServerAddr() + "/SyncPlay/New";
	var xmlHttp = new XMLHttpRequest();
	xmlHttp.open("POST", url, false);
	xmlHttp = Server.setRequestHeaders(xmlHttp);
	xmlHttp.send(JSON.stringify({"GroupName": name}));

	if (xmlHttp.status == 204 || xmlHttp.status == 200) {
		FileLog.write("SyncPlay : Group created: " + name);
		return true;
	}
	FileLog.write("SyncPlay : Failed to create group, status " + xmlHttp.status);
	return false;
}

SyncPlay.listGroups = function() {
	var url = Server.getServerAddr() + "/SyncPlay/List";
	var data = Server.getContent(url);
	return data || [];
}

SyncPlay.joinGroup = function(groupId) {
	var url = Server.getServerAddr() + "/SyncPlay/Join";
	var xmlHttp = new XMLHttpRequest();
	xmlHttp.open("POST", url, false);
	xmlHttp = Server.setRequestHeaders(xmlHttp);
	xmlHttp.send(JSON.stringify({"GroupId": groupId}));

	if (xmlHttp.status == 204 || xmlHttp.status == 200) {
		this.groupId = groupId;
		this.isEnabled = true;
		this.startPingInterval();
		FileLog.write("SyncPlay : Joined group " + groupId);
		return true;
	}
	FileLog.write("SyncPlay : Failed to join group, status " + xmlHttp.status);
	return false;
}

SyncPlay.leaveGroup = function() {
	var url = Server.getServerAddr() + "/SyncPlay/Leave";
	var xmlHttp = new XMLHttpRequest();
	xmlHttp.open("POST", url, true);
	xmlHttp = Server.setRequestHeaders(xmlHttp);
	xmlHttp.send(null);

	this.groupId = null;
	this.isEnabled = false;
	this.stopPingInterval();
	FileLog.write("SyncPlay : Left group");
}

//------------------------------------------------------------
//      Playback Control (send to server)
//------------------------------------------------------------

SyncPlay.requestPause = function() {
	Server.POST(Server.getServerAddr() + "/SyncPlay/Pause");
	FileLog.write("SyncPlay : Requested pause");
}

SyncPlay.requestUnpause = function() {
	Server.POST(Server.getServerAddr() + "/SyncPlay/Unpause");
	FileLog.write("SyncPlay : Requested unpause");
}

SyncPlay.requestSeek = function(positionTicks) {
	Server.POST(Server.getServerAddr() + "/SyncPlay/Seek", {"PositionTicks": positionTicks});
	FileLog.write("SyncPlay : Requested seek to " + positionTicks);
}

SyncPlay.signalReady = function(positionTicks, isPlaying, playlistItemId) {
	Server.POST(Server.getServerAddr() + "/SyncPlay/Ready", {
		"When": new Date(Date.now() + this.timeDiff).toISOString(),
		"PositionTicks": positionTicks,
		"IsPlaying": isPlaying,
		"PlaylistItemId": playlistItemId || "0"
	});
}

//------------------------------------------------------------
//      Time Sync / Ping
//------------------------------------------------------------

SyncPlay.startPingInterval = function() {
	this.stopPingInterval();
	var self = this;
	this.pingInterval = setInterval(function() {
		self.measurePing();
	}, 10000);
	this.measurePing();
}

SyncPlay.stopPingInterval = function() {
	if (this.pingInterval) {
		clearInterval(this.pingInterval);
		this.pingInterval = null;
	}
}

SyncPlay.measurePing = function() {
	var sendTime = Date.now();
	var url = Server.getServerAddr() + "/SyncPlay/Ping";
	var xmlHttp = new XMLHttpRequest();
	xmlHttp.open("POST", url, false);
	xmlHttp = Server.setRequestHeaders(xmlHttp);
	xmlHttp.send(JSON.stringify({"Ping": this.lastPing}));

	var receiveTime = Date.now();
	this.lastPing = receiveTime - sendTime;
}

SyncPlay.scheduleAction = function(serverWhenISO, action) {
	var serverWhen = new Date(serverWhenISO).getTime();
	var localNow = Date.now();
	var delay = serverWhen - localNow - this.timeDiff;
	if (delay < 0) { delay = 0; }
	setTimeout(action, delay);
}

//------------------------------------------------------------
//      WebSocket Message Handlers (receive from server)
//------------------------------------------------------------

SyncPlay.handleSyncPlayCommand = function(data) {
	if (!data || !data.Command) {
		FileLog.write("SyncPlay : Received command with no data");
		return;
	}

	var command = data.Command;
	FileLog.write("SyncPlay : Command received: " + command);

	switch (command) {
		case "Pause":
			if (GuiPlayer.Status == "PLAYING") {
				GuiPlayer.plugin.Pause();
				GuiPlayer.Status = "PAUSED";
				FileLog.write("SyncPlay : Paused");
			}
			break;

		case "Unpause":
			if (data.When) {
				var self = this;
				this.scheduleAction(data.When, function() {
					if (GuiPlayer.Status == "PAUSED") {
						GuiPlayer.plugin.Resume();
						GuiPlayer.Status = "PLAYING";
						FileLog.write("SyncPlay : Unpaused at scheduled time");
					}
				});
			} else {
				if (GuiPlayer.Status == "PAUSED") {
					GuiPlayer.plugin.Resume();
					GuiPlayer.Status = "PLAYING";
				}
			}
			break;

		case "Seek":
			if (data.PositionTicks != null) {
				GuiPlayer.newPlaybackPosition(data.PositionTicks);
				FileLog.write("SyncPlay : Seeked to " + data.PositionTicks);
			}
			break;

		case "Stop":
			if (GuiPlayer.Status == "PLAYING" || GuiPlayer.Status == "PAUSED") {
				GuiPlayer.stopPlayback();
				GuiPlayer_Display.restorePreviousMenu();
				FileLog.write("SyncPlay : Stopped");
			}
			break;

		default:
			FileLog.write("SyncPlay : Unhandled command: " + command);
			break;
	}
}

SyncPlay.handleSyncPlayGroupUpdate = function(data) {
	if (!data || !data.Type) {
		return;
	}

	FileLog.write("SyncPlay : GroupUpdate type: " + data.Type);

	switch (data.Type) {
		case "GroupJoined":
			this.groupId = data.GroupId || this.groupId;
			this.isEnabled = true;
			this.startPingInterval();
			GuiNotifications.setNotification("Joined SyncPlay group", "SyncPlay");
			break;

		case "GroupLeft":
			this.groupId = null;
			this.isEnabled = false;
			this.stopPingInterval();
			GuiNotifications.setNotification("Left SyncPlay group", "SyncPlay");
			break;

		case "UserJoined":
			var userName = (data.Data && data.Data.UserName) ? data.Data.UserName : "A user";
			GuiNotifications.setNotification(userName + " joined the group", "SyncPlay");
			break;

		case "UserLeft":
			var userName = (data.Data && data.Data.UserName) ? data.Data.UserName : "A user";
			GuiNotifications.setNotification(userName + " left the group", "SyncPlay");
			break;

		case "StateUpdate":
		case "PlayQueue":
			//Handle state/queue updates if needed in the future
			break;

		default:
			FileLog.write("SyncPlay : Unhandled group update type: " + data.Type);
			break;
	}
}
