var pbsId = {};

if (localStorage.activated == undefined) {
	setIcon(true);
}

chrome.runtime.onConnect.addListener(function(port) {
	pbsId[port.sender.id + port.name] = port;
});

function setIcon(dark) {
	if (!dark) {
		localStorage.activated = "false";
		chrome.browserAction.setIcon({
			path: "images/lslack24.ico"
		});
	} else {
		localStorage.activated = "true";
		chrome.browserAction.setIcon({
			path: "images/dslack24.ico"
		});
	}
	sendMessage(localStorage.activated);
}

function update() {
	if (localStorage.activated != "false") {
		localStorage.activated = "false";
		chrome.browserAction.setIcon({
			path: "images/lslack24.ico"
		});
	} else {
		localStorage.activated = "true";
		chrome.browserAction.setIcon({
			path: "images/dslack24.ico"
		});
	}
	sendMessage(localStorage.activated);
}

function sendMessage(message) {
	for (var contentScriptId in pbsId) {
		var port = pbsId[contentScriptId];
		try {
			port.postMessage(message);
		} catch (e) {
			delete pbsId[contentScriptId];
		}
	}
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if (request.method == "isActivated")
		sendResponse({
			status: localStorage.activated
		});
	else
		sendResponse({});
});

if (localStorage.activated != "false") {
	chrome.browserAction.setIcon({
		path: "images/dslack24.ico"
	});
} else {
	chrome.browserAction.setIcon({
		path: "images/lslack24.ico"
	});
}

chrome.browserAction.onClicked.addListener(update);
