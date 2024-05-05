import { SNSHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";

// Create a DynamoDB Document Client for easier interaction with DynamoDB
const ddbDocClient = createDDbDocClient();

// Handler function to process SNS messages
export const handler: SNSHandler = async (event) => {
    console.log("Received SNS Event: ", event);
    for (const record of event.Records) {
        console.log("Processing record: ", record);
        const snsMessage = JSON.parse(record.Sns.Message);

        if (snsMessage.Records) {
            for (const messageRecord of snsMessage.Records) {
                const s3e = messageRecord.s3;
                const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));

                console.log("Preparing to delete item from DynamoDB for the key: ", srcKey);

                // Delete the item from DynamoDB table
                await ddbDocClient.send(
                    new DeleteCommand({
                        TableName: "Images",
                        Key: {
                            ImageName: srcKey,
                        },
                    })
                );
            }
        }
    }
};

// Helper function to initialize DynamoDB Document Client
function createDDbDocClient() {
    const ddbClient = new DynamoDBClient({ region: process.env.REGION });
    const marshallOptions = {
        convertEmptyValues: true, 
        removeUndefinedValues: true, 
        convertClassInstanceToMap: true, 
    };
    const unmarshallOptions = {
        wrapNumbers: false, 
    };
    const translateConfig = { marshallOptions, unmarshallOptions };

    return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}
