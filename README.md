# Notificador de Webhooks Yampi para WhatsApp

Este projeto é um backend Node.js que recebe webhooks da plataforma Yampi e envia notificações personalizadas para clientes via WhatsApp, com foco inicial em pedidos pagos via PIX.

## Funcionalidades

*   Recebe webhooks da Yampi (configurado para `/webhook/yampi`).
*   Processa eventos específicos de pedidos PIX:
    *   `order.created` (status `waiting_payment`): Envia Mensagem A (lembrete de pagamento).
    *   `order.paid`: Envia Mensagem B (confirmação de pagamento).
    *   `order.status.updated` (status `cancelled`): Envia Mensagem C (notificação de cancelamento).
    *   `transaction.payment.refused`: Envia Mensagem D (notificação de pagamento recusado).
*   Utiliza a biblioteca `whatsapp-web.js` para automação do WhatsApp.
*   Salva o QR code de autenticação do WhatsApp em um arquivo (`whatsapp_qr.txt`) para facilitar o escaneamento.
*   Estrutura modular para fácil manutenção e expansão.
*   Logging detalhado de eventos e erros (arquivos `logs/combined.log` e `logs/error.log`).
*   Configuração via variáveis de ambiente (`.env`).

## Estrutura do Projeto

```
/yampi-whatsapp-notifier
├── config/             # (Opcional) Arquivos de configuração adicionais
├── logs/               # Arquivos de log gerados
├── node_modules/       # Dependências do Node.js
├── src/
│   ├── controllers/    # Controladores (lógica de requisição/resposta)
│   │   └── yampi.controller.js
│   ├── routes/         # Definições de rotas da API
│   │   └── yampi.routes.js
│   ├── services/       # Lógica de negócio e integrações
│   │   ├── yampi.service.js
│   │   └── whatsapp.service.js
│   └── utils/          # Utilitários (logger, etc)
│       └── logger.js
├── .env                # Arquivo de variáveis de ambiente (NÃO versionar)
├── app.js              # Ponto de entrada principal da aplicação
├── package.json        # Metadados e dependências do projeto
├── package-lock.json   # Lockfile de dependências
├── todo.md             # Checklist de desenvolvimento (referência)
└── whatsapp_qr.txt     # Arquivo temporário para QR code (gerado ao iniciar)
```

## Pré-requisitos

*   Node.js (versão 16 ou superior recomendada)
*   npm (geralmente vem com o Node.js)
*   Conta WhatsApp ativa (para ser usada pelo bot)
*   Acesso à plataforma Yampi para configurar webhooks
*   `ngrok` ou outra ferramenta para expor seu servidor local publicamente durante testes/desenvolvimento.

## Instalação

1.  Clone ou baixe este repositório.
2.  Navegue até o diretório do projeto:
    ```bash
    cd yampi-whatsapp-notifier
    ```
3.  Instale as dependências:
    ```bash
    npm install
    ```

## Configuração

1.  **Variáveis de Ambiente:**
    *   Crie um arquivo chamado `.env` na raiz do projeto.
    *   Copie o conteúdo de `.env.example` (se existir) ou adicione a seguinte linha:
        ```dotenv
        PORT=3000
        # Adicione outras variáveis se necessário no futuro (ex: segredo Yampi)
        ```
    *   A porta `3000` é a padrão, mas pode ser alterada.

2.  **Autenticação WhatsApp:**
    *   Ao iniciar a aplicação pela primeira vez, ela tentará conectar ao WhatsApp.
    *   Um arquivo `whatsapp_qr.txt` será gerado na raiz do projeto contendo o texto do QR code.
    *   Copie o conteúdo deste arquivo.
    *   Use um gerador de QR code online (ex: [https://www.the-qrcode-generator.com/](https://www.the-qrcode-generator.com/)) para converter o texto em uma imagem QR code.
    *   Escaneie este QR code com o aplicativo WhatsApp no celular que será usado para enviar as mensagens.
    *   Após a autenticação bem-sucedida, uma pasta `session` (ou similar, dependendo da configuração de `LocalAuth`) será criada para armazenar a sessão, evitando a necessidade de escanear o QR code a cada reinicialização.
    *   O arquivo `whatsapp_qr.txt` será removido automaticamente após a autenticação.

## Execução

1.  **Modo de Desenvolvimento (com reinicialização automática via `nodemon`):**
    ```bash
    npm run dev
    ```
    *   A aplicação iniciará e tentará conectar ao WhatsApp (gerando o QR code na primeira vez).
    *   O servidor estará ouvindo na porta definida no `.env` (padrão 3000).

2.  **Modo de Produção:**
    ```bash
    npm start
    ```
    *   Use este comando para rodar a aplicação em um ambiente de produção (ex: servidor, container).

## Expondo o Endpoint (Desenvolvimento/Teste)

Para que a Yampi possa enviar webhooks para sua máquina local, você precisa expor o servidor:

1.  Instale o `ngrok` (se ainda não tiver): `npm install -g ngrok`
2.  Em um terminal separado, execute:
    ```bash
    ngrok http 3000 # Use a mesma porta configurada no .env
    ```
3.  O ngrok fornecerá uma URL pública (ex: `https://abcdef123456.ngrok.io`).
4.  **Configuração na Yampi:**
    *   Vá até as configurações de Webhooks na sua conta Yampi.
    *   Adicione um novo webhook ou edite um existente.
    *   Configure a URL do endpoint como: `https://<sua-url-ngrok>.ngrok.io/webhook/yampi` (substitua `<sua-url-ngrok>` pela URL fornecida pelo ngrok).
    *   Selecione os eventos que deseja receber (inicialmente: `order.created`, `order.paid`, `order.status.updated`, `transaction.payment.refused`).
    *   Salve a configuração.

## Extensibilidade

O projeto foi estruturado para facilitar a adição de suporte a:

*   **Outros Métodos de Pagamento:** Modifique `src/services/yampi.service.js` para reconhecer outros `paymentMethodAlias` (ex: `credit_card`, `billet`) e defina as mensagens apropriadas.
*   **Outros Eventos Yampi:** Adicione novos `case` no `switch (event)` dentro de `src/services/yampi.service.js` para lidar com eventos como `order.invoice.created`, `cart.reminder`, etc., definindo a lógica e as mensagens correspondentes.
*   **Validação de Assinatura:** Se a Yampi fornecer um segredo para assinar os webhooks, implemente um middleware para verificar a assinatura e garantir a autenticidade das requisições.
*   **Banco de Dados:** Para gerenciamento de estado mais complexo ou persistência de logs/filas, considere adicionar um banco de dados (SQLite, MongoDB) e integrá-lo aos serviços.

## Considerações

*   **Estabilidade do `whatsapp-web.js`:** Bibliotecas de automação do WhatsApp podem ser instáveis devido a atualizações do WhatsApp Web. Monitore a aplicação e esteja preparado para atualizar a biblioteca ou considerar alternativas (`venom-bot`, `baileys`) se necessário.
*   **Bloqueio do WhatsApp:** O uso de automação viola os Termos de Serviço do WhatsApp e pode levar ao bloqueio do número utilizado. Use com cautela e evite enviar spam.
*   **Segurança:** Não versione o arquivo `.env` nem a pasta de sessão do WhatsApp. Considere adicionar validação de assinatura do webhook se fornecida pela Yampi.
*   **Resposta Rápida:** O controller responde imediatamente à Yampi com status 200 e processa o webhook de forma assíncrona para evitar timeouts.

