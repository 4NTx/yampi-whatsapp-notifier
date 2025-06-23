const { spawn } = require("child_process");
const path = require("path");
const logger = require("../utils/logger");

class QuestionDetectionService {
    constructor() {
        // Caminho explícito para o executável Python do Miniconda (INSTALA ESSA MERDA E PROCURA NO TEU PC)
        // ATENÇÃO: Substitua este caminho pelo caminho correto do seu python.exe do Miniconda
        this.pythonExecutablePath = "C:\\Users\\artur\\miniconda4\\python.exe";
        this.pythonScriptPath = path.join(__dirname, "question_detector.py");
        this.isInitialized = false;
        this.similarityThreshold = 0.8;
    }

    /**
     * Inicializa o serviço de detecção de perguntas
     */
    async initialize() {
        try {
            logger.info("Inicializando serviço de detecção de perguntas...");
            
            const testResult = await this.runPythonScript("test", []);
            
            if (testResult.success) {
                this.isInitialized = true;
                logger.info("Serviço de detecção de perguntas inicializado com sucesso");
            } else {
                throw new Error(`Falha ao inicializar: ${testResult.error}`);
            }
        } catch (error) {
            logger.error("Erro ao inicializar serviço de detecção de perguntas:", error);
            throw error;
        }
    }

    /**
     * Detecta se uma mensagem é uma pergunta e encontra a resposta mais similar
     * @param {string} userMessage - Mensagem do usuário
     * @param {Array} questionsDatabase - Array de perguntas cadastradas
     * @returns {Object} Resultado da detecção
     */
    async detectQuestion(userMessage, questionsDatabase) {
        if (!this.isInitialized) {
            throw new Error("Serviço não foi inicializado. Chame initialize() primeiro.");
        }

        try {
            logger.info(`Detectando pergunta: "${userMessage}"`);

            const result = await this.runPythonScript("detect", [
                userMessage,
                JSON.stringify(questionsDatabase),
                this.similarityThreshold.toString()
            ]);

            if (result.success) {
                const detection = JSON.parse(result.output);
                
                logger.info(`Resultado da detecção:`, {
                    isQuestion: detection.is_question,
                    similarity: detection.similarity,
                    matchedQuestionId: detection.matched_question_id
                });

                return {
                    isQuestion: detection.is_question,
                    similarity: detection.similarity,
                    matchedQuestion: detection.matched_question,
                    confidence: detection.similarity >= this.similarityThreshold ? "high" : "low"
                };
            } else {
                throw new Error(`Erro na detecção: ${result.error}`);
            }
        } catch (error) {
            logger.error("Erro ao detectar pergunta:", error);
            throw error;
        }
    }

    /**
     * Atualiza o limiar de similaridade
     * @param {number} threshold - Novo limiar (0.0 a 1.0)
     */
    setSimilarityThreshold(threshold) {
        if (threshold >= 0 && threshold <= 1) {
            this.similarityThreshold = threshold;
            logger.info(`Limiar de similaridade atualizado para: ${threshold}`);
        } else {
            throw new Error("Limiar deve estar entre 0.0 e 1.0");
        }
    }

    /**
     * Executa o script Python para detecção de perguntas
     * @param {string} command - Comando a ser executado
     * @param {Array} args - Argumentos para o comando
     * @returns {Promise<Object>} Resultado da execução
     */
    runPythonScript(command, args) {
        return new Promise((resolve) => {
            const pythonProcess = spawn(this.pythonExecutablePath, [this.pythonScriptPath, command, ...args]);
            
            let output = "";
            let error = "";

            pythonProcess.stdout.on("data", (data) => {
                output += data.toString("utf8"); 
            });

            pythonProcess.stderr.on("data", (data) => {
                error += data.toString("utf8");
            });

            pythonProcess.on("close", (code) => {
                if (code === 0) {
                    resolve({ success: true, output: output.trim() });
                } else {
                    resolve({ success: false, error: error.trim() || `Processo terminou com código ${code}` });
                }
            });

            pythonProcess.on("error", (err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
}

module.exports = new QuestionDetectionService();

