import { SNSHandler } from "aws-lambda";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
import { SESClient, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";


if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
    throw new Error(
        "Please add the SES_EMAIL_TO, SES_EMAIL_FROM and SES_REGION environment variables in an env.js file located in the root directory"
    );
}


const client = new SESClient({ region: "eu-west-1" });

// Lambda handler function to process messages coming from SNS
export const handler: SNSHandler = async (event: any) => {
    console.log("Event ", event);

    // Iterate through each record in the SNS event
    for (const snsRecord of event.Records) {
        // Parse the message from the SNS notification
        const snsMessage = JSON.parse(snsRecord.Sns.Message);

        // Check if there are any records in the SNS message, which indicates actions on S3 objects
        if (snsMessage.Records) {
            console.log("SNS Record ", JSON.stringify(snsMessage));

            // Process each S3 record in the SNS message
            for (const messageRecord of snsMessage.Records) {
                const s3e = messageRecord.s3;
                const srcBucket = s3e.bucket.name;
                const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));

                // Attempt to send an email notification about the S3 event
                try {
                    const message = `Image received. Its URL is s3://${srcBucket}/${srcKey}`;
                    await sendEmailMessage(message);
                } catch (error: unknown) {
                    console.log("ERROR is: ", error);
                }
            }
        }
    }
};

// Asynchronously sends an email using AWS SES
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
                Data: `New Image Upload`,  
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
