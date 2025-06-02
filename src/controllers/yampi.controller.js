const yampiService = require("../services/yampi.service");
const logger = require("../utils/logger");

const handleWebhook = async (req, res) => {
    const payload = req.body;
    const event = payload.event;

    logger.info(`Webhook recebido: ${event}`, { payload });

    res.status(200).send("Webhook recebido com sucesso.");

    try {
        yampiService.processWebhook(payload).catch(error => {
            logger.error("Erro ao processar webhook de forma assíncrona:", error);
        });
    } catch (error) {
        logger.error("Erro ao iniciar processamento assíncrono do webhook:", error);
    }
};

module.exports = {
    handleWebhook,
};

