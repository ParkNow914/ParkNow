// middleware/requestId.js
// Attaches a unique request id (UUID v4) to each incoming request.
// - Reuses an incoming `X-Request-Id` header if present and well-formed.
// - Exposes the id on `req.id` and on the `X-Request-Id` response header.
// - Used downstream by the logger and by clients/load balancers for tracing.

const { randomUUID } = require('crypto');

// Conservative validator: any non-empty string up to 128 chars made of
// printable ASCII without whitespace. We don't enforce strict UUID to keep
// compatibility with upstream proxies that use their own correlation ids.
const VALID_ID = /^[A-Za-z0-9._\-:+/=]{1,128}$/;

function requestId(req, res, next) {
    const incoming = req.get('X-Request-Id');
    const id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();

    req.id = id;
    res.setHeader('X-Request-Id', id);
    next();
}

module.exports = requestId;
