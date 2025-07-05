import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { ddbClient } from "./ddbClient.js";
import kuuid from "kuuid";

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

export const handler = async (event) => {
    const respond = (statusCode, message) => ({
        statusCode,
        headers: {
            "Access-Control-Allow-Origin": "*"
        },
        body: typeof message === "string" ? message : JSON.stringify(message)
    });

    try {
        const payload = JSON.parse(event.body);
        console.log("Payload:", payload);

        const { loanId, customerId, amount, remarks } = payload;

        if (!loanId || !customerId || !amount) {
            return respond(400, { message: "Missing required fields: loanId, customerId, or amount" });
        }

        const paymentId = kuuid.id({ random: 4, millisecond: true });
        const createdAt = Date.now();

        const PK = `LOAN#${loanId}`;
        const SK = `PAYMENT#${paymentId}`;

        const item = {
            PK,
            SK,
            loanId,
            paymentId,
            customerId,
            amount,
            remarks: remarks || null,
            createdAt
        };

        const command = new PutItemCommand({
            TableName: TABLE_NAME,
            Item: marshall(item),
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
        });

        await ddbClient.send(command);

        return respond(200, {
            message: "Payment recorded successfully",
            paymentId
        });

    } catch (error) {
        console.error("CreatePayment Error:", error);
        return respond(500, { message: "Failed to record payment", error: error.message });
    }
};
