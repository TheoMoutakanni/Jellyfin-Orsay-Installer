var GuiPage_SyncPlay = {
	groups : [],
	selectedItem : 0,
	topLeftItem : 0,
	maxDisplay : 5
}

GuiPage_SyncPlay.start = function() {
	alert("Page Enter : GuiPage_SyncPlay");
	Support.updateURLHistory("GuiPage_SyncPlay");

	var redButton = SyncPlay.isEnabled ? "Leave Group" : null;
	GuiHelper.setControlButtons(redButton, "Create Group", null, null, "Return");

	//Reset
	this.groups = [];
	this.selectedItem = 0;
	this.topLeftItem = 0;

	//Fetch groups
	this.groups = SyncPlay.listGroups();

	//Build page
	var html = "<div class='guiDisplay_Series-pageContent'>";
	html += "<div style='font-size:1.4em;padding:20px 60px'>SyncPlay - Watch Together</div>";

	if (SyncPlay.isEnabled) {
		html += "<div style='padding:10px 60px;color:#00a4dc'>Currently in a group. Press RED to leave.</div>";
	}

	html += "<div id='syncPlayGroups' style='padding:20px 60px'></div>";
	html += "</div>";

	document.getElementById("pageContent").innerHTML = html;
	this.updateDisplayedItems();
	this.updateSelectedItems();
	document.getElementById("GuiPage_SyncPlay").focus();
}

GuiPage_SyncPlay.updateDisplayedItems = function() {
	var container = document.getElementById("syncPlayGroups");
	if (!container) return;
	container.innerHTML = "";

	if (this.groups.length == 0) {
		container.innerHTML = "<div style='color:#999;padding:20px 0'>No SyncPlay groups found. Press GREEN to create one.</div>";
		return;
	}

	for (var index = this.topLeftItem; index < Math.min(this.groups.length, this.topLeftItem + this.maxDisplay); index++) {
		var group = this.groups[index];
		var name = group.GroupName || ("Group " + group.GroupId);
		var participants = group.Participants ? group.Participants.length : 0;
		container.innerHTML += "<div id='syncPlayGroup" + index + "' class='videoToolsOption' style='padding:15px;margin:5px 0'>" +
			name + " <span style='color:#999'>(" + participants + " participants)</span></div>";
	}
}

GuiPage_SyncPlay.updateSelectedItems = function() {
	for (var index = this.topLeftItem; index < Math.min(this.groups.length, this.topLeftItem + this.maxDisplay); index++) {
		var el = document.getElementById("syncPlayGroup" + index);
		if (!el) continue;
		if (index == this.selectedItem) {
			el.className = "videoToolsOption videoToolsOptionSelected";
		} else {
			el.className = "videoToolsOption";
		}
	}
}

GuiPage_SyncPlay.createGroup = function() {
	//Use a default group name based on the user
	var groupName = Server.getUserName() + "'s Group";
	var success = SyncPlay.createGroup(groupName);
	if (success) {
		GuiNotifications.setNotification("Created group: " + groupName, "SyncPlay");
		//Refresh
		this.start();
	} else {
		GuiNotifications.setNotification("Failed to create group", "SyncPlay");
	}
}

GuiPage_SyncPlay.keyDown = function() {
	var keyCode = event.keyCode;
	alert("Key pressed: " + keyCode);

	if (document.getElementById("Notifications").style.visibility == "") {
		document.getElementById("Notifications").style.visibility = "hidden";
		document.getElementById("NotificationText").innerHTML = "";
		widgetAPI.blockNavigation(event);
		keyCode = "VOID";
	}

	Support.screensaver();

	switch(keyCode) {
		case tvKey.KEY_UP:
			if (this.groups.length > 0) {
				this.selectedItem--;
				if (this.selectedItem < 0) {
					this.selectedItem = 0;
				}
				if (this.selectedItem < this.topLeftItem) {
					this.topLeftItem--;
					this.updateDisplayedItems();
				}
				this.updateSelectedItems();
			}
			break;
		case tvKey.KEY_DOWN:
			if (this.groups.length > 0) {
				this.selectedItem++;
				if (this.selectedItem >= this.groups.length) {
					this.selectedItem = this.groups.length - 1;
				}
				if (this.selectedItem >= this.topLeftItem + this.maxDisplay) {
					this.topLeftItem++;
					this.updateDisplayedItems();
				}
				this.updateSelectedItems();
			}
			break;
		case tvKey.KEY_ENTER:
		case tvKey.KEY_PANEL_ENTER:
			if (this.groups.length > 0 && this.groups[this.selectedItem]) {
				var group = this.groups[this.selectedItem];
				var success = SyncPlay.joinGroup(group.GroupId);
				if (success) {
					GuiNotifications.setNotification("Joined: " + (group.GroupName || "Group"), "SyncPlay");
					Support.processReturnURLHistory();
				} else {
					GuiNotifications.setNotification("Failed to join group", "SyncPlay");
				}
			}
			break;
		case tvKey.KEY_RED:
			if (SyncPlay.isEnabled) {
				SyncPlay.leaveGroup();
				this.start();
			}
			break;
		case tvKey.KEY_GREEN:
			this.createGroup();
			break;
		case tvKey.KEY_LEFT:
			Support.removeLatestURL();
			GuiMainMenu.requested("GuiPage_SyncPlay", null);
			break;
		case tvKey.KEY_RETURN:
		case tvKey.KEY_PANEL_RETURN:
			widgetAPI.blockNavigation(event);
			Support.processReturnURLHistory();
			break;
		case tvKey.KEY_EXIT:
			widgetAPI.sendExitEvent();
			break;
	}
}

GuiPage_SyncPlay.onFocus = function() {
	//Refresh on focus
}
