import { SQSHandler } from "aws-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
// Initialize AWS SDK clients for S3, SQS, and DynamoDB
const s3 = new S3Client();
const sqs = new SQSClient();
const ddbDocClient = createDDbDocClient();
// Lambda function to handle SQS events, typically triggered by SNS notifications
export const handler: SQSHandler = async (event) => {
  console.log("Received event: ", JSON.stringify(event));
  // Process each record in the SQS message
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body); // Parse the SQS message body
    const snsMessage = JSON.parse(recordBody.Message); // Extract the SNS message from the SQS message
    // Process each record found in the SNS message
    if (snsMessage.Records) {
      console.log("Processed record body: ", JSON.stringify(snsMessage));
      for (const messageRecord of snsMessage.Records) {
        const s3e = messageRecord.s3;
        const srcBucket = s3e.bucket.name;
        const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
        // Validate the file extension
        const extension = srcKey.match(/\.([^.]*)$/)![1].toLowerCase();
        if (extension !== "jpeg" && extension !== "png") {
          throw new Error("Unsupported file extension: " + extension);
        }
        // Store image metadata in DynamoDB
        await ddbDocClient.send(
          new PutCommand({
            TableName: "Images",
            Item: {
              ImageName: srcKey, // Use the file name as the primary key
            },
          })
        );
      }
    }
  }
};
// Creates and configures a DynamoDB Document Client
function createDDbDocClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  // Options to manage how data is marshalled and unmarshalled
  const marshallOptions = {
    convertEmptyValues: true,  // Convert empty values to allow storing in DynamoDB
    removeUndefinedValues: true, // Remove undefined values from data to be stored
    convertClassInstanceToMap: true, // Convert class instances to plain objects
  };
  const unmarshallOptions = {
    wrapNumbers: false, // Do not wrap numbers in special objects
  };
  const translateConfig = { marshallOptions, unmarshallOptions };
  // Return the configured document client
  return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}