const express = require("express");
const router = express.Router();
const yampiController = require("../controllers/yampi.controller");

router.post("/yampi", yampiController.handleWebhook);

module.exports = router;

