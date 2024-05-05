import { SNSHandler } from "aws-lambda";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

// Create a DynamoDB Document Client for more intuitive interactions
const ddbDocClient = createDDbDocClient();

// Lambda function to handle SNS messages, intended to update DynamoDB items
export const handler: SNSHandler = async (event) => {
  // Process each record in the SNS message
  for (const record of event.Records) {
    // Parse the JSON message content from SNS
    const message = JSON.parse(record.Sns.Message);
    const messageName = message.name;
    const messageDescription = message.description;

    // Execute an UpdateCommand on the DynamoDB table to add a description to an image entry
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: "Images",  // Specifies the table name
        Key: { ImageName: messageName }, 
        UpdateExpression: "SET description = :d", 
        ExpressionAttributeValues: {
          ":d": messageDescription,  // Define value for the update expression
        },
      })
    );
  }
};

// Function to configure and create a DynamoDB Document Client
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
