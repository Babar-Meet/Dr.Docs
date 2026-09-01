import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import multer from "multer";
import { AppError } from "../../../utils/errors.js";
import { SECURE_ENCRYPTION_MESSAGE } from "../../../utils/constants.js";
import { errorHandler, notFoundHandler } from "../../../server/src/middleware/errorHandler.js";

function createAppWithHandler(handler) {
  const app = express();
  app.get("/test", handler);
  app.use(errorHandler);
  return app;
}

async function startServer(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" ? addr.port : addr;
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
    server.on("error", reject);
  });
}

async function stopServer(server) {
  return new Promise((res) => server.close(() => res()));
}

describe("server/middleware errorHandler", () => {
  describe("PASSWORD_REQUIRED preserves SECURE_ENCRYPTION_MESSAGE", () => {
    it("returns SECURE_ENCRYPTION_MESSAGE when code is PASSWORD_REQUIRED and message matches", async () => {
      const app = createAppWithHandler((req, res, next) => {
        next(new AppError(SECURE_ENCRYPTION_MESSAGE, "PASSWORD_REQUIRED", 400, { reason: "Password required" }));
      });
      const { server, url } = await startServer(app);
      try {
        const res = await fetch(`${url}/test`);
        const body = await res.json();
        assert.equal(res.status, 400);
        assert.equal(body.code, "PASSWORD_REQUIRED");
        assert.equal(body.message, SECURE_ENCRYPTION_MESSAGE);
        assert.equal(body.status, "failed");
        assert.equal(body.reason, "Password required");
      } finally {
        await stopServer(server);
      }
    });

    it("PASSWORD_REQUIRED with SECURE_ENCRYPTION_MESSAGE has status 400", async () => {
      const app = createAppWithHandler((req, res, next) => {
        next(new AppError(SECURE_ENCRYPTION_MESSAGE, "PASSWORD_REQUIRED", 400));
      });
      const { server, url } = await startServer(app);
      try {
        const res = await fetch(`${url}/test`);
        const body = await res.json();
        assert.equal(res.status, 400);
        assert.equal(body.code, "PASSWORD_REQUIRED");
        assert.equal(body.message, SECURE_ENCRYPTION_MESSAGE);
      } finally {
        await stopServer(server);
      }
    });

    it("PASSWORD_REQUIRED with different message falls back to generic password required message", async () => {
      const app = createAppWithHandler((req, res, next) => {
        next(new AppError("Some other password message", "PASSWORD_REQUIRED", 400, { reason: "other" }));
      });
      const { server, url } = await startServer(app);
      try {
        const res = await fetch(`${url}/test`);
        const body = await res.json();
        assert.equal(res.status, 400);
        assert.equal(body.code, "PASSWORD_REQUIRED");
        assert.equal(body.message, "Password required");
        // reason should still be preserved
        assert.equal(body.reason, "other");
      } finally {
        await stopServer(server);
      }
    });

    it("ensures SECURE_ENCRYPTION_MESSAGE is plain ASCII and contains no emoji", async () => {
      assert.equal(SECURE_ENCRYPTION_MESSAGE, "This file is securely encrypted and requires the original password.");
      // ASCII check 32-126
      for (let i = 0; i < SECURE_ENCRYPTION_MESSAGE.length; i++) {
        const code = SECURE_ENCRYPTION_MESSAGE.charCodeAt(i);
        assert.ok(code >= 32 && code <= 126, `char at ${i} not ASCII: ${code}`);
      }
      // No emoji range
      assert.ok(!/[\u{1F600}-\u{1F6FF}]/u.test(SECURE_ENCRYPTION_MESSAGE));
      assert.ok(!/[\u2600-\u27BF]/u.test(SECURE_ENCRYPTION_MESSAGE));
    });
  });

  describe("FILE_TOO_LARGE handling", () => {
    it("maps multer MulterError LIMIT_FILE_SIZE to FILE_TOO_LARGE 400", async () => {
      const app = express();
      app.get("/multer-limit", (req, res, next) => {
        const err = new multer.MulterError("LIMIT_FILE_SIZE");
        err.code = "LIMIT_FILE_SIZE";
        next(err);
      });
      app.use(errorHandler);
      const { server, url } = await startServer(app);
      try {
        const res = await fetch(`${url}/multer-limit`);
        const body = await res.json();
        assert.equal(res.status, 400);
        assert.equal(body.code, "FILE_TOO_LARGE");
        assert.equal(body.status, "failed");
        assert.equal(body.message, "Processing failed");
        assert.equal(body.reason, "Max file size is 50MB");
      } finally {
        await stopServer(server);
      }
    });

    it("direct AppError FILE_TOO_LARGE returns 400 with reason", async () => {
      const app = createAppWithHandler((req, res, next) => {
        next(new AppError("File exceeds 50MB", "FILE_TOO_LARGE", 400, { reason: "Max file size is 50MB" }));
      });
      const { server, url } = await startServer(app);
      try {
        const res = await fetch(`${url}/multer-limit` .replace("multer-limit", "test"));
        // Use /test path
        const res2 = await fetch(`${url}/test`);
        const body = await res2.json();
        assert.equal(res2.status, 400);
        assert.equal(body.code, "FILE_TOO_LARGE");
        assert.equal(body.message, "Processing failed");
      } finally {
        await stopServer(server);
      }
    });
  });

  describe("generic wraps to PROCESSING_FAILED", () => {
    it("wraps plain Error to PROCESSING_FAILED 500 with message Processing failed", async () => {
      const app = createAppWithHandler((req, res, next) => {
        next(new Error("unexpected boom"));
      });
      const { server, url } = await startServer(app);
      try {
        const res = await fetch(`${url}/test`);
        const body = await res.json();
        assert.equal(res.status, 500);
        assert.equal(body.code, "PROCESSING_FAILED");
        assert.equal(body.message, "Processing failed");
        assert.equal(body.status, "failed");
        assert.match(body.reason, /unexpected boom/);
      } finally {
        await stopServer(server);
      }
    });

    it("wraps string error or non-AppError with code fallback to PROCESSING_FAILED", async () => {
      const app = express();
      app.get("/wrap", (req, res, next) => {
        const err = new Error("custom");
        err.code = "SOME_UNKNOWN_CODE";
        err.statusCode = 502;
        next(err);
      });
      app.use(errorHandler);
      const { server, url } = await startServer(app);
      try {
        const res = await fetch(`${url}/wrap`);
        const body = await res.json();
        assert.equal(res.status, 502);
        assert.equal(body.code, "SOME_UNKNOWN_CODE");
        assert.equal(body.message, "Processing failed");
      } finally {
        await stopServer(server);
      }
    });

    it("handles error without message defaults to Processing failed", async () => {
      const app = createAppWithHandler((req, res, next) => {
        next(new Error());
      });
      const { server, url } = await startServer(app);
      try {
        const res = await fetch(`${url}/test`);
        const body = await res.json();
        assert.equal(body.message, "Processing failed");
      } finally {
        await stopServer(server);
      }
    });

    it("handles null/undefined details gracefully", async () => {
      const app = createAppWithHandler((req, res, next) => {
        next(new AppError("File corrupted", "FILE_CORRUPTED", 400));
      });
      const { server, url } = await startServer(app);
      try {
        const res = await fetch(`${url}/test`);
        const body = await res.json();
        assert.equal(res.status, 400);
        assert.equal(body.code, "FILE_CORRUPTED");
        assert.equal(body.message, "File corrupted");
        assert.equal(body.reason, "File corrupted");
      } finally {
        await stopServer(server);
      }
    });
  });

  describe("message mapping for other codes", () => {
    it("UNSUPPORTED_FILE maps to Unsupported file message", async () => {
      const app = createAppWithHandler((req, res, next) => {
        next(new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, { reason: "bad type" }));
      });
      const { server, url } = await startServer(app);
      try {
        const res = await fetch(`${url}/test`);
        const body = await res.json();
        assert.equal(body.message, "Unsupported file");
        assert.equal(body.code, "UNSUPPORTED_FILE");
        assert.equal(body.reason, "bad type");
      } finally {
        await stopServer(server);
      }
    });

    it("FILE_CORRUPTED maps to File corrupted", async () => {
      const app = createAppWithHandler((req, res, next) => {
        next(new AppError("File corrupted", "FILE_CORRUPTED", 400, { reason: "corrupt" }));
      });
      const { server, url } = await startServer(app);
      try {
        const res = await fetch(`${url}/test`);
        const body = await res.json();
        assert.equal(body.message, "File corrupted");
      } finally {
        await stopServer(server);
      }
    });

    it("PROCESSING_FAILED maps to Processing failed", async () => {
      const app = createAppWithHandler((req, res, next) => {
        next(new AppError("Processing failed", "PROCESSING_FAILED", 500, { reason: "oops" }));
      });
      const { server, url } = await startServer(app);
      try {
        const res = await fetch(`${url}/test`);
        const body = await res.json();
        assert.equal(body.message, "Processing failed");
        assert.equal(body.code, "PROCESSING_FAILED");
      } finally {
        await stopServer(server);
      }
    });

    it("unknown code defaults to Processing failed", async () => {
      const app = createAppWithHandler((req, res, next) => {
        next(new AppError("something", "UNKNOWN_CODE_XYZ", 500));
      });
      const { server, url } = await startServer(app);
      try {
        const res = await fetch(`${url}/test`);
        const body = await res.json();
        assert.equal(body.message, "Processing failed");
      } finally {
        await stopServer(server);
      }
    });
  });

  describe("notFoundHandler", () => {
    it("returns 404 PROCESSING_FAILED for unknown route", async () => {
      const app = express();
      app.use(notFoundHandler);
      app.use(errorHandler);
      const { server, url } = await startServer(app);
      try {
        const res = await fetch(`${url}/nonexistent`);
        const body = await res.json();
        assert.equal(res.status, 404);
        assert.equal(body.code, "PROCESSING_FAILED");
        assert.equal(body.status, "failed");
      } finally {
        await stopServer(server);
      }
    });
  });

  describe("response shape", () => {
    it("always returns status: failed, message, reason, code", async () => {
      const app = createAppWithHandler((req, res, next) => {
        next(new AppError(SECURE_ENCRYPTION_MESSAGE, "PASSWORD_REQUIRED", 400, { reason: "Password required" }));
      });
      const { server, url } = await startServer(app);
      try {
        const res = await fetch(`${url}/test`);
        const body = await res.json();
        assert.ok("status" in body);
        assert.ok("message" in body);
        assert.ok("reason" in body);
        assert.ok("code" in body);
        assert.equal(body.status, "failed");
      } finally {
        await stopServer(server);
      }
    });
  });
});
