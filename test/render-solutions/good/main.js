import { mount } from "cloudterm";
const decoder = new TextDecoder();
window.termInput = [];
const term = await mount(document.getElementById("terminal"), { onData: (bytes) => window.termInput.push(decoder.decode(bytes)) });
window.termWrite = (text) => term.write(text);
term.write("AX11Y-HELLO");
