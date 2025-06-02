const winston = require("winston");
const path = require("path");

const logFormat = winston.format.printf(({ level, message, timestamp, metadata }) => {
    let log = `${timestamp} ${level}: ${message}`;
    if (metadata && Object.keys(metadata).length > 0) {
        if (metadata.payload && typeof metadata.payload === "object") {
            log += ` | Payload Event: ${metadata.payload.event}, Order ID: ${metadata.payload.resource?.id}`;
        } else if (metadata.stack) {
            log += `\nStack: ${metadata.stack}`;
        } else {
            log += ` | ${JSON.stringify(metadata)}`;
        }
    }
    return log;
});


const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.errors({ stack: true }),
        winston.format.metadata({ fillExcept: ["message", "level", "timestamp", "label"] }),
        logFormat
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(__dirname, "../../logs/error.log"),
            level: "error",
        }),
        new winston.transports.File({
            filename: path.join(__dirname, "../../logs/combined.log"),
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                logFormat
            )
        }),
    ],
});

module.exports = logger;

