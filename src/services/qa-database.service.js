const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");

const DB_FILE = path.join(__dirname, "../data/qa_database.json");
const MEDIA_BASE_PATH = path.join(__dirname, "../data/media");

let qaDatabase = { questions: [] };
let defaultDelayBetweenResponses = 2000;

const initialize = async () => {
    try {
        logger.info("[DB DEBUG] Tentando inicializar banco de dados Q&A...");
        if (fs.existsSync(DB_FILE)) {
            logger.info(`[DB DEBUG] Arquivo de banco de dados encontrado: ${DB_FILE}`);
            const data = fs.readFileSync(DB_FILE, "utf8");
            const parsedData = JSON.parse(data);

            qaDatabase.questions = Array.isArray(parsedData.questions) ? parsedData.questions : [];
            logger.info(`[DB DEBUG] ${qaDatabase.questions.length} perguntas carregadas do arquivo.`);

            let needsSave = false;
            for (const question of qaDatabase.questions) {
                if (!question.trigger_phrases) {
                    question.trigger_phrases = [question.pergunta_texto];
                    needsSave = true;
                    logger.info(`[DB DEBUG] Migrando pergunta ID ${question.id}: adicionando trigger_phrases.`);
                }
                if (question.pergunta_embedding) {
                    delete question.pergunta_embedding;
                    needsSave = true;
                    logger.info(`[DB DEBUG] Migrando pergunta ID ${question.id}: removendo pergunta_embedding.`);
                }
            }

            if (needsSave) {
                saveDatabase();
                logger.info("Banco de dados migrado e salvo.");
            }

            logger.info("Banco de dados Q&A carregado com sucesso.");
        } else {
            fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
            fs.writeFileSync(DB_FILE, JSON.stringify({ questions: [] }, null, 2), "utf8");
            logger.info("Banco de dados Q&A criado.");
        }

        fs.mkdirSync(path.join(MEDIA_BASE_PATH, "audio"), { recursive: true });
        fs.mkdirSync(path.join(MEDIA_BASE_PATH, "imagem"), { recursive: true });
        fs.mkdirSync(path.join(MEDIA_BASE_PATH, "video"), { recursive: true });
        logger.info("Pastas de mídia verificadas/criadas.");
    } catch (error) {
        logger.error("Erro ao inicializar banco de dados Q&A:", error);
        throw error;
    }
};

const saveDatabase = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(qaDatabase, null, 2), "utf8");
        logger.info("Banco de dados Q&A salvo com sucesso.");
    } catch (error) {
        logger.error("Erro ao salvar banco de dados Q&A:", error);
        throw error;
    }
};

const addQuestion = async (perguntaTexto, respostas, triggerPhrases = null) => {
    const newQuestion = {
        id: uuidv4(),
        pergunta_texto: perguntaTexto,
        trigger_phrases: triggerPhrases || [perguntaTexto], // Se não fornecido, usa pergunta_texto
        respostas: respostas,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        ativo: true,
    };
    qaDatabase.questions.push(newQuestion);
    saveDatabase();
    return newQuestion;
};

const updateQuestion = async (id, updates) => {
    const index = qaDatabase.questions.findIndex(q => q.id === id);
    if (index === -1) {
        throw new Error("Pergunta não encontrada.");
    }

    if (updates.trigger_phrases && !Array.isArray(updates.trigger_phrases)) {
        updates.trigger_phrases = [updates.trigger_phrases];
    }

    qaDatabase.questions[index] = {
        ...qaDatabase.questions[index],
        ...updates,
        atualizado_em: new Date().toISOString()
    };
    saveDatabase();
    return qaDatabase.questions[index];
};

const removeQuestion = async (id) => {
    const initialLength = qaDatabase.questions.length;
    qaDatabase.questions = qaDatabase.questions.filter(q => q.id !== id);
    if (qaDatabase.questions.length === initialLength) {
        throw new Error("Pergunta não encontrada.");
    }
    saveDatabase();
    return { id, message: "Pergunta removida com sucesso." };
};

const getAllQuestions = () => {
    logger.info(`[DB DEBUG] Retornando ${qaDatabase.questions.length} perguntas ativas.`);
    return qaDatabase.questions.filter(q => q.ativo);
};

const getQuestionById = (id) => {
    return qaDatabase.questions.find(q => q.id === id);
};

const validateMediaFile = (filePath) => {
    if (!filePath) return false;
    if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
        return true;
    }
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    return fs.existsSync(fullPath);
};

const listMediaFiles = (type) => {
    const mediaPath = path.join(MEDIA_BASE_PATH, type);
    if (!fs.existsSync(mediaPath)) {
        return [];
    }
    return fs.readdirSync(mediaPath).map(file => path.join(mediaPath, file));
};

const getStats = () => {
    const totalTriggerPhrases = qaDatabase.questions.reduce((acc, q) =>
        acc + (q.trigger_phrases ? q.trigger_phrases.length : 1), 0);

    return {
        totalQuestions: qaDatabase.questions.length,
        activeQuestions: qaDatabase.questions.filter(q => q.ativo).length,
        totalTriggerPhrases: totalTriggerPhrases,
        totalResponses: qaDatabase.questions.reduce((acc, q) => acc + q.respostas.length, 0),
        lastUpdated: qaDatabase.questions.length > 0 ?
            qaDatabase.questions.reduce((max, q) =>
                q.atualizado_em > max ? q.atualizado_em : max,
                qaDatabase.questions[0].atualizado_em) : null,
    };
};

const setDefaultDelayBetweenResponses = (delay) => {
    defaultDelayBetweenResponses = delay;
};

module.exports = {
    initialize,
    addQuestion,
    updateQuestion,
    removeQuestion,
    getAllQuestions,
    getQuestionById,
    validateMediaFile,
    listMediaFiles,
    getStats,
    setDefaultDelayBetweenResponses,
    saveDatabase,
    qaDatabase
};

