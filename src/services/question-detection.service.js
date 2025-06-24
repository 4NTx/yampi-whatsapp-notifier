const logger = require("../utils/logger");
const qaDatabase = require("../services/qa-database.service"); // Adicionado para depuração

class QuestionDetectionService {
    constructor() {
        this.isInitialized = false;
    }

    async initialize() {
        try {
            logger.info("Inicializando serviço de detecção de perguntas (modo frases gatilho)...");
            this.isInitialized = true;
            logger.info("Serviço de detecção de perguntas inicializado com sucesso.");
        } catch (error) {
            logger.error("Erro ao inicializar serviço de detecção de perguntas:", error);
            throw error;
        }
    }

    setSimilarityThreshold(threshold) {
        logger.info(`Limiar de similaridade definido para: ${threshold} (não usado no modo frases gatilho)`);
    }

    normalizeText(text) {
        return text
            .toLowerCase()
            .trim()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\w\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    async detectQuestion(userMessage, questions) {
        try {
            if (!this.isInitialized) {
                throw new Error("Serviço de detecção de perguntas não foi inicializado.");
            }

            const normalizedUserMessage = this.normalizeText(userMessage);
            logger.info(`[DETECTION DEBUG] Mensagem do usuário normalizada: "${normalizedUserMessage}"`);

            logger.info(`[DETECTION DEBUG] Perguntas carregadas para detecção: ${JSON.stringify(questions.map(q => ({ id: q.id, pergunta_texto: q.pergunta_texto, trigger_phrases: q.trigger_phrases })))}`);

            for (const question of questions) {
                const triggerPhrases = question.trigger_phrases || [question.pergunta_texto];

                for (const triggerPhrase of triggerPhrases) {
                    const normalizedTrigger = this.normalizeText(triggerPhrase);
                    logger.info(`[DETECTION DEBUG] Comparando "${normalizedUserMessage}" com frase gatilho normalizada: "${normalizedTrigger}" (da pergunta ID: ${question.id})`);

                    if (normalizedUserMessage === normalizedTrigger) {
                        logger.info(`[DETECTION DEBUG] Correspondência EXATA encontrada!`);
                        return {
                            isQuestion: true,
                            similarity: 1.0,
                            confidence: 1.0,
                            matchedQuestion: question,
                            matchedQuestionId: question.id,
                            matchedTriggerPhrase: triggerPhrase
                        };
                    }

                    if (normalizedUserMessage.includes(normalizedTrigger)) {
                        logger.info(`[DETECTION DEBUG] Correspondência CONTÉM encontrada!`);
                        return {
                            isQuestion: true,
                            similarity: 0.8,
                            confidence: 0.8,
                            matchedQuestion: question,
                            matchedQuestionId: question.id,
                            matchedTriggerPhrase: triggerPhrase
                        };
                    }

                    if (normalizedTrigger.includes(normalizedUserMessage) && normalizedUserMessage.length >= 3) {
                        logger.info(`[DETECTION DEBUG] Correspondência ESTÁ CONTIDA encontrada!`);
                        return {
                            isQuestion: true,
                            similarity: 0.6,
                            confidence: 0.6,
                            matchedQuestion: question,
                            matchedQuestionId: question.id,
                            matchedTriggerPhrase: triggerPhrase
                        };
                    }
                }
            }

            logger.info(`[DETECTION DEBUG] Nenhuma correspondência encontrada para "${normalizedUserMessage}".`);
            return {
                isQuestion: false,
                similarity: 0.0,
                confidence: 0.0,
                matchedQuestion: null,
                matchedQuestionId: null,
                matchedTriggerPhrase: null
            };

        } catch (error) {
            logger.error("Erro ao detectar pergunta:", error);
            throw error;
        }
    }
}

module.exports = new QuestionDetectionService();

