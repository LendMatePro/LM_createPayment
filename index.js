import { TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";
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

        const result = await createPayment(loanId, customerId, amount, remarks);

        if (!result.status) {
            return respond(400, { message: result.message });
        }

        return respond(200, {
            message: "Payment recorded successfully",
            paymentId: result.paymentId
        });

    } catch (error) {
        console.error("CreatePayment Error:", error);
        return respond(500, { message: "Failed to record payment", error: error.message });
    }
};

async function createPayment(loanId, customerId, amount, remarks) {
    const returnValue = { status: false, message: null, paymentId: null };
    try {
        const paymentId = kuuid.id({ random: 4, millisecond: true });
        const paidAt = Date.now();

        const paymentPK = `LOAN#${loanId}`;
        const paymentSK = `PAYMENT#${paymentId}`;

        const loanPK = "LOAN";
        const loanSK = `CUSTOMER#${customerId}#LOAN#${loanId}`;

        const paymentItem = {
            PK: paymentPK,
            SK: paymentSK,
            loanId,
            paymentId,
            customerId,
            amount,
            remarks: remarks || null,
            createdAt: paidAt
        };

        const transaction = {
            TransactItems: [
                {
                    Put: {
                        TableName: TABLE_NAME,
                        Item: marshall(paymentItem),
                        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
                    }
                },
                {
                    Update: {
                        TableName: TABLE_NAME,
                        Key: marshall({
                            PK: loanPK,
                            SK: loanSK
                        }),
                        UpdateExpression: "SET lastPaidDate = :lastPaidDate",
                        ExpressionAttributeValues: marshall({
                            ":lastPaidDate": paidAt
                        }),
                        ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)"
                    }
                }
            ]
        };

        await ddbClient.send(new TransactWriteItemsCommand(transaction));

        returnValue.status = true;
        returnValue.paymentId = paymentId;
        return returnValue;

    } catch (error) {
        console.error("PutPayment Error:", error);
        returnValue.message = error.message;
        return returnValue;
    }
}
