require("dotenv").config();
const express = require("express");
const yampiRoutes = require("./src/routes/yampi.routes");
const qaRoutes = require("./src/routes/qa.routes");
const logger = require("./src/utils/logger");
const { initializeWhatsAppClient } = require("./src/services/whatsapp.service");

const app = express();
const PORT = process.env.PORT || 3000;

initializeWhatsAppClient();

app.use(express.json());

app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url} from ${req.ip}`);
    next();
});

app.get("/", (req, res) => {
    res.send("Yampi Webhook Notifier com Sistema Q&A está rodando!");
});

app.use("/webhook", yampiRoutes);

app.use("/qa", qaRoutes);

app.use((req, res, next) => {
    res.status(404).send("Rota não encontrada.");
});

app.use((err, req, res, next) => {
    logger.error(`Erro não tratado: ${err.message}`, { stack: err.stack, url: req.originalUrl });
    res.status(500).send("Ocorreu um erro interno no servidor.");
});

app.listen(PORT, "0.0.0.0", () => {
    logger.info(`Servidor rodando em http://0.0.0.0:${PORT}`);
    logger.info("Sistema Q&A ativado - O bot responderá automaticamente às perguntas dos usuários");
});

process.on("SIGTERM", () => {
    logger.info("SIGTERM signal received: closing HTTP server");
    process.exit(0);
});

process.on("SIGINT", () => {
    logger.info("SIGINT signal received: closing HTTP server");
    process.exit(0);
});