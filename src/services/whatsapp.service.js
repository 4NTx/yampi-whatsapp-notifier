const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");
const questionDetection = require("./question-detection.service");
const qaDatabase = require("./qa-database.service");

let client;
let isClientReady = false;
const QR_FILE_PATH = path.join(__dirname, "../../whatsapp_qr.txt");
const UNMATCHED_QUESTIONS_LOG_PATH = path.join(__dirname, "../../logs/unmatched_questions.log");

const QA_CONFIG = {
    enabled: true,
    fallbackMessage: "Desculpe, não entendi sua pergunta. Você pode reformular ou entrar em contato com nosso atendimento.",
    processingMessage: "🤖 Processando sua pergunta...",
    enableProcessingMessage: false,
    delayBetweenResponses: 2000,
    audioAsVoiceNote: true,
    videoAsDocument: false,
    sendVideoAsUrlFallback: true,
    sendFallbackMessage: false
};

const initializeWhatsAppClient = async () => {
    logger.info("Inicializando cliente WhatsApp com sistema Q&A...");

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

    client.on("ready", async () => {
        isClientReady = true;
        logger.info("Cliente WhatsApp está pronto!");
        
        try {
            await initializeQAServices();
        } catch (error) {
            logger.error("Erro ao inicializar serviços Q&A:", error);
        }
        
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

    client.on("message", async (message) => {
        if (QA_CONFIG.enabled) {
            await handleIncomingMessage(message);
        }
    });

    client.initialize().catch(error => {
        logger.error("Erro ao inicializar cliente WhatsApp:", error);
        isClientReady = false;
    });
};

const initializeQAServices = async () => {
    try {
        logger.info("Inicializando serviços Q&A...");
        
        await qaDatabase.initialize();
        await questionDetection.initialize();
        
        logger.info("Serviços Q&A inicializados com sucesso");
    } catch (error) {
        logger.error("Erro ao inicializar serviços Q&A:", error);
        throw error;
    }
};

const handleIncomingMessage = async (message) => {
    try {
        if (message.fromMe) {
            return;
        }

        const chat = await message.getChat();
        if (chat.isGroup) {
            logger.info("Mensagem de grupo ignorada");
            return;
        }

        if (message.type !== "chat") {
            logger.info(`Tipo de mensagem não suportado: ${message.type}`);
            return;
        }

        const userMessage = message.body.trim();
        const fromNumber = message.from;

        logger.info(`Mensagem recebida de ${fromNumber}: "${userMessage}"`);

        if (QA_CONFIG.enableProcessingMessage) {
            await sendMessage(fromNumber, QA_CONFIG.processingMessage);
        }

        const questions = qaDatabase.getAllQuestions();
        
        const detection = await questionDetection.detectQuestion(userMessage, questions);

        if (detection.isQuestion && detection.matchedQuestion) {
            logger.info(`Pergunta detectada com similaridade ${detection.similarity} - Frase gatilho: "${detection.matchedTriggerPhrase}"`);
            
            const responses = detection.matchedQuestion.respostas.filter(r => r.ativo);
            
            await sendMultipleResponses(fromNumber, responses);
            
        } else {
            logUnmatchedQuestion(userMessage);
            
            if (QA_CONFIG.sendFallbackMessage) {
                logger.info(`Pergunta não reconhecida ou similaridade baixa (${detection.similarity}). Enviando fallback.`);
                await sendMessage(fromNumber, QA_CONFIG.fallbackMessage);
            } else {
                logger.info(`Pergunta não reconhecida ou similaridade baixa (${detection.similarity}). Nenhuma mensagem de fallback enviada.`);
            }
        }

    } catch (error) {
        logger.error("Erro ao processar mensagem recebida:", error);
        
        if (QA_CONFIG.sendFallbackMessage) {
            try {
                await sendMessage(message.from, "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.");
            } catch (sendError) {
                logger.error("Erro ao enviar mensagem de erro:", sendError);
            }
        }
    }
};

const logUnmatchedQuestion = (question) => {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${question}\n`;
    fs.appendFile(UNMATCHED_QUESTIONS_LOG_PATH, logEntry, (err) => {
        if (err) {
            logger.error("Erro ao logar pergunta não correspondida:", err);
        }
    });
    logger.info(`Pergunta não correspondida logada: "${question}"`);
};

const sendMultipleResponses = async (number, responses) => {
    try {
        for (let i = 0; i < responses.length; i++) {
            const response = responses[i];
            
            await sendResponse(number, response);
            
            if (i < responses.length - 1) {
                const delay = QA_CONFIG.delayBetweenResponses;
                logger.info(`Aguardando ${delay}ms antes da próxima resposta...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        logger.info(`${responses.length} resposta(s) enviada(s) com sucesso para ${number}`);
        
    } catch (error) {
        logger.error("Erro ao enviar múltiplas respostas:", error);
        throw error;
    }
};

const sendResponse = async (number, response) => {
    try {
        switch (response.tipo) {
            case "texto":
                await sendMessage(number, response.conteudo);
                break;
                
            case "audio":
                if (response.caminho_arquivo && qaDatabase.validateMediaFile(response.caminho_arquivo)) {
                    await sendMediaMessage(number, response.caminho_arquivo, "audio", response.conteudo, {
                        sendAsVoiceNote: QA_CONFIG.audioAsVoiceNote
                    });
                } else {
                    logger.warn(`Arquivo de áudio não encontrado: ${response.caminho_arquivo}`);
                    if (response.conteudo) {
                        await sendMessage(number, response.conteudo);
                    }
                }
                break;
                
            case "imagem":
                if (response.caminho_arquivo && qaDatabase.validateMediaFile(response.caminho_arquivo)) {
                    await sendMediaMessage(number, response.caminho_arquivo, "image", response.conteudo);
                } else {
                    logger.warn(`Arquivo de imagem não encontrado: ${response.caminho_arquivo}`);
                    if (response.conteudo) {
                        await sendMessage(number, response.conteudo);
                    }
                }
                break;
                
            case "video":
                if (response.caminho_arquivo) {
                    try {
                        if (qaDatabase.validateMediaFile(response.caminho_arquivo)) {
                            await sendMediaMessage(number, response.caminho_arquivo, "video", response.conteudo, {
                                sendAsDocument: QA_CONFIG.videoAsDocument
                            });
                        } else if (QA_CONFIG.sendVideoAsUrlFallback && isValidUrl(response.caminho_arquivo)) {
                            await sendMessage(number, response.caminho_arquivo + (response.conteudo ? `\n${response.conteudo}` : ""));
                            logger.info(`Vídeo enviado como URL: ${response.caminho_arquivo}`);
                        } else {
                            logger.warn(`Arquivo de vídeo não encontrado ou URL inválida: ${response.caminho_arquivo}`);
                            if (response.conteudo) {
                                await sendMessage(number, response.conteudo);
                            }
                        }
                    } catch (fileSendError) {
                        logger.error(`Erro ao enviar vídeo como arquivo/documento: ${fileSendError.message}. Tentando como URL...`);
                        if (QA_CONFIG.sendVideoAsUrlFallback && isValidUrl(response.caminho_arquivo)) {
                            await sendMessage(number, response.caminho_arquivo + (response.conteudo ? `\n${response.conteudo}` : ""));
                            logger.info(`Vídeo enviado como URL (fallback): ${response.caminho_arquivo}`);
                        } else {
                            throw fileSendError;
                        }
                    }
                } else {
                    logger.warn(`Caminho do arquivo de vídeo não especificado.`);
                    if (response.conteudo) {
                        await sendMessage(number, response.conteudo);
                    }
                }
                break;
                
            default:
                logger.warn(`Tipo de resposta não suportado: ${response.tipo}`);
                if (response.conteudo) {
                    await sendMessage(number, response.conteudo);
                }
        }
    } catch (error) {
        logger.error(`Erro ao enviar resposta do tipo ${response.tipo}:`, error);
        throw error;
    }
};

let queue = [];
let isProcessingQueue = false;

const processQueue = async () => {
    if (isProcessingQueue || queue.length === 0) return;

    isProcessingQueue = true;

    while (queue.length > 0) {
        const { number, message, media, options, resolve, reject } = queue.shift();

        try {
            if (!isClientReady) {
                logger.warn("Cliente WhatsApp não está pronto para enviar mensagens.");
                throw new Error("WhatsApp client is not ready.");
            }

            logger.info(`Enviando mensagem para ${number}`);

            const chat = await client.getChatById(number);
            
            if (media) {
                const sendOptions = { caption: message };
                
                if (options && options.sendAsVoiceNote && media.mimetype && media.mimetype.startsWith("audio/")) {
                    sendOptions.sendAudioAsVoice = true;
                }
                
                if (options && options.sendAsDocument && media.mimetype && media.mimetype.startsWith("video/")) {
                    sendOptions.sendAsDocument = true;
                }
                
                await chat.sendMessage(media, sendOptions);
            } else {
                if (chat) {
                    await chat.sendMessage(message);
                } else {
                    await client.sendMessage(number, message);
                }
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

const sendMediaMessage = (number, filePath, mediaType, caption = "", options = {}) => {
    return new Promise((resolve, reject) => {
        try {
            let fullPath = filePath;
            if (!path.isAbsolute(filePath)) {
                fullPath = path.resolve(filePath);
            }
            
            if (!fs.existsSync(fullPath)) {
                throw new Error(`Arquivo não encontrado: ${fullPath}`);
            }
            
            const media = MessageMedia.fromFilePath(fullPath);
            
            if (mediaType === "video") {
                media.mimetype = "video/mp4";
            }

            queue.push({ 
                number, 
                message: caption, 
                media, 
                options,
                resolve, 
                reject 
            });
            processQueue();
        } catch (error) {
            reject(error);
        }
    });
};

const isValidUrl = (string) => {
    try {
        new URL(string);
        return true;
    } catch (e) {
        return false;
    }
};

const updateQAConfig = (newConfig) => {
    Object.assign(QA_CONFIG, newConfig);
    
    if (newConfig.delayBetweenResponses !== undefined) {
        qaDatabase.setDefaultDelayBetweenResponses(newConfig.delayBetweenResponses);
    }
    
    logger.info("Configurações Q&A atualizadas:", QA_CONFIG);
};

const getQAConfig = () => {
    return { ...QA_CONFIG };
};

const addQuestion = async (perguntaTexto, respostas, triggerPhrases = null) => {
    try {
        const novaPergunta = await qaDatabase.addQuestion(perguntaTexto, respostas, triggerPhrases);
        logger.info(`Nova pergunta adicionada ao sistema Q&A: ${perguntaTexto}`);
        return novaPergunta;
    } catch (error) {
        logger.error("Erro ao adicionar pergunta:", error);
        throw error;
    }
};

const updateQuestion = async (id, updates) => {
    try {
        const perguntaAtualizada = await qaDatabase.updateQuestion(id, updates);
        logger.info(`Pergunta atualizada no sistema Q&A: ${id}`);
        return perguntaAtualizada;
    } catch (error) {
        logger.error("Erro ao atualizar pergunta:", error);
        throw error;
    }
};

const removeQuestion = async (id) => {
    try {
        const perguntaRemovida = await qaDatabase.removeQuestion(id);
        logger.info(`Pergunta removida do sistema Q&A: ${id}`);
        return perguntaRemovida;
    } catch (error) {
        logger.error("Erro ao remover pergunta:", error);
        throw error;
    }
};

const listQuestions = () => {
    try {
        return qaDatabase.getAllQuestions();
    } catch (error) {
        logger.error("Erro ao listar perguntas:", error);
        throw error;
    }
};

const getQuestionById = (id) => {
    try {
        return qaDatabase.getQuestionById(id);
    } catch (error) {
        logger.error("Erro ao buscar pergunta por ID:", error);
        throw error;
    }
};

const getQAStats = () => {
    try {
        return qaDatabase.getStats();
    } catch (error) {
        logger.error("Erro ao obter estatísticas:", error);
        throw error;
    }
};

const listMediaFiles = (tipo) => {
    try {
        return qaDatabase.listMediaFiles(tipo);
    } catch (error) {
        logger.error("Erro ao listar arquivos de mídia:", error);
        throw error;
    }
};

const testQuestion = async (pergunta) => {
    try {
        const questions = qaDatabase.getAllQuestions();
        const detection = await questionDetection.detectQuestion(pergunta, questions);
        
        return {
            pergunta_original: pergunta,
            is_question: detection.isQuestion,
            similarity: detection.similarity,
            confidence: detection.confidence,
            matched_question: detection.matchedQuestion ? {
                id: detection.matchedQuestion.id,
                pergunta_texto: detection.matchedQuestion.pergunta_texto,
                trigger_phrases: detection.matchedQuestion.trigger_phrases,
                respostas: detection.matchedQuestion.respostas
            } : null,
            matched_trigger_phrase: detection.matchedTriggerPhrase
        };
    } catch (error) {
        logger.error("Erro ao testar pergunta:", error);
        throw error;
    }
};

module.exports = {
    initializeWhatsAppClient,
    sendMessage,
    sendMediaMessage,
    updateQAConfig,
    getQAConfig,
    addQuestion,
    updateQuestion,
    removeQuestion,
    listQuestions,
    getQuestionById,
    getQAStats,
    listMediaFiles,
    testQuestion,
    QR_FILE_PATH
};

