#!/bin/bash
export DEV_BYPASS_AUTH=1
export DEV_BYPASS_COOKIE=1
export DEV_FAKE_SESSION=fake-dev-token
npm run dev
