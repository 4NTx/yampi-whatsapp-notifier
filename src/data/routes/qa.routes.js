const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const whatsappQA = require("../../services/whatsapp.service");
const qaDatabase = require("../../services/qa-database.service");

router.post("/questions", async (req, res) => {
    try {
        const { pergunta_texto, respostas, trigger_phrases } = req.body;

        if (!pergunta_texto || !respostas || !Array.isArray(respostas)) {
            return res.status(400).json({
                error: "Campos obrigatórios: pergunta_texto (string) e respostas (array)"
            });
        }

        if (trigger_phrases && !Array.isArray(trigger_phrases)) {
            return res.status(400).json({
                error: "trigger_phrases deve ser um array de strings"
            });
        }

        for (const resposta of respostas) {
            if (!resposta.tipo || !["texto", "audio", "imagem", "video"].includes(resposta.tipo)) {
                return res.status(400).json({
                    error: "Cada resposta deve ter um tipo válido: texto, audio, imagem ou video"
                });
            }

            if (resposta.tipo !== "texto" && resposta.caminho_arquivo) {
                if (!qaDatabase.validateMediaFile(resposta.caminho_arquivo)) {
                    logger.warn(`Arquivo de mídia não encontrado: ${resposta.caminho_arquivo}`);
                }
            }
        }

        const novaPergunta = await whatsappQA.addQuestion(pergunta_texto, respostas, trigger_phrases);

        logger.info(`Nova pergunta adicionada via API: ${pergunta_texto}`);
        res.status(201).json(novaPergunta);

    } catch (error) {
        logger.error("Erro ao adicionar pergunta via API:", error);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

router.get("/questions", (req, res) => {
    try {
        const questions = whatsappQA.listQuestions();
        res.json(questions);
    } catch (error) {
        logger.error("Erro ao listar perguntas via API:", error);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

router.get("/questions/:id", (req, res) => {
    try {
        const { id } = req.params;
        const question = whatsappQA.getQuestionById(id);

        if (!question) {
            return res.status(404).json({ error: "Pergunta não encontrada" });
        }

        res.json(question);
    } catch (error) {
        logger.error("Erro ao buscar pergunta por ID via API:", error);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

router.put("/questions/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (updates.trigger_phrases && !Array.isArray(updates.trigger_phrases)) {
            return res.status(400).json({
                error: "trigger_phrases deve ser um array de strings"
            });
        }

        if (updates.respostas && Array.isArray(updates.respostas)) {
            for (const resposta of updates.respostas) {
                if (resposta.tipo && !["texto", "audio", "imagem", "video"].includes(resposta.tipo)) {
                    return res.status(400).json({
                        error: "Cada resposta deve ter um tipo válido: texto, audio, imagem ou video"
                    });
                }

                if (resposta.tipo !== "texto" && resposta.caminho_arquivo) {
                    if (!qaDatabase.validateMediaFile(resposta.caminho_arquivo)) {
                        logger.warn(`Arquivo de mídia não encontrado: ${resposta.caminho_arquivo}`);
                    }
                }
            }
        }

        const perguntaAtualizada = await whatsappQA.updateQuestion(id, updates);

        logger.info(`Pergunta atualizada via API: ${id}`);
        res.json(perguntaAtualizada);

    } catch (error) {
        if (error.message === "Pergunta não encontrada.") {
            return res.status(404).json({ error: error.message });
        }

        logger.error("Erro ao atualizar pergunta via API:", error);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

router.delete("/questions/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const resultado = await whatsappQA.removeQuestion(id);

        logger.info(`Pergunta removida via API: ${id}`);
        res.json(resultado);

    } catch (error) {
        if (error.message === "Pergunta não encontrada.") {
            return res.status(404).json({ error: error.message });
        }

        logger.error("Erro ao remover pergunta via API:", error);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

router.post("/test", async (req, res) => {
    try {
        const { pergunta } = req.body;

        if (!pergunta) {
            return res.status(400).json({
                error: "Campo obrigatório: pergunta (string)"
            });
        }

        const resultado = await whatsappQA.testQuestion(pergunta);

        logger.info(`Pergunta testada via API: "${pergunta}" - Resultado: ${resultado.is_question}`);
        res.json(resultado);

    } catch (error) {
        logger.error("Erro ao testar pergunta via API:", error);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

router.get("/stats", (req, res) => {
    try {
        const stats = whatsappQA.getQAStats();
        res.json(stats);
    } catch (error) {
        logger.error("Erro ao obter estatísticas via API:", error);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

router.get("/config", (req, res) => {
    try {
        const config = whatsappQA.getQAConfig();
        res.json(config);
    } catch (error) {
        logger.error("Erro ao obter configurações via API:", error);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

router.put("/config", (req, res) => {
    try {
        const newConfig = req.body;
        whatsappQA.updateQAConfig(newConfig);

        const updatedConfig = whatsappQA.getQAConfig();

        logger.info("Configurações Q&A atualizadas via API");
        res.json(updatedConfig);

    } catch (error) {
        logger.error("Erro ao atualizar configurações via API:", error);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

router.get("/media/:type", (req, res) => {
    try {
        const { type } = req.params;

        if (!["audio", "imagem", "video"].includes(type)) {
            return res.status(400).json({
                error: "Tipo de mídia inválido. Use: audio, imagem ou video"
            });
        }

        const files = whatsappQA.listMediaFiles(type);
        res.json({ type, files });

    } catch (error) {
        logger.error("Erro ao listar arquivos de mídia via API:", error);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

router.post("/reload", async (req, res) => {
    try {
        await qaDatabase.initialize();

        logger.info("Banco de dados Q&A recarregado via API");
        res.json({ message: "Banco de dados recarregado com sucesso" });

    } catch (error) {
        logger.error("Erro ao recarregar banco de dados via API:", error);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

module.exports = router;

