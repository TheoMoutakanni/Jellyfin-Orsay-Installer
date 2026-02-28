var Trickplay = {
	available : false,
	itemId : null,
	width : 0,
	height : 0,
	tileWidth : 0,
	tileHeight : 0,
	interval : 0,
	thumbnailCount : 0
}

Trickplay.load = function(playerData) {
	//Reset
	this.available = false;
	this.itemId = null;

	if (!playerData || !playerData.Trickplay) {
		return;
	}

	//Trickplay data is keyed by MediaSource ID, then by resolution width
	//Pick the smallest available width for performance
	var trickplayData = playerData.Trickplay;
	var sourceKeys = Object.keys(trickplayData);
	if (sourceKeys.length == 0) {
		return;
	}

	var sourceData = trickplayData[sourceKeys[0]];
	var widths = Object.keys(sourceData);
	if (widths.length == 0) {
		return;
	}

	//Sort widths numerically and pick the smallest
	widths.sort(function(a, b) { return parseInt(a) - parseInt(b); });
	var selectedWidth = widths[0];
	var metadata = sourceData[selectedWidth];

	if (!metadata) {
		return;
	}

	this.itemId = playerData.Id;
	this.width = metadata.Width || parseInt(selectedWidth);
	this.height = metadata.Height || 0;
	this.tileWidth = metadata.TileWidth || 1;
	this.tileHeight = metadata.TileHeight || 1;
	this.interval = metadata.Interval || 10000; //ms between thumbnails
	this.thumbnailCount = metadata.ThumbnailCount || 0;
	this.available = true;

	FileLog.write("Trickplay : Loaded - " + this.width + "x" + this.height +
		", tiles=" + this.tileWidth + "x" + this.tileHeight +
		", interval=" + this.interval + "ms, count=" + this.thumbnailCount);
}

Trickplay.isAvailable = function() {
	return this.available;
}

Trickplay.getThumbnailInfo = function(positionMs) {
	if (!this.available || positionMs < 0) {
		return null;
	}

	var thumbIndex = Math.floor(positionMs / this.interval);
	if (thumbIndex >= this.thumbnailCount) {
		thumbIndex = this.thumbnailCount - 1;
	}
	if (thumbIndex < 0) {
		thumbIndex = 0;
	}

	var tilesPerSprite = this.tileWidth * this.tileHeight;
	var spriteIndex = Math.floor(thumbIndex / tilesPerSprite);
	var posInSprite = thumbIndex % tilesPerSprite;
	var col = posInSprite % this.tileWidth;
	var row = Math.floor(posInSprite / this.tileWidth);

	var spriteUrl = Server.getServerAddr() + "/Videos/" + this.itemId +
		"/Trickplay/" + this.width + "/" + spriteIndex + ".jpg" +
		"?api_key=" + Server.getAuthToken();

	return {
		spriteUrl: spriteUrl,
		offsetX: col * this.width,
		offsetY: row * this.height,
		width: this.width,
		height: this.height
	};
}

Trickplay.showThumbnail = function(positionMs) {
	var info = this.getThumbnailInfo(positionMs);
	var el = document.getElementById("guiPlayer_Trickplay");
	if (!info || !el) {
		this.hideThumbnail();
		return;
	}

	el.style.width = info.width + "px";
	el.style.height = info.height + "px";
	el.style.backgroundImage = "url('" + info.spriteUrl + "')";
	el.style.backgroundPosition = "-" + info.offsetX + "px -" + info.offsetY + "px";
	el.style.visibility = "";
}

Trickplay.hideThumbnail = function() {
	var el = document.getElementById("guiPlayer_Trickplay");
	if (el) {
		el.style.visibility = "hidden";
		el.style.backgroundImage = "";
	}
}
