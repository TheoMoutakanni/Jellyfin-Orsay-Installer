var ServerVersion = {
		ServerInfo : null
}

ServerVersion.start = function() {
	document.getElementById("pageContent").innerHTML = "<div class='padding60' style='text-align:center'> \
		<p style='padding-bottom:5px;'>The Samsung app requires a later version of the Server - Please update it and restart the app</p>";
	
	document.getElementById("ServerVersion").focus();
}

ServerVersion.compareVersions = function(a, b) {
	var partsA = a.split(".");
	var partsB = b.split(".");
	var len = Math.max(partsA.length, partsB.length);
	for (var i = 0; i < len; i++) {
		var numA = parseInt(partsA[i], 10) || 0;
		var numB = parseInt(partsB[i], 10) || 0;
		if (numA > numB) return 1;
		if (numA < numB) return -1;
	}
	return 0;
}

ServerVersion.checkServerVersion = function() {
	var url = Server.getCustomURL("/System/Info/Public?format=json");
	this.ServerInfo = Server.getContent(url);
	if (this.ServerInfo == null) { return; }

	var requiredServerVersion = Main.getRequiredServerVersion();
	var currentServerVersion = this.ServerInfo.Version;

	if (ServerVersion.compareVersions(currentServerVersion, requiredServerVersion) >= 0) {
		return true;
	} else {
		return false;
	}
}

ServerVersion.keyDown = function() {
	var keyCode = event.keyCode;
	alert("Key pressed: " + keyCode);

	if (document.getElementById("Notifications").style.visibility == "") {
		document.getElementById("Notifications").style.visibility = "hidden";
		document.getElementById("NotificationText").innerHTML = "";
		widgetAPI.blockNavigation(event);
		//Change keycode so it does nothing!
		keyCode = "VOID";
	}
	
	switch(keyCode) {
		default:
			widgetAPI.sendExitEvent();
			break;
	}
}