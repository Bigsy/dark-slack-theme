var active = false;
var head, link;
var myPort = chrome.runtime.connect({
	name: "main"
});

myPort.onMessage.addListener(function(data) {
	if (data == "true") {
		if (!active) {
			activate();
		}
	} else {
		if (active) {
			document.documentElement.removeChild(link);
			active = false;
		}
	}
});

function activate() {
        var path = chrome.extension.getURL('darks.css');
	//head = document.getElementsByTagName('head')[0];
	link = document.createElement('link');
	link.id = "darkstyle_css";
	link.rel = 'stylesheet';
	link.type = 'text/css';
	link.href = path;
	link.media = 'all';
	document.documentElement.appendChild(link);
	active = true;
}

chrome.runtime.sendMessage({
	method: "isActivated"
}, function(response) {
	if (response.status == "true") {
		activate();
	}
});
