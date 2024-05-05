import { SQSHandler } from "aws-lambda";
import { SESClient, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
// Ensure all environment variables are set, if not, throw an error
if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
    throw new Error("Missing environment variables: SES_EMAIL_TO, SES_EMAIL_FROM, and SES_REGION. Check env.js.");
}
// Define contact details type for better clarity and type checking
type ContactDetails = {
    name: string;
    email: string;
    message: string;
};
// Initialize the SES client with the specified region from environment variables
const client = new SESClient({ region: SES_REGION });
// Handler for processing events from SQS
export const handler: SQSHandler = async (event) => {
    console.log("Event ", JSON.stringify(event));
    for (const record of event.Records) {
        const recordBody = JSON.parse(record.body); // Parsing the body of the SQS message
        const snsMessage = JSON.parse(recordBody.Message); // Parsing the SNS message embedded within the SQS message
        // Iterate through each S3 record in the SNS message
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
                        message: `Invalid file, you should have a '.jpeg' or '.png extension. Its URL is s3://${srcBucket}/${srcKey}`,
                    };
                    // Construct email parameters
                    const params = sendEmailParams(contactDetails);
                    // Send the email using SES
                    await client.send(new SendEmailCommand(params));
                } catch (error: unknown) {
                    console.error("Error while sending email: ", error);
                }
            }
        }
    }
};
// Function to construct parameters for sending an email
function sendEmailParams({ name, email, message }: ContactDetails): SendEmailCommandInput {
    return {
        Destination: { ToAddresses: [SES_EMAIL_TO] },
        Message: {
            Body: {
                Html: {
                    Charset: "UTF-8",
                    Data: getHtmlContent({ name, email, message }),
                },
            },
            Subject: {
                Charset: "UTF-8",
                Data: "Upload failed", 
            },
        },
        Source: SES_EMAIL_FROM, 
    };
}
// Function to generate HTML content for the email body
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