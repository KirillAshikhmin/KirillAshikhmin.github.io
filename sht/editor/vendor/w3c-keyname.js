export var base = {
  8: "Backspace", 9: "Tab", 10: "Enter", 12: "NumLock", 13: "Enter",
  16: "Shift", 17: "Control", 18: "Alt", 20: "CapsLock", 27: "Escape",
  32: " ", 33: "PageUp", 34: "PageDown", 35: "End", 36: "Home",
  37: "ArrowLeft", 38: "ArrowUp", 39: "ArrowRight", 40: "ArrowDown",
  45: "Insert", 46: "Delete", 91: "Meta", 92: "Meta", 93: "ContextMenu",
  106: "*", 107: "+", 109: "-", 110: ".", 111: "/",
  144: "NumLock", 145: "ScrollLock", 181: "AudioVolumeMute",
  182: "AudioVolumeDown", 183: "AudioVolumeUp", 186: ";", 187: "=",
  188: ",", 189: "-", 190: ".", 191: "/", 192: "`", 219: "[",
  220: "\\", 221: "]", 222: "'"
};
export var shift = {
  48: ")", 49: "!", 50: "@", 51: "#", 52: "$", 53: "%", 54: "^",
  55: "&", 56: "*", 57: "(", 59: ":", 61: "+", 173: "_", 186: ":",
  187: "+", 188: "<", 189: "_", 190: ">", 191: "?", 192: "~",
  219: "{", 220: "|", 221: "}", 222: '"'
};
export function keyName(event) {
  var name = (event.shiftKey && shift[event.keyCode]) || base[event.keyCode] || event.key;
  return name.length == 1 ? name : name;
}
