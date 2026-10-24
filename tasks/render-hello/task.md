You are in an empty web project directory. Build a page that embeds the npm package "{{package}}".

The package is already installed in node_modules/{{package}}. Use only its README and its own files in node_modules for API details. Do not use the internet. Do not install packages. Do not start a server.

Requirements:
1. Create index.html and main.js as plain ES modules (no framework, no bundler config). main.js may import "{{package}}" by its bare name; the page is served with bare imports resolved to node_modules.
2. Mount the package's terminal into a full-window element.
3. When it is ready, write this exact text to the terminal: AX11Y-HELLO
4. Expose two globals on window for automated checks:
   - window.termWrite(text): writes text to the terminal.
   - window.termInput: an array. Push every chunk of user input the terminal emits (keyboard data), decoded to a string, onto this array.
5. Do not draw AX11Y-HELLO any other way than writing it to the terminal.

When finished, stop.
