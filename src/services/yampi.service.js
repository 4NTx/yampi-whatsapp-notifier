const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");
const whatsappService = require("./whatsapp.service");
const { parsePhoneNumberFromString } = require("libphonenumber-js");

const PIX_PAYMENT_ALIAS = "pix";
const BOLETO_PAYMENT_ALIASES = ["boleto", "billet"];
const CREDIT_CARD_PAYMENT_ALIAS = "credit_card";

const pixMessages = JSON.parse(fs.readFileSync(path.join(__dirname, "messages/pix.json"), "utf8"));
const boletoMessages = JSON.parse(fs.readFileSync(path.join(__dirname, "messages/boleto.json"), "utf8"));
const creditCardMessages = JSON.parse(fs.readFileSync(path.join(__dirname, "messages/credit_card.json"), "utf8"));
const cartReminderMessages = JSON.parse(fs.readFileSync(path.join(__dirname, "messages/cart_reminder.json"), "utf8"));

const formatWhatsappId = (phoneNumber) => {
    if (!phoneNumber) return null;
    const phoneNumberObj = parsePhoneNumberFromString(phoneNumber, "BR");
    if (!phoneNumberObj || !phoneNumberObj.isValid()) {
        console.warn(`Número inválido: ${phoneNumber}`);
        return null;
    }
    return phoneNumberObj.number.replace("+", "") + "@c.us";
};

const formatCurrency = (value) => `R$${value.toFixed(2).replace(".", ",")}`;

const fillTemplate = (template, data) =>
    template.replace(/\{(\w+)\}/g, (_, key) => data[key] || "");

const formatOrderDetails = (items) => {
    return items
        .map((item, index) => {
            const title = item.sku?.data?.title || `Produto ${index + 1}`;
            const quantity = item.quantity || 1;
            return `- ${title} (quantidade: ${quantity})`;
        })
        .join("\n");
};

const formatProductsList = (items) => {
    return items
        .map((item, index) => {
            const title = item.sku?.data?.title || `Produto ${index + 1}`;
            const quantity = item.quantity || 1;
            return `• *${title}* (quantidade: ${quantity})`;
        })
        .join("\n\n");
};

const buildCartUrl = (items) => {
    const baseUrl = "https://seguro.fuscashop.com/r/";
    const params = items
        .map((item) => {
            const token = item.sku?.data?.token || "";
            const quantity = item.quantity || 1;
            if (!token) return null;
            return `${token}:${quantity}`;
        })
        .filter(Boolean)
        .join(",");
    return baseUrl + params;
};

const processWebhook = async (payload) => {
    const { event, resource } = payload;
    const orderId = resource?.id || "N/A";

    logger.info(`Iniciando processamento do evento: ${event}`, { orderId });

    try {
        if (event !== "cart.reminder") {
            if (!resource || !resource.customer?.data || !resource.status?.data) {
                logger.warn(`Payload inválido ou dados essenciais ausentes para o evento ${event}`, { orderId });
                return;
            }
        }

        const customer = resource.customer?.data || {};
        const customerName = customer.first_name || (customer.name ? customer.name.split(" ")[0] : "Cliente");
        const customerPhone = customer.phone?.full_number || "";
        const whatsappId = formatWhatsappId(customerPhone);
        if (!whatsappId) {
            logger.warn(`Número inválido para WhatsApp`, { orderId, customerId: customer.id, phone: customerPhone });
            return;
        }

        const orderStatusAlias = resource.status?.data?.alias || "";

        const totalWithoutDiscount = resource.items?.data?.reduce((sum, item) => {
            const priceSale = item.sku?.data?.price_sale ?? 0;
            return sum + priceSale * (item.quantity || 1);
        }, 0) || 0;
        const totalWithDiscount = resource.buyer_value_total || 0;

        const productsList = formatProductsList(resource.items?.data || []);
        const orderDetails = formatOrderDetails(resource.items?.data || []);
        const purchaseUrl = buildCartUrl(resource.items?.data || []);
        const reorderUrl = resource.reorder_url || "";

        const shippingAddress = resource.shipping_address?.data || {};
        const shippingCode = resource.track_code || "";
        const shippingUrl = "https://fuscashop.com/pages/rastrear-pedido";

        let paymentMethodAlias = null;
        let pixExpirationDate = "";
        let pixQrCode = "";
        let boletoBarcode = "";
        let boletoUrl = resource.billet_whatsapp_link || "";

        let transaction = null;

        if (resource.payments && resource.payments.length > 0) {
            paymentMethodAlias = resource.payments[0]?.alias;
        }

        if (resource.transactions?.data && resource.transactions.data.length > 0) {
            transaction = resource.transactions.data[0];
            paymentMethodAlias = transaction?.payment?.data?.alias || paymentMethodAlias;

            if (transaction.metadata) {
                if (Array.isArray(transaction.metadata)) {
                    const pixExpirationEntry = transaction.metadata.find((item) => item.key === "pix_expiration_date");
                    pixExpirationDate = pixExpirationEntry ? pixExpirationEntry.value || "" : "";

                    const pixQrCodeEntry = transaction.metadata.find((item) => item.key === "pix_qr_code");
                    pixQrCode = pixQrCodeEntry ? pixQrCodeEntry.value || "" : "";
                } else if (transaction.metadata.data) {
                    pixExpirationDate = transaction.metadata.data.pix_expiration_date || "";
                    pixQrCode = transaction.metadata.data.pix_qr_code || "";
                }
            }

            boletoBarcode = transaction.billet_barcode || "";
            boletoUrl = transaction.billet_url || boletoUrl;
        }

        const templateData = {
            customerName,
            productsList,
            orderDetails,
            orderValue: totalWithDiscount.toFixed(2).replace(".", ","),
            totalWithoutDiscount: totalWithoutDiscount.toFixed(2).replace(".", ","),
            pixQrCode,
            pixExpirationDate: pixExpirationDate ? `⚠️ Expira em: ${pixExpirationDate}` : "",
            purchaseUrl,
            reorderUrl,
            boletoUrl,
            boletoBarcode,
            shippingCode,
            shippingUrl,
            shippingAddress,
        };

        let messageToSend = null;

        if (event === "cart.reminder") {
            if (resource.items?.data?.length > 0) {
                messageToSend = fillTemplate(cartReminderMessages.reminder, {
                    nome: customerName,
                    produto: productsList,
                    quantidade: resource.items.data.reduce((acc, item) => acc + (item.quantity || 0), 0),
                    valorTotalSemDesconto: totalWithoutDiscount.toFixed(2).replace(".", ","),
                    valorTotalComDesconto: totalWithDiscount.toFixed(2).replace(".", ","),
                    urlCompra: purchaseUrl,
                });
            }
        } else if (paymentMethodAlias === PIX_PAYMENT_ALIAS) {
            switch (event) {
                case "order.created":
                    if (orderStatusAlias === "waiting_payment")
                        messageToSend = fillTemplate(pixMessages.waiting_payment, templateData);
                    break;
                case "order.paid":
                    messageToSend = fillTemplate(pixMessages.paid, templateData);
                    break;
                case "order.status.updated":
                    if (orderStatusAlias === "cancelled")
                        messageToSend = fillTemplate(pixMessages.cancelled, templateData);
                    else if (orderStatusAlias === "on_carriage")
                        messageToSend = fillTemplate(pixMessages.in_transit, templateData);
                    else if (orderStatusAlias === "delivered")
                        messageToSend = fillTemplate(pixMessages.delivered, templateData);
                    break;
                case "transaction.payment.refused":
                    messageToSend = fillTemplate(pixMessages.payment_refused, templateData);
                    break;
            }
        } else if (BOLETO_PAYMENT_ALIASES.includes(paymentMethodAlias)) {
            switch (event) {
                case "order.created":
                    messageToSend = fillTemplate(boletoMessages.created, templateData);
                    break;
                case "order.paid":
                    messageToSend = fillTemplate(boletoMessages.paid, templateData);
                    break;
                case "order.status.updated":
                    if (orderStatusAlias === "cancelled")
                        messageToSend = fillTemplate(boletoMessages.cancelled, templateData);
                    else if (orderStatusAlias === "on_carriage")
                        messageToSend = fillTemplate(boletoMessages.in_transit, templateData);
                    else if (orderStatusAlias === "delivered")
                        messageToSend = fillTemplate(boletoMessages.delivered, templateData);
                    break;
            }
        } else if (paymentMethodAlias === CREDIT_CARD_PAYMENT_ALIAS) {
            switch (event) {
                case "order.created":
                    if (orderStatusAlias === "waiting_payment")
                        messageToSend = fillTemplate(creditCardMessages.waiting_payment, templateData);
                    break;
                case "order.paid":
                    messageToSend = fillTemplate(creditCardMessages.paid, templateData);
                    break;
                case "order.status.updated":
                    if (orderStatusAlias === "cancelled")
                        messageToSend = fillTemplate(creditCardMessages.cancelled, templateData);
                    else if (orderStatusAlias === "on_carriage")
                        messageToSend = fillTemplate(creditCardMessages.in_transit, templateData);
                    else if (orderStatusAlias === "delivered")
                        messageToSend = fillTemplate(creditCardMessages.delivered, templateData);
                    break;
                case "transaction.payment.refused":
                    messageToSend = fillTemplate(creditCardMessages.payment_refused, templateData);
                    break;
            }
        }

        if (messageToSend) {
            await whatsappService.sendMessage(whatsappId, messageToSend);
            logger.info(`Mensagem enviada para ${whatsappId} (Pedido ${orderId})`);
        } else {
            logger.info(`Evento ${event} sem template definido para pagamento ${paymentMethodAlias}`);
        }
    } catch (error) {
        logger.error(`Erro ao processar evento ${event} para pedido ${orderId}: ${error.message}`, {
            stack: error.stack,
        });
    }
};

module.exports = { processWebhook };
