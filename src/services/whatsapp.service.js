const { Client, LocalAuth } = require("whatsapp-web.js");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

let client;
let isClientReady = false;
const QR_FILE_PATH = path.join(__dirname, "../../whatsapp_qr.txt");

const initializeWhatsAppClient = () => {
    logger.info("Inicializando cliente WhatsApp...");

    if (fs.existsSync(QR_FILE_PATH)) {
        try {
            fs.unlinkSync(QR_FILE_PATH);
            logger.info("Arquivo QR anterior removido.");
        } catch (err) {
            logger.error("Erro ao remover arquivo QR anterior:", err);
        }
    }

    client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
        }
    });

    client.on("qr", (qr) => {
        logger.info("QR Code recebido. Salvando em arquivo...");
        try {
            fs.writeFileSync(QR_FILE_PATH, qr);
            logger.info(`QR Code salvo em: ${QR_FILE_PATH}. Copie o conteúdo e use um gerador online.`);
        } catch (err) {
            logger.error("Erro ao salvar QR code no arquivo:", err);
        }
    });

    client.on("ready", () => {
        isClientReady = true;
        logger.info("Cliente WhatsApp está pronto!");
        if (fs.existsSync(QR_FILE_PATH)) {
            try {
                fs.unlinkSync(QR_FILE_PATH);
                logger.info("Arquivo QR removido após autenticação.");
            } catch (err) {
                logger.error("Erro ao remover arquivo QR após autenticação:", err);
            }
        }
    });

    client.on("auth_failure", (msg) => {
        isClientReady = false;
        logger.error("Falha na autenticação do WhatsApp:", msg);
    });

    client.on("disconnected", (reason) => {
        isClientReady = false;
        logger.warn("Cliente WhatsApp desconectado:", reason);
    });

    client.on("error", (err) => {
        logger.error("Erro no cliente WhatsApp:", err);
    });

    client.initialize().catch(error => {
        logger.error("Erro ao inicializar cliente WhatsApp:", error);
        isClientReady = false;
    });
};


let queue = [];
let isProcessingQueue = false;

const processQueue = async () => {
    if (isProcessingQueue || queue.length === 0) return;

    isProcessingQueue = true;

    while (queue.length > 0) {
        const { number, message, resolve, reject } = queue.shift();

        try {
            if (!isClientReady) {
                logger.warn("Cliente WhatsApp não está pronto para enviar mensagens.");
                throw new Error("WhatsApp client is not ready.");
            }

            logger.info(`Enviando mensagem para ${number}`);

            const chat = await client.getChatById(number);
            if (chat) {
                await chat.sendMessage(message);
            } else {
                await client.sendMessage(number, message);
            }

            logger.info(`Mensagem enviada com sucesso para ${number}`);

            resolve();

        } catch (error) {
            logger.error(`Erro ao enviar mensagem para ${number}: ${error.message}`, { stack: error.stack });
            reject(error);
        }

        await new Promise(r => setTimeout(r, 5500));
    }

    isProcessingQueue = false;
};
const sendMessage = (number, message) => {
    return new Promise((resolve, reject) => {
        queue.push({ number, message, resolve, reject });
        processQueue();
    });
};

module.exports = {
    initializeWhatsAppClient,
    sendMessage,
    QR_FILE_PATH
};
