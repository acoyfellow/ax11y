import { mount } from "cloudterm";
window.termInput = [];
const term = await mount(document.getElementById("terminal"), { onData: () => {} });
window.termWrite = (text) => term.write(text);
term.write("AX11Y-HELLO");
