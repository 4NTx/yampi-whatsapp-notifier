const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");

class QADatabaseService {
    constructor() {
        this.dbPath = path.join(__dirname, "../data/qa_database.json");
        this.mediaPath = path.join(__dirname, "../data/media");
        this.database = [];
        this.isInitialized = false;
        this.defaultDelayBetweenResponses = 3000;
        this.ensureDirectories();
    }

    /**
     * Garante que os diretórios necessários existam
     */
    ensureDirectories() {
        const dataDir = path.dirname(this.dbPath);

        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            logger.info(`Diretório criado: ${dataDir}`);
        }

        if (!fs.existsSync(this.mediaPath)) {
            fs.mkdirSync(this.mediaPath, { recursive: true });
            logger.info(`Diretório de mídia criado: ${this.mediaPath}`);
        }

        const mediaTypes = ["audio", "imagem", "video"];
        mediaTypes.forEach(type => {
            const typeDir = path.join(this.mediaPath, type);
            if (!fs.existsSync(typeDir)) {
                fs.mkdirSync(typeDir, { recursive: true });
                logger.info(`Diretório criado: ${typeDir}`);
            }
        });
    }

    /**
     * Inicializa o banco de dados
     */
    async initialize() {
        try {
            logger.info("Inicializando banco de dados Q&A...");

            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, "utf8");
                this.database = JSON.parse(data);
                logger.info(`Banco de dados carregado com ${this.database.length} entradas`);
            } else {
                this.database = this.createInitialDatabase();
                await this.saveDatabase();
                logger.info("Banco de dados inicial criado");
            }

            this.isInitialized = true;
            logger.info("Banco de dados Q&A inicializado com sucesso");

        } catch (error) {
            logger.error("Erro ao inicializar banco de dados Q&A:", error);
            throw error;
        }
    }

    /**
     * Cria banco de dados inicial com perguntas de exemplo
     */
    createInitialDatabase() {
        return [
            {
                id: uuidv4(),
                pergunta_texto: "Qual o status do meu pedido?",
                pergunta_embedding: [],
                respostas: [
                    {
                        tipo: "texto",
                        conteudo: "Para verificar o status do seu pedido, você pode acessar nossa página de rastreamento ou aguardar as atualizações automáticas que enviamos via WhatsApp.",
                        caminho_arquivo: null,
                        ativo: true
                    }
                ],
                criado_em: new Date().toISOString(),
                atualizado_em: new Date().toISOString(),
                ativo: true
            },
            {
                id: uuidv4(),
                pergunta_texto: "Como faço para cancelar meu pedido?",
                pergunta_embedding: [],
                respostas: [
                    {
                        tipo: "texto",
                        conteudo: "Para cancelar seu pedido, entre em contato conosco o mais rápido possível. Se o pedido ainda não foi processado, poderemos cancelá-lo sem problemas.",
                        caminho_arquivo: null,
                        ativo: true
                    }
                ],
                criado_em: new Date().toISOString(),
                atualizado_em: new Date().toISOString(),
                ativo: true
            },
            {
                id: uuidv4(),
                pergunta_texto: "Quais são as formas de pagamento?",
                pergunta_embedding: [],
                respostas: [
                    {
                        tipo: "texto",
                        conteudo: "Aceitamos PIX, cartão de crédito e boleto bancário. O PIX tem aprovação instantânea, cartão é processado rapidamente, e boleto pode levar até 3 dias úteis para compensar.",
                        caminho_arquivo: null,
                        ativo: true
                    }
                ],
                criado_em: new Date().toISOString(),
                atualizado_em: new Date().toISOString(),
                ativo: true
            },
            {
                id: uuidv4(),
                pergunta_texto: "Quanto tempo demora para entregar?",
                pergunta_embedding: [],
                respostas: [
                    {
                        tipo: "texto",
                        conteudo: "O prazo de entrega varia conforme sua região. Geralmente é de 5 a 15 dias úteis. Você receberá o código de rastreamento assim que o produto for despachado.",
                        caminho_arquivo: null,
                        ativo: true
                    }
                ],
                criado_em: new Date().toISOString(),
                atualizado_em: new Date().toISOString(),
                ativo: true
            }
        ];
    }

    /**
     * Salva o banco de dados no arquivo
     */
    async saveDatabase() {
        try {
            const data = JSON.stringify(this.database, null, 2);
            fs.writeFileSync(this.dbPath, data, "utf8");
            logger.info("Banco de dados salvo com sucesso");
        } catch (error) {
            logger.error("Erro ao salvar banco de dados:", error);
            throw error;
        }
    }

    /**
     * Recarrega o banco de dados do arquivo (útil para atualizações em tempo real)
     */
    async reloadDatabase() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, "utf8");
                this.database = JSON.parse(data);
                logger.info(`Banco de dados recarregado com ${this.database.length} entradas`);
                return true;
            }
            return false;
        } catch (error) {
            logger.error("Erro ao recarregar banco de dados:", error);
            throw error;
        }
    }

    /**
     * Retorna todas as perguntas ativas (sempre recarrega do arquivo)
     */
    getAllQuestions() {
        if (!this.isInitialized) {
            throw new Error("Banco de dados não foi inicializado");
        }

        this.reloadDatabase();

        return this.database.filter(item => item.ativo);
    }

    /**
     * Adiciona uma nova pergunta e resposta
     */
    async addQuestion(perguntaTexto, respostas) {
        if (!this.isInitialized) {
            throw new Error("Banco de dados não foi inicializado");
        }

        try {
            const respostasNormalizadas = respostas.map(resposta => {
                const respostaNormalizada = {
                    tipo: resposta.tipo,
                    conteudo: resposta.conteudo || null,
                    caminho_arquivo: resposta.caminho_arquivo || null,
                    ativo: resposta.ativo !== undefined ? resposta.ativo : true
                };

                if (!["texto", "audio", "imagem", "video"].includes(respostaNormalizada.tipo)) {
                    throw new Error(`Tipo de resposta inválido: ${respostaNormalizada.tipo}`);
                }

                if (["audio", "imagem", "video"].includes(respostaNormalizada.tipo) && !respostaNormalizada.caminho_arquivo) {
                    throw new Error(`Respostas do tipo ${respostaNormalizada.tipo} devem ter caminho_arquivo`);
                }

                if (respostaNormalizada.tipo === "texto" && !respostaNormalizada.conteudo) {
                    throw new Error("Respostas do tipo texto devem ter conteúdo");
                }

                return respostaNormalizada;
            });

            const novaEntrada = {
                id: uuidv4(),
                pergunta_texto: perguntaTexto,
                pergunta_embedding: [],
                respostas: respostasNormalizadas,
                criado_em: new Date().toISOString(),
                atualizado_em: new Date().toISOString(),
                ativo: true
            };

            await this.reloadDatabase();

            this.database.push(novaEntrada);
            await this.saveDatabase();

            logger.info(`Nova pergunta adicionada: ${perguntaTexto}`);
            return novaEntrada;

        } catch (error) {
            logger.error("Erro ao adicionar pergunta:", error);
            throw error;
        }
    }

    /**
     * Atualiza uma pergunta existente
     */
    async updateQuestion(id, updates) {
        if (!this.isInitialized) {
            throw new Error("Banco de dados não foi inicializado");
        }

        try {
            await this.reloadDatabase();

            const index = this.database.findIndex(item => item.id === id);

            if (index === -1) {
                throw new Error(`Pergunta com ID ${id} não encontrada`);
            }

            if (updates.respostas) {
                updates.respostas = updates.respostas.map(resposta => {
                    const respostaNormalizada = {
                        tipo: resposta.tipo,
                        conteudo: resposta.conteudo || null,
                        caminho_arquivo: resposta.caminho_arquivo || null,
                        ativo: resposta.ativo !== undefined ? resposta.ativo : true
                    };

                    if (!["texto", "audio", "imagem", "video"].includes(respostaNormalizada.tipo)) {
                        throw new Error(`Tipo de resposta inválido: ${respostaNormalizada.tipo}`);
                    }

                    return respostaNormalizada;
                });
            }

            this.database[index] = {
                ...this.database[index],
                ...updates,
                atualizado_em: new Date().toISOString()
            };

            await this.saveDatabase();

            logger.info(`Pergunta atualizada: ${id}`);
            return this.database[index];

        } catch (error) {
            logger.error("Erro ao atualizar pergunta:", error);
            throw error;
        }
    }

    /**
     * Remove uma pergunta (marca como inativa)
     */
    async removeQuestion(id) {
        if (!this.isInitialized) {
            throw new Error("Banco de dados não foi inicializado");
        }

        try {
            await this.reloadDatabase();

            const index = this.database.findIndex(item => item.id === id);

            if (index === -1) {
                throw new Error(`Pergunta com ID ${id} não encontrada`);
            }

            this.database[index].ativo = false;
            this.database[index].atualizado_em = new Date().toISOString();

            await this.saveDatabase();

            logger.info(`Pergunta removida: ${id}`);
            return this.database[index];

        } catch (error) {
            logger.error("Erro ao remover pergunta:", error);
            throw error;
        }
    }

    /**
     * Busca pergunta por ID
     */
    getQuestionById(id) {
        if (!this.isInitialized) {
            throw new Error("Banco de dados não foi inicializado");
        }

        this.reloadDatabase();

        return this.database.find(item => item.id === id && item.ativo);
    }

    /**
     * Atualiza o embedding de uma pergunta
     */
    async updateQuestionEmbedding(id, embedding) {
        if (!this.isInitialized) {
            throw new Error("Banco de dados não foi inicializado");
        }

        try {
            await this.reloadDatabase();

            const index = this.database.findIndex(item => item.id === id);

            if (index === -1) {
                throw new Error(`Pergunta com ID ${id} não encontrada`);
            }

            this.database[index].pergunta_embedding = embedding;
            this.database[index].atualizado_em = new Date().toISOString();

            await this.saveDatabase();

            logger.info(`Embedding atualizado para pergunta: ${id}`);

        } catch (error) {
            logger.error("Erro ao atualizar embedding:", error);
            throw error;
        }
    }

    /**
     * Retorna estatísticas do banco de dados
     */
    getStats() {
        if (!this.isInitialized) {
            throw new Error("Banco de dados não foi inicializado");
        }

        this.reloadDatabase();

        const total = this.database.length;
        const ativas = this.database.filter(item => item.ativo).length;
        const inativas = total - ativas;

        const tiposResposta = {};
        const totalRespostas = {
            ativas: 0,
            inativas: 0
        };

        this.database.forEach(item => {
            if (item.ativo) {
                item.respostas.forEach(resposta => {
                    if (resposta.ativo) {
                        tiposResposta[resposta.tipo] = (tiposResposta[resposta.tipo] || 0) + 1;
                        totalRespostas.ativas++;
                    } else {
                        totalRespostas.inativas++;
                    }
                });
            }
        });

        return {
            total_perguntas: total,
            perguntas_ativas: ativas,
            perguntas_inativas: inativas,
            total_respostas: totalRespostas,
            tipos_resposta: tiposResposta,
            delay_padrao_entre_respostas: this.defaultDelayBetweenResponses
        };
    }

    /**
     * Retorna o caminho para salvar arquivos de mídia
     */
    getMediaPath(tipo, nomeArquivo) {
        return path.join(this.mediaPath, tipo, nomeArquivo);
    }

    /**
     * Valida se um arquivo de mídia existe
     */
    validateMediaFile(caminhoArquivo) {
        if (!caminhoArquivo) return false;

        let fullPath = caminhoArquivo;
        if (!path.isAbsolute(caminhoArquivo)) {
            fullPath = path.resolve(caminhoArquivo);
        }

        return fs.existsSync(fullPath);
    }

    /**
     * Lista arquivos de mídia disponíveis por tipo
     */
    listMediaFiles(tipo) {
        const mediaTypeDir = path.join(this.mediaPath, tipo);

        if (!fs.existsSync(mediaTypeDir)) {
            return [];
        }

        try {
            return fs.readdirSync(mediaTypeDir).map(file => ({
                nome: file,
                caminho_relativo: `./data/media/${tipo}/${file}`,
                caminho_absoluto: path.join(mediaTypeDir, file)
            }));
        } catch (error) {
            logger.error(`Erro ao listar arquivos de mídia do tipo ${tipo}:`, error);
            return [];
        }
    }

    /**
     * Configura delay padrão entre respostas múltiplas
     */
    setDefaultDelayBetweenResponses(delayMs) {
        if (delayMs >= 0) {
            this.defaultDelayBetweenResponses = delayMs;
            logger.info(`Delay padrão entre respostas atualizado para: ${delayMs}ms`);
        } else {
            throw new Error("Delay deve ser um valor positivo em milissegundos");
        }
    }

    /**
     * Obtém delay padrão entre respostas múltiplas
     */
    getDefaultDelayBetweenResponses() {
        return this.defaultDelayBetweenResponses;
    }
}

module.exports = new QADatabaseService();

