import { SQSHandler } from "aws-lambda";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
import { SESClient, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";
// Check if all required environment variables are set
if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
    throw new Error(
        "Please add the SES_EMAIL_TO, SES_EMAIL_FROM and SES_REGION environment variables in an env.js file located in the root directory"
    );
}
// Define a type for the contact details for better type safety and clarity
type ContactDetails = {
    name: string;
    email: string;
    message: string;
};
// Initialize the SES client with the region from environment variables
const client = new SESClient({ region: SES_REGION });
// Lambda handler function to process SQS messages
export const handler: SQSHandler = async (event: any) => {
    console.log("Event ", JSON.stringify(event));
    for (const record of event.Records) {
        const recordBody = JSON.parse(record.body);  // Parse the SQS message body
        const snsMessage = JSON.parse(recordBody.Message);  // Parse the SNS message embedded within SQS message
        // Process each S3 record within the SNS message
        if (snsMessage.Records) {
            console.log("Record body ", JSON.stringify(snsMessage));
            for (const messageRecord of snsMessage.Records) {
                const s3e = messageRecord.s3;
                const srcBucket = s3e.bucket.name;
                const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
                try {
                    // Prepare contact details for the email
                    const contactDetails: ContactDetails = {
                        name: "Storage",
                        email: SES_EMAIL_FROM,
                        message: `Image saved. Its URL is s3://${srcBucket}/${srcKey}`,
                    };
                    // Construct email parameters
                    const params = sendEmailParams(contactDetails);
                    // Send the email using SES
                    await client.send(new SendEmailCommand(params));
                } catch (error: unknown) {
                    console.log("Error sending email: ", error);
                }
            }
        }
    }
};
// Function to construct parameters for sending email
function sendEmailParams({ name, email, message }: ContactDetails): SendEmailCommandInput {
    return {
        Destination: {
            ToAddresses: [SES_EMAIL_TO],  // Destination email addresses
        },
        Message: {
            Body: {
                Html: {  // HTML format of the email
                    Charset: "UTF-8",
                    Data: getHtmlContent({ name, email, message }),
                },
            },
            Subject: {
                Charset: "UTF-8",
                Data: `New image Upload`,  // Subject of the email
            },
        },
        Source: SES_EMAIL_FROM,  // Source email address
    };
}
// Function to create HTML content for the email
function getHtmlContent({ name, email, message }: ContactDetails): string {
    return `
    <html>
      <body>
        <h2>Sent from:</h2>
        <ul>
          <li style="font-size:18px">👤 <b>${name}</b></li>
          <li style="font-size:18px">✉️ <b>${email}</b></li>
        </ul>
        <p style="font-size:18px">${message}</p>
      </body>
    </html>
  `;
}
