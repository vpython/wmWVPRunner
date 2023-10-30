# WASM WebVPython Runner

This is a WebVPython Runner that serves the `iframe` used by the WebVPython application.

You can test this locally with npm:

first:

    npm install

then

    npm run dev

You'll need to set a value for PUBLIC_TRUSTED_HOST in the .env file, e.g.:

    PUBLIC_TRUSTED_HOST="http://localhost:8080"

There is a `sample.env` for your reference. you can: `cp sample.env .env` and then edit that .env file.
