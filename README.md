# WASM WebVPython Runner

This is a WebVPython Runner that serves the `iframe` used by the WebVPython application.

This runner uses [pyodide](https://pyodide.org/en/stable/) to provide a python interpreter.

Not all WebVPython features have been implemented, but many are available.

Please report and bugs here:

[Issues](https://github.com/vpython/wmWVPRunner/issues)

You can test this locally with npm:

first:

    npm install

then

    npm run dev

You'll need to set a value for PUBLIC_TRUSTED_HOST in the .env file, e.g.:

    PUBLIC_TRUSTED_HOST="http://localhost:8080"

There is a `sample.env` for your reference. you can: `cp sample.env .env` and then edit that .env file.

## Test harness

A local test page is in `test/index.html`. It embeds the runner in an iframe and lets you send programs via `postMessage`. With `PUBLIC_TRUSTED_HOST="http://localhost:8080"` in your `.env` and `npm run dev` running, open a second terminal and run:

    npm run test-ui

Then visit `http://localhost:8080` and click **▶ Run**.
