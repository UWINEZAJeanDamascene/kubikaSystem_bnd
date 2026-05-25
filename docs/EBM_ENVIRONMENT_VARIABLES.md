# EBM Environment Variables

## Table of Contents

- [Purpose](#purpose)
- [Environment Variables](#environment-variables)
- [Switching Modes](#switching-modes)
- [Validation Checklist](#validation-checklist)

## Purpose

This document lists every environment variable used by the RRA EBM integration. Set these values in the backend server environment, for example in `.env`, `.env.production`, Docker secrets, or the hosting provider's environment variable panel.

## Environment Variables

| Variable | Description | Accepted values | Default if omitted | Required | Read by |
|---|---|---|---|---|---|
| `EBM_MODE` | Controls whether the integration uses local mock responses, sandbox VSDC, or production VSDC. | `mock`, `sandbox`, `production` | Operationally none. It must be set explicitly. The current code falls back to `mock` for local development if omitted. | Required | `services/ebmService.js` when the EBM service is constructed and on every VSDC call through that service. |
| `VSDC_BASE_URL` | Base URL of the locally running VSDC Tomcat application. Example: `http://localhost:8080/vsdc`. | A valid HTTP or HTTPS URL with no trailing path beyond the VSDC context. | `http://localhost:8080/vsdc` | Required when `EBM_MODE` is `sandbox` or `production`. Optional in `mock`. | `services/ebmService.js` transport layer when creating the Axios client. |
| `RRA_SANDBOX_URL` | RRA test server address used for diagnostics and mode configuration display. | A valid HTTPS URL. Current expected value: `https://sdcsandbox.rra.gov.rw`. | `https://sdcsandbox.rra.gov.rw` | Optional, unless RRA changes the sandbox address. | `services/ebmService.js` environment config. |
| `RRA_PRODUCTION_URL` | RRA production server address used for diagnostics and mode configuration display. | A valid HTTPS URL. Current expected value: `https://api-ebm.rra.gov.rw`. | `https://api-ebm.rra.gov.rw` | Optional, unless RRA changes the production address. | `services/ebmService.js` environment config. |
| `EBM_HTTP_TIMEOUT_MS` | HTTP timeout for calls from the backend to the local VSDC application. | Any positive integer in milliseconds. | `30000` | Optional | `services/ebmService.js` when creating the Axios client. |
| `EBM_RETRY_INTERVAL_MINUTES` | How often the retry job scheduler checks for due EBM queue records. | Any positive integer. | `5` | Optional | `services/ebmRetryJob.js` scheduler on startup. |
| `EBM_RETRY_BASE_DELAY_SECONDS` | Base delay for exponential backoff. The first retry delay is based on this value. | Any positive integer. | `60` | Optional | `services/ebmRetryJob.js` and `services/ebmQueueService.js` when calculating `nextRetryAt`. |
| `EBM_RETRY_BATCH_SIZE` | Maximum number of queue records processed in one retry scheduler run. | Any positive integer. | `10` | Optional | `services/ebmRetryJob.js` on each scheduler run. |
| `EBM_MAX_RETRIES` | Maximum retry attempts before a queue record is marked `abandoned` and an alert is created. | Any positive integer. | `5` | Optional | `services/ebmRetryJob.js` and `services/ebmQueueService.js` on every retry attempt. |
| `EBM_CODE_SYNC_INTERVAL_HOURS` | How often RRA standard codes are refreshed for initialized devices. | Any positive integer. | `24` | Optional | `services/ebmCodeSyncScheduler.js` on scheduler startup and `services/ebmCodeSyncService.js` when checking due companies. |
| `EBM_IMPORT_SYNC_INTERVAL_HOURS` | How often imported items are pulled from RRA customs data. | Any positive integer. | `12` | Optional | `services/ebmImportSyncScheduler.js` on scheduler startup and `services/ebmImportedItemService.js` when checking due companies. |
| `EBM_PURCHASE_SYNC_INTERVAL_HOURS` | How often supplier sales are pulled from RRA for purchase matching and confirmation. | Any positive integer. | `6` | Optional | `services/ebmPurchaseSyncScheduler.js` on scheduler startup and `services/ebmPurchaseService.js` when checking due companies. |
| `EBM_MOCK_FORCE_SAVE_SALES_503` | Test-only switch that forces mock `saveSales` calls to fail with HTTP 503. Use only for retry and abandonment testing. | `true` or unset. | Unset, which means disabled. | Optional and should not be set in sandbox or production. | `services/ebmService.js` mock transport before returning a mock `saveSales` response. |

## Switching Modes

### Switch from mock to sandbox

1. Open the backend environment file used by the running server.

   ```env
   EBM_MODE=mock
   ```

2. Change the mode to sandbox.

   ```env
   EBM_MODE=sandbox
   ```

3. Set the local Tomcat VSDC URL.

   ```env
   VSDC_BASE_URL=http://localhost:8080/vsdc
   ```

4. Confirm the sandbox RRA reference URL is present.

   ```env
   RRA_SANDBOX_URL=https://sdcsandbox.rra.gov.rw
   ```

5. Restart the backend server so `services/ebmService.js` is recreated with the new mode.

6. Open Company Settings, then EBM Devices, and initialize the tenant device in sandbox mode.

7. Trigger a full EBM code sync before creating sandbox transactions.

### Switch from sandbox to production

1. Put the system into maintenance mode so no transactions are created during the switch.

2. Confirm the production VSDC WAR from RRA is deployed to Tomcat and has started.

3. Change the mode from sandbox to production.

   ```env
   EBM_MODE=production
   ```

4. Confirm the local VSDC URL is still correct.

   ```env
   VSDC_BASE_URL=http://localhost:8080/vsdc
   ```

5. Confirm the production RRA reference URL is present.

   ```env
   RRA_PRODUCTION_URL=https://api-ebm.rra.gov.rw
   ```

6. Restart the backend server.

7. Re-initialize the tenant EBM device from Company Settings. Device initialization records are mode-specific. Switching modes does not delete old device records, but a sandbox-initialized device is not initialized for production mode.

8. Trigger a full code data sync in production mode.

9. Create and confirm one small test invoice. Confirm the invoice reaches `ebmStatus: submitted` and the PDF shows a production RRA receipt number.

## Validation Checklist

- `EBM_MODE` is explicitly set in every deployed environment.
- `VSDC_BASE_URL` points to the local Tomcat VSDC application in sandbox and production.
- `EBM_MOCK_FORCE_SAVE_SALES_503` is not set outside a controlled mock retry test.
- Retry values are positive integers.
- Code, import, and purchase sync intervals are positive integers.
- After changing any EBM environment variable, the backend server has been restarted.
