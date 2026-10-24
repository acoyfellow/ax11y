import { mount } from "cloudterm";
const term = await mount(document.getElementById("terminal"), { onData: () => {} });
term.write("AX11Y-HELLO");
