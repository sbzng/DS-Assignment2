import { DynamoDBStreamHandler } from "aws-lambda";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
import { SESClient, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
    throw new Error("Please add the SES_EMAIL_TO, SES_EMAIL_FROM, and SES_REGION environment variables in an env.js file located in the root directory");
}


const client = new SESClient({ region: SES_REGION });

// Define the Lambda handler for processing DynamoDB stream events
export const handler: DynamoDBStreamHandler = async (event) => {
    console.log("DynamoDB Stream Event: ", event);

    // Loop through each record in the DynamoDB stream
    for (const record of event.Records) {
        // Check if the event type is REMOVE, indicating a deletion
        if (record.eventName === "REMOVE") {
            // Extract the old image data before the deletion
            const oldImage = record.dynamodb?.OldImage;
            const imageName = oldImage?.ImageName?.S || "Unknown";

            try {
                // Prepare the email message about the deletion
                const message = `"${imageName}" has been deleted from DynamoDB.`;
                // Send the email notification
                await sendEmailMessage(message);
            } catch (error: unknown) {
                console.log("Error occurred: ", error);
            }
        }
    }
};

// Function to send an email using SES
async function sendEmailMessage(message: string) {
    const parameters: SendEmailCommandInput = {
        Destination: {
            ToAddresses: [SES_EMAIL_TO], 
        },
        Message: {
            Body: {
                Html: { 
                    Charset: "UTF-8",
                    Data: getHtmlContent(message),
                },
            },
            Subject: {
                Charset: "UTF-8",
                Data: "Record Deleted",
            },
        },
        Source: SES_EMAIL_FROM, 
    };
 
    await client.send(new SendEmailCommand(parameters));
}


function getHtmlContent(message: string) {
    return `
    <html>
      <body>
        <p style="font-size:18px">${message}</p>
      </body>
    </html>
  `;
}
