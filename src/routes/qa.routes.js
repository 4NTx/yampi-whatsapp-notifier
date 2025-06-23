const express = require("express");
const router = express.Router();
const whatsappQA = require("../services/whatsapp.service");
const logger = require("../utils/logger");

/**
 * GET /qa/config - Obtém configurações do sistema Q&A
 */
router.get("/config", (req, res) => {
    try {
        const config = whatsappQA.getQAConfig();
        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        logger.error("Erro ao obter configurações Q&A:", error);
        res.status(500).json({
            success: false,
            error: "Erro interno do servidor"
        });
    }
});

/**
 * PUT /qa/config - Atualiza configurações do sistema Q&A
 */
router.put("/config", (req, res) => {
    try {
        const {
            enabled,
            similarityThreshold,
            fallbackMessage,
            enableProcessingMessage,
            delayBetweenResponses,
            audioAsVoiceNote
        } = req.body;

        const newConfig = {};
        if (enabled !== undefined) newConfig.enabled = enabled;
        if (similarityThreshold !== undefined) {
            if (similarityThreshold < 0 || similarityThreshold > 1) {
                return res.status(400).json({
                    success: false,
                    error: "similarityThreshold deve estar entre 0 e 1"
                });
            }
            newConfig.similarityThreshold = similarityThreshold;
        }
        if (fallbackMessage !== undefined) newConfig.fallbackMessage = fallbackMessage;
        if (enableProcessingMessage !== undefined) newConfig.enableProcessingMessage = enableProcessingMessage;
        if (delayBetweenResponses !== undefined) {
            if (delayBetweenResponses < 0) {
                return res.status(400).json({
                    success: false,
                    error: "delayBetweenResponses deve ser um valor positivo em milissegundos"
                });
            }
            newConfig.delayBetweenResponses = delayBetweenResponses;
        }
        if (audioAsVoiceNote !== undefined) newConfig.audioAsVoiceNote = audioAsVoiceNote;

        whatsappQA.updateQAConfig(newConfig);

        res.json({
            success: true,
            message: "Configurações atualizadas com sucesso",
            data: whatsappQA.getQAConfig()
        });
    } catch (error) {
        logger.error("Erro ao atualizar configurações Q&A:", error);
        res.status(500).json({
            success: false,
            error: "Erro interno do servidor"
        });
    }
});

/**
 * GET /qa/questions - Lista todas as perguntas
 */
router.get("/questions", (req, res) => {
    try {
        const questions = whatsappQA.listQuestions();
        res.json({
            success: true,
            data: questions,
            total: questions.length
        });
    } catch (error) {
        logger.error("Erro ao listar perguntas:", error);
        res.status(500).json({
            success: false,
            error: "Erro interno do servidor"
        });
    }
});

/**
 * GET /qa/questions/:id - Busca pergunta por ID
 */
router.get("/questions/:id", (req, res) => {
    try {
        const { id } = req.params;
        const question = whatsappQA.getQuestionById(id);

        if (!question) {
            return res.status(404).json({
                success: false,
                error: "Pergunta não encontrada"
            });
        }

        res.json({
            success: true,
            data: question
        });
    } catch (error) {
        logger.error("Erro ao buscar pergunta por ID:", error);
        res.status(500).json({
            success: false,
            error: "Erro interno do servidor"
        });
    }
});

/**
 * POST /qa/questions - Adiciona nova pergunta
 */
router.post("/questions", async (req, res) => {
    try {
        const { pergunta_texto, respostas } = req.body;

        if (!pergunta_texto || !respostas || !Array.isArray(respostas)) {
            return res.status(400).json({
                success: false,
                error: "Campos obrigatórios: pergunta_texto (string) e respostas (array)"
            });
        }

        if (respostas.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Deve haver pelo menos uma resposta"
            });
        }

        for (let i = 0; i < respostas.length; i++) {
            const resposta = respostas[i];

            if (!resposta.tipo || !["texto", "audio", "imagem", "video"].includes(resposta.tipo)) {
                return res.status(400).json({
                    success: false,
                    error: `Resposta ${i + 1}: tipo deve ser 'texto', 'audio', 'imagem' ou 'video'`
                });
            }

            if (resposta.tipo === "texto") {
                if (!resposta.conteudo) {
                    return res.status(400).json({
                        success: false,
                        error: `Resposta ${i + 1}: respostas do tipo 'texto' devem ter o campo 'conteudo'`
                    });
                }
            } else {
                if (!resposta.caminho_arquivo) {
                    return res.status(400).json({
                        success: false,
                        error: `Resposta ${i + 1}: respostas do tipo '${resposta.tipo}' devem ter o campo 'caminho_arquivo'`
                    });
                }
                const fs = require("fs");
                const path = require("path");

                let fullPath = resposta.caminho_arquivo;
                if (!path.isAbsolute(resposta.caminho_arquivo)) {
                    fullPath = path.resolve(resposta.caminho_arquivo);
                }

                if (!fs.existsSync(fullPath)) {
                    return res.status(400).json({
                        success: false,
                        error: `Resposta ${i + 1}: arquivo não encontrado: ${resposta.caminho_arquivo}`
                    });
                }
            }
        }

        const novaPergunta = await whatsappQA.addQuestion(pergunta_texto, respostas);

        res.status(201).json({
            success: true,
            message: "Pergunta adicionada com sucesso",
            data: novaPergunta
        });

    } catch (error) {
        logger.error("Erro ao adicionar pergunta:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Erro interno do servidor"
        });
    }
});

/**
 * PUT /qa/questions/:id - Atualiza uma pergunta existente
 */
router.put("/questions/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const existingQuestion = whatsappQA.getQuestionById(id);
        if (!existingQuestion) {
            return res.status(404).json({
                success: false,
                error: "Pergunta não encontrada"
            });
        }

        if (updates.respostas) {
            if (!Array.isArray(updates.respostas) || updates.respostas.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "respostas deve ser um array não vazio"
                });
            }

            for (let i = 0; i < updates.respostas.length; i++) {
                const resposta = updates.respostas[i];

                if (!resposta.tipo || !["texto", "audio", "imagem", "video"].includes(resposta.tipo)) {
                    return res.status(400).json({
                        success: false,
                        error: `Resposta ${i + 1}: tipo deve ser 'texto', 'audio', 'imagem' ou 'video'`
                    });
                }

                if (resposta.tipo === "texto" && !resposta.conteudo) {
                    return res.status(400).json({
                        success: false,
                        error: `Resposta ${i + 1}: respostas do tipo 'texto' devem ter o campo 'conteudo'`
                    });
                }

                if (["audio", "imagem", "video"].includes(resposta.tipo) && !resposta.caminho_arquivo) {
                    return res.status(400).json({
                        success: false,
                        error: `Resposta ${i + 1}: respostas do tipo '${resposta.tipo}' devem ter o campo 'caminho_arquivo'`
                    });
                }
            }
        }

        const perguntaAtualizada = await whatsappQA.updateQuestion(id, updates);

        res.json({
            success: true,
            message: "Pergunta atualizada com sucesso",
            data: perguntaAtualizada
        });

    } catch (error) {
        logger.error("Erro ao atualizar pergunta:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Erro interno do servidor"
        });
    }
});

/**
 * DELETE /qa/questions/:id - Remove uma pergunta (marca como inativa)
 */
router.delete("/questions/:id", async (req, res) => {
    try {
        const { id } = req.params;


        const existingQuestion = whatsappQA.getQuestionById(id);
        if (!existingQuestion) {
            return res.status(404).json({
                success: false,
                error: "Pergunta não encontrada"
            });
        }

        const perguntaRemovida = await whatsappQA.removeQuestion(id);

        res.json({
            success: true,
            message: "Pergunta removida com sucesso",
            data: perguntaRemovida
        });

    } catch (error) {
        logger.error("Erro ao remover pergunta:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Erro interno do servidor"
        });
    }
});

/**
 * GET /qa/stats - Obtém estatísticas do sistema Q&A
 */
router.get("/stats", (req, res) => {
    try {
        const stats = whatsappQA.getQAStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error("Erro ao obter estatísticas Q&A:", error);
        res.status(500).json({
            success: false,
            error: "Erro interno do servidor"
        });
    }
});

/**
 * POST /qa/test - Testa uma pergunta no sistema
 */
router.post("/test", async (req, res) => {
    try {
        const { pergunta } = req.body;

        if (!pergunta) {
            return res.status(400).json({
                success: false,
                error: "Campo obrigatório: pergunta"
            });
        }

        const result = await whatsappQA.testQuestion(pergunta);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error("Erro ao testar pergunta:", error);
        res.status(500).json({
            success: false,
            error: "Erro interno do servidor"
        });
    }
});

/**
 * GET /qa/media/:tipo - Lista arquivos de mídia disponíveis por tipo
 */
router.get("/media/:tipo", (req, res) => {
    try {
        const { tipo } = req.params;

        if (!["audio", "imagem", "video"].includes(tipo)) {
            return res.status(400).json({
                success: false,
                error: "Tipo deve ser 'audio', 'imagem' ou 'video'"
            });
        }

        const files = whatsappQA.listMediaFiles(tipo);

        res.json({
            success: true,
            data: files,
            total: files.length
        });

    } catch (error) {
        logger.error("Erro ao listar arquivos de mídia:", error);
        res.status(500).json({
            success: false,
            error: "Erro interno do servidor"
        });
    }
});

/**
 * GET /qa/media - Lista todos os arquivos de mídia disponíveis
 */
router.get("/media", (req, res) => {
    try {
        const audioFiles = whatsappQA.listMediaFiles("audio");
        const imagemFiles = whatsappQA.listMediaFiles("imagem");
        const videoFiles = whatsappQA.listMediaFiles("video");

        res.json({
            success: true,
            data: {
                audio: audioFiles,
                imagem: imagemFiles,
                video: videoFiles
            },
            total: {
                audio: audioFiles.length,
                imagem: imagemFiles.length,
                video: videoFiles.length,
                total: audioFiles.length + imagemFiles.length + videoFiles.length
            }
        });

    } catch (error) {
        logger.error("Erro ao listar todos os arquivos de mídia:", error);
        res.status(500).json({
            success: false,
            error: "Erro interno do servidor"
        });
    }
});

/**
 * POST /qa/reload - Força o recarregamento do banco de dados
 */
router.post("/reload", async (req, res) => {
    try {
        const questions = whatsappQA.listQuestions();

        res.json({
            success: true,
            message: "Banco de dados recarregado com sucesso",
            data: {
                total_perguntas: questions.length
            }
        });

    } catch (error) {
        logger.error("Erro ao recarregar banco de dados:", error);
        res.status(500).json({
            success: false,
            error: "Erro interno do servidor"
        });
    }
});

module.exports = router;

