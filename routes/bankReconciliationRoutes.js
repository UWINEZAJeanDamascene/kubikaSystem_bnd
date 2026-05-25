const express = require("express");
const multer = require("multer");
const { protect } = require("../middleware/auth");
const controller = require("../controllers/bankReconciliationController");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(protect);

router.post("/sessions", controller.createSession);
router.get("/sessions", controller.listSessions);
router.get("/sessions/:id", controller.getSession);
router.put("/sessions/:id/complete", controller.completeSession);
router.put("/sessions/:id/lock", controller.lockSession);

router.post("/sessions/:id/import", upload.single("file"), controller.importTransactions);
router.post("/sessions/:id/transactions", controller.addTransaction);
router.get("/sessions/:id/transactions", controller.listTransactions);
router.delete("/sessions/:id/transactions/:txId", controller.deleteTransaction);

router.get("/sessions/:id/book-transactions", controller.listBookTransactions);
router.post("/sessions/:id/match", controller.match);
router.post("/sessions/:id/auto-match", controller.autoMatch);
router.delete("/matches/:matchId", controller.unmatch);
router.get("/sessions/:id/summary", controller.summary);

module.exports = router;
