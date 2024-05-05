import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import {StreamViewType} from "aws-cdk-lib/aws-dynamodb";
import {DynamoEventSource} from "aws-cdk-lib/aws-lambda-event-sources";
import {StartingPosition} from "aws-cdk-lib/aws-lambda";

import {Construct} from "constructs";

export class EDAAppStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Dynanodb
        const imagesTable = new dynamodb.Table(this, 'imagesTable', {
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            partitionKey: {name: 'ImageName', type: dynamodb.AttributeType.STRING},
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            stream: StreamViewType.NEW_AND_OLD_IMAGES,
            tableName: 'Images',
        });

        const imagesBucket = new s3.Bucket(this, "images", {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            publicReadAccess: false,
        });


        // rejected mails queue
        const DLQ = new sqs.Queue(this, "dead-letter-queue", {
            retentionPeriod: cdk.Duration.minutes(30),
        });

        const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
            receiveMessageWaitTime: cdk.Duration.seconds(10),
            deadLetterQueue: {
                queue: DLQ,
                maxReceiveCount: 1,
            },
        });

        const unifiedTopic = new sns.Topic(this, "unifiedTopic", {
            displayName: "Unified topic",
        });

        // Lambda functions

        const processImageFn = new lambdanode.NodejsFunction(
            this,
            "ProcessImageFn",
            {
                runtime: lambda.Runtime.NODEJS_18_X,
                entry: `${__dirname}/../lambdas/processImage.ts`,
                timeout: cdk.Duration.seconds(15),
                memorySize: 128,
                environment: {
                    REGION: cdk.Aws.REGION,
                    TABLE_NAME: imagesTable.tableName,
                },
            }
        );

        const confirmationMailerFn = new lambdanode.NodejsFunction(this, "confirmationMailerFn", {
          runtime: lambda.Runtime.NODEJS_16_X,
          memorySize: 1024,
          timeout: cdk.Duration.seconds(3),
          entry: `${__dirname}/../lambdas/confirmationMailer.ts`,
      });

        const rejectionMailerFn = new lambdanode.NodejsFunction(this, "rejectionMailerFn", {
            runtime: lambda.Runtime.NODEJS_16_X,
            memorySize: 1024,
            timeout: cdk.Duration.seconds(3),
            entry: `${__dirname}/../lambdas/rejectionMailer.ts`,
        });

        const processDeleteFn = new lambdanode.NodejsFunction(this, "processDeleteFn", {
            runtime: lambda.Runtime.NODEJS_16_X,
            memorySize: 1024,
            timeout: cdk.Duration.seconds(3),
            entry: `${__dirname}/../lambdas/processDelete.ts`,
            environment: {
                REGION: cdk.Aws.REGION,
                TABLE_NAME: imagesTable.tableName,
            },
        });

        const deleteMailerFn = new lambdanode.NodejsFunction(this, "deleteMailerFn", {
            runtime: lambda.Runtime.NODEJS_16_X,
            memorySize: 1024,
            timeout: cdk.Duration.seconds(3),
            entry: `${__dirname}/../lambdas/deleteMailer.ts`,
            environment: {
                REGION: cdk.Aws.REGION,
                TABLE_NAME: imagesTable.tableName,
            },
        });

        const updateTableFn = new lambdanode.NodejsFunction(this, "updateTableFn", {
            runtime: lambda.Runtime.NODEJS_16_X,
            memorySize: 1024,
            timeout: cdk.Duration.seconds(3),
            entry: `${__dirname}/../lambdas/updateTable.ts`,
            environment: {
                REGION: cdk.Aws.REGION,
                TABLE_NAME: imagesTable.tableName,
            },
        });

        // S3 --> SNS Topic
        imagesBucket.addEventNotification(
            s3.EventType.OBJECT_REMOVED,
            new s3n.SnsDestination(unifiedTopic)
        );

        imagesBucket.addEventNotification(
            s3.EventType.OBJECT_CREATED,
            new s3n.SnsDestination(unifiedTopic)
        );

        // SQS --> Lambda
        const newImageEventSource = new events.SqsEventSource(imageProcessQueue, {
            batchSize: 5,
            maxBatchingWindow: cdk.Duration.seconds(10),
        });
        const newImageRejectionMailEventSource = new events.SqsEventSource(DLQ, {
            batchSize: 5,
            maxBatchingWindow: cdk.Duration.seconds(10),
        });

        unifiedTopic.addSubscription(
            new subs.SqsSubscription(imageProcessQueue, {
                filterPolicyWithMessageBody: {
                    Records: sns.FilterOrPolicy.policy({
                        eventName: sns.FilterOrPolicy.filter(
                            sns.SubscriptionFilter.stringFilter({
                                matchPrefixes: ["ObjectCreated:Put"],
                            })
                        ),
                    })
                }
            })
        );

        unifiedTopic.addSubscription(
          new subs.LambdaSubscription(confirmationMailerFn, {
              filterPolicyWithMessageBody: {
                  Records: sns.FilterOrPolicy.policy({
                      eventName: sns.FilterOrPolicy.filter(
                          sns.SubscriptionFilter.stringFilter({
                              allowlist: ["ObjectCreated:Put"],
                          })
                      ),
                  })
              }
          })
      )

        unifiedTopic.addSubscription(
            new subs.LambdaSubscription(processDeleteFn, {
                filterPolicyWithMessageBody: {
                    Records: sns.FilterOrPolicy.policy({
                        eventName: sns.FilterOrPolicy.filter(
                            sns.SubscriptionFilter.stringFilter({
                                allowlist: ["ObjectRemoved:Delete"],
                            })
                        ),
                    })
                }
            })
        )

        unifiedTopic.addSubscription(
            new subs.LambdaSubscription(updateTableFn, {
                filterPolicy: {
                    comment_type: sns.SubscriptionFilter.stringFilter({
                        allowlist: ["Caption"],
                    }),
                },
            })
        );

        processImageFn.addEventSource(newImageEventSource);
        rejectionMailerFn.addEventSource(newImageRejectionMailEventSource);
        deleteMailerFn.addEventSource(new DynamoEventSource(imagesTable, {
            startingPosition: StartingPosition.TRIM_HORIZON,
            batchSize: 5,
            bisectBatchOnError: true,
            retryAttempts: 10
        }));

        // Permissions

        imagesBucket.grantRead(processImageFn);
        confirmationMailerFn.addToRolePolicy(
          new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                  "ses:SendEmail",
                  "ses:SendRawEmail",
                  "ses:SendTemplatedEmail",
              ],
              resources: ["*"],
          })
      );
        // Add SES permissions to the rejection mailer function
        rejectionMailerFn.addToRolePolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "ses:SendEmail",
                    "ses:SendRawEmail",
                    "ses:SendTemplatedEmail",
                ],
                resources: ["*"],
            })
        );
        deleteMailerFn.addToRolePolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "ses:SendEmail",
                    "ses:SendRawEmail",
                    "ses:SendTemplatedEmail",
                ],
                resources: ["*"],
            })
        );

        // Grant the processImageFn function 
        imagesTable.grantReadWriteData(processImageFn);
        imagesTable.grantReadWriteData(processDeleteFn);
        imagesTable.grantReadWriteData(updateTableFn);

        // Output

        new cdk.CfnOutput(this, "bucketName", {
            value: imagesBucket.bucketName,
        });

        new cdk.CfnOutput(this, "topicName", {
            value: unifiedTopic.topicArn
        });
    }
}