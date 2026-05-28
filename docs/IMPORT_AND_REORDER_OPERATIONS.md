# Smart Import and Auto-Reorder Operations

## Import queue durability

Smart imports use BullMQ on the `import-processing` queue when Redis is configured.
This is the production mode and is required for durable background imports.

If Redis is not configured, the system falls back to in-memory processing so local
development can still run imports. In memory mode:

- progress polling still works while the same Node.js process is alive;
- jobs are not durable;
- a server restart loses queued and in-flight import payloads;
- on startup, pending or processing memory-fallback import logs are marked failed
  with an operator-facing interruption message.

Production operators should treat Redis as a required dependency for imports.

## Automated reorder behavior

Outbound stock movements (`sale`, `dispatch`, transfer out, shortage, damage, loss,
theft, expiry, and corrections) trigger an auto-reorder analysis for the affected
product.

The analysis uses:

- current stock from warehouse stock levels, falling back to product current stock;
- sales velocity from recent `sale` and `dispatch` stock movements;
- supplier lead time;
- system settings for safety stock days and sales lookback days;
- configured product reorder point and reorder quantity when present.

The service creates one open auto document per product and tenant. It does not keep
creating duplicates while an auto purchase order or direct purchase remains open.
Auto reorder never approves or receives stock by itself. It creates a draft document,
sends a top-bar notification, and waits for a user to review, edit, approve, or
receive through the normal workflow.

Procurement flow selection:

- creates a direct purchase when supplier terms are cash, PO approval is not
  required, the estimated amount is within `auto_reorder_direct_purchase_threshold`,
  and an auto-reorder user is available;
- otherwise creates an AUTO purchase order draft.

Relevant settings live in `SystemSettings`:

- `auto_reorder_enabled`
- `auto_reorder_create_documents`
- `auto_reorder_safety_stock_days`
- `auto_reorder_sales_lookback_days`
- `auto_reorder_direct_purchase_threshold`
- `auto_reorder_created_by`
- `require_po_approval`
- `po_approval_threshold`

Manual/operator endpoints:

- `GET /api/products/:id/reorder-analysis`
- `POST /api/products/:id/auto-reorder`

## Receipt and supplier invoice OCR

The OCR endpoint is:

- `POST /api/imports/ocr/purchase-invoice`
- `POST /api/imports/ocr/purchase-invoice/direct-purchase`

It accepts PNG, JPG, JPEG, or WEBP image uploads. The scan endpoint extracts
supplier invoice data, matches the supplier and products within the tenant, and
returns a direct-purchase-ready payload when all lines can be matched. The
`direct-purchase` endpoint creates a draft direct purchase from the scan so an
operator can review it and receive stock through the normal purchase receiving
flow.

OCR requires `OPENAI_API_KEY`. The model can be overridden with `OCR_MODEL`. If no
provider key is configured, the endpoint returns `503` instead of inventing data.
