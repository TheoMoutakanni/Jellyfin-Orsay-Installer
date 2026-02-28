var GuiUsers_QuickConnect = {
	secret : null,
	code : null,
	pollInterval : null
}

GuiUsers_QuickConnect.start = function() {
	alert("Page Enter : GuiUsers_QuickConnect");
	GuiHelper.setControlButtons(null,null,null,null,"Cancel");

	//Reset
	this.secret = null;
	this.code = null;
	this.clearPoll();

	//Display loading
	document.getElementById("pageContent").innerHTML = "<div style='padding-top:150px;text-align:center'>" +
		"<div id='quickConnectStatus' style='font-size:1.4em'>Requesting Quick Connect code...</div>" +
		"<div id='quickConnectCode' style='font-size:3em;padding-top:40px;color:#00a4dc'></div>" +
		"<div style='padding-top:40px;font-size:0.9em;color:#999'>Press RETURN to cancel</div>" +
		"</div>";
	document.getElementById("GuiUsers_QuickConnect").focus();

	//Initiate Quick Connect
	var url = Server.getServerAddr() + "/QuickConnect/Initiate";
	var xmlHttp = new XMLHttpRequest();
	xmlHttp.open("POST", url, false);
	xmlHttp = Server.setRequestHeaders(xmlHttp);
	xmlHttp.send(null);

	if (xmlHttp.status != 200) {
		FileLog.write("QuickConnect : Initiate failed with status " + xmlHttp.status);
		document.getElementById("quickConnectStatus").innerHTML = "Failed to start Quick Connect.";
		return;
	}

	var data = JSON.parse(xmlHttp.responseText);
	this.secret = data.Secret;
	this.code = data.Code;

	FileLog.write("QuickConnect : Code=" + this.code);
	document.getElementById("quickConnectStatus").innerHTML = "Enter this code in another Jellyfin app:";
	document.getElementById("quickConnectCode").innerHTML = this.code;

	//Start polling for authentication
	var self = this;
	this.pollInterval = setInterval(function() {
		self.checkAuthenticated();
	}, 3000);
}

GuiUsers_QuickConnect.checkAuthenticated = function() {
	var url = Server.getServerAddr() + "/QuickConnect/Connect?Secret=" + this.secret;
	var xmlHttp = new XMLHttpRequest();
	xmlHttp.open("GET", url, false);
	xmlHttp = Server.setRequestHeaders(xmlHttp);
	xmlHttp.send(null);

	if (xmlHttp.status != 200) {
		FileLog.write("QuickConnect : Poll failed with status " + xmlHttp.status);
		return;
	}

	var data = JSON.parse(xmlHttp.responseText);
	if (data.Authenticated === true) {
		FileLog.write("QuickConnect : Authenticated!");
		this.clearPoll();
		document.getElementById("quickConnectStatus").innerHTML = "Authenticated! Logging in...";
		document.getElementById("quickConnectCode").innerHTML = "";

		//Authenticate with the secret
		var success = Server.authenticateWithQuickConnect(this.secret);
		if (success) {
			//Save user to file
			File.addUser(Server.getUserID(), Server.getUserName(), "", false);
			GuiMainMenu.start();
		} else {
			document.getElementById("quickConnectStatus").innerHTML = "Authentication failed. Press RETURN to go back.";
		}
	}
}

GuiUsers_QuickConnect.clearPoll = function() {
	if (this.pollInterval) {
		clearInterval(this.pollInterval);
		this.pollInterval = null;
	}
}

GuiUsers_QuickConnect.keyDown = function() {
	var keyCode = event.keyCode;
	alert("Key pressed: " + keyCode);

	if (document.getElementById("Notifications").style.visibility == "") {
		document.getElementById("Notifications").style.visibility = "hidden";
		document.getElementById("NotificationText").innerHTML = "";
		widgetAPI.blockNavigation(event);
		keyCode = "VOID";
	}

	switch(keyCode) {
		case tvKey.KEY_RETURN:
		case tvKey.KEY_PANEL_RETURN:
			alert("RETURN");
			widgetAPI.blockNavigation(event);
			this.clearPoll();
			GuiUsers.start();
			break;
		case tvKey.KEY_EXIT:
			alert("EXIT KEY");
			this.clearPoll();
			widgetAPI.sendExitEvent();
			break;
		default:
			break;
	}
}
